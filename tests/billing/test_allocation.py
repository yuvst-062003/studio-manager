"""§4.3's `payment_allocation` -- the table that makes "charges are never mutated" possible.

One payment can settle several charges (§5.10's 'choose N months'); one charge can be
settled by several payments (a family paying in parts). Both are normal, which is why the
allocation carries its own amount and the charge carries none.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.models.billing import Charge, Payment, PaymentAllocation
from app.services.billing import BillingService
from app.services.billing.errors import ConflictError, RefusedError
from app.services.billing.payments import PaymentService
from tests.billing.conftest import MONTHLY_AGOROT, T0


def test_a_payment_settles_the_charges_it_is_allocated_to(
    tenant_session, studio, a_priced_student, an_open_charge
):
    payment = PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    assert BillingService(tenant_session).allocated_agorot(an_open_charge) == MONTHLY_AGOROT
    assert tenant_session.get(Charge, an_open_charge).status == "settled"
    assert payment.amount_agorot == MONTHLY_AGOROT


def test_one_payment_settles_several_charges(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's 'choose N months' button: one order, one payment, three charges."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="bank_transfer",
        amount_agorot=MONTHLY_AGOROT * 3,
        received_at=T0,
        charge_ids=list(three_open_months),
        recorded_by_person_id=None,
    )
    billing = BillingService(tenant_session)
    assert [billing.allocated_agorot(c) for c in three_open_months] == [MONTHLY_AGOROT] * 3
    assert service.unallocated_agorot(payment.id) == 0


def test_a_partial_payment_allocates_oldest_first_and_leaves_a_remainder(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's reconciliation step 3: 'allocates it to that payer's open charges
    oldest-first'. A family paying one month's worth against three months of debt clears
    the OLDEST, not the newest -- which is what the debt ladder's day counts are measured
    against."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT + 1_000,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(payment.id, payer_person_id=a_priced_student.payer_person_id)
    billing = BillingService(tenant_session)
    oldest, middle, newest = three_open_months
    assert billing.allocated_agorot(oldest) == MONTHLY_AGOROT
    assert billing.allocated_agorot(middle) == 1_000
    assert billing.allocated_agorot(newest) == 0
    assert service.unallocated_agorot(payment.id) == 0


def test_an_overpayment_leaves_a_surplus_rather_than_over_allocating(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """§5.10's third double-payment guard: 'the surplus surfaces as an overpayment in the
    manager's reconciliation queue and can be allocated forward to next month's charge.'
    Allocating more than a charge is owed would make the ledger disagree with the receipt."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT + 7_000,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(payment.id, payer_person_id=a_priced_student.payer_person_id)
    assert BillingService(tenant_session).allocated_agorot(an_open_charge) == MONTHLY_AGOROT
    assert service.unallocated_agorot(payment.id) == 7_000


def test_allocating_more_than_a_payment_holds_is_refused(
    tenant_session, studio, a_priced_student, three_open_months
):
    """The arithmetic that must never be possible: three months' charges against one
    month's money. A ledger where allocations exceed the payment reconciles to nothing."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    with pytest.raises(RefusedError):
        service.allocate(payment.id, list(three_open_months))


def test_allocating_the_same_charge_twice_from_one_payment_is_refused(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """`uq_payment_allocation_payment_id_charge_id`. Two rows would be an accounting error
    that sums correctly and reconciles to nothing.

    The charge here is only PARTLY covered, so it is still `open` and the duplicate is what
    the second call actually trips over. A fully settled charge is refused one step earlier
    and for a better reason -- see the test below.
    """
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(payment.id, payer_person_id=a_priced_student.payer_person_id)
    # Half the charge is covered, so it is still open and still nameable.
    tenant_session.execute(
        PaymentAllocation.__table__.update()
        .where(PaymentAllocation.payment_id == payment.id)
        .values(amount_agorot=MONTHLY_AGOROT // 2)
    )
    BillingService(tenant_session).recompute_charge_status(an_open_charge)
    assert tenant_session.get(Charge, an_open_charge).status == "open"
    with pytest.raises(ConflictError):
        service.allocate(payment.id, [an_open_charge])


def test_allocating_against_a_settled_charge_is_refused(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """A charge nobody still owes anything on. Refused because it is not `open` -- one step
    earlier than the duplicate check above, and a better message: 'already allocated' would
    describe the payment when what the manager needs to know is about the charge.

    A late payment against a charge that is already settled is real money and belongs in the
    reconciliation queue, not silently absorbed here.
    """
    service = PaymentService(tenant_session)
    first = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    assert tenant_session.get(Charge, an_open_charge).status == "settled"
    second = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    assert first.id != second.id
    with pytest.raises(RefusedError):
        service.allocate(second.id, [an_open_charge])


def test_a_reversal_reopens_the_charges_and_never_deletes_the_payment(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """§11.4 -- 'hard deletion is impossible because Israeli tax law requires ~7 years of
    financial records. A reversal is a new fact recorded on the row.' And the charge must
    reopen, or the club shows a month as paid it was never paid for."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    service.reverse(payment.id, reason="שיק חזר", actor_person_id=None, at=T0)
    reversed_payment = tenant_session.get(Payment, payment.id)
    assert reversed_payment is not None
    assert reversed_payment.reversed_at is not None
    assert reversed_payment.reversal_reason == "שיק חזר"
    assert tenant_session.get(Charge, an_open_charge).status == "open"
    assert BillingService(tenant_session).allocated_agorot(an_open_charge) == 0


