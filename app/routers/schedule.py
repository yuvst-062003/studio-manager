"""SPEC §7's schedule endpoints — `/training-years`, `/closures`, `/holiday-presets`,
`/groups/{id}/schedule`.

Every route takes `TenantSessionDep`, which fails closed: a request with no resolved studio
is a 401, never an unscoped session. That is why nothing here passes a `studio_id` around,
and why a cross-studio reference comes back 404 rather than 403.

Reads reach every staff role — a roster is unreadable without the schedule it hangs off.
Writes are owner and manager only (§3.2, 'Create/edit classes, groups, schedules').

**Not tagged `coach`.** `/sessions` is the coach-facing surface and lives in
`app/routers/sessions.py`; these are the manager's setup screens, and tagging them would
claim a §13 invariant-3 guarantee about routes a coach never calls.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.schedule import (
    ClosureCreate,
    ClosureCreatedOut,
    ClosureOut,
    ClosurePage,
    HolidayPresetOut,
    TrainingYearCreate,
    TrainingYearOut,
    TrainingYearPage,
)
from app.services.schedule.holidays import presets_for_year
from app.services.schedule.service import ConflictError, NotFoundError, ScheduleService

router = APIRouter(tags=["schedule"])


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such record"},
    )


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "conflict", "message": message},
    )


# -- training years -----------------------------------------------------------
@router.get("/training-years", response_model=TrainingYearPage)
def list_training_years(
    _: AnyStaff,
    session: TenantSessionDep,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> TrainingYearPage:
    rows, next_cursor = ScheduleService(session).list_training_years(cursor=cursor, limit=limit)
    return TrainingYearPage(
        items=[TrainingYearOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/training-years", response_model=TrainingYearOut, status_code=status.HTTP_201_CREATED)
def create_training_year(
    _: ManagerOrOwner,
    body: TrainingYearCreate,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> TrainingYearOut:
    try:
        row = ScheduleService(session).create_training_year(
            name=body.name, starts_on=body.starts_on, ends_on=body.ends_on, at=now()
        )
    except ConflictError as exc:
        raise _conflict(f"{body.name!r} already exists here") from exc
    session.commit()
    return TrainingYearOut.model_validate(row, from_attributes=True)


# -- closures -----------------------------------------------------------------
@router.get("/closures", response_model=ClosurePage)
def list_closures(
    _: AnyStaff,
    session: TenantSessionDep,
    training_year_id: uuid.UUID | None = None,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ClosurePage:
    rows, next_cursor = ScheduleService(session).list_closures(
        training_year_id=training_year_id, cursor=cursor, limit=limit
    )
    return ClosurePage(
        items=[ClosureOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/closures", response_model=ClosureCreatedOut, status_code=status.HTTP_201_CREATED)
def create_closure(
    _: ManagerOrOwner,
    body: ClosureCreate,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ClosureCreatedOut:
    try:
        row, cancelled = ScheduleService(session).create_closure(
            training_year_id=body.training_year_id,
            date_from=body.date_from,
            date_to=body.date_to,
            reason=body.reason,
            source=body.source,
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return ClosureCreatedOut(
        id=row.id,
        training_year_id=row.training_year_id,
        date_from=row.date_from,
        date_to=row.date_to,
        reason=row.reason,
        source=row.source,
        sessions_cancelled=cancelled,
    )


# -- holiday presets ----------------------------------------------------------
@router.get("/holiday-presets", response_model=list[HolidayPresetOut])
def list_holiday_presets(
    _: AnyStaff,
    year: int = Query(ge=2000, le=2100),
) -> list[HolidayPresetOut]:
    """§5.6 — **proposals the manager ticks, never automatic closures.**

    No session dependency, deliberately: this route reads nothing and writes nothing, and
    a database handle it did not need would be a database handle a later edit could use.
    A Gregorian year always straddles two Hebrew ones, which is why 2026 answers with both
    Pesach of 5786 and Rosh Hashanah of 5787.
    """
    return [
        HolidayPresetOut(key=p.key, name=p.name, date_from=p.date_from, date_to=p.date_to)
        for p in presets_for_year(year)
    ]
