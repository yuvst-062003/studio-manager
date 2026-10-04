"""A child loaded with no guardian yet -- the club-migration door (owner, 2026-10-04).

Gladiator's office kept no parent and no contact for anyone on its roster, and the owner
chose to load the children anyway so the staff and dashboard apps show the real club, and
to add each family afterwards. `StudentCreate.contact_pending` is that door. These tests
pin what it does and, as importantly, what it leaves alone:

- §5.3's rule still refuses an absent guardian from every caller who did not ask for it;
- nothing is billed: a priced, active student with no guardian raises no first-month
  charge and no monthly one, and nothing downstream (promise, debt ladder, at-risk) errors;
- the method the family already paid by is still recorded on the student;
- the students list names them `no_contact`, and filters on it;
- the parent added later becomes the PRIMARY guardian, which is what lets billing and the
  invitation find them -- so charging starts by itself from then on, as the owner accepted.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.models.billing import Charge
from app.models.people import Student
from app.models.person import Guardian, Invitation
from sqlalchemy import func, select
from tests.people.test_students_router import _already_paid_promises_for, _create, _payload


def _pending_payload() -> dict:
    payload = _payload()
    del payload["guardian"]
    return {**payload, "birthdate": None, "contact_pending": True, "send_invitation": False}


def _count(app_session, model, **where) -> int:
    stmt = select(func.count()).select_from(model)
    for column, value in where.items():
        stmt = stmt.where(getattr(model, column) == value)
    return app_session.execute(stmt).scalar_one()


def test_a_student_sent_with_contact_pending_is_created_with_no_guardian(
    client, app_session, as_manager
):
    created = _create(client, as_manager, _pending_payload())
    student_id = uuid.UUID(created["student"]["id"])

    assert created["invitation_token"] is None
    assert created["invitation_url"] is None
    assert created["invitation_email_sent"] is False
    assert _count(app_session, Guardian, student_id=student_id) == 0
    assert _count(app_session, Invitation, student_id=student_id) == 0


def test_without_the_flag_an_absent_guardian_is_still_refused(client, as_manager):
    """§5.3 holds for the by-hand form and the trial booking: only the explicit flag opens
    the door, so a client that merely forgets the guardian is still told."""
    payload = _pending_payload()
    del payload["contact_pending"]
    response = client.post("/api/v1/students", json=payload, headers=as_manager.headers)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "guardian_required"


def test_contact_pending_with_a_guardian_is_a_contradiction(client, as_manager):
    payload = {**_payload(), "contact_pending": True}
    response = client.post("/api/v1/students", json=payload, headers=as_manager.headers)
    assert response.status_code == 422


def test_a_priced_student_with_no_guardian_is_never_charged(
    client, app_session, tenant_session, studio, as_manager, a_group, a_price_plan
):
    """**The owner's "no charges at all yet"**, relied on rather than switched. Converting
    raises the first month on every other path; with nobody to bill it raises nothing, and
    the monthly run that follows raises nothing either. The method the family already paid
    by is still recorded, and no promise is raised, because there is no charge to name."""
    from app.services.billing.run import BillingRunService
    from app.workers import at_risk
    from app.workers.billing import escalate_debt

    student_id = _create(client, as_manager, _pending_payload())["student"]["id"]
    response = client.post(
        f"/api/v1/students/{student_id}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-10-04",
            "price_plan_id": str(a_price_plan),
            "payment_received": "cheque",
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    student = app_session.get(Student, uuid.UUID(student_id))
    assert student.status == "active"
    assert student.price_plan_id == a_price_plan
    assert student.payment_method == "cheque"
    assert _already_paid_promises_for(app_session, uuid.UUID(student_id)) == []
    assert _count(app_session, Charge, student_id=uuid.UUID(student_id)) == 0

    run_at = datetime(2026, 11, 1, 3, 0, tzinfo=UTC)
    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=run_at)
    tenant_session.commit()
    assert escalate_debt(tenant_session, at=run_at).reminders == 0
    at_risk.raise_at_risk(tenant_session, studio, at=run_at, tally=at_risk.Tally())

    app_session.expire_all()
    assert _count(app_session, Charge, student_id=uuid.UUID(student_id)) == 0


def test_the_list_names_them_no_contact_and_filters_on_it(client, as_manager):
    pending = _create(client, as_manager, _pending_payload())["student"]["id"]
    addressed = _create(client, as_manager)["student"]["id"]

    rows = client.get(
        "/api/v1/students", params={"invite_state": "no_contact"}, headers=as_manager.headers
    ).json()["items"]
    ids = {row["id"] for row in rows}
    assert pending in ids
    assert addressed not in ids
    assert next(row for row in rows if row["id"] == pending)["guardian_invite_state"] == (
        "no_contact"
    )

    no_email = client.get(
        "/api/v1/students", params={"invite_state": "no_email"}, headers=as_manager.headers
    ).json()["items"]
    assert pending not in {row["id"] for row in no_email}


def test_the_parent_added_later_is_the_primary_guardian(client, app_session, as_manager):
    """The manager's "add the parent" is `POST /guardians` with the schema's default
    `is_primary=False`. Left as asked, the child would have a guardian and no primary --
    billing would still find no payer and the coach hand-over would still refuse."""
    student_id = _create(client, as_manager, _pending_payload())["student"]["id"]
    response = client.post(
        f"/api/v1/students/{student_id}/guardians",
        json={"first_name": "אמא", "phone": "050-555-0101"},
        headers=as_manager.headers,
    )
    assert response.status_code == 201, response.text
    [guardian] = response.json()["items"]
    assert guardian["is_primary"] is True

    row = client.get(
        "/api/v1/students", params={"invite_state": "no_email"}, headers=as_manager.headers
    ).json()["items"]
    assert student_id in {item["id"] for item in row}
