"""§5.7's "הודיעו מראש" and §10.2's deadline, enforced on the server.

§10.2: "A parent's absence pre-report **requires a connection on purpose**: it is
time-critical and worthless if it lands after the lesson." The client half of that is
artboard `12a` refusing to queue; this is the half that makes the refusal true — a client
that checked the clock itself would let a device an hour behind file a pre-report for a
lesson already in progress.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from app.models.attendance import AbsenceReport, Attendance
from app.schemas.attendance import AbsenceReportIn
from app.services.attendance.errors import ForbiddenError, NotFoundError, PreconditionError
from app.services.attendance.service import AttendanceService
from sqlalchemy import select
from tests.attendance.conftest import T0
from tests.attendance.test_roster import _add_student

#: The lesson is at T0. A parent reporting an hour before is inside the deadline.
BEFORE = T0 - timedelta(hours=1)


def _report(session_id, student_id, reason=None) -> AbsenceReportIn:
    return AbsenceReportIn(student_id=student_id, session_id=session_id, reason=reason)


def test_a_guardian_reports_and_both_rows_are_written(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """§5.7 — 'This writes an `absence_report` AND sets the attendance row to
    `absent_excused` with `source = parent`.'

    Both, because they answer different questions: the report is the notice a manager can
    count, the attendance row is the register a coach reads. §10.5 protects the second from
    a bulk action by reading `source`, which it could not do from the first alone.
    """
    AttendanceService(tenant_session).report_absence(
        _report(a_session, an_enrolled_student, "מחלה"),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()

    report = tenant_session.execute(select(AbsenceReport)).scalars().one()
    assert report.reason == "מחלה"
    assert report.reported_by_person_id == as_guardian.person_id

    mark = tenant_session.execute(select(Attendance)).scalars().one()
    assert mark.status == "absent_excused"
    assert mark.source == "parent"
    assert mark.device_marked_at == BEFORE


def test_a_reason_is_optional(tenant_session, a_session, an_enrolled_student, as_guardian):
    """Artboard `12a`: `סיבה — לא חובה`. Requiring a reason to report a sick child is
    friction at the worst possible moment."""
    AttendanceService(tenant_session).report_absence(
        _report(a_session, an_enrolled_student),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()
    assert tenant_session.execute(select(AbsenceReport)).scalars().one().reason is None


def test_reporting_after_the_lesson_has_started_is_refused_with_a_reason(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """§10.2 — 'a pre-report that syncs after the class has started is not a pre-report.'
    Artboard `12a` renders `attendance.absence.tooLate` for this, and the code the error
    carries is what picks that key rather than a server-authored Hebrew sentence."""
    with pytest.raises(PreconditionError) as caught:
        AttendanceService(tenant_session).report_absence(
            _report(a_session, an_enrolled_student),
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids={an_enrolled_student},
            at=T0 + timedelta(minutes=1),
        )
    assert caught.value.code == "too_late"


def test_reporting_exactly_at_the_start_instant_is_refused(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """The boundary, decided rather than left to whichever comparison got typed: the
    deadline is `עד תחילת השיעור`, so the start instant itself is already too late."""
    with pytest.raises(PreconditionError) as caught:
        AttendanceService(tenant_session).report_absence(
            _report(a_session, an_enrolled_student),
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids={an_enrolled_student},
            at=T0,
        )
    assert caught.value.code == "too_late"


def test_a_second_report_for_the_same_lesson_is_refused(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """`absence_report` has a unique index on (student, session): a parent tapping twice is
    one absence. Caught before the insert so the client gets
    `attendance.absence.alreadyReported` rather than a constraint violation."""
    service = AttendanceService(tenant_session)
    service.report_absence(
        _report(a_session, an_enrolled_student),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()
    with pytest.raises(PreconditionError) as caught:
        service.report_absence(
            _report(a_session, an_enrolled_student),
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids={an_enrolled_student},
            at=BEFORE,
        )
    assert caught.value.code == "already_reported"


def test_a_guardian_cannot_report_for_a_child_who_is_not_theirs(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student, as_guardian
):
    """Not-found rather than forbidden: a 403 would confirm another family's child exists
    in this studio, which is the thing the tenant filter and §11 both spend effort hiding."""
    someone_elses = _add_student(app_session, studio, a_group, name="אחר")
    with pytest.raises(NotFoundError):
        AttendanceService(tenant_session).report_absence(
            _report(a_session, someone_elses),
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids={an_enrolled_student},
            at=BEFORE,
        )


def test_staff_may_report_on_anyones_behalf(
    tenant_session, a_session, an_enrolled_student, as_manager
):
    """`guardian_student_ids=None` is staff. The office takes the phone call when a parent
    has no app, and §5.11 permits no SMS fallback — so if the office cannot record it, the
    coach never sees `הודיעו מראש` and the child is marked absent unexcused."""
    AttendanceService(tenant_session).report_absence(
        _report(a_session, an_enrolled_student, "טלפון מההורה"),
        reporter_person_id=as_manager.person_id,
        guardian_student_ids=None,
        at=BEFORE,
    )
    tenant_session.commit()
    assert tenant_session.execute(select(Attendance)).scalars().one().source == "parent"


def test_a_report_against_another_studios_session_is_not_found(
    tenant_session, other_studio_session_id, an_enrolled_student, as_guardian
):
    with pytest.raises(NotFoundError):
        AttendanceService(tenant_session).report_absence(
            _report(other_studio_session_id, an_enrolled_student),
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids={an_enrolled_student},
            at=BEFORE,
        )


def test_cancelling_a_report_returns_the_row_to_unmarked_not_to_present(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """Artboard `12a`'s `ביטול הדיווח`. Nobody has been to the lesson yet, so the register
    goes back to "nobody has said anything" — §5.14's `unmarked`, not `present`. Marking
    them present would be the app inventing an attendance record."""
    service = AttendanceService(tenant_session)
    service.report_absence(
        _report(a_session, an_enrolled_student),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()
    service.cancel_absence_report(
        a_session,
        an_enrolled_student,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE + timedelta(minutes=5),
    )
    tenant_session.commit()

    assert tenant_session.execute(select(AbsenceReport)).scalars().all() == []
    assert tenant_session.execute(select(Attendance)).scalars().one().status == "unmarked"


def test_cancelling_after_a_coach_has_marked_the_session_is_refused(
    tenant_session, a_session, an_enrolled_student, as_guardian, as_lead_coach
):
    """The coach was on the mat and the parent was not. Withdrawing the notice must not
    erase what the register says happened."""
    from app.schemas.attendance import AttendanceIn, BatchAttendanceIn

    service = AttendanceService(tenant_session)
    service.report_absence(
        _report(a_session, an_enrolled_student),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()
    service.apply_batch(
        BatchAttendanceIn(
            session_id=a_session,
            marks=[
                AttendanceIn(
                    student_id=an_enrolled_student,
                    status="present",
                    client_mark_id=uuid.uuid4(),
                    device_marked_at=T0,
                )
            ],
        ),
        actor_person_id=as_lead_coach.person_id,
        at=T0,
    )
    tenant_session.commit()

    with pytest.raises(ForbiddenError):
        service.cancel_absence_report(
            a_session,
            an_enrolled_student,
            guardian_student_ids={an_enrolled_student},
            at=T0 + timedelta(minutes=5),
        )


def test_a_pre_report_leaves_the_roster_showing_the_notice(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """Artboards `1c` and `9f` render `attendance.source.preReported` from these two
    fields, and §10.5's bulk protection reads the first."""
    from app.services.attendance.roster import build_roster

    AttendanceService(tenant_session).report_absence(
        _report(a_session, an_enrolled_student, "חופשה"),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    tenant_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows[0].has_absence_report is True
    assert rows[0].absence_reason == "חופשה"
    assert rows[0].status == "absent_excused"
