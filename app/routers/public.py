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

`schedule_reader` is a module-level factory rather than a direct `ScheduleService(...)`
call so a test can substitute a reader without monkeypatching the shared service class.

**The unscoped session does NOT reach the schedule.** W2's merge made this load-bearing.
`ScheduleService` inherits its tenancy entirely from the session it is handed: the filter
(`do_orm_execute`) and the `studio_id` stamp (`before_flush`) in `app/core/tenancy.py` are
registered on `TenantSession` and on nothing else, and `ScheduleService.require_group` is a
bare primary-key `get` with no studio predicate of its own. Handing it the unscoped session
above would therefore read any studio's group by UUID, feed EVERY studio's training years
and closures into `expand_rules` -- so the weekdays would be wrong, not merely unguarded --
and, because `materialize_sessions` writes, insert `session` rows with no `studio_id` at
all, which is a NOT NULL violation and a 500 on the shop window.

So the schedule read runs in its own scope: resolve the studio from the slug or the group
with the unscoped session, then open a `TenantSession` under `use_studio(studio_id)` and
give the service THAT. `_scoped_schedule` below is the one place it happens.
`app/routers/trial_bookings.py::book_trial_for_self` does the same thing for the same
reason. The scope is deliberately never committed: a stranger loading a marketing page
should not leave rows behind, and `materialize_sessions` flushes, so the weekdays it
computes are correct inside the transaction that is about to be rolled back.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import SessionDep, get_engine
from app.core.storage import ObjectNotFoundError, ObjectStore, build_object_store
from app.core.tenancy import TenantSession, use_studio
from app.models.belts import BeltRank
from app.models.structure import Class
from app.schemas.people import (
    PublicBeltOut,
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
from app.services.structure import landing_photos

router = APIRouter(tags=["public"])


def object_store() -> ObjectStore:
    """Same shape as `app/routers/studio.py`'s: a dependency so a test can override it,
    and built per request so `STORAGE_BACKEND` is read at call time rather than import."""
    return build_object_store()


ObjectStoreDep = Annotated[ObjectStore, Depends(object_store)]


def schedule_reader(session: TenantSession) -> ScheduleReader:
    """L5's seam, behind one indirection so tests can supply a reader.

    Takes the session the reader must run on. It is typed `TenantSession` rather than
    `Session` on purpose: an unscoped session here is the whole failure the module
    docstring describes, and the annotation is the cheapest place to say so.
    """
    return ScheduleService(session)


@contextmanager
def _scoped_schedule(studio_id: uuid.UUID) -> Iterator[tuple[TenantSession, ScheduleReader]]:
    """A tenant-scoped session and a reader bound to it, for one studio.

    Never committed -- see the module docstring. Exiting the `with` rolls back whatever
    `materialize_sessions` flushed, which is the intended behaviour for an unauthenticated
    GET: the weekdays are computed from real rows inside the transaction, and the open
    internet leaves nothing behind.
    """
    with use_studio(studio_id), TenantSession(bind=get_engine(), expire_on_commit=False) as scoped:
        yield scoped, schedule_reader(scoped)


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
        training_times=group.training_times,
    )


def _belt_ladder(session: Session, studio_id: Any) -> list[PublicBeltOut]:
    """L4 region 1 — one ladder, deterministically: the first ACTIVE class by name.

    A club with two classes has two grading systems; the hero draws one strip and its
    caption says `מסלול החגורות במועדון`. The first class by name is stable and, for the
    single-class club that is the common case, simply the ladder.
    """
    class_id = session.execute(
        select(Class.id)
        .where(Class.studio_id == studio_id, Class.is_active.is_(True))
        .order_by(Class.name)
        .limit(1)
    ).scalar_one_or_none()
    if class_id is None:
        return []
    rows = session.execute(
        select(BeltRank).where(BeltRank.class_id == class_id).order_by(BeltRank.order_index)
    ).scalars()
    return [
        PublicBeltOut(
            name=rank.name,
            color_hex=rank.color_hex,
            secondary_color_hex=rank.secondary_color_hex,
        )
        for rank in rows
    ]


