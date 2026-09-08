"""How far ahead a family is allowed to pay.

Owner review, 2026-09-08: *"don't allow a user to pay more months if he already paid for a
season (12 months)."*

**The rule did not exist.** `OrderService` refused `prepay_months > MAX_PREPAY_MONTHS`, but
that was a cap on ONE order and counted nothing already bought -- so twelve months forward,
paid, followed immediately by twelve more was twenty-four months of coverage, accepted
silently by both routes. The cash promise path checked only for a negative.

**Rolling, not a season boundary.** The ceiling is measured off the credit the family holds
right now, so it releases a month at a time as each month is billed. The alternative -- a
fixed end-of-year date -- needs a setting the club does not have and every studio would
have to fill in.

**One module because two services enforce it.** A rule stated twice is a rule that drifts,
and these two have drifted before: the per-order cap lived in `orders.py` and the promise
path never learned about it at all.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.services.billing.errors import RefusedError
from app.services.billing.service import BillingService

#: A family may never be covered more than a season ahead. §5.1 of the design.
PREPAY_CEILING_MONTHS = 12


def _monthly_and_credit(session: Session, payer_person_id: uuid.UUID) -> tuple[int, int]:
    """The two numbers the ceiling is made of, read together so they cannot disagree.

    `monthly_total_agorot` is the SAME function both payment routes price their forward
    months at, and `payer_credit` is the same one `/me/balance` sends the screen as
    `credit_agorot` -- which is what the parent reads as `שולם מראש`. Nothing here invents
    a third measure of how far ahead a family is.

    The import is local because `payment_promise` imports THIS module to enforce the
    ceiling on its own route. Resolving the cycle here rather than at each call site keeps
    it to one place, and this function is the only thing in the module that needs it.
    """
    from app.services.billing.payment_promise import PaymentPromiseService

    monthly = PaymentPromiseService(session).monthly_total_agorot(payer_person_id)
    credit = BillingService(session).payer_credit(payer_person_id)
    return monthly, credit


def prepay_headroom_months(session: Session, payer_person_id: uuid.UUID) -> int:
    """How many more months this payer may buy forward.

    Zero for a payer with no monthly price: they buy no months forward on any route, so
    the ceiling never binds on them and the screen must not offer a chip it would then
    have to disable.
    """
    monthly, credit = _monthly_and_credit(session, payer_person_id)
    if monthly <= 0:
        return 0
    ceiling = PREPAY_CEILING_MONTHS * monthly
    # Floor division on a possibly-negative numerator. A family whose plan was re-priced
    # DOWNWARDS holds more than twelve months of the new price; `//` rounds away from zero
    # there, and the outer `max` turns that into "no room" rather than "minus one month".
    return max(0, (ceiling - credit) // monthly)


def refuse_past_ceiling(session: Session, payer_person_id: uuid.UUID, prepay_months: int) -> None:
    """Raise `RefusedError` when this purchase would carry the family past the ceiling.

    **In money, not in months.** A family whose plan was re-priced holds credit that is not
    a whole number of months, and two roundings of that -- one on the screen deciding which
    chips to draw, one here deciding what to accept -- is how a chip a parent can press
    becomes an error they cannot read. The client computes `prepay_headroom_months` from
    the same two integers, and `prepay_months <= headroom` implies the inequality below.

    Only about months bought FORWARD. Settling an open charge is never blocked: a family
    twelve months ahead who still owes an old month must be able to clear it, or the debt
    is one neither side can settle.
    """
    if prepay_months <= 0:
        return
    monthly, credit = _monthly_and_credit(session, payer_person_id)
    if monthly <= 0:
        # The caller's own "this payer has no monthly price" refusal is the better message,
        # and it is raised a few lines later on both routes.
        return
    ceiling = PREPAY_CEILING_MONTHS * monthly
    if credit + prepay_months * monthly > ceiling:
        raise RefusedError(
            f"prepay_months={prepay_months}: this payer is already paid ahead, and at most "
            f"{PREPAY_CEILING_MONTHS} months may be covered at once"
        )
