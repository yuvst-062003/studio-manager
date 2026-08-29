"""SPEC §7's `/sessions` block — the coach-facing half of the schedule.

**Tagged `coach`, and that tag is load-bearing.** SPEC §13's third invariant — no
coach-scoped endpoint returns any financial field — is enforced against it by
`tests/invariants/test_03`, so an untagged coach router is an unguarded one. `SessionOut`
carries no money and must never learn to.

Three permission levels, and each is §3.2 or §5.6 verbatim:

* **reading** admits every staff role **and a guardian**. Artboard 12b is a parent's
  calendar of their own child's lessons; a guardian holds no `role_assignment` at all
  (§3.1), so the staff dependency would refuse them and the screen would not exist. The
  service narrows a guardian's query to the groups their children are enrolled in.
* **changing one session** is owner, manager or lead coach — §5.6, 'A manager or lead coach
  can change any single session'.
* **writing a note** is any staff role: §5.13's סיכום מפגש is the assistant coach's too.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.schedule import (
    SessionCancelIn,
    SessionCreate,
    SessionNoteCreate,
    SessionNoteOut,
    SessionNotePage,
    SessionOut,
    SessionPage,
    SessionPatch,
)
from app.services.schedule.service import (
    NotFoundError,
    ScheduleService,
    SessionDeleteRefusedError,
)

router = APIRouter(tags=["coach", "schedule"])

#: §5.6 — 'A manager or lead coach can change any single session.' An assistant coach reads
#: the roster; they do not move the lesson.
ManagerOrLeadCoach = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach"))]

STAFF_ROLES = {"owner", "manager", "lead_coach", "assistant_coach"}

#: `?scope=mine` — see `_visible_groups`. A module-level alias and not an inline
#: `Literal["mine"]`: this module has `from __future__ import annotations`, so an inline one
#: reaches Pydantic as the string `Literal[mine]` and fails to resolve `mine` at startup.
SessionScope = Literal["mine"]


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


def _signed_in(request: Request) -> None:
    """Reading a session needs an identity, not a role. The narrowing **is** the
    authorization, and it happens in `_visible_groups`."""
    if getattr(request.state, "identity_id", None) is None:
        raise _unauthenticated()


SignedIn = Annotated[None, Depends(_signed_in)]


def _visible_groups(
    request: Request, service: ScheduleService, *, guardian_only: bool = False
) -> set[uuid.UUID] | None:
    """`None` for staff — the whole studio. A set for a guardian.

    An **empty** set is a real answer, not a missing one: a signed-in parent whose children
    are not enrolled anywhere sees nothing, and returning `None` for them would show them
    the entire club's calendar. That is why the type is `set | None` and not just `set`.

    `guardian_only` is `?scope=mine` — the caller asking for the guardian narrowing whatever
    else they hold. §19.3's `dev+both` is why it exists: a lead coach who is also a parent
    matched `STAFF_ROLES` here, so the PARENT app received the club's entire timetable, and
    `web/apps/parent/src/features/schedule/client.ts` documents the opposite contract in its
    own header. The flag only ever narrows, so no caller can reach anything with it that
    they could not reach without it, and it needs no authorization of its own.
    """
    roles = set(getattr(request.state, "roles", ()) or ())
    if roles & STAFF_ROLES and not guardian_only:
        return None
    person_id = _person_id(request)
    if person_id is None:
        raise _unauthenticated()
    return service.groups_visible_to_guardian(person_id)


@router.get("/sessions", response_model=SessionPage)
def list_sessions(
    _: SignedIn,
    request: Request,
    session: TenantSessionDep,
    # `from` and `to` are §7's names and `from` is a Python keyword, so the parameters are
    # aliased rather than the endpoint renamed.
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    group_id: uuid.UUID | None = None,
    coach_person_id: uuid.UUID | None = None,
    # `mine` = "the groups my own children are enrolled in", for a caller who may also be
    # staff. See `_visible_groups`. A Literal so the only other value is a 422 rather than a
    # silently ignored typo that hands back the whole studio.
    scope: SessionScope | None = None,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> SessionPage:
    service = ScheduleService(session)
    rows, next_cursor = service.list_sessions(
        from_date=from_date,
        to_date=to_date,
        group_id=group_id,
        coach_person_id=coach_person_id,
        visible_group_ids=_visible_groups(request, service, guardian_only=scope == "mine"),
        cursor=cursor,
        limit=limit,
    )
    return SessionPage(
        items=service.project_sessions(rows),
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(
    _: SignedIn, session_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.get_session(session_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    visible = _visible_groups(request, service)
    if visible is not None and row.group_id not in visible:
        # Invisible, not forbidden: a 403 would confirm another family's lesson exists.
        raise _not_found()
    return service.project_sessions([row])[0]


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_ad_hoc_session(
    _: ManagerOrLeadCoach,
    body: SessionCreate,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.create_ad_hoc_session(body, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return service.project_sessions([row])[0]


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def patch_session(
    _: ManagerOrLeadCoach,
    session_id: uuid.UUID,
    body: SessionPatch,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.patch_session(session_id, body, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return service.project_sessions([row])[0]


@router.post("/sessions/{session_id}/cancel", response_model=SessionOut)
def cancel_session(
    _: ManagerOrLeadCoach,
    session_id: uuid.UUID,
    body: SessionCancelIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.cancel_session(session_id, reason=body.reason, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return service.project_sessions([row])[0]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    _: ManagerOrLeadCoach,
    session_id: uuid.UUID,
    session: TenantSessionDep,
) -> None:
    """F3 -- delete exists for AD-HOC sessions only.

    A generated session answers 409: the next rule expansion would recreate it, and
    attendance rows may already point at it -- cancel is the product's answer there. The
    refusal lives here, not only in the UI that hides the button.
    """
    service = ScheduleService(session)
    try:
        service.delete_session(session_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    except SessionDeleteRefusedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": exc.reason, "message": "cancel this session instead of deleting it"},
        ) from exc
    session.commit()


@router.get("/sessions/{session_id}/notes", response_model=SessionNotePage)
def list_notes(
    _: AnyStaff,
    session_id: uuid.UUID,
    session: TenantSessionDep,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> SessionNotePage:
    try:
        rows, next_cursor = ScheduleService(session).list_notes(
            session_id, cursor=cursor, limit=limit
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    return SessionNotePage(
        items=[SessionNoteOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post(
    "/sessions/{session_id}/notes",
    response_model=SessionNoteOut,
    status_code=status.HTTP_201_CREATED,
)
def add_note(
    _: AnyStaff,
    session_id: uuid.UUID,
    body: SessionNoteCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionNoteOut:
    author = _person_id(request)
    if author is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "a note needs an author"},
        )
    try:
        row = ScheduleService(session).add_note(
            session_id, body=body.body, author_person_id=author, at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return SessionNoteOut.model_validate(row, from_attributes=True)
