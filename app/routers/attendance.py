"""SPEC §7's attendance block — the register, the flush and the parent's advance notice.

**Tagged `coach`, and that tag is load-bearing.** SPEC §13's third invariant — no
coach-scoped endpoint returns any financial field — is enforced against it by
`tests/invariants/test_03`, so an untagged coach router is an unguarded one. `RosterEntry`
carries no money and must never learn to; it is the most coach-reachable payload in the
product.

Three permission levels, and each is §3.2 or §5.7 verbatim:

* **reading a roster and writing marks** is any staff role. §3.2 gives an assistant coach
  "Mark attendance" outright — they are the person actually holding the phone on the mat.
* **the parent's pre-report** admits a guardian *and* staff. A guardian holds no
  `role_assignment` at all (§3.1), so the staff dependency would refuse them and artboard
  `12a` would not exist; the service narrows a guardian's write to their own children. Staff
  are admitted because the office takes the phone call from a parent who has no app, and
  §5.11 permits no SMS fallback — an unrecordable phone call is a child marked absent
  unexcused.
* **nothing here is manager-only.** §5.7's whole point is that the register belongs to
  whoever is on the mat.

G6 — the router parses, calls a service, and returns. Every rule in this vertical lives in
`app/services/attendance/`, because §10.5's conflict rules are reached from three different
entry points and three copies is three chances to get the exception wrong.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.models.person import Guardian
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.attendance import (
    AbsenceReportIn,
    AbsenceReportOut,
    AttendanceOut,
    AttendancePage,
    AttendanceReportOut,
    BatchAttendanceIn,
    BulkPresentIn,
    InjuryReportIn,
    InjuryReportOut,
    SessionRosterOut,
)
from app.services.attendance.errors import ForbiddenError, NotFoundError, PreconditionError
from app.services.attendance.report import BadRangeError, build_report
from app.services.attendance.schemas import BatchResult
from app.services.attendance.service import AttendanceService

router = APIRouter(tags=["coach", "attendance"])

STAFF_ROLES = {"owner", "manager", "lead_coach", "assistant_coach"}


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such record"},
    )


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "unauthenticated", "message": "sign in first"},
    )


def _person_id(request: Request) -> uuid.UUID | None:
    person_id = getattr(request.state, "person_id", None)
    return person_id if isinstance(person_id, uuid.UUID) else None


def _require_person(request: Request) -> uuid.UUID:
    """A mark is attributed to whoever made it (§10.3), so this vertical has no anonymous
    write. A signed-in identity with no `person` row in the active studio is a real state —
    a platform admin, for instance — and it cannot mark a register."""
    person_id = _person_id(request)
    if person_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "a mark needs an author"},
        )
    return person_id


def _signed_in(request: Request) -> None:
    if getattr(request.state, "identity_id", None) is None:
        raise _unauthenticated()


SignedIn = Annotated[None, Depends(_signed_in)]


def _guardian_student_ids(request: Request, session: TenantSessionDep) -> set[uuid.UUID] | None:
    """`None` for staff — they may report on anyone's behalf. A set for a guardian.

    An **empty** set is a real answer, not a missing one: a signed-in parent whose children
    are not enrolled anywhere may report for nobody, and returning `None` for them would
    hand them the whole club. That is why the type is `set | None` and not just `set`, the
    same distinction `app/routers/sessions.py` draws for the calendar.
    """
    roles = set(getattr(request.state, "roles", ()) or ())
    if roles & STAFF_ROLES:
        return None
    person_id = _person_id(request)
    if person_id is None:
        raise _unauthenticated()
    return set(
        session.execute(select(Guardian.student_id).where(Guardian.person_id == person_id))
        .scalars()
        .all()
    )


def _precondition(exc: PreconditionError) -> HTTPException:
    """409, carrying the CODE and not a sentence.

    Artboard `12a` renders `attendance.absence.tooLate` and `.alreadyReported` from these
    two codes. A server-authored Hebrew message would be a string §9 cannot reach, in the
    one place a parent is being told why their child's absence was not recorded.
    """
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/sessions/{session_id}/attendance", response_model=SessionRosterOut)
def get_session_roster(
    _: AnyStaff, session_id: uuid.UUID, session: TenantSessionDep
) -> SessionRosterOut:
    """Artboards `1c` and `9f`. §3.2 gives every staff role the register."""
    try:
        return AttendanceService(session).session_roster(session_id)
    except NotFoundError as exc:
        raise _not_found() from exc


@router.post("/attendance/batch", response_model=BatchResult)
def apply_batch(
    _: AnyStaff,
    body: BatchAttendanceIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> BatchResult:
    """§7's `POST /attendance/batch  (idempotent)` — the offline queue drains here.

    **200 and not 201**, even when rows are created: the queue replays this request, and a
    client that treated 201 as "new work happened" would raise a fresh toast on every
    reconnect for marks it made three hours ago.

    Idempotency is per *mark* on `client_mark_id`, not per request. `Idempotency-Key` is
    accepted for consistency with the rest of the API and is not what makes this safe — a
    request-level key would make the second attempt a no-op that silently dropped the marks
    the first attempt never delivered.
    """
    try:
        result = AttendanceService(session).apply_batch(
            body, actor_person_id=_require_person(request), at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return result


@router.post("/sessions/{session_id}/attendance/bulk-present", response_model=BatchResult)
def bulk_present(
    _: AnyStaff,
    session_id: uuid.UUID,
    body: BulkPresentIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> BatchResult:
    """§5.7's `סמן הכל נוכח`.

    It never overwrites a parent's advance notice, whatever the request body says — see
    `AttendanceService._bulk_touches`. Artboards `9f` and `1e` both draw a button that does,
    and `attendance.source.preReportedHint` already ships the copy saying it does not.
    """
    try:
        result = AttendanceService(session).bulk_present(
            session_id, body, actor_person_id=_require_person(request), at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return result


@router.post(
    "/absence-reports", response_model=AbsenceReportOut, status_code=status.HTTP_201_CREATED
)
def report_absence(
    _: SignedIn,
    body: AbsenceReportIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> AbsenceReportOut:
    """§5.7's "לא אגיע היום".

    **Deliberately not queueable** (§10.2): "a parent's absence pre-report requires a
    connection on purpose — it is time-critical and worthless if it lands after the lesson.
    The app says so rather than queuing it into the void." The deadline is checked against
    the *server's* clock, because a device an hour behind would otherwise file a pre-report
    for a lesson already in progress.
    """
    reporter = _require_person(request)
    try:
        report = AttendanceService(session).report_absence(
            body,
            reporter_person_id=reporter,
            guardian_student_ids=_guardian_student_ids(request, session),
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except PreconditionError as exc:
        raise _precondition(exc) from exc
    session.commit()
    return AbsenceReportOut.model_validate(report, from_attributes=True)


@router.post(
    "/sessions/{session_id}/injury-reports",
    response_model=InjuryReportOut,
    status_code=status.HTTP_201_CREATED,
)
def report_injury(
    _: AnyStaff,
    session_id: uuid.UUID,
    body: InjuryReportIn,
    request: Request,
    session: TenantSessionDep,
) -> InjuryReportOut:
    """`9g` (S2) -- the injury report that goes to the manager and the parents NOW.

    Online-only on purpose, the mirror of the parent's absence pre-report: a report that
    syncs after everyone has gone home is not a report. Not queued, not idempotent -- a
    coach pressing twice sends twice, and two messages about a hurt child beat zero.
    """
    try:
        notified = AttendanceService(session).report_injury(
            session_id,
            student_id=body.student_id,
            description=body.description,
            actor_person_id=_require_person(request),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return InjuryReportOut(notified=notified)


@router.delete("/absence-reports/{session_id}/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_absence_report(
    _: SignedIn,
    session_id: uuid.UUID,
    student_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> None:
    """Artboard `12a`'s `ביטול הדיווח`.

    Keyed on (session, student) rather than on the report's own id, because that pair is
    what the parent app has: it renders the notice from the roster, which carries
    `has_absence_report` and not a report id.
    """
    _require_person(request)
    try:
        AttendanceService(session).cancel_absence_report(
            session_id,
            student_id,
            guardian_student_ids=_guardian_student_ids(request, session),
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except ForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_marked", "message": str(exc)},
        ) from exc
    session.commit()


@router.put(
    "/attendance-confirmations/{session_id}/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def confirm_attendance(
    _: SignedIn,
    session_id: uuid.UUID,
    student_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> None:
    """A parent saying the child WILL be there.

    PUT, not POST: the answer is one row per (session, student) and a parent double-tapping
    a button on a phone must not be a 409. Keyed on the same pair as its absence
    counterpart, and for the same reason -- the parent app renders from the roster, which
    carries flags and not row ids.
    """
    person_id = _require_person(request)
    try:
        AttendanceService(session).confirm_attendance(
            session_id,
            student_id,
            reporter_person_id=person_id,
            guardian_student_ids=_guardian_student_ids(request, session),
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except PreconditionError as exc:
        # The same 409-with-a-code the absence path uses, so `attendance.absence.tooLate`
        # renders here too rather than the app needing a second refusal vocabulary.
        raise _precondition(exc) from exc
    except ForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_marked", "message": str(exc)},
        ) from exc
    session.commit()


@router.delete(
    "/attendance-confirmations/{session_id}/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def withdraw_confirmation(
    _: SignedIn,
    session_id: uuid.UUID,
    student_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> None:
    """Back to having said nothing -- which is NOT the same as reporting an absence."""
    _require_person(request)
    try:
        AttendanceService(session).withdraw_confirmation(
            session_id,
            student_id,
            guardian_student_ids=_guardian_student_ids(request, session),
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()


@router.get("/attendance/report", response_model=AttendanceReportOut)
def attendance_report(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> AttendanceReportOut:
    """Artboard `4c` — the sessions nobody signed, and how each group is doing, in the
    manager's own window.

    **Not `/sync/bootstrap`, which is what this screen used to call.** That endpoint is
    §6.1's offline priming payload and clamps every window to §10.6's two days, so `4c` was
    asking for a week and rendering the two oldest days of it. The screen's date picker
    needed an endpoint that answers the range it is given; §10.6's bound stays where it
    belongs, on the phone's cache.

    **`ManagerOrOwner`, in a router tagged `coach`.** The tag is about §13's third invariant
    — it makes this response schema subject to the financial-field gate, which is a property
    worth having on any payload this file serves. The *permission* is a separate decision:
    this is a studio-wide number over every group, which §3.2 grants under `View all students
    in studio` and `Export data` to owner and manager only, and the CSV button sitting beside
    this data on `4c` is already `ManagerOrOwner`. A screen where half the controls 403 is
    worse than one a coach does not open. A coach's own view of attendance is the register
    itself, which every staff role still reaches through `GET /sessions/{id}/attendance`.

    422 on a bad range rather than an empty 200, and with the same bound the CSV export
    enforces — see `MAX_REPORT_DAYS`.
    """
    try:
        return build_report(session, from_date=from_date, to_date=to_date, now=now())
    except BadRangeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "bad_range", "message": str(exc)},
        ) from exc


@router.get("/students/{student_id}/attendance", response_model=AttendancePage)
def student_attendance(
    _: AnyStaff,
    student_id: uuid.UUID,
    session: TenantSessionDep,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> AttendancePage:
    """Artboard `2d`'s eight marks and `4a`'s twelve — the two artboards disagree on the
    window (`2d` finding 9), so the count is the caller's and neither is baked in here."""
    rows, next_cursor = AttendanceService(session).student_history(
        student_id, cursor=cursor, limit=limit
    )
    return AttendancePage(
        items=[AttendanceOut.model_validate(row, from_attributes=True) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


# -- 2a: the family's attendance, read by a guardian (feature pass 2026-08-27) --------
from datetime import UTC as _UTC  # noqa: E402 -- grouped with its one route below
from datetime import date as _date  # noqa: E402
from datetime import datetime as _datetime  # noqa: E402
from datetime import time as _time  # noqa: E402
from datetime import timedelta as _timedelta  # noqa: E402

from pydantic import BaseModel as _BaseModel  # noqa: E402

from app.models.attendance import (  # noqa: E402
    AbsenceReport,
    Attendance,
    AttendanceConfirmation,
)
from app.models.schedule import Session as SessionRow  # noqa: E402
from app.models.structure import Group  # noqa: E402


class FamilyAttendanceRow(_BaseModel):
    student_id: uuid.UUID
    session_id: uuid.UUID
    starts_at: str
    group_name: str
    status: str


class FamilyAttendanceOut(_BaseModel):
    items: list[FamilyAttendanceRow]


class FamilyIntentRow(_BaseModel):
    """What this family has told the club about one child at one coming session."""

    student_id: uuid.UUID
    session_id: uuid.UUID
    #: Three states, because the absence of an answer is its own answer -- which is the
    #: whole reason `attendance_confirmation` exists alongside `absence_report`.
    intent: Literal["coming", "not_coming"]


class FamilyIntentsOut(_BaseModel):
    """Only the sessions this family has ANSWERED.

    Unanswered sessions are absent rather than listed with a third value: the parent app
    keys these by `<session>:<student>` and defaults a miss to "unanswered", so a row per
    unanswered lesson would grow with the timetable and say nothing.
    """

    items: list[FamilyIntentRow]


@router.get("/me/attendance-intents", response_model=FamilyIntentsOut)
def my_family_intents(
    request: Request,
    session: TenantSessionDep,
    date_from: Annotated[_date, Query(alias="from")],
    date_to: Annotated[_date, Query(alias="to")],
) -> FamilyIntentsOut:
    """What this family has already told the club about their COMING lessons.

    The read half of the home screen's two-way control: without it the buttons would
    render from local state, and a parent reopening the app would see "unanswered" for a
    lesson they had already answered. The same §3.3 guardian filter and the same 62-day
    cap as `/me/attendance`.

    Only answered sessions come back. A miss is "unanswered" on the client, which keeps
    this payload proportional to what the family has done rather than to the timetable.
    """
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    if date_to < date_from or (date_to - date_from).days > 62:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "refused", "message": "the range must be 0-62 days"},
        )
    my_students = select(Guardian.student_id).where(Guardian.person_id == person_id)
    # Padded a day each side for the same reason /me/attendance pads: the client groups by
    # the STUDIO day, and a session near midnight must not fall off the edge.
    lower = _datetime.combine(date_from - _timedelta(days=1), _time.min, tzinfo=_UTC)
    upper = _datetime.combine(date_to + _timedelta(days=2), _time.min, tzinfo=_UTC)

    confirmations = session.execute(
        select(AttendanceConfirmation.student_id, AttendanceConfirmation.session_id)
        .join(SessionRow, SessionRow.id == AttendanceConfirmation.session_id)
        .where(
            AttendanceConfirmation.student_id.in_(my_students),
            SessionRow.starts_at >= lower,
            SessionRow.starts_at < upper,
        )
    ).all()
    absences = session.execute(
        select(AbsenceReport.student_id, AbsenceReport.session_id)
        .join(SessionRow, SessionRow.id == AbsenceReport.session_id)
        .where(
            AbsenceReport.student_id.in_(my_students),
            SessionRow.starts_at >= lower,
            SessionRow.starts_at < upper,
        )
    ).all()
    return FamilyIntentsOut(
        items=[
            FamilyIntentRow(student_id=student_id, session_id=session_id, intent="coming")
            for student_id, session_id in confirmations
        ]
        + [
            FamilyIntentRow(student_id=student_id, session_id=session_id, intent="not_coming")
            for student_id, session_id in absences
        ]
    )


