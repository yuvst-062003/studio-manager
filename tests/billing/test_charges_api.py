"""SPEC §7's `/charges`, `/price-plans`, `/products` and `/billing-runs`.

**Every financial route is manager-or-owner.** §3.2's matrix gives a coach no financial read
at all, and invariant 3 enforces that against the `coach` router tag -- so this router
carries no `coach` tag on any of these routes, and the two coach callers below are the
assertion that it does not.
"""

from __future__ import annotations

import pytest
from tests.billing.conftest import MONTHLY_AGOROT


def test_a_manager_lists_the_charges_a_payer_owes(
    client, as_manager, an_open_charge, a_priced_student
):
    response = client.get(
        "/api/v1/charges",
        params={"payer_person_id": str(a_priced_student.payer_person_id)},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["amount_agorot"] == MONTHLY_AGOROT
    assert items[0]["allocated_agorot"] == 0
    assert items[0]["status"] == "open"


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_cannot_read_charges(client, request, caller, an_open_charge):
    """§3.2 and invariant 3. A lead coach opens a student card and marks attendance; they
    never see what the family owes. In a small community that boundary is the product."""
    signed_in = request.getfixturevalue(caller)
    response = client.get("/api/v1/charges", headers=signed_in.headers)
    assert response.status_code == 403


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_cannot_read_prices(client, request, caller, a_price_plan):
    """The same rule on the catalogue. A price plan is a financial field wherever it is
    rendered, and `5a` is a dashboard screen for a reason."""
    signed_in = request.getfixturevalue(caller)
    assert client.get("/api/v1/price-plans", headers=signed_in.headers).status_code == 403


def test_a_manual_charge_and_a_credit_are_both_new_facts(client, as_manager, a_priced_student):
    """§5.10 -- 'negative for a credit or discount, with a mandatory reason'. A credit is a
    new charge, never an edit to the one it offsets, so last month's statement does not
    change after a parent has read it."""
    response = client.post(
        "/api/v1/charges",
        json={
            "payer_person_id": str(a_priced_student.payer_person_id),
            "student_id": str(a_priced_student.student_id),
            "kind": "manual",
            "amount_agorot": 5_000,
            "due_date": "2026-11-30",
            "note": "גי מידה 140",
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    charge_id = response.json()["id"]
    adjusted = client.post(
        f"/api/v1/charges/{charge_id}/adjust",
        json={"amount_agorot": -2_000, "reason": "הנחת אח"},
        headers=as_manager.headers,
    )
    assert adjusted.status_code == 201
    assert adjusted.json()["amount_agorot"] == -2_000
    assert adjusted.json()["id"] != charge_id


def test_an_adjustment_of_zero_is_refused(client, as_manager, an_open_charge):
    """`ChargeAdjustmentIn._never_zero` already refuses it; this asserts the router surfaces
    422 rather than 500. Zero records nothing while looking like a correction."""
    response = client.post(
        f"/api/v1/charges/{an_open_charge}/adjust",
        json={"amount_agorot": 0, "reason": "טעות"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_a_manual_tuition_charge_is_refused(client, as_manager, a_priced_student):
    """`ManualChargeIn.kind` excludes `tuition` -- a hand-made tuition charge is how a month
    ends up billed twice, beside a run that believes it did its job."""
    response = client.post(
        "/api/v1/charges",
        json={
            "payer_person_id": str(a_priced_student.payer_person_id),
            "kind": "tuition",
            "amount_agorot": 25_000,
            "due_date": "2026-11-30",
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_writing_off_a_charge_does_not_delete_it(client, as_manager, an_open_charge):
    """§11.4 -- Israeli tax law requires roughly seven years of financial records, so a
    write-off is a status a human chose, never a DELETE."""
    response = client.post(
        f"/api/v1/charges/{an_open_charge}/close",
        json={"status": "written_off", "reason": "משפחה עזבה"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "written_off"
    still_there = client.get(f"/api/v1/charges/{an_open_charge}", headers=as_manager.headers)
    assert still_there.status_code == 200


def test_closing_a_charge_needs_a_reason(client, as_manager, an_open_charge):
    """'Why' is the only thing that makes a write-off auditable a year later, when the
    family asks why their September is gone."""
    response = client.post(
        f"/api/v1/charges/{an_open_charge}/close",
        json={"status": "written_off", "reason": "  "},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_a_written_off_charge_leaves_the_payer_s_balance(
    client, as_manager, a_priced_student, an_open_charge
):
    """A debt a manager decided not to pursue is not money the family owes. Leaving it in
    `charged` makes every collection figure in the club permanently overstated."""
    before = client.get(
        f"/api/v1/payers/{a_priced_student.payer_person_id}/balance", headers=as_manager.headers
    ).json()
    assert before["balance_agorot"] == MONTHLY_AGOROT
    client.post(
        f"/api/v1/charges/{an_open_charge}/close",
        json={"status": "written_off", "reason": "משפחה עזבה"},
        headers=as_manager.headers,
    )
    after = client.get(
        f"/api/v1/payers/{a_priced_student.payer_person_id}/balance", headers=as_manager.headers
    ).json()
    assert after["balance_agorot"] == 0
    assert after["open_charge_count"] == 0


def test_the_payer_balance_reports_what_is_owed(
    client, as_manager, a_priced_student, an_open_charge
):
    """`12f`'s summary card and `3e`'s household row read this. Negative is a family in
    credit, which `MoneyDisplay` wraps in `<bdi>` so it reads as a credit in a right-to-left
    sentence rather than as a debt."""
    response = client.get(
        f"/api/v1/payers/{a_priced_student.payer_person_id}/balance",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["charged_agorot"] == MONTHLY_AGOROT
    assert body["paid_agorot"] == 0
    assert body["balance_agorot"] == MONTHLY_AGOROT
    assert body["open_charge_count"] == 1


def test_a_manager_runs_the_month_and_a_rerun_creates_nothing(
    client, as_manager, a_priced_student, an_enrolled_student
):
    """§7's `POST /billing-runs`, and the endpoint the dev bar's runJob tool points at.
    `billing.run.idempotentHint` is this rule written on the button."""
    body = {"period_year": 2026, "period_month": 11}
    first = client.post("/api/v1/billing-runs", json=body, headers=as_manager.headers)
    assert first.status_code == 201
    assert first.json()["charges_created"] == 2  # tuition plus the once-ever registration fee
    second = client.post("/api/v1/billing-runs", json=body, headers=as_manager.headers)
    assert second.status_code == 201
    assert second.json()["charges_created"] == 0


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_cannot_run_the_month(client, request, caller):
    """The most consequential button in the product. §3.2 gives it to owners and managers."""
    signed_in = request.getfixturevalue(caller)
    response = client.post(
        "/api/v1/billing-runs",
        json={"period_year": 2026, "period_month": 11},
        headers=signed_in.headers,
    )
    assert response.status_code == 403


def test_closing_a_price_plan_opens_its_successor(client, as_manager, a_price_plan):
    """§5.10 -- versioned, never edited in place. The endpoint `5a`'s
    `plan.closeCurrent` button calls."""
    response = client.post(
        f"/api/v1/price-plans/{a_price_plan}/close",
        json={"closes_on": "2026-12-31", "replacement_amount_agorot": 32_000},
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    assert response.json()["monthly_amount_agorot"] == 32_000
    assert response.json()["active_from"] == "2027-01-01"

    plans = client.get("/api/v1/price-plans", headers=as_manager.headers).json()["items"]
    assert len(plans) == 2
    assert [plan["active_to"] for plan in plans] == [None, "2026-12-31"]


def test_a_product_is_deactivated_and_never_deleted(client, as_manager):
    """§5.10's catalogue: no stock counts, and no delete either -- a charge raised for an
    item the club stopped selling still has to render its name."""
    created = client.post(
        "/api/v1/products",
        json={"name": "גי מידה 140", "price_agorot": 18_000},
        headers=as_manager.headers,
    )
    assert created.status_code == 201
    product_id = created.json()["id"]
    patched = client.patch(
        f"/api/v1/products/{product_id}",
        json={"is_active": False},
        headers=as_manager.headers,
    )
    assert patched.status_code == 200
    assert patched.json()["is_active"] is False
    listed = client.get("/api/v1/products", headers=as_manager.headers).json()["items"]
    assert listed == []
    with_inactive = client.get(
        "/api/v1/products", params={"include_inactive": True}, headers=as_manager.headers
    ).json()["items"]
    assert [row["id"] for row in with_inactive] == [product_id]


def test_the_billing_settings_round_trip(client, as_manager):
    """§5.10's three studio-level settings, on this lane's own router.

    They live in the JSONB `settings` column under a `billing` key rather than in new
    columns, which is what kept M1.9 out of `alembic/versions/**` -- a directory `main` owns
    and a lane never touches. `1b` renders the standing-order link and the cash instructions.
    """
    patched = client.patch(
        "/api/v1/billing/settings",
        json={"cash_instructions": "שלמו למאמן בתחילת החודש", "run_day": 1},
        headers=as_manager.headers,
    )
    assert patched.status_code == 200
    read = client.get("/api/v1/billing/settings", headers=as_manager.headers).json()
    assert read["cash_instructions"] == "שלמו למאמן בתחילת החודש"
    assert read["run_day"] == 1
    # Payment-routes spec §13 -- no studio-level fallback link. One link is a link at ONE
    # amount, which is the bug the per-plan column exists to avoid.
    assert "standing_order_link" not in read


def test_the_run_day_is_a_day_of_the_month(client, as_manager):
    """A run day of 0 or 32 is a job that never fires, discovered a month later when
    nobody was billed."""
    response = client.patch(
        "/api/v1/billing/settings", json={"run_day": 32}, headers=as_manager.headers
    )
    assert response.status_code == 422


# -- staff `11a`: a coach hands an item over ----------------------------------
@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_hands_an_item_over_and_never_sees_a_price(
    client, request, caller, as_manager, a_priced_student
):
    """§5.10's `11a`, and invariant 3 as a DESIGN constraint rather than a router tag.

    The coach names the item and the child. The price comes from `product.price_agorot`
    server-side, the payer from the primary guardian, and neither is echoed back -- the
    response says THAT a charge was created, never for how much.
    """
    signed_in = request.getfixturevalue(caller)
    product = client.post(
        "/api/v1/products",
        json={"name": "גי מידה 140", "price_agorot": 18_000},
        headers=as_manager.headers,
    ).json()

    options = client.get("/api/v1/products/handout-options", headers=signed_in.headers)
    assert options.status_code == 200
    assert options.json()["items"] == [{"id": product["id"], "name": "גי מידה 140"}]

    handed = client.post(
        "/api/v1/charges/from-product",
        json={"product_id": product["id"], "student_id": str(a_priced_student.student_id)},
        headers=signed_in.headers,
    )
    assert handed.status_code == 201
    body = handed.json()
    assert body["product_name"] == "גי מידה 140"
    # The whole point: no money field anywhere in the response.
    assert "price_agorot" not in body
    assert "amount_agorot" not in body


def test_the_hand_over_charge_is_owed_by_the_primary_guardian(
    client, as_lead_coach, as_manager, a_priced_student
):
    """§4.3 -- captured at creation. The coach never names a payer and could not."""
    product = client.post(
        "/api/v1/products",
        json={"name": "חגורה", "price_agorot": 6_000},
        headers=as_manager.headers,
    ).json()
    handed = client.post(
        "/api/v1/charges/from-product",
        json={"product_id": product["id"], "student_id": str(a_priced_student.student_id)},
        headers=as_lead_coach.headers,
    ).json()
    charge = client.get(f"/api/v1/charges/{handed['charge_id']}", headers=as_manager.headers).json()
    assert charge["payer_person_id"] == str(a_priced_student.payer_person_id)
    assert charge["amount_agorot"] == 6_000
    assert charge["kind"] == "manual"


def test_handing_out_a_discontinued_item_is_refused(
    client, as_lead_coach, as_manager, a_priced_student
):
    """A charge at a price nobody currently offers is a dispute waiting to happen."""
    product = client.post(
        "/api/v1/products",
        json={"name": "ישן", "price_agorot": 1_000},
        headers=as_manager.headers,
    ).json()
    client.patch(
        f"/api/v1/products/{product['id']}",
        json={"is_active": False},
        headers=as_manager.headers,
    )
    response = client.post(
        "/api/v1/charges/from-product",
        json={"product_id": product["id"], "student_id": str(a_priced_student.student_id)},
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 422


def test_the_handout_options_carry_no_money_field(client, as_lead_coach, as_manager):
    """The shape's absence is the guarantee. Invariant 3 inspects it because the route is
    coach-tagged; this asserts the same rule from the client's side."""
    client.post(
        "/api/v1/products",
        json={"name": "כפפות", "price_agorot": 4_000},
        headers=as_manager.headers,
    )
    items = client.get("/api/v1/products/handout-options", headers=as_lead_coach.headers).json()[
        "items"
    ]
    assert items
    for item in items:
        assert set(item) == {"id", "name"}


def test_a_manager_lists_payment_orders_by_status(
    client, tenant_session, studio, as_manager, a_priced_student, three_open_months
):
    """§5.10's manager alert counts `amount_mismatch` orders and stale `pending` ones, and
    nothing could ask for either: §7 exposed `POST /payment-orders` and
    `GET /payment-orders/{public_ref}` and no way to find out which orders exist.

    So `DebtAlert` shipped with `amountMismatches` and `staleOrders` props that nothing
    could fill — the component, the copy and the slot registration all real, and the
    high-priority alert §5.10 requires unable to be raised.

    The order is created through the service rather than the route because the route takes
    its payer from the session: a manager cannot open an order over somebody else's
    charges, which is `test_an_order_over_someone_else_s_charge_is_refused` and correct.
    """
    from app.services.billing.orders import OrderService
    from tests.billing.conftest import T0

    order = OrderService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    tenant_session.commit()

    listed = client.get(
        "/api/v1/payment-orders",
        params={"status": "pending"},
        headers=as_manager.headers,
    )
    assert listed.status_code == 200, listed.text
    assert str(order.public_ref) in [row["public_ref"] for row in listed.json()["items"]]

    # A status nothing is in returns an empty page, not everything — the filter is the
    # whole point, since the alert asks "how many are wrong" and not "how many exist".
    empty = client.get(
        "/api/v1/payment-orders",
        params={"status": "amount_mismatch"},
        headers=as_manager.headers,
    )
    assert empty.status_code == 200
    assert empty.json()["items"] == []


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_cannot_list_payment_orders(client, request, caller):
    """§3.2 — a coach has no financial read at all, and invariant 3 enforces it against the
    router tag. Asserted here from the client's side as well."""
    who = request.getfixturevalue(caller)
    response = client.get("/api/v1/payment-orders", headers=who.headers)
    assert response.status_code == 403


# -- §5.10's covered-elsewhere explanation ------------------------------------
#
# The double-payment GUARD has always held: `OrderService.create` refuses a charge already
# inside a holding order, and `selectable_charges` omits it. What the read shape could not
# say was WHY. A parent whose September charge sits in an order they opened on another
# device saw the row, tapped it, and got a generic error — the refusal was correct and
# unexplained. `is_covered_elsewhere` is that explanation, and it is computed from exactly
# the predicate the refusal uses, so the screen and the server cannot drift apart.


def test_a_charge_inside_an_open_order_reads_as_covered_elsewhere(
    client, as_manager, an_open_charge, an_order
):
    response = client.get(
        "/api/v1/charges",
        params={"payer_person_id": str(an_order.order.payer_person_id)},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    covered = {row["id"]: row["is_covered_elsewhere"] for row in response.json()["items"]}
    assert covered[str(an_open_charge)] is True


def test_a_charge_in_no_order_reads_as_not_covered(
    client, as_manager, an_open_charge, a_priced_student
):
    """The default has to be False rather than absent. A client reading an optional field
    would render "covered elsewhere" for every charge on a server that never sets it."""
    response = client.get(
        "/api/v1/charges",
        params={"payer_person_id": str(a_priced_student.payer_person_id)},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["is_covered_elsewhere"] is False


def test_an_expired_order_releases_the_explanation_with_the_claim(
    client, as_manager, an_open_charge, an_order, tenant_session
):
    """§5.10 — an expired order releases its charges. The flag has to follow, or the row
    stays greyed out for ever with an explanation that is no longer true."""
    from app.models.billing import PaymentOrder

    order = tenant_session.get(PaymentOrder, an_order.order.id)
    assert order is not None
    order.status = "expired"
    tenant_session.commit()

    response = client.get(
        "/api/v1/charges",
        params={"payer_person_id": str(an_order.order.payer_person_id)},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    covered = {row["id"]: row["is_covered_elsewhere"] for row in response.json()["items"]}
    assert covered[str(an_open_charge)] is False


def test_a_payer_reads_the_same_flag_on_their_own_charges(
    client, as_guardian_of, a_priced_student, an_open_charge, an_order
):
    """`/me/charges` is the route `12f` actually calls. The manager route agreeing and the
    parent route not would put the explanation everywhere except the screen it is for."""
    parent = as_guardian_of(a_priced_student.student_id)
    response = client.get("/api/v1/me/charges", headers=parent.headers)
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert rows == [] or all("is_covered_elsewhere" in row for row in rows)
