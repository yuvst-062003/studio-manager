"""Rung zero of §5.10's ladder — the message that comes BEFORE a charge exists to be late.

Three months of cash already works end to end: the promise is confirmed, one `payment` is
recorded, the surplus is the credit, and the run's step 7 spends it oldest-first. What the
product never did was *say* anything about the end of it. A family who handed over 750 ₪ in
good faith heard nothing until the day-3 debt reminder — so the first thing the product ever
said to them about their prepayment running out was that they owed money.

The rung is bounded to the run day for the same reason the day 3/7/14 rungs are bounded to
an exact day: "this family's prepayment ends with the month just billed" stays true for
thirty days, and a daily job asking it without a bound sends thirty messages.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.models.billing import Charge, Payment
from app.models.comms import Notification
from app.services.billing.payments import PaymentService
from app.services.billing.prepay import PrepayService
from app.workers.billing import Tally, escalate_debt, notify_prepay_ending, run_daily
from sqlalchemy import select
from tests.billing.conftest import MONTHLY_AGOROT, REGISTRATION_AGOROT

#: 08:30 Asia/Jerusalem on the studio's default run day — the hour `infra/railway/jobs.json`
#: pins `billing-run` to, on the day `_is_run_day` fires.
RUN_DAY = datetime(2026, 11, 1, 6, 30, tzinfo=UTC)

#: 03:00 Asia/Jerusalem on the same day. The hour nobody may be sent anything (§5.4a).
THREE_AM = datetime(2026, 11, 1, 1, 0, tzinfo=UTC)

#: When the cash was handed over: before September, for September onward.
CASH_ARRIVED = datetime(2026, 8, 20, 9, 0, tzinfo=UTC)


def _tuition(session, studio, priced, month: int, amount: int = MONTHLY_AGOROT) -> Charge:
    row = Charge(
        studio_id=studio.id,
        payer_person_id=priced.payer_person_id,
        student_id=priced.student_id,
        kind="tuition",
        period_year=2026,
        period_month=month,
        amount_agorot=amount,
        due_date=date(2026, month, 28),
        status="open",
        created_by="billing_run",
    )
    session.add(row)
    session.flush()
    return row


def _paid(session, studio, priced, amount: int, *, at: datetime, charge_ids=()) -> Payment:
    return PaymentService(session).record(
        studio.id,
        payer_person_id=priced.payer_person_id,
        method="cash",
        amount_agorot=amount,
        received_at=at,
        charge_ids=list(charge_ids),
        recorded_by_person_id=None,
    )


@pytest.fixture
def three_months_of_cash_in_august(tenant_session, studio, a_priced_student, an_enrolled_student):
    """A family who handed over three months of cash in August, two of them already spent.

    The registration fee is charged and settled separately in September, so the November run
    does not raise one — §5.10 step 6 charges it once per student, ever, and a family in the
    club since September has already paid it. Without this the run would raise a fee the
    credit cannot cover, and the household would end the run owing money, which is a
    different story than the one these tests are about.
    """
    registration = Charge(
        studio_id=studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        student_id=a_priced_student.student_id,
        kind="registration",
        amount_agorot=REGISTRATION_AGOROT,
        due_date=date(2026, 9, 30),
        status="open",
        created_by="billing_run",
    )
    tenant_session.add(registration)
    tenant_session.flush()
    _paid(
        tenant_session,
        studio,
        a_priced_student,
        REGISTRATION_AGOROT,
        at=datetime(2026, 9, 1, 9, 0, tzinfo=UTC),
        charge_ids=[registration.id],
    )

    september = _tuition(tenant_session, studio, a_priced_student, 9)
    october = _tuition(tenant_session, studio, a_priced_student, 10)
    _paid(
        tenant_session,
        studio,
        a_priced_student,
        3 * MONTHLY_AGOROT,
        at=CASH_ARRIVED,
        charge_ids=[september.id, october.id],
    )
    tenant_session.flush()
    return a_priced_student


def _notifications(session, person_id: uuid.UUID, prefix: str) -> list[str]:
    kinds = session.execute(
        select(Notification.kind).where(Notification.person_id == person_id)
    ).scalars()
    return sorted(kind for kind in kinds if kind.startswith(prefix))


# -- what counts as a prepayment ------------------------------------------------
def test_a_payment_for_the_month_it_arrived_in_is_not_a_prepayment(
    tenant_session, studio, a_priced_student
):
    """A family paying November's charge in November is paying, not paying ahead. Reading
    every settled month as a prepayment would put the whole club on this rung."""
    november = _tuition(tenant_session, studio, a_priced_student, 11)
    _paid(
        tenant_session,
        studio,
        a_priced_student,
        MONTHLY_AGOROT,
        at=datetime(2026, 11, 3, 9, 0, tzinfo=UTC),
        charge_ids=[november.id],
    )
    assert (
        PrepayService(tenant_session).last_prepaid_period(a_priced_student.payer_person_id) is None
    )


def test_a_late_payment_is_not_a_prepayment(tenant_session, studio, a_priced_student):
    """December's money settling November's charge is a debt being cleared, and the
    direction of the comparison is the whole difference between the two."""
    november = _tuition(tenant_session, studio, a_priced_student, 11)
    _paid(
        tenant_session,
        studio,
        a_priced_student,
        MONTHLY_AGOROT,
        at=datetime(2026, 12, 4, 9, 0, tzinfo=UTC),
        charge_ids=[november.id],
    )
    assert (
        PrepayService(tenant_session).last_prepaid_period(a_priced_student.payer_person_id) is None
    )


def test_money_that_arrived_before_the_month_it_paid_for_is_a_prepayment(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """August's cash reaching September and October. The latest month it reached is the
    month the prepayment ends with."""
    assert PrepayService(tenant_session).last_prepaid_period(a_priced_student.payer_person_id) == (
        2026,
        10,
    )


def test_a_reversed_payment_prepaid_nothing(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """A bounced cheque is money recorded as never having arrived. Telling that family
    their prepayment is ending would be a message about money the club does not have."""
    payment = tenant_session.execute(
        select(Payment).where(Payment.amount_agorot == 3 * MONTHLY_AGOROT)
    ).scalar_one()
    PaymentService(tenant_session).reverse(
        payment.id, reason="הצ׳ק חזר", actor_person_id=None, at=RUN_DAY
    )
    assert (
        PrepayService(tenant_session).last_prepaid_period(a_priced_student.payer_person_id) is None
    )


# -- who is on the rung ---------------------------------------------------------
def test_a_family_with_another_month_in_the_drawer_is_not_told_anything(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """October's run leaves a month's tuition unspent, so November is covered and there is
    nothing to warn about. A signal that fired every month of a prepayment would train the
    family to ignore the one that mattered."""
    assert (
        PrepayService(tenant_session).payers_whose_prepay_ends(period_year=2026, period_month=10)
        == []
    )


def test_the_month_the_credit_runs_out_is_the_month_that_signals(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """The last month the cash reaches, with nothing left for the next one."""
    november = _tuition(tenant_session, studio, a_priced_student, 11)
    payment = tenant_session.execute(
        select(Payment).where(Payment.amount_agorot == 3 * MONTHLY_AGOROT)
    ).scalar_one()
    PaymentService(tenant_session).allocate(payment.id, [november.id])
    tenant_session.flush()
    assert PrepayService(tenant_session).payers_whose_prepay_ends(
        period_year=2026, period_month=11
    ) == [a_priced_student.payer_person_id]


def test_a_family_who_never_prepaid_is_never_on_this_rung(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """Zero credit is the normal state of a family who pays monthly, and `credit < monthly`
    is true for every one of them. Without the prepayment test this rung would message the
    whole club, every month, about a prepayment none of them made."""
    november = _tuition(tenant_session, studio, a_priced_student, 11)
    _paid(
        tenant_session,
        studio,
        a_priced_student,
        MONTHLY_AGOROT,
        at=datetime(2026, 11, 3, 9, 0, tzinfo=UTC),
        charge_ids=[november.id],
    )
    assert (
        PrepayService(tenant_session).payers_whose_prepay_ends(period_year=2026, period_month=11)
        == []
    )


def test_a_prepayment_that_has_already_ended_does_not_signal_every_month_since(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """The predicate is 'the prepayment ends WITH THIS MONTH', not 'this family once
    prepaid and has no credit now'. The second is true forever after, and would put a
    family who prepaid once on this rung for the rest of their membership.

    November spends the last of the cash; December is paid in December like any other
    month. The December run sees the same family, with an allocation into December and no
    credit left, and must say nothing."""
    november = _tuition(tenant_session, studio, a_priced_student, 11)
    payment = tenant_session.execute(
        select(Payment).where(Payment.amount_agorot == 3 * MONTHLY_AGOROT)
    ).scalar_one()
    PaymentService(tenant_session).allocate(payment.id, [november.id])
    december = _tuition(tenant_session, studio, a_priced_student, 12)
    _paid(
        tenant_session,
        studio,
        a_priced_student,
        MONTHLY_AGOROT,
        at=datetime(2026, 12, 4, 9, 0, tzinfo=UTC),
        charge_ids=[december.id],
    )
    tenant_session.flush()
    service = PrepayService(tenant_session)
    assert service.last_prepaid_period(a_priced_student.payer_person_id) == (2026, 11)
    assert service.payers_whose_prepay_ends(period_year=2026, period_month=12) == []


def test_a_month_that_is_not_the_last_one_paid_for_says_nothing(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """The credit test alone is not enough, and this is the case that proves it.

    August's cash covers through November; in October the family hands over one more month
    for December. At the November run the credit is spent to the agora and
    `credit < monthly` is true — but December is paid, so November is not the month to warn
    about. Only `last_prepaid_period` can tell the two apart."""
    november = _tuition(tenant_session, studio, a_priced_student, 11)
    december = _tuition(tenant_session, studio, a_priced_student, 12)
    payment = tenant_session.execute(
        select(Payment).where(Payment.amount_agorot == 3 * MONTHLY_AGOROT)
    ).scalar_one()
    PaymentService(tenant_session).allocate(payment.id, [november.id])
    _paid(
        tenant_session,
        studio,
        a_priced_student,
        MONTHLY_AGOROT,
        at=datetime(2026, 10, 20, 9, 0, tzinfo=UTC),
        charge_ids=[december.id],
    )
    tenant_session.flush()
    service = PrepayService(tenant_session)
    assert service.last_prepaid_period(a_priced_student.payer_person_id) == (2026, 12)
    assert service.payers_whose_prepay_ends(period_year=2026, period_month=11) == []


def test_a_household_that_already_owes_money_is_left_to_the_ladder(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """When the credit no longer covers a whole month, the shortfall is an ordinary open
    charge and the day 3/7/14 ladder owns that conversation. Two mechanisms speaking about
    the same money in the same week is how a family stops reading either."""
    november = _tuition(tenant_session, studio, a_priced_student, 11)
    payment = tenant_session.execute(
        select(Payment).where(Payment.amount_agorot == 3 * MONTHLY_AGOROT)
    ).scalar_one()
    PaymentService(tenant_session).allocate(payment.id, [november.id])
    # December's charge is raised and nothing is left to settle it.
    _tuition(tenant_session, studio, a_priced_student, 12)
    tenant_session.flush()
    assert (
        PrepayService(tenant_session).payers_whose_prepay_ends(period_year=2026, period_month=11)
        == []
    )


# -- the rung itself ------------------------------------------------------------
def test_the_run_day_tells_the_family_before_any_charge_can_be_late(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """**The failure this rung exists to fix.** The November run raises November's tuition
    and settles it from the last of the cash. Nothing is overdue, nothing is owed, and the
    family is told that December will need paying — a month before the charge exists."""
    from app.services.billing.run import BillingRunService

    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=RUN_DAY)
    tally = notify_prepay_ending(tenant_session, at=RUN_DAY)
    assert tally.prepay_notices == 1
    assert _notifications(tenant_session, a_priced_student.payer_person_id, "billing.") == [
        "billing.prepay_ending"
    ]
    # And the ladder has nothing to say, because there is nothing overdue.
    assert escalate_debt(tenant_session, at=RUN_DAY).reminders == 0


def test_a_three_am_run_defers_the_notice_rather_than_sending_it(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """§5.4a — `לא נשלחות הודעות אחרי 21:00`. The debt ladder calls the comms seam directly
    and is protected only by the cron hour; this rung goes through `ReminderService`, so a
    run moved to 03:00 refuses rather than lighting up a phone at 03:15. Counted, never
    swallowed: a rung that silently sent nothing is the ladder's own failure mode."""
    from app.services.billing.run import BillingRunService

    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=THREE_AM)
    tally = notify_prepay_ending(tenant_session, at=THREE_AM)
    assert tally.prepay_notices == 0
    assert tally.prepay_deferred == 1
    assert _notifications(tenant_session, a_priced_student.payer_person_id, "billing.") == []


