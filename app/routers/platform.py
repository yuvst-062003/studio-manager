"""SPEC §5.1 and §18.3's M1 subset (conflict C4).

`require_platform_admin` is a router dependency, never a check inside a service
(.claude/rules/api.md: "Authorization is checked in the router via a dependency"). It
reads `request.state.identity_id`, which app/core/auth_context.py set from a verified
claim, and then re-confirms platform-admin against the database rather than trusting the
token's `padm` claim -- that claim is a fifteen-minute snapshot, and removing an operator
must not wait for it to expire.

These routes take `SessionDep`, unscoped, because §18.1 puts the console above every
studio: it creates them, so it cannot be scoped to one. tests/restrictions/test_01's
SESSION_DEP_ALLOWLIST carries that reason.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.clock import now
from app.core.config import settings
from app.core.db import SessionDep
from app.schemas.platform import (
    InvitationOut,
    InviteOwnerRequest,
    JobHealthOut,
    OpsHealthResponse,
    ProvisionStudioRequest,
    SignalOut,
    StudioListResponse,
    StudioOut,
)
from app.services.identity.platform import (
    StudioNotFoundError,
    invite_owner,
    list_studios,
    provision_studio,
    suspend_studio,
)
from app.services.identity.resolution import is_platform_admin
from app.services.ops.alerts import email_configured
from app.services.ops.checks import job_health, red_check_ids, signals

router = APIRouter(prefix="/platform", tags=["platform"])


def require_platform_admin(request: Request, session: SessionDep) -> uuid.UUID:
    """§5.1's first link, enforced.

    §6.1: "Staff-app access is provisioned, never self-service ... there is no path from
    'I downloaded the app' to 'I have a studio'." This dependency is that sentence: an
    ordinary signed-in identity gets 403 from every route below.
    """
    identity_id = getattr(request.state, "identity_id", None)
    if not isinstance(identity_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    if not is_platform_admin(session, identity_id):
        # The refusal says what you may not do and never whether the thing you asked
        # about exists -- the same rule §6.1 applies to its two screens.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "not_a_platform_admin", "message": "this console is not yours"},
        )
    return identity_id


PlatformAdminDep = Annotated[uuid.UUID, Depends(require_platform_admin)]


@router.get("/studios", response_model=StudioListResponse)
def get_studios(_: PlatformAdminDep, session: SessionDep) -> StudioListResponse:
    """§18.3's studio list, M1's subset: the rows, not the health chips (C4 -- M9 owns
    those, and the operations board with them)."""
    return StudioListResponse(
        items=[StudioOut.model_validate(s, from_attributes=True) for s in list_studios(session)]
    )


@router.post("/studios", response_model=StudioOut, status_code=status.HTTP_201_CREATED)
def create_studio(
    actor: PlatformAdminDep, body: ProvisionStudioRequest, session: SessionDep
) -> StudioOut:
    """§5.1 -- 'Studios are provisioned by the platform operator, never self-created.
    There is no צור סטודיו button anywhere in the staff app.'"""
    studio = provision_studio(
        session,
        name=body.name,
        slug=body.slug,
        timezone=body.timezone,
        default_locale=body.default_locale,
        created_by_identity_id=actor,
        at=now(),
    )
    session.commit()
    return StudioOut.model_validate(studio, from_attributes=True)


@router.post(
    "/studios/{studio_id}/invite-owner",
    response_model=InvitationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_owner_invitation(
    actor: PlatformAdminDep,
    studio_id: uuid.UUID,
    body: InviteOwnerRequest,
    session: SessionDep,
) -> InvitationOut:
    """§5.1 -- 'and sends an invitation to the person who will be its owner.'

    The token comes back in this response and nowhere else, ever. Only its hash is stored.
    """
    try:
        invitation, token = invite_owner(
            session,
            studio_id=studio_id,
            email=body.email,
            first_name=body.first_name,
            last_name=body.last_name,
            granted_by_identity_id=actor,
            at=now(),
        )
    except StudioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "no_such_studio", "message": "no such studio"},
        ) from exc
    session.commit()
    return InvitationOut(
        id=invitation.id,
        email=body.email,
        expires_at=invitation.expires_at,
        token=token,
    )


@router.post("/studios/{studio_id}/suspend", response_model=StudioOut)
def suspend(actor: PlatformAdminDep, studio_id: uuid.UUID, session: SessionDep) -> StudioOut:
    """§18.3's suspend action. A suspended studio disappears from every switcher, because
    `studios_for_identity` skips a non-active one."""
    try:
        studio = suspend_studio(session, studio_id=studio_id, actor_identity_id=actor, at=now())
    except StudioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "no_such_studio", "message": "no such studio"},
        ) from exc
    session.commit()
    return StudioOut.model_validate(studio, from_attributes=True)


@router.get("/health", response_model=OpsHealthResponse)
def get_ops_health(_: PlatformAdminDep, session: SessionDep) -> OpsHealthResponse:
    """§18.3's operations board -- the health chips `get_studios` deferred.

    **Platform-admin, like every route in this file.** The job heartbeats are cross-studio
    by nature (`sessions-complete` sweeps every club in one pass), so there is no studio
    this could be scoped to and no owner it could honestly be shown to. A club owner
    seeing the health of jobs for studios that are not theirs is a tenancy leak with a
    friendly name.

    **Not `/health`.** `app/routers/health.py` owns that: an unauthenticated liveness
    probe that answers "is this process alive" and deliberately carries no tenant data.
    This one answers "is this deployment WORKING", needs an operator, and reads the
    database on every call -- three differences that make them different endpoints rather
    than two shapes of one.
    """
    at = now()
    jobs = job_health(session, at=at)
    found = signals(session, at=at)
    red = red_check_ids(jobs, found)
    return OpsHealthResponse(
        status="red" if red else "ok",
        checked_at=at,
        env=settings.ENV,
        jobs=[JobHealthOut.model_validate(job, from_attributes=True) for job in jobs],
        signals=[SignalOut.model_validate(signal, from_attributes=True) for signal in found],
        email_configured=email_configured(),
    )
