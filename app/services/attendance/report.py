"""Artboard `4c`'s data — the chase list and the per-group rate, over one chosen window.

**Why this is not `app/services/attendance/bootstrap.py`.** The dashboard used to build
`4c`'s unmarked list out of `GET /sync/bootstrap`, and that payload clamps every window to
§10.6's two days: "the cache is bounded anyway: two days of sessions, evicted oldest-first".
That bound is right for a phone's IndexedDB and wrong for a manager's report, so a screen
asking for the last seven days was quietly handed the two *oldest* days of it. Wiring a date
picker to that endpoint would have made the lie wider rather than fixing it. Two questions,
two modules.

**The rate divides by decided marks, and nothing else.** §5.14 makes `unmarked` a real
status — "a report must never treat `unmarked` as `absent`" — precisely so a coach who
forgot the register does not look like a child who stopped coming. `4c` already prints that
sentence above the list. A denominator that swept `unmarked` in would have the screen's one
number contradict the screen's one sentence, and the number is what gets quoted.

**"Ended" is read off the clock, never off `session.status`.** `app/workers/schedule.py` is
the only writer of `status = 'completed'` and it sat unscheduled for a wave and a half, so
in any database older than this month every session that ended is still `scheduled`. The
same file computes completion as `ends_at <= at`; this module asks the same question of the
same clock rather than trusting a job to have answered it. `app/services/people/group_days.py`
treats `scheduled` and `completed` identically for the same reason, from the other side.
"""

from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from app.models.attendance import Attendance
from app.models.schedule import Session as SessionRow
from app.models.structure import Group
from app.schemas.attendance import AttendanceReportOut, GroupAttendanceRate, UnmarkedSessionOut
from app.services.people.group_days import STUDIO_ZONE

#: The same bound `GET /exports/attendance` enforces. One date picker drives both buttons on
#: `4c`, so a range the report accepted and the export refused would be a screen whose CSV
#: fails for a table that rendered. The number is duplicated rather than imported because
#: `app/routers/exports.py` belongs to no single lane's gate; the reason it must match is
#: written here, where the next person to change one of them will read it.
MAX_REPORT_DAYS = 400

#: There is deliberately no page size on the unmarked list. Two queries and a rollup over a
#: bounded range is `app/routers/exports.py`'s own argument — "bounded by club size and
#: stream directly" — and a chase list that paginated would be a chase list whose second page
#: nobody opens. If a club ever outgrows that, both this and the CSV beside it need the
#: async-job shape `app/routers/privacy.py` already has, and they need it together.

#: A mark somebody actually made. `unmarked` is a stored row meaning "the register was
#: opened and nothing was said about this child", which is a fact and not a decision.
_DECIDED = frozenset({"present", "absent_excused", "absent_unexcused"})
_ABSENT = frozenset({"absent_excused", "absent_unexcused"})


class BadRangeError(ValueError):
    """The window is inverted or longer than `MAX_REPORT_DAYS`."""


@dataclass
class _GroupTally:
    group_id: uuid.UUID
    group_name: str
    sessions: int = 0
    marked_sessions: int = 0
    counts: Counter[str] = field(default_factory=Counter)


def _day_bounds(from_date: date, to_date: date) -> tuple[datetime, datetime]:
    """G3 — stored UTC, rendered Asia/Jerusalem. A window boundary is a *day in the studio's
    zone*, so it is built there and handed back as the UTC instant it is. Built in UTC
    instead it would shift by two or three hours and drop a 21:00 lesson off the last day —
    the same reasoning `bootstrap._start_of_day` gives, and the same reasoning
    `app/routers/exports.py` applies to the CSV this screen downloads beside it.
    """
    return (
        datetime.combine(from_date, time.min, tzinfo=STUDIO_ZONE),
        datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=STUDIO_ZONE),
    )


