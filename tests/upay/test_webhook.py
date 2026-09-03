"""§5.10's IPN endpoint. No signature exists on this callback, in either direction.

Four checks stand in for one: a UUIDv4 reference the server issued, an independent
server-side amount comparison, idempotence on `transactionid`, and a source-IP signal that
is deliberately never a gate.

**Every test here asserts 200.** §5.10: 'The endpoint persists the raw upay_ipn_record and
returns 200 immediately; all processing happens in a worker.' A non-200 invites retries
whose behaviour is [NOT COVERED] by any testing against this account -- and the raw bytes
are already safe by then, which is what makes returning 200 to a forged callback the right
answer rather than a lax one.
"""

from __future__ import annotations

import logging
import uuid

import pytest
from app.integrations.upay.ipn import IPN_SOURCE_IP, IpnShape, build_ipn_query
from app.models.billing import Charge, Payment, PaymentAllocation, PaymentOrder, UpayIpnRecord
from app.services.billing.reconciliation import IpnIntake
from sqlalchemy import func, select
from tests.billing.conftest import T0


def _txn(order, suffix: str) -> str:
    """A transaction id unique to this test, derived from its order's own reference.

    **`uq_upay_ipn_record_transactionid` is GLOBAL, not per studio** -- correctly, because
    uPay issues one sequence across the whole merchant account. So a fixed literal like
    "TXN-1" is a duplicate of every previous run's "TXN-1": the endpoint commits on its own
    session, so its rows outlive the test that made them, and the second run of this file
    would see every delivery as a re-delivery and settle nothing.

    Deriving from `order.public_ref` -- a fresh UUIDv4 per test -- makes each test's ids its
    own, which is also what real ones are.
    """
    return f"TXN-{order.public_ref.hex[:12]}-{suffix}"


def _deliver(client, order, shape, *, suffix="1", source_ip=IPN_SOURCE_IP, **overrides):
    query = build_ipn_query(
        shape=shape,
        order_public_ref=order.public_ref,
        expected_amount_agorot=order.expected_amount_agorot,
        transaction_id=_txn(order, suffix),
    )
    query.update(overrides)
    headers = {"X-Dev-Now": T0.isoformat()}
    if source_ip is not None:
        headers["X-Forwarded-For"] = source_ip
    return client.get(f"/api/v1/webhooks/upay/{order.public_ref}", params=query, headers=headers)


def test_a_clean_success_settles_every_charge_the_order_covers(client, an_order, tenant_session):
    """§5.10's happy path, and E2E-3's backend half."""
    response = _deliver(client, an_order.order, IpnShape.SUCCESS)
    assert response.status_code == 200
    tenant_session.expire_all()
    order = tenant_session.get(PaymentOrder, an_order.order.id)
    assert order.status == "paid"
    assert order.external_payment_ref == _txn(an_order.order, "1")
    assert order.paid_at is not None
    payment = tenant_session.execute(select(Payment)).scalars().one()
    assert payment.method == "upay_card"
    assert payment.amount_agorot == an_order.order.expected_amount_agorot
    for charge_id in an_order.charge_ids:
        assert tenant_session.get(Charge, charge_id).status == "settled"


def test_the_raw_callback_is_persisted_verbatim(client, an_order, tenant_session):
    """upay-integration.md calls this 'the single highest-value piece of infrastructure
    here': retries on a non-200, IPNs for failed payments and duplicate delivery are all
    [NOT COVERED], and logging the raw callback turns each unknown into something observed
    in production with full data rather than pre-guessed."""
    _deliver(client, an_order.order, IpnShape.SUCCESS)
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.transactionid == _txn(an_order.order, "1")
    assert "productdescription=" in record.raw_query
    # Round two B4: whole shekels come back with NO decimal part. Kept exactly as sent.
    assert record.amount == "250"
    assert record.source_ip == IPN_SOURCE_IP
    assert record.match_status == "auto"
    assert record.matched_payment_id is not None


