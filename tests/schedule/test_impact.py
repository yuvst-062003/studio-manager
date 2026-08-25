"""§5.6's impact preview and C12's warning, as a pure diff. No database, no clock.

**The invariant this lane exists to protect lives here.** A rule change rewrites only
sessions with `starts_at > now`; a session in the past, a session carrying
`is_manually_edited`, and an ad-hoc session are never touched. Every test below that names
a protection is a way that guarantee can be lost, and losing any one of them destroys
history that a coach or a manager already acted on.

**C12 is the other half.** Moving a rule from Tuesday to Wednesday empties the pattern of
every student who only came on Tuesdays. They drop off the roster and stop being counted
absent, which reads exactly like the feature working. The count is the whole point.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.services.schedule.impact import (
    ExistingSession,
    plan_change,
    students_left_unscheduled,
)
from app.services.schedule.rules import Occurrence

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)  # a Tuesday lunchtime in Jerusalem
YEAR_START = date(2026, 9, 1)


def occurrence(day: date, hour: int = 17, *, location=None, rule_id=None) -> Occurrence:
    return Occurrence(
        on_date=day,
        starts_at=datetime(day.year, day.month, day.day, hour - 2, 0, tzinfo=UTC),
        ends_at=datetime(day.year, day.month, day.day, hour, 0, tzinfo=UTC),
        location_id=location,
        rule_id=rule_id,
    )


def existing(
    day: date,
    hour: int = 17,
    *,
    manual: bool = False,
    ad_hoc: bool = False,
    status: str = "scheduled",
    location=None,
) -> ExistingSession:
    return ExistingSession(
        id=uuid.uuid4(),
        starts_at=datetime(day.year, day.month, day.day, hour - 2, 0, tzinfo=UTC),
        ends_at=datetime(day.year, day.month, day.day, hour, 0, tzinfo=UTC),
        location_id=location,
        status=status,
        is_manually_edited=manual,
        is_ad_hoc=ad_hoc,
    )


# -- the three protections ----------------------------------------------------
def test_a_past_session_is_never_rewritten():
    """A session that happened has attendance rows against it. Regenerating it rewrites a
    register a coach already signed."""
    held = existing(date(2026, 10, 6))
    plan = plan_change(
        [held], [occurrence(date(2026, 10, 6), 18)], now=NOW, effective_from=YEAR_START
    )

    assert plan.protected_past == (held.id,)
    assert plan.to_update == ()
    assert plan.to_cancel == ()


def test_a_manually_edited_future_session_is_never_rewritten_and_is_named():
    """Someone moved this one class deliberately, usually a room clash. A rule change that
    silently undoes it is the product overruling a human who knew something it did not —
    and §5.6's dialog lists them by date for exactly that reason."""
    moved = existing(date(2026, 11, 17), 20, manual=True)
    plan = plan_change(
        [moved], [occurrence(date(2026, 11, 17), 18)], now=NOW, effective_from=YEAR_START
    )

    assert [p.id for p in plan.protected_manually_edited] == [moved.id]
    assert plan.protected_manually_edited[0].starts_at == moved.starts_at
    assert plan.to_update == ()
    # And the slot it would have occupied is NOT filled with a second session.
    assert plan.to_create == ()


def test_an_ad_hoc_session_survives_a_regenerate_no_rule_created_it():
    one_off = existing(date(2026, 11, 10), 19, ad_hoc=True)
    plan = plan_change([one_off], [], now=NOW, effective_from=YEAR_START)

    assert plan.protected_ad_hoc == (one_off.id,)
    assert plan.to_cancel == ()


def test_a_session_already_cancelled_is_not_resurrected():
    """A closure cancelled this one. A later rule change must not undo the closure — and
    the desired set never contains a closed date, so the row simply stays as it is."""
    closed = existing(date(2026, 11, 24), status="cancelled")
    plan = plan_change([closed], [], now=NOW, effective_from=YEAR_START)

    assert plan.to_update == ()
    assert plan.to_cancel == ()


# -- what actually changes ----------------------------------------------------
def test_a_future_session_at_a_different_time_is_an_update():
    future = existing(date(2026, 11, 17), 19)
    wanted = occurrence(date(2026, 11, 17), 20)
    plan = plan_change([future], [wanted], now=NOW, effective_from=YEAR_START)

    assert plan.to_update == ((future.id, wanted),)
    assert plan.to_create == ()
    assert plan.to_cancel == ()