def build_report(
    session: OrmSession, *, from_date: date, to_date: date, now: datetime
) -> AttendanceReportOut:
    """Both halves of `4c` in two queries, whatever the range.

    `now` is passed rather than read because `app.core.clock.now()` is the only clock
    (§19.5) and this function's central judgement — has this lesson ended — is made against
    it. A service that reached for wall-clock time would also be a service `X-Dev-Now` could
    not move, which is how §19's demo studio shows a chase list at all.
    """
    if to_date < from_date or (to_date - from_date) > timedelta(days=MAX_REPORT_DAYS):
        raise BadRangeError(f"from must precede to, within {MAX_REPORT_DAYS} days")

    range_start, range_end = _day_bounds(from_date, to_date)

    # A cancelled session is the club telling everyone not to come. It was not held, so it
    # is neither unmarked nor part of any denominator -- §5.14's 'sessions held vs planned'
    # is wrong the moment a cancellation counts as either.
    sessions = session.execute(
        select(
            SessionRow.id,
            SessionRow.group_id,
            Group.name,
            SessionRow.starts_at,
            SessionRow.ends_at,
        )
        .join(Group, Group.id == SessionRow.group_id)
        .where(
            SessionRow.starts_at >= range_start,
            SessionRow.starts_at < range_end,
            SessionRow.status != "cancelled",
        )
        .order_by(SessionRow.starts_at)
    ).all()

    if not sessions:
        return AttendanceReportOut(from_date=from_date, to_date=to_date)

    # One aggregate for the whole window rather than a roster build per session: `4c` can be
    # pointed at a term, and `build_roster` runs four queries a session. The per-session
    # rollup below is what lets one result answer both halves of the screen.
    marks = session.execute(
        select(Attendance.session_id, Attendance.status, func.count())
        .join(SessionRow, SessionRow.id == Attendance.session_id)
        .where(
            SessionRow.starts_at >= range_start,
            SessionRow.starts_at < range_end,
            SessionRow.status != "cancelled",
        )
        .group_by(Attendance.session_id, Attendance.status)
    ).all()

    per_session: dict[uuid.UUID, Counter[str]] = {}
    for session_id, mark_status, count in marks:
        per_session.setdefault(session_id, Counter())[mark_status] += count

    tallies: dict[uuid.UUID, _GroupTally] = {}
    unmarked: list[UnmarkedSessionOut] = []

    for session_id, group_id, group_name, starts_at, ends_at in sessions:
        tally = tallies.setdefault(group_id, _GroupTally(group_id, group_name))
        tally.sessions += 1
        counts = per_session.get(session_id, Counter())
        tally.counts.update(counts)
        decided_here = sum(counts[status] for status in _DECIDED)
        if decided_here:
            tally.marked_sessions += 1
        elif ends_at <= now:
            # Not yet ended is not yet late. A coach standing on the mat has failed to do
            # nothing, and a list that accused them is a list nobody reads by week two.
            unmarked.append(
                UnmarkedSessionOut(
                    id=session_id,
                    group_id=group_id,
                    group_name=group_name,
                    starts_at=starts_at,
                    ends_at=ends_at,
                )
            )

    return AttendanceReportOut(
        from_date=from_date,
        to_date=to_date,
        unmarked_sessions=unmarked,
        groups=[_rate(tally) for tally in sorted(tallies.values(), key=_worst_first)],
    )


def _rate(tally: _GroupTally) -> GroupAttendanceRate:
    present = tally.counts["present"]
    absent = sum(tally.counts[status] for status in _ABSENT)
    decided = present + absent
    return GroupAttendanceRate(
        group_id=tally.group_id,
        group_name=tally.group_name,
        present=present,
        absent=absent,
        unmarked=tally.counts["unmarked"],
        # Integer arithmetic, rounded half-up: a bar labelled 67% beside a bar labelled 66%
        # must not be the same underlying number. `round()` alone banker's-rounds, which
        # would print 66% for exactly 66.5.
        rate_percent=(present * 200 + decided) // (decided * 2) if decided else None,
        sessions=tally.sessions,
        marked_sessions=tally.marked_sessions,
    )


def _worst_first(tally: _GroupTally) -> tuple[int, float, str]:
    """`4c` is a chase list, so the group that needs attention leads.

    Groups with no decided marks sort last, not first: "nobody marked anything here" is
    already the subject of the list directly above this card, and putting an unknown at the
    top of a ranking of known bad rates would bury the actual worst group.
    """
    present = tally.counts["present"]
    decided = present + sum(tally.counts[status] for status in _ABSENT)
    if not decided:
        return (1, 0.0, tally.group_name)
    return (0, present / decided, tally.group_name)
