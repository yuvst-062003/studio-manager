"""12e's payer side (feature pass 2026-08-27): the catalogue read and the item order.

The property under test is server-side pricing -- the client sends ids and quantities
and never an amount -- and that the created charges are ordinary `manual` charges any
payment route can then settle.
"""

from __future__ import annotations

import uuid

from app.models.billing import Charge, Product
from sqlalchemy import select


def _product(
    app_session, studio, *, name: str, price: int, active: bool = True, class_id=None
) -> uuid.UUID:
    # `class_id` since 2026-09-09: the parent catalogue returns only the items of classes
    # the family trains in, so a product raised without one is returned to nobody.
    row = Product(
        studio_id=studio.id,
        name=name,
        description=None,
        price_agorot=price,
        is_active=active,
        class_id=class_id,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def test_the_catalogue_lists_active_products_to_a_signed_in_payer(
    client, app_session, studio, a_priced_student, as_guardian_of, family_class_id
):
    _product(app_session, studio, name="גי", price=18_000, class_id=family_class_id)
    _product(app_session, studio, name="חגורה", price=4_000, class_id=family_class_id)
    _product(app_session, studio, name="ישן", price=1_000, active=False, class_id=family_class_id)

    parent = as_guardian_of(a_priced_student.student_id)
    body = client.get("/api/v1/me/products", headers=parent.headers).json()
    names = [row["name"] for row in body["items"]]
    assert "גי" in names and "חגורה" in names
    assert "ישן" not in names


def test_an_order_creates_manual_charges_priced_from_the_catalogue(
    client, app_session, studio, a_priced_student, as_guardian_of, family_class_id
):
    gi = _product(app_session, studio, name="גי", price=18_000)
    belt = _product(app_session, studio, name="חגורה", price=4_000)

    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={
            "items": [
                {"product_id": str(gi), "quantity": 1},
                {"product_id": str(belt), "quantity": 2},
            ]
        },
        headers=parent.headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["total_agorot"] == 18_000 + 8_000

    rows = (
        app_session.execute(
            select(Charge).where(
                Charge.id.in_([uuid.UUID(charge_id) for charge_id in body["charge_ids"]])
            )
        )
        .scalars()
        .all()
    )
    assert {row.kind for row in rows} == {"manual"}
    assert {row.amount_agorot for row in rows} == {18_000, 8_000}
    notes = {row.proration_note for row in rows}
    assert notes == {"גי", "חגורה × 2"}
    # Ordinary open charges: any payment route (card order, cash request) can settle them.
    assert {row.status for row in rows} == {"open"}


def test_an_inactive_product_reads_as_not_found(
    client, app_session, studio, a_priced_student, as_guardian_of, family_class_id
):
    retired = _product(app_session, studio, name="ישן", price=1_000, active=False)
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(retired), "quantity": 1}]},
        headers=parent.headers,
    )
    assert response.status_code == 404


def test_anonymous_cannot_read_or_order(client, app_session, studio):
    _product(app_session, studio, name="גי", price=18_000)
    assert client.get("/api/v1/me/products").status_code == 401
    assert (
        client.post(
            "/api/v1/me/orders/items",
            json={"items": [{"product_id": str(uuid.uuid4()), "quantity": 1}]},
        ).status_code
        == 401
    )


def test_the_parents_note_travels_on_the_charge_label(
    client, app_session, studio, a_priced_student, as_guardian_of, family_class_id
):
    """2026-08-30 — 'a parent buying a product should be able to write a note, and the
    manager should see it.' The note rides the charge's own line label, so every surface
    that names the charge shows it without a second field to plumb."""
    gi = _product(app_session, studio, name="גי", price=18_000)
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "quantity": 2, "note": "רקמה: יוסי"}]},
        headers=parent.headers,
    )
    assert response.status_code == 201, response.text
    app_session.expire_all()
    charge = app_session.execute(
        select(Charge).where(Charge.id == uuid.UUID(response.json()["charge_ids"][0]))
    ).scalar_one()
    assert "גי × 2" in charge.proration_note
    assert "רקמה: יוסי" in charge.proration_note


def test_an_overlong_note_is_refused_not_truncated(
    client, app_session, studio, a_priced_student, as_guardian_of, family_class_id
):
    gi = _product(app_session, studio, name="גי", price=18_000)
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "note": "א" * 200}]},
        headers=parent.headers,
    )
    assert response.status_code == 422


# -- what makes a purchase history possible ------------------------------------
def test_an_order_names_the_product_it_bought(
    client, app_session, studio, a_priced_student, as_guardian_of, family_class_id
):
    """The discriminator the parent app's ההזמנות שלי stands on.

    A shop order and a manager's ad-hoc charge are both `kind='manual'`, so `created_by`
    cannot separate them — and §5.10's manual charge can be NEGATIVE, which would read as a
    purchase of minus two hundred shekels in a family's history. `product_id` is what says
    which is which, and this asserts the order route actually sets it.
    """
    from app.models.billing import Charge

    gi = _product(app_session, studio, name="גי", price=18_000)
    parent = as_guardian_of(a_priced_student.student_id)
    client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "quantity": 1}]},
        headers=parent.headers,
    )

    charge = app_session.execute(
        select(Charge).where(Charge.product_id == gi)
    ).scalar_one()
    assert charge.kind == "manual"
    assert charge.product_id == gi


def test_neither_a_managers_charge_nor_a_credit_looks_like_an_order(
    client, app_session, studio, a_priced_student, as_manager
):
    """The other half of the same property, in both shapes a `manual` charge can take.

    A manager's extra-item charge goes through `POST /charges`, and §5.10's CREDIT goes
    through `POST /charges/{id}/adjust` as a negative `manual` charge. Both would have
    landed in a family's purchase history — the credit as a purchase of minus fifty shekels
    — until `product_id` told them apart.
    """
    from app.models.billing import Charge

    extra = client.post(
        "/api/v1/charges",
        json={
            "payer_person_id": str(a_priced_student.payer_person_id),
            "kind": "manual",
            "amount_agorot": 5_000,
            "due_date": "2026-09-01",
            "note": "השתתפות בהסעה",
        },
        headers=as_manager.headers,
    )
    assert extra.status_code == 201
    assert extra.json()["product_id"] is None

    credit = client.post(
        f"/api/v1/charges/{extra.json()['id']}/adjust",
        json={"amount_agorot": -5_000, "reason": "זיכוי"},
        headers=as_manager.headers,
    )
    assert credit.status_code == 201
    assert credit.json()["product_id"] is None

    # And on the rows themselves, not only in the response.
    for charge_id in (extra.json()["id"], credit.json()["id"]):
        row = app_session.execute(
            select(Charge).where(Charge.id == uuid.UUID(charge_id))
        ).scalar_one()
        assert row.kind == "manual"
        assert row.product_id is None
