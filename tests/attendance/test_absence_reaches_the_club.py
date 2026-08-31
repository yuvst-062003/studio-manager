"""§5.7's other half: the club has to LEARN about an absence before the lesson.

Writing a row is not the same as telling anyone. These two tests pin the difference,
because they cover the path a parent actually cares about — they tapped "not coming", and
the question is whether the club finds out in time.

Owner request, 2026-09-01: validate both, rather than assume the write implies the telling.
"""

from __future__ import annotations

from datetime import timedelta

from app.models.comms import Notification
from app.schemas.attendance import AbsenceReportIn
from app.services.attendance.service import AttendanceService
from sqlalchemy import select
from tests.attendance.conftest import T0

#: The lesson is at T0. The parent reports an hour before it starts.
BEFORE = T0 - timedelta(hours=1)


def _report(session_id, student_id, reason=None) -> AbsenceReportIn:
    return AbsenceReportIn(student_id=student_id, session_id=session_id, reason=reason)


def test_the_absence_is_on_the_session_roster_before_the_lesson_starts(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """(2) A manager opening the session sees it, and sees it as EXCUSED.

    Read back through `session_roster` — the same call the staff app and the dashboard
    make — rather than by querying the tables, so this asserts what a manager is actually
    shown and not merely what was stored.
    """
    service = AttendanceService(tenant_session)
    service.report_absence(
        _report(a_session, an_enrolled_student, "מחלה"),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()

    roster = service.session_roster(a_session)
    row = next(r for r in roster.roster if r.student_id == an_enrolled_student)

    # The register already says absent-excused, so a coach opening the session on the mat
    # reads it without being told anything.
    assert row.status == "absent_excused"
    assert row.source == "parent"
    # And §10.5's flag is set, which is what stops `סמן הכל נוכח` overwriting it later.
    assert row.has_absence_report is True
    assert row.absence_reason == "מחלה"
    # Not confirmed — the two answers are mutually exclusive.
    assert row.has_confirmation is False


def test_a_manager_is_notified_with_the_reason(
    tenant_session, a_session, an_enrolled_student, as_guardian, as_manager
):
    """(3) A row on a roster nobody has opened is not the club knowing.

    The reason travels in the notification body because that is who it is FOR. It stays
    out of the audit diff and out of every log line — a parent's sentence about their
    child may name an illness.
    """
    AttendanceService(tenant_session).report_absence(
        _report(a_session, an_enrolled_student, "מחלה"),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()

    notes = (
        tenant_session.execute(
            select(Notification).where(Notification.kind == "attendance.absence_reported")
        )
        .scalars()
        .all()
    )
    assert [n.person_id for n in notes] == [as_manager.person_id]
    assert "מחלה" in notes[0].body
    assert notes[0].payload["session_id"] == str(a_session)
    assert notes[0].payload["student_id"] == str(an_enrolled_student)


def test_no_reason_still_notifies(
    tenant_session, a_session, an_enrolled_student, as_guardian, as_manager
):
    """A reason is optional (§5.7 — requiring one is friction at the worst moment), and a
    reasonless report must still reach the club. The body carries the child's name alone
    rather than a dangling separator."""
    AttendanceService(tenant_session).report_absence(
        _report(a_session, an_enrolled_student),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()

    note = (
        tenant_session.execute(
            select(Notification).where(Notification.kind == "attendance.absence_reported")
        )
        .scalars()
        .one()
    )
    assert note.person_id == as_manager.person_id
    assert "—" not in note.body


def test_a_manager_reporting_on_a_familys_behalf_is_not_told_about_it(
    tenant_session, a_session, an_enrolled_student, as_manager
):
    """The office takes the phone call and files it. Telling them what they just did is
    noise in the one inbox that has to stay worth reading."""
    AttendanceService(tenant_session).report_absence(
        _report(a_session, an_enrolled_student, "חופשה"),
        reporter_person_id=as_manager.person_id,
        # None is the staff arm: a manager may report on anyone's behalf.
        guardian_student_ids=None,
        at=BEFORE,
    )
    tenant_session.commit()

    notes = (
        tenant_session.execute(
            select(Notification).where(Notification.kind == "attendance.absence_reported")
        )
        .scalars()
        .all()
    )
    assert notes == []
