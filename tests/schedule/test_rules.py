"""Weekly rules -> dated sessions. Pure: no database, no clock, no studio.

The two things this file is really about:

* **Sunday is 0.** `group_schedule_rule.weekday` matches Postgres's `EXTRACT(DOW)` and
  Israel's working week. `date.weekday()` is Monday-based. Conflating them shifts every
  session in the product by one day, and a test that only ever used Wednesdays would not
  notice.
* **A rule keeps wall-clock time across a DST switch.** A 17:00 class is at 17:00 in
  November and 17:00 in June; the UTC instant differs by an hour. Storing a fixed offset
  instead of a zone puts every summer evening class an hour early, and a judo club's
  classes are overwhelmingly in the evening.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

from app.services.schedule.rules import (
    ClosureSpec,
    RuleSpec,
    expand_rules,
    jerusalem_date,
    rule_weekdays,
    to_utc,
    weekday_sunday_first,
)

SUNDAY = 0
TUESDAY = 2
FRIDAY = 5


def a_rule(**overrides) -> RuleSpec:
    base = dict(
        weekday=SUNDAY,
        start_time=time(17, 0),
        end_time=time(19, 0),
        location_id=None,
        effective_from=date(2026, 9, 1),
        effective_to=None,
        rule_id=None,
    )
    return RuleSpec(**{**base, **overrides})


def test_weekday_is_sunday_first_matching_the_column():
    # 2026-09-06 is a Sunday.
    assert weekday_sunday_first(date(2026, 9, 6)) == 0
    assert weekday_sunday_first(date(2026, 9, 7)) == 1
    assert weekday_sunday_first(date(2026, 9, 11)) == 5
    assert weekday_sunday_first(date(2026, 9, 12)) == 6


def test_a_rule_keeps_wall_clock_time_across_the_dst_switch():
    """Israel leaves summer time on the last Sunday of October — 25 October 2026. A 17:00
    Tuesday class is 14:00Z before it and 15:00Z after it, and both are 17:00 locally."""
    rule = a_rule(weekday=TUESDAY, start_time=time(17, 0), end_time=time(19, 0))
    occurrences = expand_rules([rule], date(2026, 10, 19), date(2026, 11, 4), [])

    by_date = {o.on_date: o for o in occurrences}
    assert by_date[date(2026, 10, 20)].starts_at == datetime(2026, 10, 20, 14, 0, tzinfo=UTC)
    assert by_date[date(2026, 11, 3)].starts_at == datetime(2026, 11, 3, 15, 0, tzinfo=UTC)


def test_an_occurrence_lands_on_every_matching_weekday_in_the_range_inclusive():
    rule = a_rule(weekday=SUNDAY)
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 27), [])
    assert [o.on_date for o in occurrences] == [
        date(2026, 9, 6),
        date(2026, 9, 13),
        date(2026, 9, 20),
        date(2026, 9, 27),
    ]


def test_a_closure_produces_no_session_rather_than_a_cancelled_one():
    """§5.6 — generation skips closures. That is why a parent's month view can show a gap
    with no cancelled row in it: the lesson was never created, so there is nothing to
    cancel. A closure added *later* is a different operation and does cancel."""
    rule = a_rule(weekday=SUNDAY)
    closure = ClosureSpec(date_from=date(2026, 9, 13), date_to=date(2026, 9, 20))
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 27), [closure])
    assert [o.on_date for o in occurrences] == [date(2026, 9, 6), date(2026, 9, 27)]


def test_a_closure_range_is_inclusive_at_both_ends():
    rule = a_rule(weekday=SUNDAY)
    closure = ClosureSpec(date_from=date(2026, 9, 6), date_to=date(2026, 9, 6))
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 13), [])
    assert len(occurrences) == 2
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 13), [closure])
    assert [o.on_date for o in occurrences] == [date(2026, 9, 13)]


def test_a_rule_produces_nothing_before_it_takes_effect_or_after_it_is_closed():
    """§4.3 versions rules by date rather than editing them in place, so expansion has to
    honour both ends of the window or a superseded rule keeps generating sessions."""
    rule = a_rule(weekday=SUNDAY, effective_from=date(2026, 9, 13), effective_to=date(2026, 9, 20))
    occurrences = expand_rules([rule], date(2026, 9, 1), date(2026, 10, 4), [])
    assert [o.on_date for o in occurrences] == [date(2026, 9, 13), date(2026, 9, 20)]


def test_two_rules_on_the_same_day_both_produce_a_session_in_start_order():
    morning = a_rule(weekday=FRIDAY, start_time=time(9, 0), end_time=time(10, 0))
    noon = a_rule(weekday=FRIDAY, start_time=time(12, 0), end_time=time(14, 0))
    occurrences = expand_rules([noon, morning], date(2026, 9, 4), date(2026, 9, 4), [])
    assert [o.starts_at.hour for o in occurrences] == [6, 9]  # 09:00 and 12:00 at UTC+3


def test_the_location_and_rule_id_travel_with_the_occurrence():
    location = uuid.uuid4()
    rule_id = uuid.uuid4()
    rule = a_rule(weekday=SUNDAY, location_id=location, rule_id=rule_id)
    occurrence = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 6), [])[0]
    assert occurrence.location_id == location
    assert occurrence.rule_id == rule_id


def test_an_evening_class_is_filed_under_the_jerusalem_day_not_the_utc_one():
    """22:30Z on 14 March is already 15 March in Jerusalem. Grouping by the UTC date files
    an evening class under the previous day, and almost every class here is in the
    evening. `@studio/core`'s `studioDayKey` is the same rule on the client."""
    assert jerusalem_date(datetime(2026, 3, 14, 22, 30, tzinfo=UTC)) == date(2026, 3, 15)
    assert jerusalem_date(datetime(2026, 3, 14, 12, 30, tzinfo=UTC)) == date(2026, 3, 14)


def test_to_utc_round_trips_through_the_studio_zone():
    moment = to_utc(date(2026, 11, 3), time(17, 0))
    assert moment == datetime(2026, 11, 3, 15, 0, tzinfo=UTC)
    assert jerusalem_date(moment) == date(2026, 11, 3)


def test_rule_weekdays_reports_only_rules_still_live_on_the_date_asked_about():
    """C12 reads this. A student's `attends_weekdays` is intersected with it, so a rule
    that has been closed must not keep a student on a roster that no longer exists."""
    live = a_rule(weekday=TUESDAY, effective_from=date(2026, 9, 1))
    retired = a_rule(
        weekday=FRIDAY, effective_from=date(2025, 9, 1), effective_to=date(2026, 8, 31)
    )
    assert rule_weekdays([live, retired], date(2026, 9, 15)) == frozenset({TUESDAY})
    assert rule_weekdays([live, retired], date(2026, 1, 1)) == frozenset({FRIDAY})


def test_an_empty_rule_set_expands_to_nothing_rather_than_raising():
    assert expand_rules([], date(2026, 9, 1), date(2027, 6, 30), []) == []


def test_a_backwards_range_expands_to_nothing_rather_than_looping_forever():
    rule = a_rule(weekday=SUNDAY)
    assert expand_rules([rule], date(2026, 9, 27), date(2026, 9, 6), []) == []