def _landing(slug: str, session: SessionDep) -> PublicLandingOut:
    """§5.4a ① -- 'Logo, photos, what the club does, where and when, and one offer.'

    The prose comes from `studio.settings`, the JSONB M1's setup wizard already writes. A
    club that has filled none of it in gets nulls, and the page renders its name and its
    groups -- which is still a shop window.
    """
    # `LandingService.landing()` is the composite of these two, and it takes ONE session.
    # Split here rather than widened there: the studio lookup is the half that legitimately
    # runs unscoped -- it is how the studio is discovered at all -- and the group half is
    # the half that must not. G6 is intact; this is still parse, call, return.
    try:
        studio = LandingService.studio_by_slug(session, slug=slug)
    except NotFoundError as exc:
        raise _not_found() from exc
    try:
        with _scoped_schedule(studio.id) as (scoped, schedule):
            groups = LandingService.public_groups(
                scoped, studio_id=studio.id, since=now().date(), schedule=schedule
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
        # Falls back to the top-level settings the הגדרות panel and the wizard's step 1
        # already write: a club that filled in its address once should not be asked for
        # it a second time under a different key.
        address=landing_blob.get("address") or blob.get("address"),
        phone=landing_blob.get("phone") or blob.get("phone"),
        # `settings.landing.photo_object_keys`, written by POST /studio/landing-photos
        # (the הגדרות panel's strip), rendered in upload order.
        photo_urls=[
            landing_photos.public_photo_url(studio.slug, key)
            for key in landing_photos.photo_keys(studio)
        ],
        groups=[_group_out(group) for group in groups],
        belt_ladder=_belt_ladder(session, studio.id),
        trial_steps=[
            step for step in landing_blob.get("trial_steps") or [] if isinstance(step, str)
        ],
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
        with _scoped_schedule(studio.id) as (scoped, schedule):
            groups = LandingService.public_groups(
                scoped, studio_id=studio.id, since=now().date(), schedule=schedule
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


@router.get("/public/studios/{slug}/photos/{photo_id}")
def public_photo(slug: str, photo_id: str, session: SessionDep, store: ObjectStoreDep) -> Response:
    """§5.4a ① -- one photo of the landing strip, addressed by its minted id.

    The id is matched against the studio's OWN list; there is no key in the URL and no way
    to address another studio's object through this route -- the same posture as the logo's,
    and the reason there is no generic `GET /files/{key}`.
    """
    try:
        studio = LandingService.studio_by_slug(session, slug=slug)
    except NotFoundError as exc:
        raise _not_found() from exc
    key = next(
        (
            candidate
            for candidate in landing_photos.photo_keys(studio)
            if landing_photos.photo_id_of(candidate) == photo_id
        ),
        None,
    )
    if key is None:
        raise _not_found()
    try:
        data, content_type = store.get(key)
    except ObjectNotFoundError as exc:
        raise _not_found() from exc
    return Response(
        content=data,
        media_type=content_type,
        # A photo object is immutable -- a replace mints a NEW id -- so a shared cache may
        # hold it as long as it likes without ever serving a stale strip.
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/public/groups/{group_id}/trial-slots", response_model=TrialSlotListResponse)
def trial_slots(group_id: uuid.UUID, session: SessionDep) -> TrialSlotListResponse:
    """§5.4a step 4 -- 'the next N upcoming sessions of each chosen group, one pick per
    child.'"""
    try:
        studio_id = LandingService.studio_id_for_group(session, group_id=group_id)
        with _scoped_schedule(studio_id) as (scoped, schedule):
            rows = LandingService.trial_slots(
                scoped,
                group_id=group_id,
                studio_id=studio_id,
                since=now().date(),
                schedule=schedule,
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
