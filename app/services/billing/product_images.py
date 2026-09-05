"""A catalogue item's photo -- `app/core/storage.py`'s third customer.

The parent app's shop draws a product as a card with a photograph, and the catalogue had no
image column at all, so every card rendered the same placeholder. This is the column's
service half: sniff the bytes, file them, repoint the row, and delete the *old* object when
the format changes so a WebP upload does not leave a stale PNG on the volume forever.

Modelled on `app/services/structure/logo.py` deliberately -- same three-line dance, same
audit shape, same "a pointer at nothing is reported as absent and logged as a fault". Two
things differ, and both follow from a product being a tenant-scoped ROW rather than the
tenant itself:

  - the row is fetched through `TenantSession`, so the studio filter is applied by the
    session rather than by an explicit `where` this module would have to remember;
  - deleting a product must delete its object, which `delete_image` exists for. The store is
    not the database and no cascade reaches it.
"""

from __future__ import annotations

import contextlib
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.storage import (
    ObjectNotFoundError,
    ObjectStore,
    UnsupportedImageError,
    product_image_key,
    sniff_image_type,
)
from app.models.billing import Product
from app.services.audit import AuditService

logger = logging.getLogger(__name__)


class NoImageError(Exception):
    """The product has never had a photo, or the object behind the pointer is gone."""


class UnknownProductError(Exception):
    """No such product in the caller's studio."""


def _product(session: Session, product_id: uuid.UUID) -> Product:
    row = session.execute(select(Product).where(Product.id == product_id)).scalar_one_or_none()
    if row is None:
        # `TenantSession` has already narrowed to the caller's studio, so "not in this
        # studio" and "does not exist" arrive here as the same thing -- which is the answer
        # the caller should get either way.
        raise UnknownProductError(str(product_id))
    return row


def store_image(
    session: Session,
    store: ObjectStore,
    *,
    studio_id: uuid.UUID,
    product_id: uuid.UUID,
    data: bytes,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> str:
    """Sniff, file, repoint. Returns the key.

    The declared Content-Type never reaches this function -- the route does not pass it, so
    there is no parameter through which a lying header could arrive.
    """
    content_type = sniff_image_type(data)
    if content_type is None:
        raise UnsupportedImageError("not a PNG, JPEG or WebP")

    product = _product(session, product_id)
    previous = product.image_object_key
    key = product_image_key(studio_id, product_id, content_type)
    store.put(key, data, content_type=content_type)
    # Only when the extension changed: `put` already overwrote the same key in place, and
    # deleting it here would remove what was just written.
    if previous and previous != key:
        store.delete(previous)
    product.image_object_key = key

    AuditService.record(
        session,
        action="product.image.uploaded",
        entity_type="product",
        entity_id=product_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        # The key and the size, never the bytes: an audit row is append-only, so anything
        # put here can never be removed.
        diff={"image_object_key": key, "content_type": content_type, "bytes": len(data)},
    )
    return key


def read_image(session: Session, store: ObjectStore, *, product_id: uuid.UUID) -> tuple[bytes, str]:
    product = _product(session, product_id)
    if not product.image_object_key:
        raise NoImageError(str(product_id))
    try:
        return store.get(product.image_object_key)
    except ObjectNotFoundError as exc:
        # A pointer at nothing. Reported to the CALLER as absent, because the honest answer
        # to "show me this product's photo" is that there is not one -- and the shop draws
        # its default tile, which is the right screen either way.
        #
        # Logged, because the two cases are not the same thing and no screen can tell them
        # apart. "Never uploaded" is ordinary; "uploaded and the bytes are gone" is a broken
        # deployment, and it looked exactly like ordinary for three rounds of bug reports on
        # the studio logo (2026-08-31) -- an `api` service with no volume, so STORAGE_ROOT
        # lived in the container and every redeploy emptied it.
        logger.warning(
            "product image object missing for a product that has an image key",
            extra={
                "product_id": str(product_id),
                "image_object_key": product.image_object_key,
            },
        )
        raise NoImageError(str(product_id)) from exc


def delete_image(
    session: Session,
    store: ObjectStore,
    *,
    studio_id: uuid.UUID,
    product_id: uuid.UUID,
    actor_person_id: uuid.UUID | None = None,
    actor_identity_id: uuid.UUID | None = None,
) -> None:
    """Idempotent -- a DELETE on a product with no photo is a 204, not a 404."""
    product = _product(session, product_id)
    key = product.image_object_key
    if not key:
        return
    product.image_object_key = None
    # The pointer is what the app reads; an object that is already gone is the state this
    # function was asked to reach.
    with contextlib.suppress(ObjectNotFoundError):
        store.delete(key)
    AuditService.record(
        session,
        action="product.image.deleted",
        entity_type="product",
        entity_id=product_id,
        studio_id=studio_id,
        actor_person_id=actor_person_id,
        actor_identity_id=actor_identity_id,
        diff={"image_object_key": key},
    )


def product_for_out(session: Session, product_id: uuid.UUID) -> Product:
    """The row, for a route that has just written to it and now has to serialise it."""
    return _product(session, product_id)


def image_url(product: Product) -> str | None:
    """What a client should fetch, or None when there is no photo.

    Built from the id rather than from the object key: the key names a file on a volume and
    the URL names a route, and letting a client see the former would tie the store's layout
    to the API's surface. A client that gets None draws its own placeholder.
    """
    return f"/api/v1/products/{product.id}/image" if product.image_object_key else None
