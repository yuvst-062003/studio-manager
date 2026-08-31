"""A parent saying a child WILL be there — the third state a roster can now show.

Until 0020 the club knew one thing: that an absence had been reported. The ABSENCE of that
notice meant both "we are coming" and "nobody has looked at this", and a coach could not
tell them apart. These tests pin the difference, and pin the rule that a child is never
recorded as both.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from app.models.attendance import AbsenceReport, Attendance, AttendanceConfirmation
from app.schemas.attendance import AbsenceReportIn
from app.services.attendance.errors import ForbiddenError, NotFoundError, PreconditionError
from app.services.attendance.roster import build_roster
from app.services.attendance.service import AttendanceService
from sqlalchemy import select
from tests.attendance.conftest import T0

BEFORE = T0 - timedelta(hours=1)


def _row_for(tenant_session, session_id, student_id):
    _, rows = build_roster(tenant_session, session_id)
    return next(row for row in rows if row.student_id == student_id)


def test_confirming_writes_no_attendance_row(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """The whole reason this is not the mirror of `report_absence`.

    §5.14 needs `unmarked` to keep meaning "nobody has opened the register". A confirmation
    that pre-filled `present` would report a child as having trained when they never
    arrived — the one error a register must never make.
    """
    AttendanceService(tenant_session).confirm_attendance(
        a_session,
        an_enrolled_student,
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )

    assert tenant_session.execute(select(AttendanceConfirmation)).scalar_one() is not None
    assert tenant_session.execute(select(Attendance)).scalar_one_or_none() is None
    assert _row_for(tenant_session, a_session, an_enrolled_student).status == "unmarked"


def test_the_roster_tells_three_states_apart(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """Said yes, said no, and has not answered."""
    service = AttendanceService(tenant_session)

    silent = _row_for(tenant_session, a_session, an_enrolled_student)
    assert (silent.has_confirmation, silent.has_absence_report) == (False, False)

    service.confirm_attendance(
        a_session,
        an_enrolled_student,
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    said_yes = _row_for(tenant_session, a_session, an_enrolled_student)
    assert (said_yes.has_confirmation, said_yes.has_absence_report) == (True, False)

    service.report_absence(
        AbsenceReportIn(student_id=an_enrolled_student, session_id=a_session, reason=None),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    said_no = _row_for(tenant_session, a_session, an_enrolled_student)
    assert (said_no.has_confirmation, said_no.has_absence_report) == (False, True)


def test_a_child_is_never_both_coming_and_not_coming(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """Each answer withdraws the other, in both directions."""
    service = AttendanceService(tenant_session)
    service.report_absence(
        AbsenceReportIn(student_id=an_enrolled_student, session_id=a_session, reason="מחלה"),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    service.confirm_attendance(
        a_session,
        an_enrolled_student,
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )

    assert tenant_session.execute(select(AbsenceReport)).scalar_one_or_none() is None
    assert tenant_session.execute(select(AttendanceConfirmation)).scalar_one() is not None
    # The register goes back to `unmarked`, not to `present` — nobody has trained yet.
    mark = tenant_session.execute(select(Attendance)).scalar_one_or_none()
    assert mark is None or mark.status == "unmarked"


def test_confirming_twice_is_one_answer(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """A double-tapped button on a phone is not a conflict."""
    service = AttendanceService(tenant_session)
    first = service.confirm_attendance(
        a_session,
        an_enrolled_student,
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    second = service.confirm_attendance(
        a_session,
        an_enrolled_student,
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE + timedelta(minutes=5),
    )
    assert first.id == second.id
    assert len(tenant_session.execute(select(AttendanceConfirmation)).scalars().all()) == 1


def test_withdrawing_returns_to_having_said_nothing(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """Not the same as reporting an absence — that distinction is the point of the table."""
    service = AttendanceService(tenant_session)
    service.confirm_attendance(
        a_session,
        an_enrolled_student,
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    service.withdraw_confirmation(
        a_session,
        an_enrolled_student,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    row = _row_for(tenant_session, a_session, an_enrolled_student)
    assert (row.has_confirmation, row.has_absence_report) == (False, False)


def test_the_deadline_is_the_servers(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """§10.2's rule, applied to this answer too: after the lesson starts it is not a
    pre-report, and a device an hour behind does not get to say otherwise."""
    with pytest.raises(PreconditionError) as exc:
        AttendanceService(tenant_session).confirm_attendance(
            a_session,
            an_enrolled_student,
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids={an_enrolled_student},
            at=T0,
        )
    assert exc.value.code == "too_late"


def test_a_guardian_cannot_confirm_another_familys_child(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """Not-found rather than forbidden: a 403 would confirm the child exists.

    The guardian's own set is empty here, so the child they name is not theirs whatever
    its id -- which is the check, without needing a second student in the fixture.
    """
    with pytest.raises(NotFoundError):
        AttendanceService(tenant_session).confirm_attendance(
            a_session,
            an_enrolled_student,
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids=set(),
            at=BEFORE,
        )


def test_a_coachs_mark_is_not_erased_by_a_late_confirmation(
    tenant_session, a_session, an_enrolled_student, as_guardian
):
    """The coach was on the mat and the parent was not — same refusal as withdrawing a
    notice, because confirming performs that same unwind."""
    service = AttendanceService(tenant_session)
    service.report_absence(
        AbsenceReportIn(student_id=an_enrolled_student, session_id=a_session, reason=None),
        reporter_person_id=as_guardian.person_id,
        guardian_student_ids={an_enrolled_student},
        at=BEFORE,
    )
    mark = tenant_session.execute(select(Attendance)).scalar_one()
    mark.source = "coach"
    tenant_session.flush()

    with pytest.raises(ForbiddenError):
        service.confirm_attendance(
            a_session,
            an_enrolled_student,
            reporter_person_id=as_guardian.person_id,
            guardian_student_ids={an_enrolled_student},
            at=BEFORE,
        )
