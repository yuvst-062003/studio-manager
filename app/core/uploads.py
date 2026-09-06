"""The four things every image upload route needs, in one place.

Extracted from `app/routers/studio.py` when the product catalogue gained a photo and a
second router needed the same ceiling, the same chunked read and the same object store. They
were fine as module-level helpers while exactly one route used them; a second copy of a size
cap is a size cap that drifts, and the two would then disagree about what "too large" means
on two screens of the same app.

`studio.py` re-exports these under its own names, so nothing it already had changes.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, File, HTTPException, Request, UploadFile, status

from app.core.storage import MAX_UPLOAD_BYTES, ObjectStore, build_object_store

#: Read in chunks rather than at once: a declared Content-Length is a claim from the caller,
#: so the running total is what actually enforces the limit.
CHUNK = 64 * 1024


def object_store() -> ObjectStore:
    """A dependency rather than a module global, so a test swaps the backend through the
    same seam production resolves through."""
    return build_object_store()


ObjectStoreDep = Annotated[ObjectStore, Depends(object_store)]
#: `Annotated`, not a default value: a call in an argument default is evaluated once at
#: import and shared by every request (ruff B008).
ImageUpload = Annotated[UploadFile, File(description="PNG, JPEG or WebP. Never SVG.")]


def too_large(what: str = "an image") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail={"code": "too_large", "message": f"{what} may be at most {MAX_UPLOAD_BYTES} bytes"},
    )


def actor(request: Request) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    person_id = getattr(request.state, "person_id", None)
    identity_id = getattr(request.state, "identity_id", None)
    return (
        person_id if isinstance(person_id, uuid.UUID) else None,
        identity_id if isinstance(identity_id, uuid.UUID) else None,
    )


async def read_capped(upload: UploadFile, *, what: str = "an image") -> bytes:
    """§2.3's ceiling, enforced while reading rather than after."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(CHUNK):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise too_large(what)
        chunks.append(chunk)
    return b"".join(chunks)


def refuse_obviously_oversize(request: Request, *, what: str = "an image") -> None:
    """Twice the ceiling, not the ceiling itself.

    A multipart envelope carries boundaries and part headers, so a request holding a file
    exactly at the limit is legitimately larger than the limit. This rejects the obviously
    oversize before a byte is spooled; `read_capped` enforces the actual rule.
    """
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES * 2:
        raise too_large(what)
