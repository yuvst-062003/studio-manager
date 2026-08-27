"""Plan changes: requested by a parent, applied by a worker, settled by a human.

Two decisions shape every test here.

**Upgrades unlock access immediately; downgrades wait for the first.** Withholding access
somebody has volunteered to pay more for is a worse failure than the club carrying a couple
of sessions, and the billing run naturally raises the new amount on the 1st with no
proration. A downgrade cannot move early for the opposite reason: it would take away
sessions a family has already marked.

**Every change lands in the settlement queue.** §11: two of the club's three payment routes
are prepaid, so a plan change cannot settle itself. The prepayment design turns the cash
and cheque cases into an ordinary open charge; the standing-order case genuinely needs
somebody to cancel the old mandate and send the new link.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from app.models.people import Student
from app.models.training_plan import PlanChange, SessionBooking
from app.services.schedule.booking import BookingService
from app.services.schedule.errors import PlanChangeRefusedError
from app.services.schedule.plan_change import PlanChangeService, first_of_next_month
from sqlalchemy import select
from tests.schedule.conftest import NOW, SUNDAY, make_session, make_student

#: Three December weeks, after the first — the window a change applied on 2026-12-01
#: actually reaches. 6, 14 and 20 December 2026 are a Sunday, a Monday and a Sunday.
DECEMBER_ONE = datetime(2026, 12, 6, 14, 0, tzinfo=UTC)
DECEMBER_ONE_LATER = datetime(2026, 12, 7, 14, 0, tzinfo=UTC)
DECEMBER_TWO = datetime(2026, 12, 14, 14, 0, tzinfo=UTC)
DECEMBER_THREE = datetime(2026, 12, 20, 14, 0, tzinfo=UTC)


def test_the_effective_date_is_always_the_first_of_the_next_month():
    """§10 -- a plan change moves on the first, whole. There is no proration anywhere in
    this feature, and a mid-month date would be the first place someone invented one."""
    assert first_of_next_month(date(2026, 11, 12)) == date(2026, 12, 1)
    assert first_of_next_month(date(2026, 12, 31)) == date(2027, 1, 1)
    # The first of a month still moves to the NEXT one: a change requested on the 1st is
    # requested after that month's run has already raised its charge.
    assert first_of_next_month(date(2026, 11, 1)) == date(2026, 12, 1)


def test_an_upgrade_unlocks_access_at_once_and_still_prices_from_the_first(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """The decision, and both halves of it. `student.price_plan_id` moves now — so the
    child can mark the extra session tonight — and the change still records
    `effective_on` as the 1st, because that is when the billing run raises the new amount.
    No proration: the club carries the difference for the rest of the month, deliberately.
    """
    student_id = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 3"]
    )
    change = PlanChangeService(tenant_session).request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["550"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    assert change.effective_on == first_of_next_month(NOW.date())
    assert change.status == "applied"
    assert tenant_session.get(Student, student_id).price_plan_id == plans["550"]

    # And the access is real: the same student can now mark a session 300 refused.
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    assert BookingService(tenant_session).mark(
        studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
    )


def test_a_downgrade_waits_for_the_first_and_leaves_todays_access_alone(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """A family who paid for this month keeps this month. The change is `scheduled`, the
    student's plan has not moved, and the sessions they already marked are untouched."""
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    change = PlanChangeService(tenant_session).request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["300"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    assert change.status == "scheduled"
    assert tenant_session.get(Student, student_id).price_plan_id == plans["550"]


def test_every_change_lands_in_the_settlement_queue(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """§11 — the parent's tap changes access; a person always closes the loop on money."""
    student_id = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 3"]
    )
    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["400"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    assert change.settlement_status == "pending"
    assert [row.id for row in service.settlement_queue()] == [change.id]

    service.settle(change.id, by_person_id=None, at=NOW)
    tenant_session.commit()
    assert service.settlement_queue() == []


def test_a_scheduled_change_can_be_cancelled_before_it_applies(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """Which is the whole reason a change is a row and not an edit."""
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["300"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    service.cancel(change.id, at=NOW)
    tenant_session.commit()
    assert tenant_session.get(PlanChange, change.id).status == "cancelled"
    assert service.due(on=change.effective_on) == []


def test_an_applied_change_cannot_be_cancelled(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    student_id = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 3"]
    )
    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["550"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    with pytest.raises(PlanChangeRefusedError):
        service.cancel(change.id, at=NOW)


def test_a_change_to_the_plan_the_student_already_holds_is_refused(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    with pytest.raises(PlanChangeRefusedError):
        PlanChangeService(tenant_session).request(
            studio.id,
            student_id=student_id,
            to_price_plan_id=plans["400"],
            by_person_id=None,
            at=NOW,
        )


# -- the worker ----------------------------------------------------------------
def test_applying_a_downgrade_releases_the_excess_bookings_latest_first(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """**§13's downgrade test.** Future bookings above the new allowance are released on
    the first, LATEST first and deterministically, and past bookings are untouched.

    Latest-first because the sessions nearest the change are the ones a family has already
    arranged their week around; releasing tomorrow's and keeping next month's would be the
    least useful order possible.
    """
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    booking_service = BookingService(tenant_session)
    # Three extras in three different December weeks — after the change applies, so they
    # are the FUTURE bookings the downgrade is about.
    ids = []
    for group, when in (
        ("ג'ודו ראשון", DECEMBER_ONE),
        ("קרוספיט שני", DECEMBER_TWO),
        ("ג'ודו ראשון", DECEMBER_THREE),
    ):
        session_id = make_session(app_session, studio, an_active_year, timetable[group], when)
        ids.append(
            booking_service.mark(
                studio.id,
                student_id=student_id,
                session_id=session_id,
                by_person_id=None,
                at=NOW,
            ).id
        )
    tenant_session.commit()

    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["300"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    # The worker's job, on the first.
    applied = service.apply_due(on=change.effective_on, at=datetime(2026, 12, 1, 3, 0, tzinfo=UTC))
    tenant_session.commit()

    assert applied == 1
    assert tenant_session.get(Student, student_id).price_plan_id == plans["300"]
    live = list(
        tenant_session.execute(
            select(SessionBooking).where(
                SessionBooking.student_id == student_id, SessionBooking.cancelled_at.is_(None)
            )
        ).scalars()
    )
    # 300 ₪ allows nothing, so every future booking goes.
    assert live == []
    assert ids  # the three that were marked, all now released


def test_a_downgrade_to_one_extra_a_week_keeps_the_earliest_in_each_week(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """Latest-first, per WEEK — because the allowance is per week. A student dropping from
    unlimited to one keeps one booking in each week rather than one in total, and the one
    they keep is the earliest, which is the one they are likeliest to have arranged around.
    """
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    service_bookings = BookingService(tenant_session)
    kept, dropped = None, None
    for group, when in (("ג'ודו ראשון", DECEMBER_ONE), ("קרוספיט שני", DECEMBER_ONE_LATER)):
        session_id = make_session(app_session, studio, an_active_year, timetable[group], when)
        booking = service_bookings.mark(
            studio.id, student_id=student_id, session_id=session_id, by_person_id=None, at=NOW
        )
        if kept is None:
            kept = booking.id
        else:
            dropped = booking.id
    tenant_session.commit()

    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["400"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    service.apply_due(on=change.effective_on, at=datetime(2026, 12, 1, 3, 0, tzinfo=UTC))
    tenant_session.commit()

    assert tenant_session.get(SessionBooking, kept).cancelled_at is None
    assert tenant_session.get(SessionBooking, dropped).cancelled_at is not None


def test_a_booking_that_has_already_happened_is_never_released(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """A downgrade takes away future access, never a training session the child already
    attended — and never the record of it."""
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    past = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    booking = BookingService(tenant_session).mark(
        studio.id, student_id=student_id, session_id=past, by_person_id=None, at=NOW
    )
    tenant_session.commit()
    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["300"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    # Applied while the marked session is still in the future would release it; applied
    # afterwards must not.
    service.apply_due(on=change.effective_on, at=SUNDAY + timedelta(days=1))
    tenant_session.commit()
    assert tenant_session.get(SessionBooking, booking.id).cancelled_at is None


def test_a_change_that_is_not_due_yet_is_left_alone(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["300"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    assert service.apply_due(on=change.effective_on - timedelta(days=1), at=NOW) == 0
    assert tenant_session.get(Student, student_id).price_plan_id == plans["550"]


def test_every_change_is_audited_at_request_and_at_apply(
    tenant_session, app_session, studio, plans, timetable, an_active_year
):
    """§13 — the money it implies is a human's job, so the record of who asked and when it
    took effect is the only thing tying the two halves together."""
    from app.models.audit import AuditLog

    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    service = PlanChangeService(tenant_session)
    change = service.request(
        studio.id,
        student_id=student_id,
        to_price_plan_id=plans["300"],
        by_person_id=None,
        at=NOW,
    )
    tenant_session.commit()
    service.apply_due(on=change.effective_on, at=datetime(2026, 12, 1, 3, 0, tzinfo=UTC))
    tenant_session.commit()

    actions = set(
        app_session.execute(
            select(AuditLog.action).where(AuditLog.entity_id == change.id)
        ).scalars()
    )
    assert actions == {"plan_change.request", "plan_change.apply"}
