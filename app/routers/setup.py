"""`/api/v1/setup` -- SPEC §5.1's resumable wizard, server side.

app/main.py mounts routers by discovery, so adding this file mounts it. No registration
edit, and no shared file to conflict on.

Steps 3 and 5 need **no endpoints of their own**: `POST /classes`, `/groups`, `/locations`,
`/groups/{id}/staff` and the invitation flow all shipped in M1.4. What is new here is only
the progress the wizard resumes from.

§3.2 puts studio settings at owner ✓ manager ✓, which is the guard every route carries.
Routing into the wizard is narrower than that -- §6.1's staff arm says *owner* -- but that
is a client decision about where to send someone, not a rule about who may configure a
studio they already administer.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status

from app.core.auth_context import ManagerOrOwner
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.schemas.setup import SetupProgressOut, SetupStepIn
from app.services.structure import setup as setup_service

router = APIRouter(tags=["setup"])


def _actor(request: Request) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    person_id = getattr(request.state, "person_id", None)
    identity_id = getattr(request.state, "identity_id", None)
    return (
        person_id if isinstance(person_id, uuid.UUID) else None,
        identity_id if isinstance(identity_id, uuid.UUID) else None,
    )


@router.get("/setup", response_model=SetupProgressOut)
def read_setup(_: ManagerOrOwner, session: TenantSessionDep) -> SetupProgressOut:
    return SetupProgressOut.model_validate(
        setup_service.read(session, studio_id=require_current_studio_id())
    )


@router.patch("/setup/steps/{step_id}", response_model=SetupProgressOut)
def update_step(
    _: ManagerOrOwner,
    step_id: str,
    body: SetupStepIn,
    request: Request,
    session: TenantSessionDep,
) -> SetupProgressOut:
    person_id, identity_id = _actor(request)
    try:
        progress = setup_service.set_step(
            session,
            studio_id=require_current_studio_id(),
            step_id=step_id,
            status=body.status,
            actor_person_id=person_id,
            actor_identity_id=identity_id,
        )
    except setup_service.UnknownStepError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "unknown_step",
                "message": f"the wizard has no step {step_id!r}",
            },
        ) from exc
    session.commit()
    return SetupProgressOut.model_validate(progress)


@router.post("/setup/dismiss", response_model=SetupProgressOut)
def dismiss_setup(
    _: ManagerOrOwner, request: Request, session: TenantSessionDep
) -> SetupProgressOut:
    """§5.1's exit at step 6. Stops auto-routing; says nothing about completeness."""
    person_id, identity_id = _actor(request)
    progress = setup_service.dismiss(
        session,
        studio_id=require_current_studio_id(),
        actor_person_id=person_id,
        actor_identity_id=identity_id,
    )
    session.commit()
    return SetupProgressOut.model_validate(progress)