@router.get("/me/attendance", response_model=FamilyAttendanceOut)
def my_family_attendance(
    request: Request,
    session: TenantSessionDep,
    date_from: Annotated[_date, Query(alias="from")],
    date_to: Annotated[_date, Query(alias="to")],
) -> FamilyAttendanceOut:
    """2a's day strip: what actually happened, per child, per session.

    Statuses only, never a coach's note and never anything financial -- §5.5 gives a
    guardian their own children's record, and the EXISTS-on-guardian filter is the same
    §3.3 query every /me route stands on. No role dependency (§3.1). Capped to a 62-day
    window: the strip reads weeks, and an unbounded range is a table scan someone will
    eventually aim at January-to-December.
    """
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    if date_to < date_from or (date_to - date_from).days > 62:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "refused", "message": "the range must be 0-62 days"},
        )
    my_students = select(Guardian.student_id).where(Guardian.person_id == person_id)
    rows = session.execute(
        select(
            Attendance.student_id,
            Attendance.session_id,
            SessionRow.starts_at,
            Group.name,
            Attendance.status,
        )
        .join(SessionRow, SessionRow.id == Attendance.session_id)
        .join(Group, Group.id == SessionRow.group_id)
        .where(
            Attendance.student_id.in_(my_students),
            # UTC bounds, padded a day each side: the client groups by the STUDIO day
            # (G3), and a session near midnight must not fall off the strip's edge.
            SessionRow.starts_at
            >= _datetime.combine(date_from - _timedelta(days=1), _time.min, tzinfo=_UTC),
            SessionRow.starts_at
            < _datetime.combine(date_to + _timedelta(days=2), _time.min, tzinfo=_UTC),
        )
        .order_by(SessionRow.starts_at)
    ).all()
    return FamilyAttendanceOut(
        items=[
            FamilyAttendanceRow(
                student_id=student_id,
                session_id=session_id,
                starts_at=starts_at.isoformat(),
                group_name=group_name,
                status=attendance_status,
            )
            for student_id, session_id, starts_at, group_name, attendance_status in rows
        ]
    )
