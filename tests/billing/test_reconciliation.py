"""§5.10's הוראת קבע reconciliation. G8 in practice.

uPay's recurring IPNs are structurally identical to one-time ones (`constantpayment=0`,
`numberpayments=1` regardless of a 12-month plan) and carry no customer identifier. That is
a confirmed provider limitation, not a design choice, so this module never guesses -- it
suggests, and a human confirms.

**A wrong automatic match marks the wrong payer paid and sends the wrong parent a debt
reminder -- an expensive bug in a small community.** Every test here exists to keep that
impossible.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.billing import Charge, PayerFingerprint, Payment, UpayIpnRecord
from app.services.billing import BillingService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.reconciliation import (
    ReconciliationService,
    normalize_card_owner_name,
)
from sqlalchemy import func, select
from tests.billing.conftest import MONTHLY_AGOROT, T0


class TestNormalisation:
    """The fingerprint's other half, and what makes month 3 mostly one-tap."""

    def test_case_and_surrounding_space_are_removed(self):
        assert normalize_card_owner_name("  ישראל ישראלי ") == normalize_card_owner_name(
            "ישראל ישראלי"
        )

    def test_internal_runs_of_space_collapse(self):
        assert normalize_card_owner_name("ישראל   ישראלי") == normalize_card_owner_name(
            "ישראל ישראלי"
        )

    def test_latin_case_folds(self):
        assert normalize_card_owner_name("YISRAEL COHEN") == normalize_card_owner_name(
            "Yisrael Cohen"
        )

    def test_two_different_people_do_not_collide(self):
        """The failure that matters. A normalisation aggressive enough to merge two real
        names would suggest the wrong payer with high confidence -- which is exactly the
        expensive bug §5.10 step 5 is about."""
        assert normalize_card_owner_name("ישראל ישראלי") != normalize_card_owner_name(
            "ישראלה ישראלי"
        )
        assert normalize_card_owner_name("דנה כהן") != normalize_card_owner_name("דן כהן")


