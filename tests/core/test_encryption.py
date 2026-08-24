"""SPEC 11.1 -- AES-256-GCM envelope encryption.

No database needed: this is pure crypto. The rotation tests are the load-bearing ones --
8.1a's "versioned so rotation is possible without re-encrypting everything at once" is
the requirement the envelope exists to satisfy.
"""

from __future__ import annotations

import base64
import os

import pytest
from app.core.encryption import (
    DecryptionError,
    EncryptedBytes,
    EncryptedJSON,
    EncryptionError,
    Keyring,
    decrypt,
    encrypt,
    key_version_of,
    payload_section,
    rewrap,
)
from pydantic import SecretStr

AAD = "health_declaration.answers_encrypted"
SECRET = '{"asthma": true, "medication": "ריטלין"}'.encode()


def _key() -> SecretStr:
    return SecretStr(base64.b64encode(os.urandom(32)).decode())


@pytest.fixture
def v1() -> Keyring:
    return Keyring({1: _key()}, active_version=1)


def test_round_trip(v1: Keyring):
    assert decrypt(encrypt(SECRET, aad=AAD, keyring=v1), aad=AAD, keyring=v1) == SECRET


def test_the_ciphertext_contains_no_plaintext(v1: Keyring):
    blob = encrypt(SECRET, aad=AAD, keyring=v1)
    assert SECRET not in blob
    assert b"asthma" not in blob


def test_two_encryptions_of_the_same_plaintext_differ(v1: Keyring):
    """A per-record data key and a fresh nonce. Deterministic ciphertext would let an
    observer holding the database tell which declarations match, without any key."""
    assert encrypt(SECRET, aad=AAD, keyring=v1) != encrypt(SECRET, aad=AAD, keyring=v1)


def test_a_tampered_blob_is_refused(v1: Keyring):
    blob = bytearray(encrypt(SECRET, aad=AAD, keyring=v1))
    blob[-1] ^= 0x01
    with pytest.raises(DecryptionError):
        decrypt(bytes(blob), aad=AAD, keyring=v1)


def test_a_truncated_blob_is_refused(v1: Keyring):
    blob = encrypt(SECRET, aad=AAD, keyring=v1)
    with pytest.raises(DecryptionError):
        decrypt(blob[:20], aad=AAD, keyring=v1)


def test_a_blob_moved_to_another_column_is_refused(v1: Keyring):
    """AAD binds a ciphertext to the column it belongs in, so moving one from
    answers_encrypted to signature_image_encrypted fails rather than decrypting into the
    wrong context."""
    blob = encrypt(SECRET, aad=AAD, keyring=v1)
    with pytest.raises(DecryptionError):
        decrypt(blob, aad="health_declaration.signature_image_encrypted", keyring=v1)


def test_a_key_that_is_not_256_bits_is_refused():
    with pytest.raises(ValueError, match="256"):
        Keyring({1: SecretStr(base64.b64encode(os.urandom(16)).decode())}, active_version=1)


def test_an_unknown_active_version_is_refused():
    with pytest.raises(ValueError, match="active key version"):
        Keyring({1: _key()}, active_version=2)


def test_an_empty_keyring_from_settings_is_a_clear_error(monkeypatch: pytest.MonkeyPatch):
    from app.core import encryption

    monkeypatch.setattr(encryption.settings, "ENCRYPTION_KEYS", {})
    with pytest.raises(EncryptionError, match="Railway"):
        Keyring.from_settings()


# -- the requirement rotation exists for ------------------------------------
def test_old_data_still_decrypts_after_the_active_key_moves_on(v1: Keyring):
    """SPEC 8.1a: versioned "so rotation does not require re-encrypting everything at
    once". This is that sentence as a test."""
    old = encrypt(SECRET, aad=AAD, keyring=v1)
    rotated = Keyring.from_raw({1: v1.raw(1), 2: os.urandom(32)}, active_version=2)

    assert key_version_of(old) == 1
    assert decrypt(old, aad=AAD, keyring=rotated) == SECRET
    assert key_version_of(encrypt(SECRET, aad=AAD, keyring=rotated)) == 2


