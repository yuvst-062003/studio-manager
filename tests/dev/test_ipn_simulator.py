"""§19.5 -- 'Simulate a uPay IPN. The important one. Fires a synthetic callback in four
shapes: a clean success, an amount mismatch, a forged order reference, and a duplicate
transactionid. These are the four security requirements from §5.10, and without a
simulator they are only testable against live money.'

The payload shapes are asserted in full here. What is NOT asserted is what the server
does with them -- M6 owns GET /webhooks/upay/{public_ref}, upay_ipn_record and the
reconciliation worker. `delivered=False` in the response is the honest report of that,
not a failure.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.integrations.upay.ipn import IPN_SOURCE_IP, IpnShape, build_ipn_query
from fastapi.testclient import TestClient
from tests.dev.conftest import app_in_env

REF = uuid.UUID("22222222-2222-4222-8222-222222222222")
EXPECTED = 32000


def _query(shape: IpnShape, **kwargs) -> dict[str, str]:
    return build_ipn_query(
        shape=shape,
        order_public_ref=REF,
        expected_amount_agorot=EXPECTED,
        transaction_id="TX-1",
        payment_date=date(2026, 8, 20),
        **kwargs,
    )


def test_there_are_exactly_four_shapes():
    """§19.5 names four. A fifth added without a spec change is a shape nobody
    designed a mitigation for."""
    assert {s.value for s in IpnShape} == {
        "success",
        "amount_mismatch",
        "forged_ref",
        "duplicate",
    }


def test_success_carries_the_expected_amount_and_the_real_reference():
    q = _query(IpnShape.SUCCESS)
    assert q["errordescription"] == "SUCCESS"
    assert q["providererrorcode"] == "0"
    assert q["amount"] == "320.00"
    assert q["productdescription"] == str(REF)
    assert q["transactionid"] == "TX-1"


def test_amount_mismatch_differs_by_the_smallest_possible_amount():
    """One agora. §5.10's mitigation is 'never trust the IPN's amount, compare against
    expected_amount_agorot' -- a simulator that differed by 100₪ would pass a check
    that only compared the shekel part."""
    q = _query(IpnShape.AMOUNT_MISMATCH)
    assert q["amount"] == "319.99"
    assert q["productdescription"] == str(REF)


def test_forged_ref_names_an_order_that_does_not_exist():
    """§5.10: 'public_ref is a UUIDv4, never a sequential id.' The forged shape must
    still LOOK like a UUID, or the endpoint would reject it as malformed before
    reaching the lookup this is meant to exercise."""
    q = _query(IpnShape.FORGED_REF)
    assert uuid.UUID(q["productdescription"]) != REF
    assert q["amount"] == "320.00"


def test_duplicate_is_byte_identical_to_the_success_it_repeats():
    """§5.10's mitigation is idempotence on transactionid. A duplicate that differed in
    any other field would also be caught by a weaker check, and the test would pass
    while the real threat went unmitigated."""
    assert _query(IpnShape.DUPLICATE) == _query(IpnShape.SUCCESS)


def test_the_card_details_have_sensible_defaults():
    """§5.10's reconciliation matches on (normalized card owner name, last 4 digits),
    so both must be present and stable across a repeated simulation."""
    q = _query(IpnShape.SUCCESS)
    assert q["fourdigits"].isdigit() and len(q["fourdigits"]) == 4
    assert q["cardownername"]


def test_the_payload_carries_every_field_upay_sends():
    """upay-integration.md §4. A simulator missing a field is a parser that was never
    tested against it."""
    assert set(_query(IpnShape.SUCCESS)) == {
        "errordescription",
        "providererrorcode",
        "amount",
        "transactionid",
        "productdescription",
        "cardownername",
        "fourdigits",
        "paymentdate",
    }


def test_the_documented_source_ip_is_recorded_not_invented():
    """§5.10's weak layer: 'Source-IP allowlist (84.95.87.35, configurable). Treated as
    one weak layer, not proof.' Recorded here so M6's allowlist and the simulator agree
    on the value."""
    assert IPN_SOURCE_IP == "84.95.87.35"


# -- the endpoint -------------------------------------------------------------
@pytest.mark.parametrize("shape", [s.value for s in IpnShape])
def test_the_endpoint_returns_the_query_it_would_send(shape):
    with app_in_env("development") as application:
        body = (
            TestClient(application)
            .post(
                "/api/v1/dev/upay/simulate-ipn",
                json={
                    "shape": shape,
                    "order_public_ref": str(REF),
                    "expected_amount_agorot": EXPECTED,
                },
            )
            .json()
        )
    assert body["shape"] == shape
    assert body["query"]["productdescription"]


def test_the_endpoint_reports_honestly_that_m6_has_not_landed():
    """`delivered: false` with a note naming the milestone, rather than a 200 that
    implies something happened. The moment M6 mounts GET /webhooks/upay/{public_ref},
    this flips to true with no change here -- and this test goes red, which is the
    signal to delete it."""
    with app_in_env("development") as application:
        body = (
            TestClient(application)
            .post(
                "/api/v1/dev/upay/simulate-ipn",
                json={
                    "shape": "success",
                    "order_public_ref": str(REF),
                    "expected_amount_agorot": EXPECTED,
                },
            )
            .json()
        )
    assert body["delivered"] is False
    assert "M6" in body["note"]


def test_the_endpoint_does_not_exist_in_production():
    with app_in_env("production") as application:
        response = TestClient(application).post(
            "/api/v1/dev/upay/simulate-ipn",
            json={
                "shape": "success",
                "order_public_ref": str(REF),
                "expected_amount_agorot": EXPECTED,
            },
        )
    assert response.status_code == 404
