"""C12's other input: the weekdays a group actually trains.

`attendance_pattern.expected_weekdays` takes two arguments -- the student's stored pattern
and the group's scheduled weekdays. The first is a column. This module is the second, and
L5 decides where it comes from: **through `ScheduleService.materialize_sessions()`**, the
W2 seam, and never from a `group_schedule_rule` query of our own.

That is not ceremony. §5.6 versions rules by date and rewrites future sessions when one
changes, and it produces no session at all on a closure. So the rule table answers "what
was configured, as of when", while the session table answers "when does this group train",
and the enrolment form is asking the second question. Reading the rules ourselves would
also make this lane a second implementation of §5.6's effective-date logic, which is the
same mistake C12 exists to prevent one level down.

**Four weeks, not one.** A single week containing a holiday reports a twice-weekly group
as training once, and the manager's checkbox list would be missing a day. Four weeks
survives any single closure and still costs one call.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

from app.models.schedule import Session

#: G3 -- stored UTC, rendered Asia/Jerusalem. A weekday is a rendering, so it is taken
#: in the studio's zone. `Studio.timezone` exists and defaults to this; the constant is
#: used rather than the column because a group's weekday scale has to agree with
#: `group_schedule_rule.weekday`, which §4.3 fixes to Israel's week.
STUDIO_ZONE = ZoneInfo("Asia/Jerusalem")

#: Long enough to survive one closure, short enough to be one query.
OBSERVATION_WEEKS = 4

#: §5.6 -- a cancelled session is the club telling everyone not to come. It is not a
#: training day, and a checkbox for it would ask a manager about a day nobody trains.
#: `completed` stays in: a group whose recent sessions have all been marked off is the
#: club's longest-running group, not one that has stopped training.
_TRAINING_STATUSES = frozenset({"scheduled", "completed"})


class ScheduleReader(Protocol):
    """The half of `ScheduleService` this lane uses.

    A Protocol rather than the class itself, so a test supplies a reader by injection
    instead of monkeypatching a module global -- and so mypy checks that the double and
    the real service really do have the same signature.
    """

    def materialize_sessions(
        self, group_id: uuid.UUID, from_date: date, to_date: date
    ) -> list[Session]: ...


def studio_weekday(moment: datetime) -> int:
    """0-6, **Sunday-first**, in Asia/Jerusalem.

    Two conversions, both easy to get silently wrong: the instant is stored UTC and must
    be rendered in the studio's zone before a day can be read off it, and Python's
    `date.weekday()` starts on Monday while `group_schedule_rule.weekday` starts on
    Sunday (§4.3). Either slip shifts the whole product by a day.
    """
    return (moment.astimezone(STUDIO_ZONE).weekday() + 1) % 7


def training_weekdays(
    group_id: uuid.UUID,
    *,
    since: date,
    schedule: ScheduleReader,
    weeks: int = OBSERVATION_WEEKS,
) -> frozenset[int]:
    """The weekdays this group trains, observed from the materialized calendar.

    An empty set is a real answer, not an error: a group whose schedule has not been built
    yet trains on no days, and the enrolment form says so rather than rendering an empty
    row of checkboxes with no explanation.

    Raises whatever the reader raises. Until lane SCHEDULE merges that is
    `NotImplementedError`, and this lane deliberately does not soften it into an empty
    list -- an empty list here is indistinguishable from "this group has no schedule",
    which is exactly the lie the seam's docstring warns about.
    """
    sessions = schedule.materialize_sessions(group_id, since, since + timedelta(weeks=weeks))
    return frozenset(
        studio_weekday(session.starts_at)
        for session in sessions
        if session.status in _TRAINING_STATUSES
    )
