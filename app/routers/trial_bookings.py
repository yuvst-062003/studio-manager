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
    ChildMatchOut,
    RegistrationDecisionIn,
    RegistrationDecisionOut,
    RegistrationRequestDetailOut,
    RegistrationRequestOut,
    RegistrationRequestPageOut,
    StudentSummaryOut,
    TrialBookingConfirmationOut,
    TrialBookingCreate,
    TrialBookingOut,
    TrialBookingRow,
    TrialBookingRowPage,
    TrialBookingSelfIn,
    TrialBookingSelfResult,
    TrialBookingUpdate,
)
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader
from app.services.people.landing import LandingService
from app.services.people.rate_limit import (
    public_booking_identity_limiter,
    public_booking_ip_limiter,
)
from app.services.people.registrations import RegistrationService
from app.services.people.students import StudentService
from app.services.people.trials import BookedTrial, TrialService
from app.services.schedule import ScheduleService

router = APIRouter(tags=["people"])


def schedule_reader(session: TenantSession) -> ScheduleReader:
    """L5's seam, behind one indirection -- the same shape `app/routers/public.py` uses.

    A module-level factory rather than a `ScheduleService(session)` call inside each route,
    so a test substitutes a reader by patching one name instead of reaching into the shared
    service class. A function-local import cannot be patched at all, which is how the first
    version of this silently kept calling the real seam.

    **The session is threaded through from the request.** W2's contract fixed the seam as
    `materialize_sessions(group_id, from_date, to_date)` -- three arguments and no session
    -- so lane SCHEDULE put the session on the constructor. A no-argument call here is a
    TypeError at request time, and the reader must be the REQUEST's `TenantSession` rather
    than one of its own: that is what carries the tenant filter and the studio stamp into
    every query the seam runs.
    """
    return ScheduleService(session)


#: Module-level so a test can substitute a tighter budget without reaching into the service.
ip_limiter = public_booking_ip_limiter
identity_limiter = public_booking_identity_limiter


def _not_found(what: str = "record") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": f"no such {what}"},
    )


