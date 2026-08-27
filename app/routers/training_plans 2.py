"""Training plans: what a student's plan buys, marking a session, and changing plan.

**Two surfaces with different rules, in one file because they are one feature.**

The `/me`-shaped reads take no role dependency -- §3.1's "guardian is not a role" -- and
are scoped to the caller's own children by `StudentService.for_guardian`, the same read
`/me/students` uses. A parent asking about another family's child gets a 404, never a 403:
a foreign student id must not be confirmed to exist.

The manager routes take `ManagerOrOwner`. **No route in this module carries the `coach`
tag**, and that is deliberate: `PlanOptionOut` carries `monthly_amount_agorot`, and §13's
third invariant keeps financial fields off coach-reachable endpoints. The one thing a coach
needs -- who has marked tonight's extra session -- lives in `app/routers/session_rosters.py`
on a router tagged `coach`, because `app/main.py` mounts one `router` per module and a
coach-reachable route on an untagged router is one the invariant never inspects.

**§12 amends SPEC §5.10.** "The manager sets the price... never visible as an input anywhere
in the parent app" is reversed here on purpose: the plan is a parent-facing choice now, and
the parent app shows the three amounts. `StudentOut.price_plan_id` keeps its invariant-3
tagging; this is a separate, parent-scoped shape.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.models.billing import PricePlan
from app.models.people import Student
from app.models.person import Person
from app.models.schedule import Session as SessionRow
from app.models.structure import GROUP_KINDS, Group
from app.models.training_plan import GroupEligibility, PlanChange, SessionBooking
from app.schemas.training_plan import (
    BaseSessionOut,
    BookableSessionOut,
    GroupEligibilityIn,
    GroupEligibilityOut,
    GroupKindIn,
    ManagerPlanChangeOut,
    PlanChangeIn,
    PlanChangeListOut,
    PlanChangeOut,
    PlanOptionOut,
    SessionBookingIn,
    SessionBookingOut,
    TrainingPlanOut,
)
from app.services.people.students import StudentService
from app.services.schedule.booking import BookingService, week_start
from app.services.schedule.errors import BookingRefusedError, PlanChangeRefusedError
from app.services.schedule.plan_change import PlanChangeService
from app.services.schedule.plan_offer import offered_plans

router = APIRouter(tags=["billing"])


def _caller(request: Request) -> uuid.UUID:
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


def _not_found(what: str = "record") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": f"no such {what}"},
    )


def _refused(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": "refused", "message": str(exc)},
    )


def _own_student(session: TenantSessionDep, request: Request, student_id: uuid.UUID) -> Student:
    """This caller's own child, or a 404.

    404 and never 403: a parent probing student ids must not learn which of them exist.
    """
    mine = {row.id for row in StudentService.for_guardian(session, person_id=_caller(request))}
    if student_id not in mine:
        raise _not_found("student")
    student = session.get(Student, student_id)
    if student is None:  # pragma: no cover -- for_guardian just returned it
        raise _not_found("student")
    return student


def _plan_option(
    plan: PricePlan, *, offered_ids: set[uuid.UUID], current_id: uuid.UUID | None
) -> PlanOptionOut:
    return PlanOptionOut(
        id=plan.id,
        name=plan.name,
        monthly_amount_agorot=plan.monthly_amount_agorot,
        weekly_extra_allowance=plan.weekly_extra_allowance,
        is_offered=plan.id in offered_ids,
        is_current=plan.id == current_id,
    )


def _change_out(change: PlanChange) -> PlanChangeOut:
    return PlanChangeOut(
        id=change.id,
        student_id=change.student_id,
        from_price_plan_id=change.from_price_plan_id,
        to_price_plan_id=change.to_price_plan_id,
        effective_on=change.effective_on,
        status=change.status,
        settlement_status=change.settlement_status,
        requested_at=change.requested_at,
        applied_at=change.applied_at,
    )


# -- the parent's screen -------------------------------------------------------
@router.get("/students/{student_id}/training-plan", response_model=TrainingPlanOut)
def training_plan(
    student_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> TrainingPlanOut:
    """Everything the parent's plan screen renders, in one read.

    One request rather than five, because every part of it is a view of the same two
    questions -- what does this child's plan buy, and what have they spent this week -- and
    a screen assembled from five reads is a screen with five loading states and four ways
    to be inconsistent.
    """
    student = _own_student(session, request, student_id)
    bookings = BookingService(session)
    at = now()
    this_week = week_start(at)

    plans = list(
        session.execute(
            select(PricePlan)
            .where(PricePlan.active_to.is_(None))
            .order_by(PricePlan.monthly_amount_agorot)
        ).scalars()
    )
    offered = {plan.id for plan in offered_plans(bookings, student_id=student_id, plans=plans)}
    current = (
        session.get(PricePlan, student.price_plan_id) if student.price_plan_id is not None else None
    )

    base_ids = bookings.base_group_ids(student_id)
    person = session.get(Person, student.person_id)
    spent = len(bookings.live_bookings_in_week(student_id, this_week))

    # Every session of this club week, of every kind. Filtered into the two lists below
    # rather than queried twice: they are one week's timetable read once.
    rows = list(
        session.execute(
            select(SessionRow, Group)
            .join(Group, Group.id == SessionRow.group_id)
            .where(SessionRow.status != "cancelled")
            .order_by(SessionRow.starts_at)
        ).all()
    )
    live_bookings = {
        booking.session_id: booking
        for booking in session.execute(
            select(SessionBooking).where(
                SessionBooking.student_id == student_id,
                SessionBooking.cancelled_at.is_(None),
            )
        ).scalars()
    }

    base_sessions: list[BaseSessionOut] = []
    extras: list[BookableSessionOut] = []
    for row, group in rows:
        if week_start(row.starts_at) != this_week:
            continue
        if group.kind == "base":
            if group.id in base_ids:
                base_sessions.append(
                    BaseSessionOut(
                        session_id=row.id,
                        group_name=group.name,
                        starts_at=row.starts_at,
                        ends_at=row.ends_at,
                    )
                )
            continue
        booking = live_bookings.get(row.id)
        markable, reason = _markable(
            bookings, student, group, row, at=at, spent=spent, current=current
        )
        if not bookings.is_eligible(student_id, group):
            # Not shown at all. A row a child can never attend is not an upgrade offer, it
            # is a session belonging to another part of the club.
            continue
        extras.append(
            BookableSessionOut(
                session_id=row.id,
                group_id=group.id,
                group_name=group.name,
                kind=group.kind,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                booking_id=booking.id if booking else None,
                is_markable=markable or booking is not None,
                reason=None if booking is not None else reason,
            )
        )

    scheduled = session.execute(
        select(PlanChange).where(
            PlanChange.student_id == student_id, PlanChange.status == "scheduled"
        )
    ).scalar_one_or_none()

    allowance = current.weekly_extra_allowance if current is not None else 0
    return TrainingPlanOut(
        student_id=student_id,
        student_name=f"{person.first_name} {person.last_name}" if person else "",
        current_plan=(
            _plan_option(current, offered_ids=offered, current_id=student.price_plan_id)
            if current
            else None
        ),
        base_sessions=base_sessions,
        this_weeks_extras=extras,
        credits_remaining=None if allowance is None else max(0, allowance - spent),
        plans=[
            _plan_option(plan, offered_ids=offered, current_id=student.price_plan_id)
            for plan in plans
        ],
        scheduled_change=_change_out(scheduled) if scheduled else None,
    )


def _markable(
    bookings: BookingService,
    student: Student,
    group: Group,
    row: SessionRow,
    *,
    at: datetime,
    spent: int,
    current: PricePlan | None,
) -> tuple[bool, str | None]:
    """Whether this row offers a button, and the machine-readable reason if it does not.

    Deliberately a re-statement of `BookingService.mark`'s refusals rather than a call into
    it: the screen has to grey a row WITHOUT attempting a write, and a dry-run flag on the
    writer is the shape that eventually grows a bug where the dry run and the real one
    disagree. The reasons are the same strings a refused POST returns, so the client
    translates one vocabulary.
    """
    if at >= row.starts_at:
        return (False, "started")
    if current is None:
        return (False, "no_plan")
    if group.kind == "private":
        if current.weekly_extra_allowance is not None:
            return (False, "needs_unlimited")
        return (True, None)
    allowance = current.weekly_extra_allowance
    if allowance is not None and spent >= allowance:
        return (False, "no_credits")
    return (True, None)


@router.post(
    "/session-bookings", response_model=SessionBookingOut, status_code=status.HTTP_201_CREATED
)
def mark_session(
    body: SessionBookingIn, request: Request, session: TenantSessionDep
) -> SessionBookingOut:
    """ "I am coming to this one." Own children only; the four rules live in the service."""
    _own_student(session, request, body.student_id)
    try:
        booking = BookingService(session).mark(
            require_current_studio_id(),
            student_id=body.student_id,
            session_id=body.session_id,
            by_person_id=_caller(request),
            at=now(),
        )
    except BookingRefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return SessionBookingOut(
        id=booking.id,
        student_id=booking.student_id,
        session_id=booking.session_id,
        cancelled_at=booking.cancelled_at,
    )


@router.delete("/session-bookings/{booking_id}", response_model=SessionBookingOut)
def release_session(
    booking_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> SessionBookingOut:
    """Give the credit back — free until the session starts, then spent."""
    booking = session.get(SessionBooking, booking_id)
    if booking is None:
        raise _not_found("booking")
    _own_student(session, request, booking.student_id)
    try:
        booking = BookingService(session).release(
            booking_id, by_person_id=_caller(request), at=now()
        )
    except BookingRefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return SessionBookingOut(
        id=booking.id,
        student_id=booking.student_id,
        session_id=booking.session_id,
        cancelled_at=booking.cancelled_at,
    )


@router.post(
    "/students/{student_id}/plan-changes",
    response_model=PlanChangeOut,
    status_code=status.HTTP_201_CREATED,
)
def request_plan_change(
    student_id: uuid.UUID,
    body: PlanChangeIn,
    request: Request,
    session: TenantSessionDep,
) -> PlanChangeOut:
    """Self-serve, both directions. An upgrade unlocks access at once and prices from the
    first; a downgrade waits for the first, so a family who paid for this month keeps it."""
    _own_student(session, request, student_id)
    try:
        change = PlanChangeService(session).request(
            require_current_studio_id(),
            student_id=student_id,
            to_price_plan_id=body.to_price_plan_id,
            by_person_id=_caller(request),
            at=now(),
        )
    except PlanChangeRefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return _change_out(change)


@router.delete("/students/{student_id}/plan-changes/{change_id}", response_model=PlanChangeOut)
def cancel_plan_change(
    student_id: uuid.UUID,
    change_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> PlanChangeOut:
    """Before it applies — which is the whole reason a change is a row and not an edit."""
    _own_student(session, request, student_id)
    change = session.get(PlanChange, change_id)
    if change is None or change.student_id != student_id:
        raise _not_found("plan change")
    try:
        change = PlanChangeService(session).cancel(change_id, at=now())
    except PlanChangeRefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return _change_out(change)


# -- the manager ---------------------------------------------------------------
@router.patch("/groups/{group_id}/training-kind", response_model=GroupKindIn)
def set_group_kind(
    _: ManagerOrOwner, group_id: uuid.UUID, body: GroupKindIn, session: TenantSessionDep
) -> GroupKindIn:
    """`kind` and `is_invite_only`, the two switches every rule in this feature reads.

    Its own route rather than a field on the structure lane's `PATCH /groups/{id}`: that
    shape belongs to another lane, and these two columns are read by this one. The path
    says `training-kind` for the same reason.
    """
    group = session.get(Group, group_id)
    if group is None:
        raise _not_found("group")
    if body.kind is not None:
        if body.kind not in GROUP_KINDS:
            raise _refused(ValueError(f"kind must be one of {', '.join(GROUP_KINDS)}"))
        group.kind = body.kind
    if body.is_invite_only is not None:
        group.is_invite_only = body.is_invite_only
    session.commit()
    return GroupKindIn(kind=group.kind, is_invite_only=group.is_invite_only)


@router.put("/groups/{group_id}/eligibility", response_model=GroupEligibilityOut)
def set_eligibility(
    _: ManagerOrOwner,
    group_id: uuid.UUID,
    body: GroupEligibilityIn,
    session: TenantSessionDep,
) -> GroupEligibilityOut:
    """The base groups linked to one extra group. A full replace: the manager's mental
    model is a checklist, and two verbs for one checklist is how a half-applied edit
    happens."""
    group = session.get(Group, group_id)
    if group is None:
        raise _not_found("group")
    studio_id = require_current_studio_id()
    for existing in session.execute(
        select(GroupEligibility).where(GroupEligibility.extra_group_id == group_id)
    ).scalars():
        session.delete(existing)
    session.flush()
    for base_group_id in dict.fromkeys(body.base_group_ids):
        base = session.get(Group, base_group_id)
        if base is None:
            raise _not_found("group")
        session.add(
            GroupEligibility(
                studio_id=studio_id, extra_group_id=group_id, base_group_id=base_group_id
            )
        )
    session.commit()
    return GroupEligibilityOut(
        extra_group_id=group_id, base_group_ids=list(dict.fromkeys(body.base_group_ids))
    )


@router.get("/plan-changes", response_model=PlanChangeListOut)
def plan_change_queue(_: ManagerOrOwner, session: TenantSessionDep) -> PlanChangeListOut:
    """§11's queue: every change whose money a human has not closed.

    The difference in agorot travels with each row, because "collect 100 ₪ × the remaining
    months" is the instruction and a manager should not have to look up two prices to
    compute it.
    """
    items = []
    for change in PlanChangeService(session).settlement_queue():
        student = session.get(Student, change.student_id)
        person = session.get(Person, student.person_id) if student else None
        before = (
            session.get(PricePlan, change.from_price_plan_id) if change.from_price_plan_id else None
        )
        after = session.get(PricePlan, change.to_price_plan_id)
        items.append(
            ManagerPlanChangeOut(
                **_change_out(change).model_dump(),
                student_name=f"{person.first_name} {person.last_name}" if person else "",
                from_plan_name=before.name if before else None,
                to_plan_name=after.name if after else "",
                monthly_difference_agorot=(
                    (after.monthly_amount_agorot if after else 0)
                    - (before.monthly_amount_agorot if before else 0)
                ),
            )
        )
    return PlanChangeListOut(items=items)


@router.post("/plan-changes/{change_id}/settle", response_model=PlanChangeOut)
def settle_plan_change(
    _: ManagerOrOwner, change_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> PlanChangeOut:
    """A manager saying the money is handled. The app never decides this: it cannot see a
    drawer of cheques, and G8 means it cannot cancel a uPay mandate either."""
    try:
        change = PlanChangeService(session).settle(
            change_id, by_person_id=_caller(request), at=now()
        )
    except PlanChangeRefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return _change_out(change)
