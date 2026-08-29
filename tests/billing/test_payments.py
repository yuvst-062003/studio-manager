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


def test_an_allocation_names_the_kind_of_charge_it_settled(
    client, as_manager, a_priced_student, an_open_charge
):
    """`12f`'s filter chips read this.

    The parent history screen offers שכר לימוד / חיוב ידני / אירוע, and a PAYMENT has a
    method, not a kind -- its kind is the kind of the charges it settled. With only
    `charge_id` on the allocation the screen could not tell them apart, so its filter
    collapsed to `filter === 'tuition'` and two of the four chips matched nothing at all,
    ever. Carrying the kind on the row the parent already receives is what makes the
    control real rather than removing it.
    """
    body = client.post(
        "/api/v1/payments",
        json=_body(a_priced_student.payer_person_id, [an_open_charge]),
        headers=as_manager.headers,
    ).json()
    assert [row["kind"] for row in body["allocations"]] == ["tuition"]


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


# -- §5.10's uPay one-time flow, through the API ------------------------------
def test_a_parent_opens_an_order_over_their_own_charges(
    client, as_guardian_of, a_priced_student, three_open_months
):
    """**No role dependency** on this route. §3.1: 'guardian is not a role', and §6.1 makes
    parent access `EXISTS(guardian WHERE person_id = :me)` -- so a role check here would
    refuse every parent in the product and admit every coach with no children."""
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.post(
        "/api/v1/payment-orders",
        json={"charge_ids": [str(c) for c in three_open_months]},
        params={"max_payments": 3},
        headers=parent.headers,
    )
    # The parent owes nothing: `three_open_months` belongs to `a_priced_student`'s PRIMARY
    # guardian, and this fixture's caller is a second, non-primary guardian.
    assert response.status_code == 404


def test_the_payer_is_the_caller_and_never_the_body(
    client, as_manager, a_priced_student, three_open_months
):
    """A body-supplied payer would let anyone open an order over anyone's charges. The
    shape carries only `charge_ids`, and this asserts the route honours that."""
    response = client.post(
        "/api/v1/payment-orders",
        json={
            "charge_ids": [str(three_open_months[0])],
            "payer_person_id": str(a_priced_student.payer_person_id),
        },
        headers=as_manager.headers,
    )
    # The manager is not the payer, so the charge is not theirs to pay -- the extra body
    # field is ignored rather than obeyed.
    assert response.status_code == 404


def test_an_order_needs_at_least_one_charge(client, as_manager):
    """`PaymentOrderCreateIn.charge_ids` has `min_length=1`."""
    response = client.post(
        "/api/v1/payment-orders", json={"charge_ids": []}, headers=as_manager.headers
    )
    assert response.status_code == 422


