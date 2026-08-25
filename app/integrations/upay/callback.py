"""Parsing an inbound uPay IPN, and §5.10's four security verdicts over it.

**There is no signature to verify.** `upay-integration.md` marks 'no signature exists on
any request, inbound or outbound' [VERIFIED] in both rounds of live testing. Anyone who
learns the callback URL can send us bytes that look exactly like uPay's. What §5.10
mandates instead is four independent checks, and this module is all four of them:

    Anyone can forge an IPN for a guessed order  ->  the reference is a UUIDv4 the
                                                     server issued, matched against the
                                                     order it actually belongs to
    Client tampers with `amount`                 ->  compared server-side against the
                                                     order's own expected amount, as
                                                     integers, never as strings
    Duplicate IPN delivery                       ->  idempotent on `transactionid`
    No signature on the callback                 ->  a source-IP *signal*, deliberately
                                                     not a parameter of `verify_ipn`

**What this module is not.** It touches no model and no database. `GET
/webhooks/upay/{public_ref}`, `upay_ipn_record`, `payment_order` and the reconciliation
worker are M6's, and the ordering §5.10 requires there -- persist the raw callback, return
200, then do the work in a worker -- means this code always runs *after* the evidence is
already safely written down. That is what makes raising here the safe choice rather than a
way to lose a payment: the bytes survive, and a human sees them.

**Money is integers, everywhere.** `agorot_from_ipn_amount` is the only way an amount
becomes a number, because `float("0.29") * 100` is 28.999999999999996 and G2 forbids a
float touching money at all.
"""

from __future__ import annotations

import uuid
from collections.abc import Container, Mapping
from dataclasses import dataclass, fields
from enum import StrEnum

from app.integrations.upay.ipn import IPN_SOURCE_IP, agorot_from_ipn_amount

#: uPay's query keys, paired with the attribute each becomes, in round two's order.
#: The full 31, captured verbatim from a real payment -- round one's list had eight, and a
#: field this tuple omits is a field no downstream code can ever read.
_FIELDS: tuple[tuple[str, str], ...] = (
    # -- outcome ----------------------------------------------------------------------
    ("providererrorcode", "provider_error_code"),
    ("errordescription", "error_description"),
    ("providererrordescription", "provider_error_description"),
    ("providerconfirmationnumber", "provider_confirmation_number"),
    # -- money ------------------------------------------------------------------------
    ("amount", "amount"),
    ("depositamount", "deposit_amount"),
    ("depositnetamount", "deposit_net_amount"),
    ("commissionreduction", "commission_reduction"),
    # -- installments -----------------------------------------------------------------
    ("firstpayment", "first_payment"),
    ("constantpayment", "constant_payment"),
    ("numberpayments", "number_payments"),
    # -- the order reference ----------------------------------------------------------
    ("productdescription", "product_description"),
    ("transactionid", "transaction_id"),
    ("depositcashierid", "deposit_cashier_id"),
    # -- card -------------------------------------------------------------------------
    ("fourdigits", "four_digits"),
    ("cardownername", "card_owner_name"),
    ("cardname", "card_name"),
    ("cardtype", "card_type"),
    ("companytype", "company_type"),
    ("clearer", "clearer"),
    ("foreign", "foreign"),
    ("expirydate", "expiry_date"),
    ("application", "application"),
    # -- merchant and dates -----------------------------------------------------------
    ("merchantnumber", "merchant_number"),
    ("email", "email"),
    ("paymentdate", "payment_date"),
    ("actiondate", "action_date"),
    # -- fields uPay sends empty ------------------------------------------------------
    ("comment", "comment"),
    ("identitynumber", "identity_number"),
    ("cellphonenotify", "cellphone_notify"),
    ("emailnotify", "email_notify"),
)

#: The three every verdict is computed from. uPay sends its unused fields as empty
#: *values*, so an absent **key** is a broken delivery rather than an empty one -- and
#: defaulting one of these to "" would turn that into a confident wrong answer about money.
_REQUIRED_KEYS = ("amount", "transactionid", "productdescription")

#: Round two B1 observed this on every successful payment. Any other value is a payload
#: shape nobody here has ever seen -- see `UnobservedIpnOutcomeError`.
_PROVIDER_SUCCESS_CODE = "0"


