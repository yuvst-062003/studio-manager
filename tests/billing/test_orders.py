"""§5.10's uPay one-time flow, up to the moment the parent leaves our origin.

`public_ref` is a UUIDv4 and it is the credential: the IPN endpoint is unauthenticated by
necessity, because uPay calls it, so a sequential id here would let anyone mark any family's
tuition paid by guessing.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from app.models.person import Person
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.orders import OrderService
from tests.billing.conftest import MONTHLY_AGOROT, T0


def test_an_order_prices_itself_from_the_server_side_charges(
    tenant_session, studio, a_priced_student, three_open_months
):
    """`PaymentOrderCreateIn` carries no expected amount on purpose: §5.10 compares the IPN
    against a server-side sum, and a client-supplied expected amount would be the thing it
    is compared to."""
    order = OrderService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=list(three_open_months),
        max_payments=3,
        at=T0,
    )
    assert order.expected_amount_agorot == MONTHLY_AGOROT * 3
    assert order.status == "pending"


def test_the_public_ref_is_a_random_uuid4_and_not_a_sequence(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's first threat row. Two orders created back to back must share no structure an
    attacker could walk."""
    service = OrderService(tenant_session)
    first = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    second = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[1]],
        max_payments=1,
        at=T0,
    )
    assert first.public_ref.version == 4
    assert second.public_ref.version == 4
    assert first.public_ref != second.public_ref


def test_a_charge_covered_by_an_open_order_is_not_selectable_again(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's PRIMARY double-payment guard, and the one that works no matter which route
    the parent uses: 'A charge already covered by an open or paid payment_order is not
    selectable in the credit-card option.'"""
    service = OrderService(tenant_session)
    service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    selectable = service.selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert three_open_months[0] not in [row.id for row in selectable]
    with pytest.raises(ConflictError):
        service.create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[three_open_months[0]],
            max_payments=1,
            at=T0,
        )


def test_an_amount_mismatch_keeps_its_claim_on_the_charges(
    tenant_session, studio, a_priced_student, three_open_months
):
    """Real money arrived against that order. Offering the same charges for a second card
    payment before a human has looked would invite the family to pay twice for one month --
    which is the outcome the whole double-payment section exists to prevent."""
    service = OrderService(tenant_session)
    order = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    order.status = "amount_mismatch"
    tenant_session.flush()
    selectable = service.selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert three_open_months[0] not in [row.id for row in selectable]


def test_an_expired_order_releases_its_charges(
    tenant_session, studio, a_priced_student, three_open_months
):
    """The guard above must not become a permanent lock. A parent who opened uPay and closed
    the tab would otherwise never be able to pay that month again."""
    service = OrderService(tenant_session)
    service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    service.expire_stale(studio.id, at=T0 + timedelta(hours=25))
    selectable = service.selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert three_open_months[0] in [row.id for row in selectable]


def test_a_fresh_order_is_not_expired(tenant_session, studio, a_priced_student, three_open_months):
    """uPay's IPN is delayed [VERIFIED] and the ~5 minutes is approximate. Sweeping early
    would expire an order the parent is halfway through paying."""
    service = OrderService(tenant_session)
    service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    assert service.expire_stale(studio.id, at=T0 + timedelta(hours=2)) == []


def test_selectable_charges_span_every_child_this_person_pays_for(
    tenant_session, studio, a_two_child_family
):
    """§5.10 -- 'selects the N oldest unpaid tuition charges ACROSS EVERY STUDENT this
    person is the payer for, creates ONE payment_order covering all of them.' A family with
    two children pays once, not twice."""
    selectable = OrderService(tenant_session).selectable_charges(
        studio.id, payer_person_id=a_two_child_family.payer_person_id
    )
    assert {row.student_id for row in selectable} == set(a_two_child_family.student_ids)


def test_selectable_charges_are_oldest_first(
    tenant_session, studio, a_priced_student, three_open_months
):
    """`billing.card.oldestFirst` states this on the screen, and `1b`'s spec finding 5 notes
    the key exists while the artboard never says it. The order IS the product rule."""
    selectable = OrderService(tenant_session).selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert [row.id for row in selectable] == list(three_open_months)


def test_selectable_charges_exclude_credits(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """A credit is a negative charge. There is nothing to pay on one, and offering it would
    let a parent open an order for a negative total."""
    from datetime import date

    from app.services.billing import BillingService

    BillingService(tenant_session).create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        -4_000,
        date(2026, 9, 30),
        student_id=a_priced_student.student_id,
    )
    selectable = OrderService(tenant_session).selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert [row.id for row in selectable] == [an_open_charge]


