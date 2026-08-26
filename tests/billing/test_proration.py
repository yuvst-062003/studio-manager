"""§5.10 step 2 -- proration, from materialized sessions and never from calendar days."""

from __future__ import annotations

import pytest
from app.services.billing.run import proration


def test_a_full_period_is_the_full_price():
    """The identity case, and the one a broken multiplier still passes if `remaining ==
    total` is the only case tested. Every other test here joins mid-month for that
    reason."""
    assert proration(25_000, remaining=8, total=8) == 25_000


def test_half_the_sessions_is_half_the_price():
    assert proration(25_000, remaining=4, total=8) == 12_500


def test_the_result_is_rounded_to_a_whole_agora():
    """§5.10 writes `round(monthly x remaining / total)`. 25000 x 1 / 3 is 8333.33, and the
    charge is an INTEGER column (G2), so the rounding happens here rather than in the
    driver."""
    assert proration(25_000, remaining=1, total=3) == 8_333
    assert proration(25_000, remaining=2, total=3) == 16_667


def test_the_arithmetic_never_goes_through_a_float():
    """G2. Python's `round` is banker's rounding -- `round(2.5)` is 2 -- so a float path
    charges a family one agora less than the spec says for every exact half. Half-up
    integer arithmetic is what this asserts, via the value a float path gets wrong."""
    assert proration(5, remaining=1, total=2) == 3


def test_a_period_with_no_sessions_charges_nothing():
    """A group whose period was entirely cancelled, or a student joining after the last
    session. Dividing by zero is the crash; charging the full month is the bug that reaches
    a parent."""
    assert proration(25_000, remaining=0, total=0) == 0


def test_more_remaining_than_total_is_a_programming_error():
    """Not clamped. A caller that computed `remaining` against a different period than
    `total` produces a plausible over-charge, and silently clamping it to the full month
    hides the bug behind a correct-looking number."""
    with pytest.raises(ValueError):
        proration(25_000, remaining=9, total=8)


def test_a_negative_count_is_a_programming_error():
    """The other direction of the same mistake, and the one that would produce a NEGATIVE
    tuition charge -- a credit the club never granted."""
    with pytest.raises(ValueError):
        proration(25_000, remaining=-1, total=8)


# -- the driver: proration, registration fees and freezes over a real period ---

from app.models.billing import Charge  # noqa: E402
from app.services.billing.run import BillingRunService  # noqa: E402
from sqlalchemy import select  # noqa: E402
from tests.billing.conftest import (  # noqa: E402
    MONTHLY_AGOROT,
    PERIOD,
    REGISTRATION_AGOROT,
    T0,
)


def _tuition(session, student_id, *, period_month: int = 11):
    return session.execute(
        select(Charge).where(
            Charge.student_id == student_id,
            Charge.kind == "tuition",
            Charge.period_month == period_month,
        )
    ).scalar_one()


def test_a_first_month_is_prorated_from_the_sessions_that_remain(
    tenant_session, studio, a_mid_month_joiner
):
    """§5.10 step 2. The child joined on the 12th of a month whose group trains Tuesdays and
    Fridays, so some sessions are behind them and the fee buys the slot for the rest."""
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_mid_month_joiner.student_id)
    assert charge.amount_agorot == proration(
        MONTHLY_AGOROT,
        remaining=a_mid_month_joiner.remaining_sessions,
        total=a_mid_month_joiner.total_sessions,
    )
    assert charge.amount_agorot < MONTHLY_AGOROT


def test_proration_counts_sessions_and_not_calendar_days(
    tenant_session, studio, a_mid_month_joiner
):
    """The rule this whole task exists for.

    Joining on the 12th leaves 19 of November's 30 days but only 5 of its 8 sessions,
    because the club trains Tuesdays and Fridays and those are not evenly spread. A test
    that only asserted "less than a full month" would pass a calendar-day implementation --
    this one names the wrong answer and refuses it.
    """
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_mid_month_joiner.student_id)
    calendar_days_answer = proration(MONTHLY_AGOROT, remaining=19, total=30)
    assert charge.amount_agorot != calendar_days_answer
    assert charge.amount_agorot == proration(MONTHLY_AGOROT, remaining=5, total=8)


def test_a_prorated_charge_explains_itself(tenant_session, studio, a_mid_month_joiner):
    """§5.10 -- 'The original amount and a human-readable proration_note are stored so the
    parent sees בגין 3 מתוך 8 שיעורים.' Without both, a prorated month looks like a cheaper
    price and next month's full charge looks like a rise."""
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_mid_month_joiner.student_id)
    assert charge.original_amount_agorot == MONTHLY_AGOROT
    assert charge.proration_note is not None
    assert str(a_mid_month_joiner.remaining_sessions) in charge.proration_note
    assert str(a_mid_month_joiner.total_sessions) in charge.proration_note


