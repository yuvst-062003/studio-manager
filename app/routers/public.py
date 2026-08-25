"""SPEC §7's `/public/*`. **Unauthenticated**, and shaped for the open internet.

Three deliberate departures from every other router in this lane, each with a reason:

* **`SessionDep`, not `TenantSessionDep`.** A stranger holding a flyer has no studio in
  context and no token to put one in, so a tenant-scoped session would 401 the shop
  window. The tenant filter runs on `TenantSession`, so a plain `Session` is genuinely
  unfiltered -- and every query in `LandingService` therefore names its studio explicitly,
  resolved from the slug the caller gave. `app/routers/identity.py` does exactly this for
  the whole sign-in flow.
* **No role dependency.** There is no role to require. §6.1: parent-app access "needs no
  provisioning at all, because booking a trial creates the guardian row itself. That is
  the only self-service entry point in the system, and it grants nothing beyond visibility
  of the children it just created."
* **Not tagged `coach`.** The tag is a promise about invariant 3's guard, and an
  unauthenticated router is not a coach router.

`schedule_reader` is a module-level factory rather than a direct `ScheduleService()` call
so a test can substitute a reader without monkeypatching the shared service class.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.clock import now
from app.core.db import SessionDep
from app.core.storage import ObjectNotFoundError, ObjectStore, build_object_store
from app.schemas.people import (
    PublicGroupListResponse,
    PublicGroupOut,
    PublicLandingOut,
    TrialSlotListResponse,
)
from app.schemas.schedule import TrialSlotOut
from app.services.people.errors import NotFoundError
from app.services.people.group_days import ScheduleReader
from app.services.people.landing import LandingService, PublicGroup
from app.services.schedule import ScheduleService

router = APIRouter(tags=["public"])


def object_store() -> ObjectStore:
    """Same shape as `app/routers/studio.py`'s: a dependency so a test can override it,
    and built per request so `STORAGE_BACKEND` is read at call time rather than import."""
    return build_object_store()


ObjectStoreDep = Annotated[ObjectStore, Depends(object_store)]


def schedule_reader() -> ScheduleReader:
    """L5's seam, behind one indirection so tests can supply a reader."""
    return ScheduleService()


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such club"},
    )


def _schedule_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "schedule_unavailable",
            "message": "the club's schedule has not been built yet",
        },
    )


def _group_out(group: PublicGroup) -> PublicGroupOut:
    return PublicGroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        age_min=group.age_min,
        age_max=group.age_max,
        training_weekdays=group.training_weekdays,
    )


def _landing(slug: str, session: SessionDep) -> PublicLandingOut:
    """§5.4a ① -- 'Logo, photos, what the club does, where and when, and one offer.'

    The prose comes from `studio.settings`, the JSONB M1's setup wizard already writes. A
    club that has filled none of it in gets nulls, and the page renders its name and its
    groups -- which is still a shop window.
    """
    try:
        studio, groups = LandingService.landing(
            session, slug=slug, since=now().date(), schedule=schedule_reader()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc

    blob: dict[str, Any] = studio.settings if isinstance(studio.settings, dict) else {}
    nested = blob.get("landing")
    landing_blob: dict[str, Any] = nested if isinstance(nested, dict) else {}
    return PublicLandingOut(
        studio_name=studio.name,
        slug=studio.slug,
        # NOT `app/services/structure/logo.py::logo_url()` -- that returns
        # `/api/v1/studio/logo`, a tenant-scoped authenticated route an anonymous visitor
        # cannot fetch. §5.4a puts the logo on the shop window, so the shop window gets a
        # public route of its own, below.
        logo_url=(f"/api/v1/public/studios/{studio.slug}/logo" if studio.logo_object_key else None),
        default_locale=studio.default_locale,
        headline=landing_blob.get("headline"),
        about=landing_blob.get("about"),
        address=landing_blob.get("address"),
        # Empty until something writes `settings.landing.photo_object_keys`. The setup
        # wizard has no photo step yet, and inventing a gallery it cannot feed would be a
        # feature that exists only in a schema.
        photo_urls=[],
        groups=[_group_out(group) for group in groups],
    )


@router.get("/public/studios/{slug}/landing", response_model=PublicLandingOut)
def landing(slug: str, session: SessionDep) -> PublicLandingOut:
    return _landing(slug, session)


@router.get("/public/studios/{slug}", response_model=PublicLandingOut)
def public_studio(slug: str, session: SessionDep) -> PublicLandingOut:
    """§7 lists this separately from `/landing`. Same payload: splitting the club's name
    from the club's page would give a caller two shapes to keep in step for no benefit, and
    the narrow one is already as narrow as it goes."""
    return _landing(slug, session)


@router.get("/public/studios/{slug}/groups", response_model=PublicGroupListResponse)
def public_groups(slug: str, session: SessionDep) -> PublicGroupListResponse:
    try:
        studio = LandingService.studio_by_slug(session, slug=slug)
        groups = LandingService.public_groups(
            session, studio_id=studio.id, since=now().date(), schedule=schedule_reader()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    return PublicGroupListResponse(items=[_group_out(group) for group in groups])


@router.get("/public/studios/{slug}/logo")
def public_logo(slug: str, session: SessionDep, store: ObjectStoreDep) -> Response:
    """§5.4a ① -- the logo, on the club's own marketing page.

    Unauthenticated by necessity: `/api/v1/studio/logo` is tenant-scoped and needs a token,
    and a stranger tapping an Instagram link has neither. A club's own logo on its own shop
    window is public by definition -- it is the thing they print on flyers.
    """
    try:
        studio = LandingService.studio_by_slug(session, slug=slug)
    except NotFoundError as exc:
        raise _not_found() from exc
    if not studio.logo_object_key:
        raise _not_found()
    try:
        data, content_type = store.get(studio.logo_object_key)
    except ObjectNotFoundError as exc:
        raise _not_found() from exc
    return Response(
        content=data,
        media_type=content_type,
        # A logo changes about once a year. Cached hard, and keyed by slug, so the shop
        # window costs one request the first time and none after.
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/public/groups/{group_id}/trial-slots", response_model=TrialSlotListResponse)
def trial_slots(group_id: uuid.UUID, session: SessionDep) -> TrialSlotListResponse:
    """§5.4a step 4 -- 'the next N upcoming sessions of each chosen group, one pick per
    child.'"""
    try:
        studio_id = LandingService.studio_id_for_group(session, group_id=group_id)
        rows = LandingService.trial_slots(
            session,
            group_id=group_id,
            studio_id=studio_id,
            since=now().date(),
            schedule=schedule_reader(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    except NotImplementedError as exc:
        raise _schedule_unavailable() from exc
    return TrialSlotListResponse(
        items=[
            TrialSlotOut(
                session_id=row.id,
                group_id=group.id,
                group_name=group.name,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                location_name=None,
                is_bookable=bookable,
            )
            for row, group, bookable in rows
        ]
    )