def test_an_order_over_someone_else_s_charge_is_refused(
    tenant_session, studio, a_two_child_family, three_open_months
):
    """A parent may pay only what they owe. `charge_ids` arrives from the client, so this is
    the check that stops one family opening an order over another family's debt -- which
    would settle it on payment and leave the real payer's month reading paid."""
    with pytest.raises(NotFoundError):
        OrderService(tenant_session).create(
            studio.id,
            payer_person_id=a_two_child_family.payer_person_id,
            charge_ids=[three_open_months[0]],
            max_payments=1,
            at=T0,
        )


def test_an_order_with_no_charges_is_refused(tenant_session, studio, a_priced_student):
    """`PaymentOrderCreateIn.charge_ids` has `min_length=1`, and
    `payment_order_amount_positive` is a CHECK. An order for nothing would open uPay for
    zero shekels."""
    with pytest.raises(RefusedError):
        OrderService(tenant_session).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[],
            max_payments=1,
            at=T0,
        )


def test_installments_above_the_account_s_cap_are_refused(
    tenant_session, studio, a_priced_student, three_open_months
):
    """Round two A1: the merchant dashboard's dropdown stops at 12, and behaviour above it
    was never tested against this account. `payment_order_max_payments` is the CHECK and
    `MAX_INSTALLMENTS` is the same number in form.py -- both, so neither can drift alone."""
    with pytest.raises(RefusedError):
        OrderService(tenant_session).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=list(three_open_months),
            max_payments=24,
            at=T0,
        )


def test_an_unknown_public_ref_is_not_found(tenant_session, studio):
    """The `payments` skill states it as a rule: 'A callback for an unknown reference is
    logged and rejected, not auto-created.'"""
    with pytest.raises(NotFoundError):
        OrderService(tenant_session).get_by_public_ref(uuid.uuid4())