def test_a_second_pass_on_the_same_day_does_not_tell_the_family_twice(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """A retried job, or a manager pressing `הרצה עכשיו` after the cron already ran. The
    24h per-subject rate limit in `ReminderService` is what makes that safe, and it is the
    second thing the direct-to-seam ladder path does not have."""
    from app.services.billing.run import BillingRunService

    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=RUN_DAY)
    assert notify_prepay_ending(tenant_session, at=RUN_DAY).prepay_notices == 1
    assert notify_prepay_ending(tenant_session, at=RUN_DAY).prepay_notices == 0
    assert _notifications(tenant_session, a_priced_student.payer_person_id, "billing.") == [
        "billing.prepay_ending"
    ]


def test_the_notice_goes_to_the_payer_and_not_to_every_guardian(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august, a_second_guardian
):
    """The debt ladder writes to every guardian, because a debt is about a child's place in
    the club. A prepayment is about whose money is in the drawer — `credit` is payer-level
    by construction — so this addresses the payer, the way `ReminderService.remind_debt`
    does (§6.3, one message per household)."""
    from app.services.billing.run import BillingRunService

    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=RUN_DAY)
    assert notify_prepay_ending(tenant_session, at=RUN_DAY).prepay_notices == 1
    assert _notifications(tenant_session, a_second_guardian, "billing.") == []


