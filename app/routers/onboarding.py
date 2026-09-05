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
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.config import settings
from app.core.cors import app_origin
from app.core.db import SessionDep, get_engine
from app.core.tenancy import TenantSession, TenantSessionDep, require_current_studio_id, use_studio
from app.models.identity import AuthIdentity
from app.models.person import Person
from app.models.studio import Studio
from app.schemas._pagination import MAX_PAGE_SIZE
from app.services.billing.catalogue import CatalogueService
from app.services.health.agreement import (
    AgreementError,
    NationalIdInvalidError,
    RegistrationIncompleteError,
)
from app.services.health.clauses import ClauseMismatchError
from app.services.health.club_terms import CLUB_TERMS_VERSION
from app.services.health.declarations import (
    AnswersIncompleteError,
    DeclarationNotFoundError,
    SignatureNotAPngError,
    SignatureRequiredError,
    TemplateSupersededError,
)
from app.services.people.errors import NotFoundError, RefusedError
from app.services.people.landing import LandingService
from app.services.people.onboarding import OnboardingService
from app.services.people.onboarding_status import OnboardingStatusService, OnboardingStepKey
from app.services.schedule import ScheduleService

router = APIRouter(tags=["people"])


# -- shapes -------------------------------------------------------------------
class OnboardingLinkStatusOut(BaseModel):
    active: bool
    expires_at: datetime.datetime | None
    registered_count: int
    #: The live link itself, so the card's העתקה button works on every load and not only
    #: in the seconds after creation (2026-08-31). Null when there is no live link — and
    #: also for a pre-2026-08-31 row, whose token was only ever hashed and cannot be
    #: recovered; the card offers those a regenerate instead.
    #:
    #: Manager-or-owner only, like every field beside it: §3.2 gives coaches no card at
    #: all, and this route is already behind that dependency.
    url: str | None = None
    #: §5.4a's shop window, on the same sharing card family: the client cannot know the
    #: parent app's origin (it differs per environment), so the server says it.
    landing_url: str | None = None


class OnboardingLinkCreatedOut(BaseModel):
    """The freshly created link. Since 2026-08-31 the URL also comes back from `GET`,
    so this is the creation receipt rather than the one chance to read it."""

    url: str
    #: NULL — the link is permanent. Kept in the shape for a time-boxed link later.
    expires_at: datetime.datetime | None
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
    #: The studio's own slug -- what lets a caller who has not signed in yet still be
    #: shown the club's shop window (`/t/<slug>`) if the wizard ever needs to link there.
    slug: str
    #: Same shape and same route as `PublicLandingOut.logo_url` (`app/routers/public.py`):
    #: an API PATH, not a public URL, null when the studio has no uploaded logo. This is
    #: what lets the sign-in wall AND the welcome screen show the club's own logo before
    #: anyone has signed in -- reusing the existing unauthenticated
    #: `GET /public/studios/{slug}/logo` rather than inventing a second logo route.
    logo_url: str | None
    #: `app/services/health/club_terms.py::CLUB_TERMS_VERSION`, live -- what the welcome
    #: screen's club-terms card shows next to "קריאת המסמך המלא", replacing a frontend
    #: constant that had to be bumped by hand in step with this one and had no test
    #: keeping the two in sync. Non-optional: this endpoint always has the number, the
    #: same way it always has `slug`.
    club_terms_version: int


class OnboardingPickupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=32)


class OnboardingOtherParentIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    national_id: str | None = Field(default=None, max_length=20)
    phone: str | None = Field(default=None, max_length=32)


class OnboardingSignerIn(BaseModel):
    national_id: str = Field(min_length=1, max_length=20)
    address: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=80)
    phone_home: str | None = Field(default=None, max_length=32)
    aliyah_year: str | None = Field(default=None, max_length=8)
    relation: Literal["mother", "father", "other"] = "mother"