def test_an_active_subscription_is_reported_and_never_blocks(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's second double-payment protection: 'a warning, not a block -- the parent
    decides.' A family who set up a mandate and then wants to clear a one-off must still
    have a route, so the order must still be creatable while the flag is true."""
    from datetime import date

    from app.models.billing import RecurringSubscription

    service = OrderService(tenant_session)
    assert service.has_active_subscription(a_priced_student.payer_person_id) is False
    tenant_session.add(
        RecurringSubscription(
            studio_id=studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            amount_agorot=MONTHLY_AGOROT,
            start_date=date(2026, 9, 1),
            status="active",
        )
    )
    tenant_session.flush()
    assert service.has_active_subscription(a_priced_student.payer_person_id) is True
    order = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    assert order.status == "pending"


# -- paying months forward by card (owner request, 2026-08-30) -----------------
#
# "when want to pay with card should have an option to choose number of month; there is
# only one available. user can pay with card 3 month ahead and the payment will be
# nummonth * payment options."
#
# The chips were capped at the number of months the family HAPPENED to owe, so a family in
# good standing was offered `[1]` and a family who had just been billed once was offered
# `[1]` — there was no way to hand the club a term up front by card at all, while cash and
# cheques had been able to since the prepayment wave. This is that route, on the card, and
# it reuses the ledger shape prepayment already has rather than inventing a second one: the
# order is priced above its charges, and the surplus the payment does not allocate IS the
# credit the billing run spends.


def test_an_order_can_buy_months_that_have_no_charge_yet(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """One open month plus two bought forward, priced at the payer's own monthly total.

    Integer arithmetic on two integers the server holds (G2) — the client never sends an
    amount, exactly as `PaymentOrderCreateIn`'s docstring requires.
    """
    order = OrderService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[an_open_charge],
        max_payments=1,
        prepay_months=2,
        at=T0,
    )
    assert order.expected_amount_agorot == MONTHLY_AGOROT * 3
    assert order.prepay_months == 2


def test_a_family_who_owes_nothing_can_still_pay_a_term_up_front(
    tenant_session, studio, a_priced_student
):
    """**The state the whole request is about.** A family in good standing has no open
    charge, so the old `charge_ids` minimum of one refused them outright — the card route
    was reachable only by families already in arrears."""
    order = OrderService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[],
        max_payments=1,
        prepay_months=3,
        at=T0,
    )
    assert order.expected_amount_agorot == MONTHLY_AGOROT * 3


def test_an_order_that_buys_nothing_at_all_is_still_refused(
    tenant_session, studio, a_priced_student
):
    """No charges and no months forward is an order for zero shekels, which is what
    `payment_order_amount_positive` forbids and what would open uPay on an empty basket."""
    with pytest.raises(RefusedError):
        OrderService(tenant_session).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[],
            max_payments=1,
            prepay_months=0,
            at=T0,
        )


def test_months_forward_are_refused_for_a_payer_with_no_plan(tenant_session, app_session, studio):
    """A payer with no priced active student has a monthly total of zero, so "3 months"
    prices at nothing. Refusing beats opening uPay for the charges alone and silently
    dropping the months the family thought they were buying."""
    stranger = Person(studio_id=studio.id, first_name="לא", last_name="משלם")
    app_session.add(stranger)
    app_session.commit()
    with pytest.raises(RefusedError):
        OrderService(tenant_session).create(
            studio.id,
            payer_person_id=stranger.id,
            charge_ids=[],
            max_payments=1,
            prepay_months=3,
            at=T0,
        )


def test_a_negative_month_count_is_refused(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """It would subtract from what the family owes and open uPay for less than the debt."""
    with pytest.raises(RefusedError):
        OrderService(tenant_session).create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[an_open_charge],
            max_payments=1,
            prepay_months=-1,
            at=T0,
        )


# -- "if they owe it, they can pay it" -----------------------------------------
#
# The guard above is right about a settled order and right about money that actually
# arrived. It was wrong about the case it fires on most often: the SAME parent, coming
# back to the SAME month, after closing the uPay tab without paying.
#
# What that refusal produced was a screen saying "you owe ₪208.33" above a button that
# could not pay ₪208.33 — for a day or two in production, until the nightly sweep, and
# for ever on staging, where `billing-run` is not scheduled at all
# (infra/railway/jobs.json). The owner met it on their own account and could not read
# their way out of it, which is the whole reason this exists.
#
# So the payer's own abandoned order is REPLACED rather than refused. The only thing
# still protected is the window where money may already be moving: uPay's IPN lands
# about five minutes after a real payment, so an order opened moments ago is left alone.
def test_a_payers_own_abandoned_order_is_replaced_rather_than_refused(
    tenant_session, studio, a_priced_student, three_open_months
):
    """A parent who closed the tab and came back must be able to pay the month they owe.

    The first order is superseded rather than left holding the charge: two live orders
    over one charge is the double-payment shape this whole section exists to prevent.
    """
    service = OrderService(tenant_session)
    abandoned = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    fresh = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0 + timedelta(minutes=11),
    )
    assert fresh.id != abandoned.id
    assert fresh.status == "pending"
    assert abandoned.status == "expired"


def test_an_order_opened_moments_ago_is_left_alone(
    tenant_session, studio, a_priced_student, three_open_months
):
    """uPay's IPN arrives about five minutes after a real payment
    (upay-integration.md). Replacing an order inside that window is the one way this
    flow can take a family's money twice: the first payment settles against an order
    we have already expired, and the second charges them again for the same month.
    """
    service = OrderService(tenant_session)
    service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    with pytest.raises(ConflictError):
        service.create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[three_open_months[0]],
            max_payments=1,
            at=T0 + timedelta(minutes=2),
        )


@pytest.mark.parametrize("held", ["paid", "amount_mismatch"])
def test_an_order_money_arrived_against_is_never_replaced(
    tenant_session, studio, a_priced_student, three_open_months, held
):
    """Neither of these is abandoned. `paid` settled the month; `amount_mismatch` means
    real money arrived at the wrong amount and a human has to look at it. Replacing
    either would offer the family a month they have already handed money over for.
    """
    service = OrderService(tenant_session)
    order = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    order.status = held
    tenant_session.flush()
    with pytest.raises(ConflictError):
        service.create(
            studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[three_open_months[0]],
            max_payments=1,
            at=T0 + timedelta(days=1),
        )


def test_a_month_held_only_by_the_payers_own_abandoned_order_reads_as_payable(
    tenant_session, studio, a_priced_student, three_open_months
):
    """The read side of the same rule, and the half the screen depends on.

    `create` accepting the charge while `covered_charge_ids` still calls it covered would
    grey the row out on a screen whose button pays it — the exact contradiction the old
    screen showed. Asked WITHOUT a payer (the manager's listing) the answer is unchanged:
    an order still holds its charge, and a manager looking at the ledger should see that.
    """
    service = OrderService(tenant_session)
    service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    later = T0 + timedelta(minutes=11)
    assert service.covered_charge_ids(list(three_open_months)) == {three_open_months[0]}
    assert (
        service.covered_charge_ids(
            list(three_open_months),
            payer_person_id=a_priced_student.payer_person_id,
            at=later,
        )
        == set()
    )
    selectable = service.selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id, at=later
    )
    assert three_open_months[0] in [row.id for row in selectable]