def test_an_amount_mismatch_records_the_money_and_settles_nothing(client, an_order, tenant_session):
    """§5.10's fourth threat row, verbatim: 'A payment IS recorded for the real amount
    received, allocated to nothing, and a high-priority manager alert is raised. Charges
    are NOT settled.'

    Never collapse this into `failed`. The money is in the merchant account.
    """
    response = _deliver(client, an_order.order, IpnShape.AMOUNT_MISMATCH)
    assert response.status_code == 200
    tenant_session.expire_all()
    order = tenant_session.get(PaymentOrder, an_order.order.id)
    assert order.status == "amount_mismatch"
    payment = tenant_session.execute(select(Payment)).scalars().one()
    assert payment.amount_agorot == an_order.order.expected_amount_agorot - 1
    assert (
        tenant_session.execute(select(func.count()).select_from(PaymentAllocation)).scalar_one()
        == 0
    )
    for charge_id in an_order.charge_ids:
        assert tenant_session.get(Charge, charge_id).status == "open"


def test_a_tampered_amount_in_either_money_field_is_caught(client, an_order, tenant_session):
    """Round two B10 [VERIFIED]: an edited `amount=2` came back as `amount=2` AND
    `depositamount=2`, both unmodified. A parser reading either one alone would be right by
    luck; `verify_ipn` compares both, and this asserts the endpoint does not undo that."""
    response = _deliver(client, an_order.order, IpnShape.SUCCESS, depositamount="1")
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "amount_mismatch"


def test_a_forged_reference_settles_nothing_and_still_returns_200(client, an_order, tenant_session):
    """E2E-4's backend half. The reference names no order of ours, so there is nothing to
    settle -- and the bytes are kept, because a forged callback is the one we most want a
    record of."""
    response = _deliver(client, an_order.order, IpnShape.FORGED_REF, suffix="FORGED")
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "pending"
    assert tenant_session.execute(select(Payment)).scalars().all() == []
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.match_status == "unmatched"
    assert record.matched_payment_id is None


def test_a_callback_for_an_unknown_public_ref_is_logged_and_rejected(client, tenant_session):
    """The `payments` skill states it as a rule: 'A callback for an unknown reference is
    logged and rejected, not auto-created.' Auto-creating an order from a callback would let
    anyone mint paid orders out of nothing."""
    unknown = uuid.uuid4()
    query = build_ipn_query(
        shape=IpnShape.SUCCESS,
        order_public_ref=unknown,
        expected_amount_agorot=25_000,
        transaction_id=f"TXN-{unknown.hex[:12]}-GHOST",
    )
    response = client.get(
        f"/api/v1/webhooks/upay/{unknown}", params=query, headers={"X-Dev-Now": T0.isoformat()}
    )
    assert response.status_code == 200
    assert tenant_session.execute(select(PaymentOrder)).scalars().all() == []
    assert tenant_session.execute(select(Payment)).scalars().all() == []


def test_a_duplicate_transactionid_is_logged_once_and_ignored(client, an_order, tenant_session):
    """§5.10's fifth threat row. Idempotence on `transactionid` neutralises retries AND
    duplicates whatever uPay actually does -- both are [NOT COVERED], and the design
    deliberately does not depend on knowing."""
    _deliver(client, an_order.order, IpnShape.SUCCESS, suffix="1")
    second = _deliver(client, an_order.order, IpnShape.DUPLICATE, suffix="1")
    assert second.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.execute(select(func.count()).select_from(Payment)).scalar_one() == 1
    assert tenant_session.execute(select(func.count()).select_from(UpayIpnRecord)).scalar_one() == 1


def test_a_second_delivery_never_double_settles(client, an_order, tenant_session):
    """The consequence the idempotence exists for, asserted on the MONEY rather than on the
    row count: a duplicate that created a second payment would settle the family's next
    month too, and nobody would notice until the following run."""
    _deliver(client, an_order.order, IpnShape.SUCCESS, suffix="1")
    _deliver(client, an_order.order, IpnShape.SUCCESS, suffix="1")
    tenant_session.expire_all()
    total = tenant_session.execute(
        select(func.coalesce(func.sum(Payment.amount_agorot), 0))
    ).scalar_one()
    assert total == an_order.order.expected_amount_agorot