def test_confirming_a_match_creates_a_standing_order_payment_allocated_oldest_first(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    an_unmatched_ipn,
    a_confirming_manager,
):
    """§5.10 step 3, verbatim: 'creates a payment with method = standing_order, allocates it
    to that payer's open charges oldest-first, and writes a payer_fingerprint.'"""
    payment = ReconciliationService(tenant_session).confirm_match(
        an_unmatched_ipn.id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    assert payment.method == "standing_order"
    assert payment.amount_agorot == MONTHLY_AGOROT
    assert tenant_session.get(Charge, three_open_months[0]).status == "settled"
    assert tenant_session.get(Charge, three_open_months[1]).status == "open"


def test_confirming_a_match_writes_a_fingerprint(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    an_unmatched_ipn,
    a_confirming_manager,
):
    """§5.10 step 3's third clause, and the whole reason month 3 is faster than month 1."""
    ReconciliationService(tenant_session).confirm_match(
        an_unmatched_ipn.id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    fingerprint = tenant_session.execute(select(PayerFingerprint)).scalars().one()
    assert fingerprint.payer_person_id == a_priced_student.payer_person_id
    assert fingerprint.four_digits == "4242"
    assert fingerprint.confirmed_by_person_id is not None
    assert fingerprint.confidence == 1


def test_a_second_confirmation_raises_confidence_and_does_not_duplicate(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    two_unmatched_ipns,
    a_confirming_manager,
):
    """`uq_payer_fingerprint_identity` is unique on (studio, four_digits, name). Month 2's
    confirmation is the SAME card, so it updates `last_seen` and `confidence` rather than
    inserting a second row -- which would split the evidence into two rows at confidence 1
    instead of one at 2, exactly backwards from what the confidence is for."""
    service = ReconciliationService(tenant_session)
    for record in two_unmatched_ipns:
        service.confirm_match(
            record.id,
            payer_person_id=a_priced_student.payer_person_id,
            confirmed_by_person_id=a_confirming_manager,
            at=T0,
        )
    assert (
        tenant_session.execute(select(func.count()).select_from(PayerFingerprint)).scalar_one() == 1
    )
    assert tenant_session.execute(select(PayerFingerprint)).scalars().one().confidence == 2


def test_next_month_the_same_card_is_offered_as_a_suggestion(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    two_unmatched_ipns,
    a_confirming_manager,
):
    """§5.10 step 4 -- 'arriving IPNs are pre-matched against fingerprints and presented as
    suggestions with a confidence indicator. The manager confirms with one tap.'"""
    service = ReconciliationService(tenant_session)
    service.confirm_match(
        two_unmatched_ipns[0].id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    suggestions = service.suggestions(studio.id)
    assert len(suggestions) == 1
    assert suggestions[0].ipn_id == two_unmatched_ipns[1].id
    assert suggestions[0].payer_person_id == a_priced_student.payer_person_id
    assert suggestions[0].confidence > 0
    assert suggestions[0].amount_agorot == MONTHLY_AGOROT


def test_a_suggestion_is_never_applied_without_a_human(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    two_unmatched_ipns,
    a_confirming_manager,
):
    """§5.10 step 5, and the most important assertion in this file.

    Computing a suggestion must have NO side effect on the ledger -- not a payment, not an
    allocation, not a changed charge status, not even a `match_status`. The manager's tap is
    the only thing that moves money.
    """
    service = ReconciliationService(tenant_session)
    service.confirm_match(
        two_unmatched_ipns[0].id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    before = len(tenant_session.execute(select(Payment)).scalars().all())
    service.suggestions(studio.id)
    service.suggestions(studio.id)
    assert len(tenant_session.execute(select(Payment)).scalars().all()) == before
    assert tenant_session.get(Charge, three_open_months[1]).status == "open"
    assert tenant_session.get(UpayIpnRecord, two_unmatched_ipns[1].id).match_status == "unmatched"


def test_a_suggestion_needs_both_halves_of_the_fingerprint(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    two_unmatched_ipns,
    a_confirming_manager,
):
    """(name, last 4) -- both. A record carrying only one half matches nothing, because half
    a fingerprint is the sort of near-match that produces a confident wrong answer."""
    service = ReconciliationService(tenant_session)
    service.confirm_match(
        two_unmatched_ipns[0].id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    second = tenant_session.get(UpayIpnRecord, two_unmatched_ipns[1].id)
    second.four_digits = "9999"
    tenant_session.flush()
    assert service.suggestions(studio.id) == []


def test_confirming_a_match_requires_a_person_who_confirmed_it(
    tenant_session, studio, a_priced_student, an_unmatched_ipn, a_confirming_manager
):
    """`confirmed_by_person_id` is how the row records that a human made the call. A match
    with nobody behind it is an automatic match with extra steps."""
    with pytest.raises(RefusedError):
        ReconciliationService(tenant_session).confirm_match(
            an_unmatched_ipn.id,
            payer_person_id=a_priced_student.payer_person_id,
            confirmed_by_person_id=None,
            at=T0,
        )


def test_an_already_matched_ipn_cannot_be_matched_again(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    an_unmatched_ipn,
    a_confirming_manager,
):
    """Two matches would create two payments for one arrival of money."""
    service = ReconciliationService(tenant_session)
    service.confirm_match(
        an_unmatched_ipn.id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    with pytest.raises(ConflictError):
        service.confirm_match(
            an_unmatched_ipn.id,
            payer_person_id=a_priced_student.payer_person_id,
            confirmed_by_person_id=a_confirming_manager,
            at=T0,
        )


def test_ignoring_an_ipn_leaves_it_readable_and_creates_no_payment(
    tenant_session, studio, an_unmatched_ipn, a_confirming_manager
):
    """`ignored` is a manager saying 'this is not ours' -- a test charge, a refund, a payment
    to a different business on the same account. The bytes stay: it is a judgement about
    what a record means, never a reason to stop keeping it."""
    ReconciliationService(tenant_session).ignore(an_unmatched_ipn.id)
    assert tenant_session.get(UpayIpnRecord, an_unmatched_ipn.id).match_status == "ignored"
    assert tenant_session.execute(select(Payment)).scalars().all() == []
    assert tenant_session.get(UpayIpnRecord, an_unmatched_ipn.id).raw_query


def test_an_unmatched_ipn_that_does_not_exist_is_not_found(tenant_session, studio):
    with pytest.raises(NotFoundError):
        ReconciliationService(tenant_session).ignore(uuid.uuid4())


def test_the_queue_lists_only_unmatched_records(
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    two_unmatched_ipns,
    a_confirming_manager,
):
    """`3e`'s left-hand column. A matched record has left the queue by definition."""
    service = ReconciliationService(tenant_session)
    rows, _cursor = service.unmatched(studio.id)
    assert len(rows) == 2
    service.confirm_match(
        two_unmatched_ipns[0].id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    rows, _cursor = service.unmatched(studio.id)
    assert [row.id for row in rows] == [two_unmatched_ipns[1].id]


def test_the_expected_column_lists_payers_with_an_active_subscription(
    tenant_session, studio, a_priced_student, a_confirming_manager
):
    """§5.10 -- `recurring_subscription` 'drives the "expected to pay this month" column in
    the reconciliation queue and the double-payment warning, and nothing else.'"""
    service = ReconciliationService(tenant_session)
    service.record_subscription(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT,
        start_date=date(2026, 9, 1),
    )
    expected = service.expected_payers(studio.id)
    assert [row.payer_person_id for row in expected] == [a_priced_student.payer_person_id]


def test_a_payer_has_at_most_one_active_subscription(tenant_session, studio, a_priced_student):
    """`uq_recurring_subscription_active_payer` is partial on `status = 'active'`. Two would
    make 'expected this month' ambiguous for the one family it matters for."""
    service = ReconciliationService(tenant_session)
    service.record_subscription(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT,
        start_date=date(2026, 9, 1),
    )
    with pytest.raises(ConflictError):
        service.record_subscription(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            amount_agorot=MONTHLY_AGOROT,
            start_date=date(2026, 10, 1),
        )


def test_cancelling_frees_the_payer_for_a_new_subscription(
    tenant_session, studio, a_priced_student, a_confirming_manager
):
    """A family who stops and later restarts. The cancelled row stays as history -- it is
    what explains why last March's reconciliation expected them."""
    service = ReconciliationService(tenant_session)
    first = service.record_subscription(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT,
        start_date=date(2026, 9, 1),
    )
    service.cancel_subscription(first.id, at=T0)
    second = service.record_subscription(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT,
        start_date=date(2027, 1, 1),
    )
    assert second.id != first.id
    assert first.status == "cancelled" and first.cancelled_at is not None


def test_a_subscription_is_never_created_by_a_parent_and_carries_no_provider_reference(
    tenant_session, studio, a_priced_student, a_confirming_manager
):
    """G8, asserted against the table itself.

    uPay cannot create a per-payer mandate, so there is deliberately no external reference,
    no token and no provider id here -- there is nothing to store. If a column like that
    ever appears, somebody has started building the mandate creator §12 says cannot exist.
    """
    from app.models.billing import RecurringSubscription

    columns = set(RecurringSubscription.__table__.c.keys())
    assert not columns & {
        "external_ref",
        "provider_id",
        "mandate_id",
        "token",
        "upay_reference",
    }


def test_a_matched_payment_settles_the_oldest_debt_and_leaves_a_surplus(
    tenant_session, studio, a_priced_student, an_open_charge, an_unmatched_ipn, a_confirming_manager
):
    """§5.10's overpayment through the reconciliation path: a הוראת קבע payment larger than
    the family's outstanding debt settles what it can and leaves the rest for a manager to
    carry forward."""
    from app.services.billing.payments import PaymentService

    record = tenant_session.get(UpayIpnRecord, an_unmatched_ipn.id)
    record.amount = "400"
    tenant_session.flush()
    payment = ReconciliationService(tenant_session).confirm_match(
        record.id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=a_confirming_manager,
        at=T0,
    )
    assert BillingService(tenant_session).allocated_agorot(an_open_charge) == MONTHLY_AGOROT
    assert PaymentService(tenant_session).unallocated_agorot(payment.id) == 40_000 - MONTHLY_AGOROT


# -- through the API ----------------------------------------------------------
def test_the_queue_and_a_one_tap_confirmation(
    client,
    as_manager,
    tenant_session,
    studio,
    a_priced_student,
    three_open_months,
    an_unmatched_ipn,
):
    """§5.10's whole reconciliation loop, end to end: the queue, the human's tap, and the
    fingerprint that makes next month one tap instead of a search."""
    queue = client.get("/api/v1/reconciliation/unmatched", headers=as_manager.headers)
    assert queue.status_code == 200
    items = queue.json()["items"]
    assert len(items) == 1
    # §11.7 -- these ARE shown here. They are data on a manager-only screen, and matching an
    # unmatched הוראת קבע payment is impossible without them.
    assert items[0]["card_owner_name"] == "ישראל ישראלי"
    assert items[0]["four_digits"] == "4242"
    # The raw string and our parse, side by side: the only way a mismatch is legible.
    assert items[0]["amount"] == "250"
    assert items[0]["amount_agorot"] == MONTHLY_AGOROT

    matched = client.post(
        "/api/v1/reconciliation/match",
        params={
            "ipn_id": str(an_unmatched_ipn.id),
            "payer_person_id": str(a_priced_student.payer_person_id),
        },
        json={"match_status": "manual"},
        headers=as_manager.headers,
    )
    assert matched.status_code == 200
    assert matched.json()["match_status"] == "manual"
    tenant_session.expire_all()
    assert tenant_session.get(Charge, three_open_months[0]).status == "settled"


def test_the_suggestions_endpoint_says_a_human_confirms(client, as_manager):
    """`billing.reconciliation.neverAuto` is on the screen; this is the flag the screen
    renders it from. §5.10 step 5 is a product promise, not a comment."""
    response = client.get("/api/v1/reconciliation/suggestions", headers=as_manager.headers)
    assert response.status_code == 200
    assert response.json()["never_auto"] is True


def test_there_is_no_auto_match_status_a_client_can_send(client, as_manager, an_unmatched_ipn):
    """`IpnMatchIn.match_status` is Literal['manual', 'ignored']. The schema is where §5.10
    step 5 is enforced: `auto` is what the IPN path writes for a REFERENCED order, and no
    client may claim it."""
    response = client.post(
        "/api/v1/reconciliation/match",
        params={"ipn_id": str(an_unmatched_ipn.id), "payer_person_id": str(uuid.uuid4())},
        json={"match_status": "auto"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_reaches_no_part_of_reconciliation(client, request, caller):
    """§3.2 and invariant 3. The reconciliation screen shows card owner names, last four
    digits and every family's debt -- it is the most financial screen in the product."""
    signed_in = request.getfixturevalue(caller)
    for path in (
        "/api/v1/reconciliation/unmatched",
        "/api/v1/reconciliation/suggestions",
        "/api/v1/recurring-subscriptions",
    ):
        assert client.get(path, headers=signed_in.headers).status_code == 403


def test_a_manager_records_and_cancels_a_subscription(client, as_manager, a_priced_student):
    """G8 -- the manager's own note of who is on the shared link. The parent never sets it,
    and nothing here creates a mandate, because uPay cannot."""
    created = client.post(
        "/api/v1/recurring-subscriptions",
        json={
            "payer_person_id": str(a_priced_student.payer_person_id),
            "amount_agorot": MONTHLY_AGOROT,
            "start_date": "2026-09-01",
        },
        headers=as_manager.headers,
    )
    assert created.status_code == 201
    assert created.json()["status"] == "active"
    cancelled = client.post(
        f"/api/v1/recurring-subscriptions/{created.json()['id']}/cancel",
        headers=as_manager.headers,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["cancelled_at"] is not None


def test_a_second_active_subscription_is_refused_through_the_api(
    client, as_manager, a_priced_student
):
    body = {
        "payer_person_id": str(a_priced_student.payer_person_id),
        "amount_agorot": MONTHLY_AGOROT,
        "start_date": "2026-09-01",
    }
    assert (
        client.post(
            "/api/v1/recurring-subscriptions", json=body, headers=as_manager.headers
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/recurring-subscriptions", json=body, headers=as_manager.headers
        ).status_code
        == 409
    )


def test_a_manual_match_without_a_payer_is_refused(client, as_manager, an_unmatched_ipn):
    """§5.10 step 3 creates the payment, so there is nobody to create it for without a
    payer. Refused rather than defaulted -- a default here would pick a family."""
    response = client.post(
        "/api/v1/reconciliation/match",
        params={"ipn_id": str(an_unmatched_ipn.id)},
        json={"match_status": "manual"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_ignoring_needs_no_payer(client, as_manager, an_unmatched_ipn):
    """'This is not ours' names nobody, by definition."""
    response = client.post(
        "/api/v1/reconciliation/match",
        params={"ipn_id": str(an_unmatched_ipn.id)},
        json={"match_status": "ignored"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert response.json()["match_status"] == "ignored"
