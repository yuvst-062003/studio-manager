"""§6.1's offline priming payload — `GET /sync/bootstrap?from&to`.

"**Offline priming is not optional.** A coach whose very first session is in a basement with
no signal must already have the roster. The first launch blocks on this fetch with a short
progress indicator, and it re-runs on every foreground resume."

Two consequences shape this module.

**One round trip.** Everything the roster renders has to be *in this payload*. A field that
needs a second request is a field that is blank in a basement, which is the one place the
screen actually matters. That is why `BootstrapPayload` carries whole rosters rather than
session ids the client would then fetch.

**A bounded window.** §10.6: "the cache is bounded anyway: two days of sessions, evicted
oldest-first". The bound is enforced *here* and echoed back in `from_time`/`to_time`, so the
client evicts against what it actually received rather than what it asked for. A client
asking for a month gets two days and can tell that it did.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.models.events import Event, EventRegistration
from app.models.health import HealthDeclaration
from app.models.people import Student
from app.models.person import Person
from app.models.structure import Location
from app.schemas.attendance import BootstrapPayload, EventRosterOut, RosterEntry
from app.services.attendance.roster import build_roster
from app.services.people.group_days import STUDIO_ZONE
from app.services.people.naming import format_person_name
from app.services.schedule.service import ScheduleService

#: §10.6 — "two days of sessions". Today and tomorrow, which is exactly what §6.1's first
#: launch blocks on. Expressed as a span in days rather than as a count of sessions: a
#: quiet Sunday and a busy Tuesday must both be one window.
CACHE_WINDOW_DAYS = 2

#: A studio's whole day of sessions, without pagination. `list_sessions` pages at 50 by
#: default and a two-day window at a busy club can exceed that -- and a bootstrap that
#: silently returned the first page would leave a coach's evening lesson uncached, which is
#: precisely the failure §6.1 exists to prevent. 500 is far above any real club's two days
#: and still bounded, so a bug cannot turn this into an unbounded scan.
MAX_SESSIONS_IN_WINDOW = 500

#: §6.5 of the staff app redesign (decision 14) -- which events are worth caching for
#: offline attendance. A `draft` event has no registrations yet (publishing is what
#: materialises the roster -- `app/routers/events.py`'s own docstring on `publish`), so
#: caching one would mean caching an empty roster for nothing. `cancelled` and `completed`
#: stay in: a coach may still correct a cancelled event's attendance (§5.8 -- "the roster
#: survives"), and the offline flusher needs a cancelled event's CURRENT status to be
#: reachable at all in order to ever raise §6.5's conflict card from it.
CACHED_EVENT_STATUSES = ("published", "cancelled", "completed")


def clamp_window(from_date: date, to_date: date) -> tuple[date, date]:
    """§10.6's two-day bound, applied to whatever the client asked for.

    Clamped rather than rejected: a client whose stored watermark is a week old asks for a
    week, and answering "400" would leave it with no cache at all. It gets the two days it
    is allowed to keep, and `to_time` tells it which two.
    """
    if to_date < from_date:
        to_date = from_date
    limit = from_date + timedelta(days=CACHE_WINDOW_DAYS - 1)
    return from_date, min(to_date, limit)


def build_bootstrap(
    session: OrmSession,
    *,
    from_date: date,
    to_date: date,
    visible_group_ids: set[uuid.UUID] | None,
    coach_person_id: uuid.UUID | None,
    now: datetime,
    include_plans: bool = False,
    include_events: bool = False,
) -> BootstrapPayload:
    """Everything the staff app needs before it loses the network.

    `now` is passed rather than read, because `app.core.clock.now()` is the only clock
    (§19.5) and `server_time` is what the client detects clock skew against — §10.5
    resolves conflicts on `device_marked_at`, and a device whose clock is an hour out would
    win or lose every conflict for the wrong reason.

    `include_plans` is §6.2's briefing, `SessionOut.plan`. It is the CALLER's decision, not
    this function's: `/sync/bootstrap` answers both staff and guardians (§10.2's read-only
    parent cache is the same payload, narrowed), and the plan is a briefing staff write for
    staff, not a fact a guardian's read of this same endpoint should carry. `sync.py` passes
    `True` only for a caller holding a staff role, so a guardian gets `plan: None` on every
    session here exactly as `list_sessions`/`get_session` already do everywhere else.

    `include_events` is §6.5's identical gate, added 2026-09-07 for decision 14. Events ride
    "alongside sessions" (§6.5's own words) rather than merged into `sessions` -- see
    `EventRosterOut`'s docstring for why -- and, like the briefing, they are staff-facing
    content this same endpoint must not hand a guardian just because the guardian's own
    narrower read passes through here too.
    """
    from_date, to_date = clamp_window(from_date, to_date)
    schedule = ScheduleService(session)
    rows, _ = schedule.list_sessions(
        from_date=from_date,
        to_date=to_date,
        coach_person_id=coach_person_id,
        visible_group_ids=visible_group_ids,
        limit=MAX_SESSIONS_IN_WINDOW,
    )

    # One query for the whole window, never one per session -- the same reasoning
    # `project_sessions`'s own docstring gives for its three batch queries.
    plans_by_session = schedule.latest_plan_notes([row.id for row in rows]) if include_plans else {}

    sessions = []
    rosters: dict[uuid.UUID, list[RosterEntry]] = {}
    for row in rows:
        session_row, roster_rows = build_roster(session, row.id)
        projected = schedule.project_sessions([session_row])[0]
        # D5's block "surfaces coverage and completion -- is a coach assigned, is it
        # cancelled, has attendance been taken". Computed from the roster we already have
        # rather than from a second query, and from the EXPECTED rows only: a not-expected
        # child left unmarked is not an unmarked session.
        projected.attendance_taken = any(
            entry.status != "unmarked" for entry in roster_rows if entry.expected
        )
        projected.plan = plans_by_session.get(row.id)
        sessions.append(projected)
        rosters[row.id] = [
            RosterEntry(
                student_id=entry.student_id,
                display_name=entry.display_name,
                belt_color_hex=entry.belt_color_hex,
                belt_name=entry.belt_name,
                health_status=entry.health_status,
                derived_flags=entry.derived_flags,
                status=entry.status,
                source=entry.source,
                has_absence_report=entry.has_absence_report,
                absence_reason=entry.absence_reason,
                has_confirmation=entry.has_confirmation,
                plan_name=entry.plan_name,
            )
            for entry in roster_rows
        ]

    events: list[EventRosterOut] = []
    event_rosters: dict[uuid.UUID, list[RosterEntry]] = {}
    if include_events:
        event_rows = _event_window(session, from_date=from_date, to_date=to_date)
        events = _events_out(session, event_rows)
        event_rosters = _event_rosters(session, [row.id for row in event_rows])

    return BootstrapPayload(
        server_time=now,
        from_time=_start_of_day(from_date),
        to_time=_start_of_day(to_date + timedelta(days=1)),
        sessions=sessions,
        rosters=rosters,
        events=events,
        event_rosters=event_rosters,
    )


def _event_window(session: OrmSession, *, from_date: date, to_date: date) -> list[Event]:
    """§6.5's window, applied to events the same way `ScheduleService.list_sessions` applies
    it to sessions -- the same `[from, to]` days, already clamped to §10.6's two by the
    caller."""
    start = _start_of_day(from_date)
    end = _start_of_day(to_date + timedelta(days=1))
    return list(
        session.execute(
            select(Event)
            .where(
                Event.starts_at >= start,
                Event.starts_at < end,
                Event.status.in_(CACHED_EVENT_STATUSES),
            )
            .order_by(Event.starts_at)
        )
        .scalars()
        .all()
    )


def _events_out(session: OrmSession, events: list[Event]) -> list[EventRosterOut]:
    """`Event` rows, narrowed to `EventRosterOut` -- see that shape's own docstring for why
    it is not `EventOut`. One query for every location in the window rather than one per
    event, the same batching `build_roster` already uses for belts and plans."""
    if not events:
        return []
    location_ids = {event.location_id for event in events if event.location_id is not None}
    location_names = (
        dict(
            session.execute(
                select(Location.id, Location.name).where(Location.id.in_(location_ids))
            ).tuples()
        )
        if location_ids
        else {}
    )
    return [
        EventRosterOut(
            id=event.id,
            title=event.title,
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            location_name=(
                location_names.get(event.location_id)
                if event.location_id is not None
                else event.location_text
            ),
            status=event.status,
        )
        for event in events
    ]


def _event_rosters(
    session: OrmSession, event_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[RosterEntry]]:
    """An event's registrations, shaped as `RosterEntry` -- §6.5's "the same shapes",
    literally: this returns the identical Pydantic model `build_roster`'s callers already
    fill, populated from `EventRegistration` instead of `Attendance`.

    `health_status` is `student.health_status`, the same column `build_roster` reads for a
    session -- not a guess, and not the schema's own `"missing"` default either: a health
    flag is exactly as consequential on an event's mat as on a weekly one, so this is a real
    lookup rather than a placeholder. `belt_color_hex`/`belt_name` stay `None`, matching
    every session row today (`RosterRowRaw`'s own note: "`None` until [W7] then").
    """
    if not event_ids:
        return {}
    rows = list(
        session.execute(
            select(EventRegistration, Student, Person)
            .join(Student, Student.id == EventRegistration.student_id)
            .join(Person, Person.id == Student.person_id)
            .where(EventRegistration.event_id.in_(event_ids))
        )
        .tuples()
        .all()
    )
    if not rows:
        return {}
    student_ids = [student.id for _, student, _ in rows]
    flags = {
        student_id: derived
        for student_id, derived in session.execute(
            select(HealthDeclaration.student_id, HealthDeclaration.derived_flags).where(
                HealthDeclaration.student_id.in_(student_ids)
            )
        ).tuples()
    }

    by_event: dict[uuid.UUID, list[RosterEntry]] = {}
    for registration, student, person in rows:
        by_event.setdefault(registration.event_id, []).append(
            RosterEntry(
                student_id=student.id,
                display_name=format_person_name(person.first_name, person.last_name),
                health_status=student.health_status,
                derived_flags=flags.get(student.id) or {},
                # `EventRegistration.attended` is a plain non-null boolean -- there is no
                # third "never marked" state in the column, and `_registration_out`
                # (`app/routers/events.py`, the ONLINE read) already renders it the same
                # two-valued way. Mirroring that here rather than inventing `unmarked` keeps
                # the cached read and the live read showing the same thing for the same
                # registration, which matters more than a state this column cannot hold.
                status="present" if registration.attended else "absent_unexcused",
                source=None,
                # `has_absence_report` / `has_confirmation` / `absence_reason` have no event
                # equivalent -- there is no absence-report or confirmation table keyed by
                # event -- and the field defaults (`False` / `None`) are correct here
                # because the CONCEPT does not exist, not because the answer is unknown.
            )
        )
    for entries in by_event.values():
        entries.sort(key=lambda entry: entry.display_name)
    return by_event


def _start_of_day(day: date) -> datetime:
    """G3 — stored UTC, rendered Asia/Jerusalem. A window boundary is a *day* in the
    studio's zone, so it is built there and handed back as the UTC instant it is. Building
    it in UTC instead would shift the window by two or three hours and drop a 21:00 lesson
    off the end of tomorrow."""
    return datetime.combine(day, datetime.min.time(), tzinfo=STUDIO_ZONE)