class OnboardingHealthDeclarationIn(BaseModel):
    """B2, decision 2: the single write carries 'every health declaration' -- one of
    these per child who needs one, in the same request that creates them. Same shape
    `HealthDeclarationIn` already uses for the standalone
    `POST /students/{id}/health-declaration`; not reused directly because that schema is
    keyed to an existing student and this one arrives before the student does."""

    template_id: uuid.UUID
    answers: dict[str, Any] = Field(default_factory=dict)
    signature_image_base64: str = Field(default="", max_length=2_000_000)


class OnboardingChildIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    birthdate: datetime.date | None = None
    group_ids: list[uuid.UUID] = Field(min_length=1, max_length=6)
    #: §5.3's adult member -- "אני התלמיד". One Person, both roles.
    self_student: bool = False
    national_id: str | None = Field(default=None, max_length=20)
    grade: str | None = Field(default=None, max_length=20)
    #: B2 -- null when this child's declaration is already on file (a resubmission of a
    #: kid who signed one in an earlier pass through this same wizard run) or, for a
    #: door that skips health entirely, never asked at all.
    health: OnboardingHealthDeclarationIn | None = None
    #: F7 -- per-child, additive on top of the register body's own top-level
    #: `other_parent`/`pickup_contacts`. `None`/empty here falls back to those (kept for
    #: any caller still submitting the old family-wide shape); a self-guarding child
    #: never receives either regardless of what is sent
    #: (`OnboardingService._apply_family_details`). This is what lets two siblings in one
    #: submission carry DIFFERENT second-parent/pickup details -- the family-wide pair
    #: this used to be always applied the same answer to every child in the batch.
    other_parent: OnboardingOtherParentIn | None = None
    pickup_contacts: list[OnboardingPickupIn] = Field(default_factory=list, max_length=10)
    #: Decision 14 -- each student picks their own plan, in the students step. `None`
    #: leaves the child unpriced by choice, same as no plan covering their volume
    #: (`plan_for_volume`). A non-null id that does not cover this child's chosen groups'
    #: weekly volume is refused (422) -- CLAUDE.md's "refuse rather than accept, when
    #: accepting creates a dead end": the picker only ever OFFERS a covering plan, but a
    #: stale or crafted request must not silently mis-price a family.
    price_plan_id: uuid.UUID | None = None


class OnboardingRegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=32)
    signer: OnboardingSignerIn | None = None
    other_parent: OnboardingOtherParentIn | None = None
    pickup_contacts: list[OnboardingPickupIn] = Field(default_factory=list, max_length=10)
    children: list[OnboardingChildIn] = Field(min_length=1, max_length=8)
    #: B2, decision 2 -- the club-terms tick from step 1, carried to the same write
    #: rather than a separate `POST .../agreement/club-terms` the old two-write flow
    #: made right after `register`. Recorded against today's live `CLUB_TERMS_VERSION`:
    #: the wizard always re-fetches step 1 fresh (no cached, possibly-stale version to
    #: echo back), so there is no stale-screen case for the client to name a version for.
    club_terms_accepted: bool = False


class OnboardingRegisterOut(BaseModel):
    person_id: uuid.UUID
    #: What THIS submission created. A child already on the account is skipped rather than
    #: duplicated, so a resubmission can return fewer ids than it was given children.
    student_ids: list[uuid.UUID]
    #: One id per child in the submitted order, created here or already on the roster.
    #: `student_ids` says what was created; this says what each submitted child IS, which
    #: is what a caller needs to attach a payment choice to a child it did not create.
    child_student_ids: list[uuid.UUID]
    charges_created: int
    #: The parent already had a Person in this studio and was adopted rather than created --
    #: a trial family, almost always. It no longer means "and so nothing was done": the
    #: missing children are created either way.
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

    studio = session.get(Studio, require_current_studio_id())
    if studio is None:
        return None
    origin = app_origin("parent", settings.ENV) or ""
    return f"{origin}/t/{studio.slug}"


