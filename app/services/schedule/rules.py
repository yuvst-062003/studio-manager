"""Weekly rules -> dated occurrences. Pure: no database, no clock, no studio.

**Sunday is 0**, matching `group_schedule_rule.weekday`, Postgres's `EXTRACT(DOW)` and
Israel's working week. Python's `date.weekday()` is Monday-based, and the one-line
conversion below is the only place in this lane that knows the difference.

**A rule carries a naive `Time`; a session carries an instant.** That is not an
inconsistency, it is the DST rule: a 17:00 class is at 17:00 in November and 17:00 in June,
and those are different UTC instants. Storing the rule as an offset would put every summer
evening class an hour early — and this club's classes are overwhelmingly in the evening.

Nothing here reads the clock. `now` is a parameter everywhere it matters, because
`app.core.clock.now()` is the only clock (§19.5) and a pure function that read it could not
be time-travelled.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

#: SPEC §4.3, G3. `@studio/core`'s `STUDIO_TIMEZONE` is the same constant on the client.
STUDIO_TZ = ZoneInfo("Asia/Jerusalem")


def weekday_sunday_first(day: date) -> int:
    """0 Sunday … 6 Saturday. `date.weekday()` is 0 Monday … 6 Sunday."""
    return (day.weekday() + 1) % 7


def jerusalem_date(moment: datetime) -> date:
    """The Jerusalem calendar day an instant falls on.

    A **key**, not a label — the same distinction `@studio/core`'s `studioDayKey` makes.
    22:30Z on 14 March is already 15 March here, and grouping by the UTC date would file an
    evening class under the previous day.
    """
    return moment.astimezone(STUDIO_TZ).date()


def to_utc(day: date, clock: time) -> datetime:
    """A Jerusalem wall-clock time on a given day, as the UTC instant it names.

    A local time that does not exist (the hour skipped when Israel springs forward, 02:00
    to 03:00 on a Friday morning) resolves through PEP 495's fold rather than raising. No
    club schedules a class in it, and refusing to materialize a year because one theoretical
    slot is ambiguous would be worse than picking an offset.
    """
    return datetime.combine(day, clock, tzinfo=STUDIO_TZ).astimezone(UTC)


@dataclass(frozen=True)
class RuleSpec:
    """One `group_schedule_rule`, or one the manager has typed but not yet saved.

    `rule_id` is `None` exactly when the rule is unsaved, which is what lets the impact
    preview run over rules that do not exist yet — the preview has to answer "what would
    happen" before anything is written.
    """

    weekday: int
    start_time: time
    end_time: time
    location_id: uuid.UUID | None
    effective_from: date
    effective_to: date | None
    rule_id: uuid.UUID | None = None


@dataclass(frozen=True)
class ClosureSpec:
    """One `studio_closure`, inclusive at both ends."""

    date_from: date
    date_to: date

    def covers(self, day: date) -> bool:
        return self.date_from <= day <= self.date_to


@dataclass(frozen=True)
class Occurrence:
    """One session a rule set says should exist. Not yet a row."""

    on_date: date
    starts_at: datetime
    ends_at: datetime
    location_id: uuid.UUID | None
    rule_id: uuid.UUID | None


def _days(from_date: date, to_date: date) -> Iterable[date]:
    day = from_date
    while day <= to_date:
        yield day
        day += timedelta(days=1)


def _live_on(rule: RuleSpec, day: date) -> bool:
    if day < rule.effective_from:
        return False
    return rule.effective_to is None or day <= rule.effective_to


def expand_rules(
    rules: Sequence[RuleSpec],
    from_date: date,
    to_date: date,
    closures: Sequence[ClosureSpec],
) -> list[Occurrence]:
    """Every session `rules` calls for in `[from_date, to_date]`, in start order.

    Closures produce **no occurrence at all** rather than a cancelled one (§5.6). A date the
    club is closed simply has no lesson, which is why a parent's month view shows a gap
    there instead of a row struck through. Cancelling is what happens when a closure is
    added *after* the sessions already exist, and that is `ScheduleService`'s job, not this
    function's.

    A backwards range yields nothing. It is reachable from a manager typing an end date
    before a start date, and looping forever is the one outcome worse than an empty list.
    """
    occurrences: list[Occurrence] = []
    for day in _days(from_date, to_date):
        if any(closure.covers(day) for closure in closures):
            continue
        weekday = weekday_sunday_first(day)
        for rule in rules:
            if rule.weekday != weekday or not _live_on(rule, day):
                continue
            occurrences.append(
                Occurrence(
                    on_date=day,
                    starts_at=to_utc(day, rule.start_time),
                    ends_at=to_utc(day, rule.end_time),
                    location_id=rule.location_id,
                    rule_id=rule.rule_id,
                )
            )
    return sorted(occurrences, key=lambda o: o.starts_at)


def rule_weekdays(rules: Sequence[RuleSpec], on_or_after: date) -> frozenset[int]:
    """The weekdays a rule set still covers as of a date. **C12 reads this.**

    `app/services/people/attendance_pattern.py::expected_weekdays` intersects a student's
    `attends_weekdays` with exactly this set, so a rule that has been closed must drop out
    of it — otherwise a student stays "expected" at a session the group no longer holds and
    is counted absent from it forever, which is C12's bug arriving from the other side.
    """
    return frozenset(rule.weekday for rule in rules if _live_on(rule, on_or_after))
