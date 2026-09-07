"""§5.12's calendar feeds: issue, resolve by token, rotate, and decide what is in them.

"Feeds exist per guardian (all their students' sessions and events) and per coach (all
sessions they staff). The token is a long random secret stored in `calendar_feed`, rotatable
from settings — rotating invalidates the old URL immediately."

**The token is the entire credential.** `GET /api/v1/calendar/{token}.ics` is unauthenticated
because a calendar client cannot hold a session: Google subscribes once and then fetches on
its own schedule, indefinitely, with nothing but the URL. So the token is 32 bytes of
`secrets.token_urlsafe` and the only remedy for a leaked link is a new one.

**§5.12 fixes what a feed may contain: "no medical and no financial data."** The feed is built
from sessions and published events, and `FeedEvent` has nowhere to put a balance or a health
flag — the constraint is in the shape rather than in a reviewer's memory.

**Chosen because the alternatives do not exist.** §12: Apple provides no third-party calendar
write API at all, so the API route cannot serve iPhone users, and Google's calendar write
scope is a restricted scope requiring an annual third-party security assessment.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_engine
from app.core.tenancy import TenantSession, require_current_studio_id
from app.models.comms import CalendarFeed
from app.models.events import Event, EventRegistration
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.models.schedule import Session as SessionRow
from app.models.schedule import SessionStaff
from app.models.structure import Class, Group, Location
from app.models.studio import Studio
from app.services.comms.errors import FeedNotFoundError
from app.services.comms.ics import FeedEvent

#: How much of the calendar a subscription carries.
#:
#: A month back so a parent scrolling to last week still sees what happened, and a year ahead
#: because that is a training year (§5.15) and the question §5.12 says the feed answers is
#: "where do I need to be next Tuesday". Bounded rather than unbounded because Google refetches
#: the WHOLE file on its own schedule -- an ever-growing feed is a cost paid on every fetch,
#: forever, for events nobody will look at again.
LOOK_BACK = timedelta(days=30)
LOOK_AHEAD = timedelta(days=365)

#: 32 bytes, matching the refresh token M1 already issues, and rendered by `token_urlsafe` as
#: 43 characters. The model's docstring says why not a UUID: a UUID in a URL invites being
#: treated as an identifier and logged, and it carries a third of the entropy.
TOKEN_BYTES = 32

#: The characters JavaScript's `encodeURIComponent` leaves alone and Python's `quote` does
#: not. `quote` already spares `-_.~`; these five are the whole remaining difference, and
#: naming them is what lets `waze_url` produce the byte-for-byte string the parent app does.
_ENCODE_URI_COMPONENT_SAFE = "!*'()"


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def waze_url(address: str) -> str:
    """Owner report #23 -- a calendar entry that can send a family to the club.

    **The parent app's URL shape, reused rather than reinvented.**
    `web/apps/parent/src/features/people/redesign/DirectionsActions.tsx::routeLinks` already
    builds this string for the הוראות הגעה button, and its own header says why it is an
    ordinary https universal link: `waze://` opens nothing when the app is absent -- a dead
    tap with no error, the worst of the three outcomes -- while `https://waze.com/ul` is
    taken by the installed app and handled by a browser otherwise. `navigate=yes` starts the
    route rather than only dropping a pin.

    **`safe="!*'()"` is what makes the two strings identical rather than merely equivalent.**
    JavaScript's `encodeURIComponent` leaves those five characters alone and Python's `quote`
    percent-encodes them, so without this a street name with a parenthesis produces two
    different URLs for one address -- and the one place a family would notice is the one
    place it matters, comparing the link in their calendar against the button in the app.
    """
    encoded = quote(address, safe=_ENCODE_URI_COMPONENT_SAFE)
    return f"https://waze.com/ul?q={encoded}&navigate=yes"


def directions_url(*candidates: str | None) -> str | None:
    """A maps link for the first address anything actually knows, or None.

    `DirectionsActions.tsx` states the rule this enforces: "Nothing renders without an
    address. A navigation link to an empty query opens a map of nowhere, which is worse than
    saying the club has not set one." A feed has no way to say the club has not set one, so
    when nothing knows an address it emits no link at all.

    Blank-but-present is treated as absent. `location.address` and `studio.settings.address`
    are both free text a manager typed, and a field they opened and left empty is not an
    address.
    """
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return waze_url(candidate.strip())
    return None


def feed_url(token: str) -> str:
    """The absolute URL a calendar client is handed.

    Absolute because there is no page around it to resolve a relative path against, and
    `.ics` because that suffix is what makes Google and Apple treat the response as a calendar
    subscription rather than a file to download once.

    Built from `OAUTH_REDIRECT_BASE_URL`, which is the API's own public origin -- the host
    already serving `/api/v1/auth/*/callback`, which is the same host this route lives on. A
    dedicated `PUBLIC_API_BASE_URL` would read better and would be a change to
    `app/core/config.py`, which belongs to `core` rather than to this lane.
    """
    return f"{settings.OAUTH_REDIRECT_BASE_URL.rstrip('/')}/api/v1/calendar/{token}.ics"


def resolve_feed(token: str) -> tuple[uuid.UUID, uuid.UUID, str, uuid.UUID] | None:
    """Find a feed by its token, with no studio in context.

    Returns `(studio_id, person_id, subject_type, feed_id)`, or None.

    §5.12's URL is unauthenticated and carries no studio, so this lookup HAS to cross tenants
    -- and it does so through a plain `sqlalchemy.orm.Session` rather than `with_all_tenants`.
    Two reasons, and the second is the durable one. The hatch's caller registry lives in
    `app/core/demo.py::CROSS_STUDIO_CALLERS`, which is `core`'s file and not this lane's. And
    the workers already settled the shape: an unscoped Session for the one lookup that must
    cross, then a `use_studio` scope for the actual work -- which is stricter rather than
    looser, because every read after that line runs through the tenant filter.
    """
    with Session(bind=get_engine(), expire_on_commit=False) as unscoped:
        row = unscoped.execute(
            select(
                CalendarFeed.studio_id,
                CalendarFeed.person_id,
                CalendarFeed.subject_type,
                CalendarFeed.id,
            ).where(CalendarFeed.token == token)
        ).one_or_none()
    return None if row is None else (row[0], row[1], row[2], row[3])


class CalendarFeedService:
    def __init__(self, session: TenantSession) -> None:
        self._session = session

    # -- the subscription -----------------------------------------------------
    def ensure(self, person_id: uuid.UUID, subject_type: str) -> CalendarFeed:
        """Get this person's feed of that kind, issuing one the first time.

        Idempotent because the settings screen loads more than once, and a new token per page
        load would break every calendar the parent had already subscribed.
        """
        row = self._session.execute(
            select(CalendarFeed).where(
                CalendarFeed.person_id == person_id,
                CalendarFeed.subject_type == subject_type,
            )
        ).scalar_one_or_none()
        if row is None:
            row = CalendarFeed(person_id=person_id, subject_type=subject_type, token=new_token())
            self._session.add(row)
            self._session.commit()
        return row

    def feeds_for(self, person_id: uuid.UUID) -> list[CalendarFeed]:
        """Every feed this person should have, issued on the way out.

        A guardian gets one if they have a `guardian` row; a coach gets one if they staff any
        group or any session. Somebody who is both gets both, and §5.12's two feeds carry
        different things -- one is their children's lessons, the other is every session they
        teach -- so neither contains the other.
        """
        feeds = []
        if self._session.execute(
            select(Guardian.id).where(Guardian.person_id == person_id).limit(1)
        ).first():
            feeds.append(self.ensure(person_id, "guardian"))
        if self._coaches_anything(person_id):
            feeds.append(self.ensure(person_id, "coach"))
        return feeds

    def _coaches_anything(self, person_id: uuid.UUID) -> bool:
        from app.models.structure import GroupStaff

        if self._session.execute(
            select(GroupStaff.id).where(GroupStaff.person_id == person_id).limit(1)
        ).first():
            return True
        # A substitute may staff a single session and no group at all (§5.6), and they are
        # exactly the person who most needs the lesson in their calendar.
        return bool(
            self._session.execute(
                select(SessionStaff.id).where(SessionStaff.person_id == person_id).limit(1)
            ).first()
        )

    def rotate(self, person_id: uuid.UUID, feed_id: uuid.UUID, *, at: datetime) -> CalendarFeed:
        """§5.12 -- "rotating invalidates the old URL immediately".

        Immediately, and by construction: the token IS the credential and the row holds one
        token, so overwriting it is the invalidation. There is no revocation list to fall out
        of step and no grace period during which the shared link still works.

        Scoped to the caller's own feed. The id is a UUID in a URL somebody else could guess
        at, and rotating a parent's feed would silently disconnect their family calendar.
        """
        row = self._session.get(CalendarFeed, feed_id)
        if row is None or row.person_id != person_id:
            raise FeedNotFoundError(str(feed_id))
        row.token = new_token()
        row.rotated_at = at
        self._session.commit()
        return row

    # -- what is in it --------------------------------------------------------
    def events_for(
        self,
        person_id: uuid.UUID,
        subject_type: str,
        *,
        at: datetime,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[FeedEvent]:
        """The entries a subscriber's calendar should hold.

        Bug #29 — the סנכרון יומן popup asks the family for a date range, and until this the
        route took no parameters and this window was always `LOOK_BACK`/`LOOK_AHEAD`. A
        question whose answer is discarded is worse than one never asked: a parent who chose
        one week subscribed to thirteen months with nothing on screen saying so.

        Both ends optional and independent, because the fixed window is still the right
        answer for the links already in parents' calendars — every one of those carries no
        parameters and must keep behaving exactly as it did.

        A date, not a datetime: the popup offers two `<input type="date">`, and `date_to` is
        inclusive of its whole day for the reason a person means the whole day when they name
        it. The end is pushed to the following midnight rather than to 23:59:59, so a lesson
        at 23:30 on the last day is in.
        """
        window = (at - LOOK_BACK, at + LOOK_AHEAD)
        if date_from is not None:
            window = (datetime.combine(date_from, time.min, tzinfo=UTC), window[1])
        if date_to is not None:
            end_of = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
            window = (window[0], end_of)
        if subject_type == "coach":
            return self._coach_sessions(person_id, window)
        return self._guardian_sessions(person_id, window) + self._guardian_events(person_id, window)

    def _club_address(self) -> str | None:
        """The address a manager typed into settings, or None.

        `studio.settings["address"]` and not a column: `app/services/structure/logo.py`
        already serves it to the parent app's הוראות הגעה screen from the same key, and §4.3
        pins the studio's COLUMN list while "settings includes:" is deliberately open. Read
        once per feed render rather than per event -- a year of sessions is one row's worth
        of address.

        Read through `Session.get` on the tenant session: `studio` is the tenant rather than
        a tenant-scoped table, so it carries no `studio_id` for the filter to match on, and
        `require_current_studio_id` is the same primary key `app/routers/studio.py` reads it
        by. It fails closed with no studio in context, which is what the caller wants -- the
        feed route enters `use_studio` before any of this runs.
        """
        studio = self._session.get(Studio, require_current_studio_id())
        if studio is None:
            return None
        address = (studio.settings or {}).get("address")
        return address if isinstance(address, str) else None

    def _guardian_sessions(
        self, person_id: uuid.UUID, window: tuple[datetime, datetime]
    ) -> list[FeedEvent]:
        """The sessions of every group this person's children are actively enrolled in.

        `SUMMARY` names the CHILD -- §5.12's example is `דנה · ג'ודו/מתחילים` -- because a
        family with two children in different groups is looking at one calendar and needs to
        know which lesson is whose.

        **`LOCATION` is the room's NAME and the directions link is its ADDRESS** (owner report
        #23). Keeping them apart is the point: `אולם ראשי` is what a parent reads at a glance
        and navigates nowhere, and an address pasted into `SUMMARY` or `LOCATION` to make it
        tappable would make every row in the calendar unreadable to buy one that was already
        available as a link.
        """
        club_address = self._club_address()
        rows = self._session.execute(
            select(SessionRow, Person, Class, Group, Location)
            .join(Enrollment, Enrollment.group_id == SessionRow.group_id)
            .join(Guardian, Guardian.student_id == Enrollment.student_id)
            .join(Group, Group.id == SessionRow.group_id)
            .join(Class, Class.id == Group.class_id)
            .join(Student, Student.id == Enrollment.student_id)
            .join(Person, Person.id == Student.person_id)
            .outerjoin(Location, Location.id == SessionRow.location_id)
            .where(
                Guardian.person_id == person_id,
                Enrollment.status == "active",
                SessionRow.starts_at >= window[0],
                SessionRow.starts_at <= window[1],
            )
            .distinct()
        ).all()
        return [
            FeedEvent(
                uid=f"session-{session_row.id}",
                starts_at=session_row.starts_at,
                ends_at=session_row.ends_at,
                summary=f"{child.first_name} · {class_row.name}/{group.name}",
                location=location.name if location is not None else None,
                description=None,
                cancelled=session_row.status == "cancelled",
                # The HALL's own address first. A club with a second hall is the whole reason
                # `location.address` exists, and sending a family to head office for a lesson
                # held at the school down the road is the failure a club-wide address would
                # introduce. Most clubs never fill it in, which is what the fallback is for.
                directions_url=directions_url(
                    location.address if location is not None else None, club_address
                ),
            )
            for session_row, child, class_row, group, location in rows
        ]

    def _guardian_events(
        self, person_id: uuid.UUID, window: tuple[datetime, datetime]
    ) -> list[FeedEvent]:
        """§5.12 -- "all their students' sessions AND events".

        Joined through `event_registration`, which `EventPublishService.publish` materialises,
        so a family sees the competitions their child was actually invited to. Drafts are
        excluded explicitly: §4.3 makes a draft invisible to a guardian, and a feed is the one
        surface where that leak would be invisible to us and permanent to Google.

        `fee_agorot` is on `event` and is deliberately not read -- §5.12 forbids financial data
        in the feed.
        """
        club_address = self._club_address()
        rows = self._session.execute(
            select(Event, Location)
            .join(EventRegistration, EventRegistration.event_id == Event.id)
            .join(Guardian, Guardian.student_id == EventRegistration.student_id)
            .outerjoin(Location, Location.id == Event.location_id)
            .where(
                Guardian.person_id == person_id,
                Event.status == "published",
                Event.starts_at >= window[0],
                Event.starts_at <= window[1],
            )
            .distinct()
        ).all()
        return [
            FeedEvent(
                uid=f"event-{event.id}",
                starts_at=event.starts_at,
                ends_at=event.ends_at,
                summary=event.title,
                # §5.8's external venue, falling back to the studio's own room -- a
                # competition is at somebody else's dojo.
                location=event.location_text or (location.name if location else None),
                description=event.description,
                cancelled=event.status == "cancelled",
                # `location_text` FIRST, and this is the one place the order matters more than
                # it does for a lesson: §5.8's free-text venue exists because a competition is
                # at somebody else's dojo, so navigating to the club instead would be worse
                # than no link -- the family would arrive somewhere, confidently, on the wrong
                # side of town.
                directions_url=directions_url(
                    event.location_text,
                    location.address if location is not None else None,
                    club_address,
                ),
            )
            for event, location in rows
        ]

    def _coach_sessions(
        self, person_id: uuid.UUID, window: tuple[datetime, datetime]
    ) -> list[FeedEvent]:
        """§5.12 -- "all sessions they staff". Through `session_staff` and not `group_staff`.

        A substitute covering one lesson has the first and not the second, and they are
        exactly the person who most needs it in their calendar.

        `SUMMARY` is the GROUP and never a child's name. A roster does not belong in a
        subscribed calendar that syncs to a personal phone and is fetched indefinitely by
        Google.

        The directions link is here for the same reason the sessions themselves are: a
        substitute covering one lesson is the person in the product who most needs to be told
        where the hall is.
        """
        club_address = self._club_address()
        rows = self._session.execute(
            select(SessionRow, Class, Group, Location)
            .join(SessionStaff, SessionStaff.session_id == SessionRow.id)
            .join(Group, Group.id == SessionRow.group_id)
            .join(Class, Class.id == Group.class_id)
            .outerjoin(Location, Location.id == SessionRow.location_id)
            .where(
                SessionStaff.person_id == person_id,
                SessionRow.starts_at >= window[0],
                SessionRow.starts_at <= window[1],
            )
            .distinct()
        ).all()
        return [
            FeedEvent(
                uid=f"session-{session_row.id}",
                starts_at=session_row.starts_at,
                ends_at=session_row.ends_at,
                summary=f"{class_row.name}/{group.name}",
                location=location.name if location is not None else None,
                description=None,
                cancelled=session_row.status == "cancelled",
                directions_url=directions_url(
                    location.address if location is not None else None, club_address
                ),
            )
            for session_row, class_row, group, location in rows
        ]
