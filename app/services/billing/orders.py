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
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.upay.form import MAX_INSTALLMENTS, upay_form_fields
from app.models.billing import Charge, PaymentOrder, PaymentOrderCharge, RecurringSubscription
from app.models.studio import Studio
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError

#: §5.10's "IPN never arrives" row: 'a nightly job flags orders pending for more than 24h'.
ORDER_TTL_HOURS = 24

#: The statuses that still hold a claim on a charge. `failed` and `expired` release theirs.
#: `amount_mismatch` KEEPS its claim: real money arrived against that order, and offering
#: the same charges for a second card payment before a human has looked would invite the
#: family to pay twice for one month.
_HOLDING_STATUSES = ("pending", "paid", "amount_mismatch")


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
    def selectable_charges(
        self, studio_id: uuid.UUID, *, payer_person_id: uuid.UUID
    ) -> list[Charge]:
        """§5.10 -- 'the N oldest unpaid tuition charges **across every student this person
        is the payer for**'.

        Oldest first, which is what `billing.card.oldestFirst` states on the screen and what
        `1b`'s own spec notes the artboard leaves implicit.

        Excludes anything already covered by an open or paid order: §5.10's primary
        double-payment guard, and the one that works no matter which route the parent uses.
        """
        claimed = (
            select(PaymentOrderCharge.charge_id)
            .join(PaymentOrder, PaymentOrder.id == PaymentOrderCharge.payment_order_id)
            .where(PaymentOrder.status.in_(_HOLDING_STATUSES))
        )
        return list(
            self._session.execute(
                select(Charge)
                .where(
                    Charge.studio_id == studio_id,
                    Charge.payer_person_id == payer_person_id,
                    Charge.status == "open",
                    # A credit is a negative charge and there is nothing to pay on it.
                    Charge.amount_agorot > 0,
                    Charge.id.notin_(claimed),
                )
                .order_by(Charge.due_date, Charge.id)
            ).scalars()
        )

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
        at: datetime,
    ) -> PaymentOrder:
        """§5.10 step 1 -- one order over N charges, priced server-side.

        Every refusal here is reachable from a client, because `charge_ids` arrives from
        one: a charge somebody else owes, a charge already covered, a settled charge, an
        empty list, an instalment count the merchant account does not offer.
        """
        if not charge_ids:
            raise RefusedError("an order needs at least one charge")
        if not 1 <= max_payments <= MAX_INSTALLMENTS:
            # Round two A1: the dashboard's instalment dropdown stops at 12, and what uPay
            # does with a larger `maxpayments` posted straight to the form was never tested.
            # Refusing here means it never has to be.
            raise RefusedError(
                f"max_payments={max_payments}: the merchant account offers 1..{MAX_INSTALLMENTS}"
            )

        claimed = set(
            self._session.execute(
                select(PaymentOrderCharge.charge_id)
                .join(PaymentOrder, PaymentOrder.id == PaymentOrderCharge.payment_order_id)
                .where(
                    PaymentOrder.status.in_(_HOLDING_STATUSES),
                    PaymentOrderCharge.charge_id.in_(charge_ids),
                )
            ).scalars()
        )
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
        if total <= 0:
            # `payment_order_amount_positive` is the CHECK; this is the same rule with a
            # message, and it catches a selection that is all credits.
            raise RefusedError("an order for nothing would open uPay for zero shekels")

        order = PaymentOrder(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            public_ref=uuid.uuid4(),
            expected_amount_agorot=total,
            max_payments=max_payments,
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
        return upay_form_fields(
            studio=studio,
            order_public_ref=order.public_ref,
            expected_amount_agorot=order.expected_amount_agorot,
            max_payments=order.max_payments,
            merchant_email=merchant_email,
            return_url=f"{base_url.rstrip('/')}/api/v1/payment-complete?ref={order.public_ref}",
            ipn_url=f"{base_url.rstrip('/')}/api/v1/webhooks/upay/{order.public_ref}",
        )
