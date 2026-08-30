"""The payment-promise lifecycle (cash_request renamed, 2026-08-27 spec wave).

The property under test is the settlement rule: confirmation records what the charges
are STILL owed, never the snapshot -- so a promise raised before a card payment cannot
double-collect -- and a declined promise leaves everything exactly as it found it.
These are the cash-request tests with only the imports renamed: passing unchanged is
what proves the rename was a rename.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.models.billing import Charge, Payment, PaymentAllocation, PricePlan
from app.models.comms import Notification
from app.models.person import Person, RoleAssignment
from app.schemas.billing import ManualPaymentIn, PaymentOut
from app.services.billing import BillingService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.payment_promise import PaymentPromiseService
from app.services.billing.payments import PaymentService
from sqlalchemy import select
from tests.billing.conftest import MONTHLY_AGOROT, T0


def _charge(app_session, studio, priced, month: int, amount: int = MONTHLY_AGOROT) -> uuid.UUID:
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


def test_a_promise_snapshots_the_outstanding_total(
    tenant_session, app_session, studio, a_priced_student
):
    first = _charge(app_session, studio, a_priced_student, 9)
    second = _charge(app_session, studio, a_priced_student, 10)
    row = PaymentPromiseService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[first, second],
        at=T0,
    )
    assert row.status == "pending"
    assert row.total_agorot == 2 * MONTHLY_AGOROT
    assert set(PaymentPromiseService(tenant_session).charge_ids_of(row.id)) == {first, second}


def test_another_familys_charge_reads_as_not_found(
    tenant_session, app_session, studio, a_priced_student
):
    """404, never 403 -- a foreign charge id must not be confirmed to exist."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    with pytest.raises(NotFoundError):
        PaymentPromiseService(tenant_session).create(
            studio.id, payer_person_id=uuid.uuid4(), charge_ids=[charge_id], at=T0
        )


def test_a_charge_cannot_sit_in_two_pending_promises(
    tenant_session, app_session, studio, a_priced_student
):
    """Two live promises over one month would show the manager the same money twice."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    with pytest.raises(ConflictError):
        service.create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[charge_id],
            at=T0,
        )


def test_confirm_records_the_cash_and_settles_exactly_those_charges(
    tenant_session, app_session, studio, a_priced_student
):
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    service.confirm(row.id, actor_person_id=None, at=T0)
    tenant_session.commit()

    assert row.status == "received"
    payment = tenant_session.execute(
        select(Payment).where(Payment.payer_person_id == a_priced_student.payer_person_id)
    ).scalar_one()
    assert payment.method == "cash"
    assert payment.amount_agorot == MONTHLY_AGOROT
    BillingService(tenant_session).recompute_charge_status(charge_id)
    assert tenant_session.get(Charge, charge_id).status == "settled"


def test_confirm_after_a_partial_card_payment_collects_only_the_remainder(
    tenant_session, app_session, studio, a_priced_student
):
    """The snapshot is display; settlement recomputes. A promise raised before a card
    payment landed must not double-collect."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    payments = PaymentService(tenant_session)
    # A partial arrival allocates through the sweeping path -- the exact-list path
    # refuses partial cover on purpose (payments.py: refused whole, never in part).
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
            Payment.method == "cash", Payment.payer_person_id == a_priced_student.payer_person_id
        )
    ).scalar_one()
    assert cash.amount_agorot == MONTHLY_AGOROT - 10_000


def test_confirm_with_nothing_outstanding_records_no_payment_at_all(
    tenant_session, app_session, studio, a_priced_student
):
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="upay_card",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[charge_id],
        recorded_by_person_id=None,
    )
    service.confirm(row.id, actor_person_id=None, at=T0)
    tenant_session.commit()

    assert row.status == "received"
    cash_payments = (
        tenant_session.execute(select(Payment).where(Payment.method == "cash")).scalars().all()
    )
    assert cash_payments == []


def test_decline_leaves_the_charges_open_and_retryable(
    tenant_session, app_session, studio, a_priced_student
):
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    service.decline(row.id, actor_person_id=None, at=T0)

    assert row.status == "declined"
    assert tenant_session.get(Charge, charge_id).status == "open"
    # A declined promise's charges are free to try again.
    again = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    assert again.status == "pending"


def test_a_decided_promise_cannot_be_decided_again(
    tenant_session, app_session, studio, a_priced_student
):
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    service.decline(row.id, actor_person_id=None, at=T0)
    with pytest.raises(ConflictError):
        service.confirm(row.id, actor_person_id=None, at=T0)


