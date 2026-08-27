"""§5.4b -- the member onboarding link, the routes (docs/onboarding-link-spec.md).

Three doors with three auth stories, and the split is the security model:

* the manager card (`/onboarding-link`) -- owner/manager, tenant-scoped, coaches see
  nothing;
* the public validation read -- anonymous; the token is CONTEXT, never authorization,
  and it answers with what the landing page already publishes (name, logo, groups with
  schedules) and nothing else;
* the registration -- a SIGNED-IN identity with no membership required; the studio is
  resolved from the token, the writes run inside a tenant scope opened for exactly that
  studio, and everything the submission creates belongs to the person who submitted it.

Invalid, expired and revoked tokens all answer the same 404: no oracle distinguishing
'never existed' from 'revoked'.
"""

from __future__ import annotations

import datetime
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.config import settings
from app.core.cors import app_origin
from app.core.db import SessionDep, get_engine
from app.core.tenancy import TenantSession, TenantSessionDep, use_studio
from app.models.identity import AuthIdentity
from app.models.studio import Studio
from app.services.people.errors import NotFoundError, RefusedError
from app.services.people.landing import LandingService
from app.services.people.onboarding import OnboardingService
from app.services.schedule import ScheduleService

router = APIRouter(tags=["people"])


# -- shapes -------------------------------------------------------------------
class OnboardingLinkStatusOut(BaseModel):
    active: bool
    expires_at: datetime.datetime | None
    registered_count: int
    #: §5.4a's shop window, on the same sharing card family: the client cannot know the
    #: parent app's origin (it differs per environment), so the server says it.
    landing_url: str | None = None


class OnboardingLinkCreatedOut(BaseModel):
    """The URL appears here and nowhere else, once."""

    url: str
    expires_at: datetime.datetime
    registered_count: int


class OnboardingGroupOut(BaseModel):
    id: uuid.UUID
    name: str
    class_name: str | None
    weekdays: list[int]


class OnboardingInfoOut(BaseModel):
    studio_name: str
    groups: list[OnboardingGroupOut]
    #: The provider-verified address the form shows READ-ONLY (spec: a typed email is
    #: unverified and can be wrong; the verified one already exists). Null when the
    #: caller is anonymous -- the screen asks them to sign in first.
    email: str | None


class OnboardingChildIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    birthdate: datetime.date | None = None
    group_ids: list[uuid.UUID] = Field(min_length=1, max_length=6)
    #: §5.3's adult member -- "אני התלמיד". One Person, both roles.
    self_student: bool = False


class OnboardingRegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=32)
    children: list[OnboardingChildIn] = Field(min_length=1, max_length=8)


class OnboardingRegisterOut(BaseModel):
    person_id: uuid.UUID
    student_ids: list[uuid.UUID]
    charges_created: int
    already_registered: bool


def _not_valid() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "link_not_valid", "message": "הקישור פג תוקף"},
    )


def _share_url(token: str) -> str:
    origin = app_origin("parent", settings.ENV) or ""
    return f"{origin}/join/{token}"


# -- the manager card ---------------------------------------------------------
def _landing_url(session: TenantSession) -> str | None:
    from app.core.tenancy import require_current_studio_id

    studio = session.get(Studio, require_current_studio_id())
    if studio is None:
        return None
    origin = app_origin("parent", settings.ENV) or ""
    return f"{origin}/t/{studio.slug}"


@router.get("/onboarding-link", response_model=OnboardingLinkStatusOut)
def link_status(_: ManagerOrOwner, session: TenantSessionDep) -> OnboardingLinkStatusOut:
    live = OnboardingService.current(session, at=now())
    return OnboardingLinkStatusOut(
        active=live is not None,
        expires_at=live.expires_at if live else None,
        registered_count=OnboardingService.registered_count(session),
        landing_url=_landing_url(session),
    )


@router.post(
    "/onboarding-link", response_model=OnboardingLinkCreatedOut, status_code=status.HTTP_201_CREATED
)
def regenerate_link(
    _: ManagerOrOwner, request: Request, session: TenantSessionDep
) -> OnboardingLinkCreatedOut:
    from app.core.tenancy import require_current_studio_id

    studio_id = require_current_studio_id()
    row, token = OnboardingService.regenerate(
        session,
        studio_id,
        actor_person_id=getattr(request.state, "person_id", None),
        at=now(),
    )
    session.commit()
    return OnboardingLinkCreatedOut(
        url=_share_url(token),
        expires_at=row.expires_at,
        registered_count=OnboardingService.registered_count(session),
    )


