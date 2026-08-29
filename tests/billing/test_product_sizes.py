"""§4.3's catalogue learns which items come in sizes, and the order learns to ask.

A גי is bought in a size and a חגורה is not. `product.sizes` is the manager's answer per
item; an empty list IS "no sizes", which is why there is no `has_sizes` flag anywhere in
these tests to keep in step with it.

The pairing rule is enforced in BOTH directions and both halves are tested here. A sized
item ordered without a size is the obvious one. A size sent against a sizeless item is the
one worth writing down: accepting it would put "מידה 120" on a handover sheet for a belt,
which means nothing to whoever reads it and is indistinguishable from a real instruction.
"""

from __future__ import annotations

import uuid

from app.models.billing import Charge, Product
from app.services.billing.catalogue import MAX_SIZE_LABEL, MAX_SIZES, CatalogueService
from app.services.billing.errors import RefusedError
from sqlalchemy import select


def _product(app_session, studio, *, name: str, price: int, sizes: list[str]) -> uuid.UUID:
    row = Product(
        studio_id=studio.id,
        name=name,
        description=None,
        price_agorot=price,
        is_active=True,
        sizes=sizes,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


# -- the manager's side -------------------------------------------------------
def test_a_manager_sets_the_sizes_an_item_comes_in(client, as_owner):
    response = client.post(
        "/api/v1/products",
        json={"name": "גי", "price_agorot": 18_000, "sizes": ["100", "110", "120"]},
        headers=as_owner.headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["sizes"] == ["100", "110", "120"]


def test_an_item_with_no_sizes_is_the_default_and_stays_empty(client, as_owner):
    """A חגורה. Omitting the field is the same answer as sending none, which is also what
    every product created before the column existed says."""
    response = client.post(
        "/api/v1/products",
        json={"name": "חגורה", "price_agorot": 4_000},
        headers=as_owner.headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["sizes"] == []


def test_the_manager_order_is_kept_rather_than_sorted(client, as_owner):
    """Sorting is wrong twice over: alphabetically `100` precedes `90`, and `L` precedes
    `M`. The manager's own order is the only one that reads correctly on a picker."""
    response = client.post(
        "/api/v1/products",
        json={"name": "כפפות", "price_agorot": 9_000, "sizes": ["S", "M", "L", "XL"]},
        headers=as_owner.headers,
    )
    assert response.json()["sizes"] == ["S", "M", "L", "XL"]


def test_sizes_are_trimmed_and_de_duplicated(client, as_owner):
    response = client.post(
        "/api/v1/products",
        json={"name": "גי", "price_agorot": 18_000, "sizes": ["  100 ", "110", "", "100"]},
        headers=as_owner.headers,
    )
    assert response.json()["sizes"] == ["100", "110"]


def test_an_empty_patch_clears_the_sizes(client, as_owner):
    """ "It turned out not to come in sizes" is an ordinary correction, and a falsy-skip in
    the service would make it the one edit the screen could not save."""
    created = client.post(
        "/api/v1/products",
        json={"name": "גי", "price_agorot": 18_000, "sizes": ["100", "110"]},
        headers=as_owner.headers,
    ).json()

    patched = client.patch(
        f"/api/v1/products/{created['id']}",
        json={"sizes": []},
        headers=as_owner.headers,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["sizes"] == []


def test_a_patch_that_omits_sizes_leaves_them_alone(client, as_owner):
    """`exclude_unset` is what separates "sent empty" from "not sent" — renaming an item
    must not silently strip the sizes it is sold in."""
    created = client.post(
        "/api/v1/products",
        json={"name": "גי", "price_agorot": 18_000, "sizes": ["100", "110"]},
        headers=as_owner.headers,
    ).json()

    patched = client.patch(
        f"/api/v1/products/{created['id']}",
        json={"name": "גי לבן"},
        headers=as_owner.headers,
    )
    assert patched.json()["sizes"] == ["100", "110"]


def test_the_service_refuses_an_over_long_label_and_an_over_long_list():
    """Bounded in the service rather than by a CHECK: these are decisions about a picker's
    usable length, not truths about the data."""
    with __import__("pytest").raises(RefusedError):
        CatalogueService.normalise_sizes(["x" * (MAX_SIZE_LABEL + 1)])
    with __import__("pytest").raises(RefusedError):
        CatalogueService.normalise_sizes([str(n) for n in range(MAX_SIZES + 1)])


# -- the payer's side ---------------------------------------------------------
def test_the_catalogue_tells_a_parent_which_sizes_an_item_comes_in(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    _product(app_session, studio, name="גי", price=18_000, sizes=["100", "110"])
    _product(app_session, studio, name="חגורה", price=4_000, sizes=[])

    parent = as_guardian_of(a_priced_student.student_id)
    items = {
        row["name"]: row["sizes"]
        for row in client.get("/api/v1/me/products", headers=parent.headers).json()["items"]
    }
    assert items["גי"] == ["100", "110"]
    assert items["חגורה"] == []


def test_a_sized_item_records_the_chosen_size_on_the_charge(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    """The size has to reach whoever fills the order, and `proration_note` is the only
    free-text field a charge has — see `_line_label`'s docstring on why that column."""
    gi = _product(app_session, studio, name="גי", price=18_000, sizes=["100", "110"])

    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "quantity": 1, "size": "110"}]},
        headers=parent.headers,
    )
    assert response.status_code == 201, response.text

    charge = app_session.execute(
        select(Charge).where(Charge.id == uuid.UUID(response.json()["charge_ids"][0]))
    ).scalar_one()
    assert charge.proration_note == "גי · 110"


def test_a_quantity_and_a_size_both_reach_the_line(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    gi = _product(app_session, studio, name="גי", price=18_000, sizes=["100"])
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "quantity": 2, "size": "100"}]},
        headers=parent.headers,
    )
    charge = app_session.execute(
        select(Charge).where(Charge.id == uuid.UUID(response.json()["charge_ids"][0]))
    ).scalar_one()
    assert charge.proration_note == "גי × 2 · 100"


