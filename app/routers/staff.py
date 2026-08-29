"""`/api/v1/staff` — dashboard artboard 3d (צוות).

§3.2 puts 'Manage staff and role assignments' at owner ✓ manager ✓ and nothing else, which
is the guard this route carries. A coach reading the studio's whole staff table with every
colleague's permissions is not something any coach screen needs.

One route, one payload: 3d is a single view, so it makes a single request rather than
three that have to be reconciled while they land.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas.staff import (
    StaffInvitationIn,
    StaffInvitationOut,
    StaffListResponse,
    StaffRolesIn,
)
from app.services.structure import staff as staff_service

router = APIRouter(tags=["staff"])


@router.get("/staff", response_model=StaffListResponse)
def list_staff(_: ManagerOrOwner, session: TenantSessionDep) -> StaffListResponse:
    # `now()` and not datetime.now(): an expired invitation must expire on the same clock
    # §19.5's X-Dev-Now shifts, or a time-travelled demo shows invitations that are stale
    # everywhere except this screen.
    return StaffListResponse.model_validate(staff_service.list_staff(session, at=now()))


@router.post(
    "/staff/invitations", response_model=StaffInvitationOut, status_code=status.HTTP_201_CREATED
)
def create_staff_invitation(
    _: ManagerOrOwner, body: StaffInvitationIn, request: Request, session: TenantSessionDep
) -> StaffInvitationOut:
    """F5 — הוספת איש צוות. The token comes back once and never again; the manager
    shares the link, because no mailer exists anywhere in this product (the platform's
    owner invite and §5.4b's onboarding link both work the same way)."""
    try:
        invitation, token = staff_service.invite_staff(
            session,
            email=body.email,
            roles=body.roles,
            first_name=body.first_name,
            last_name=body.last_name,
            group_ids=body.group_ids,
            actor_person_id=_person_id(request),
            at=now(),
        )
    except staff_service.StaffError as exc:
        raise _staff_error(exc) from exc
    session.commit()
    return StaffInvitationOut(
        id=str(invitation.id),
        email=invitation.email or "",
        expires_at=invitation.expires_at.isoformat(),
        token=token,
    )


@router.post("/staff/invitations/{invitation_id}/resend", response_model=StaffInvitationOut)
def resend_staff_invitation(
    _: ManagerOrOwner, invitation_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> StaffInvitationOut:
    try:
        invitation, token = staff_service.resend_invitation(
            session, invitation_id, actor_person_id=_person_id(request), at=now()
        )
    except staff_service.StaffError as exc:
        raise _staff_error(exc) from exc
    session.commit()
    return StaffInvitationOut(
        id=str(invitation.id),
        email=invitation.email or "",
        expires_at=invitation.expires_at.isoformat(),
        token=token,
    )


@router.delete("/staff/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_staff_invitation(
    _: ManagerOrOwner, invitation_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> None:
    try:
        staff_service.revoke_invitation(
            session, invitation_id, actor_person_id=_person_id(request), at=now()
        )
    except staff_service.StaffError as exc:
        raise _staff_error(exc) from exc
    session.commit()


@router.patch("/staff/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def change_staff_roles(
    _: ManagerOrOwner,
    person_id: uuid.UUID,
    body: StaffRolesIn,
    request: Request,
    session: TenantSessionDep,
) -> None:
    try:
        staff_service.change_roles(
            session, person_id, roles=body.roles, actor_person_id=_person_id(request), at=now()
        )
    except staff_service.StaffError as exc:
        raise _staff_error(exc) from exc
    session.commit()


@router.post("/staff/{person_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_staff(
    _: ManagerOrOwner, person_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> None:
    """A status change, never a delete — the person holds audit rows, session
    assignments and attendance marks. 409s when they are a group's only lead coach:
    reassign first (F5's decision, recorded in the audit log)."""
    try:
        staff_service.deactivate(session, person_id, actor_person_id=_person_id(request), at=now())
    except staff_service.SoleLeadCoachError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "sole_lead_coach",
                "message": "reassign these groups first",
                "details": {"groups": exc.groups},
            },
        ) from exc
    except staff_service.StaffError as exc:
        raise _staff_error(exc) from exc
    session.commit()


def _person_id(request: Request) -> uuid.UUID | None:
    value = getattr(request.state, "person_id", None)
    return value if isinstance(value, uuid.UUID) else None


def _staff_error(exc: staff_service.StaffError) -> HTTPException:
    if exc.code == "not_found":
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such staff row"},
        )
    if exc.code == "owner_immovable":
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "owner_immovable", "message": "the owner cannot be deactivated"},
        )
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": exc.code, "message": "refused"},
    )