def test_the_second_month_is_the_flat_amount(tenant_session, studio, a_mid_month_joiner):
    """§5.10 step 3 -- 'Every subsequent month is the flat monthly amount. Closures,
    holidays and absences never change it.' The fee buys the slot."""
    service = BillingRunService(tenant_session)
    service.run(studio.id, period_year=2026, period_month=11, at=T0)
    service.run(studio.id, period_year=2026, period_month=12, at=T0)
    december = _tuition(tenant_session, a_mid_month_joiner.student_id, period_month=12)
    assert december.amount_agorot == MONTHLY_AGOROT
    assert december.original_amount_agorot is None
    assert december.proration_note is None


def test_a_first_month_the_student_was_present_for_carries_no_note(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """A first month is not automatically a prorated one. This child joined at the year's
    start, so November is a full month -- and a note reading 'בגין 8 מתוך 8 שיעורים' would
    be an explanation of something that did not happen."""
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_priced_student.student_id)
    assert charge.amount_agorot == MONTHLY_AGOROT
    assert charge.proration_note is None
    assert charge.original_amount_agorot is None


def test_a_registration_fee_is_charged_once_and_never_again(
    tenant_session, studio, a_mid_month_joiner
):
    """§5.10 step 6 -- 'charged once per student, on the first billing run after their first
    enrollment -- never again when they add or change a group.'

    **Not the unique index's job.** The index keys on the period, so a period-keyed
    registration fee is re-raisable every month, correctly, forever. The run guards it with
    a query, and this test is what proves the guard exists.
    """
    service = BillingRunService(tenant_session)
    service.run(studio.id, period_year=2026, period_month=11, at=T0)
    service.run(studio.id, period_year=2026, period_month=12, at=T0)
    fees = (
        tenant_session.execute(
            select(Charge).where(
                Charge.student_id == a_mid_month_joiner.student_id,
                Charge.kind == "registration",
            )
        )
        .scalars()
        .all()
    )
    assert len(fees) == 1
    assert fees[0].amount_agorot == REGISTRATION_AGOROT
    assert fees[0].period_year is None


def test_a_registration_fee_is_never_prorated(tenant_session, studio, a_mid_month_joiner):
    """It is a fee for joining, not for a month's teaching. Prorating it would charge a
    child who joined late less to join than a child who joined on the 1st."""
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    fee = (
        tenant_session.execute(
            select(Charge).where(
                Charge.student_id == a_mid_month_joiner.student_id,
                Charge.kind == "registration",
            )
        )
        .scalars()
        .one()
    )
    assert fee.amount_agorot == REGISTRATION_AGOROT


def test_a_plan_with_no_registration_fee_raises_none(
    tenant_session, studio, a_joiner_on_a_free_plan
):
    """`registration_fee_agorot` is nullable because most plans have none. A zero-amount
    charge would appear on the parent's screen as a line item for nothing."""
    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=T0)
    assert (
        tenant_session.execute(
            select(Charge).where(
                Charge.student_id == a_joiner_on_a_free_plan.student_id,
                Charge.kind == "registration",
            )
        )
        .scalars()
        .all()
        == []
    )


def test_a_frozen_student_generates_nothing(tenant_session, studio, a_frozen_student):
    """§5.10 step 4, in four words: 'A frozen student generates nothing.' Not a zero charge,
    not a voided one -- nothing."""
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert (
        tenant_session.execute(
            select(Charge).where(Charge.student_id == a_frozen_student.student_id)
        )
        .scalars()
        .all()
        == []
    )
    assert str(a_frozen_student.student_id) in run.log["frozen"]


def test_a_studio_whose_schedule_was_never_generated_is_billed_in_full(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """The bug this test was written for, found by a first-month case that should not have
    prorated at all.

    `a_group` has no schedule rules, so no sessions are materialized against it and the
    period counts zero of zero. Prorating against that denominator bills the family
    nothing -- and since a club that has not generated its schedule has no sessions for
    ANY group, it bills the whole studio nothing, silently, in the one run nobody re-reads.

    No sessions means no denominator, not a free month. §5.10 step 3 already says closures
    never change the amount, so the flat month is right when every session was cancelled
    and is the only safe answer when the schedule was simply never generated.
    """
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_priced_student.student_id)
    assert charge.amount_agorot == MONTHLY_AGOROT
    assert charge.proration_note is None
