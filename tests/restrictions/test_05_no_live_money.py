"""§19.6 restriction 5: the developer account cannot touch live money.

**Redesigned 2026-08-25, after live testing.** The restriction used to read 'the demo
studio's uPay configuration is pinned to livesystem=0'. That pin was never load-bearing,
because it delegates the guarantee to uPay: the tests could assert that we *send* "0",
never that uPay *honours* it. Live testing then found the account has no sandbox mode to
test against (upay-integration.md §Round two, A3), so the flag's effect is unverified and
may be nothing at all. A safety property that CI cannot verify is not a safety property.

What replaces it holds in our own code: **`upay_form_fields` refuses to build a form for
a demo studio at all.** There is no argument, no configuration and no third-party
behaviour between the demo studio and the guarantee -- the function raises. `livesystem`
is now a constant `LIVE`, because the only forms this module builds are real ones.

`DEMO_UPAY_SETTINGS = {"livesystem": 0}` on the demo studio row stays as defence in
depth. It is no longer what the restriction rests on.

Still PARTIALLY VACUOUS for coverage: M6 owns the route. The last two tests are the gates
that keep this load-bearing when it lands -- nothing else in app/ may write `livesystem`,
and nothing else may name uPay's endpoint.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from app.integrations.upay.form import (
    LIVE,
    UPAY_ENDPOINT,
    DemoStudioHasNoLiveFormError,
    TooManyInstallmentsError,
    shekels,
    upay_form_fields,
)
from app.models.studio import Studio

ROOT = Path(__file__).resolve().parents[2]

COMMON = {
    "order_public_ref": uuid.UUID("11111111-1111-4111-8111-111111111111"),
    "expected_amount_agorot": 32000,
    "max_payments": 1,
    "merchant_email": "merchant@example.invalid",
    "return_url": "https://example.invalid/payment-complete",
    "ipn_url": "https://example.invalid/api/v1/webhooks/upay/1111",
}


def _studio(*, is_demo: bool) -> Studio:
    return Studio(name="x", slug="x", is_demo=is_demo, settings={})


def test_a_demo_studio_cannot_get_a_upay_form_at_all():
    """The restriction itself. Not 'gets a sandbox flag' -- gets nothing.

    The old assertion was that a demo studio's form carried livesystem="0". That is a
    statement about what we send, and the thing that must never happen -- a real card
    charged during a demo -- depends on what uPay does with it. This one cannot be
    satisfied by a third party behaving unexpectedly.
    """
    with pytest.raises(DemoStudioHasNoLiveFormError):
        upay_form_fields(studio=_studio(is_demo=True), **COMMON)


def test_the_refusal_names_the_studio_so_the_log_is_actionable():
    with pytest.raises(DemoStudioHasNoLiveFormError, match="demo"):
        upay_form_fields(studio=_studio(is_demo=True), **COMMON)


def test_a_real_studio_still_gets_a_live_form():
    """The control. A builder that raised unconditionally would satisfy the restriction
    and break every real payment."""
    assert upay_form_fields(studio=_studio(is_demo=False), **COMMON)["livesystem"] == LIVE


def test_livesystem_cannot_be_passed_in():
    """Not a parameter, and now not a branch either. A keyword the caller controls is a
    keyword a caller gets wrong."""
    with pytest.raises(TypeError):
        upay_form_fields(studio=_studio(is_demo=False), livesystem=LIVE, **COMMON)  # type: ignore[call-arg]


def test_installments_are_clamped_to_what_the_account_actually_offers():
    """Round two A1: the dashboard's dropdown stops at 12, and posting a larger
    maxpayments straight to the form was never tested. Refusing here means M6 never
    finds out in production what uPay does with 24."""
    assert upay_form_fields(studio=_studio(is_demo=False), **COMMON | {"max_payments": 12})
    for bad in (0, 13, 24):
        with pytest.raises(TooManyInstallmentsError):
            upay_form_fields(studio=_studio(is_demo=False), **COMMON | {"max_payments": bad})


def test_the_order_reference_is_the_public_ref_not_a_sequential_id():
    """§5.10: 'public_ref is a UUIDv4, never a sequential id. Sequential ids in this
    endpoint would let anyone mark any tuition paid.'"""
    fields = upay_form_fields(studio=_studio(is_demo=False), **COMMON)
    assert fields["paymentdetails"] == str(COMMON["order_public_ref"])


def test_money_crosses_the_boundary_as_integer_arithmetic():
    """G2 / invariant 1. upay-integration.md's snippet uses float(); SPEC §4.3 stores
    _agorot INTEGER, and SPEC wins. The conversion happens here and nowhere else."""
    assert shekels(32000) == "320.00"
    assert shekels(32050) == "320.50"
    assert shekels(5) == "0.05"
    assert shekels(0) == "0.00"


def test_the_amount_field_is_a_string_not_a_float():
    fields = upay_form_fields(studio=_studio(is_demo=False), **COMMON)
    assert fields["amount"] == "320.00"
    assert all(isinstance(v, str) for v in fields.values())


def test_no_other_module_decides_livesystem():
    """The gate that keeps this restriction load-bearing after M6.

    Source-level by necessity: 'M6's form route called this builder' is not observable
    until that route exists. What IS checkable now is that nothing else in app/ writes
    the field, so the pin has exactly one implementation to get right.

    `app/services/demo/__init__.py` is excluded on purpose, not by oversight: its
    `DEMO_UPAY_SETTINGS = {"livesystem": 0}` is the ROW-level pin (SPEC §19.6, written by
    Alembic 0003 onto the demo studio's `settings`), a static constant that never
    branches on anything. It does not *decide* livesystem for a form -- it is data one
    layer down, complementary to this builder's studio.is_demo check: a code path that
    forgets to call this builder still cannot read a live flag off that row. Deciding
    the field for an actual form remains exactly one function's job.
    """
    excluded = {
        ROOT / "app/integrations/upay/form.py",
        ROOT / "app/services/demo/__init__.py",
    }
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        if path in excluded:
            continue
        if re.search(r"['\"]livesystem['\"]", path.read_text(encoding="utf-8")):
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == [], (
        "livesystem is decided in app/integrations/upay/form.py and nowhere else "
        f"(§19.6) -- these also write it: {offenders}"
    )


def test_no_other_module_names_upays_endpoint():
    """The second half of the gate, and the one that matters now.

    Refusing to build the *fields* is only a guarantee if the fields are the only way to
    reach uPay. A route that hardcodes the endpoint and posts its own dict would walk
    straight past `upay_form_fields` and its refusal. So the URL, like `livesystem`, gets
    exactly one home -- and M6's form route must import it from here.
    """
    host = "app.upay.co.il"
    offenders = [
        str(path.relative_to(ROOT))
        for path in sorted((ROOT / "app").rglob("*.py"))
        if path != ROOT / "app/integrations/upay/form.py"
        and host in path.read_text(encoding="utf-8")
    ]
    assert offenders == [], (
        f"uPay's endpoint is named in app/integrations/upay/form.py and nowhere else "
        f"(§19.6) -- these also name it: {offenders}"
    )
    assert host in UPAY_ENDPOINT, "the constant this test guards moved"
