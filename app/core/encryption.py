"""SPEC §11.1 -- application-level AES-256-GCM on health declaration answers, signature
images, registration request payloads and free-text medical notes.

**Envelope form.** A random 256-bit data key (DEK) encrypts the payload, and the DEK is
itself encrypted by a key-encryption key (KEK) drawn from a versioned keyring that lives
in Railway secrets and never in the database. That is what makes §8.1a's requirement
literally true: rotating to a new KEK rewraps 48 bytes per row and never decrypts a
payload, so `rewrap()` can run over every health declaration in the system without ever
holding one in plaintext.

This is *in addition to* disk encryption. Disk encryption protects against a stolen
server; column encryption protects against a leaked backup, a SQL injection, or a
developer browsing production.

Encrypted columns are not queryable, which is fine -- nothing queries them.
`derived_flags` exists precisely so coaches can be warned without decryption.

Blob layout, big-endian throughout::

    b"SMv1"        4    magic and format version
    key_version    2    which KEK wrapped the DEK
    wrapped_len    2    byte length of nonce + wrapped DEK
    wrap_nonce    12
    wrapped_dek   48    32-byte DEK + 16-byte GCM tag
    data_nonce    12
    ciphertext     n    payload + 16-byte GCM tag

The DEK wrap is bound to the key version, so a rewrap recomputes it. The payload is
bound to the AAD only, so a rewrap leaves it byte-identical -- which is asserted.
"""

from __future__ import annotations

import base64
import json
import os
import struct
from collections.abc import Mapping
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import SecretStr
from sqlalchemy import Dialect, LargeBinary, TypeDecorator

from app.core.config import settings

MAGIC = b"SMv1"
_HEADER = struct.Struct(">4sHH")
_NONCE_BYTES = 12
_DEK_BYTES = 32
_KEY_BYTES = 32


class EncryptionError(RuntimeError):
    """Raised when a plaintext cannot be encrypted -- a misconfigured keyring."""


class DecryptionError(RuntimeError):
    """Raised when a blob cannot be decrypted: tampered, wrong AAD, or retired key."""


class Keyring:
    """The versioned KEKs. Never persisted, never logged, never rendered."""

    def __init__(self, keys: Mapping[int, SecretStr], active_version: int) -> None:
        decoded: dict[int, bytes] = {}
        for version, secret in keys.items():
            raw = base64.b64decode(secret.get_secret_value())
            if len(raw) != _KEY_BYTES:
                raise ValueError(f"key version {version} is {len(raw) * 8} bits; AES-256 needs 256")
            decoded[int(version)] = raw
        self._init_decoded(decoded, active_version)

    def _init_decoded(self, decoded: dict[int, bytes], active_version: int) -> None:
        if active_version not in decoded:
            raise ValueError(
                f"active key version {active_version} is not in the keyring "
                f"(have {sorted(decoded) or 'none'})"
            )
        self._keys = decoded
        self.active_version = active_version

    @classmethod
    def from_raw(cls, keys: Mapping[int, bytes], active_version: int) -> Keyring:
        """For tests and for a rotation script that already holds raw key bytes."""
        return cls(
            {v: SecretStr(base64.b64encode(k).decode()) for v, k in keys.items()},
            active_version,
        )

    @classmethod
    def from_settings(cls) -> Keyring:
        if not settings.ENCRYPTION_KEYS:
            raise EncryptionError(
                "ENCRYPTION_KEYS is empty. In staging and production these come from "
                "Railway secrets; locally, see .env.example."
            )
        return cls(settings.ENCRYPTION_KEYS, settings.ENCRYPTION_ACTIVE_KEY_VERSION)

    def raw(self, version: int) -> bytes:
        try:
            return self._keys[version]
        except KeyError as exc:
            raise DecryptionError(
                f"key version {version} is not in the keyring; it may have been retired"
            ) from exc

    def __repr__(self) -> str:
        return f"Keyring(versions={sorted(self._keys)}, active={self.active_version})"


def _keyring(keyring: Keyring | None) -> Keyring:
    return keyring if keyring is not None else Keyring.from_settings()


def _wrap_aad(version: int, aad: str) -> bytes:
    return MAGIC + struct.pack(">H", version) + aad.encode("utf-8")


def _payload_aad(aad: str) -> bytes:
    return MAGIC + aad.encode("utf-8")


