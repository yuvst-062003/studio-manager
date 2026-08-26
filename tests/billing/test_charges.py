"""§5.10's charge core: the seam M7 calls, and the derived cache nothing else may write."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.billing import Payment, PaymentAllocation
from app.services.billing import BillingService
from app.services.billing.errors import ConflictError, NotFoundError
from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0


def test_a_tuition_charge_derives_its_period_from_the_due_date(
    tenant_session, studio, a_priced_student
):
    """D-M6-8. The frozen seam has no period parameters and its own docstring keys
    idempotence on (student, period, kind), so the period has to come from the one
    argument carrying a month."""
    charge = BillingService(tenant_session).create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "tuition",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    assert (charge.period_year, charge.period_month) == PERIOD


def test_a_manual_charge_carries_no_period_so_it_may_repeat(
    tenant_session, studio, a_priced_student
):
    """The partial index's `postgresql_where` exists for this: a manual charge is a fact
    about one moment, not about a month, and two of them in November are two real
    charges."""
    service = BillingService(tenant_session)
    first = service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        18_000,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    second = service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        18_000,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    assert first.period_year is None and second.period_year is None
    assert first.id != second.id


def test_a_second_tuition_charge_for_one_student_and_period_is_refused(
    tenant_session, studio, a_priced_student
):
    """§5.10 step 5, and invariant 5's structural half. C11: keyed on the STUDENT, so a
    child in two groups is one charge however many times the run walks them."""
    service = BillingService(tenant_session)
    service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "tuition",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    with pytest.raises(ConflictError):
        service.create_charge(
            studio.id,
            a_priced_student.payer_person_id,
            "tuition",
            MONTHLY_AGOROT,
            date(2026, 11, 30),
            student_id=a_priced_student.student_id,
        )


def test_a_new_charge_is_open_and_created_by_the_kind_that_made_it(
    tenant_session, studio, a_priced_student
):
    """`status` starts `open` because nothing is allocated yet -- it is derived from the
    first moment, not defaulted and then corrected."""
    charge = BillingService(tenant_session).create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "event",
        5_000,
        date(2026, 11, 30),
        event_id=uuid.uuid4(),
    )
    assert charge.status == "open"
    assert charge.created_by == "event"


def test_a_float_amount_is_refused(tenant_session, studio, a_priced_student):
    """G2 stated where it can actually be enforced. The annotation says `int`; Python does
    not check it, and 250.0 agorot reaching an INTEGER column rounds silently."""
    with pytest.raises(TypeError):
        BillingService(tenant_session).create_charge(
            studio.id,
            a_priced_student.payer_person_id,
            "manual",
            250.0,  # type: ignore[arg-type]
            date(2026, 11, 30),
            student_id=a_priced_student.student_id,
        )


def test_a_charge_for_another_studio_is_refused_under_a_scoped_session(
    tenant_session, studio, a_priced_student
):
    """The seam takes `studio_id` explicitly so the worker can pass one. Under a REQUEST,
    the session already has a scope, and a mismatch means a caller has confused two
    studios -- the one case where the explicit parameter could write a row the session
    could never read back."""
    with pytest.raises(NotFoundError):
        BillingService(tenant_session).create_charge(
            uuid.uuid4(),
            a_priced_student.payer_person_id,
            "manual",
            5_000,
            date(2026, 11, 30),
            student_id=a_priced_student.student_id,
        )


def _pay(session, studio, charge, amount_agorot, payer_person_id):
    """A payment and one allocation against `charge`.

    Written here rather than in the conftest because the conftest is the contract commit's
    and this lane does not rewrite it -- and because Task 4 replaces this helper with the
    real allocation service, at which point these tests keep asserting the same rule
    through the code that will actually be running.
    """
    payment = Payment(
        studio_id=studio.id,
        payer_person_id=payer_person_id,
        method="cash",
        amount_agorot=amount_agorot,
        received_at=T0,
    )
    session.add(payment)
    session.flush()
    session.add(
        PaymentAllocation(
            studio_id=studio.id,
            payment_id=payment.id,
            charge_id=charge.id,
            amount_agorot=amount_agorot,
        )
    )
    session.flush()
    return payment


def test_a_charge_is_settled_when_its_allocations_reach_the_amount(
    tenant_session, studio, a_priced_student
):
    """§4.3 -- the charge is never mutated to record the payment. It is recomputed from the
    allocations, which are the fact."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    assert charge.status == "settled"


def test_a_partly_paid_charge_stays_open(tenant_session, studio, a_priced_student):
    """A family paying in parts. Two allocations against one charge is normal (§4.3)."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT - 1, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    assert charge.status == "open"


def test_recompute_reopens_a_charge_whose_allocation_was_removed(
    tenant_session, studio, a_priced_student
):
    """A reversal deletes allocations (Task 4) and calls this. Without the reopen arm a
    reversed payment would leave the charge reading `settled` forever -- money the club
    never received, invisible in every debt report."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    tenant_session.execute(
        PaymentAllocation.__table__.delete().where(PaymentAllocation.charge_id == charge.id)
    )
    service.recompute_charge_status(charge.id)
    assert charge.status == "open"


def test_a_written_off_charge_is_not_reopened_by_a_late_payment(
    tenant_session, studio, a_priced_student
):
    """`void` and `written_off` are manager decisions, not sums. A late payment against a
    written-off debt is real money and belongs in the reconciliation queue -- silently
    un-writing-off the charge would erase the decision a human made."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    charge.status = "written_off"
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    assert charge.status == "written_off"


def test_a_credit_is_settled_when_it_is_fully_allocated(tenant_session, studio, a_priced_student):
    """§5.10 -- 'negative for a credit or discount'. `allocated >= amount` is true for a
    credit the moment it is created, so a naive comparison marks every credit settled
    before a single agora moves."""
    service = BillingService(tenant_session)
    credit = service.create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        -5_000,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    service.recompute_charge_status(credit.id)
    assert credit.status == "open"
    _pay(tenant_session, studio, credit, -5_000, a_priced_student.payer_person_id)
    service.recompute_charge_status(credit.id)
    assert credit.status == "settled"
