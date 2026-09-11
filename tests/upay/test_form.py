"""§5.10 step 2 -- the server-rendered, auto-submitting uPay form.

`app/integrations/upay/form.py` is already written and already refuses a demo studio. What
this file asserts is that M6 renders it the one legal way: the amount comes from the
ORDER's own row, the reference is that order's `public_ref`, and the ipnurl is the endpoint
that receives it.

The "no module but form.py names uPay's endpoint" rule is NOT asserted here. It already
lives in `tests/restrictions/test_05_no_live_money.py`, which runs unscoped in every lane --
so every lane fails on the first violation rather than only this one. Two files with an
opinion about one rule is how they drift.
"""

from __future__ import annotations

import pytest
from app.integrations.upay.form import DemoStudioHasNoLiveFormError, shekels
from app.services.billing.orders import MerchantEmailMissingError, OrderService
from tests.billing.conftest import MONTHLY_AGOROT, T0


def test_the_form_carries_the_server_s_amount_and_the_order_s_reference(
    tenant_session, studio, a_priced_student, three_open_months, a_merchant_email
):
    service = OrderService(tenant_session)
    order = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=list(three_open_months),
        max_payments=3,
        at=T0,
    )
    fields = service.form_fields(order.public_ref, base_url="https://studio.example")
    assert fields["amount"] == shekels(MONTHLY_AGOROT * 3)
    # Carried inside the field rather than being the whole of it since 2026-09-11 --
    # `test_paymentdetails_names_the_club_before_it_carries_the_reference` below owns why.
    assert str(order.public_ref) in fields["paymentdetails"]
    assert fields["ipnurl"].endswith(f"/api/v1/webhooks/upay/{order.public_ref}")
    assert fields["maxpayments"] == "3"
    assert fields["livesystem"] == "1"
    assert fields["currency"] == "NIS"
    assert fields["lang"] == "HE"


def test_the_outbound_amount_format_is_not_the_inbound_one():
    """upay-integration.md round two B4, the correction that would otherwise have reached
    production: the form takes `1.00` and the callback returns `1`. A parser comparing the
    IPN against `shekels()` would raise a fraud alert on every correct whole-shekel
    payment -- and every charge in this product is whole shekels."""
    from app.integrations.upay.ipn import ipn_amount

    assert shekels(100) == "1.00"
    assert ipn_amount(100) == "1"
    assert shekels(100) != ipn_amount(100)


def test_a_demo_studio_gets_no_form_at_all(
    a_demo_tenant_session, a_demo_studio, a_demo_order, a_merchant_email
):
    """§19.6 restriction 5, as amended 2026-08-25. Not a sandbox-flagged form -- NO form.
    The account has no sandbox mode, so `livesystem=0` is a guarantee nobody can verify, and
    a demo walkthrough would have charged a real card with every test green."""
    with pytest.raises(DemoStudioHasNoLiveFormError):
        OrderService(a_demo_tenant_session).form_fields(
            a_demo_order.public_ref, base_url="https://studio.example"
        )


