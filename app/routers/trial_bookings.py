"""SPEC §7's `/trial-bookings`. The funnel's intake, and the queue that watches it.

**`POST /trial-bookings/self` is the exception in this lane**, and everything unusual about
this file is that one route. It is authenticated but the caller has **no studio in their
token**: they signed in seconds ago and belong to nowhere, so `TenantSessionDep` would 401
the only self-service entry point in the product (§6.1). The studio is resolved from the
group -- which came from that studio's own public group list -- and every write then happens
inside a `TenantSession` scoped to it, so the rows are stamped and guarded normally. The
same reasoning is recorded against this file in `tests/restrictions/test_01`'s allowlist.

Every other route here takes `TenantSessionDep` and behaves like the rest of the lane.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.db import SessionDep, get_engine
from app.core.tenancy import TenantSession, TenantSessionDep, use_studio
from app.models.identity import AuthIdentity
from app.models.studio import Studio
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.people import (
    StudentSummaryOut,
    TrialBookingCreate,
    TrialBookingOut,
    TrialBookingRow,
    TrialBookingRowPage,
    TrialBookingSelfIn,
    TrialBookingSelfResult,
    TrialBookingUpdate,
)
from app.services.people.errors import ConflictError, NotFoundError
from app.services.people.landing import LandingService
from app.services.people.rate_limit import (
    public_booking_identity_limiter,
    public_booking_ip_limiter,
)
from app.services.people.students import StudentService
from app.services.people.trials import BookedTrial, TrialService

router = APIRouter(tags=["people"])

#: Module-level so a test can substitute a tighter budget without reaching into the service.
ip_limiter = public_booking_ip_limiter
identity_limiter = public_booking_identity_limiter


def _not_found(what: str = "record") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": f"no such {what}"},
    )


def _self_result(session: TenantSession, booked: BookedTrial) -> TrialBookingSelfResult:
    studio = session.get(Studio, booked.group.studio_id)
    assert studio is not None  # the group was resolved through it a moment ago
    return TrialBookingSelfResult(
        studio_slug=studio.slug,
        studio_name=studio.name,
        group_name=booked.group.name,
        session_starts_at=booked.session_row.starts_at if booked.session_row else None,
        students=[
            StudentSummaryOut(**StudentService.detail(session, student_id=student.id).__dict__)
            for student in booked.students
        ],
    )


@router.post(
    "/trial-bookings/self",
    response_model=TrialBookingSelfResult,
    status_code=status.HTTP_201_CREATED,
)
def book_trial_for_self(
    body: TrialBookingSelfIn,
    request: Request,
    session: SessionDep,
) -> TrialBookingSelfResult:
    """§5.4a steps 1-5. **Authenticated, but with no studio in the token.**

    `SessionDep` and not `TenantSessionDep`, deliberately -- see the module docstring. The
    writes below all happen inside a `TenantSession` scoped to the studio the group belongs
    to, so nothing here escapes the tenant guard; it simply arrives by a different route.

    §11.7's two controls: rate-limited per IP and per identity (see
    `app/services/people/rate_limit.py` for what that limiter is and is not), and
    sign-in-first standing in for the captcha that has no provider configured.
    """
    identity_id = getattr(request.state, "identity_id", None)
    if not isinstance(identity_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )

    at = now()
    client_ip = request.client.host if request.client else "unknown"
    if not ip_limiter.allow(client_ip, at=at) or not identity_limiter.allow(
        str(identity_id), at=at
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "too_many_bookings", "message": "try again in a few minutes"},
        )

    try:
        studio_id = LandingService.studio_id_for_group(session, group_id=body.group_id)
    except NotFoundError as exc:
        raise _not_found("class") from exc

    identity = session.get(AuthIdentity, identity_id)
    with use_studio(studio_id), TenantSession(bind=get_engine(), expire_on_commit=False) as scoped:
        try:
            booked = TrialService.book_for_self(
                scoped,
                identity_id=identity_id,
                group_id=body.group_id,
                session_id=body.session_id,
                children=[child.model_dump() for child in body.children],
                declarations=body.trial_health_declarations,
                provider_email=identity.email if identity else None,
                provider_email_verified=bool(identity and identity.email_verified),
                at=at,
            )
        except ConflictError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "trial_already_used", "message": str(exc)},
            ) from exc
        except NotFoundError as exc:
            raise _not_found("session") from exc
        scoped.commit()
        # Read back inside the scope, so §5.4a step 5's "נתראה ביום א' 17:00" needs no
        # second round trip -- which the parent could not make anyway: their token still
        # has no studio in it until they refresh.
        return _self_result(scoped, booked)


@router.get("/trial-bookings", response_model=TrialBookingRowPage)
def list_trial_bookings(
    _: AnyStaff,
    session: TenantSessionDep,
    outcome: str | None = None,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> TrialBookingRowPage:
    """§5.4a ② -- the dashboard's שיעורי ניסיון queue."""
    rows, next_cursor = TrialService.list_bookings(
        session, outcome=outcome, after=after, limit=limit
    )
    return TrialBookingRowPage(
        items=[
            TrialBookingRow(
                id=booking.id,
                student_id=student.id,
                student_display_name=f"{person.first_name} {person.last_name}",
                group_id=group.id,
                group_name=group.name,
                session_id=booking.session_id,
                booked_at=booking.booked_at,
                attended=booking.attended,
                outcome=booking.outcome,
                is_override=booking.is_override,
            )
            for booking, student, person, group in rows
        ],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/trial-bookings", response_model=TrialBookingOut, status_code=status.HTTP_201_CREATED)
def log_trial_booking(
    _: AnyStaff,
    body: TrialBookingCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> TrialBookingOut:
    """§5.4a -- 'A manager can also log a phone enquiry, producing the same rows.'

    `AnyStaff` and not `ManagerOrOwner`: staff `11b` is a coach adding a trial student
    mid-lesson, which §5.4a ③ describes and §3.2 permits -- it records an enquiry, it does
    not enrol anybody. L6 is untouched: no enrollment is created here either.
    """
    person_id = getattr(request.state, "person_id", None)
    at = now()
    created = StudentService.create(
        session,
        first_name=body.child.first_name,
        last_name=body.child.last_name,
        birthdate=body.child.birthdate,
        guardian_first_name=body.guardian.first_name,
        guardian_last_name=body.guardian.last_name,
        guardian_email=body.guardian.email,
        guardian_phone=body.guardian.phone,
        relation=body.guardian.relation,
        at=at,
        actor_person_id=person_id,
        status="lead",
        source="manager",
    )
    from app.models.people import TrialBooking
    from app.services.people.status import StudentStatusService

    StudentStatusService.transition(
        session,
        student=created.student,
        to_status="trial",
        at=at,
        actor_person_id=person_id,
        reason="logged by staff",
    )
    booking = TrialBooking(
        student_id=created.student.id,
        session_id=body.session_id,
        group_id=body.group_id,
        booked_at=at,
        attended=None,
        outcome="pending",
        is_override=False,
    )
    session.add(booking)
    session.commit()
    return TrialBookingOut.model_validate(booking, from_attributes=True)


@router.patch("/trial-bookings/{booking_id}", response_model=TrialBookingOut)
def update_trial_booking(
    _: AnyStaff,
    booking_id: uuid.UUID,
    body: TrialBookingUpdate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> TrialBookingOut:
    """§5.4a ③ -- 'Coach marks attendance exactly as normal. Coach can leave a note.'"""
    try:
        booking = TrialService.record_outcome(
            session,
            booking_id=booking_id,
            attended=body.attended,
            coach_note=body.coach_note,
            outcome=body.outcome,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found("trial booking") from exc
    session.commit()
    return TrialBookingOut.model_validate(booking, from_attributes=True)


@router.post("/trial-bookings/{booking_id}/grant-override", response_model=TrialBookingOut)
def grant_override(
    _: ManagerOrOwner,
    booking_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> TrialBookingOut:
    """§5.4a -- a manager granting a **second** free trial, in one tap.

    Manager-only, because §5.4a makes one free trial the rule and a second one "a
    deliberate, visible, countable act rather than someone quietly adding a row".
    """
    try:
        booking = TrialService.grant_override(
            session,
            booking_id=booking_id,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found("trial booking") from exc
    session.commit()
    return TrialBookingOut.model_validate(booking, from_attributes=True)
