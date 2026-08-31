"""SPEC §5.10's server-rendered uPay form, and §19.6's fifth restriction.

M6 owns `payment_order` and the route that renders this. What lives here is the field
builder, plus uPay's endpoint -- because §19.6's 'a demo studio can never render a live
payment form' needs both to have exactly one home. Tests assert that no other module in
app/ writes `livesystem` or names the endpoint.

**How the restriction is enforced, and why it changed.** It used to be a pin:
`livesystem = "0"` for a demo studio. That delegated the guarantee to uPay -- we could
assert what we *send*, never what uPay *does with it*. Live testing (upay-integration.md
§Round two, A3) then established that the merchant account has no sandbox mode to test
against, so the flag's effect is unverified and may be nothing. A demo walkthrough would
have charged a real card on a live account, with every test still green.

So the demo studio does not get a weaker form. **It gets no form:**
`upay_form_fields` raises `DemoStudioHasNoLiveFormError`. `livesystem` is now the constant
`LIVE`, because every form this module builds is a real one. M6 renders the demo studio's
payment step against §19.5's IPN simulator instead, which never leaves our own origin.

**Money.** upay-integration.md shows `float(request.args['amount'])`. That is not
followed: SPEC §4.3 stores `expected_amount_agorot INTEGER`, G2 forbids floats and
invariant 1 fails the build on one. The conversion to uPay's decimal-shekel field is
integer arithmetic, it happens here and nowhere else, and it returns a string.

**Outbound and inbound amounts are different formats.** `shekels()` is the *outbound*
one: uPay accepts "320.00" on the form, verified. It is **not** what comes back -- a ₪1
payment returned `amount=1`. Parsing an IPN uses `app.integrations.upay.ipn`, never this.

**No signature exists** on this form (upay-integration.md §"Important caveat", reconfirmed
in round two). Nothing here is trusted on the way back; §5.10's reconciliation compares
the IPN against `expected_amount_agorot` on our own row.
"""

from __future__ import annotations

import uuid

from app.models.studio import Studio

#: The one place uPay's host appears in `app/`. A test enforces that; see the module
#: docstring for why refusing to build fields is no guarantee if a route can post
#: its own dict to this URL.
UPAY_ENDPOINT = "https://app.upay.co.il/API6/clientsecure/redirectpage.php"

#: uPay's own field value. A string, because it is a form field. There is deliberately
#: no SANDBOX constant: `livesystem=0` is not a control we rely on (see docstring), and
#: a named constant for it invites exactly the delegation this module stopped doing.
LIVE = "1"

#: Round two A1: the dashboard's installment dropdown stops at 12, and what uPay does
#: with a larger `maxpayments` posted straight to the form was never tested. Clamping
#: here means it never has to be -- an untested branch is one nobody has to guess about.
MAX_INSTALLMENTS = 12

#: uPay's `refername`, which is an allowlisted value and NOT the free text round two
#: recorded. Only this exact string (and omitting the field) returns a card page on this
#: merchant account; every other value tried, lowercase `upay` included, comes back as
#: `wronginputrefername <value>` in a 33-byte HTTP 200. See the `refername` field below
#: and `tests/upay/test_form.py` for the probe that established it.
REFERNAME = "UPAY"


class TooManyInstallmentsError(ValueError):
    """`max_payments` above what the merchant account offers (`MAX_INSTALLMENTS`)."""


class DemoStudioHasNoLiveFormError(RuntimeError):
    """§19.6 restriction 5, enforced rather than configured.

    Raised instead of returning a sandbox-flagged form, so that a demo studio reaching
    the payment step is a loud failure in our code rather than a quiet dependency on
    uPay honouring a flag we have never been able to test.
    """


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
    """The hidden fields of §5.10's auto-submitting form, for a real studio.

    Raises `DemoStudioHasNoLiveFormError` for a demo studio (§19.6 restriction 5). The check
    is on `studio`, not on a keyword: a keyword the caller controls is a keyword a caller
    gets wrong, and the cost of getting this one wrong is a real charge on a real card
    during a demo.
    """
    if studio.is_demo:
        raise DemoStudioHasNoLiveFormError(
            f"studio {studio.slug!r} is the demo studio (§19.6 restriction 5): it has no "
            "live payment form. Render §19.5's IPN simulator instead -- uPay's sandbox "
            "flag is not a control this account supports."
        )
    if not 1 <= max_payments <= MAX_INSTALLMENTS:
        raise TooManyInstallmentsError(
            f"max_payments={max_payments}: the merchant account offers 1..{MAX_INSTALLMENTS}"
        )
    return {
        "email": merchant_email,
        "amount": shekels(expected_amount_agorot),
        "returnurl": return_url,
        "ipnurl": ipn_url,
        # §5.10 -- a UUIDv4 public_ref, never a sequential id: a sequential id here
        # would let anyone mark any tuition paid.
        "paymentdetails": str(order_public_ref),
        # Round two, A1: the dashboard's installment dropdown stops at 12. Behaviour
        # above that was never tested, so M6 clamps rather than finding out in production.
        "maxpayments": str(max_payments),
        "livesystem": LIVE,
        # Round two A2: this does produce a real document, but a קבלה (receipt), not a
        # חשבונית מס (tax invoice), whatever the account config says. M6 stores
        # transactionid and links to uPay's own receipt view rather than inferring one.
        "createinvoiceandreceipt": "1",
        # NOT free text. Round two A4 recorded it as such and flagged in the same breath
        # that "STUDIOMANAGER" had never actually been submitted -- it was an example in
        # the document, nothing more. A real parent submitted it on 2026-08-31 and uPay
        # answered HTTP 200 with a 33-byte body reading `wronginputrefername
        # STUDIOMANAGER`: a rejection dressed as a success, rendered as one line of
        # English on a white screen where the card form should have been. Probing the live
        # account one field at a time, `UPAY` and omitting the field both return the real
        # 38kB card page; `STUDIOMANAGER`, `Gladiator` and lowercase `upay` are all
        # refused. It is a case-sensitive allowlist and `UPAY` is this account's entry.
        # `tests/upay/test_form.py` pins the literal and carries the full probe, because
        # nothing CI can run reaches uPay to check it.
        "refername": REFERNAME,
        "lang": "HE",
        "currency": "NIS",
    }
