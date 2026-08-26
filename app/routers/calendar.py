"""SPEC §7's `GET /calendar/{token}.ics` and `POST /calendar-feeds/{id}/rotate`.

**The one unauthenticated route in this lane, and it is unauthenticated by necessity.** §5.12:
a calendar client cannot hold a session. Google subscribes once and then fetches on its own
schedule, indefinitely, with nothing but the URL — so the token is the entire credential and
there is nothing else this route could check.

**It carries no `TenantSessionDep`.** Every other route in the product resolves a studio from
the verified JWT; this one has no JWT, so it resolves the studio from the feed row itself
through a plain unscoped `Session`, then re-enters `use_studio` for everything after that.
`app/services/comms/feeds.py::resolve_feed` carries the full argument for why that is the
right hatch rather than `with_all_tenants`.

**A separate module from `app/routers/comms.py`** because `scripts/lane-check.sh` names it:
"§5.12's feed is served from an UNAUTHENTICATED URL, which makes it the last file in this lane
that should sit outside its own gate."
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.clock import now
from app.core.db import get_engine
from app.core.tenancy import TenantSession, TenantSessionDep, use_studio
from app.models.comms import CalendarFeed
from app.schemas.comms import CalendarFeedOut
from app.services.comms.errors import FeedNotFoundError
from app.services.comms.feeds import CalendarFeedService, feed_url, resolve_feed
from app.services.comms.ics import render_feed

router = APIRouter(tags=["comms"])


class CalendarFeedsOut(BaseModel):
    """This person's subscriptions. A guardian has one, a coach has one, somebody who is both
    has two — and §5.12's two carry different things, so neither contains the other."""

    feeds: list[CalendarFeedOut]


def _person_id(request: Request) -> uuid.UUID:
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


def _out(row: CalendarFeed) -> CalendarFeedOut:
    return CalendarFeedOut(
        id=row.id,
        subject_type=row.subject_type,
        # Assembled server-side. The bare token is deliberately not exposed beside it: two
        # representations of one secret is one more place to log it.
        url=feed_url(row.token),
        rotated_at=row.rotated_at,
    )


@router.get("/calendar-feeds", response_model=CalendarFeedsOut)
def my_calendar_feeds(request: Request, session: TenantSessionDep) -> CalendarFeedsOut:
    """§5.12's `הוספה ליומן`. Issues a feed the first time it is asked for.

    Idempotent: the settings screen loads more than once, and a fresh token per page load
    would break every calendar the parent had already subscribed.
    """
    rows = CalendarFeedService(session).feeds_for(_person_id(request))
    return CalendarFeedsOut(feeds=[_out(row) for row in rows])


@router.post("/calendar-feeds/{feed_id}/rotate", response_model=CalendarFeedOut)
def rotate_calendar_feed(
    request: Request, feed_id: uuid.UUID, session: TenantSessionDep
) -> CalendarFeedOut:
    """§5.12 — "rotating invalidates the old URL immediately".

    404 rather than 403 for somebody else's feed. The id is a UUID a signed-in manager could
    guess at, and rotating a parent's feed would silently disconnect their family calendar —
    so the route does not confirm that the feed exists either.
    """
    try:
        row = CalendarFeedService(session).rotate(_person_id(request), feed_id, at=now())
    except FeedNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such calendar feed"},
        ) from exc
    return _out(row)


@router.get("/calendar/{token}.ics", response_class=Response)
def calendar_feed(token: str) -> Response:
    """§5.12's subscription. Unauthenticated, token-secured, RFC 5545.

    **The 404 carries nothing.** No "this studio has no such feed", no distinction between a
    token that never existed and one that was rotated away — either would confirm something
    to whoever is guessing, and guessing is the only attack this endpoint has.

    `Cache-Control: no-store` because the feed is a live view of a timetable that changes: a
    cancelled session has to reach the subscriber on their next fetch rather than on their
    next cache expiry. §5.12 is clear that even then the feed is not the urgent channel —
    Google refreshes on its own schedule, up to ~24h — which is why §5.11's push exists and
    why `calendar.refreshDelay` says so on the screen.
    """
    resolved = resolve_feed(token)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    studio_id, person_id, subject_type, _feed_id = resolved

    at = now()
    with (
        use_studio(studio_id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        events = CalendarFeedService(scoped).events_for(person_id, subject_type, at=at)
        # `X-WR-CALNAME` is what the subscriber sees the calendar called in their own app.
        # The studio's name would be nicer and would mean reading `studio` here; the subject
        # type is what distinguishes a person's TWO feeds from each other, which is the
        # distinction that actually matters once both are subscribed.
        name = "השיעורים שלי" if subject_type == "coach" else "המועדון"
        body = render_feed(events, name=name, at=at)

    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'inline; filename="{subject_type}.ics"',
            "Cache-Control": "no-store",
        },
    )