# -- the plan claim (owner request, 2026-08-30) ---------------------------------
# A parent picking a payment program in the plan screen may declare "already paid" --
# cash, cheques, or a standing order -- instead of paying through the app. The claim is
# priced by the SERVER from the plan row, lands in the manager's promise queue, and the
# manager's confirm/decline is the mark-paid-or-not the owner asked for.


def test_a_plan_claim_promise_prices_the_plan_and_needs_no_charges(
    tenant_session, app_session, studio, a_priced_student, a_price_plan
):
    row = PaymentPromiseService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[],
        at=T0,
        method="standing_order",
        claimed_plan_id=a_price_plan,
    )
    assert row.status == "pending"
    assert row.method == "standing_order"
    assert row.claimed_plan_id == a_price_plan
    assert row.claimed_agorot == MONTHLY_AGOROT
    assert row.total_agorot == MONTHLY_AGOROT


def test_a_claim_of_a_closed_plan_is_refused(
    tenant_session, app_session, studio, a_priced_student, a_price_plan
):
    plan = app_session.get(PricePlan, a_price_plan)
    plan.active_to = plan.active_from
    app_session.commit()
    with pytest.raises(RefusedError):
        PaymentPromiseService(tenant_session).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[],
            at=T0,
            claimed_plan_id=a_price_plan,
        )


def test_confirming_a_plan_claim_records_it_as_unallocated_credit(
    tenant_session, app_session, studio, a_priced_student, a_price_plan
):
    """No charge exists yet -- the plan's first charge lands on the 1st -- so the confirmed
    money is deliberately unallocated. That surplus IS the credit, and the billing run's
    step 7 spends it, the same road every prepayment already travels."""
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[],
        at=T0,
        method="standing_order",
        claimed_plan_id=a_price_plan,
    )
    service.confirm(row.id, actor_person_id=None, at=T0)
    tenant_session.commit()

    assert row.status == "received"
    payment = tenant_session.execute(
        select(Payment).where(Payment.payer_person_id == a_priced_student.payer_person_id)
    ).scalar_one()
    assert payment.method == "standing_order"
    assert payment.amount_agorot == MONTHLY_AGOROT
    allocations = (
        tenant_session.execute(
            select(PaymentAllocation).where(PaymentAllocation.payment_id == payment.id)
        )
        .scalars()
        .all()
    )
    assert allocations == []


def test_raising_a_promise_notifies_every_manager(
    tenant_session, app_session, studio, a_priced_student, a_price_plan
):
    """'A notification will be sent to the manager' -- the owner's words. The queue is
    where the decision happens; the notification is how the manager learns it is waiting."""
    manager = Person(studio_id=studio.id, first_name="מנהל", last_name="בודק")
    app_session.add(manager)
    app_session.flush()
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=manager.id,
            role="manager",
            scope_type="studio",
            granted_at=T0,
        )
    )
    app_session.commit()

    PaymentPromiseService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[],
        at=T0,
        method="cash",
        claimed_plan_id=a_price_plan,
    )
    tenant_session.commit()

    note = tenant_session.execute(
        select(Notification).where(
            Notification.person_id == manager.id, Notification.kind == "billing.promise_raised"
        )
    ).scalar_one()
    assert note.payload["method"] == "cash"
    assert note.payload["total_agorot"] == MONTHLY_AGOROT


def test_an_empty_selection_is_refused(tenant_session, studio, a_priced_student):
    with pytest.raises(RefusedError):
        PaymentPromiseService(tenant_session).create(
            studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[], at=T0
        )


# -- cheques: the same lifecycle with a different word on the payment ----------


