"""SPEC §7's structure endpoints -- `/classes`, `/groups`, `/locations`.

Every route takes `TenantSessionDep`, which fails closed: a request with no resolved
studio is a 401, never an unscoped session. That is why nothing here passes a `studio_id`
around, and why a cross-studio reference comes back 404 rather than 403 -- the row is
invisible, not merely forbidden, and a 403 would confirm it exists.

§3.2's matrix is enforced by `ManagerOrOwner` / `AnyStaff` from app/core/auth_context.py,
declared per route. Reads reach every staff role because a roster is unreadable without
the group it belongs to; writes are owner and manager only, because a coach who can create
a group can assign themselves to it.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas.structure import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    ClassCreate,
    ClassListResponse,
    ClassOut,
    GroupCreate,
    GroupListResponse,
    GroupOut,
    GroupStaffCreate,
    GroupStaffListResponse,
    GroupStaffOut,
    HealthTemplateListResponse,
    HealthTemplateOut,
    LocationCreate,
    LocationListResponse,
    LocationOut,
)
from app.services.structure.service import DuplicateNameError, NotFoundError, StructureService

router = APIRouter(tags=["structure"])


def _conflict(name: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "duplicate_name", "message": f"{name!r} already exists here"},
    )


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such record"},
    )


# -- classes ------------------------------------------------------------------
@router.get("/classes", response_model=ClassListResponse)
def list_classes(
    _: AnyStaff,
    session: TenantSessionDep,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ClassListResponse:
    rows, next_cursor = StructureService.list_classes(session, cursor=cursor, limit=limit)
    return ClassListResponse(
        items=[ClassOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
    )


@router.post("/classes", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
def create_class(_: ManagerOrOwner, body: ClassCreate, session: TenantSessionDep) -> ClassOut:
    try:
        row = StructureService.create_class(
            session,
            name=body.name,
            description=body.description,
            discipline=body.discipline,
            color=body.color,
            at=now(),
        )
    except DuplicateNameError as exc:
        raise _conflict(body.name) from exc
    session.commit()
    return ClassOut.model_validate(row, from_attributes=True)


# -- groups -------------------------------------------------------------------
@router.get("/groups", response_model=GroupListResponse)
def list_groups(
    _: AnyStaff,
    session: TenantSessionDep,
    class_id: uuid.UUID | None = None,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> GroupListResponse:
    rows, next_cursor = StructureService.list_groups(
        session, class_id=class_id, cursor=cursor, limit=limit
    )
    return GroupListResponse(
        items=[GroupOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
    )


@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(_: ManagerOrOwner, body: GroupCreate, session: TenantSessionDep) -> GroupOut:
    try:
        row = StructureService.create_group(
            session,
            class_id=body.class_id,
            name=body.name,
            description=body.description,
            age_min=body.age_min,
            age_max=body.age_max,
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except DuplicateNameError as exc:
        raise _conflict(body.name) from exc
    session.commit()
    return GroupOut.model_validate(row, from_attributes=True)


# -- locations ----------------------------------------------------------------
@router.get("/locations", response_model=LocationListResponse)
def list_locations(
    _: AnyStaff,
    session: TenantSessionDep,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> LocationListResponse:
    rows, next_cursor = StructureService.list_locations(session, cursor=cursor, limit=limit)
    return LocationListResponse(
        items=[LocationOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
    )


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    _: ManagerOrOwner, body: LocationCreate, session: TenantSessionDep
) -> LocationOut:
    row = StructureService.create_location(
        session, name=body.name, address=body.address, notes=body.notes, at=now()
    )
    session.commit()
    return LocationOut.model_validate(row, from_attributes=True)


# -- group staff --------------------------------------------------------------
@router.get("/groups/{group_id}/staff", response_model=GroupStaffListResponse)
def list_group_staff(
    _: AnyStaff, group_id: uuid.UUID, session: TenantSessionDep
) -> GroupStaffListResponse:
    try:
        rows = StructureService.list_group_staff(session, group_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    return GroupStaffListResponse(
        items=[GroupStaffOut.model_validate(r, from_attributes=True) for r in rows]
    )


@router.post(
    "/groups/{group_id}/staff",
    response_model=GroupStaffOut,
    status_code=status.HTTP_201_CREATED,
)
def assign_group_staff(
    _: ManagerOrOwner,
    group_id: uuid.UUID,
    body: GroupStaffCreate,
    request: Request,
    response: Response,
    session: TenantSessionDep,
) -> GroupStaffOut:
    """§5.1's wizard step 5. Creates the group_staff row AND the group-scoped role
    assignment -- see StructureService.assign_staff for why that is one call."""
    at = now()
    try:
        row, created = StructureService.assign_staff(
            session,
            group_id=group_id,
            person_id=body.person_id,
            role=body.role,
            granted_by_person_id=getattr(request.state, "person_id", None),
            from_date=body.from_date or at.date(),
            at=at,
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    # 201 means Created. Re-assigning a coach who is already on the group creates
    # nothing, and saying otherwise would make a correct retry indistinguishable from a
    # first assignment in any log that reads status codes.
    if not created:
        response.status_code = status.HTTP_200_OK
    return GroupStaffOut.model_validate(row, from_attributes=True)


# -- health templates (conflict C3) -------------------------------------------
@router.get("/health-templates", response_model=HealthTemplateListResponse)
def list_health_templates(
    _: ManagerOrOwner, session: TenantSessionDep, kind: str | None = None
) -> HealthTemplateListResponse:
    """Conflict C3's read side, so M3 can find the trial template it must present.

    Manager and owner only: §3.2 gives 'Read full health declaration' to those two, and
    §6.4 puts the template editor on the manager dashboard. A coach has no business here
    -- they see `derived_flags` and nothing else (§5.5).
    """
    from sqlalchemy import select

    from app.models.health import HealthFormTemplate

    stmt = select(HealthFormTemplate).order_by(HealthFormTemplate.kind)
    if kind is not None:
        stmt = stmt.where(HealthFormTemplate.kind == kind)
    return HealthTemplateListResponse(
        items=[
            HealthTemplateOut.model_validate(r, from_attributes=True)
            for r in session.execute(stmt).scalars().all()
        ]
    )