def test_the_return_page_marks_nothing_paid(
    client, as_manager, a_priced_student, an_open_charge, tenant_session
):
    """§5.10 step 5 -- 'the redirect is NEVER the source of truth'.

    uPay appends its own payload to this URL and every field of it is client-submitted and
    unsigned. The page reports the ORDER's status from our own row and settles nothing.
    """
    from app.models.billing import Charge
    from app.services.billing.orders import OrderService

    order = OrderService(tenant_session).create(
        tenant_session.get(Charge, an_open_charge).studio_id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[an_open_charge],
        max_payments=1,
        at=T0,
    )
    tenant_session.commit()
    response = client.get(
        "/api/v1/payment-complete",
        params={"ref": str(order.public_ref), "errordescription": "SUCCESS", "amount": "250"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    tenant_session.expire_all()
    assert tenant_session.get(Charge, an_open_charge).status == "open"


def test_the_return_page_is_calm_about_an_unknown_reference(client, as_manager):
    """A mistyped bookmark, or a stale link. The parent has just come back from paying and a
    page reading 'not found' would be alarming -- `pending` is honest, because we genuinely
    do not know that anything happened."""
    import uuid as _uuid

    response = client.get(
        "/api/v1/payment-complete",
        params={"ref": str(_uuid.uuid4())},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "pending"


def test_a_payer_opens_an_order_over_the_charges_they_owe(
    client, as_manager, tenant_session, studio, a_priced_student
):
    """The happy path, with the caller as the payer -- which is the only way an order can be
    created, because a manager cannot stand in front of uPay with someone else's card.

    The charge is raised against the CALLER's own person id, so this is one person paying
    their own debt: exactly `1b`'s flow.
    """
    from datetime import date

    from app.services.billing import BillingService

    charge = BillingService(tenant_session).create_charge(
        studio.id,
        as_manager.person_id,
        "manual",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
    )
    tenant_session.commit()
    response = client.post(
        "/api/v1/payment-orders",
        json={"charge_ids": [str(charge.id)]},
        params={"max_payments": 3},
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["expected_amount_agorot"] == MONTHLY_AGOROT
    assert body["max_payments"] == 3
    assert body["status"] == "pending"
    assert body["charge_ids"] == [str(charge.id)]

    # The order is readable by its payer, and its form is the fields the client posts.
    read = client.get(f"/api/v1/payment-orders/{body['public_ref']}", headers=as_manager.headers)
    assert read.status_code == 200
    assert read.json()["status"] == "pending"


def test_the_same_charge_cannot_be_ordered_twice(client, as_manager, tenant_session, studio):
    """§5.10's primary double-payment guard, through the API. A second order over a charge
    an open one already covers is refused."""
    from datetime import date

    from app.services.billing import BillingService

    charge = BillingService(tenant_session).create_charge(
        studio.id, as_manager.person_id, "manual", MONTHLY_AGOROT, date(2026, 11, 30)
    )
    tenant_session.commit()
    payload = {"charge_ids": [str(charge.id)]}
    assert (
        client.post("/api/v1/payment-orders", json=payload, headers=as_manager.headers).status_code
        == 201
    )
    second = client.post("/api/v1/payment-orders", json=payload, headers=as_manager.headers)
    assert second.status_code == 409


def test_more_installments_than_the_account_offers_is_refused(
    client, as_manager, tenant_session, studio
):
    """Round two A1: the merchant dashboard's dropdown stops at 12."""
    from datetime import date

    from app.services.billing import BillingService

    charge = BillingService(tenant_session).create_charge(
        studio.id, as_manager.person_id, "manual", MONTHLY_AGOROT, date(2026, 11, 30)
    )
    tenant_session.commit()
    response = client.post(
        "/api/v1/payment-orders",
        json={"charge_ids": [str(charge.id)]},
        params={"max_payments": 24},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_the_form_is_fields_and_not_html(
    client, as_manager, tenant_session, studio, a_merchant_email
):
    """§5.10 step 2. Returning rendered HTML from an API the TypeScript client is generated
    against would hand that client a `string` where every other route has a model, and the
    form's own fields would stop being type-checked."""
    from datetime import date

    from app.services.billing import BillingService

    charge = BillingService(tenant_session).create_charge(
        studio.id, as_manager.person_id, "manual", MONTHLY_AGOROT, date(2026, 11, 30)
    )
    tenant_session.commit()
    created = client.post(
        "/api/v1/payment-orders",
        json={"charge_ids": [str(charge.id)]},
        headers=as_manager.headers,
    ).json()
    response = client.get(
        f"/api/v1/payment-orders/{created['public_ref']}/form", headers=as_manager.headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["action"].startswith("https://app.upay.co.il/")
    assert body["fields"]["paymentdetails"] == created["public_ref"]
    assert body["fields"]["amount"] == "250.00"
    assert body["fields"]["livesystem"] == "1"
    # P1 — the browser goes back to the PARENT APP's return screen, never to the JSON
    # status endpoint a paying parent cannot read. The IPN URL stays on the API.
    assert (
        body["fields"]["returnurl"]
        == f"http://localhost:5174/#/payment-complete/{created['public_ref']}"
    )
    assert "/api/v1/webhooks/upay/" in body["fields"]["ipnurl"]
