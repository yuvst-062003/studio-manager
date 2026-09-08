"""§5.10's uPay one-time flow, up to the moment the parent leaves our origin.

**`public_ref` is a UUIDv4 and it is the credential.** The IPN endpoint is unauthenticated
by necessity -- uPay calls it -- so the reference is the only thing standing between a
guessed URL and a settled month. §5.10's first threat row says it outright: "Sequential ids
in this endpoint would let anyone mark any tuition paid."

**The order prices itself server-side.** `PaymentOrderCreateIn` carries no expected amount
on purpose: §5.10 compares the IPN against `expected_amount_agorot`, and a client-supplied
expected amount would be the very number it is compared to. The uPay form is
client-submitted and its `amount` field is editable -- [VERIFIED] twice in live testing, an
edited `amount=2` came back as `amount=2` and `depositamount=2`, unmodified.

**§5.10's three double-payment protections**, in the order the spec gives them:

1. `selectable_charges` excludes any charge already covered by an open or paid order. This
   is the PRIMARY guard and it works whichever route the parent takes.
2. `has_active_subscription` feeds a **warning, never a block** -- the parent decides.
3. The surplus case is `PaymentService.unallocated_agorot` and needs nothing here.

An expired order releases its charges, because guard 1 must not become a permanent lock: a
parent who opened uPay and closed the tab would otherwise never be able to pay that month.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.cors import app_origin
from app.integrations.upay.form import MAX_INSTALLMENTS, upay_form_fields
from app.models.billing import Charge, PaymentOrder, PaymentOrderCharge, RecurringSubscription
from app.models.studio import Studio
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.payment_promise import PaymentPromiseService
from app.services.billing.prepay_ceiling import refuse_past_ceiling

#: §5.10's "IPN never arrives" row: 'a nightly job flags orders pending for more than 24h'.
ORDER_TTL_HOURS = 24

#: How far forward one card order may buy. The screen's chips stop at 6; this is the
#: backstop against a client posting a year and a half, and it matches the CHECK on
#: `payment_order.prepay_months`.
MAX_PREPAY_MONTHS = 12

#: How long one of the payer's OWN pending orders is left alone before a fresh attempt may
#: replace it. See `_replaceable_order_ids`: this is the window in which money may already
#: be moving, and it is the whole of what the replacement rule still refuses.
#:
#: uPay's IPN lands about five minutes after a real payment (upay-integration.md). Ten
#: minutes is that, doubled, because the cost of the two errors is not symmetric: too long
#: and a parent waits a few minutes before retrying, too short and the IPN settles an order
#: we have already expired while the family is being charged a second time for the month.
REPLACE_GRACE_MINUTES = 10

#: The statuses that still hold a claim on a charge. `failed` and `expired` release theirs.
#: `amount_mismatch` KEEPS its claim: real money arrived against that order, and offering
#: the same charges for a second card payment before a human has looked would invite the
#: family to pay twice for one month.
#:
#: `ChargeOut.is_covered_elsewhere` is the same predicate seen from the read side, which is
#: why this is one public tuple and not two hand-copied ones that would drift the moment a
#: sixth order status appears.
HOLDING_STATUSES = ("pending", "paid", "amount_mismatch")


class MerchantEmailMissingError(RuntimeError):
    """`UPAY_MERCHANT_EMAIL` is unset or blank, so there is no account to charge.

    **Blank counts, and that is the point.** The committed environment template ships the
    key with an empty value, and `""` is not `None` -- the same trap that made
    `dev_tools_allowed` and `DevClockMiddleware` disagree about the developer token. Here
    the cost is worse than a refused request: `email=` on the form is a real payer sent to
    a real hosted page to pay an account that does not exist, and `upay_form_fields` checks
    `studio.is_demo` and nothing else, so nothing downstream would stop it.

    Refusing to build a form is always better than building one that charges nobody.
    """


class OrderService:
    """The `payment_order` lifecycle. Session on the constructor, like every service here."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- selection -------------------------------------------------------------
    # -- whose claim is real, and whose is only an abandoned tab ---------------
    def _replaceable_order_ids(
        self, *, payer_person_id: uuid.UUID, charge_ids: Sequence[uuid.UUID], at: datetime
    ) -> set[uuid.UUID]:
        """The payer's own pending orders over these charges that a fresh attempt may take.

        **"If they owe it, they can pay it."** The double-payment guard was written against
        a stranger's order and against money that had arrived, and it is right about both.
        The case it actually fired on was neither: the same parent, the same month, back
        after closing the uPay tab. It left a screen saying "you owe X" above a button that
        could not pay X -- for a day or two in production, until `sweep_stale_orders`, and
        for ever on staging, where `billing-run` is not a scheduled job at all
        (infra/railway/jobs.json).

        Three conditions, and each one is load-bearing:

        * `status == 'pending'` -- `paid` settled the month and `amount_mismatch` means real
          money arrived at the wrong amount and a human must look. Neither is abandoned, and
          `HOLDING_STATUSES` keeps them holding.
        * the payer is the caller -- a charge is owed by one person, so this is belt and
          braces rather than the primary check, but the primary check is in `create` and
          this method is also read by projections that never call it.
        * it was opened more than `REPLACE_GRACE_MINUTES` ago.

        **Age is read from `expires_at`, not `created_at`.** `expires_at` is written from
        the `at` the caller passed, so it moves with `app.core.clock.now()` and with
        `X-Dev-Now`; `created_at` is a database default and would make this rule untestable
        against an injected clock -- a test pinned to November would compare a row stamped
        with the wall clock and pass for the wrong reason. A NULL `expires_at` is left alone
        for the same reason `expire_stale` skips it: an order nothing can date is an order
        nothing should quietly discard.
        """
        if not charge_ids:
            return set()
        opened_at = PaymentOrder.expires_at - timedelta(hours=ORDER_TTL_HOURS)
        return set(
            self._session.execute(
                select(PaymentOrder.id)
                .join(PaymentOrderCharge, PaymentOrderCharge.payment_order_id == PaymentOrder.id)
                .where(
                    PaymentOrder.status == "pending",
                    PaymentOrder.payer_person_id == payer_person_id,
                    PaymentOrder.expires_at.is_not(None),
                    opened_at <= at - timedelta(minutes=REPLACE_GRACE_MINUTES),
                    PaymentOrderCharge.charge_id.in_(charge_ids),
                )
            ).scalars()
        )

    def _claims(
        self,
        charge_ids: Sequence[uuid.UUID],
        *,
        payer_person_id: uuid.UUID | None,
        at: datetime | None,
    ) -> set[uuid.UUID]:
        """Which of these charges are held by a claim the given viewer cannot take over.

        With no payer this is `HOLDING_STATUSES` and nothing else -- the manager's view, and
        what every caller got before replacement existed. With a payer and a clock, the
        payer's own abandoned orders stop counting, so that a row this returns is exactly a
        row `create` would refuse for that person. Two spellings of "covered" that could
        disagree is how a screen comes to grey out a charge its own button pays.
        """
        if not charge_ids:
            return set()
        replaceable: set[uuid.UUID] = set()
        if payer_person_id is not None and at is not None:
            replaceable = self._replaceable_order_ids(
                payer_person_id=payer_person_id, charge_ids=charge_ids, at=at
            )
        return self._claimed_charge_ids(charge_ids, ignoring=replaceable)

    def _claimed_charge_ids(
        self, charge_ids: Sequence[uuid.UUID], *, ignoring: set[uuid.UUID]
    ) -> set[uuid.UUID]:
        """`HOLDING_STATUSES` over these charges, minus the orders named in `ignoring`.

        Split out of `_claims` because `create` has already worked out which orders it is
        about to supersede and must not ask a second time: the two answers are what it
        refuses on and what it expires, and a second query between them is a second chance
        for them to disagree.
        """
        rows = self._session.execute(
            select(PaymentOrderCharge.charge_id, PaymentOrder.id)
            .join(PaymentOrder, PaymentOrder.id == PaymentOrderCharge.payment_order_id)
            .where(
                PaymentOrder.status.in_(HOLDING_STATUSES),
                PaymentOrderCharge.charge_id.in_(charge_ids),
            )
        ).all()
        # A charge may be named by more than one order -- an abandoned attempt and a later
        # one that settled. It is covered if ANY order still holding it is one this viewer
        # cannot take over, which is why the partition is per row and not per charge.
        return {charge_id for charge_id, order_id in rows if order_id not in ignoring}

    def selectable_charges(
        self, studio_id: uuid.UUID, *, payer_person_id: uuid.UUID, at: datetime | None = None
    ) -> list[Charge]:
        """§5.10 -- 'the N oldest unpaid tuition charges **across every student this person
        is the payer for**'.

        Oldest first, which is what `billing.card.oldestFirst` states on the screen and what
        `1b`'s own spec notes the artboard leaves implicit.

        Excludes anything covered by a claim this payer cannot take over: §5.10's primary
        double-payment guard, and the one that works no matter which route the parent uses.
        `at` is what tells their own abandoned attempt apart from everyone else's claim --
        omitted, every holding order counts, which is the behaviour this had before
        replacement existed.
        """
        rows = list(
            self._session.execute(
                select(Charge)
                .where(
                    Charge.studio_id == studio_id,
                    Charge.payer_person_id == payer_person_id,
                    Charge.status == "open",
                    # A credit is a negative charge and there is nothing to pay on it.
                    Charge.amount_agorot > 0,
                )
                .order_by(Charge.due_date, Charge.id)
            ).scalars()
        )
        covered = self._claims(
            [row.id for row in rows],
            payer_person_id=payer_person_id if at is not None else None,
            at=at,
        )
        return [row for row in rows if row.id not in covered]

    def covered_charge_ids(
        self,
        charge_ids: Sequence[uuid.UUID],
        *,
        payer_person_id: uuid.UUID | None = None,
        at: datetime | None = None,
    ) -> set[uuid.UUID]:
        """Which of these charges are already claimed by an open or paid order.

        The read-side twin of `selectable_charges`'s `notin_(claimed)`. That method answers
        "what may this payer pay now" and drops the rest; a LIST of charges has to render
        the rest too, greyed out and explained, which is what §5.10's covered-elsewhere copy
        on `12f` is. Both read `HOLDING_STATUSES`, so a row the server would refuse is
        exactly a row the screen shows as unpayable.

        Takes the ids rather than a payer, because the caller has already paged them: a
        second query filtered by payer would return claims for charges that are not on the
        page and miss none that are. Returns a set for O(1) membership while projecting.

        An empty input short-circuits. `IN ()` is legal SQL for SQLAlchemy to emit but the
        round trip is pure cost on the common case of a family with nothing outstanding.
        """
        return self._claims(charge_ids, payer_person_id=payer_person_id, at=at)

    def has_active_subscription(self, payer_person_id: uuid.UUID) -> bool:
        """§5.10's second double-payment protection, and it is a **warning, not a block**.

        'If the payer has an active `recurring_subscription`, the credit-card option shows a
        warning before opening uPay. A warning, not a block -- the parent decides.' A family
        who set up a mandate and then wants to clear a one-off must still have a route.
        """
        return (
            self._session.execute(
                select(RecurringSubscription.id).where(
                    RecurringSubscription.payer_person_id == payer_person_id,
                    RecurringSubscription.status == "active",
                )
            ).scalar_one_or_none()
            is not None
        )

    # -- lifecycle -------------------------------------------------------------
    def create(
        self,
        studio_id: uuid.UUID,
        *,
        payer_person_id: uuid.UUID,
        charge_ids: list[uuid.UUID],
        max_payments: int,
        prepay_months: int = 0,
        at: datetime,
    ) -> PaymentOrder:
        """§5.10 step 1 -- one order over N charges and M months forward, priced server-side.

        Every refusal here is reachable from a client, because `charge_ids` arrives from
        one: a charge somebody else owes, a charge already covered, a settled charge, an
        empty basket, an instalment count the merchant account does not offer.

        **`prepay_months` buys months that have no charge yet** (owner request,
        2026-08-30: "user can pay with card 3 month ahead"). Until it existed the card
        route could only settle debt, so the month chips were capped at the number of
        months the family happened to OWE -- a family in good standing was offered "1"
        and could not hand the club a term by card at all, while cash and cheques had
        been able to since the 2026-08-27 prepayment wave.

        It introduces no new ledger shape. The months are priced here into
        `expected_amount_agorot` at the payer's own monthly total, and on settlement the
        payment allocates to this order's charges only -- the remainder stays unallocated,
        and that surplus IS the credit (`PaymentAllocation`'s docstring, and the promise
        flow's `confirm`). The billing run's step 7 spends it oldest-first, so the months
        bought here are covered as they are billed and the debt ladder never fires at a
        family who paid.

        Integer arithmetic throughout (G2): `prepay_months x monthly` is a product of two
        integers the server holds, and the client sends no amount at all.
        """
        if prepay_months < 0:
            # It would subtract from what the family owes and open uPay for less than the
            # debt, leaving charges half-covered by a payment nobody could explain.
            raise RefusedError("prepay_months cannot be negative")
        # Was `prepay_months > MAX_PREPAY_MONTHS`, which capped ONE order and counted
        # nothing already bought -- so twelve months forward, paid, then twelve more was
        # twenty-four months of coverage and neither route noticed (owner review,
        # 2026-09-08). The ceiling is now measured off the credit the family holds.
        refuse_past_ceiling(self._session, payer_person_id, prepay_months)
        if not charge_ids and prepay_months == 0:
            raise RefusedError("an order needs at least one charge or a month bought forward")
        if not 1 <= max_payments <= MAX_INSTALLMENTS:
            # Round two A1: the dashboard's instalment dropdown stops at 12, and what uPay
            # does with a larger `maxpayments` posted straight to the form was never tested.
            # Refusing here means it never has to be.
            raise RefusedError(
                f"max_payments={max_payments}: the merchant account offers 1..{MAX_INSTALLMENTS}"
            )

        # The payer's own abandoned attempts do not count against them, and the orders that
        # do not count are exactly the ones this call is about to expire. Both sets come
        # from one read so they cannot disagree.
        superseded = self._replaceable_order_ids(
            payer_person_id=payer_person_id, charge_ids=charge_ids, at=at
        )
        claimed = self._claimed_charge_ids(charge_ids, ignoring=superseded)
        total = 0
        charges: list[Charge] = []
        for charge_id in charge_ids:
            charge = self._session.get(Charge, charge_id)
            if charge is None or charge.studio_id != studio_id:
                raise NotFoundError(f"no charge {charge_id}")
            if charge.payer_person_id != payer_person_id:
                # A parent may pay only what they owe. Without this, one family could open
                # an order over another family's debt and settle it on payment, leaving the
                # real payer's month reading paid.
                raise NotFoundError(f"charge {charge_id} is not owed by this payer")
            if charge.status != "open":
                raise RefusedError(f"charge {charge_id} is {charge.status}, not open")
            if charge_id in claimed:
                raise ConflictError(
                    f"charge {charge_id} is already covered by an open or paid order"
                )
            charges.append(charge)
            total += charge.amount_agorot
        if prepay_months > 0:
            # The SAME monthly total the cash and cheque cards price their forward months
            # at, and the same one `GET /me/prepay-terms` sends the screen -- one function,
            # so two routes cannot round the same family's month differently.
            monthly = PaymentPromiseService(self._session).monthly_total_agorot(payer_person_id)
            if monthly <= 0:
                # A payer with no priced active student prices "3 months" at nothing.
                # Refusing beats opening uPay for the charges alone and silently dropping
                # the months the family believed they were buying.
                raise RefusedError("this payer has no monthly price, so no month can be bought")
            total += prepay_months * monthly
        if total <= 0:
            # `payment_order_amount_positive` is the CHECK; this is the same rule with a
            # message, and it catches a selection that is all credits.
            raise RefusedError("an order for nothing would open uPay for zero shekels")

        # Superseding happens only once every refusal above has been passed. An order this
        # call goes on to reject -- somebody else's charge in the basket, an instalment
        # count the merchant account does not offer -- must leave the parent's earlier
        # attempt exactly as it found it.
        #
        # A superseded order is released whole, including any charge the new basket does
        # not name: it was abandoned, `sweep_stale_orders` would have released it anyway,
        # and half-expiring an order would leave a row whose charges nobody can account for.
        if superseded:
            for stale in self._session.execute(
                select(PaymentOrder).where(PaymentOrder.id.in_(superseded))
            ).scalars():
                stale.status = "expired"
            self._session.flush()

        order = PaymentOrder(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            public_ref=uuid.uuid4(),
            expected_amount_agorot=total,
            max_payments=max_payments,
            prepay_months=prepay_months,
            status="pending",
            expires_at=at + timedelta(hours=ORDER_TTL_HOURS),
        )
        self._session.add(order)
        self._session.flush()
        for charge in charges:
            self._session.add(
                PaymentOrderCharge(
                    studio_id=studio_id, payment_order_id=order.id, charge_id=charge.id
                )
            )
        self._session.flush()
        return order

    def get_by_public_ref(self, public_ref: uuid.UUID) -> PaymentOrder:
        order = self._session.execute(
            select(PaymentOrder).where(PaymentOrder.public_ref == public_ref)
        ).scalar_one_or_none()
        if order is None:
            raise NotFoundError(f"no order {public_ref}")
        return order

    def charge_ids_of(self, order_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.execute(
                select(PaymentOrderCharge.charge_id)
                .where(PaymentOrderCharge.payment_order_id == order_id)
                .order_by(PaymentOrderCharge.charge_id)
            ).scalars()
        )

    def list_orders(
        self,
        *,
        status: str | None = None,
        payer_person_id: uuid.UUID | None = None,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[PaymentOrder], uuid.UUID | None]:
        """The orders a manager may look at, newest first, optionally by status.

        `payer_person_id` narrows the same query to one family, which is what
        `GET /me/payment-orders` needs: a parent may read their own orders and nobody
        else's. It is a filter here rather than a second method because the shape, the
        ordering and the cursor are identical -- two near-copies of this query would be
        two places for the tenancy and paging rules to drift apart.

        §5.10's high-priority alert counts `amount_mismatch` orders, and its last threat row
        counts `pending` ones older than a day. Neither could be asked for: the only reads
        were `POST` and one-by-`public_ref`, so `DebtAlert` shipped with props nothing could
        fill. This is the smallest thing that answers both, and it is a filtered list rather
        than a counts endpoint because every other list in this router is one — a manager
        who sees a count of three wants to know which three.

        Cursor pagination on `id`, matching `list_charges` and `list_payments`.
        """
        query = select(PaymentOrder)
        if status is not None:
            query = query.where(PaymentOrder.status == status)
        if payer_person_id is not None:
            query = query.where(PaymentOrder.payer_person_id == payer_person_id)
        if after is not None:
            query = query.where(PaymentOrder.id > after)
        rows = list(
            self._session.execute(query.order_by(PaymentOrder.id).limit(limit + 1)).scalars()
        )
        next_cursor = rows[limit - 1].id if len(rows) > limit else None
        return rows[:limit], next_cursor

    def expire_stale(self, studio_id: uuid.UUID, *, at: datetime) -> list[PaymentOrder]:
        """§5.10's "IPN never arrives" row, and the release valve for guard 1.

        upay-integration.md puts it more strongly than the spec does: treat "no IPN ever
        arrived" as a failure signal in its own right, because a failure-shaped payload may
        not exist at all -- IPNs for failed payments are [NOT COVERED] by any testing.
        """
        stale = list(
            self._session.execute(
                select(PaymentOrder).where(
                    PaymentOrder.studio_id == studio_id,
                    PaymentOrder.status == "pending",
                    PaymentOrder.expires_at.is_not(None),
                    PaymentOrder.expires_at < at,
                )
            ).scalars()
        )
        for order in stale:
            order.status = "expired"
        self._session.flush()
        return stale

    # -- the form --------------------------------------------------------------
    def form_fields(self, public_ref: uuid.UUID, *, base_url: str) -> dict[str, str]:
        """§5.10 step 2's hidden fields, for one order.

        The amount comes from the **order's own row** and never from a caller -- that row is
        what the IPN is compared against, so a caller-supplied amount would make the
        comparison compare a number to itself.

        Raises `DemoStudioHasNoLiveFormError` for a demo studio (§19.6 restriction 5): not a
        sandbox-flagged form, no form at all, because the account has no sandbox mode and
        `livesystem=0` is a guarantee no test can verify.
        """
        order = self.get_by_public_ref(public_ref)
        studio = self._session.get(Studio, order.studio_id)
        if studio is None:  # pragma: no cover -- the order carries a real FK
            raise NotFoundError(f"no studio {order.studio_id}")
        merchant_email = (settings.UPAY_MERCHANT_EMAIL or "").strip()
        if not merchant_email:
            raise MerchantEmailMissingError(
                "UPAY_MERCHANT_EMAIL is unset or blank, so there is no account to charge. "
                "It lives in Railway variables and never in this repo."
            )
        # The browser goes back to the PARENT APP, not to the API: `returnurl` is where
        # uPay sends the paying parent, and until P1 it pointed at the JSON status
        # endpoint, so a paying parent landed on raw JSON. The app's
        # `#/payment-complete/<ref>` screen polls that same endpoint and stays honest
        # that the IPN is the only settlement. Falls back to the API URL while the app
        # host is unconfigured (domains.json's PENDING production entries) — a JSON page
        # beats a redirect at a hostname that does not resolve.
        parent_origin = app_origin("parent", settings.ENV)
        return_url = (
            f"{parent_origin}/#/payment-complete/{order.public_ref}"
            if parent_origin
            else f"{base_url.rstrip('/')}/api/v1/payment-complete?ref={order.public_ref}"
        )
        return upay_form_fields(
            studio=studio,
            order_public_ref=order.public_ref,
            expected_amount_agorot=order.expected_amount_agorot,
            max_payments=order.max_payments,
            merchant_email=merchant_email,
            return_url=return_url,
            ipn_url=f"{base_url.rstrip('/')}/api/v1/webhooks/upay/{order.public_ref}",
        )
