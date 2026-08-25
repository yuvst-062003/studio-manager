"""SPEC §4.3's six `object_key` columns, and the one place bytes are filed.

`clock.py` is the only clock and `encryption.py` is the one envelope; this is the same
shape for the same reason. The logo the setup wizard uploads is merely the first of six
customers -- `person.photo_object_key`, `health_form_template.source_pdf_object_key`,
`health_declaration.pdf_object_key` and `data_export_request.object_key` are the rest, and
each belongs to a later milestone. Building the upload path inside the wizard would have
hidden a cross-cutting mechanism inside a feature.

Three decisions are settled here rather than re-argued at each call site
(docs/superpowers/specs/2026-08-25-object-storage-and-setup-wizard-design.md §2):

**Bytes pass through the API; uploads are never presigned.** A presigned PUT cannot work
against the filesystem backend, so adopting one would make the *client* differ per
environment -- the single thing a seam exists to prevent. The cost is a 2 MB body through
the API process, which is real for large files and irrelevant for a logo.

**Magic bytes decide the type, never the declared `Content-Type`.** The header is
attacker-controlled. The first bytes are not.

**No SVG, ever.** An SVG can carry script and would be served from our own origin, which
makes a customer upload a stored-XSS vector.

There is deliberately **no image library here**. The browser resizes to 512×512 on a
canvas before upload; the alternative is Pillow and an image-decoding attack surface
inside the API process, to fix a defect (a logo that is not exactly square) that is
cosmetic.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Protocol

from app.core.config import settings

#: §2.3. Enforced by the route before the body is read into memory, and asserted again by
#: the reader itself -- a declared Content-Length is a claim, not a measurement.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024

#: §2.4. The extension is derived from the *sniffed* type, so a key never records
#: something the bytes did not say.
IMAGE_EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}

#: What a browser may be told to offer in a file picker. Not a validation input: the
#: picker is a convenience and the sniffing below is the gate.
UPLOAD_ACCEPT = ", ".join(IMAGE_EXTENSIONS)

_CONTENT_TYPE_SUFFIX = ".content-type"


class ObjectStoreError(Exception):
    """Base for everything this module refuses."""


class ObjectNotFoundError(ObjectStoreError):
    """No object is filed under that key."""


class UnsafeKeyError(ObjectStoreError):
    """A key that could address something outside the store.

    Keys are built server-side from UUIDs and never accepted from a client, so reaching
    this is a bug rather than an attack. It is checked anyway: the cost is one comparison
    and the failure it prevents is arbitrary file read and write.
    """


class UnsupportedImageError(ObjectStoreError):
    """The bytes are not a PNG, a JPEG or a WebP."""


class ObjectTooLargeError(ObjectStoreError):
    """More than MAX_UPLOAD_BYTES."""


class ObjectStore(Protocol):
    """The seam. Two implementations, chosen by configuration -- never by environment
    branching at a call site."""

    def put(self, key: str, data: bytes, *, content_type: str) -> None: ...

    def get(self, key: str) -> tuple[bytes, str]:
        """Returns ``(data, content_type)``. Raises ObjectNotFoundError."""
        ...

    def delete(self, key: str) -> None:
        """Idempotent: deleting an absent key is not an error."""
        ...

    def exists(self, key: str) -> bool: ...


# -- keys ---------------------------------------------------------------------
def validate_key(key: str) -> str:
    """§2.5's defence in depth.

    Rejects the empty key, a leading separator, and any `..` segment. Checked on every
    operation rather than only on write, because a traversing key on `get` reads a file
    just as effectively as one on `put` writes it.
    """
    if not key:
        raise UnsafeKeyError("an empty key addresses the store root")
    if key.startswith("/") or key.startswith("\\"):
        raise UnsafeKeyError(f"absolute key: {key!r}")
    parts = key.replace("\\", "/").split("/")
    if any(part in ("..", "") for part in parts):
        raise UnsafeKeyError(f"traversing or empty segment in key: {key!r}")
    return key


def studio_logo_key(studio_id: uuid.UUID, content_type: str) -> str:
    """`studios/{studio_id}/logo.{ext}` -- constructed here, never sent by a client.

    Takes the *sniffed* content type. Passing a declared one would put the header back in
    charge of where the bytes land, which is the hole §2.4 closes.
    """
    extension = IMAGE_EXTENSIONS.get(content_type)
    if extension is None:
        raise UnsupportedImageError(f"not a storable image type: {content_type!r}")
    return f"studios/{studio_id}/logo.{extension}"


# -- what the bytes must be ----------------------------------------------------
def sniff_image_type(data: bytes) -> str | None:
    """The first bytes, and nothing else. Returns None for anything not allowed.

    WebP needs two checks and not one: `RIFF` alone is also AVI and WAV, so the container
    tag at offset 8 is what actually names the format.
    """
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


# -- the filesystem backend ----------------------------------------------------
class FilesystemObjectStore:
    """Local dev, the test suite, and staging/production on a Railway volume.

    Built regardless of what production runs on: the suite cannot depend on network
    credentials, so the choice to run production on it too is a config value rather than
    a second code path. Moving to R2 later changes environment variables and nothing else.

    The volume's two limits, stated rather than discovered: it mounts to **one** service
    instance, so horizontal scaling of the API is blocked while it is in use, and its
    backups are ours.

    A filesystem has no metadata layer, so the content type is a sidecar file beside the
    object. S3 has real object metadata and will not need one -- which is why `get`
    returns the type rather than letting callers re-derive it from the extension.
    """

    def __init__(self, root: Path | str) -> None:
        self._root = Path(root)

    def _path(self, key: str) -> Path:
        return self._root / validate_key(key)

    def put(self, key: str, data: bytes, *, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write the bytes before the sidecar. A crash between the two leaves an object
        # whose type is unknown, which `get` reports as absent -- the safe direction.
        path.write_bytes(data)
        path.with_name(path.name + _CONTENT_TYPE_SUFFIX).write_text(content_type, "utf-8")

    def get(self, key: str) -> tuple[bytes, str]:
        path = self._path(key)
        sidecar = path.with_name(path.name + _CONTENT_TYPE_SUFFIX)
        if not path.is_file() or not sidecar.is_file():
            raise ObjectNotFoundError(key)
        return path.read_bytes(), sidecar.read_text("utf-8").strip()

    def delete(self, key: str) -> None:
        path = self._path(key)
        path.with_name(path.name + _CONTENT_TYPE_SUFFIX).unlink(missing_ok=True)
        path.unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()


def build_object_store() -> ObjectStore:
    """§2.2 -- the provider is a configuration value.

    `s3` raises rather than falling back. A backend that quietly degraded to the local
    filesystem would put production bytes somewhere nobody chose, and the volume would
    look like it was working right up until the replica count changed.
    """
    backend = settings.STORAGE_BACKEND
    if backend == "filesystem":
        return FilesystemObjectStore(settings.STORAGE_ROOT)
    raise NotImplementedError(
        f"STORAGE_BACKEND={backend!r} is a seam, not an implementation. "
        "Cloudflare R2 / S3 / B2 all speak one API and the day one is wanted this is the "
        "single place that changes -- see the design doc §2.2."
    )