def _self_result(session: TenantSession, booked: BookedTrial) -> TrialBookingSelfResult:
    studio = session.get(Studio, booked.studio_id)
    assert studio is not None  # every group was resolved through it a moment ago
    students = [
        StudentSummaryOut(**StudentService.detail(session, student_id=row.student.id).__dict__)
        for row in booked.booked
    ]
    return TrialBookingSelfResult(
        studio_slug=studio.slug,
        studio_name=studio.name,
        students=students,
        bookings=[
            TrialBookingConfirmationOut(
                student_id=row.student.id,
                student_display_name=f"{summary.first_name} {summary.last_name}",
                group_name=row.group.name,
                session_starts_at=row.session_row.starts_at if row.session_row else None,
            )
            for row, summary in zip(booked.booked, students, strict=True)
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

    # The studio comes from the FIRST child's group. Every other group in the request is
    # checked against it inside the service, so a sibling cannot name a group in a
    # different club and ride in on this resolution.
    first_group = body.children[0].group_id
    # `_resolve_per_child_choices` fills every child's group from the root or rejects the
    # request, so this is narrowing rather than a check -- the same shape as the `studio`
    # assertion in `_self_result` below.
    assert first_group is not None
    try:
        studio_id = LandingService.studio_id_for_group(session, group_id=first_group)
    except NotFoundError as exc:
        raise _not_found("class") from exc

    identity = session.get(AuthIdentity, identity_id)
    with use_studio(studio_id), TenantSession(bind=get_engine(), expire_on_commit=False) as scoped:
        try:
            booked = TrialService.book_for_self(
                scoped,
                identity_id=identity_id,
                studio_id=studio_id,
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
            raise _not_found("group or session") from exc
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


# -- §5.4a's approval queue ----------------------------------------------------
# The queue lives beside the intake it watches: a `registration_request` and a
# `trial_booking` are the two ways somebody enters the funnel, and dashboard `6c` renders
# both. §7 lists `/registration-requests` separately; the file it lands in is this lane's
# choice, and splitting the funnel across two routers would put the queue further from the
# thing it queues.


@router.get("/registration-requests", response_model=RegistrationRequestPageOut)
def list_registration_requests(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    status_filter: str | None = Query(default="pending", alias="status"),
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> RegistrationRequestPageOut:
    """Dashboard `6c`. §3.2 -- 'Approve registration requests' is owner and manager only.

    L10 -- `RegistrationRequestOut` carries two display names and no payload. A list
    endpoint that decrypted every row would defeat the encryption for one page load.
    """
    summaries, next_cursor = RegistrationService.list_requests(
        session, status=status_filter, after=after, limit=limit
    )
    return RegistrationRequestPageOut(
        items=[
            RegistrationRequestOut(
                id=summary.id,
                source=summary.source,
                status=summary.status,
                submitted_at=summary.submitted_at,
                reviewed_at=summary.reviewed_at,
                matched_person_id=summary.matched_person_id,
                child_display_name=summary.child_display_name,
                guardian_display_name=summary.guardian_display_name,
            )
            for summary in summaries
        ],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/registration-requests/{request_id}", response_model=RegistrationRequestDetailOut)
def read_registration_request(
    _: ManagerOrOwner,
    request_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> RegistrationRequestDetailOut:
    """Opening one submission. **Audit-logged as sensitive** (§11.2): this is a stranger's
    personal data about a minor, so the summary is free and the full read is recorded."""
    try:
        detail = RegistrationService.read_full(
            session,
            request_id=request_id,
            actor_person_id=getattr(request.state, "person_id", None),
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found("registration request") from exc
    session.commit()
    return RegistrationRequestDetailOut(
        id=detail.summary.id,
        source=detail.summary.source,
        status=detail.summary.status,
        submitted_at=detail.summary.submitted_at,
        reviewed_at=detail.summary.reviewed_at,
        matched_person_id=detail.summary.matched_person_id,
        child_display_name=detail.summary.child_display_name,
        guardian_display_name=detail.summary.guardian_display_name,
        children=detail.children,
        preferred_group_id=detail.preferred_group_id,
        possible_duplicate_students=[
            ChildMatchOut(
                student_id=match.student_id,
                display_name=match.display_name,
                birthdate=match.birthdate,
            )
            for match in detail.possible_duplicate_students
        ],
    )


@router.post(
    "/registration-requests/{request_id}/approve",
    response_model=RegistrationDecisionOut,
)
def approve_registration_request(
    _: ManagerOrOwner,
    request_id: uuid.UUID,
    body: RegistrationDecisionIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RegistrationDecisionOut:
    """§5.4a's approval transaction.

    **The group comes from the body, not the payload** (§5.4): "Approving is where the group
    is chosen, which is why group_id lives on the decision and not on the submission."
    """
    try:
        created = RegistrationService.approve(
            session,
            request_id=request_id,
            group_id=body.group_id,
            actor_person_id=getattr(request.state, "person_id", None),
            at=now(),
            schedule=schedule_reader(session),
        )
    except NotFoundError as exc:
        raise _not_found("registration request or group") from exc
    except ConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_reviewed", "message": str(exc)},
        ) from exc
    except RefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "group_required", "message": str(exc)},
        ) from exc
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "schedule_unavailable",
                "message": "the club's schedule has not been built yet",
            },
        ) from exc
    session.commit()
    return RegistrationDecisionOut(request_id=request_id, status="approved", student_ids=created)


@router.post("/registration-requests/{request_id}/reject", response_model=RegistrationDecisionOut)
def reject_registration_request(
    _: ManagerOrOwner,
    request_id: uuid.UUID,
    body: RegistrationDecisionIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RegistrationDecisionOut:
    try:
        RegistrationService.reject(
            session,
            request_id=request_id,
            reason=body.reason,
            actor_person_id=getattr(request.state, "person_id", None),
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found("registration request") from exc
    except ConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_reviewed", "message": str(exc)},
        ) from exc
    session.commit()
    return RegistrationDecisionOut(request_id=request_id, status="rejected")