def test_a_reversal_without_a_reason_is_refused(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """`payment_reversal_has_a_reason` is a CHECK constraint; this refuses it with a message
    rather than an IntegrityError, because 'why' is the only thing that makes a reversal
    auditable a year later."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    with pytest.raises(RefusedError):
        service.reverse(payment.id, reason="   ", actor_person_id=None, at=T0)


def test_a_payment_is_not_reversed_twice(tenant_session, studio, a_priced_student, an_open_charge):
    """The second reversal would delete allocations that are already gone and overwrite the
    date the first one actually happened."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    service.reverse(payment.id, reason="שיק חזר", actor_person_id=None, at=T0)
    with pytest.raises(ConflictError):
        service.reverse(payment.id, reason="שוב", actor_person_id=None, at=T0)


def test_oldest_first_skips_charges_already_settled(
    tenant_session, studio, a_priced_student, three_open_months
):
    """A second payment must not re-allocate against a month the first one cleared -- it
    would over-allocate that charge and under-serve the debt actually outstanding."""
    service = PaymentService(tenant_session)
    oldest, middle, newest = three_open_months
    service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[oldest],
        recorded_by_person_id=None,
    )
    second = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(second.id, payer_person_id=a_priced_student.payer_person_id)
    billing = BillingService(tenant_session)
    assert billing.allocated_agorot(oldest) == MONTHLY_AGOROT
    assert billing.allocated_agorot(middle) == MONTHLY_AGOROT
    assert billing.allocated_agorot(newest) == 0


def test_oldest_first_never_allocates_against_a_credit(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """A credit is a negative charge (§5.10). Allocating money 'against' it would settle the
    discount and leave the debt open -- exactly backwards."""
    billing = BillingService(tenant_session)
    billing.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        -3_000,
        date(2026, 10, 31),
        student_id=a_priced_student.student_id,
    )
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(payment.id, payer_person_id=a_priced_student.payer_person_id)
    assert billing.allocated_agorot(an_open_charge) == MONTHLY_AGOROT


def test_oldest_first_never_touches_another_payer_s_debt(
    tenant_session, studio, a_priced_student, an_open_charge, a_two_child_family
):
    """The allocation is scoped to the payer, not to the studio. Clearing one family's debt
    with another family's money is the single worst outcome this table can produce."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT * 5,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(payment.id, payer_person_id=a_priced_student.payer_person_id)
    billing = BillingService(tenant_session)
    for charge_id in a_two_child_family.charge_ids:
        assert billing.allocated_agorot(charge_id) == 0
    assert service.unallocated_agorot(payment.id) == MONTHLY_AGOROT * 4


def test_allocating_against_another_payer_s_charge_is_refused(
    tenant_session, studio, a_priced_student, an_open_charge, a_two_child_family
):
    """The explicit half of the rule above: `charge_ids` arrives from a caller, so naming
    someone else's charge must be refused rather than obeyed."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    with pytest.raises(RefusedError):
        service.allocate(payment.id, [a_two_child_family.charge_ids[0]])


def test_a_reversed_payment_is_not_re_allocated(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """Its money is gone. Allocating from it would settle a charge with a payment the club
    has already recorded as never having arrived."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.reverse(payment.id, reason="שיק חזר", actor_person_id=None, at=T0)
    with pytest.raises(RefusedError):
        service.allocate(payment.id, [an_open_charge])
