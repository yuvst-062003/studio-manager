"""F7b -- the accountant and attendance exports.

The assertions that matter: the BOM (Excel decodes Hebrew by it), agorot formatted as
shekels by integer arithmetic at the boundary, and ManagerOrOwner on both routes.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.models.billing import Payment
from app.models.person import Person
from app.routers.exports import shekels


def _payment(app_session, studio, *, agorot: int, method: str = "cash") -> uuid.UUID:
    person = Person(studio_id=studio.id, first_name="משלם", last_name="מייצא")
    app_session.add(person)
    app_session.flush()
    payment = Payment(
        studio_id=studio.id,
        payer_person_id=person.id,
        method=method,
        amount_agorot=agorot,
        received_at=datetime(2026, 11, 5, 10, 0, tzinfo=UTC),
    )
    app_session.add(payment)
    app_session.commit()
    return payment.id


def test_shekels_is_integer_arithmetic_and_negative_safe():
    assert shekels(25_000) == "250.00"
    assert shekels(305) == "3.05"
    assert shekels(-1_250) == "-12.50"
    assert shekels(0) == "0.00"


def test_the_accountant_export_opens_in_excel_with_hebrew_intact(
    client, as_manager, app_session, studio
):
    _payment(app_session, studio, agorot=25_000)
    response = client.get(
        "/api/v1/exports/accountant?year=2026&month=11", headers=as_manager.headers
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-disposition"].startswith("attachment")
    body = response.content.decode("utf-8")
    # The BOM is the whole point -- without it Excel shows mojibake.
    assert body.startswith("﻿")
    assert "משלם מייצא" in body
    assert "250.00" in body
    assert "מזומן" in body


def test_the_exports_are_manager_only(client, as_lead_coach):
    accountant = client.get(
        "/api/v1/exports/accountant?year=2026&month=11", headers=as_lead_coach.headers
    )
    assert accountant.status_code == 403
    attendance = client.get(
        "/api/v1/exports/attendance?from=2026-11-01&to=2026-11-30",
        headers=as_lead_coach.headers,
    )
    assert attendance.status_code == 403


def test_the_attendance_export_refuses_a_backwards_range(client, as_manager):
    response = client.get(
        "/api/v1/exports/attendance?from=2026-11-30&to=2026-11-01", headers=as_manager.headers
    )
    assert response.status_code == 422
