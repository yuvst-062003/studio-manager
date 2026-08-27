"""Training plans: what a student may mark, and when.

The manager's rule, in his words: base training is Tuesday and Friday; on 400 ₪ the
student may choose one more session per week and must mark that they are coming, after
which the app stops letting them mark more; on 550 ₪ there is no weekly limit and the
Saturday private lessons open up.

Four checks enforce that, all in one service. The two that carry the most weight are the
ones a reasonable implementation gets wrong: the week bucket is a **local Jerusalem**
week, so a session stored Saturday evening UTC belongs to the following week -- and
eligibility is an explicit link rather than a derivation from age, because the club's age
brackets overlap and an age rule admits exactly the child the coach decided not to place.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from app.models.billing import PricePlan
from app.models.people import Enrollment
from app.models.structure import Group
from app.models.training_plan import SessionBooking
from app.services.schedule.booking import (
    BookingService,
    week_start,
)
from app.services.schedule.errors import BookingRefusedError
from sqlalchemy import select
from tests.schedule.conftest import (
    MONDAY,
    NEXT_SUNDAY,
    NOW,
    SUNDAY,
    YEAR_STARTS,
    make_session,
    make_student,
)


# -- §3.1 the week bucket ------------------------------------------------------
def test_the_week_runs_sunday_to_saturday():
    """`app/services/people/attendance_pattern.py` already states that the club's week
    starts on Sunday, and so does every roster in the product."""
    # 2026-11-15 is a Sunday.
    assert week_start(datetime(2026, 11, 15, 14, 0, tzinfo=UTC)) == date(2026, 11, 15)
    assert week_start(datetime(2026, 11, 21, 14, 0, tzinfo=UTC)) == date(2026, 11, 15)
    assert week_start(datetime(2026, 11, 22, 14, 0, tzinfo=UTC)) == date(2026, 11, 22)


def test_a_saturday_evening_session_belongs_to_the_next_local_week():
    """**The bucket is the session's LOCAL Jerusalem date, not its stored UTC date.**

    `session.starts_at` is timestamptz in UTC and Jerusalem is UTC+2 or UTC+3, so a session
    stored at Saturday 22:00 UTC is Sunday morning locally and belongs to the FOLLOWING
    week's allowance. Getting this wrong hands one student a free credit twice a year and
    takes one away twice a year, silently.
    """
    # Saturday 21 Nov 2026, 22:30 UTC -> Sunday 22 Nov in Jerusalem (UTC+2 in winter).
    assert week_start(datetime(2026, 11, 21, 22, 30, tzinfo=UTC)) == date(2026, 11, 22)


def test_both_dst_boundaries_are_pinned():
    """Israel moves to UTC+3 on the last Friday of March and back on the last Sunday of
    October. A hand-rolled offset is right for ten months of the year, which is exactly
    long enough for nobody to notice it is wrong."""
    # Summer (UTC+3): Saturday 20:30 UTC is already Sunday 23:30 local.
    assert week_start(datetime(2027, 6, 26, 21, 30, tzinfo=UTC)) == date(2027, 6, 27)
    # Winter (UTC+2): the same wall-clock instant is Saturday 23:30 local, still this week.
    assert week_start(datetime(2026, 12, 26, 21, 30, tzinfo=UTC)) == date(2026, 12, 20)
    # The spring-forward night itself: 2027-03-26 is the last Friday of March.
    assert week_start(datetime(2027, 3, 27, 21, 30, tzinfo=UTC)) == date(2027, 3, 28)
    # The autumn-back night: 2026-10-25 is the last Sunday of October.
    assert week_start(datetime(2026, 10, 24, 21, 30, tzinfo=UTC)) == date(2026, 10, 25)


# -- §7.1 the allowance --------------------------------------------------------
def test_a_plan_with_no_allowance_can_mark_nothing(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """On 300 ₪ nothing is ever markable -- the base is included and there is no extra."""
    student_id = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    with pytest.raises(BookingRefusedError):
        BookingService(tenant_session).mark(
            studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
        )


def test_one_credit_a_week_is_spent_by_marking(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """§3 -- the week opens with one credit, they mark one, the rest become unmarkable."""
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    sunday = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    monday = make_session(app_session, studio, an_active_year, timetable["קרוספיט שני"], MONDAY)
    service = BookingService(tenant_session)
    service.mark(studio.id, student_id=student_id, session_id=sunday, by_person_id=None, at=NOW)
    tenant_session.commit()
    with pytest.raises(BookingRefusedError):
        service.mark(studio.id, student_id=student_id, session_id=monday, by_person_id=None, at=NOW)


def test_the_credit_resets_the_following_sunday(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    this_week = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    next_week = make_session(
        app_session, studio, an_active_year, timetable["ג'ודו ראשון"], NEXT_SUNDAY
    )
    service = BookingService(tenant_session)
    service.mark(studio.id, student_id=student_id, session_id=this_week, by_person_id=None, at=NOW)
    tenant_session.commit()
    booking = service.mark(
        studio.id, student_id=student_id, session_id=next_week, by_person_id=None, at=NOW
    )
    assert booking.cancelled_at is None


def test_an_unlimited_allowance_never_blocks(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """On 550 ₪ marking exists only so the coach knows who is coming."""
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    service = BookingService(tenant_session)
    for group, when in (("ג'ודו ראשון", SUNDAY), ("קרוספיט שני", MONDAY)):
        session_id = make_session(app_session, studio, an_active_year, timetable[group], when)
        service.mark(
            studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
        )
    tenant_session.commit()
    live = tenant_session.execute(
        select(SessionBooking).where(
            SessionBooking.student_id == student_id, SessionBooking.cancelled_at.is_(None)
        )
    ).scalars()
    assert len(list(live)) == 2


# -- §7.2 eligibility ----------------------------------------------------------
def test_a_group_two_child_is_refused_crossfit_and_a_group_three_child_is_not(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """**The case an age-derived rule would get wrong.** The club's brackets overlap:
    Groups 2 and 3 both contain nine-year-olds. "CrossFit is for Groups 3+4+5" is a
    statement about the group the coach placed the child in, not about their birthday."""
    same_birthday = date(2017, 5, 1)
    in_two = make_student(
        app_session,
        studio,
        plan_id=plans["400"],
        base_group_id=timetable["קבוצה 2"],
        birthdate=same_birthday,
    )
    in_three = make_student(
        app_session,
        studio,
        plan_id=plans["400"],
        base_group_id=timetable["קבוצה 3"],
        birthdate=same_birthday,
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["קרוספיט שני"], MONDAY)
    service = BookingService(tenant_session)
    with pytest.raises(BookingRefusedError):
        service.mark(studio.id, student_id=in_two, session_id=session_id, by_person_id=None, at=NOW)
    assert service.mark(
        studio.id, student_id=in_three, session_id=session_id, by_person_id=None, at=NOW
    )


def test_an_invite_only_group_reads_the_enrollment_rather_than_the_link_table(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """§4.1 -- the Girls Team, and why `person` gains no gender column. Eligibility comes
    from an enrollment the manager creates; there are no `group_eligibility` rows at all."""
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["קבוצת בנות"], MONDAY)
    service = BookingService(tenant_session)
    with pytest.raises(BookingRefusedError):
        service.mark(
            studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
        )
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student_id,
            group_id=timetable["קבוצת בנות"],
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    assert service.mark(
        studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
    )


# -- §7.3 the private lesson ---------------------------------------------------
def test_a_private_session_needs_an_unlimited_plan(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """Refused on 300 and 400, accepted on 550. The rule attaches to `kind='private'`, so
    no additional column is needed."""
    session_id = make_session(
        app_session, studio, an_active_year, timetable["טכניקה פרטנית"], SUNDAY
    )
    service = BookingService(tenant_session)
    old_enough = date(2012, 1, 1)
    for plan in ("300", "400"):
        student_id = make_student(
            app_session,
            studio,
            plan_id=plans[plan],
            base_group_id=timetable["קבוצה 3"],
            birthdate=old_enough,
        )
        with pytest.raises(BookingRefusedError):
            service.mark(
                studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
            )
    unlimited = make_student(
        app_session,
        studio,
        plan_id=plans["550"],
        base_group_id=timetable["קבוצה 3"],
        birthdate=old_enough,
    )
    assert service.mark(
        studio.id, student_id=unlimited, session_id=session_id, by_person_id=None, at=NOW
    )


def test_a_child_under_the_groups_age_floor_is_refused_on_every_plan(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """`group.age_min` of 12 on the Saturday group carries the age half of the rule, and it
    is the same age check every group already has."""
    session_id = make_session(
        app_session, studio, an_active_year, timetable["טכניקה פרטנית"], SUNDAY
    )
    too_young = make_student(
        app_session,
        studio,
        plan_id=plans["550"],
        base_group_id=timetable["קבוצה 3"],
        birthdate=date(2018, 1, 1),
    )
    with pytest.raises(BookingRefusedError):
        BookingService(tenant_session).mark(
            studio.id, student_id=too_young, session_id=session_id, by_person_id=None, at=NOW
        )


# -- §3.2 / §7.4 timing --------------------------------------------------------
def test_a_session_that_has_started_can_no_longer_be_marked(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    with pytest.raises(BookingRefusedError):
        BookingService(tenant_session).mark(
            studio.id,
            student_id=student_id,
            session_id=session_id,
            by_person_id=None,
            at=SUNDAY + timedelta(minutes=1),
        )


def test_a_mark_is_released_and_re_marked_freely_before_themake_session(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """§3.2 -- a child sick on Monday can move to Wednesday. The credit comes back."""
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    sunday = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    monday = make_session(app_session, studio, an_active_year, timetable["קרוספיט שני"], MONDAY)
    service = BookingService(tenant_session)
    booking = service.mark(
        studio.id, student_id=student_id, session_id=sunday, by_person_id=None, at=NOW
    )
    tenant_session.commit()
    service.release(booking.id, by_person_id=None, at=NOW)
    tenant_session.commit()
    assert service.mark(
        studio.id, student_id=student_id, session_id=monday, by_person_id=None, at=NOW
    )


def test_a_started_session_cannot_be_released_and_the_credit_stays_spent(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """Once the session has begun the credit is spent whether or not the student attended
    -- which is what gives the coach a roster that stops moving when it matters."""
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    sunday = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    service = BookingService(tenant_session)
    booking = service.mark(
        studio.id, student_id=student_id, session_id=sunday, by_person_id=None, at=NOW
    )
    tenant_session.commit()
    with pytest.raises(BookingRefusedError):
        service.release(booking.id, by_person_id=None, at=SUNDAY + timedelta(minutes=1))


def test_a_base_session_is_never_marked(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """§14 -- Tuesday and Friday are automatic. Marking exists only where the plan limits
    something, and a bookable base session would be a second, contradictory source for a
    roster the enrollment already answers."""
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["קבוצה 3"], SUNDAY)
    with pytest.raises(BookingRefusedError):
        BookingService(tenant_session).mark(
            studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
        )


def test_the_same_session_cannot_be_marked_twice(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    service = BookingService(tenant_session)
    service.mark(studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW)
    tenant_session.commit()
    with pytest.raises(BookingRefusedError):
        service.mark(
            studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
        )


# -- §5.1 the offer rule -------------------------------------------------------
def test_a_plan_is_offered_only_when_it_raises_the_week(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """**§5.1's one rule, which produces every row of §5's table.**

        Offer a plan only if it raises the number of sessions this student could attend
        in a week.

    Nothing about the three tiers is hardcoded. It recomputes itself the moment the manager
    opens CrossFit to another group, which is exactly what makes §5's "this is a gap in the
    timetable, not a fault in the pricing" a statement somebody can act on.
    """
    from app.services.schedule.plan_offer import offered_plans

    all_plans = [tenant_session.get(PricePlan, plans[name]) for name in ("300", "400", "550")]

    # A Group 2 child reaches exactly ONE extra in this timetable (Sunday Judo), so 550's
    # "unlimited" and 400's "one" resolve to the same three training days -- they would pay
    # 150 ₪ more for an identical week.
    group_two = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 2"]
    )
    offered = offered_plans(BookingService(tenant_session), student_id=group_two, plans=all_plans)
    assert [plan.name for plan in offered] == ["300", "400"]

    # A Group 3 child reaches two extras, so 550 genuinely buys a fourth training day.
    group_three = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 3"]
    )
    offered = offered_plans(BookingService(tenant_session), student_id=group_three, plans=all_plans)
    assert [plan.name for plan in offered] == ["300", "400", "550"]


def test_a_student_who_can_reach_no_extra_at_all_is_offered_only_the_cheapest(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """§5 -- Group 1 can reach no extra in the whole timetable, so 400 and 550 buy nothing.

    The plan is still SHOWN with its reason rather than hidden (that is the screen's job):
    a parent who hears "400" from another parent in the hall and finds nothing in the app
    phones the manager, and one line of explanation answers the question before it is asked.
    """
    from app.services.schedule.plan_offer import offered_plans

    klass_id = tenant_session.get(Group, timetable["קבוצה 2"]).class_id
    group_one = Group(studio_id=studio.id, class_id=klass_id, name="קבוצה 1", kind="base")
    app_session.add(group_one)
    app_session.commit()
    student_id = make_student(app_session, studio, plan_id=plans["300"], base_group_id=group_one.id)
    all_plans = [tenant_session.get(PricePlan, plans[name]) for name in ("300", "400", "550")]
    offered = offered_plans(BookingService(tenant_session), student_id=student_id, plans=all_plans)
    assert [plan.name for plan in offered] == ["300"]


def test_the_private_session_is_what_makes_550_worth_it_for_an_older_child(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """`reachable` adds 1 for an unlimited plan when the student can reach a private
    session, which is how the Saturday lesson enters the arithmetic rather than being a
    special case in it."""
    from app.services.schedule.plan_offer import offered_plans

    # A Group 2 child old enough for the Saturday lesson: one extra, plus the private.
    older = make_student(
        app_session,
        studio,
        plan_id=plans["300"],
        base_group_id=timetable["קבוצה 2"],
        birthdate=date(2012, 1, 1),
    )
    all_plans = [tenant_session.get(PricePlan, plans[name]) for name in ("300", "400", "550")]
    offered = offered_plans(BookingService(tenant_session), student_id=older, plans=all_plans)
    assert [plan.name for plan in offered] == ["300", "400", "550"]


# -- §8 rosters ----------------------------------------------------------------
def test_an_extra_session_is_expected_only_of_students_who_marked_it():
    """§8 — the new table meets existing behaviour along a clean seam.

    A student who marked and did not come is absent, and enters the §5.14 denominators like
    any other expected student. A student who never marked is not on the roster and enters
    no denominator, which is correct: nobody asked them to be there.

    `is_expected` keeps its pure-function, no-I/O contract — the caller supplies the booking
    the same way it already supplies the group's weekdays.
    """
    from app.services.people.attendance_pattern import is_expected

    # An extra session ignores weekdays entirely and reads the booking.
    assert is_expected(None, [0, 3], 0, group_kind="extra", has_booking=True) is True
    assert is_expected(None, [0, 3], 0, group_kind="extra", has_booking=False) is False
    # ...including on a weekday the group is not even scheduled for, because a booking
    # names a SESSION and a session is the thing that exists.
    assert is_expected(None, [0], 4, group_kind="extra", has_booking=True) is True


def test_a_private_session_reads_the_booking_the_same_way():
    from app.services.people.attendance_pattern import is_expected

    assert is_expected(None, [6], 6, group_kind="private", has_booking=True) is True
    assert is_expected(None, [6], 6, group_kind="private", has_booking=False) is False


def test_a_base_sessions_roster_is_unchanged_by_any_of_this():
    """The half of §8 that must not move. Tuesday and Friday come from the enrollment
    exactly as they do today, and no code path changes."""
    from app.services.people.attendance_pattern import is_expected

    assert is_expected(None, [2, 5], 2) is True
    assert is_expected([2], [2, 5], 5) is False
    # A booking on a base session is meaningless and must not change the answer either way.
    assert is_expected([2], [2, 5], 5, group_kind="base", has_booking=True) is False