def encrypt(plaintext: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes:
    ring = _keyring(keyring)
    version = ring.active_version
    dek = os.urandom(_DEK_BYTES)

    wrap_nonce = os.urandom(_NONCE_BYTES)
    wrapped = AESGCM(ring.raw(version)).encrypt(wrap_nonce, dek, _wrap_aad(version, aad))

    data_nonce = os.urandom(_NONCE_BYTES)
    ciphertext = AESGCM(dek).encrypt(data_nonce, plaintext, _payload_aad(aad))

    wrapped_section = wrap_nonce + wrapped
    return (
        _HEADER.pack(MAGIC, version, len(wrapped_section))
        + wrapped_section
        + data_nonce
        + ciphertext
    )


def _split(blob: bytes) -> tuple[int, bytes, bytes]:
    if len(blob) < _HEADER.size:
        raise DecryptionError("blob is too short to carry a header")
    magic, version, wrapped_len = _HEADER.unpack_from(blob)
    if magic != MAGIC:
        raise DecryptionError(f"unrecognised blob format {magic!r}")
    start = _HEADER.size
    end = start + wrapped_len
    if len(blob) <= end + _NONCE_BYTES:
        raise DecryptionError("blob is truncated")
    return int(version), blob[start:end], blob[end:]


def key_version_of(blob: bytes) -> int:
    """Which KEK version wrapped this blob's data key. Cheap: no key needed, which is
    what lets a rotation job select rows to rewrap."""
    return _split(blob)[0]


def payload_section(blob: bytes) -> bytes:
    """The nonce + ciphertext a rewrap must leave untouched."""
    return _split(blob)[2]


def _unwrap(version: int, wrapped_section: bytes, aad: str, ring: Keyring) -> bytes:
    nonce, wrapped = wrapped_section[:_NONCE_BYTES], wrapped_section[_NONCE_BYTES:]
    try:
        return AESGCM(ring.raw(version)).decrypt(nonce, wrapped, _wrap_aad(version, aad))
    except InvalidTag as exc:
        raise DecryptionError("data key failed authentication") from exc


def decrypt(blob: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes:
    ring = _keyring(keyring)
    version, wrapped_section, payload = _split(blob)
    dek = _unwrap(version, wrapped_section, aad, ring)
    nonce, ciphertext = payload[:_NONCE_BYTES], payload[_NONCE_BYTES:]
    try:
        return AESGCM(dek).decrypt(nonce, ciphertext, _payload_aad(aad))
    except InvalidTag as exc:
        raise DecryptionError("payload failed authentication") from exc


def rewrap(blob: bytes, *, aad: str, keyring: Keyring | None = None) -> bytes:
    """Move a blob to the active key version without decrypting its payload."""
    ring = _keyring(keyring)
    version, wrapped_section, payload = _split(blob)
    if version == ring.active_version:
        return blob
    dek = _unwrap(version, wrapped_section, aad, ring)

    target = ring.active_version
    nonce = os.urandom(_NONCE_BYTES)
    wrapped = AESGCM(ring.raw(target)).encrypt(nonce, dek, _wrap_aad(target, aad))
    section = nonce + wrapped
    return _HEADER.pack(MAGIC, target, len(section)) + section + payload


class EncryptedBytes(TypeDecorator[bytes]):
    """A BYTEA column whose contents are encrypted before they leave the process.

    M4 declares ``signature_image_encrypted: Mapped[bytes] = mapped_column(
    EncryptedBytes("health_declaration.signature_image_encrypted"))``. The AAD names the
    column so a blob cannot be moved between columns and still decrypt.
    """

    impl = LargeBinary
    cache_ok = True

    def __init__(self, aad: str, *, keyring: Keyring | None = None) -> None:
        super().__init__()
        self.aad = aad
        self._keyring = keyring

    def process_bind_param(self, value: bytes | None, dialect: Dialect | None) -> bytes | None:
        if value is None:
            return None
        return encrypt(value, aad=self.aad, keyring=self._keyring)

    def process_result_value(self, value: bytes | None, dialect: Dialect | None) -> bytes | None:
        if value is None:
            return None
        return decrypt(value, aad=self.aad, keyring=self._keyring)


class EncryptedJSON(TypeDecorator[Any]):
    """The same, for a JSON document -- M3's ``registration_request.payload_encrypted``
    and M4's ``health_declaration.answers_encrypted``.

    ``ensure_ascii=False`` keeps Hebrew as Hebrew rather than as escape sequences, and
    ``sort_keys=True`` keeps the plaintext byte-stable so a re-encryption of unchanged
    data is detectable.
    """

    impl = LargeBinary
    cache_ok = True

    def __init__(self, aad: str, *, keyring: Keyring | None = None) -> None:
        super().__init__()
        self.aad = aad
        self._keyring = keyring

    def process_bind_param(self, value: Any, dialect: Dialect | None) -> bytes | None:
        if value is None:
            return None
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return encrypt(raw, aad=self.aad, keyring=self._keyring)

    def process_result_value(self, value: bytes | None, dialect: Dialect | None) -> Any:
        if value is None:
            return None
        return json.loads(decrypt(value, aad=self.aad, keyring=self._keyring))
