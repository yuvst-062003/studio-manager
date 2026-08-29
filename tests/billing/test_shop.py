"""12e's payer side (feature pass 2026-08-27): the catalogue read and the item order.

The property under test is server-side pricing -- the client sends ids and quantities
and never an amount -- and that the created charges are ordinary `manual` charges any
payment route can then settle.
"""

from __future__ import annotations

import uuid

from app.models.billing import Charge, Product
from sqlalchemy import select


def _product(app_session, studio, *, name: str, price: int, active: bool = True) -> uuid.UUID:
    row = Product(
        studio_id=studio.id, name=name, description=None, price_agorot=price, is_active=active
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def test_the_catalogue_lists_active_products_to_a_signed_in_payer(
    client, app_session, studio, a_priced_student, as_guardian_of
):
    _product(app_session, studio, name="גי", price=18_000)
    _product(app_session, studio, name="חגורה", price=4_000)
    _product(app_session, studio, name="ישן", price=1_000, active=False)

    parent = as_guardian_of(a_priced_student.student_id)
    body = client.get("/api/v1/me/products", headers=parent.headers).json()
    names = [row["name"] for row in body["items"]]
    assert "גי" in names and "חגורה" in names
    assert "ישן" not in names


def test_an_order_creates_manual_charges_priced_from_the_catalogue(
    client, app_session, studio, a_priced_student, as_guardian_of
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
    client, app_session, studio, a_priced_student, as_guardian_of
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
    client, app_session, studio, a_priced_student, as_guardian_of
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
    client, app_session, studio, a_priced_student, as_guardian_of
):
    gi = _product(app_session, studio, name="גי", price=18_000)
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/me/orders/items",
        json={"items": [{"product_id": str(gi), "note": "א" * 200}]},
        headers=parent.headers,
    )
    assert response.status_code == 422