@router.get("/onboarding-link", response_model=OnboardingLinkStatusOut)
def link_status(_: ManagerOrOwner, session: TenantSessionDep) -> OnboardingLinkStatusOut:
    live = OnboardingService.current(session, at=now())
    token = OnboardingService.token_of(live) if live else None
    return OnboardingLinkStatusOut(
        active=live is not None,
        expires_at=live.expires_at if live else None,
        registered_count=OnboardingService.registered_count(session),
        landing_url=_landing_url(session),
        url=_share_url(token) if token else None,
    )


@router.post(
    "/onboarding-link", response_model=OnboardingLinkCreatedOut, status_code=status.HTTP_201_CREATED
)
def regenerate_link(
    _: ManagerOrOwner, request: Request, session: TenantSessionDep
) -> OnboardingLinkCreatedOut:

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
        slug=studio.slug,
        logo_url=(f"/api/v1/public/studios/{studio.slug}/logo" if studio.logo_object_key else None),
        club_terms_version=CLUB_TERMS_VERSION,
    )


# -- the parent-readable plan list ---------------------------------------------
class OnboardingPricePlanOut(BaseModel):
    """§6's narrower read: name, price, sessions-per-week -- nothing else. `PricePlanOut`
    (`app/routers/billing.py`) also carries the registration fee and the standing-order
    link URL, both fine for a manager and neither for a stranger with a join link."""

    id: uuid.UUID
    name: str
    monthly_amount_agorot: int
    sessions_per_week: int | None


class OnboardingPricePlanListOut(BaseModel):
    items: list[OnboardingPricePlanOut]


