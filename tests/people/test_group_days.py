"""C12's other input, and the two conversions that go wrong silently if nobody pins them.

L5 -- this lane is a READER of sessions. The days a group trains are observed through
`ScheduleService.materialize_sessions()`, never from `group_schedule_rule`: §5.6 versions
rules by date and skips closures, so the rule table answers "what was configured" while
the session table answers "when does this group actually train", and the enrolment form is
asking the second question.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.services.people.group_days import (
    OBSERVATION_WEEKS,
    studio_weekday,
    training_weekdays,
)
from tests.people.conftest import FakeSchedule, make_session

GROUP = uuid.uuid4()
STUDIO = uuid.uuid4()
YEAR = uuid.uuid4()
SINCE = date(2026, 9, 1)  # a Tuesday


def _sessions(schedule: FakeSchedule, *moments: datetime) -> None:
    schedule.sessions[GROUP] = [
        make_session(studio_id=STUDIO, group_id=GROUP, training_year_id=YEAR, starts_at=m)
        for m in moments
    ]


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        # 2026-09-06 is a Sunday. Sunday-first means 0 -- Python's weekday() says 6.
        (datetime(2026, 9, 6, 14, 0, tzinfo=UTC), 0),
        (datetime(2026, 9, 8, 14, 0, tzinfo=UTC), 2),  # Tuesday
        (datetime(2026, 9, 12, 14, 0, tzinfo=UTC), 6),  # Saturday
    ],
)
def test_the_weekday_scale_is_sunday_first(moment, expected):
    """`group_schedule_rule.weekday` is 0=Sunday (§4.3). Python's `date.weekday()` is
    0=Monday. A silent off-by-one here shifts every session in the product by a day."""
    assert studio_weekday(moment) == expected


def test_the_weekday_is_taken_in_asia_jerusalem_and_not_in_utc():
    """G3 -- stored UTC, rendered Asia/Jerusalem. A Sunday 00:30 session is Saturday
    22:30 UTC in winter, and a UTC weekday would file it under the wrong day.

    Israel is UTC+2 in January, so 22:30 UTC on Saturday the 3rd is 00:30 local on Sunday
    the 4th, and 21:30 UTC is 23:30 local, still Saturday. The pair is the whole point:
    two instants half an hour apart land on different weekdays, and only the local one is
    the answer the roster wants.
    """
    assert studio_weekday(datetime(2026, 1, 3, 22, 30, tzinfo=UTC)) == 0
    assert studio_weekday(datetime(2026, 1, 3, 21, 30, tzinfo=UTC)) == 6


def test_the_days_a_group_trains_come_from_materialized_sessions(fake_schedule):
    _sessions(
        fake_schedule,
        datetime(2026, 9, 6, 14, 0, tzinfo=UTC),  # Sunday
        datetime(2026, 9, 9, 14, 0, tzinfo=UTC),  # Wednesday
        datetime(2026, 9, 13, 14, 0, tzinfo=UTC),  # Sunday again
    )
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset({0, 3})


def test_the_reader_is_asked_for_a_four_week_window(fake_schedule):
    """One week is not enough. §5.6 produces no session on a closure, so a single week
    containing a holiday would report a twice-weekly group as training once -- and the
    enrolment form would then be missing a checkbox the manager needs."""
    training_weekdays(GROUP, since=SINCE, schedule=fake_schedule)
    (group_id, from_date, to_date) = fake_schedule.calls[-1]
    assert group_id == GROUP
    assert from_date == SINCE
    assert (to_date - from_date).days == OBSERVATION_WEEKS * 7


def test_a_holiday_week_does_not_shrink_the_answer(fake_schedule):
    """The group trains Sunday and Wednesday. One Wednesday falls on a closure and has no
    session. Over four weeks, Wednesday is still a training day."""
    _sessions(
        fake_schedule,
        datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
        datetime(2026, 9, 13, 14, 0, tzinfo=UTC),
        datetime(2026, 9, 16, 14, 0, tzinfo=UTC),  # the only Wednesday in the window
        datetime(2026, 9, 20, 14, 0, tzinfo=UTC),
    )
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset({0, 3})


def test_a_cancelled_session_is_not_a_training_day(fake_schedule):
    """A cancelled session is a day the club told everyone not to come. Counting it would
    put a checkbox on the form for a day nobody trains."""
    fake_schedule.sessions[GROUP] = [
        make_session(
            studio_id=STUDIO,
            group_id=GROUP,
            training_year_id=YEAR,
            starts_at=datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
        ),
        make_session(
            studio_id=STUDIO,
            group_id=GROUP,
            training_year_id=YEAR,
            starts_at=datetime(2026, 9, 9, 14, 0, tzinfo=UTC),
            status="cancelled",
        ),
    ]
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset({0})


def test_a_completed_session_still_counts_as_a_training_day(fake_schedule):
    """The control for the test above. If the filter were "status == 'scheduled'" rather
    than "not cancelled", a group whose recent sessions have all been marked completed
    would report training on no days at all -- and the enrolment form would go blank for
    the club's longest-running groups."""
    fake_schedule.sessions[GROUP] = [
        make_session(
            studio_id=STUDIO,
            group_id=GROUP,
            training_year_id=YEAR,
            starts_at=datetime(2026, 9, 6, 14, 0, tzinfo=UTC),
            status="completed",
        )
    ]
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset({0})


def test_a_group_with_no_sessions_trains_on_no_days(fake_schedule):
    """A group whose schedule has not been built yet. An empty set is the honest answer,
    and the enrolment form renders 'this group has no schedule' rather than a silent
    empty checkbox list."""
    assert training_weekdays(GROUP, since=SINCE, schedule=fake_schedule) == frozenset()
