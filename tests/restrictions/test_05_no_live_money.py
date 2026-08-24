"""§19.6 restriction 5: the developer account cannot touch live money.

'The demo studio's uPay configuration is pinned to livesystem=0 and a test asserts a
demo studio can never render a live payment form.'

NOT VACUOUS for the pin itself -- the field builder exists and the demo studio row
exists, so both ends are assertable today.

PARTIALLY VACUOUS for coverage: M6 owns the route that renders the form. The final test
in this file is the gate that keeps the pin load-bearing when it lands -- it asserts no
other module in app/ writes a `livesystem` field, so M6 must call this builder rather
than assembling its own dict.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from app.integrations.upay.form import LIVE, SANDBOX, shekels, upay_form_fields
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


def test_a_demo_studio_gets_the_sandbox_flag():
    assert upay_form_fields(studio=_studio(is_demo=True), **COMMON)["livesystem"] == SANDBOX


def test_a_real_studio_gets_the_live_flag():
    """The control. A builder that returned "0" unconditionally would satisfy the
    restriction and break every real payment."""
    assert upay_form_fields(studio=_studio(is_demo=False), **COMMON)["livesystem"] == LIVE


def test_livesystem_cannot_be_passed_in():
    """The pin is derived from the studio, never from an argument. A keyword the caller
    controls is a keyword a caller gets wrong."""
    with pytest.raises(TypeError):
        upay_form_fields(studio=_studio(is_demo=True), livesystem=LIVE, **COMMON)  # type: ignore[call-arg]


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