@router.get(
    "/public/onboarding/{token}/price-plans",
    response_model=OnboardingPricePlanListOut,
)
def onboarding_price_plans(token: str, session: SessionDep) -> OnboardingPricePlanListOut:
    """Decision 14's plan picker, its data source. `GET /price-plans` is
    `ManagerOrOwner`-only and its response shape leaks cost fields a parent should never
    see -- this reuses `CatalogueService`'s own query (the one place plan selection is
    read from) rather than a second implementation, and narrows only the auth (the join
    token, not a manager session) and the response shape.

    The picker filters client-side to plans that cover the groups chosen for one
    student; `OnboardingService.register` is the actual authority and refuses (422) a
    submitted plan that does not, so a stale list here costs a round trip, not a
    mis-priced family.
    """
    try:
        link = OnboardingService.resolve(session, token=token, at=now())
    except NotFoundError as exc:
        raise _not_valid() from exc

    with (
        use_studio(link.studio_id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        rows, _ = CatalogueService(scoped).list_price_plans(limit=MAX_PAGE_SIZE)
        # Read every field the response needs BEFORE the rollback below: `rollback()`
        # expires every ORM instance regardless of `expire_on_commit`, and the session
        # closes with the `with` block, so building `OnboardingPricePlanOut` rows after
        # either would hit a detached instance.
        items = [
            OnboardingPricePlanOut(
                id=row.id,
                name=row.name,
                monthly_amount_agorot=row.monthly_amount_agorot,
                sessions_per_week=row.sessions_per_week,
            )
            for row in rows
            # Live only -- a closed plan is not one a new family can join.
            if row.active_to is None
        ]
        # Never committed -- a read must not leave rows behind, same rule
        # `onboarding_info` above follows.
        scoped.rollback()

    return OnboardingPricePlanListOut(items=items)


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
        # **Whether this identity already has a Person here, NOT whether to refuse.**
        #
        # This used to short-circuit: an existing Person meant `already_registered: true`,
        # zero children created, and a family sent away. Booking a trial creates exactly
        # that Person, so the club's most natural funnel -- try it, like it, get sent the
        # link -- silently did nothing for every trial family it was aimed at. The service
        # now adopts the existing parent and adds the missing children; a child already on
        # the account is skipped by the duplicate check rather than duplicated.
        existing = OnboardingService.existing_registration(
            scoped, studio_id=link.studio_id, identity_id=identity_id
        )
        try:
            result = OnboardingService.register(
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
                        "national_id": child.national_id,
                        "grade": child.grade,
                        "health": (
                            {
                                "template_id": child.health.template_id,
                                "answers": child.health.answers,
                                "signature_image_base64": child.health.signature_image_base64,
                            }
                            if child.health is not None
                            else None
                        ),
                        # F7 -- per child, additive. See `OnboardingChildIn`.
                        "other_parent": (
                            {
                                "first_name": child.other_parent.first_name,
                                "last_name": child.other_parent.last_name,
                                "national_id": child.other_parent.national_id,
                                "phone": child.other_parent.phone,
                            }
                            if child.other_parent is not None
                            else None
                        ),
                        "pickup_contacts": [
                            {"name": contact.name, "phone": contact.phone, "relation": None}
                            for contact in child.pickup_contacts
                        ],
                        # Decision 14 -- per child. See `OnboardingChildIn`.
                        "price_plan_id": child.price_plan_id,
                    }
                    for child in body.children
                ],
                club_terms_accepted=body.club_terms_accepted,
                signed_ip=request.client.host if request.client else None,
                signed_user_agent=request.headers.get("user-agent"),
                signer=(
                    {
                        "national_id": body.signer.national_id,
                        "address": body.signer.address,
                        "city": body.signer.city,
                        "phone_home": body.signer.phone_home,
                        "aliyah_year": body.signer.aliyah_year,
                        "relation": body.signer.relation,
                    }
                    if body.signer is not None
                    else None
                ),
                other_parent=(
                    {
                        "first_name": body.other_parent.first_name,
                        "last_name": body.other_parent.last_name,
                        "national_id": body.other_parent.national_id,
                        "phone": body.other_parent.phone,
                    }
                    if body.other_parent is not None
                    else None
                ),
                pickup_contacts=[
                    {"name": contact.name, "phone": contact.phone, "relation": None}
                    for contact in body.pickup_contacts
                ],
                at=now(),
                schedule=ScheduleService(scoped),
                actor_identity_id=identity_id,
            )
        except NationalIdInvalidError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "national_id_invalid", "field": exc.field},
            ) from exc
        except RegistrationIncompleteError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "registration_incomplete", "fields": exc.fields},
            ) from exc
        except AgreementError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "agreement_error", "message": str(exc)},
            ) from exc
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
        # The same error shapes `POST /students/{id}/health-declaration` answers
        # (app/routers/health_declarations.py) -- decision 2 moved the write into this
        # one call, not the rules a client already handles for it.
        except DeclarationNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "not_found", "message": str(exc)},
            ) from exc
        except SignatureRequiredError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "signature_required", "message": str(exc)},
            ) from exc
        except SignatureNotAPngError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "signature_not_a_png", "message": str(exc)},
            ) from exc
        except AnswersIncompleteError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "answers_incomplete", "message": f"unanswered: {exc}"},
            ) from exc
        except TemplateSupersededError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "template_superseded", "message": str(exc)},
            ) from exc
        except ClauseMismatchError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "clause_mismatch", "message": str(exc)},
            ) from exc
        scoped.commit()
        return OnboardingRegisterOut(
            person_id=result.parent.id,
            student_ids=result.student_ids,
            child_student_ids=result.child_student_ids,
            charges_created=result.charges_created,
            already_registered=existing is not None,
        )


# -- doors C and D: the same write, with no token --------------------------------
class OnboardingSelfRegisterIn(BaseModel):
    """§3 Doors C and D's final write. Door B/C's shape (`OnboardingRegisterIn`) resolves
    its studio from a TOKEN because the caller belongs to nowhere yet; this caller already
    belongs HERE (`TenantSessionDep` below fails closed otherwise), so there is no token to
    carry and no parent identity to introduce -- both are read off the session.

    `children` reuses `OnboardingChildIn` exactly -- decision 6/F19's member fork of a
    Door D row (ת.ז., plan, health) is that shape end to end, and Door C's manager stub
    is completed through the exact same `add_child` duplicate-adopt path Door B already
    exercises, not a second mechanism.
    """

    children: list[OnboardingChildIn] = Field(min_length=1, max_length=4)
    #: §3 -- "skipped, not absent... reappears only when CLUB_TERMS_VERSION or
    #: POLICY_VERSION has moved". `False` costs nothing when the status already marked
    #: the step done and the wizard never showed it.
    club_terms_accepted: bool = False


