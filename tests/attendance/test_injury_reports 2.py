"""`9g`'s injury report (S2) — to the manager and the guardians immediately.

The description travels in the notification, which is FOR those readers; the audit diff
carries none of it. That negative is asserted here because it is the sort of promise that
silently erodes: one convenient `diff={"description": ...}` later and a child's injury is
in a table §11.2 gives a wider audience than the notification has.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.audit import AuditLog
from app.models.comms import Notification
from app.models.person import Guardian, Person
from app.services.attendance.errors import NotFoundError
from app.services.attendance.service import AttendanceService
from sqlalchemy import select


@pytest.fixture
def a_guardian_of_the_student(app_session, studio, an_enrolled_student) -> uuid.UUID:
    person = Person(studio_id=studio.id, first_name="הורה", last_name="בודק")
    app_session.add(person)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=an_enrolled_student,
            person_id=person.id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()
    return person.id


def test_the_report_reaches_guardians_and_managers_and_never_the_audit_diff(
    tenant_session,
    a_session,
    an_enrolled_student,
    a_guardian_of_the_student,
    as_manager,
    as_lead_coach,
):
    notified = AttendanceService(tenant_session).report_injury(
        a_session,
        student_id=an_enrolled_student,
        description="נחבל בכתף במהלך תרגיל",
        actor_person_id=as_lead_coach.person_id,
    )
    tenant_session.commit()

    rows = tenant_session.execute(select(Notification)).scalars().all()
    recipients = {row.person_id for row in rows}
    assert a_guardian_of_the_student in recipients
    assert as_manager.person_id in recipients
    # The reporting coach is not told what they just typed.
    assert as_lead_coach.person_id not in recipients
    assert notified == len(recipients)
    assert all(row.kind == "health.injury" for row in rows)
    assert all("נחבל בכתף" in row.body for row in rows)

    audit = (
        tenant_session.execute(
            select(AuditLog).where(
                AuditLog.action == "attendance.injury_reported",
                AuditLog.entity_id == an_enrolled_student,
            )
        )
        .scalars()
        .one()
    )
    assert audit.diff is not None
    assert "description" not in audit.diff
    assert "נחבל" not in str(audit.diff)
    assert audit.diff["notified"] == notified


def test_an_unknown_student_is_refused(tenant_session, a_session, as_lead_coach):
    with pytest.raises(NotFoundError):
        AttendanceService(tenant_session).report_injury(
            a_session,
            student_id=uuid.uuid4(),
            description="x",
            actor_person_id=as_lead_coach.person_id,
        )


def test_the_route_is_staff_only_and_round_trips(
    client, a_session, an_enrolled_student, as_lead_coach, as_guardian, as_manager
):
    denied = client.post(
        f"/api/v1/sessions/{a_session}/injury-reports",
        json={"student_id": str(an_enrolled_student), "description": "נפל"},
        headers=as_guardian.headers,
    )
    assert denied.status_code == 403

    response = client.post(
        f"/api/v1/sessions/{a_session}/injury-reports",
        json={"student_id": str(an_enrolled_student), "description": "נפל"},
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 201
    assert response.json()["notified"] >= 1
