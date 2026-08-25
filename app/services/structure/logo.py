"""The studio logo -- M1.8's first customer of app/core/storage.py.

G6: routers parse, call, return. This module owns the three-line dance the logo needs and
the wizard's step 1 does not want to know about -- sniff, file the bytes, point the column
at them, and delete the *old* object when the format changes so a WebP upload does not
leave a stale PNG on the volume forever.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, attributes

from app.core.storage import (
    ObjectNotFoundError,
    ObjectStore,
    UnsupportedImageError,
    sniff_image_type,
    studio_logo_key,
)
from app.models.studio import Studio
from app.schemas.studio import SUPPORTED_LOCALES
from app.services.audit import AuditService


class NoLogoError(Exception):
    """The studio has never had a logo, or the object behind the pointer is gone."""


def active_studio(session: Session, studio_id: uuid.UUID) -> Studio:
    # Studio is the tenant, not a tenant-scoped row, so it carries no TenantMixin and the
    # default filter does not reach it. The id comes from the verified JWT via
    # require_current_studio_id(), which is what makes this scoped anyway.
    return session.execute(select(Studio).where(Studio.id == studio_id)).scalar_one()


def store_logo(
    session: Session,
    store: ObjectStore,
    *,
    studio_id: uuid.UUID,
    data: bytes,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> str:
    """Sniff, file, repoint. Returns the key. Raises UnsupportedImageError.

    The declared Content-Type never reaches this function -- the route does not pass it,
    so there is no parameter through which a lying header could arrive.
    """
    content_type = sniff_image_type(data)
    if content_type is None:
        raise UnsupportedImageError("not a PNG, JPEG or WebP")

    studio = active_studio(session, studio_id)
    previous = studio.logo_object_key
    key = studio_logo_key(studio_id, content_type)
    store.put(key, data, content_type=content_type)
    # Only when the extension changed: `put` already overwrote the same key in place, and
    # deleting it here would remove what was just written.
    if previous and previous != key:
        store.delete(previous)
    studio.logo_object_key = key

    AuditService.record(
        session,
        action="studio.logo.uploaded",
        entity_type="studio",
        entity_id=studio_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        # The key and the size. Never the bytes: an audit row is append-only, so
        # anything put here can never be removed.
        diff={"logo_object_key": key, "content_type": content_type, "bytes": len(data)},
    )
    return key


def read_logo(session: Session, store: ObjectStore, *, studio_id: uuid.UUID) -> tuple[bytes, str]:
    studio = active_studio(session, studio_id)
    if not studio.logo_object_key:
        raise NoLogoError(str(studio_id))
    try:
        return store.get(studio.logo_object_key)
    except ObjectNotFoundError as exc:
        # A pointer at nothing. Reported as absent rather than as a server error: the
        # honest answer to "show me the logo" is that there is not one.
        raise NoLogoError(str(studio_id)) from exc


def delete_logo(
    session: Session,
    store: ObjectStore,
    *,
    studio_id: uuid.UUID,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> None:
    """Idempotent -- a DELETE on a studio with no logo is a 204, not a 404."""
    studio = active_studio(session, studio_id)
    key = studio.logo_object_key
    if not key:
        return
    store.delete(key)
    studio.logo_object_key = None
    AuditService.record(
        session,
        action="studio.logo.deleted",
        entity_type="studio",
        entity_id=studio_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        diff={"logo_object_key": key},
    )


def logo_url(studio: Studio) -> str | None:
    """The scoped read route, cache-busted by the row's own updated_at.

    A bare `/api/v1/studio/logo` would be served from the browser cache after a replace,
    and the owner would conclude the upload silently failed.
    """
    if not studio.logo_object_key:
        return None
    stamp = int(studio.updated_at.timestamp()) if studio.updated_at else 0
    return f"/api/v1/studio/logo?v={stamp}"


def current_logo_url(session: Session, *, studio_id: uuid.UUID) -> str | None:
    """`logo_url` after a commit.

    The refresh is not optional: `updated_at` is `onupdate=func.now()`, so the value that
    busts the cache is computed by Postgres and the in-memory row still holds the previous
    one. Skipping it would return the URL of the image that was just replaced.
    """
    studio = active_studio(session, studio_id)
    session.refresh(studio)
    return logo_url(studio)


# -- step 1's fields, and the הגדרות panel that reads the same row ------------
#: What `PATCH /studio` puts in the JSONB rather than in a column. §4.3 pins the column
#: list, and "settings includes:" describes what the column holds rather than closing it.
SETTINGS_FIELDS = ("sport", "address", "phone", "parent_locales")


def studio_public_fields(studio: Studio) -> dict[str, Any]:
    """The merged view. `parent_locales` falls back to the studio's own default so a row
    written before M1.9 still answers the question."""
    blob = studio.settings or {}
    return {
        "id": studio.id,
        "name": studio.name,
        "slug": studio.slug,
        "timezone": studio.timezone,
        "default_locale": studio.default_locale,
        "logo_url": logo_url(studio),
        "sport": blob.get("sport"),
        "address": blob.get("address"),
        "phone": blob.get("phone"),
        "parent_locales": blob.get("parent_locales") or [studio.default_locale],
    }


def update_studio_fields(
    session: Session,
    *,
    studio_id: uuid.UUID,
    fields: dict[str, Any],
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> Studio:
    """`name` to its column, the rest into `settings`. Merged, never replaced.

    `settings` is shared JSONB -- setup_progress, standing_order_link, billing_day and
    retention_months all live there -- so a whole-column assignment would drop them
    silently, and the loss would surface somewhere else entirely.
    """
    studio = active_studio(session, studio_id)
    changed: list[str] = []

    if "name" in fields and fields["name"] is not None:
        if studio.name != fields["name"]:
            changed.append("name")
        studio.name = fields["name"]

    blob = dict(studio.settings or {})
    for key in SETTINGS_FIELDS:
        if key in fields and fields[key] is not None:
            if blob.get(key) != fields[key]:
                changed.append(key)
            blob[key] = fields[key]

    # §9's fallback chain resolves through the studio's default_locale, so dropping it
    # from the offered set would leave the fallback pointing at a language the studio
    # says it does not offer.
    locales = blob.get("parent_locales")
    if locales and studio.default_locale not in locales:
        blob["parent_locales"] = [
            locale for locale in SUPPORTED_LOCALES if locale in {*locales, studio.default_locale}
        ]

    studio.settings = blob
    attributes.flag_modified(studio, "settings")

    AuditService.record(
        session,
        action="studio.details.updated",
        entity_type="studio",
        entity_id=studio_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        # The field NAMES, not the values. A club phone number in an append-only table is
        # a phone number that can never be corrected out of it.
        diff={"fields": sorted(set(changed))},
    )
    return studio