def _signer_from_existing_person(parent: Person) -> dict[str, Any] | None:
    """The parent's own on-file details, reused rather than re-asked.

    §3 Door D: "Birthdate and ת.ז. are asked; there is nothing to copy them from" names
    only the CHILD's own fields -- the PARENT's address and ת.ז. were already collected
    the first time this family registered (`AgreementService.save_registration` writes
    them onto the signing guardian's own `Person` row, never the child's), so Door D does
    not ask for them a second time.

    `None` when nothing is on file yet -- honest for a caller who somehow reaches this
    door before ever completing Door B/C (not a state today's UI can produce, since
    `/me/onboarding-status` only opens Door D past the `students` step for a family with
    at least one existing child, but a route must answer honestly rather than 500 on it).
    `OnboardingService.register` treats a `None` signer as "skip the household write"
    for this run, same as any other caller who submits no signer block.
    """
    national_id = parent.national_id_encrypted.decode() if parent.national_id_encrypted else None
    if not national_id or not parent.address or not parent.city:
        return None
    return {
        "national_id": national_id,
        "address": parent.address,
        "city": parent.city,
        "phone_home": parent.phone_home,
        "aliyah_year": (
            parent.aliyah_year_encrypted.decode()
            if isinstance(parent.aliyah_year_encrypted, bytes)
            else None
        ),
        "relation": "mother",
    }


@router.post(
    "/me/students/register",
    response_model=OnboardingRegisterOut,
    status_code=status.HTTP_201_CREATED,
)
def register_additional_child(
    body: OnboardingSelfRegisterIn, request: Request, session: TenantSessionDep
) -> OnboardingRegisterOut:
    """§3 Doors C and D -- the wizard's one write, reached by a parent who ALREADY belongs
    to this studio. `TenantSessionDep` is what makes that safe to assume: it fails closed
    (401) the moment there is no active studio, the same guarantee the token-based
    `register()` above re-derives by hand for a caller who has none yet.

    Reuses `OnboardingService.register` end to end -- the same pricing, enrollment,
    health-declaration and club-terms-acceptance code the join link runs -- so a
    manager-created stub (Door C: "the student, name only") is completed rather than
    duplicated by the very same duplicate-adopt path `register` already has, and decision
    6/F19 (health and payment scoped to only the student THIS call creates) falls out of
    `student_ids` being exactly what this submission created, same as every other door.
    """
    identity_id = getattr(request.state, "identity_id", None)
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID) or not isinstance(identity_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    parent = session.get(Person, person_id)
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such person"},
        )
    studio_id = require_current_studio_id()

    try:
        result = OnboardingService.register(
            session,
            studio_id=studio_id,
            identity_id=identity_id,
            first_name=parent.first_name,
            last_name=parent.last_name,
            phone=parent.phone,
            email=parent.email,
            children=[
                {
                    "first_name": child.first_name,
                    "last_name": child.last_name,
                    "birthdate": child.birthdate,
                    "group_ids": child.group_ids,
                    "self": child.self_student,
                    "national_id": child.national_id,
                    "grade": child.grade,
                    "health": (
                        {
                            "template_id": child.health.template_id,
                            "answers": child.health.answers,
                            "signature_image_base64": child.health.signature_image_base64,
                        }
                        if child.health is not None
                        else None
                    ),
                    "other_parent": (
                        {
                            "first_name": child.other_parent.first_name,
                            "last_name": child.other_parent.last_name,
                            "national_id": child.other_parent.national_id,
                            "phone": child.other_parent.phone,
                        }
                        if child.other_parent is not None
                        else None
                    ),
                    "pickup_contacts": [
                        {"name": contact.name, "phone": contact.phone, "relation": None}
                        for contact in child.pickup_contacts
                    ],
                    "price_plan_id": child.price_plan_id,
                }
                for child in body.children
            ],
            club_terms_accepted=body.club_terms_accepted,
            signed_ip=request.client.host if request.client else None,
            signed_user_agent=request.headers.get("user-agent"),
            signer=_signer_from_existing_person(parent),
            other_parent=None,
            pickup_contacts=[],
            at=now(),
            schedule=ScheduleService(session),
            actor_identity_id=identity_id,
        )
    except NationalIdInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "national_id_invalid", "field": exc.field},
        ) from exc
    except RegistrationIncompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "registration_incomplete", "fields": exc.fields},
        ) from exc
    except AgreementError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "agreement_error", "message": str(exc)},
        ) from exc
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
    except DeclarationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": str(exc)},
        ) from exc
    except SignatureRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "signature_required", "message": str(exc)},
        ) from exc
    except SignatureNotAPngError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "signature_not_a_png", "message": str(exc)},
        ) from exc
    except AnswersIncompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "answers_incomplete", "message": f"unanswered: {exc}"},
        ) from exc
    except TemplateSupersededError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "template_superseded", "message": str(exc)},
        ) from exc
    except ClauseMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "clause_mismatch", "message": str(exc)},
        ) from exc
    session.commit()
    return OnboardingRegisterOut(
        person_id=result.parent.id,
        student_ids=result.student_ids,
        child_student_ids=result.child_student_ids,
        charges_created=result.charges_created,
        already_registered=True,
    )