def test_a_cheque_promise_confirms_and_records_method_cheque(
    tenant_session, app_session, studio, a_priced_student
):
    """The route the app could not serve at all: twelve cheques to the association.
    Confirmation settles through the one BillingService writer with method 'cheque',
    not 'bank_transfer' -- so 'how much of this year sits in undeposited cheques' stays
    answerable."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[charge_id],
        at=T0,
        method="cheque",
    )
    assert row.method == "cheque"
    service.confirm(row.id, actor_person_id=None, at=T0)
    tenant_session.commit()

    payment = tenant_session.execute(
        select(Payment).where(Payment.payer_person_id == a_priced_student.payer_person_id)
    ).scalar_one()
    assert payment.method == "cheque"
    BillingService(tenant_session).recompute_charge_status(charge_id)
    assert tenant_session.get(Charge, charge_id).status == "settled"


def test_a_declined_cheque_promise_leaves_the_charges_open(
    tenant_session, app_session, studio, a_priced_student
):
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[charge_id],
        at=T0,
        method="cheque",
    )
    service.decline(row.id, actor_person_id=None, at=T0)
    assert row.status == "declined"
    assert tenant_session.get(Charge, charge_id).status == "open"


def test_cheque_confirmation_recomputes_from_outstanding_amounts(
    tenant_session, app_session, studio, a_priced_student
):
    """The existing cash rule, re-run for cheques: a promise raised before a partial
    card payment cannot over-collect."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[charge_id],
        at=T0,
        method="cheque",
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

    cheque = tenant_session.execute(
        select(Payment).where(
            Payment.method == "cheque",
            Payment.payer_person_id == a_priced_student.payer_person_id,
        )
    ).scalar_one()
    assert cheque.amount_agorot == MONTHLY_AGOROT - 10_000


def test_the_method_filter_returns_only_what_it_says(
    tenant_session, app_session, studio, a_priced_student
):
    cash_charge = _charge(app_session, studio, a_priced_student, 9)
    cheque_charge = _charge(app_session, studio, a_priced_student, 10)
    service = PaymentPromiseService(tenant_session)
    service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[cash_charge],
        at=T0,
        method="cash",
    )
    cheque_row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[cheque_charge],
        at=T0,
        method="cheque",
    )
    filtered = service.list_promises(method="cheque")
    assert [row.id for row, _, _, _ in filtered] == [cheque_row.id]


def test_an_unknown_method_is_refused(tenant_session, app_session, studio, a_priced_student):
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    with pytest.raises(RefusedError):
        PaymentPromiseService(tenant_session).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[charge_id],
            at=T0,
            method="gold_bars",
        )


def test_a_confirmed_cheque_survives_the_wire_shape(
    tenant_session, app_session, studio, a_priced_student
):
    """`PAYMENT_METHODS` and `PaymentOut.method` are one list kept in two files, and only
    one of them gained `cheque`. A manager confirms a cheque promise, the parent opens
    `12f`, and the response model refuses the method the table already allows -- a 500 on
    a screen that was working an hour earlier, with nothing wrong in the database."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = PaymentPromiseService(tenant_session)
    row = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[charge_id],
        at=T0,
        method="cheque",
    )
    service.confirm(row.id, actor_person_id=None, at=T0)
    tenant_session.commit()

    payment = tenant_session.execute(select(Payment).where(Payment.method == "cheque")).scalar_one()
    assert PaymentOut.model_validate(payment, from_attributes=True).method == "cheque"


def test_a_manager_may_record_a_cheque_by_hand():
    """§10 -- `cheque` joins the human-recorded group. A manager holding a cheque that
    never came through a promise (handed over at the door, posted) records it the same way
    they record a bank transfer; without this the only way a cheque reaches the ledger is
    mislabelled as `bank_transfer`, which is the fact §10 exists to stop losing."""
    body = ManualPaymentIn.model_validate(
        {
            "payer_person_id": str(uuid.uuid4()),
            "method": "cheque",
            "amount_agorot": MONTHLY_AGOROT,
            "received_at": T0.isoformat(),
        }
    )
    assert body.method == "cheque"


# -- "I will pay" and "I already paid" are different sentences ------------------
#
# Owner correction, 2026-08-30: the signup plan step offers four routes, and "when you enter
# each he can actually pay or choose already paid". Both raise a promise and both end at a
# manager confirming by hand — but the manager's NEXT ACTION differs, and until this flag
# existed the queue could not tell them apart. "I already handed the coach cash" means go
# and look in the drawer now; "I will pay this week" means wait. One pending row that means
# either is a row a manager has to phone the family about to read.


def test_a_promise_says_whether_the_money_has_already_moved(
    tenant_session, studio, a_priced_student, a_price_plan
):
    claimed = PaymentPromiseService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[],
        claimed_plan_id=a_price_plan,
        already_paid=True,
        method="cash",
        at=T0,
    )
    assert claimed.already_paid is True


def test_a_promise_to_pay_later_is_the_default(
    tenant_session, studio, a_priced_student, a_price_plan
):
    """The safe direction. A promise that silently claimed the money had arrived would put
    a manager in front of an empty drawer."""
    promised = PaymentPromiseService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[],
        claimed_plan_id=a_price_plan,
        method="cash",
        at=T0,
    )
    assert promised.already_paid is False
