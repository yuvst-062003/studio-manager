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

from sqlalchemy.orm import Session as OrmSession

from app.schemas.attendance import BootstrapPayload, RosterEntry
from app.services.attendance.roster import build_roster
from app.services.people.group_days import STUDIO_ZONE
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
) -> BootstrapPayload:
    """Everything the staff app needs before it loses the network.

    `now` is passed rather than read, because `app.core.clock.now()` is the only clock
    (§19.5) and `server_time` is what the client detects clock skew against — §10.5
    resolves conflicts on `device_marked_at`, and a device whose clock is an hour out would
    win or lose every conflict for the wrong reason.
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
            )
            for entry in roster_rows
        ]

    return BootstrapPayload(
        server_time=now,
        from_time=_start_of_day(from_date),
        to_time=_start_of_day(to_date + timedelta(days=1)),
        sessions=sessions,
        rosters=rosters,
    )


def _start_of_day(day: date) -> datetime:
    """G3 — stored UTC, rendered Asia/Jerusalem. A window boundary is a *day* in the
    studio's zone, so it is built there and handed back as the UTC instant it is. Building
    it in UTC instead would shift the window by two or three hours and drop a 21:00 lesson
    off the end of tomorrow."""
    return datetime.combine(day, datetime.min.time(), tzinfo=STUDIO_ZONE)