# -- "what is left" ------------------------------------------------------------
class OnboardingStepOut(BaseModel):
    key: OnboardingStepKey
    complete: bool


class OnboardingStatusOut(BaseModel):
    """§3's one read that replaces four screens each guessing from a different pile of
    facts (`student.status`, `health_status`, `agreement_complete`, `price_plan_id` being
    null, consent records, `trial_booking.attended`, `session.access.parent`) -- their
    disagreement is the cause of the dead end where a parent signs the same health form
    forever.

    **These flags describe the family's EXISTING state, and nothing else.** They have no
    idea a wizard run in progress is about to create a NEW student -- decision 6 scopes
    `health` and `payment` to "the students THIS run is creating," and that scoping is
    the job of whichever screen calls this route (wave D/E), layered on top rather than
    answered here. A parent with existing children who all hold current declarations
    reads `health: complete` here even while a brand-new child mid-wizard still needs
    one -- do not skip a step on the strength of this flag alone once a new student is in
    play.
    """

    steps: list[OnboardingStepOut]
    #: The first step in `steps` whose `complete` is `False`, or `None` when every step
    #: is -- §3: "if nothing is needed it does not open at all."
    next: OnboardingStepKey | None


@router.get("/me/onboarding-status", response_model=OnboardingStatusOut)
def onboarding_status(request: Request) -> OnboardingStatusOut:
    """The signed-in caller's own onboarding status in their ACTIVE studio.

    No `TenantSessionDep`, deliberately -- that dependency 401s before this function's
    body ever runs when there is no active studio, and F9's exact caller (signed in,
    seconds after OAuth, not yet a member of any studio -- the moment before a fresh
    `/join/<token>` visitor submits step 2) is precisely that. Rather than surface that
    as an error, this resolves the studio itself and, when there is none, answers with
    `OnboardingStatusService.empty()` -- an honest "nothing done yet," not a failure.
    """
    identity_id = getattr(request.state, "identity_id", None)
    if not isinstance(identity_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )

    studio_id = getattr(request.state, "studio_id", None)
    person_id = getattr(request.state, "person_id", None)
    if isinstance(studio_id, uuid.UUID) and isinstance(person_id, uuid.UUID):
        with (
            use_studio(studio_id),
            TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
        ):
            result = OnboardingStatusService.compute(scoped, person_id=person_id)
            # Read-only -- never leaves a transaction open, same rule onboarding_info()
            # follows above.
            scoped.rollback()
    else:
        # F9 -- see this function's own docstring.
        result = OnboardingStatusService.empty()

    return OnboardingStatusOut(
        steps=[
            OnboardingStepOut(key=key, complete=result.steps[key])
            for key in OnboardingStatusService.STEP_ORDER
        ],
        next=result.next,
    )