@pytest.mark.parametrize("value", ["", "   ", None])
def test_a_missing_or_blank_merchant_email_refuses_to_build_a_form(
    tenant_session, studio, a_priced_student, three_open_months, monkeypatch, value
):
    """The committed environment template ships `UPAY_MERCHANT_EMAIL=` empty, and `""` is
    not `None` -- the same trap that made `dev_tools_allowed` and `DevClockMiddleware`
    disagree about the developer token.

    Here the cost is worse than a refused request. `email=` on the form is a real payer sent
    to a real hosted page to pay an account that does not exist, and `upay_form_fields`
    checks `studio.is_demo` and nothing else, so nothing downstream would stop it. Refusing
    to build a form is always better than building one that charges nobody.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "UPAY_MERCHANT_EMAIL", value)
    service = OrderService(tenant_session)
    order = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    with pytest.raises(MerchantEmailMissingError):
        service.form_fields(order.public_ref, base_url="https://studio.example")


def test_refername_is_the_value_upay_s_allowlist_actually_accepts(
    tenant_session, studio, a_priced_student, three_open_months, a_merchant_email
):
    """`refername` is a case-sensitive allowlist, not free text -- and the wrong value
    fails SILENTLY, with an HTTP 200.

    upay-integration.md round two A4 recorded `refername` as "free text", and noted in the
    same breath that the literal this module shipped had "never actually been submitted; it
    was only ever an example in this document". It was submitted for the first time by a
    real parent paying real tuition on 2026-08-31, and uPay answered:

        HTTP 200, content-type text/html, 33 bytes
        wronginputrefername STUDIOMANAGER

    A 200 with a plain-text body, so the browser rendered it as a page. The parent left our
    origin, landed on one line of English on a white screen, and no payment page ever
    existed. Probed against the live account the same evening, one field varied at a time:

        refername=UPAY           -> 38681 bytes, the real card form, 600.00 ₪
        refername omitted        -> 38681 bytes, the real card form
        refername=STUDIOMANAGER  -> 33 bytes,  wronginputrefername STUDIOMANAGER
        refername=Gladiator      -> 29 bytes,  wronginputrefername Gladiator
        refername=upay           -> 24 bytes,  wronginputrefername upay

    So it is an allowlist, it is case-sensitive, and `UPAY` is the entry this merchant
    account has. The literal is pinned here rather than only in `form.py` because no test
    CI can run reaches uPay: the only proof this string is right is the probe above, and
    this test is where that evidence is written down. **If you change the value in
    `form.py`, this test fails -- go and re-run the probe against the live account before
    you change it here too.**
    """
    service = OrderService(tenant_session)
    order = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    fields = service.form_fields(order.public_ref, base_url="https://studio.example")
    assert fields["refername"] == "UPAY"


def test_paymentdetails_names_the_club_before_it_carries_the_reference(
    tenant_session, studio, a_priced_student, three_open_months, a_merchant_email
):
    """`paymentdetails` is what the PAYER reads, and it must say who is being paid.

    uPay returns this field as `productdescription`, and bit renders it as the payment's
    description. The first live payment (2026-09-11) showed the parent a bare UUID and
    nothing else -- the club's name appeared nowhere on the bit screen, which says only
    "בקשת תשלום מבית העסק באמצעות Upay". A parent who has been told to expect a judo
    club and is shown a hex string has every reason to close the page.

    The club name comes FIRST because that is the half a truncated string should keep for
    the payer; the reference is still in there, and `IpnPayload.public_ref` now finds it
    anywhere in the field. If uPay ever truncates it away, the callback lands `unmatched`
    in the reconciliation queue rather than settling the wrong thing -- see the field's own
    comment in `form.py` for why that is the acceptable failure.

    **Truncation was measured, not assumed.** `upay-integration.md` documents eleven form
    fields and no length limits, so the same probe that settled `refername` was run against
    the live account on 2026-09-11 -- one POST per variant, every other field exactly what
    `form_fields` produces, and the card page read back and searched for the string sent:

        paymentdetails = <uuid>                     (36)  -> 38673 B, echoed verbatim
        paymentdetails = "מועדון גלדיאטור · <uuid>"  (54)  -> 38739 B, echoed verbatim
        paymentdetails = <40 Hebrew chars>+uuid      (79)  -> 38841 B, echoed verbatim
        paymentdetails = <120 Hebrew chars>+uuid    (159)  -> echoed verbatim

    The page grows with the field and contains the whole of it at 159 characters, which is
    twice `STUDIO_NAME_IN_DETAILS` plus a reference. Nobody paid any of those pages: a
    fresh UUID belonging to no order was used, so even a stray payment would have landed
    `unmatched` rather than settling somebody's tuition. Note what this does NOT prove --
    that the IPN echoes the field verbatim too. Only a live payment shows that, and the
    parser is tolerant precisely so the unproven half degrades into a queue.
    """
    service = OrderService(tenant_session)
    order = service.create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]],
        max_payments=1,
        at=T0,
    )
    details = service.form_fields(order.public_ref, base_url="https://studio.example")[
        "paymentdetails"
    ]

    assert details.startswith(studio.name)
    assert str(order.public_ref) in details
