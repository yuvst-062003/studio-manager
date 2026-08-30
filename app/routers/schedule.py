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

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.schedule import (
    ClosureCreate,
    ClosureCreatedOut,
    ClosureOut,
    ClosurePage,
    GenerateSessionsOut,
    HolidayPresetOut,
    ScheduleImpactPreview,
    SchedulePutIn,
    ScheduleRuleOut,
    ScheduleRulesOut,
    TrainingYearCreate,
    TrainingYearOut,
    TrainingYearPage,
)
from app.services.schedule.holidays import presets_for_year
from app.services.schedule.rules import jerusalem_date
from app.services.schedule.service import ConflictError, NotFoundError, ScheduleService

router = APIRouter(tags=["schedule"])


def _actor(request: Request) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """The audit actor, read from the verified claims the auth middleware wrote.

    Copied from `app/routers/studio.py` rather than imported: a cross-router import for
    six lines would couple two lanes' files for no gain.
    """
    person_id = getattr(request.state, "person_id", None)
    identity_id = getattr(request.state, "identity_id", None)
    return (
        person_id if isinstance(person_id, uuid.UUID) else None,
        identity_id if isinstance(identity_id, uuid.UUID) else None,
    )


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


@router.post("/training-years/{training_year_id}/activate", response_model=TrainingYearOut)
def activate_training_year(
    _: ManagerOrOwner,
    training_year_id: uuid.UUID,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> TrainingYearOut:
    try:
        row = ScheduleService(session).activate_training_year(training_year_id, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    session.commit()
    return TrainingYearOut.model_validate(row, from_attributes=True)


@router.post(
    "/training-years/{training_year_id}/generate-sessions", response_model=GenerateSessionsOut
)
def generate_sessions(
    _: ManagerOrOwner,
    training_year_id: uuid.UUID,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> GenerateSessionsOut:
    """§5.15 step 6. Safe to press twice — `materialize_sessions` keeps a session already
    sitting at the wanted instant rather than adding a second one."""
    try:
        groups, created = ScheduleService(session).generate_sessions_for_year(
            training_year_id, at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return GenerateSessionsOut(
        training_year_id=training_year_id, groups=groups, sessions_created=created
    )


# -- the weekly rules, and §5.6's impact preview -------------------------------
@router.get("/groups/{group_id}/schedule", response_model=ScheduleRulesOut)
def get_group_schedule(
    _: AnyStaff, group_id: uuid.UUID, session: TenantSessionDep
) -> ScheduleRulesOut:
    service = ScheduleService(session)
    try:
        service.require_group(group_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    rows = service.displayed_rules(group_id, on=jerusalem_date(now()))
    return ScheduleRulesOut(
        group_id=group_id,
        rules=[ScheduleRuleOut.model_validate(r, from_attributes=True) for r in rows],
    )


@router.put("/groups/{group_id}/schedule", response_model=ScheduleImpactPreview)
def put_group_schedule(
    _: ManagerOrOwner,
    group_id: uuid.UUID,
    body: SchedulePutIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ScheduleImpactPreview:
    """§7 — 'PUT returns an impact preview before applying.'

    One endpoint serves both halves because `apply` is the only difference, and defaulting
    it to `false` means a caller that forgets the field gets a preview rather than an
    unreviewed rewrite of a whole training year.
    """
    service = ScheduleService(session)
    at = now()
    try:
        if not body.apply:
            return service.preview_schedule_change(
                group_id, rules=body.rules, effective_from=body.effective_from, at=at
            )
        person_id, identity_id = _actor(request)
        preview = service.apply_schedule_change(
            group_id,
            rules=body.rules,
            effective_from=body.effective_from,
            at=at,
            actor_person_id=person_id,
            actor_identity_id=identity_id,
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return preview