def test_a_future_session_already_at_the_wanted_time_is_left_alone():
    """Not counted as an update. §5.6's dialog answers 'what am I about to lose', and a row
    that does not move is noise in that answer — and a needless UPDATE would bump
    `updated_at` on a year's worth of sessions."""
    future = existing(date(2026, 11, 17), 19)
    plan = plan_change(
        [future], [occurrence(date(2026, 11, 17), 19)], now=NOW, effective_from=YEAR_START
    )

    assert plan.to_update == ()
    assert plan.to_create == ()
    assert plan.to_cancel == ()
    assert plan.first_affected_date is None


def test_a_wanted_slot_with_no_session_is_a_create():
    plan = plan_change([], [occurrence(date(2026, 11, 18))], now=NOW, effective_from=YEAR_START)
    assert [o.on_date for o in plan.to_create] == [date(2026, 11, 18)]


def test_a_session_no_rule_covers_any_more_is_a_cancel():
    orphan = existing(date(2026, 11, 20))
    plan = plan_change([orphan], [], now=NOW, effective_from=YEAR_START)
    assert plan.to_cancel == (orphan.id,)


def test_moving_a_rule_to_another_weekday_is_a_cancel_plus_a_create():
    """The Tuesday-to-Wednesday move C12 is about, seen from the sessions' side."""
    tuesday = existing(date(2026, 11, 17))
    plan = plan_change(
        [tuesday], [occurrence(date(2026, 11, 18))], now=NOW, effective_from=YEAR_START
    )

    assert plan.to_cancel == (tuesday.id,)
    assert [o.on_date for o in plan.to_create] == [date(2026, 11, 18)]
    assert plan.first_affected_date == date(2026, 11, 17)


def test_a_location_change_alone_is_still_an_update():
    elsewhere = uuid.uuid4()
    future = existing(date(2026, 11, 17), 19)
    wanted = occurrence(date(2026, 11, 17), 19, location=elsewhere)
    plan = plan_change([future], [wanted], now=NOW, effective_from=YEAR_START)
    assert plan.to_update == ((future.id, wanted),)


def test_two_sessions_on_one_day_pair_up_in_start_order():
    """D-M2-5. A group training twice on a Friday must not have its morning class matched
    against its afternoon one."""
    morning = existing(date(2026, 11, 20), 11)
    noon = existing(date(2026, 11, 20), 15)
    wanted_morning = occurrence(date(2026, 11, 20), 12)
    wanted_noon = occurrence(date(2026, 11, 20), 16)

    plan = plan_change(
        [noon, morning], [wanted_noon, wanted_morning], now=NOW, effective_from=YEAR_START
    )
    assert plan.to_update == ((morning.id, wanted_morning), (noon.id, wanted_noon))


def test_first_affected_date_is_the_earliest_thing_that_moves():
    late = existing(date(2026, 12, 15), 19)
    early = existing(date(2026, 11, 17), 19)
    plan = plan_change(
        [late, early],
        [occurrence(date(2026, 11, 17), 20), occurrence(date(2026, 12, 15), 20)],
        now=NOW,
        effective_from=YEAR_START,
    )
    assert plan.first_affected_date == date(2026, 11, 17)


# -- the window ---------------------------------------------------------------
def test_nothing_before_effective_from_is_touched_even_though_it_is_future():
    """The manager said 'from December'. A November session is neither past nor changing,
    and rewriting it would apply a change the manager explicitly dated later."""
    november = existing(date(2026, 11, 17), 19)
    plan = plan_change(
        [november],
        [occurrence(date(2026, 12, 15), 20)],
        now=NOW,
        effective_from=date(2026, 12, 1),
    )
    assert plan.to_cancel == ()
    assert plan.to_update == ()
    assert [o.on_date for o in plan.to_create] == [date(2026, 12, 15)]


def test_a_desired_occurrence_in_the_past_is_never_created():
    """plan_change enforces the invariant itself rather than trusting the caller's range.
    One function owns 'only the future', so a caller that expands too wide cannot break it."""
    plan = plan_change([], [occurrence(date(2026, 10, 6))], now=NOW, effective_from=YEAR_START)
    assert plan.to_create == ()


def test_a_session_starting_exactly_now_counts_as_past():
    """The boundary is `starts_at > now`, verbatim from §5.6. A class that is starting
    this second has people on the mat."""
    starting = ExistingSession(
        id=uuid.uuid4(),
        starts_at=NOW,
        ends_at=datetime(2026, 11, 3, 14, 0, tzinfo=UTC),
        location_id=None,
        status="scheduled",
        is_manually_edited=False,
        is_ad_hoc=False,
    )
    plan = plan_change([starting], [], now=NOW, effective_from=YEAR_START)
    assert plan.protected_past == (starting.id,)
    assert plan.to_cancel == ()


