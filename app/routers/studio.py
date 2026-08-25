"""`/api/v1/studio` -- the active studio's details, and its logo.

Everything under the `/studio` path lives here, so a reader looking for who owns a path
finds one answer. The design doc lists `PATCH /api/v1/studio` under its setup-API heading
because the wizard's step 1 is its caller, not because the route belongs to the setup
router; `app/routers/setup.py` owns `/setup/*` and nothing else.

**There is no generic `GET /files/{key}`, and there must never be one.** A generic file
route invites both path traversal and enumeration across tenants. Reads are scoped routes
instead: the studio comes from the verified JWT via `require_current_studio_id()`, so
there is no key in the URL for a caller to guess at, and one studio cannot address
another's object even by trying.

Uploads pass through the API rather than being presigned (design §2.3). A presigned PUT
cannot work against the filesystem backend, so adopting one would make the *client* differ
per environment -- the one thing the seam exists to prevent.

The declared `Content-Type` is never consulted. It is not passed to the service, so there
is no parameter through which a lying header could arrive; app/core/storage.py sniffs the
first bytes instead.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.storage import (
    MAX_UPLOAD_BYTES,
    ObjectStore,
    UnsupportedImageError,
    build_object_store,
)
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.schemas.studio import StudioLogoOut, StudioOut, StudioUpdate
from app.services.structure import logo as logo_service

router = APIRouter(tags=["studio"])

#: Read in pieces, so a body that lies about its length is still capped.
_CHUNK = 64 * 1024


def object_store() -> ObjectStore:
    """A dependency rather than a module global, so a test swaps the backend through the
    same seam production resolves through."""
    return build_object_store()


ObjectStoreDep = Annotated[ObjectStore, Depends(object_store)]
#: `Annotated`, not a default value: a call in an argument default is evaluated once at
#: import and shared by every request (ruff B008).
LogoUpload = Annotated[UploadFile, File(description="PNG, JPEG or WebP. Never SVG.")]


def _too_large() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail={"code": "too_large", "message": f"a logo may be at most {MAX_UPLOAD_BYTES} bytes"},
    )


def _actor(request: Request) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    person_id = getattr(request.state, "person_id", None)
    identity_id = getattr(request.state, "identity_id", None)
    return (
        person_id if isinstance(person_id, uuid.UUID) else None,
        identity_id if isinstance(identity_id, uuid.UUID) else None,
    )


async def _read_capped(upload: UploadFile) -> bytes:
    """§2.3's ceiling, enforced while reading rather than after.

    A declared Content-Length is a claim from the caller, so the running total is what
    actually enforces the limit.
    """
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(_CHUNK):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise _too_large()
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/studio", response_model=StudioOut)
def read_studio(_: AnyStaff, session: TenantSessionDep) -> StudioOut:
    """Every staff role. Rendering the club's own name and logo is not a settings read in
    the §3.2 sense, and a coach app that could not do it would be enforcing a rule about
    writes by breaking a read."""
    studio = logo_service.active_studio(session, require_current_studio_id())
    return StudioOut.model_validate(logo_service.studio_public_fields(studio))


@router.patch("/studio", response_model=StudioOut)
def update_studio(
    _: ManagerOrOwner, body: StudioUpdate, request: Request, session: TenantSessionDep
) -> StudioOut:
    """The wizard's step 1 (פרטי מועדון) and the dashboard's הגדרות panel write through
    the same route -- there is one studio row and it should have one writer.

    `exclude_unset` and not `exclude_none`: the two differ for a field a client sends
    explicitly as null, and treating "not mentioned" and "cleared" alike would make the
    הגדרות autosave blank every field it did not happen to include.
    """
    person_id, identity_id = _actor(request)
    studio = logo_service.update_studio_fields(
        session,
        studio_id=require_current_studio_id(),
        fields=body.model_dump(exclude_unset=True),
        actor_person_id=person_id,
        actor_identity_id=identity_id,
    )
    session.commit()
    session.refresh(studio)
    return StudioOut.model_validate(logo_service.studio_public_fields(studio))


@router.post("/studio/logo", response_model=StudioLogoOut)
async def upload_logo(
    _: ManagerOrOwner,
    request: Request,
    session: TenantSessionDep,
    file: LogoUpload,
    store: ObjectStoreDep,
) -> StudioLogoOut:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES * 2:
        # Twice the ceiling, not the ceiling itself: a multipart envelope carries
        # boundaries and part headers, so a request holding a file exactly at the limit is
        # legitimately larger than the limit. This rejects the obviously-oversize before a
        # byte is spooled; _read_capped enforces the actual rule.
        raise _too_large()

    studio_id = require_current_studio_id()
    person_id, identity_id = _actor(request)
    data = await _read_capped(file)
    try:
        logo_service.store_logo(
            session,
            store,
            studio_id=studio_id,
            data=data,
            actor_person_id=person_id,
            actor_identity_id=identity_id,
        )
    except UnsupportedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "unsupported_image",
                # Named explicitly. "Invalid image" sends an owner back to the same file.
                "message": "a logo must be a PNG, a JPEG or a WebP. SVG is never accepted.",
            },
        ) from exc
    session.commit()
    return StudioLogoOut(logo_url=logo_service.current_logo_url(session, studio_id=studio_id) or "")


@router.get("/studio/logo")
def read_logo(session: TenantSessionDep, store: ObjectStoreDep) -> Response:
    """Any signed-in member of the studio, coaches and guardians included.

    Reading is not a settings write. A staff app that could not render the club's own logo
    would be enforcing a rule about writes by breaking a read.
    """
    try:
        data, content_type = logo_service.read_logo(
            session, store, studio_id=require_current_studio_id()
        )
    except logo_service.NoLogoError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "this studio has no logo"},
        ) from exc
    # `private`: the response is tenant-scoped, so a shared cache must never hold it.
    return Response(
        content=data, media_type=content_type, headers={"Cache-Control": "private, max-age=300"}
    )


@router.delete("/studio/logo", status_code=status.HTTP_204_NO_CONTENT)
def delete_logo(
    _: ManagerOrOwner,
    request: Request,
    session: TenantSessionDep,
    store: ObjectStoreDep,
) -> Response:
    """Idempotent -- a DELETE on a studio with no logo is a 204, not a 404."""
    person_id, identity_id = _actor(request)
    logo_service.delete_logo(
        session,
        store,
        studio_id=require_current_studio_id(),
        actor_person_id=person_id,
        actor_identity_id=identity_id,
    )
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