def test_rewrap_moves_a_blob_to_the_active_key_without_touching_the_payload(v1: Keyring):
    """The point of the envelope. Rewrapping a million health declarations re-encrypts
    48 bytes each and decrypts none of them."""
    old = encrypt(SECRET, aad=AAD, keyring=v1)
    rotated = Keyring.from_raw({1: v1.raw(1), 2: os.urandom(32)}, active_version=2)

    new = rewrap(old, aad=AAD, keyring=rotated)

    assert key_version_of(new) == 2
    assert payload_section(new) == payload_section(old)
    assert decrypt(new, aad=AAD, keyring=rotated) == SECRET


def test_rewrapping_a_blob_already_on_the_active_key_is_a_no_op(v1: Keyring):
    blob = encrypt(SECRET, aad=AAD, keyring=v1)
    assert rewrap(blob, aad=AAD, keyring=v1) == blob


def test_a_retired_key_can_no_longer_decrypt(v1: Keyring):
    old = encrypt(SECRET, aad=AAD, keyring=v1)
    retired = Keyring.from_raw({2: os.urandom(32)}, active_version=2)
    with pytest.raises(DecryptionError, match="key version 1"):
        decrypt(old, aad=AAD, keyring=retired)


# -- the column types --------------------------------------------------------
def test_encrypted_json_round_trips_through_bind_and_result(v1: Keyring):
    column = EncryptedJSON("registration_request.payload", keyring=v1)
    payload = {"child": "דני", "allergies": ["בוטנים"]}
    stored = column.process_bind_param(payload, dialect=None)
    assert stored is not None
    assert "דני".encode() not in stored
    assert column.process_result_value(stored, dialect=None) == payload


def test_encrypted_bytes_round_trips_and_passes_none_through(v1: Keyring):
    column = EncryptedBytes("health_declaration.signature_image_encrypted", keyring=v1)
    stored = column.process_bind_param(b"\x89PNG signature", dialect=None)
    assert stored is not None
    assert b"PNG signature" not in stored
    assert column.process_result_value(stored, dialect=None) == b"\x89PNG signature"
    assert column.process_bind_param(None, dialect=None) is None
    assert column.process_result_value(None, dialect=None) is None


def test_keys_are_never_written_to_the_database():
    """SPEC 8.1a: keys live in Railway secrets, "deliberately not in the database, which
    is the entire point: a leaked dump is inert without them"."""
    import app.models  # noqa: F401 -- seam 2 discovery
    from app.models.base import Base

    for table in Base.metadata.tables.values():
        for column in table.columns:
            assert "encryption_key" not in column.name
            assert not column.name.endswith("_kek")


def test_the_keyring_does_not_leak_key_material_through_repr():
    keyring = Keyring({1: _key()}, active_version=1)
    rendered = repr(keyring)
    assert base64.b64encode(keyring.raw(1)).decode() not in rendered
    assert keyring.raw(1).hex() not in rendered


def test_the_payload_is_aad_bound_independently_of_the_dek_wrap(v1: Keyring):
    """Defence in depth, and the reason this test exists at all.

    `test_a_blob_moved_to_another_column_is_refused` passes even when the payload AAD is
    disabled, because the DEK wrap is AAD-bound too and refuses first. Verified by
    breaking `_payload_aad` and watching the whole file stay green. Without this test
    the payload binding could rot unnoticed.
    """
    from app.core.encryption import _payload_aad, _split, _unwrap
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    version, wrapped, payload = _split(encrypt(SECRET, aad=AAD, keyring=v1))
    dek = _unwrap(version, wrapped, AAD, v1)  # the wrap layer, deliberately satisfied
    nonce, ciphertext = payload[:12], payload[12:]

    with pytest.raises(InvalidTag):
        AESGCM(dek).decrypt(nonce, ciphertext, _payload_aad("some.other.column"))
    assert AESGCM(dek).decrypt(nonce, ciphertext, _payload_aad(AAD)) == SECRET
