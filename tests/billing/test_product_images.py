"""A catalogue item's photograph -- the column, the three routes, and who may reach them.

Added 2026-09-06 with the parent app's redesigned shop, which draws a product as a card with
a picture and had none to draw. The properties worth holding are the ones the studio logo's
own tests already learned the hard way:

  - the SNIFFED type names the file, never the declared one;
  - a parent may READ a product photo, because the shop renders it;
  - only a manager may write one;
  - absent is ordinary, and reads as absent rather than as an error.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.billing import Product
from sqlalchemy import select

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


@pytest.fixture(autouse=True)
def storage_root(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "filesystem")
    monkeypatch.setattr(settings, "STORAGE_ROOT", str(tmp_path / "objects"))
    return tmp_path / "objects"


def _product(app_session, studio, *, name: str = "גי", price: int = 18_000) -> uuid.UUID:
    row = Product(studio_id=studio.id, name=name, description=None, price_agorot=price)
    app_session.add(row)
    app_session.commit()
    return row.id


def upload(client, caller, product_id, data: bytes, *, filename="photo.png", declared="image/png"):
    return client.post(
        f"/api/v1/products/{product_id}/image",
        files={"file": (filename, data, declared)},
        headers=caller.headers,
    )


# -- the happy path -----------------------------------------------------------
def test_a_manager_uploads_a_photo_and_the_product_carries_its_url(
    client, app_session, studio, as_manager
) -> None:
    product_id = _product(app_session, studio)

    response = upload(client, as_manager, product_id, PNG)

    assert response.status_code == 200
    assert response.json()["image_url"] == f"/api/v1/products/{product_id}/image"


def test_the_key_is_named_by_the_sniffed_type_not_the_declared_one(
    client, app_session, studio, as_manager
) -> None:
    # The whole point of sniffing: a caller declaring `image/png` over JPEG bytes must not
    # decide where the object lands or what it is served as.
    product_id = _product(app_session, studio)
    upload(client, as_manager, product_id, JPEG, filename="lying.png", declared="image/png")

    key = app_session.execute(
        select(Product.image_object_key).where(Product.id == product_id)
    ).scalar_one()
    assert key == f"studios/{studio.id}/products/{product_id}.jpg"


@pytest.mark.parametrize(("data", "extension"), [(PNG, "png"), (JPEG, "jpg"), (WEBP, "webp")])
def test_every_supported_format_is_stored_under_its_own_extension(
    client, app_session, studio, as_manager, data, extension
) -> None:
    product_id = _product(app_session, studio)
    upload(client, as_manager, product_id, data)

    key = app_session.execute(
        select(Product.image_object_key).where(Product.id == product_id)
    ).scalar_one()
    assert key.endswith(f"{product_id}.{extension}")


def test_replacing_a_photo_with_another_format_leaves_no_stale_object(
    client, app_session, studio, as_manager, storage_root
) -> None:
    # `put` overwrites in place only when the key is unchanged. A PNG replaced by a WebP is
    # a different key, so the old object has to be deleted or it lives on the volume forever.
    product_id = _product(app_session, studio)
    upload(client, as_manager, product_id, PNG)
    upload(client, as_manager, product_id, WEBP)

    # `.content-type` sidecars are the filesystem backend's own bookkeeping and `delete`
    # removes them with their object, so the property under test is the OBJECTS.
    files = (storage_root / "studios" / str(studio.id) / "products").iterdir()
    objects = sorted(p.name for p in files if not p.name.endswith(".content-type"))
    assert objects == [f"{product_id}.webp"]


# -- who may reach it ---------------------------------------------------------
def test_a_guardian_may_READ_a_product_photo_because_the_shop_renders_it(
    client, app_session, studio, as_manager, a_priced_student, as_guardian_of
) -> None:
    # Deliberately not manager-only. A catalogue a parent can read while its pictures 403
    # would be enforcing a rule about writes by breaking a read.
    product_id = _product(app_session, studio)
    upload(client, as_manager, product_id, PNG)

    parent = as_guardian_of(a_priced_student.student_id)
    response = client.get(f"/api/v1/products/{product_id}/image", headers=parent.headers)

    assert response.status_code == 200
    assert response.content == PNG


def test_a_guardian_may_NOT_upload_one(
    client, app_session, studio, a_priced_student, as_guardian_of
) -> None:
    product_id = _product(app_session, studio)
    parent = as_guardian_of(a_priced_student.student_id)

    assert upload(client, parent, product_id, PNG).status_code == 403


def test_the_parent_catalogue_carries_the_url(
    client, app_session, studio, as_manager, a_priced_student, as_guardian_of
) -> None:
    # The seam that matters: a column set by one route has to reach the screen through
    # another. Asserting the upload alone would prove nothing about the shop.
    with_photo = _product(app_session, studio, name="גי")
    without = _product(app_session, studio, name="חגורה", price=4_000)
    upload(client, as_manager, with_photo, PNG)

    parent = as_guardian_of(a_priced_student.student_id)
    items = client.get("/api/v1/me/products", headers=parent.headers).json()["items"]
    by_id = {row["id"]: row for row in items}

    assert by_id[str(with_photo)]["image_url"] == f"/api/v1/products/{with_photo}/image"
    # Absent is ORDINARY, and it reaches the client as null so the shop draws its own tile.
    assert by_id[str(without)]["image_url"] is None


# -- refusals -----------------------------------------------------------------
def test_an_svg_is_refused_by_name(client, app_session, studio, as_manager) -> None:
    product_id = _product(app_session, studio)

    response = upload(
        client, as_manager, product_id, SVG, filename="x.svg", declared="image/svg+xml"
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "unsupported_image"


def test_a_product_with_no_photo_reads_as_absent_not_as_an_error(
    client, app_session, studio, as_manager
) -> None:
    product_id = _product(app_session, studio)

    response = client.get(f"/api/v1/products/{product_id}/image", headers=as_manager.headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_uploading_against_a_product_that_does_not_exist_is_a_404(client, as_manager) -> None:
    assert upload(client, as_manager, uuid.uuid4(), PNG).status_code == 404


# -- removing it --------------------------------------------------------------
def test_deleting_a_photo_clears_the_pointer_and_is_idempotent(
    client, app_session, studio, as_manager
) -> None:
    product_id = _product(app_session, studio)
    upload(client, as_manager, product_id, PNG)

    first = client.delete(f"/api/v1/products/{product_id}/image", headers=as_manager.headers)
    second = client.delete(f"/api/v1/products/{product_id}/image", headers=as_manager.headers)

    assert first.status_code == 204
    # A DELETE on a product with no photo is the state the caller wanted, not a 404.
    assert second.status_code == 204
    app_session.expire_all()
    key = app_session.execute(
        select(Product.image_object_key).where(Product.id == product_id)
    ).scalar_one()
    assert key is None
