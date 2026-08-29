"""The landing gallery -- §5.4a ①'s photos, on the logo's rails.

`app/routers/public.py` served `photo_urls=[]` for as long as nothing could write
`settings.landing.photo_object_keys`; this module is that writer. Same shape as
`logo.py`: sniff the bytes, file them under a server-built key, point the settings blob at
them -- except the pointer is an ordered LIST (the strip renders in upload order), each
object is named by a minted uuid so a replace is a new object rather than a cache problem,
and the count is capped: six is a strip, more is a gallery the page was never designed to
scroll.

Imported by `logo.py` for the read helpers (one direction: logo -> landing_photos), so the
active-studio lookup is restated here rather than imported from there.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, attributes

from app.core.storage import (
    ObjectStore,
    UnsupportedImageError,
    sniff_image_type,
    studio_landing_photo_key,
)
from app.models.studio import Studio
from app.services.audit import AuditService

#: Six is a strip; more is a gallery.
MAX_LANDING_PHOTOS = 6


class TooManyPhotosError(Exception):
    """The strip is full. Deleting one is the way to make room."""


def _active_studio(session: Session, studio_id: uuid.UUID) -> Studio:
    # Studio is the tenant, not a tenant-scoped row (see logo.py::active_studio); the id
    # comes from the verified JWT, which is what scopes this.
    return session.execute(select(Studio).where(Studio.id == studio_id)).scalar_one()


def photo_keys(studio: Studio) -> list[str]:
    """The ordered keys, read defensively -- the blob is shared JSONB."""
    blob = studio.settings if isinstance(studio.settings, dict) else {}
    nested = blob.get("landing")
    landing = nested if isinstance(nested, dict) else {}
    keys = landing.get("photo_object_keys")
    if not isinstance(keys, list):
        return []
    return [key for key in keys if isinstance(key, str)]


def photo_id_of(key: str) -> str:
    """`studios/{sid}/landing/{pid}.{ext}` -> `{pid}` -- the only part a URL carries."""
    return key.rsplit("/", 1)[-1].split(".", 1)[0]


def public_photo_url(slug: str, key: str) -> str:
    """The unauthenticated read route -- the shop window's URL, like the public logo's."""
    return f"/api/v1/public/studios/{slug}/photos/{photo_id_of(key)}"


def _write_keys(studio: Studio, keys: list[str]) -> None:
    """Merged into the shared blob, never replacing it -- `settings` also carries
    setup_progress, billing_day and the landing copy."""
    blob = dict(studio.settings or {})
    nested = blob.get("landing")
    landing = dict(nested) if isinstance(nested, dict) else {}
    landing["photo_object_keys"] = keys
    blob["landing"] = landing
    studio.settings = blob
    attributes.flag_modified(studio, "settings")


def store_photo(
    session: Session,
    store: ObjectStore,
    *,
    studio_id: uuid.UUID,
    data: bytes,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> list[str]:
    """Sniff, cap, file, append. Returns the full ordered key list.

    Raises UnsupportedImageError and TooManyPhotosError; the declared Content-Type never
    reaches this function, same as the logo's.
    """
    content_type = sniff_image_type(data)
    if content_type is None:
        raise UnsupportedImageError("not a PNG, JPEG or WebP")

    studio = _active_studio(session, studio_id)
    keys = photo_keys(studio)
    if len(keys) >= MAX_LANDING_PHOTOS:
        raise TooManyPhotosError(f"the landing strip holds {MAX_LANDING_PHOTOS} photos")

    key = studio_landing_photo_key(studio_id, uuid.uuid4().hex, content_type)
    store.put(key, data, content_type=content_type)
    updated = [*keys, key]
    _write_keys(studio, updated)

    AuditService.record(
        session,
        action="studio.landing_photo.uploaded",
        entity_type="studio",
        entity_id=studio_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        # The key and the size. Never the bytes: audit rows are append-only.
        diff={"photo_object_key": key, "content_type": content_type, "bytes": len(data)},
    )
    return updated


def delete_photo(
    session: Session,
    store: ObjectStore,
    *,
    studio_id: uuid.UUID,
    photo_id: str,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> None:
    """Idempotent -- deleting a photo that is not there is a no-op, not a 404."""
    studio = _active_studio(session, studio_id)
    keys = photo_keys(studio)
    key = next((candidate for candidate in keys if photo_id_of(candidate) == photo_id), None)
    if key is None:
        return
    store.delete(key)
    _write_keys(studio, [candidate for candidate in keys if candidate != key])
    AuditService.record(
        session,
        action="studio.landing_photo.deleted",
        entity_type="studio",
        entity_id=studio_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        diff={"photo_object_key": key},
    )
