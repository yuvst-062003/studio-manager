"""SPEC §7's `/payments`.

**G8's normal route, not an exception path.** `standing_order` is recorded here by a human
on exactly the same flow as `bank_transfer` and `cash`, because our provider cannot create a
per-payer mandate and its recurring callbacks carry no customer identifier.
"""

from __future__ import annotations

import pytest
from app.models.billing import Charge, PaymentAllocation
from app.services.billing import BillingService
from tests.billing.conftest import MONTHLY_AGOROT, T0


def _body(payer_person_id, charge_ids, *, method="standing_order", amount=MONTHLY_AGOROT):
    return {
        "payer_person_id": str(payer_person_id),
        "method": method,
        "amount_agorot": amount,
        "received_at": T0.isoformat(),
        "charge_ids": [str(c) for c in charge_ids],
    }


def test_a_manager_records_a_standing_order_payment(
    client, as_manager, a_priced_student, an_open_charge
):
    """G8 in one request. A הוראת קבע payment is marked in-app exactly like a bank
    transfer, because uPay provides no field saying who paid."""
    response = client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [an_open_charge]),
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["method"] == "standing_order"
    assert body["amount_agorot"] == MONTHLY_AGOROT
    assert len(body["allocations"]) == 1
    assert body["allocations"][0]["charge_id"] == str(an_open_charge)


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_cannot_read_or_record_payments(
    client, request, caller, a_priced_student, an_open_charge
):
    """§3.2 and invariant 3. A coach never sees what a family paid."""
    signed_in = request.getfixturevalue(caller)
    assert client.get("/api/v1/payments", headers=signed_in.headers).status_code == 403
    assert (
        client.post(
            "/api/v1/payments",
            json=_body(a_priced_student.payer_person_id, [an_open_charge]),
            headers=signed_in.headers,
        ).status_code
        == 403
    )


def test_recording_a_payment_never_writes_a_charge_status_directly(
    client, as_manager, a_priced_student, an_open_charge, tenant_session
):
    """The lane's central invariant, asserted through the API rather than the service.

    A route that set `status` itself would pass every other test in this file -- the charge
    would read `settled` and the allocations would be right. What it would not survive is
    the allocations going away: the status would stay. So this asserts the derived value,
    then removes the cause and asserts the effect follows.
    """
    client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [an_open_charge]),
        headers=as_manager.headers,
    )
    tenant_session.expire_all()
    assert tenant_session.get(Charge, an_open_charge).status == "settled"
    tenant_session.execute(
        PaymentAllocation.__table__.delete().where(PaymentAllocation.charge_id == an_open_charge)
    )
    BillingService(tenant_session).recompute_charge_status(an_open_charge)
    assert tenant_session.get(Charge, an_open_charge).status == "open"


def test_an_unallocated_payment_is_recorded_and_reported_as_surplus(
    client, as_manager, a_priced_student, an_open_charge
):
    """§5.10's overpayment. The money arrived, so it is recorded; it settles what it can and
    the rest waits in the reconciliation queue.

    The surplus is **derived**, not carried: `PaymentOut` is W4's contract shape and has no
    `unallocated_agorot`, and it does not need one -- every allocation is on the row, so
    `amount_agorot - sum(allocations)` is the surplus and there is nothing a second field
    could say that this does not. A shape that carried both could disagree with itself.
    """
    response = client.post(
        "/api/v1/payments",
        json=_body(
            a_priced_student.payer_person_id, [an_open_charge], amount=MONTHLY_AGOROT + 5_000
        ),
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    body = response.json()
    allocated = sum(row["amount_agorot"] for row in body["allocations"])
    assert allocated == MONTHLY_AGOROT
    assert body["amount_agorot"] - allocated == 5_000


def test_a_payment_for_another_family_s_charge_is_refused(
    client, as_manager, a_priced_student, an_open_charge, a_two_child_family
):
    """`charge_ids` comes from the client. Clearing one family's debt with another's money
    is the worst thing this endpoint could be talked into."""
    response = client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [a_two_child_family.charge_ids[0]]),
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_a_reversal_reopens_the_charge_and_keeps_the_payment(
    client, as_manager, a_priced_student, an_open_charge, tenant_session
):
    """§11.4 -- roughly seven years of financial records, so never a DELETE."""
    created = client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [an_open_charge]),
        headers=as_manager.headers,
    ).json()
    reversed_response = client.post(
        f"/api/v1/payments/{created['id']}/reverse",
        json={"reason": "שיק חזר"},
        headers=as_manager.headers,
    )
    assert reversed_response.status_code == 200
    assert reversed_response.json()["reversed_at"] is not None
    assert reversed_response.json()["reversal_reason"] == "שיק חזר"
    tenant_session.expire_all()
    assert tenant_session.get(Charge, an_open_charge).status == "open"


def test_a_reversal_needs_a_reason(client, as_manager, a_priced_student, an_open_charge):
    created = client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [an_open_charge]),
        headers=as_manager.headers,
    ).json()
    response = client.post(
        f"/api/v1/payments/{created['id']}/reverse",
        json={"reason": ""},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_the_external_receipt_number_round_trips(
    client, as_manager, a_priced_student, an_open_charge
):
    """§5.10 -- 'the system does NOT issue tax documents for cash, bank transfer or הוראת
    קבע'. This free-text field is where the studio's bookkeeper's own number goes, so the
    ledger stays reconcilable with their books."""
    body = _body(a_priced_student.payer_person_id, [an_open_charge], method="bank_transfer")
    body["external_receipt_number"] = "2026-0042"
    response = client.post("/api/v1/payments", json=body, headers=as_manager.headers)
    assert response.status_code == 201
    assert response.json()["external_receipt_number"] == "2026-0042"


def test_a_card_payment_cannot_be_recorded_by_hand(
    client, as_manager, a_priced_student, an_open_charge
):
    """`ManualPaymentIn.method` excludes `upay_card`: only the IPN may record one, because
    only the IPN is evidence that a card was actually charged. A hand-recorded card payment
    is a settled month with no money behind it."""
    response = client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [an_open_charge], method="upay_card"),
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_payments_list_for_one_payer(client, as_manager, a_priced_student, an_open_charge):
    client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [an_open_charge]),
        headers=as_manager.headers,
    )
    response = client.get(
        "/api/v1/payments",
        params={"payer_person_id": str(a_priced_student.payer_person_id)},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
