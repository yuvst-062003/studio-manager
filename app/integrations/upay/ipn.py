"""SPEC §19.5's IPN simulator, and the callback shape it simulates.

'Fires a synthetic callback in four shapes: a clean success, an amount mismatch, a
forged order reference, and a duplicate transactionid. These are the four security
requirements from §5.10, and without a simulator they are only testable against live
money.'

**What M6 owns and this does not:** `GET /webhooks/upay/{public_ref}`,
`upay_ipn_record`, `payment_order` and the reconciliation worker. This module builds the
callback; the dev router delivers it to that endpoint when it exists. The four shapes
and their field values are the durable part and they are tested in full today.

**The field list is upay-integration.md §Round two B1 -- captured from a real payment,
not transcribed from prose.** A simulator missing a field is a parser that was never
tested against it, and the earlier eight-field list was missing twenty-three.

**The inbound amount is not the outbound amount.** `form.shekels()` renders "320.00" for
the form, which uPay accepts. What comes *back* is not that format: a ₪1 payment returned
`amount=1`, not `1.00`. A parser that string-compares the IPN against `shekels()` rejects
every correct whole-shekel payment as `amount_mismatch` -- which §5.10 escalates to a
manager as suspected tampering. So M6 compares integers: `agorot_from_ipn_amount()`.
"""

from __future__ import annotations

import uuid
from datetime import date
from enum import StrEnum

from app.core.clock import now

#: §5.10: 'Source-IP allowlist (84.95.87.35, configurable). Treated as one weak layer,
#: not proof.' Round two B8 observed it on two of three deliveries and could not get uPay
#: to confirm whether it is stable, which is the strongest reason yet to keep it a
#: signal and never a gate.
IPN_SOURCE_IP = "84.95.87.35"

#: The fixture card. Stable across simulations because §5.10's reconciliation builds a
#: payer_fingerprint from (normalized card owner name, last 4 digits) -- a name that
#: changed every call would make the fingerprint path untestable.
DEMO_CARD_OWNER = "ישראל ישראלי"
DEMO_FOUR_DIGITS = "4242"

#: Placeholders for the two fields that identify the merchant account. The real values
#: live in settings and Railway secrets (`UPAY_MERCHANT_EMAIL`), never in the repo --
#: .gitleaks.toml carries a rule for them. A parser may use either as a weak extra layer,
#: the same standing as IPN_SOURCE_IP.
DEMO_MERCHANT_EMAIL = "merchant@example.invalid"
DEMO_MERCHANT_NUMBER = "0000000"


class UnparsableIpnAmountError(ValueError):
    """Raised when an IPN's amount is not a format we have ever seen.

    Loud on purpose. The alternative -- coercing an unknown format to a number -- turns
    a surprise into a silent `amount_mismatch`, and §5.10 escalates that to a manager as
    suspected fraud on what may have been a perfectly good payment.
    """


def ipn_amount(amount_agorot: int) -> str:
    """Agorot -> uPay's **inbound** amount format. Not `form.shekels()`.

    Round two B1 captured `amount=1` for a ₪1 payment: whole shekels come back with no
    decimal part at all. The fractional rendering here is a best guess -- every charge in
    this product is whole shekels (B4), so no fractional IPN has ever been observed. If
    fractional pricing ever lands, this needs re-testing rather than trusting.
    """
    whole, remainder = divmod(amount_agorot, 100)
    return str(whole) if remainder == 0 else f"{whole}.{remainder:02d}"


def agorot_from_ipn_amount(value: str) -> int:
    """uPay's inbound amount -> agorot, so M6 compares integers and never strings.

    Accepts every rendering of the same money -- "1", "1.0", "1.00" are one shekel --
    because the one thing that must not happen is a correct payment failing the amount
    check on formatting. Integer arithmetic throughout: G2 forbids a float touching
    money, and `float("0.29") * 100` is 28.999999999999996.
    """
    text = value.strip()
    if not text:
        raise UnparsableIpnAmountError("empty amount")
    sign = -1 if text.startswith("-") else 1
    text = text.removeprefix("-").removeprefix("+")
    whole, separator, fraction = text.partition(".")
    if not whole.isdigit() or (separator and not fraction.isdigit()):
        raise UnparsableIpnAmountError(f"not a decimal amount: {value!r}")
    if len(fraction) > 2:
        raise UnparsableIpnAmountError(f"more precision than agorot: {value!r}")
    return sign * (int(whole) * 100 + int(fraction.ljust(2, "0") or 0))


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
    merchant_email: str = DEMO_MERCHANT_EMAIL,
    merchant_number: str = DEMO_MERCHANT_NUMBER,
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

    # Round two B10: the tampered amount came back in `amount` AND `depositamount`, both
    # unmodified. A simulator that moved only `amount` would let a parser that happened
    # to read `depositamount` pass the mismatch test while missing the real tamper.
    rendered = ipn_amount(amount_agorot)
    stamp = (payment_date or now().date()).isoformat()

    return {
        # -- outcome ------------------------------------------------------------------
        "providererrorcode": "0",
        "errordescription": "SUCCESS",
        "providererrordescription": "SUCCESS",
        "providerconfirmationnumber": transaction_id[-6:].rjust(6, "0"),
        # -- money --------------------------------------------------------------------
        "amount": rendered,
        "depositamount": rendered,
        # Round two D observed ~1% taken at settlement, not in the payload: a ₪1 payment
        # reported depositnetamount=1 while the dashboard showed ₪0.99 transferred. The
        # ledger settles what the parent paid, so net is carried, never reconciled on.
        "depositnetamount": rendered,
        "commissionreduction": "1",
        # -- installments (round two A1: the dashboard caps the dropdown at 12) --------
        "firstpayment": "0",
        "constantpayment": "0",
        "numberpayments": "1",
        # -- the order reference ------------------------------------------------------
        # §5.10, and round two B3 confirmed the rename across all three live tests: what
        # the form sends as `paymentdetails` comes back as `productdescription`.
        "productdescription": str(reference),
        "transactionid": transaction_id,
        "depositcashierid": transaction_id,
        # -- card ---------------------------------------------------------------------
        "fourdigits": four_digits,
        "cardownername": card_owner_name,
        "cardname": "MAX VISA",
        "cardtype": "VI",
        "companytype": "MAX",
        "clearer": "CAL",
        "foreign": "0",
        "expirydate": "0830",
        # Round two D: uPay's internal channel label, NOT the payment method -- the
        # dashboard showed "bit" for Visa-paid transactions. Never parse this as one.
        "application": "BIT",
        # -- merchant and dates -------------------------------------------------------
        "merchantnumber": merchant_number,
        "email": merchant_email,
        "paymentdate": stamp,
        "actiondate": stamp,
        # -- fields uPay sends empty --------------------------------------------------
        "comment": "",
        "identitynumber": "",
        "cellphonenotify": "",
        "emailnotify": "",
    }
