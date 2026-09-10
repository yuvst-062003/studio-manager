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

from app.core.auth_context import (
    AnyStaff,
    ManagerOfClass,
    ManagerOrOwner,
    StaffOrClassManager,
)
from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.routers.health_templates import TemplateReader
from app.schemas.structure import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    ClassCoachOut,
    ClassCreate,
    ClassListResponse,
    ClassOut,
    ClassStaffCreate,
    ClassStaffListResponse,
    ClassUpdate,
    GroupCreate,
    GroupListResponse,
    GroupOut,
    GroupPatch,
    GroupStaffCreate,
    GroupStaffListResponse,
    GroupStaffOut,
    HealthTemplateListResponse,
    HealthTemplateOut,
    LocationCreate,
    LocationListResponse,
    LocationOut,
)
from app.services.structure.class_staff import (
    BadClassRoleError,
    ClassStaffNotFoundError,
    ClassStaffService,
    NotAClassCoachError,
    StillCoachingError,
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


@router.patch("/classes/{class_id}", response_model=ClassOut)
def update_class(
    _: ManagerOrOwner,
    class_id: uuid.UUID,
    body: ClassUpdate,
    session: TenantSessionDep,
) -> ClassOut:
    """Rename / re-describe / retire one class.

    `ClassUpdate` was written when the model landed and no route ever used it, so a club
    that mistyped a class name during setup had no way to correct it. `model_fields_set`
    decides what to write, like `SessionPatch` and `GroupPatch`: an absent field leaves
    its column alone rather than nulling it.
    """
    try:
        row = StructureService.update_class(
            session,
            class_id,
            fields=body.model_dump(exclude_unset=True),
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except DuplicateNameError as exc:
        raise _conflict(body.name or "") from exc
    session.commit()
    return ClassOut.model_validate(row, from_attributes=True)


# -- groups -------------------------------------------------------------------
@router.get("/groups", response_model=GroupListResponse)
def list_groups(
    _: AnyStaff,
    request: Request,
    session: TenantSessionDep,
    class_id: uuid.UUID | None = None,
    mine: bool = False,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> GroupListResponse:
    rows, next_cursor = StructureService.list_groups(
        session,
        class_id=class_id,
        # `mine` asks "which groups do I coach" — 9e's identity block. Answered from
        # `group_staff`, so a manager with no assignment gets an honest empty list.
        staff_person_id=getattr(request.state, "person_id", None) if mine else None,
        cursor=cursor,
        limit=limit,
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


@router.patch("/groups/{group_id}", response_model=GroupOut)
def update_group(
    _: ManagerOrOwner, group_id: uuid.UUID, body: GroupPatch, session: TenantSessionDep
) -> GroupOut:
    """F4 -- rename / retire / revive, outside the once-a-year rollover wizard. Rename
    and retire used to exist ONLY inside `POST /rollover/{y}/groups`; a club opening a
    Tuesday beginners group in November had nowhere to do this."""
    try:
        row = StructureService.update_group(
            session,
            group_id,
            fields={k: v for k, v in body.model_dump().items() if k in body.model_fields_set},
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except DuplicateNameError as exc:
        raise _conflict(body.name or "") from exc
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
    except NotAClassCoachError as exc:
        # 422 and NOT 403: the manager is allowed to do this, the person is not eligible
        # yet. The message names the class, because the next action is to add them to it.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "not_a_class_coach", "message": str(exc)},
        ) from exc
    session.commit()
    # 201 means Created. Re-assigning a coach who is already on the group creates
    # nothing, and saying otherwise would make a correct retry indistinguishable from a
    # first assignment in any log that reads status codes.
    if not created:
        response.status_code = status.HTTP_200_OK
    return GroupStaffOut.model_validate(row, from_attributes=True)


# -- a class's own coaches (2026-09-09) ---------------------------------------
@router.get("/classes/{class_id}/staff", response_model=ClassStaffListResponse)
def list_class_staff(
    _: StaffOrClassManager, class_id: uuid.UUID, session: TenantSessionDep
) -> ClassStaffListResponse:
    """Who coaches this class, main coach first.

    Readable by any staff member: §3.2 makes MANAGING staff a manager's act, but knowing who
    else teaches your class is neither a financial nor a personal-data read, and a coach app
    that could not show it would be worse than useless on the mat.
    """
    rows = ClassStaffService(session).coaches(class_id)
    return ClassStaffListResponse(
        items=[
            ClassCoachOut(
                person_id=row.person_id,
                display_name=row.display_name,
                role=row.role,
                from_date=row.from_date,
            )
            for row in rows
        ]
    )


@router.post(
    "/classes/{class_id}/staff",
    response_model=ClassCoachOut,
    status_code=status.HTTP_201_CREATED,
)
def add_class_staff(
    _: ManagerOfClass,
    class_id: uuid.UUID,
    body: ClassStaffCreate,
    response: Response,
    session: TenantSessionDep,
) -> ClassCoachOut:
    """Owner, 2026-09-09: "if a coach is in both, the studio manager needs to add his
    details in both classes." So this is per class, and a person genuinely holds two rows.

    200 rather than 201 when the coach was already there: re-adding creates nothing, and a
    role change on an existing row is an edit rather than a creation. Saying 201 to both
    makes a correct retry indistinguishable from a first assignment in any log that reads
    status codes -- the same reasoning as the group route above.
    """
    service = ClassStaffService(session)
    try:
        row, created = service.add_coach(
            require_current_studio_id(),
            class_id,
            body.person_id,
            role=body.role,
            from_date=body.from_date or now().date(),
        )
    except ClassStaffNotFoundError as exc:
        raise _not_found() from exc
    except BadClassRoleError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "refused", "message": str(exc)},
        ) from exc
    session.commit()
    if not created:
        response.status_code = status.HTTP_200_OK
    for coach in service.coaches(class_id):
        if coach.person_id == row.person_id:
            return ClassCoachOut(
                person_id=coach.person_id,
                display_name=coach.display_name,
                role=coach.role,
                from_date=coach.from_date,
            )
    # Unreachable: the row was just written and `coaches` reads the live rows.
    raise _not_found()


@router.delete("/groups/{group_id}/staff/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_group_staff(
    _: ManagerOrOwner,
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
) -> Response:
    """The counterpart `POST /groups/{id}/staff` shipped without in M1.4.

    Classes have had a removal since the class-manager work; groups had none, so a coach
    put on the wrong group stayed on it, and the staff screen's ללא קבוצה could only ever
    be fixed in one direction (owner report, 2026-09-10).

    Closes the row and revokes the group-scoped grant together -- see
    `StructureService.unassign_staff` for why that is one call.
    """
    at = now()
    try:
        StructureService.unassign_staff(
            session,
            group_id=group_id,
            person_id=person_id,
            on=at.date(),
            at=at,
            actor_person_id=getattr(request.state, "person_id", None),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/classes/{class_id}/staff/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_class_staff(
    _: ManagerOfClass,
    class_id: uuid.UUID,
    person_id: uuid.UUID,
    session: TenantSessionDep,
) -> Response:
    """Closes the row rather than deleting it -- who taught a class last year is history the
    sessions already point at.

    409 while they still hold one of this class's groups. Letting it through would create
    the exact state the assignment rule forbids, made by the act meant to tidy up, and the
    next reader could not tell a bug from an exception somebody meant.
    """
    try:
        ClassStaffService(session).remove_coach(class_id, person_id, on=now().date())
    except ClassStaffNotFoundError as exc:
        raise _not_found() from exc
    except StillCoachingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "still_coaching", "message": str(exc)},
        ) from exc
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- health templates (conflict C3) -------------------------------------------
@router.get("/health-templates", response_model=HealthTemplateListResponse)
def list_health_templates(
    _: TemplateReader, session: TenantSessionDep, kind: str | None = None
) -> HealthTemplateListResponse:
    """Conflict C3's read side, so M3 can find the trial template it must present.

    Managers, owners and GUARDIANS -- `require_template_reader`, shared with the
    questions route it always leads to. It was manager-only until the ship audit mounted
    §6.1's gate and the first family it stopped got a 403 for the form's own list; a
    parent must find the template to fill it. A coach still has no business here -- they
    see `derived_flags` and nothing else (§5.5) -- and this shape holds no question text
    anyway (`id`, `kind`, `version`; the questions live behind the sibling route).
    """
    from sqlalchemy import select

    from app.models.health import HealthFormTemplate

    # **Ordered so `items[0]` of a kind is the CURRENT one.** Ordering by kind alone left the
    # row order to the planner, and a parent client taking the first `full` row could be handed
    # a superseded version to sign -- which the gate then refuses to count, with no error and no
    # way forward. Published first, then highest version.
    stmt = select(HealthFormTemplate).order_by(
        HealthFormTemplate.kind,
        HealthFormTemplate.published_at.is_(None),
        HealthFormTemplate.version.desc(),
    )
    if kind is not None:
        stmt = stmt.where(HealthFormTemplate.kind == kind)
    return HealthTemplateListResponse(
        items=[
            HealthTemplateOut.model_validate(r, from_attributes=True)
            for r in session.execute(stmt).scalars().all()
        ]
    )