def test_a_sized_item_cannot_be_ordered_without_a_size(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    gi = _product(app_session, studio, name="גי", price=18_000, sizes=["100", "110"])
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "quantity": 1}]},
        headers=parent.headers,
    )
    assert response.status_code == 422
    # Its own code, not the generic refusal: the screen turns this one into "choose a size"
    # against the offending row rather than a banner over the order.
    assert response.json()["detail"]["code"] == "size_required"


def test_a_sizeless_item_refuses_a_size(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    """The half that is easy to forget. "מידה 120" on a belt is a number on a handover
    sheet that means nothing and reads like an instruction."""
    belt = _product(app_session, studio, name="חגורה", price=4_000, sizes=[])
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(belt), "quantity": 1, "size": "120"}]},
        headers=parent.headers,
    )
    assert response.status_code == 422


def test_a_size_the_club_does_not_offer_is_refused(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    """Membership, never free text: this string is about to be written onto a charge the
    club fulfils from."""
    gi = _product(app_session, studio, name="גי", price=18_000, sizes=["100", "110"])
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "quantity": 1, "size": "999"}]},
        headers=parent.headers,
    )
    assert response.status_code == 422


def test_nothing_is_charged_when_one_line_is_refused(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    """The order is one request and one transaction. A parent who ordered a belt and a
    sizeless גי must not end up owing for the belt alone."""
    belt = _product(app_session, studio, name="חגורה", price=4_000, sizes=[])
    gi = _product(app_session, studio, name="גי", price=18_000, sizes=["100"])

    parent = as_guardian_of(a_priced_student.student_id)
    before = len(app_session.execute(select(Charge)).scalars().all())
    response = client.post(
        "/api/v1/me/orders/items",
        json={
            "items": [
                {"product_id": str(belt), "quantity": 1},
                {"product_id": str(gi), "quantity": 1},
            ]
        },
        headers=parent.headers,
    )
    assert response.status_code == 422
    app_session.rollback()
    assert len(app_session.execute(select(Charge)).scalars().all()) == before