class MalformedIpnError(ValueError):
    """A callback missing a field the verdict is computed from."""


class NotAnOrderIpnError(ValueError):
    """The callback carries no order reference at all, so there is no verdict to give.

    §5.10: 'All IPNs from the shared recurring link arrive with no `public_ref` and land in
    `upay_ipn_record` with `match_status = 'unmatched'`.' Those are legitimate payments from
    real parents -- uPay simply provides no field identifying who paid, which is a confirmed
    provider limitation. Answering `forged_ref` for them would raise a fraud alert on every
    הוראת קבע payment in the club. They belong in the reconciliation queue, and routing them
    there is M6's job, not a verdict this function can give.
    """


class UnobservedIpnOutcomeError(ValueError):
    """`providererrorcode` is not `0`, and no such callback has ever been observed.

    IPNs for failed or declined payments are marked **[NOT COVERED]** in
    `upay-integration.md` -- three live tests never produced one, and §5.10's design
    deliberately does not depend on their existing ('treat "no IPN ever arrived" as a
    failure signal in its own right').

    Both ways of guessing are worse than refusing. Calling it `success` settles charges for
    money that did not arrive. Calling it a failure invents a payload shape nobody has seen
    and would silently swallow the first real one. `ipn.py` already raises rather than
    coerces on an unrecognised amount format for exactly this reason, and the raw callback
    is persisted before any of this runs, so refusing costs nothing and surfaces everything.
    """


@dataclass(frozen=True, slots=True)
class IpnPayload:
    """One inbound callback, parsed. Frozen: it is evidence about money.

    Every field is kept as the string uPay sent. Interpretation is a property, so the
    record and the reading of it never drift apart.
    """

    provider_error_code: str
    error_description: str
    provider_error_description: str
    provider_confirmation_number: str
    amount: str
    deposit_amount: str
    deposit_net_amount: str
    commission_reduction: str
    first_payment: str
    constant_payment: str
    number_payments: str
    product_description: str
    transaction_id: str
    deposit_cashier_id: str
    four_digits: str
    card_owner_name: str
    card_name: str
    card_type: str
    company_type: str
    clearer: str
    foreign: str
    expiry_date: str
    application: str
    merchant_number: str
    email: str
    payment_date: str
    action_date: str
    comment: str
    identity_number: str
    cellphone_notify: str
    email_notify: str

    @property
    def amount_agorot(self) -> int:
        """What the payer was charged, as an integer. Raises on a format we do not know."""
        return agorot_from_ipn_amount(self.amount)

    @property
    def deposit_amount_agorot(self) -> int:
        """Round two B10: a tampered amount came back in **both** money fields. Compared
        independently so a parser reading either one reaches the same verdict.

        `deposit_net_amount` is deliberately not exposed as agorot: round two D observed
        ~1% taken at settlement (a ₪1 payment reported net `1` while the dashboard showed
        ₪0.99 transferred), so it is evidence, never something to reconcile against.
        """
        return agorot_from_ipn_amount(self.deposit_amount)

    @property
    def carries_reference(self) -> bool:
        """False for the recurring path, which sends no reference at all. Distinct from
        `public_ref is None`, which is also true for a reference that is not a UUID."""
        return bool(self.product_description.strip())

    @property
    def public_ref(self) -> uuid.UUID | None:
        """The order reference, or None if this callback does not carry a valid one.

        Round two B3 [VERIFIED] three times out of three: the field the form sends as
        `paymentdetails` comes back named `productdescription`. That rename is real and is
        not a transcription error.
        """
        text = self.product_description.strip()
        if not text:
            return None
        try:
            return uuid.UUID(text)
        except ValueError:
            return None

    def as_raw(self) -> dict[str, str]:
        """Back to uPay's own key names, in round two's order."""
        return {key: getattr(self, attribute) for key, attribute in _FIELDS}


