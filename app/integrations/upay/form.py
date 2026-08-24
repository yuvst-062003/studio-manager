"""SPEC §5.10's server-rendered uPay form, and §19.6's fifth restriction.

M6 owns `payment_order` and the route that renders this. What lives here is the field
builder, because the restriction 'a demo studio can never render a live payment form'
needs exactly one place where `livesystem` is decided. A test asserts no other module in
app/ writes that field.

**Money.** upay-integration.md shows `float(request.args['amount'])`. That is not
followed: SPEC §4.3 stores `expected_amount_agorot INTEGER`, G2 forbids floats and
invariant 1 fails the build on one. The conversion to uPay's decimal-shekel field is
integer arithmetic, it happens here and nowhere else, and it returns a string.

**No signature exists** on this form (upay-integration.md §"Important caveat"). Nothing
here is trusted on the way back; §5.10's reconciliation compares the IPN against
`expected_amount_agorot` on our own row.
"""

from __future__ import annotations

import uuid

from app.models.studio import Studio

UPAY_ENDPOINT = "https://app.upay.co.il/API6/clientsecure/redirectpage.php"

#: uPay's own field values. Strings, because they are form fields.
LIVE = "1"
SANDBOX = "0"


def shekels(amount_agorot: int) -> str:
    """Agorot -> uPay's decimal shekels, in integer arithmetic. `divmod`, not `/ 100`:
    the moment a float appears, 32050 renders as 320.5000000000001 for some input and
    the amount check on the way back fails for a payment that was correct."""
    whole, remainder = divmod(amount_agorot, 100)
    return f"{whole}.{remainder:02d}"


def upay_form_fields(
    *,
    studio: Studio,
    order_public_ref: uuid.UUID,
    expected_amount_agorot: int,
    max_payments: int,
    merchant_email: str,
    return_url: str,
    ipn_url: str,
) -> dict[str, str]:
    """The hidden fields of §5.10's auto-submitting form.

    `livesystem` is **derived from the studio and is not a parameter**. §19.6: 'The demo
    studio's uPay configuration is pinned to livesystem=0.' A keyword the caller
    controls is a keyword a caller gets wrong, and the cost of getting this one wrong is
    a real charge on a real card during a demo.
    """
    return {
        "email": merchant_email,
        "amount": shekels(expected_amount_agorot),
        "returnurl": return_url,
        "ipnurl": ipn_url,
        # §5.10 -- a UUIDv4 public_ref, never a sequential id: a sequential id here
        # would let anyone mark any tuition paid.
        "paymentdetails": str(order_public_ref),
        "maxpayments": str(max_payments),
        "livesystem": SANDBOX if studio.is_demo else LIVE,
        "createinvoiceandreceipt": "1",
        "refername": "STUDIOMANAGER",
        "lang": "HE",
        "currency": "NIS",
    }