# -- C12 ----------------------------------------------------------------------
def test_c12_counts_the_students_a_change_leaves_expecting_nothing():
    """Moving a rule from Tuesday to Wednesday empties the pattern of every student who
    only came on Tuesdays."""
    tuesday_only = [(uuid.uuid4(), [2]) for _ in range(3)]
    comes_to_both = [(uuid.uuid4(), [2, 3])]
    assert students_left_unscheduled(tuesday_only + comes_to_both, new_weekdays={3}) == 3


def test_c12_counts_a_student_with_no_pattern_only_when_the_group_stops_training():
    """`attends_weekdays IS NULL` means 'all of this group's sessions'. That student is
    fine while any rule survives — and is left with nothing the moment the last one goes,
    which is the case most worth warning about."""
    everyone = [(uuid.uuid4(), None), (uuid.uuid4(), None)]
    assert students_left_unscheduled(everyone, new_weekdays={3}) == 0
    assert students_left_unscheduled(everyone, new_weekdays=set()) == 2


def test_c12_counts_students_not_enrollments():
    """D-M2-6. `uq_enrollment_live` makes these the same number inside one group today, and
    the copy says תלמידים — a later schema change must not silently turn it into a
    different count."""
    student = uuid.uuid4()
    assert students_left_unscheduled([(student, [2]), (student, [2])], new_weekdays={3}) == 1


def test_c12_is_zero_when_nobody_loses_their_day():
    patterns = [(uuid.uuid4(), [0]), (uuid.uuid4(), [0, 5]), (uuid.uuid4(), None)]
    assert students_left_unscheduled(patterns, new_weekdays={0, 5}) == 0


def test_c12_ignores_a_day_the_student_asked_for_that_the_group_never_trains():
    """`expected_weekdays` intersects, so a stale pattern naming a day the group dropped
    does not keep the student alive on a roster that no longer has that day."""
    assert students_left_unscheduled([(uuid.uuid4(), [4])], new_weekdays={0, 2}) == 1


def test_a_session_carrying_both_flags_is_ad_hoc_and_not_a_moved_rule_session():
    """`create_ad_hoc_session` sets `is_manually_edited` AND `is_ad_hoc` — the first says a
    human decided this, the second says no rule owns it. Testing manual first would file
    every ad-hoc session under the wrong protection, and the dialog would tell a manager
    they had two edited lessons and no one-offs."""
    one_off = existing(date(2026, 12, 11), 10, manual=True, ad_hoc=True)
    plan = plan_change([one_off], [], now=NOW, effective_from=YEAR_START)

    assert plan.protected_ad_hoc == (one_off.id,)
    assert plan.protected_manually_edited == ()


def test_an_ad_hoc_session_does_not_suppress_the_rule_session_on_its_day():
    """An ad-hoc class is an EXTRA, not a moved one — a Friday seminar that happens to land
    on a training day is a second lesson, and it existed alongside the generated one before
    the change too. Only a manually-edited session consumes its slot."""
    seminar = existing(date(2026, 11, 18), 10, ad_hoc=True)
    wanted = occurrence(date(2026, 11, 18), 19)
    plan = plan_change([seminar], [wanted], now=NOW, effective_from=YEAR_START)

    assert plan.protected_ad_hoc == (seminar.id,)
    assert plan.to_create == (wanted,)


def test_a_manually_edited_morning_class_consumes_the_morning_slot_not_the_afternoon_one():
    """A group training twice a day. The moved morning class must pair with the morning
    slot, or the afternoon one is silently duplicated and the morning one silently dropped."""
    moved_morning = existing(date(2026, 11, 20), 12, manual=True)
    afternoon = existing(date(2026, 11, 20), 17)
    wanted_morning = occurrence(date(2026, 11, 20), 11)
    wanted_afternoon = occurrence(date(2026, 11, 20), 18)

    plan = plan_change(
        [moved_morning, afternoon],
        [wanted_morning, wanted_afternoon],
        now=NOW,
        effective_from=YEAR_START,
    )
    assert plan.to_create == ()
    assert plan.to_update == ((afternoon.id, wanted_afternoon),)
    assert [p.id for p in plan.protected_manually_edited] == [moved_morning.id]