def test_an_unknown_source_ip_is_recorded_and_never_refused(client, an_order, tenant_session):
    """§5.10 allows a source-IP allowlist and calls it 'one weak layer, not proof'. Round
    two observed 84.95.87.35 on TWO OF THREE deliveries and could not establish whether it
    is stable -- so an address that changed would make us refuse real payments, silently,
    and the parent would have paid.

    Recorded for a human, acted on by nobody.
    """
    response = _deliver(client, an_order.order, IpnShape.SUCCESS, source_ip="203.0.113.9")
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "paid"
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.source_ip == "203.0.113.9"


def test_a_malformed_callback_is_kept_and_answered_200(client, an_order, tenant_session):
    """A delivery missing `transactionid` cannot be classified at all. Refusing it with a
    4xx would invite a retry loop whose behaviour nobody has observed; keeping the bytes and
    answering 200 puts it in front of a human instead."""
    response = client.get(
        f"/api/v1/webhooks/upay/{an_order.order.public_ref}",
        params={"amount": "250", "productdescription": str(an_order.order.public_ref)},
        headers={"X-Dev-Now": T0.isoformat()},
    )
    assert response.status_code == 200
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.match_status == "unmatched"
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "pending"


def test_a_recurring_callback_with_no_reference_lands_unmatched(client, an_order, tenant_session):
    """§5.10 step 1. Every הוראת קבע payment arrives this way, and they are legitimate
    payments from real parents. Answering `forged_ref` for them would raise a fraud alert on
    every one of them."""
    response = _deliver(
        client, an_order.order, IpnShape.SUCCESS, suffix="SO", productdescription=""
    )
    assert response.status_code == 200
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.order_public_ref is None
    assert record.match_status == "unmatched"
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "pending"


def test_an_unobserved_outcome_code_settles_nothing(client, an_order, tenant_session):
    """IPNs for failed or declined payments are [NOT COVERED] -- three live tests never
    produced one. Both ways of guessing the SHAPE of a failure are still refused: calling
    it `success` settles charges for money that did not arrive, and inventing a payment
    record for it would silently swallow the first real one -- neither happens here.

    §7.4 of the completion findings register -- what WAS missing is the one fact this
    order needed regardless of shape: an outcome that is not success arrived for it, so the
    parent must stop being told 'verifying'. `_settle_order` overwrites `status`
    unconditionally on any later success (`reconciliation.py`), so marking it here is not a
    dead end -- a genuine retry still settles the order correctly.
    """
    response = _deliver(
        client, an_order.order, IpnShape.SUCCESS, providererrorcode="7", errordescription="DECLINED"
    )
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "failed"
    assert tenant_session.execute(select(Payment)).scalars().all() == []
    assert tenant_session.execute(select(UpayIpnRecord)).scalars().one().match_status == "unmatched"


def test_an_unobserved_outcome_code_for_an_already_settled_order_does_not_downgrade_it(
    client, an_order, tenant_session
):
    """The guard that keeps the fix above from being a NEW risk. An order that already
    settled must never be knocked back to `failed` by a later, unrelated delivery carrying
    a code nobody has seen -- that would make a genuinely paid family look unpaid again,
    which is exactly the 'costs them a second payment' failure `amount_mismatch` exists to
    avoid."""
    _deliver(client, an_order.order, IpnShape.SUCCESS, suffix="1")
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "paid"

    response = _deliver(
        client,
        an_order.order,
        IpnShape.SUCCESS,
        suffix="2",
        providererrorcode="7",
        errordescription="DECLINED",
    )
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.order.id).status == "paid"


def test_the_endpoint_needs_no_authentication(client, an_order):
    """uPay calls it, so it cannot be authenticated -- which is exactly why the reference is
    a UUIDv4 and the amount is verified server-side. Asserted so nobody 'fixes' the missing
    auth dependency and silently stops every real payment in the club from reconciling."""
    response = _deliver(client, an_order.order, IpnShape.SUCCESS)
    assert response.status_code == 200
    assert "authorization" not in {k.lower() for k in response.request.headers}


