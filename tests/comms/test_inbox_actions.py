"""Whether a notice is still WAITING, which is not whether it has been read.

Screen 7 of the parent redesign replaced the inbox's organising axis. `read_at` was the
only thing the screen had, and it is wrong in both directions:

* A parent who signs a declaration from §6.1's gate never opens the notice, so it stays
  unread and the inbox keeps demanding something already done.
* A parent who opens the notice and presses `אחר כך` marks it read, so the demand
  disappears while the obligation stands.

So the axis is **outstanding vs done**, resolved against the record that actually settles
it -- `student.health_status`, the payer's balance, the RSVP row, the trial's outcome --
and `read_at` is demoted to the `חדש` mark on notices that ask for nothing.

The test that matters most in this file is
`test_reading_a_notice_settles_nothing`: it is the whole argument, and the shipped screen
failed it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from app.models.billing import Charge
from app.models.comms import Notification
from app.models.events import Event, EventRegistration
from app.models.health import HealthDeclaration, HealthFormTemplate
from app.models.people import Student
from sqlalchemy import select
from tests.comms.conftest import T0

SIGNED_AT = T0 - timedelta(days=2)


def _notify(app_session, studio, person_id: uuid.UUID, kind: str, payload: dict[str, Any]):
    row = Notification(
        studio_id=studio.id,
        person_id=person_id,
        kind=kind,
        title="כותרת",
        body="גוף",
        payload=payload,
        created_at=T0 - timedelta(days=5),
    )
    app_session.add(row)
    app_session.commit()
    return row


def _sign_declaration(app_session, studio, student_id: uuid.UUID, person_id: uuid.UUID, at):
    template = (
        app_session.execute(
            select(HealthFormTemplate).where(HealthFormTemplate.kind == "full").limit(1)
        )
        .scalars()
        .first()
    )
    if template is None:
        template = HealthFormTemplate(studio_id=studio.id, kind="full", version=1, schema={})
        app_session.add(template)
        app_session.flush()
    # ONE row per child — `uq_health_declaration_student_id`. A renewal replaces the
    # signature it is chasing rather than adding a second one, which is exactly why the
    # renewal resolver compares dates instead of counting rows.
    existing = (
        app_session.execute(
            select(HealthDeclaration).where(HealthDeclaration.student_id == student_id)
        )
        .scalars()
        .first()
    )
    if existing is not None:
        existing.signed_at = at
    else:
        app_session.add(
            HealthDeclaration(
                studio_id=studio.id,
                student_id=student_id,
                template_id=template.id,
                template_version=1,
                answers_encrypted={"q1": True},
                derived_flags={},
                signed_by_person_id=person_id,
                signed_at=at,
            )
        )
    student = app_session.get(Student, student_id)
    student.health_status = "signed"
    app_session.commit()


def _inbox(client, caller):
    response = client.get("/api/v1/notifications", headers=caller.headers)
    assert response.status_code == 200
    return response.json()["items"]


def _only(items, kind: str) -> dict[str, Any]:
    rows = [row for row in items if row["kind"] == kind]
    assert len(rows) == 1, f"expected exactly one {kind}, got {len(rows)}"
    return rows[0]


# -- the axis ------------------------------------------------------------------


def test_a_missing_declaration_is_outstanding_and_names_its_child(
    client, app_session, studio, as_guardian_of, a_student
):
    """The card has to say WHICH child. Two children owing the same thing produced two
    identical cards on the shipped screen, and a parent could not tell them apart."""
    caller = as_guardian_of(a_student)
    _notify(
        app_session,
        studio,
        caller.person_id,
        "health.declaration_missing",
        {"student_id": str(a_student), "day": 3},
    )

    row = _only(_inbox(client, caller), "health.declaration_missing")

    assert row["action"] is not None
    assert row["action"]["kind"] == "health_declaration"
    assert row["action"]["outstanding"] is True
    assert row["action"]["subject_name"] == "דנה"


def test_a_signed_declaration_settles_its_notice(
    client, app_session, studio, as_guardian_of, a_student
):
    caller = as_guardian_of(a_student)
    _notify(
        app_session,
        studio,
        caller.person_id,
        "health.declaration_missing",
        {"student_id": str(a_student), "day": 3},
    )
    _sign_declaration(app_session, studio, a_student, caller.person_id, SIGNED_AT)

    row = _only(_inbox(client, caller), "health.declaration_missing")

    assert row["action"]["outstanding"] is False
    assert row["action"]["settled_at"] is not None


def test_reading_a_notice_settles_nothing(client, app_session, studio, as_guardian_of, a_student):
    """The axis, in one test.

    Opening a notice marks it read. It does not sign anything, so the club is still
    waiting -- and the screen must still say so."""
    caller = as_guardian_of(a_student)
    note = _notify(
        app_session,
        studio,
        caller.person_id,
        "health.declaration_missing",
        {"student_id": str(a_student), "day": 3},
    )

    read = client.post(f"/api/v1/notifications/{note.id}/read", headers=caller.headers)
    assert read.status_code == 200
    assert read.json()["read_at"] is not None
    assert read.json()["action"]["outstanding"] is True

    row = _only(_inbox(client, caller), "health.declaration_missing")
    assert row["read_at"] is not None
    assert row["action"]["outstanding"] is True


def test_an_unread_notice_can_already_be_done(
    client, app_session, studio, as_guardian_of, a_student
):
    """The other direction. The parent signed from the gate and never opened the inbox."""
    caller = as_guardian_of(a_student)
    _notify(
        app_session,
        studio,
        caller.person_id,
        "health.declaration_missing",
        {"student_id": str(a_student), "day": 1},
    )
    _sign_declaration(app_session, studio, a_student, caller.person_id, SIGNED_AT)

    row = _only(_inbox(client, caller), "health.declaration_missing")

    assert row["read_at"] is None
    assert row["action"]["outstanding"] is False


# -- the other four kinds that ask for something -------------------------------


def test_a_renewal_is_settled_only_by_a_signature_that_came_after_it(
    client, app_session, studio, as_guardian_of, a_student
):
    """A renewal notice cannot be settled by the OLD signature it is chasing a replacement
    for. `health_status` stays `signed` throughout, so the only honest test is the date."""
    caller = as_guardian_of(a_student)
    _sign_declaration(app_session, studio, a_student, caller.person_id, T0 - timedelta(days=400))
    _notify(
        app_session,
        studio,
        caller.person_id,
        "health.declaration_renewal",
        {"student_id": str(a_student), "validity_months": 12},
    )

    row = _only(_inbox(client, caller), "health.declaration_renewal")
    assert row["action"]["kind"] == "health_renewal"
    assert row["action"]["outstanding"] is True

    _sign_declaration(app_session, studio, a_student, caller.person_id, T0)

    row = _only(_inbox(client, caller), "health.declaration_renewal")
    assert row["action"]["outstanding"] is False


def test_a_payment_reminder_follows_the_balance(
    client, app_session, studio, as_guardian_of, a_student
):
    caller = as_guardian_of(a_student)
    charge = Charge(
        studio_id=studio.id,
        payer_person_id=caller.person_id,
        student_id=a_student,
        kind="tuition",
        amount_agorot=25000,
        status="open",
        period_year=T0.year,
        period_month=T0.month,
        due_date=T0.date(),
        created_by="manual",
    )
    app_session.add(charge)
    app_session.commit()
    _notify(app_session, studio, caller.person_id, "billing.reminder", {})

    row = _only(_inbox(client, caller), "billing.reminder")
    assert row["action"]["kind"] == "payment"
    assert row["action"]["outstanding"] is True

    charge.status = "void"
    app_session.commit()

    row = _only(_inbox(client, caller), "billing.reminder")
    assert row["action"]["outstanding"] is False


def test_an_rsvp_reminder_is_settled_by_answering(
    client, app_session, studio, as_guardian_of, a_student
):
    caller = as_guardian_of(a_student)
    event = Event(
        studio_id=studio.id,
        title="מבחן חגורות קיץ",
        type="belt_exam",
        starts_at=T0 + timedelta(days=10),
        ends_at=T0 + timedelta(days=10, hours=2),
    )
    app_session.add(event)
    app_session.flush()
    registration = EventRegistration(
        studio_id=studio.id, event_id=event.id, student_id=a_student, rsvp="pending"
    )
    app_session.add(registration)
    app_session.commit()
    _notify(
        app_session,
        studio,
        caller.person_id,
        "event.rsvp_reminder",
        {"event_id": str(event.id)},
    )

    row = _only(_inbox(client, caller), "event.rsvp_reminder")
    assert row["action"]["kind"] == "event_rsvp"
    assert row["action"]["outstanding"] is True

    registration.rsvp = "yes"
    registration.responded_at = datetime.now(UTC)
    app_session.commit()

    row = _only(_inbox(client, caller), "event.rsvp_reminder")
    assert row["action"]["outstanding"] is False
    assert row["action"]["settled_at"] is not None


# -- the notices that ask for nothing ------------------------------------------


@pytest.mark.parametrize("kind", ["announcement.published", "health.injury", "trial.no_show"])
def test_a_notice_that_asks_for_nothing_carries_no_action(
    client, app_session, studio, as_guardian_of, a_student, kind
):
    """`trial.no_show` is in this list deliberately, and the worker says why: offering a
    family who did not come a join button is the same mistake as asking them how it was."""
    caller = as_guardian_of(a_student)
    _notify(app_session, studio, caller.person_id, kind, {})

    assert _only(_inbox(client, caller), kind)["action"] is None
