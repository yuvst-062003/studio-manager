"""§6.1 of the staff app redesign — coach unavailability, and decision 12's availability
reader. Tagged `coach` for the same reason `sessions.py` is: SPEC §13's third invariant
(no coach-scoped endpoint returns a financial field) is enforced against that tag, and
nothing here carries money.

**C12's dashboard alert and resolution popup are not this checkpoint's.** Approving or
refusing here is the whole of the manager's decision; reassigning a session is the
existing `PATCH /sessions/{id}` C12 calls from its own popup — see
`app/services/schedule/constraints.py::approve`'s own docstring.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.models.schedule import CoachConstraint
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.schedule import (
    CoachConstraintApprove,
    CoachConstraintCreate,
    CoachConstraintOut,
    CoachConstraintPage,
    CoachConstraintRefuse,
    StaffAvailabilityOut,
    StaffAvailabilityRow,
)
from app.services.schedule.constraints import CoachConstraintService, SubstituteRefusedError
from app.services.schedule.service import ConflictError, NotFoundError

router = APIRouter(tags=["coach", "schedule"])

#: §6.1's manager queue and decisions, and decision 12's availability reader.
MANAGER_ROLES = {"owner", "manager"}


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such record"},
    )


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "forbidden", "message": "this action is not yours"},
    )


def _conflict(exc: ConflictError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "conflict", "message": str(exc)},
    )


#: The 422 §6.1 asks for by name — see `SubstituteRefusedError`'s own docstring for why
#: each code exists.
_SUBSTITUTE_MESSAGES = {
    "not_staff": "the suggested substitute is not staff at this studio",
    "unavailable": "the suggested substitute is not available in this window",
}


def _substitute_refused(exc: SubstituteRefusedError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": exc.reason, "message": _SUBSTITUTE_MESSAGES.get(exc.reason, "refused")},
    )


def _person_id(request: Request) -> uuid.UUID | None:
    value = getattr(request.state, "person_id", None)
    return value if isinstance(value, uuid.UUID) else None


def _out(row: CoachConstraint) -> CoachConstraintOut:
    return CoachConstraintOut.model_validate(row, from_attributes=True)


@router.get("/coach-constraints", response_model=CoachConstraintPage)
def list_constraints(
    _: AnyStaff,
    request: Request,
    session: TenantSessionDep,
    mine: bool = False,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> CoachConstraintPage:
    """Two modes, and only two — §6.1 draws no third. `mine=true` is any staff role,
    scoped to the caller no matter what else is on the query string; `status=pending` is
    the manager queue and needs the role to go with it, checked here rather than in a
    service (`.claude/rules/api.md`: authorization belongs to the router)."""
    service = CoachConstraintService(session)
    if mine:
        person_id = _person_id(request)
        if person_id is None:
            raise _forbidden()
        rows, next_cursor = service.list_mine(person_id, cursor=cursor, limit=limit)
    elif status_filter == "pending":
        roles = set(getattr(request.state, "roles", ()) or ())
        if not roles & MANAGER_ROLES:
            raise _forbidden()
        rows, next_cursor = service.list_pending(cursor=cursor, limit=limit)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "bad_query",
                "message": "pass mine=true or status=pending",
            },
        )
    return CoachConstraintPage(
        items=[_out(row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post(
    "/coach-constraints", response_model=CoachConstraintOut, status_code=status.HTTP_201_CREATED
)
def create_constraint(
    _: AnyStaff,
    body: CoachConstraintCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> CoachConstraintOut:
    person_id = _person_id(request)
    if person_id is None:
        raise _forbidden()
    row = CoachConstraintService(session).create(person_id, body, at=now())
    session.commit()
    return _out(row)


@router.delete("/coach-constraints/{constraint_id}", response_model=CoachConstraintOut)
def withdraw_constraint(
    _: AnyStaff,
    constraint_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> CoachConstraintOut:
    """A status change, not a row deletion — §6.1's table says so in as many words. 200
    with the withdrawn row, the same choice `POST /sessions/{id}/cancel` makes, rather than
    204: the coach's own screen updates the row it just showed without a second fetch."""
    person_id = _person_id(request)
    if person_id is None:
        raise _forbidden()
    try:
        row = CoachConstraintService(session).withdraw(constraint_id, person_id, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    session.commit()
    return _out(row)


@router.post("/coach-constraints/{constraint_id}/approve", response_model=CoachConstraintOut)
def approve_constraint(
    _: ManagerOrOwner,
    constraint_id: uuid.UUID,
    body: CoachConstraintApprove,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> CoachConstraintOut:
    try:
        row = CoachConstraintService(session).approve(
            constraint_id, body, decided_by_person_id=_person_id(request), at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except SubstituteRefusedError as exc:
        raise _substitute_refused(exc) from exc
    session.commit()
    return _out(row)


@router.post("/coach-constraints/{constraint_id}/refuse", response_model=CoachConstraintOut)
def refuse_constraint(
    _: ManagerOrOwner,
    constraint_id: uuid.UUID,
    body: CoachConstraintRefuse,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> CoachConstraintOut:
    try:
        row = CoachConstraintService(session).refuse(
            constraint_id, body, decided_by_person_id=_person_id(request), at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    session.commit()
    return _out(row)


@router.get("/staff/available", response_model=StaffAvailabilityOut)
def staff_available(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    from_at: Annotated[datetime, Query(alias="from")],
    to_at: Annotated[datetime, Query(alias="to")],
) -> StaffAvailabilityOut:
    """Decision 12, verbatim: who is free in `[from, to)`. Manager/owner only — this
    answers "who can I ask to cover", which is the resolution popup's question, not a
    coach's."""
    if to_at <= from_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "bad_range", "message": "to must be after from"},
        )
    rows = CoachConstraintService(session).staff_availability(from_at=from_at, to_at=to_at)
    return StaffAvailabilityOut(items=[StaffAvailabilityRow(**row) for row in rows])