def test_the_notice_carries_no_money_and_no_name(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """§11.7 and invariant 1. The payload names the period and nothing else: the amount is
    on the screen the tap opens, and a family's name in a notification payload is a copy no
    later redaction reaches."""
    from app.services.billing.run import BillingRunService

    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=RUN_DAY)
    notify_prepay_ending(tenant_session, at=RUN_DAY)
    payload = tenant_session.execute(
        select(Notification.payload).where(Notification.kind == "billing.prepay_ending")
    ).scalar_one()
    assert payload["period"] == "2026-11"
    assert not any(key.endswith("_agorot") for key in payload)


def test_a_whole_month_of_daily_passes_says_it_once(
    tenant_session, studio, a_priced_student, three_months_of_cash_in_august
):
    """**The bound, asserted the way the job actually runs.**

    `billing-run` fires every morning, and "this family's prepayment ends with the month
    just billed" is true on every one of those mornings. An unbounded predicate would say
    it thirty times, which is how a message stops being read. `run_daily` is the per-studio
    body `main()` loops over, so driving it across November is the same code path in the
    same order -- run, rung zero, ladder, sweep."""
    notices = 0
    for day in range(1, 31):
        at = datetime(2026, 11, day, 6, 30, tzinfo=UTC)
        notices += run_daily(tenant_session, at=at, studio_id=studio.id).prepay_notices
    assert notices == 1
    assert _notifications(tenant_session, a_priced_student.payer_person_id, "billing.") == [
        "billing.prepay_ending"
    ]


def test_the_tally_still_carries_counts_and_never_money():
    """Invariant 1, re-asserted over the two fields this rung adds."""
    fields = set(Tally.__dataclass_fields__)
    assert {"prepay_notices", "prepay_deferred"} <= fields
    assert not any(name.endswith("_agorot") for name in fields)
