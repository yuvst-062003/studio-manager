"""The cash-request lifecycle (feature pass 2026-08-27).

The property under test is the settlement rule: confirmation records what the charges
are STILL owed, never the snapshot -- so cash raised before a card payment cannot
double-collect -- and a declined request leaves everything exactly as it found it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.models.billing import Charge, Payment
from app.services.billing import BillingService
from app.services.billing.cash import CashService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
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


def test_a_request_snapshots_the_outstanding_total(
    tenant_session, app_session, studio, a_priced_student
):
    first = _charge(app_session, studio, a_priced_student, 9)
    second = _charge(app_session, studio, a_priced_student, 10)
    row = CashService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[first, second],
        at=T0,
    )
    assert row.status == "pending"
    assert row.total_agorot == 2 * MONTHLY_AGOROT
    assert set(CashService(tenant_session).charge_ids_of(row.id)) == {first, second}


def test_another_familys_charge_reads_as_not_found(
    tenant_session, app_session, studio, a_priced_student
):
    """404, never 403 -- a foreign charge id must not be confirmed to exist."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    with pytest.raises(NotFoundError):
        CashService(tenant_session).create(
            studio.id, payer_person_id=uuid.uuid4(), charge_ids=[charge_id], at=T0
        )


def test_a_charge_cannot_sit_in_two_pending_requests(
    tenant_session, app_session, studio, a_priced_student
):
    """Two live requests over one month would show the manager the same money twice."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = CashService(tenant_session)
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
    service = CashService(tenant_session)
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
    """The snapshot is display; settlement recomputes. Cash raised before a card payment
    landed must not double-collect."""
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = CashService(tenant_session)
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
    service = CashService(tenant_session)
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
    service = CashService(tenant_session)
    row = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    service.decline(row.id, actor_person_id=None, at=T0)

    assert row.status == "declined"
    assert tenant_session.get(Charge, charge_id).status == "open"
    # A declined request's charges are free to try again.
    again = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    assert again.status == "pending"


def test_a_decided_request_cannot_be_decided_again(
    tenant_session, app_session, studio, a_priced_student
):
    charge_id = _charge(app_session, studio, a_priced_student, 9)
    service = CashService(tenant_session)
    row = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[charge_id], at=T0
    )
    service.decline(row.id, actor_person_id=None, at=T0)
    with pytest.raises(ConflictError):
        service.confirm(row.id, actor_person_id=None, at=T0)


def test_an_empty_selection_is_refused(tenant_session, studio, a_priced_student):
    with pytest.raises(RefusedError):
        CashService(tenant_session).create(
            studio.id, payer_person_id=a_priced_student.payer_person_id, charge_ids=[], at=T0
        )
