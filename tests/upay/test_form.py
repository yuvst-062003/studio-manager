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
    assert fields["paymentdetails"] == str(order.public_ref)
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
