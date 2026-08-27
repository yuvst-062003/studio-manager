"""Prepayment and credit (2026-08-27 spec wave).

The club sells a monthly subscription and collects it in lumps -- 900 ₪ of cash for three
months, twelve cheques for a year -- and until now the ledger had no way to say "this money
is for a month that has not happened yet".

Nothing new holds the money. `PaymentAllocation`'s docstring already describes the shape:
allocations totalling less than the payment leave a surplus, and that surplus **is** the
credit. What was missing is that nobody drew it down, nobody could see it, and no parent
could declare that they meant to create it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from app.models.billing import Charge, Payment, PaymentAllocation
from app.models.people import Student
from app.services.billing import BillingService
from app.services.billing.errors import RefusedError
from app.services.billing.payment_promise import PaymentPromiseService
from app.services.billing.payments import PaymentService
from app.services.billing.run import BillingRunService
from sqlalchemy import func, select
from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0


def _charge(app_session, studio, priced, month: int, amount: int = MONTHLY_AGOROT):
    row = Charge(
        studio_id=studio.id,
        payer_person_id=priced.payer_person_id,
        student_id=priced.student_id,
        kind="tuition",
        period_year=2026,
        period_month=month,
        amount_agorot=amount,
        due_date=datetime(2026, month, 28, tzinfo=UTC).date(),
        status="open",
        created_by="billing_run",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def _paid(session, studio, priced, amount: int) -> Payment:
    """Money in the drawer, allocated to nothing yet -- which is what credit IS."""
    return PaymentService(session).record(
        studio.id,
        payer_person_id=priced.payer_person_id,
        method="cash",
        amount_agorot=amount,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )


# -- §2.1 the sibling number ---------------------------------------------------
def test_credit_is_payments_minus_allocations(tenant_session, studio, a_priced_student):
    _paid(tenant_session, studio, a_priced_student, 90_000)
    assert BillingService(tenant_session).payer_credit(a_priced_student.payer_person_id) == 90_000


def test_balance_is_unchanged_by_the_presence_of_credit(
    tenant_session, app_session, studio, a_priced_student
):
    """**The test that proves the sibling field did not leak.**

    `payer_balance` deliberately counts ALLOCATIONS rather than payments, and says why: an
    unallocated surplus is money received that settles nothing yet, and counting it there
    would make the balance disagree with the charges it is supposedly the balance of. A
    prepaid family reading as having a negative debt is not what a debt figure means.
    """
    _charge(app_session, studio, a_priced_student, 9)
    _paid(tenant_session, studio, a_priced_student, 90_000)
    tenant_session.commit()
    charged, paid, open_count = BillingService(tenant_session).payer_balance(
        a_priced_student.payer_person_id
    )
    assert (charged, paid, open_count) == (MONTHLY_AGOROT, 0, 1)
    assert charged - paid == MONTHLY_AGOROT


def test_a_reversed_payment_is_not_credit(tenant_session, studio, a_priced_student):
    """A returned cheque is money recorded as never having arrived. Counting it as credit
    would spend it in the next billing run."""
    payment = _paid(tenant_session, studio, a_priced_student, 90_000)
    tenant_session.flush()
    PaymentService(tenant_session).reverse(
        payment.id, reason="the cheque bounced", actor_person_id=None, at=T0
    )
    assert BillingService(tenant_session).payer_credit(a_priced_student.payer_person_id) == 0


# -- §3 step 7 -----------------------------------------------------------------
def test_step_seven_settles_the_months_the_credit_was_for(
    tenant_session, app_session, studio, a_priced_student, an_enrolled_student
):
    """§10's first case. 900 ₪ of cash against a 250 ₪ September charge leaves credit, and
    the next run settles its charge out of it without anybody allocating anything by hand."""
    september = _charge(app_session, studio, a_priced_student, 9)
    payment = _paid(tenant_session, studio, a_priced_student, 3 * MONTHLY_AGOROT)
    PaymentService(tenant_session).allocate(payment.id, [september])
    tenant_session.commit()
    assert (
        BillingService(tenant_session).payer_credit(a_priced_student.payer_person_id)
        == 2 * MONTHLY_AGOROT
    )

    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    tenant_session.commit()
    # November's tuition was raised by step 1-6 and settled by step 7, in one run.
    november = tenant_session.execute(
        select(Charge).where(
            Charge.student_id == a_priced_student.student_id,
            Charge.kind == "tuition",
            Charge.period_month == 11,
        )
    ).scalar_one()
    assert november.status == "settled"
    assert run.log["credit_applied"] > 0


def test_step_seven_settles_the_oldest_charge_fully_rather_than_two_partially(
    tenant_session, app_session, studio, a_priced_student, an_enrolled_student
):
    """Oldest first, and FULLY. A credit scattered across two charges settles neither, which
    is the opposite of what a manager doing it by hand would do -- and leaves two rows in
    the collections list instead of one."""
    september = _charge(app_session, studio, a_priced_student, 9)
    october = _charge(app_session, studio, a_priced_student, 10)
    _paid(tenant_session, studio, a_priced_student, MONTHLY_AGOROT)
    tenant_session.commit()

    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    tenant_session.commit()
    assert tenant_session.get(Charge, september).status == "settled"
    assert tenant_session.get(Charge, october).status == "open"


def test_a_prepaid_payer_is_never_observable_as_owing_money(
    tenant_session, app_session, studio, a_priced_student, an_enrolled_student
):
    """**The test that protects the manager's collections list.**

    §3: step 7 must run inside the same transaction as steps 1-6. If the drawdown were a
    separate job, every prepaid family in the club would appear as a debtor for as long as
    the gap lasted, and the parent's app would show a debt they had already paid.

    `app_session` is a different connection, so it is a genuine outside observer: after the
    run has raised the charge and before the commit, it must see NO open charge -- not an
    unsettled one.
    """
    _paid(tenant_session, studio, a_priced_student, 3 * MONTHLY_AGOROT)
    tenant_session.commit()

    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    # Not committed yet. A fresh snapshot on the other connection.
    app_session.rollback()
    mid_run = app_session.execute(
        select(func.count())
        .select_from(Charge)
        .where(
            Charge.payer_person_id == a_priced_student.payer_person_id,
            Charge.status == "open",
        )
    ).scalar_one()
    assert mid_run == 0

    tenant_session.commit()
    app_session.rollback()
    after = app_session.execute(
        select(Charge).where(
            Charge.payer_person_id == a_priced_student.payer_person_id,
            Charge.kind == "tuition",
        )
    ).scalar_one()
    assert after.status == "settled"


def test_the_upgrade_table_from_section_eight(
    tenant_session, app_session, studio, a_priced_student, an_enrolled_student, a_price_plan
):
    """§8, row by row, ending with an open charge for the difference.

    A family prepays three months at 250 ₪, then upgrades to 400 ₪. Nobody computes a
    difference, nobody prorates anything, and no manager has to work out what undeposited
    cheques are worth against a new price -- the shortfall simply appears as an ordinary
    open charge on the ordinary payments screen.
    """
    from app.models.billing import PricePlan

    # §8's table is a claim about TUITION sequencing, so the once-ever registration fee is
    # taken off the plan first. Left on, it is an ordinary open charge that credit settles
    # oldest-first like any other -- correct, and it makes every row of the table read
    # 100 ₪ short of the number the spec states.
    plan = tenant_session.get(PricePlan, a_price_plan)
    assert plan is not None
    plan.registration_fee_agorot = None
    tenant_session.commit()

    _paid(tenant_session, studio, a_priced_student, 3 * MONTHLY_AGOROT)
    tenant_session.commit()

    # September: 250 raised, 750 credit, 250 allocated, 500 left.
    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=9, at=T0)
    tenant_session.commit()
    credit = BillingService(tenant_session)
    assert credit.payer_credit(a_priced_student.payer_person_id) == 2 * MONTHLY_AGOROT

    # The upgrade: a new plan at 400, from October.
    dearer = PricePlan(
        studio_id=studio.id,
        name="כל יום",
        sessions_per_week=5,
        monthly_amount_agorot=40_000,
        registration_fee_agorot=None,
        active_from=date(2026, 10, 1),
    )
    app_session.add(dearer)
    app_session.commit()
    student = tenant_session.get(Student, a_priced_student.student_id)
    assert student is not None
    student.price_plan_id = dearer.id
    tenant_session.commit()

    # October: 400 raised, 500 credit, 400 allocated, 100 left.
    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=10, at=T0)
    tenant_session.commit()
    assert credit.payer_credit(a_priced_student.payer_person_id) == 2 * MONTHLY_AGOROT - 40_000

    # November: 400 raised, 100 credit, 100 allocated, 0 left -- and 300 still owed.
    BillingRunService(tenant_session).run(studio.id, period_year=2026, period_month=11, at=T0)
    tenant_session.commit()
    assert credit.payer_credit(a_priced_student.payer_person_id) == 0
    november = tenant_session.execute(
        select(Charge).where(
            Charge.student_id == a_priced_student.student_id,
            Charge.kind == "tuition",
            Charge.period_month == 11,
        )
    ).scalar_one()
    assert november.status == "open"
    allocated = tenant_session.execute(
        select(func.coalesce(func.sum(PaymentAllocation.amount_agorot), 0)).where(
            PaymentAllocation.charge_id == november.id
        )
    ).scalar_one()
    assert november.amount_agorot - int(allocated) == 40_000 - (2 * MONTHLY_AGOROT - 40_000)


# -- §4 declaring a prepayment -------------------------------------------------
def test_a_promise_prices_forward_months_at_the_payers_monthly_total(
    tenant_session, app_session, studio, a_priced_student
):
    """§4 -- `forward = prepay_months × Σ(monthly of each active student's plan)`, summed
    across ALL the payer's children, because a parent thinks in "three months for both"
    and credit is payer-level anyway. Integer arithmetic throughout (G2)."""
    september = _charge(app_session, studio, a_priced_student, 9)
    row = PaymentPromiseService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[september],
        at=T0,
        method="cash",
        prepay_months=2,
    )
    assert row.prepay_months == 2
    assert row.total_agorot == MONTHLY_AGOROT + 2 * MONTHLY_AGOROT


def test_confirming_a_forward_promise_leaves_the_surplus_as_credit(
    tenant_session, app_session, studio, a_priced_student
):
    """§4.1 -- one payment, allocations to the named charges, and whatever remains is left
    UNALLOCATED. There is no second mechanism and no 'prepayment' row: the surplus already
    means this."""
    september = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[september],
        at=T0,
        method="cheque",
        prepay_months=2,
    )
    service.confirm(row.id, actor_person_id=None, at=T0)
    tenant_session.commit()

    assert tenant_session.get(Charge, september).status == "settled"
    assert (
        BillingService(tenant_session).payer_credit(a_priced_student.payer_person_id)
        == 2 * MONTHLY_AGOROT
    )


def test_a_promise_may_be_forward_months_only(tenant_session, studio, a_priced_student):
    """A family with nothing owed who wants to pay three months forward. The charges half
    and the forward half are independent; only both being empty is nothing at all."""
    row = PaymentPromiseService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[],
        at=T0,
        method="cash",
        prepay_months=3,
    )
    assert row.total_agorot == 3 * MONTHLY_AGOROT


def test_a_promise_over_nothing_at_all_is_refused(tenant_session, studio, a_priced_student):
    with pytest.raises(RefusedError):
        PaymentPromiseService(tenant_session).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[],
            at=T0,
            method="cash",
            prepay_months=0,
        )


def test_a_forward_promise_cannot_over_collect_after_a_card_payment(
    tenant_session, app_session, studio, a_priced_student
):
    """The existing cash rule, re-run for prepayment: the CHARGES half recomputes at
    confirmation, so a card payment that landed in between shrinks the promise instead of
    double-collecting. The forward half is untouched by it -- it was never about a charge."""
    september = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[september],
        at=T0,
        method="cash",
        prepay_months=1,
    )
    payments = PaymentService(tenant_session)
    partial = payments.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="upay_card",
        amount_agorot=10_000,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    payments.allocate_oldest_first(partial.id, payer_person_id=a_priced_student.payer_person_id)
    service.confirm(row.id, actor_person_id=None, at=T0)
    tenant_session.commit()

    cash = tenant_session.execute(
        select(Payment).where(
            Payment.method == "cash",
            Payment.payer_person_id == a_priced_student.payer_person_id,
        )
    ).scalar_one()
    assert cash.amount_agorot == (MONTHLY_AGOROT - 10_000) + MONTHLY_AGOROT


# -- §5 the studio's terms -----------------------------------------------------
def test_the_prepay_terms_default_to_the_clubs_own_rules(client, as_manager):
    """Cash three months forward, twelve cheques. Configuration rather than constants --
    they are the club's rules, and another club's are different."""
    read = client.get("/api/v1/billing/settings", headers=as_manager.headers).json()
    assert read["cash_prepay_months"] == 3
    assert read["cheque_prepay_months"] == 12


def test_a_term_of_zero_returns_the_route_to_open_charges_only(
    client, as_manager, a_priced_student, as_guardian_of
):
    """§5 -- setting a term to 0 removes the forward offer for that route, which is how
    cash behaves today."""
    client.patch(
        "/api/v1/billing/settings",
        json={"cash_prepay_months": 0},
        headers=as_manager.headers,
    )
    parent = as_guardian_of(a_priced_student.student_id)
    terms = client.get("/api/v1/me/prepay-terms", headers=parent.headers).json()
    assert terms["cash_prepay_months"] == 0
    assert terms["cheque_prepay_months"] == 12


def test_the_parent_is_told_the_monthly_total_so_the_screen_does_no_arithmetic(
    client, a_priced_student, as_guardian_of
):
    """§9 -- the terms endpoint carries the payer's monthly total, so the breakdown the
    parent reads is rendered from server numbers rather than computed twice."""
    parent = as_guardian_of(a_priced_student.student_id)
    terms = client.get("/api/v1/me/prepay-terms", headers=parent.headers).json()
    assert terms["monthly_total_agorot"] == MONTHLY_AGOROT


def test_the_balance_carries_credit_beside_it(
    client, tenant_session, studio, a_priced_student, as_manager
):
    """§7 -- `credit_agorot` beside `balance_agorot`, never merged. A manager about to phone
    a family should see "owes nothing, paid ahead 900 ₪" -- two facts, because one number
    that meant neither is what folding them together would produce.

    Read through the manager route: the payer on `a_priced_student` is the primary guardian,
    who is a person who OWES money rather than a person who signs in (the parent fixture
    creates a second guardian). The parent's own `/me/balance` returns the same shape for
    whoever is calling it.
    """
    _paid(tenant_session, studio, a_priced_student, 90_000)
    tenant_session.commit()
    balance = client.get(
        f"/api/v1/payers/{a_priced_student.payer_person_id}/balance",
        headers=as_manager.headers,
    ).json()
    assert balance["credit_agorot"] == 90_000
    assert balance["balance_agorot"] == 0


def test_a_parents_own_balance_carries_credit_too(
    client, tenant_session, studio, a_priced_student, as_guardian_of
):
    """The same field on the payer-facing read, which is what the "paid ahead" line on the
    payments screen is derived from -- never stored, because a stored `paid_through` would
    become a lie the moment the family upgrades."""
    parent = as_guardian_of(a_priced_student.student_id, is_primary=False)
    PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=parent.person_id,
        method="cash",
        amount_agorot=60_000,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    tenant_session.commit()
    balance = client.get("/api/v1/me/balance", headers=parent.headers).json()
    assert balance["credit_agorot"] == 60_000