class IpnVerdict(StrEnum):
    """§5.10's threat table has four rows this answers, and §19.5 simulates the same four.

    One vocabulary on purpose: `IpnVerdict.SUCCESS.value == IpnShape.SUCCESS.value`, so a
    test cannot assert the wrong pairing and a shape cannot exist with no verdict.
    """

    #: The reference is ours, the amount matches, the id is new.
    SUCCESS = "success"
    #: Real money arrived for the wrong amount. §5.10 records a `payment` for what actually
    #: came in, allocated to nothing, and raises a high-priority manager alert. **Charges
    #: are not settled.** Never collapse this into a failure -- the money is in the account.
    AMOUNT_MISMATCH = "amount_mismatch"
    #: The reference names no order of ours.
    FORGED_REF = "forged_ref"
    #: Already delivered. 'A second delivery is logged and ignored.'
    DUPLICATE = "duplicate"


def source_ip_is_known(ip: str | None) -> bool:
    """A weak extra signal for M6 to record beside the callback. **Never a gate.**

    §5.10 allows a source-IP allowlist and calls it 'one weak layer, not proof'. Round two
    observed `84.95.87.35` on two of three deliveries and could not get uPay to confirm
    whether it is stable, which is the strongest argument yet for keeping it out of any
    decision: an address that changed would make us refuse real payments, silently, and the
    parent would have paid.

    It is a free function rather than a parameter of `verify_ipn` so that turning it into a
    gate requires changing that function's signature, which a test refuses.
    """
    return ip == IPN_SOURCE_IP


def parse_ipn(raw: Mapping[str, str]) -> IpnPayload:
    """uPay's query string -> `IpnPayload`. No models, no database, no side effects.

    Tolerant of fields uPay adds later -- the raw callback is persisted verbatim by M6, so
    the parse has no reason to be the thing that fails on an unrecognised key.
    """
    missing = [key for key in _REQUIRED_KEYS if key not in raw]
    if missing:
        raise MalformedIpnError(f"callback is missing {', '.join(missing)}")

    return IpnPayload(**{attribute: raw.get(key, "") for key, attribute in _FIELDS})


def verify_ipn(
    payload: IpnPayload,
    *,
    expected_amount_agorot: int,
    known_public_ref: uuid.UUID | None,
    seen_transaction_ids: Container[str],
) -> IpnVerdict:
    """§5.10's four checks, in the order that makes each one safe.

    `known_public_ref` is the reference of the order the endpoint actually found, or None
    when it found no order -- which is itself the forged case, and the path a guessed URL
    takes. `expected_amount_agorot` comes from that order's own row, never from the payload.

    The order of the checks is load-bearing:

    1. **Duplicate first.** A re-delivery was already recorded once, with whatever verdict
       it earned. Re-classifying it could re-raise a manager alert or re-settle charges
       depending on which check happened to run first, and §5.10 wants it simply ignored.
       Idempotence on `transactionid` also neutralises retries whatever uPay really does --
       retry behaviour is [NOT COVERED] and this does not depend on knowing it.
    2. **Then the outcome code**, because a payload shape we have never seen cannot be
       classified at all -- see `UnobservedIpnOutcomeError`.
    3. **Then identity, before money.** Comparing an amount against an order we do not have
       is meaningless, and the two verdicts mean different things downstream:
       `amount_mismatch` records a real payment against *our* order, `forged_ref` names no
       order of ours.
    4. **Then the amount**, as integers, against both fields that carry it.
    """
    if payload.transaction_id in seen_transaction_ids:
        return IpnVerdict.DUPLICATE

    if payload.provider_error_code != _PROVIDER_SUCCESS_CODE:
        raise UnobservedIpnOutcomeError(
            f"providererrorcode={payload.provider_error_code!r} "
            f"({payload.error_description!r}) has never been observed"
        )

    if not payload.carries_reference:
        raise NotAnOrderIpnError(
            "callback carries no order reference -- this is §5.10's recurring path and "
            "belongs in the reconciliation queue, not in a verdict"
        )

    if known_public_ref is None or payload.public_ref != known_public_ref:
        return IpnVerdict.FORGED_REF

    if expected_amount_agorot not in (payload.amount_agorot, payload.deposit_amount_agorot):
        return IpnVerdict.AMOUNT_MISMATCH
    if payload.amount_agorot != payload.deposit_amount_agorot:
        return IpnVerdict.AMOUNT_MISMATCH

    return IpnVerdict.SUCCESS


#: A field added to `IpnPayload` without a `_FIELDS` entry would silently never be parsed.
assert len(_FIELDS) == len(fields(IpnPayload)), "_FIELDS and IpnPayload have drifted"