def test_no_card_owner_name_or_last_four_reaches_the_logs(client, an_order, caplog):
    """§11.7, and the reason `upay_ipn_record` exists as DATA. The card owner name and the
    last four digits are on a manager-only screen where reconciling actually happens; a log
    line carrying them is a copy nobody can redact later."""
    from app.integrations.upay.ipn import DEMO_CARD_OWNER, DEMO_FOUR_DIGITS

    with caplog.at_level(logging.DEBUG):
        _deliver(client, an_order.order, IpnShape.SUCCESS)
        _deliver(client, an_order.order, IpnShape.AMOUNT_MISMATCH, suffix="2")
        _deliver(client, an_order.order, IpnShape.FORGED_REF, suffix="3")
    # Scoped to OUR loggers, because §11.7 is about the application's own logs and that is
    # what this lane controls. See the test below for the half it does not.
    ours = [record for record in caplog.records if record.name.startswith(("app.", "tests."))]
    text = "\n".join(record.getMessage() for record in ours)
    assert DEMO_CARD_OWNER not in text
    assert DEMO_FOUR_DIGITS not in text
    # Every log line this endpoint emits carries ids, and the ids are what a human needs to
    # find the row -- where the card details legitimately live.
    for record in ours:
        assert DEMO_FOUR_DIGITS not in str(getattr(record, "__dict__", {}))


@pytest.mark.xfail(
    reason=(
        "§11.7 gap this lane cannot close. uPay delivers the card owner name and last four "
        "digits as QUERY PARAMETERS (§12), so any access log that records a request's query "
        "string copies them -- httpx here, uvicorn in production. app/core/logging.py's "
        "scrubber redacts by KEY and already lists card_owner_name, four_digits and "
        "raw_query, but an access-log line is one message string with the whole URL in it "
        "and no key-based scrubber can reach inside it. The fix is in the core lane's "
        "logging config (suppress or rewrite the access log for this path); recorded here "
        "as an xfail rather than a comment so it is a build artefact somebody has to look "
        "at rather than a note somebody has to find."
    ),
    strict=True,
)
def test_the_access_log_does_not_carry_the_card_digits(client, an_order, caplog):
    """The other half, and it does not pass. See the xfail reason."""
    from app.integrations.upay.ipn import DEMO_FOUR_DIGITS

    with caplog.at_level(logging.DEBUG):
        _deliver(client, an_order.order, IpnShape.SUCCESS)
    text = "\n".join(record.getMessage() for record in caplog.records)
    assert DEMO_FOUR_DIGITS not in text


@pytest.mark.parametrize(
    "shape", [IpnShape.SUCCESS, IpnShape.AMOUNT_MISMATCH, IpnShape.FORGED_REF, IpnShape.DUPLICATE]
)
def test_every_shape_answers_200(client, an_order, shape):
    """§19.5's four, which are §5.10's four security requirements. Whatever the verdict, the
    answer is 200 -- because by the time a verdict exists the bytes are already safe, and a
    non-200 invites a retry nobody has observed."""
    assert _deliver(client, an_order.order, shape, suffix=str(shape)).status_code == 200


def test_a_failure_in_settlement_never_discards_the_raw_callback(
    client, an_order, tenant_session, monkeypatch
):
    """§5.10: 'Every IPN is persisted verbatim in `upay_ipn_record` whether matched or not.'

    The endpoint answers 200 to everything, so uPay never re-delivers -- which makes the
    persisted row the *only* copy of a callback that ever existed. If settlement raises and
    the handler rolls back, that row goes with it: the money is in the merchant account, we
    have no record it ever arrived, and no retry is coming to tell us again.

    A SAVEPOINT does not save it. `record()` opens one, but an outer `session.rollback()`
    unwinds the whole transaction, savepoint included. The bytes have to be **committed** on
    their own before any settlement work begins.
    """
    order = an_order.order

    def boom(self, record_id, *, at):
        raise RuntimeError("a bug in settlement")

    monkeypatch.setattr(IpnIntake, "settle", boom)
    response = _deliver(client, order, IpnShape.SUCCESS, suffix="BOOM")

    assert response.status_code == 200
    tenant_session.expire_all()
    record = (
        tenant_session.execute(
            select(UpayIpnRecord).where(UpayIpnRecord.transactionid == _txn(order, "BOOM"))
        )
        .scalars()
        .one()
    )
    assert record.raw_query, "the verbatim bytes are the whole point of the row"
    assert record.match_status == "unmatched", "nothing was settled, so nothing is matched"
    # Untouched: settlement never ran.
    assert tenant_session.get(PaymentOrder, order.id).status == "pending"


