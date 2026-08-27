"""F7a -- the reminder service behind the four dead buttons.

The three rules are the tests: quiet hours refuse, the rate limit skips, and debt goes
to the payer -- one message per household, never one per child.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.models.comms import Notification
from app.models.events import Event, EventRegistration
from app.models.person import Person
from app.models.schedule import SessionStaff
from app.services.comms.reminders import (
    COACH_KIND,
    DEBT_KIND,
    EVENT_KIND,
    NotFoundError,
    QuietHoursError,
    ReminderService,
    in_quiet_hours,
)
from sqlalchemy import select
from tests.comms.conftest import T0

#: 11:00 Jerusalem -- comfortably inside sending hours.
DAYTIME = T0


def _payer(app_session, studio) -> uuid.UUID:
    person = Person(studio_id=studio.id, first_name="משלם", last_name="בודק")
    app_session.add(person)
    app_session.commit()
    return person.id


def test_quiet_hours_cover_the_evening_and_the_night():
    # 21:30 Jerusalem in November is 19:30Z; 07:00 Jerusalem is 05:00Z.
    assert in_quiet_hours(datetime(2026, 11, 12, 19, 30, tzinfo=UTC))
    assert in_quiet_hours(datetime(2026, 11, 12, 5, 0, tzinfo=UTC))
    assert not in_quiet_hours(DAYTIME)


def test_a_debt_reminder_after_2100_is_refused(tenant_session, app_session, studio):
    payer = _payer(app_session, studio)
    with pytest.raises(QuietHoursError):
        ReminderService(tenant_session).remind_debt(
            [payer],
            actor_person_id=None,
            at=datetime(2026, 11, 12, 19, 30, tzinfo=UTC),
        )


def test_debt_goes_to_the_payer_once_and_the_rate_limit_holds(tenant_session, app_session, studio):
    payer_a = _payer(app_session, studio)
    payer_b = _payer(app_session, studio)
    service = ReminderService(tenant_session)

    first = service.remind_debt([payer_a, payer_b], actor_person_id=None, at=DAYTIME)
    tenant_session.commit()
    assert first == {"sent": 2, "skipped_recent": 0}

    rows = (
        tenant_session.execute(select(Notification).where(Notification.kind == DEBT_KIND))
        .scalars()
        .all()
    )
    assert {row.person_id for row in rows} == {payer_a, payer_b}

    # Pressing again an hour later reminds nobody twice.
    second = service.remind_debt([payer_a, payer_b], actor_person_id=None, at=DAYTIME)
    tenant_session.commit()
    assert second == {"sent": 0, "skipped_recent": 2}


def test_the_coach_reminder_reaches_the_session_staff(
    tenant_session, app_session, studio, a_session
):
    coach = _payer(app_session, studio)
    app_session.add(
        SessionStaff(
            studio_id=studio.id,
            session_id=a_session,
            person_id=coach,
            role="lead_coach",
            is_substitute=False,
        )
    )
    app_session.commit()

    result = ReminderService(tenant_session).remind_coach(
        a_session, actor_person_id=None, at=DAYTIME
    )
    tenant_session.commit()
    assert result["sent"] == 1
    row = (
        tenant_session.execute(select(Notification).where(Notification.kind == COACH_KIND))
        .scalars()
        .one()
    )
    assert row.person_id == coach
    assert row.payload["session_id"] == str(a_session)


def test_a_session_with_no_coach_is_a_refusal_not_a_silent_success(tenant_session, a_session):
    with pytest.raises(NotFoundError):
        ReminderService(tenant_session).remind_coach(a_session, actor_person_id=None, at=DAYTIME)


def test_event_non_responders_one_message_per_guardian(
    tenant_session, app_session, studio, a_student, a_guardian_for
):
    guardian = a_guardian_for(a_student)
    event = Event(
        studio_id=studio.id,
        title="תחרות אביב",
        type="competition",
        starts_at=DAYTIME,
        ends_at=DAYTIME + timedelta(hours=2),
        status="published",
    )
    app_session.add(event)
    app_session.flush()
    app_session.add(
        EventRegistration(
            studio_id=studio.id, event_id=event.id, student_id=a_student, rsvp="pending"
        )
    )
    app_session.commit()

    result = ReminderService(tenant_session).remind_event_non_responders(
        event.id, actor_person_id=None, at=DAYTIME
    )
    tenant_session.commit()
    assert result["sent"] == 1
    row = (
        tenant_session.execute(select(Notification).where(Notification.kind == EVENT_KIND))
        .scalars()
        .one()
    )
    assert row.person_id == guardian


def test_the_routes_are_manager_only(client, as_lead_coach, as_manager, app_session, studio):
    payer = _payer(app_session, studio)
    body = {"payer_person_ids": [str(payer)]}
    refused = client.post("/api/v1/reminders/debt", json=body, headers=as_lead_coach.headers)
    assert refused.status_code == 403
    allowed = client.post("/api/v1/reminders/debt", json=body, headers=as_manager.headers)
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["sent"] == 1