@router.delete("/onboarding-link", response_model=OnboardingLinkStatusOut)
def revoke_link(
    _: ManagerOrOwner, request: Request, session: TenantSessionDep
) -> OnboardingLinkStatusOut:
    OnboardingService.revoke(
        session, actor_person_id=getattr(request.state, "person_id", None), at=now()
    )
    session.commit()
    return OnboardingLinkStatusOut(
        active=False,
        expires_at=None,
        registered_count=OnboardingService.registered_count(session),
    )


# -- the public read ----------------------------------------------------------
@router.get("/public/onboarding/{token}", response_model=OnboardingInfoOut)
def onboarding_info(token: str, request: Request, session: SessionDep) -> OnboardingInfoOut:
    """Validate the token and hand the form what it renders: the studio's name and its
    groups with their weekly days -- exactly what §5.4a's landing page already publishes,
    and nothing else. The form displays no existing data whatsoever."""
    try:
        link = OnboardingService.resolve(session, token=token, at=now())
    except NotFoundError as exc:
        raise _not_valid() from exc
    studio = session.get(Studio, link.studio_id)
    assert studio is not None

    with (
        use_studio(link.studio_id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        try:
            groups = LandingService.public_groups(
                scoped,
                studio_id=link.studio_id,
                since=now().date(),
                schedule=ScheduleService(scoped),
            )
        except NotImplementedError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "schedule_unavailable", "message": "try again shortly"},
            ) from exc
        # Never committed -- a validation read must not leave rows behind, same as
        # the public landing (app/routers/public.py's own rule).
        scoped.rollback()

    email: str | None = None
    identity_id = getattr(request.state, "identity_id", None)
    if isinstance(identity_id, uuid.UUID):
        identity = session.get(AuthIdentity, identity_id)
        email = identity.email if identity else None

    return OnboardingInfoOut(
        studio_name=studio.name,
        groups=[
            OnboardingGroupOut(
                id=group.id,
                name=group.name,
                class_name=None,
                weekdays=list(group.training_weekdays),
            )
            for group in groups
        ],
        email=email,
    )


# -- the registration ---------------------------------------------------------
@router.post(
    "/onboarding/{token}/register",
    response_model=OnboardingRegisterOut,
    status_code=status.HTTP_201_CREATED,
)
def register(
    token: str, body: OnboardingRegisterIn, request: Request, session: SessionDep
) -> OnboardingRegisterOut:
    """The one-transaction creation. Signed-in identity required, membership NOT --
    §5.4b's whole point is that this person has no membership yet. Idempotent per
    identity: a resubmission answers with the existing family instead of a duplicate."""
    identity_id = getattr(request.state, "identity_id", None)
    if not isinstance(identity_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    try:
        link = OnboardingService.resolve(session, token=token, at=now())
    except NotFoundError as exc:
        raise _not_valid() from exc

    identity = session.get(AuthIdentity, identity_id)

    with (
        use_studio(link.studio_id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        existing = OnboardingService.existing_registration(
            scoped, studio_id=link.studio_id, identity_id=identity_id
        )
        if existing is not None:
            from sqlalchemy import select

            from app.models.person import Guardian

            student_ids = list(
                scoped.execute(
                    select(Guardian.student_id).where(Guardian.person_id == existing.id)
                ).scalars()
            )
            return OnboardingRegisterOut(
                person_id=existing.id,
                student_ids=student_ids,
                charges_created=0,
                already_registered=True,
            )
        try:
            parent, student_ids, charged = OnboardingService.register(
                scoped,
                studio_id=link.studio_id,
                identity_id=identity_id,
                first_name=body.first_name,
                last_name=body.last_name,
                phone=body.phone,
                email=identity.email if identity else None,
                children=[
                    {
                        "first_name": child.first_name,
                        "last_name": child.last_name,
                        "birthdate": child.birthdate,
                        "group_ids": child.group_ids,
                        "self": child.self_student,
                    }
                    for child in body.children
                ],
                at=now(),
                schedule=ScheduleService(scoped),
            )
        except NotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "not_found", "message": str(exc)},
            ) from exc
        except RefusedError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "refused", "message": str(exc)},
            ) from exc
        scoped.commit()
        return OnboardingRegisterOut(
            person_id=parent.id,
            student_ids=student_ids,
            charges_created=charged,
            already_registered=False,
        )
