"""SPEC §19.5's IPN simulator, and the callback shape it simulates.

'Fires a synthetic callback in four shapes: a clean success, an amount mismatch, a
forged order reference, and a duplicate transactionid. These are the four security
requirements from §5.10, and without a simulator they are only testable against live
money.'

**What M6 owns and this does not:** `GET /webhooks/upay/{public_ref}`,
`upay_ipn_record`, `payment_order` and the reconciliation worker. This module builds the
callback; the dev router delivers it to that endpoint when it exists. The four shapes
and their field values are the durable part and they are tested in full today.

The field list is upay-integration.md §4 verbatim. A simulator missing a field is a
parser that was never tested against it.
"""

from __future__ import annotations

import uuid
from datetime import date
from enum import StrEnum

from app.core.clock import now
from app.integrations.upay.form import shekels

#: §5.10: 'Source-IP allowlist (84.95.87.35, configurable). Treated as one weak layer,
#: not proof.' Recorded here so M6's allowlist and the simulator cannot disagree.
IPN_SOURCE_IP = "84.95.87.35"

#: The fixture card. Stable across simulations because §5.10's reconciliation builds a
#: payer_fingerprint from (normalized card owner name, last 4 digits) -- a name that
#: changed every call would make the fingerprint path untestable.
DEMO_CARD_OWNER = "ישראל ישראלי"
DEMO_FOUR_DIGITS = "4242"


class IpnShape(StrEnum):
    """§19.5's four, one per §5.10 security requirement."""

    #: The happy path.
    SUCCESS = "success"
    #: 'Client tampers with amount before submitting.' Off by one agora -- the smallest
    #: difference a comparison against expected_amount_agorot must still catch.
    AMOUNT_MISMATCH = "amount_mismatch"
    #: 'Anyone can forge an IPN for a guessed order.' A well-formed UUID no order
    #: carries, so the endpoint reaches its lookup rather than rejecting the input.
    FORGED_REF = "forged_ref"
    #: 'Duplicate IPN delivery.' Byte-identical to the success it repeats, because a
    #: duplicate that differed anywhere else would be caught by a weaker check.
    DUPLICATE = "duplicate"


def build_ipn_query(
    *,
    shape: IpnShape,
    order_public_ref: uuid.UUID,
    expected_amount_agorot: int,
    transaction_id: str,
    card_owner_name: str = DEMO_CARD_OWNER,
    four_digits: str = DEMO_FOUR_DIGITS,
    payment_date: date | None = None,
) -> dict[str, str]:
    """The query string uPay would GET to our ipnurl, in one of §19.5's four shapes.

    `payment_date` defaults to `now().date()` -- Task 2's clock, not the bare wall
    clock -- so a simulated IPN fired under an active X-Dev-Now shift carries the
    *travelled* date. "Run the billing run in March, then simulate its payment" must
    produce a payment dated in March, not today.
    """
    amount_agorot = expected_amount_agorot
    reference = order_public_ref

    if shape is IpnShape.AMOUNT_MISMATCH:
        amount_agorot = expected_amount_agorot - 1
    elif shape is IpnShape.FORGED_REF:
        # Deterministic, so a forged-reference test is reproducible; derived from the
        # real ref so it can never collide with it.
        reference = uuid.uuid5(uuid.NAMESPACE_URL, f"forged/{order_public_ref}")

    return {
        "errordescription": "SUCCESS",
        "providererrorcode": "0",
        "amount": shekels(amount_agorot),
        "transactionid": transaction_id,
        "productdescription": str(reference),
        "cardownername": card_owner_name,
        "fourdigits": four_digits,
        "paymentdate": (payment_date or now().date()).isoformat(),
    }
