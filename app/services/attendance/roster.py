"""§5.7's roster: who is expected at this session, and what has been said about them.

**Two axes, not five states.** §5.7 is explicit that "who is expected" and "what somebody
said" are independent: the four attendance states record the second, and
`enrollment.attends_weekdays` records the first. A student enrolled in a twice-weekly group
who comes once is not `absent_unexcused` every week forever -- they are simply not expected
on the other day, and C12 is the conflict where that was settled. So `RosterRowRaw` carries
`expected` beside `status`, and §5.14's denominators read the first while §5.7's marks read
the second.

**One query per fact, and no writes.** This runs on `GET /sessions/{id}/attendance` and
inside §6.1's bootstrap payload, so it must not have side effects.
`app/services/people/group_days.training_weekdays` is the obvious way to learn which
weekdays a group trains -- and it is the wrong one here, because it reaches
`ScheduleService.materialize_sessions`, which **creates rows**. A coach opening a roster
must not materialize a term's sessions. This module answers the narrower question directly:
this session exists, so its own weekday is by construction a day the group trains, and
`is_expected` intersected against that single day is exactly C12's rule for one session.

**The W3 seam is two stored columns.** `student.health_status` and
`health_declaration.derived_flags` are M4's to populate and this lane's to render (plan
§1.3 seam 4). They are read here rather than recomputed because
`HealthService.recompute_derived_flags` is the *re-derivation* entry point -- what M4 runs
after a manager rewords a question -- and putting a derivation inside a coach's GET would
make the roster fail when the derivation does. M4 populates; M5 renders.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.models.attendance import AbsenceReport, Attendance
from app.models.health import HealthDeclaration
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.models.schedule import Session as SessionRow
from app.services.attendance.errors import NotFoundError
from app.services.people.attendance_pattern import is_expected
from app.services.people.group_days import studio_weekday

#: §5.4 -- a `pending` enrollment is a registration request nobody has approved yet, and a
#: coach marking a child the club has not accepted is a record of a decision that was never
#: made. `frozen` is out for the same reason §5.10 says a frozen student generates nothing:
#: they are not training.
LIVE_ENROLLMENT_STATUSES = ("active",)


@dataclass(frozen=True)
class RosterRowRaw:
    """One student on a coach's roster, before projection into `RosterEntry`.

    **No financial field, and no room for one** (SPEC §13 invariant 3). The roster is the
    most coach-reachable payload in the product, so the shape itself is the guard.

    **No `blocked` field either** (§5.5). Nothing on the mat is ever blocked by a missing
    health declaration; the row carries the ⚠ and the coach can still mark the student
    present. There is deliberately no `block_attendance_without_health` setting, and a
    shape with nowhere to put one is the cheapest way to keep it that way.
    """

    student_id: uuid.UUID
    display_name: str
    #: -- the W3 seam (plan §1.3 seam 4) -----------------------------------------
    health_status: str
    derived_flags: dict[str, bool]
    #: -- the current mark --------------------------------------------------------
    status: str
    source: str | None
    #: §10.5 -- a bulk action must not overwrite this, regardless of timestamps.
    has_absence_report: bool
    absence_reason: str | None
    #: §5.7 / C12 -- on the roster proper, or beneath it in `לא אמורים להגיע היום`.
    expected: bool
    #: W7's `belt_rank` fills these. `None` until then, which `BeltBar` renders as its
    #: neutral bar rather than as a missing element.
    belt_color_hex: str | None = None
    belt_name: str | None = None


def require_session(session: OrmSession, session_id: uuid.UUID) -> SessionRow:
    """The session, or `NotFoundError`.

    The tenant filter makes another studio's row invisible, so "not in this studio" and
    "does not exist" are the same answer here on purpose -- a 403 would confirm another
    club's lesson is real.
    """
    row = session.get(SessionRow, session_id)
    if row is None:
        raise NotFoundError(str(session_id))
    return row


def build_roster(
    session: OrmSession, session_id: uuid.UUID
) -> tuple[SessionRow, list[RosterRowRaw]]:
    """The session and everyone on its roster, in one pass.

    The session comes back with the rows because §6.1 makes first launch block on the
    bootstrap payload: a header that needed a second query is a header that is blank in a
    basement, which is the one place this screen actually matters.
    """
    session_row = require_session(session, session_id)
    on_date = session_row.starts_at.date()
    weekday = studio_weekday(session_row.starts_at)

    enrollments = (
        session.execute(
            select(Enrollment, Student, Person)
            .join(Student, Student.id == Enrollment.student_id)
            .join(Person, Person.id == Student.person_id)
            .where(
                Enrollment.group_id == session_row.group_id,
                Enrollment.status.in_(LIVE_ENROLLMENT_STATUSES),
                Enrollment.started_on <= on_date,
                # `ended_on` is inclusive: a student whose last day is today trains today.
                # Read rather than waiting for the nightly job that flips `status`, because
                # the date is what the manager typed and the status is a derived echo.
                (Enrollment.ended_on.is_(None)) | (Enrollment.ended_on >= on_date),
            )
        )
        .tuples()
        .all()
    )
    if not enrollments:
        return session_row, []

    student_ids = [student.id for _, student, _ in enrollments]

    marks = {
        row.student_id: row
        for row in session.execute(
            select(Attendance).where(
                Attendance.session_id == session_id,
                Attendance.student_id.in_(student_ids),
            )
        )
        .scalars()
        .all()
    }
    reports = {
        row.student_id: row
        for row in session.execute(
            select(AbsenceReport).where(
                AbsenceReport.session_id == session_id,
                AbsenceReport.student_id.in_(student_ids),
            )
        )
        .scalars()
        .all()
    }
    # The seam's second half. One query for the whole roster rather than one per student:
    # a coach's roster is thirty children and a per-student call is thirty round trips
    # inside a payload §6.1 makes the app block on.
    flags = {
        student_id: derived
        for student_id, derived in session.execute(
            select(HealthDeclaration.student_id, HealthDeclaration.derived_flags).where(
                HealthDeclaration.student_id.in_(student_ids)
            )
        ).tuples()
    }

    rows = [
        _row(
            enrollment=enrollment,
            student=student,
            person=person,
            weekday=weekday,
            mark=marks.get(student.id),
            report=reports.get(student.id),
            derived_flags=flags.get(student.id) or {},
        )
        for enrollment, student, person in enrollments
    ]
    # Sorted by name so a coach scanning thirty rows reads the same order every session.
    # Not by enrollment date, which is invisible on the mat.
    rows.sort(key=lambda row: row.display_name)
    return session_row, rows


def _row(
    *,
    enrollment: Enrollment,
    student: Student,
    person: Person,
    weekday: int,
    mark: Attendance | None,
    report: AbsenceReport | None,
    derived_flags: dict[str, bool],
) -> RosterRowRaw:
    return RosterRowRaw(
        student_id=student.id,
        display_name=f"{person.first_name} {person.last_name}",
        health_status=student.health_status,
        derived_flags=derived_flags,
        # §5.14 -- no stored row means `unmarked`, which is a real answer ("nobody has
        # said anything") and never an inferred absence.
        status=mark.status if mark is not None else "unmarked",
        source=mark.source if mark is not None else None,
        has_absence_report=report is not None,
        absence_reason=report.reason if report is not None else None,
        # This session exists, so its weekday is a day the group trains. Passing that one
        # day as the group's scheduled set is C12's intersection applied to one session --
        # see the module docstring for why the general helper is the wrong tool here.
        expected=is_expected(enrollment.attends_weekdays, (weekday,), weekday),
        belt_color_hex=None,
        belt_name=None,
    )
