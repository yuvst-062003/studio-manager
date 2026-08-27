"""SPEC §7's `/enrollments`.

**The reads are tagged `coach`, the writes are not.** §3.2 gives creating and editing an
enrollment to owners and managers; staff `9c`'s מעבר כיתה is drawn as "פעולה של המאמן הראשי
בלבד" and is a lead-coach *affordance* that calls a manager-scoped endpoint. But a coach
does reach `GET /enrollments` and `GET /enrollments/weekday-options` -- the card and the
day list -- so those carry the tag, which is `.claude/rules/api.md`'s rule and not a
formality: an untagged coach route is one invariant 3 never inspects. `EnrollmentOut` and
`EnrollmentWeekdayOptionsOut` carry no financial field, which is exactly what C11
guarantees by putting the price on the student.

`weekday-options` lives here rather than on `/groups/{id}` because `app/routers/structure.py`
belongs to M1 and this is C12's question, asked by this lane's enrolment form.
"""

from __future__ import annotations

import uuid
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.models.people import Enrollment
from app.models.structure import Group
from app.schemas._pagination import IdempotencyKey
from app.schemas.people import (
    EnrollmentCreate,
    EnrollmentMoveIn,
    EnrollmentOut,
    EnrollmentUpdate,
    EnrollmentWeekdayOptionsOut,
)
from app.services.people.enrollments import EnrollmentService
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.schedule import ScheduleService

#: 9c -- מעבר כיתה is the lead coach's action, and §3.2 gives managers everything a
#: lead coach has. An assistant coach is refused.
LeadOrManager = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach"))]

router = APIRouter(tags=["people"])

COACH: list[str | Enum] = ["people", "coach"]


def _not_found(what: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": f"no such {what}"},
    )


def _schedule_unavailable() -> HTTPException:
    """L5's seam, surfaced honestly.

    `ScheduleService.materialize_sessions` raises `NotImplementedError` until lane SCHEDULE
    merges, and this lane must not soften that into an empty list -- an empty day list is
    indistinguishable from "this group has no schedule", which is exactly the lie the
    seam's own docstring warns about. A 503 naming the cause beats a 500 leaking a stack
    trace (`.claude/rules/api.md`), and this arm disappears the moment M2 lands.
    """
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "schedule_unavailable",
            "message": "the club's schedule has not been built yet",
        },
    )


def _out(enrollment: Enrollment, group: Group) -> EnrollmentOut:
    return EnrollmentOut(
        id=enrollment.id,
        student_id=enrollment.student_id,
        group_id=enrollment.group_id,
        group_name=group.name,
        status=enrollment.status,
        started_on=enrollment.started_on,
        ended_on=enrollment.ended_on,
        attends_weekdays=enrollment.attends_weekdays,
    )


@router.get("/enrollments/weekday-options", response_model=EnrollmentWeekdayOptionsOut, tags=COACH)
def weekday_options(
    _: AnyStaff, group_id: uuid.UUID, session: TenantSessionDep
) -> EnrollmentWeekdayOptionsOut:
    """C12's checkboxes. Every enrolment form asks this before it draws the day list."""
    try:
        options = EnrollmentService.weekday_options(
            session, group_id=group_id, since=now().date(), schedule=ScheduleService(session)
        )
    except NotFoundError as exc:
        raise _not_found("group") from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    return EnrollmentWeekdayOptionsOut(
        group_id=options.group_id,
        group_name=options.group_name,
        training_weekdays=options.training_weekdays,
    )


@router.get("/enrollments", response_model=list[EnrollmentOut], tags=COACH)
def list_enrollments(
    _: AnyStaff,
    student_id: uuid.UUID,
    session: TenantSessionDep,
    include_ended: bool = Query(default=False),
) -> list[EnrollmentOut]:
    """Always scoped to one student. C11 makes several live rows normal, so this is a
    small bounded list rather than a page -- G16's rule is about lists that grow."""
    return [
        _out(enrollment, group)
        for enrollment, group in EnrollmentService.list_for_student(
            session, student_id=student_id, include_ended=include_ended
        )
    ]


@router.post("/enrollments", response_model=EnrollmentOut, status_code=status.HTTP_201_CREATED)
def create_enrollment(
    _: ManagerOrOwner,
    body: EnrollmentCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EnrollmentOut:
    """L6 -- enrolment is always a manager decision. `EnrollmentCreate` carries no price,
    because C11 put that on the student and there is no column here to receive one."""
    try:
        row = EnrollmentService.create(
            session,
            student_id=body.student_id,
            group_id=body.group_id,
            started_on=body.started_on,
            attends_weekdays=body.attends_weekdays,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            schedule=ScheduleService(session),
        )
    except NotFoundError as exc:
        raise _not_found("student or group") from exc
    except ConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_enrolled", "message": str(exc)},
        ) from exc
    except RefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "not_a_training_day", "message": str(exc)},
        ) from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    session.commit()
    group = session.get(Group, row.group_id)
    assert group is not None  # created against it a moment ago, inside this transaction
    return _out(row, group)


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentOut)
def update_enrollment(
    _: ManagerOrOwner,
    enrollment_id: uuid.UUID,
    body: EnrollmentUpdate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EnrollmentOut:
    try:
        row = EnrollmentService.update(
            session,
            enrollment_id=enrollment_id,
            status=body.status,
            ended_on=body.ended_on,
            attends_weekdays=body.attends_weekdays,
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            schedule=ScheduleService(session),
        )
    except NotFoundError as exc:
        raise _not_found("enrollment") from exc
    except RefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "not_a_training_day", "message": str(exc)},
        ) from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    session.commit()
    group = session.get(Group, row.group_id)
    assert group is not None
    return _out(row, group)


@router.post("/enrollments/{enrollment_id}/move", response_model=EnrollmentOut)
def move_enrollment(
    _: LeadOrManager,
    enrollment_id: uuid.UUID,
    body: EnrollmentMoveIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EnrollmentOut:
    """Staff 9c's מעבר כיתה, one call (feature pass 2026-08-27): the old enrollment ends
    on the move date and an active one starts in the target group, in one transaction.
    Lead coach or manager -- 9c calls it "פעולה של המאמן הראשי בלבד", and §3.2 gives the
    manager everything the lead coach has."""
    try:
        row = EnrollmentService.move(
            session,
            enrollment_id=enrollment_id,
            group_id=body.group_id,
            moved_on=body.moved_on or now().date(),
            at=now(),
            actor_person_id=getattr(request.state, "person_id", None),
            schedule=ScheduleService(session),
        )
    except NotFoundError as exc:
        raise _not_found("enrollment") from exc
    except ConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_enrolled", "message": str(exc)},
        ) from exc
    except RefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "refused", "message": str(exc)},
        ) from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    session.commit()
    group = session.get(Group, row.group_id)
    assert group is not None
    return _out(row, group)
