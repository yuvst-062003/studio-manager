"""§5.10 step 2 -- the first month is the FULL month, whatever day the student joins.

**Proration was removed on 2026-09-12, by owner decision.** It had been
`round(monthly x remaining / total_sessions)`, counted from materialized sessions. Two
things were wrong with it in practice and neither was arithmetic:

  * **הוראת קבע cannot prorate.** A standing-order mandate is a fixed uPay link at the
    plan's monthly amount, and we cannot vary what it asks for. So the same family was
    priced differently by which button they pressed -- ₪275 by card, ₪550 by mandate, for
    the same weeks of the same month.
  * **The join screen could not show the number.** The prorated amount does not exist until
    the registration has been written, so step 3 promised the plan price and uPay then asked
    for something else. That mismatch is what reached a real family on 2026-09-12.

A flat month makes every route agree and makes the number on the screen true before the
button is pressed. A manager who wants to be generous to a late joiner has
`POST /charges/{id}/adjust` and `/close`, which is a better place for a judgement call than
a rule that has to hold for everybody.
"""

from __future__ import annotations

from app.models.billing import Charge
from app.services.billing.run import BillingRunService
from sqlalchemy import select
from tests.billing.conftest import (
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


def test_a_mid_month_joiner_pays_the_full_month(tenant_session, studio, a_mid_month_joiner):
    """The decision, stated as the one number it changes.

    This child joins on the 12th of a month whose group trains Tuesdays and Fridays, with 5
    of its 8 sessions still ahead of them. Under the old rule they were charged 5/8 of the
    month; under this one they are charged the month.
    """
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_mid_month_joiner.student_id)
    assert charge.amount_agorot == MONTHLY_AGOROT


def test_a_first_month_explains_nothing_because_there_is_nothing_to_explain(
    tenant_session, studio, a_mid_month_joiner
):
    """`original_amount_agorot` and `proration_note` are what a reduced charge used to carry.

    **The columns stay** -- `proration_note` is the line-note that manual charges,
    adjustments and shop items all write into, so dropping it would break four unrelated
    routes. The run simply stops writing either, and a first month is now indistinguishable
    from every other month, which is the point.
    """
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_mid_month_joiner.student_id)
    assert charge.original_amount_agorot is None
    assert charge.proration_note is None


def test_the_second_month_is_the_flat_amount(tenant_session, studio, a_mid_month_joiner):
    """§5.10 step 3 -- 'Every subsequent month is the flat monthly amount. Closures,
    holidays and absences never change it.' The fee buys the slot. Unchanged by this
    decision, and kept because it is now the same claim as the first month's."""
    service = BillingRunService(tenant_session)
    service.run(studio.id, period_year=2026, period_month=11, at=T0)
    service.run(studio.id, period_year=2026, period_month=12, at=T0)
    december = _tuition(tenant_session, a_mid_month_joiner.student_id, period_month=12)
    assert december.amount_agorot == MONTHLY_AGOROT
    assert december.original_amount_agorot is None
    assert december.proration_note is None


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
    """Kept from the proration suite, where it was a hard-won bug.

    `a_group` has no schedule rules, so nothing is materialized against it and the period
    counted zero sessions of zero. Under proration that denominator billed the family
    nothing -- and since a club that has not generated its schedule has no sessions for ANY
    group, it billed the whole studio nothing, silently, in the one run nobody re-reads.

    The flat month makes that unreachable rather than handled, which is why this test now
    asserts something the code cannot get wrong. It stays as the record of why: if a session
    count is ever reintroduced into this path, this is the case that must still pass.
    """
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _tuition(tenant_session, a_priced_student.student_id)
    assert charge.amount_agorot == MONTHLY_AGOROT
    assert charge.proration_note is None
