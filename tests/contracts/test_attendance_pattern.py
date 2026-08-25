"""C11 and C12's shared seam: what a student is *expected* at, and how much that is.

The two defects the club's real structure exposed are one decision (W2 § What the real
club changed). "Twice a week" is simultaneously what a child attends -- C12, which §5.7
had no way to say -- and what they pay for -- C11, which §5.10 priced per group. Both the
roster and the billing run read this module rather than re-deriving it, because a second
implementation is a second answer.
"""

from __future__ import annotations

import pytest
from app.services.people.attendance_pattern import (
    expected_weekdays,
    is_expected,
    weekly_volume,
)

# §5.6's worked structure: מתחילים trains Sunday and Friday.
SUN, MON, TUE, WED, THU, FRI = 0, 1, 2, 3, 4, 5


class TestExpectedWeekdays:
    def test_null_means_every_session_of_the_group(self):
        """The default and the common case. A group that trains once a week never needs
        the column set, and neither does a child who comes to everything."""
        assert expected_weekdays(None, {SUN, FRI}) == {SUN, FRI}

    def test_a_subset_narrows_to_exactly_those_days(self):
        """C12's whole point: a twice-weekly group with a once-weekly student."""
        assert expected_weekdays([SUN], {SUN, FRI}) == {SUN}

    def test_a_day_the_group_does_not_train_is_dropped(self):
        """§5.6 rewrites future sessions when a rule changes, so a pattern set against
        the old schedule can name a day the group no longer trains. Intersecting keeps
        the roster honest; the alternative is a student expected at a session that does
        not exist, counted absent from it forever."""
        assert expected_weekdays([SUN, WED], {SUN, FRI}) == {SUN}

    def test_a_pattern_sharing_no_day_with_the_schedule_expects_nothing(self):
        """Not an error here. It is a real state -- a manager moved the schedule out from
        under a student -- and the dashboard surfaces it; this function only reports it."""
        assert expected_weekdays([WED], {SUN, FRI}) == frozenset()


class TestIsExpected:
    @pytest.mark.parametrize("weekday,expected", [(SUN, True), (FRI, False), (WED, False)])
    def test_one_session_against_a_narrowed_pattern(self, weekday, expected):
        assert is_expected([SUN], {SUN, FRI}, weekday) is expected

    def test_null_expects_every_day_the_group_trains(self):
        assert is_expected(None, {SUN, FRI}, FRI) is True

    def test_a_day_outside_the_schedule_is_never_expected(self):
        """An ad-hoc session (§5.6) on a Wednesday. Nobody is *expected*; anyone who comes
        is still markable, which is the roster's job and not this function's."""
        assert is_expected(None, {SUN, FRI}, WED) is False


class TestWeeklyVolume:
    def test_one_group_twice_a_week(self):
        assert weekly_volume([(None, {SUN, FRI})]) == 2

    def test_the_c11_case_two_groups_one_day_each_is_twice_a_week(self):
        """The defect in one assertion. A child in the competition group *and* the
        teenagers group, coming once to each, trains twice a week and pays the
        twice-a-week price ONCE. §5.10 before C11 charged them two group prices."""
        assert weekly_volume([([TUE], {TUE, FRI}), ([SUN], {SUN, WED})]) == 2

    def test_two_sessions_on_one_weekday_count_twice(self):
        """Volume is sessions per week, not distinct days. Two groups both training
        Sunday, attended both, is two sessions of judo on a Sunday."""
        assert weekly_volume([([SUN], {SUN, FRI}), ([SUN], {SUN, WED})]) == 2

    def test_daily(self):
        assert weekly_volume([(None, {SUN, MON, TUE, WED, THU})]) == 5

    def test_a_student_with_no_enrollments_trains_nothing(self):
        """§5.4a: a lead or a trial has no enrollment, which is what makes the billing
        run skip them with no special-casing."""
        assert weekly_volume([]) == 0