def test_the_dev_simulator_drives_a_real_settlement_end_to_end(client, an_order, tenant_session):
    """§19.5 calls this tool "the important one", and W4's exit gate is driven from it.

    It could not drive anything. It built a concrete path, tested it against OpenAPI's
    templated keys so the check could never pass, and issued no GET even if it had. This
    is the whole tool doing its whole job: one POST to the simulator settles a real order
    through the real webhook, with no test client touching the webhook itself.
    """
    order = an_order.order
    response = client.post(
        "/api/v1/dev/upay/simulate-ipn",
        json={
            "shape": "success",
            "order_public_ref": str(order.public_ref),
            "expected_amount_agorot": order.expected_amount_agorot,
            "transaction_id": _txn(order, "SIM"),
        },
        headers={"X-Dev-Now": T0.isoformat()},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["delivered"] is True
    assert body["webhook_status"] == 200

    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, order.id).status == "paid"
    record = (
        tenant_session.execute(
            select(UpayIpnRecord).where(UpayIpnRecord.transactionid == _txn(order, "SIM"))
        )
        .scalars()
        .one()
    )
    assert record.match_status == "auto"
    # §5.10's weak signal, sent by the simulator so a simulated row looks like a real one.
    assert record.source_ip == IPN_SOURCE_IP
    for charge_id in an_order.charge_ids:
        assert tenant_session.get(Charge, charge_id).status == "settled"


def test_months_bought_forward_settle_the_debt_and_leave_the_rest_as_credit(
    client, app_session, studio, a_priced_student, an_open_charge, tenant_session
):
    """**The whole point of the card's month chips** (owner request, 2026-08-30).

    A family owes one month and hands the club three by card. The debt settles, and the two
    months they bought forward are simply the part of the payment nothing allocated -- which
    is what credit IS in this ledger (`PaymentAllocation`, and the 2026-08-27 prepayment
    spec §2). There is no "prepayment" row and no second mechanism to keep in step: the
    billing run's step 7 spends the surplus oldest-first as the next months are billed, so
    the family reads as paid at every instant and the debt ladder never fires at them.
    """
    from app.core.db import get_engine
    from app.core.tenancy import TenantSession, use_studio
    from app.services.billing import BillingService
    from app.services.billing.orders import OrderService
    from tests.billing.conftest import MONTHLY_AGOROT

    with (
        use_studio(studio.id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        order = OrderService(scoped).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[an_open_charge],
            max_payments=1,
            prepay_months=2,
            at=T0,
        )
        scoped.commit()
        scoped.refresh(order)
        scoped.expunge(order)

    # uPay is asked for all three months at once, never for the debt alone.
    assert order.expected_amount_agorot == MONTHLY_AGOROT * 3

    assert _deliver(client, order, IpnShape.SUCCESS).status_code == 200
    tenant_session.expire_all()

    assert tenant_session.get(Charge, an_open_charge).status == "settled"
    payment = tenant_session.execute(select(Payment)).scalars().one()
    assert payment.amount_agorot == MONTHLY_AGOROT * 3
    # One allocation, for the one month that had a charge. The other two months have none
    # yet -- that is the definition of buying them forward.
    allocated = tenant_session.execute(
        select(func.coalesce(func.sum(PaymentAllocation.amount_agorot), 0)).where(
            PaymentAllocation.payment_id == payment.id
        )
    ).scalar_one()
    assert allocated == MONTHLY_AGOROT
    assert (
        BillingService(tenant_session).payer_credit(a_priced_student.payer_person_id)
        == MONTHLY_AGOROT * 2
    )
