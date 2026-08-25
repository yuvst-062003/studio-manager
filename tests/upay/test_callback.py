"""§5.10's four security verdicts, over the bytes §19.5's simulator actually sends.

Every payload here is built with `ipn.build_ipn_query(shape=...)` rather than hand-written
in this file. That is the whole point: the simulator and the parser are then provably
tested against the *same* bytes, and the failure mode that produced round two's amount-format
correction -- a simulator that agreed with a string-comparing parser while uPay disagreed
with both -- cannot come back without one of these tests going red.

**There is no HMAC.** `upay-integration.md` marks 'no signature exists on any request,
inbound or outbound' [VERIFIED] in both rounds. Nothing here verifies one. What §5.10
actually mandates is a UUIDv4 reference, an independent server-side amount comparison,
idempotence on `transactionid`, and a source-IP signal that is never a gate.

**Not covered here, because M6 owns it:** `GET /webhooks/upay/{public_ref}`,
`upay_ipn_record`, `payment_order` and the reconciliation worker.
"""

from __future__ import annotations

import inspect
import uuid
from dataclasses import FrozenInstanceError
from datetime import date

import pytest
from app.integrations.upay.callback import (
    IpnPayload,
    IpnVerdict,
    MalformedIpnError,
    NotAnOrderIpnError,
    UnobservedIpnOutcomeError,
    parse_ipn,
    source_ip_is_known,
    verify_ipn,
)
from app.integrations.upay.ipn import (
    IPN_SOURCE_IP,
    IpnShape,
    build_ipn_query,
)

REF = uuid.UUID("33333333-3333-4333-8333-333333333333")
#: ₪320. Every charge in this product is whole shekels (round two B4).
EXPECTED = 32000


def _query(shape: IpnShape, *, transaction_id: str = "TX-1", **kwargs) -> dict[str, str]:
    return build_ipn_query(
        shape=shape,
        order_public_ref=REF,
        expected_amount_agorot=EXPECTED,
        transaction_id=transaction_id,
        payment_date=date(2026, 9, 1),
        **kwargs,
    )


def _verdict(
    raw: dict[str, str],
    *,
    expected_amount_agorot: int = EXPECTED,
    known_public_ref: uuid.UUID | None = REF,
    seen_transaction_ids: frozenset[str] = frozenset(),
) -> IpnVerdict:
    return verify_ipn(
        parse_ipn(raw),
        expected_amount_agorot=expected_amount_agorot,
        known_public_ref=known_public_ref,
        seen_transaction_ids=seen_transaction_ids,
    )


# -- §5.10's four security requirements, one test each ----------------------------------


def test_a_clean_payment_is_a_success_and_its_amount_is_exact():
    """The happy path. `amount` must parse to exactly the expected agorot -- not close,
    not rounded. G2: money is an integer count and a float never touches it."""
    payload = parse_ipn(_query(IpnShape.SUCCESS))

    assert payload.amount_agorot == EXPECTED
    assert payload.public_ref == REF
    assert (
        verify_ipn(
            payload,
            expected_amount_agorot=EXPECTED,
            known_public_ref=REF,
            seen_transaction_ids=frozenset(),
        )
        is IpnVerdict.SUCCESS
    )


def test_a_one_agora_difference_is_a_mismatch_and_the_real_amount_survives():
    """'Client tampers with amount before submitting' -> never trust the IPN's amount.

    One agora is the smallest difference the comparison must still catch. And the payload
    keeps what actually arrived, because §5.10 records a `payment` for the real amount
    received: a verdict that discarded it would lose money that is in the merchant account.
    """
    payload = parse_ipn(_query(IpnShape.AMOUNT_MISMATCH))

    assert payload.amount_agorot == EXPECTED - 1
    assert (
        verify_ipn(
            payload,
            expected_amount_agorot=EXPECTED,
            known_public_ref=REF,
            seen_transaction_ids=frozenset(),
        )
        is IpnVerdict.AMOUNT_MISMATCH
    )


def test_a_reference_no_order_carries_is_forged():
    """'Anyone can forge an IPN for a guessed order' -> `public_ref` is a UUIDv4.

    The forged shape is a *well-formed* UUID, so the check being tested is 'does an order
    carry this reference', not 'is this parseable'. A sequential id here would let anyone
    mark any tuition paid.
    """
    payload = parse_ipn(_query(IpnShape.FORGED_REF))

    assert payload.public_ref != REF
    assert payload.public_ref is not None  # well-formed, just not ours
    assert (
        verify_ipn(
            payload,
            expected_amount_agorot=EXPECTED,
            known_public_ref=REF,
            seen_transaction_ids=frozenset(),
        )
        is IpnVerdict.FORGED_REF
    )


def test_an_order_that_does_not_exist_at_all_is_also_forged():
    """The endpoint looked the reference up and found nothing. Same verdict, and this is
    the path a guessed URL actually takes."""
    assert _verdict(_query(IpnShape.FORGED_REF), known_public_ref=None) is IpnVerdict.FORGED_REF


def test_a_repeated_transaction_id_is_a_duplicate():
    """'Duplicate IPN delivery' -> idempotent on `transactionid`. Byte-identical to the
    success it repeats, so nothing weaker than the id check can catch it."""
    first = _query(IpnShape.SUCCESS, transaction_id="TX-DUP")
    again = _query(IpnShape.DUPLICATE, transaction_id="TX-DUP")

    assert again == first, "the duplicate shape must repeat the success byte for byte"
    assert _verdict(first) is IpnVerdict.SUCCESS
    assert _verdict(again, seen_transaction_ids=frozenset({"TX-DUP"})) is IpnVerdict.DUPLICATE


# -- the two traps round two found -------------------------------------------------------


def test_the_tamper_is_caught_from_either_field_that_carries_it():
    """Round two B10: an edited amount came back in `amount` **and** `depositamount`, both
    unmodified. A parser that happened to read `depositamount` must reach the same verdict
    as one reading `amount`, or the tamper test passes while the tamper gets through."""
    raw = _query(IpnShape.AMOUNT_MISMATCH)
    payload = parse_ipn(raw)

    assert raw["amount"] == raw["depositamount"]
    assert payload.amount_agorot == payload.deposit_amount_agorot
    assert _verdict(raw) is IpnVerdict.AMOUNT_MISMATCH


def test_a_whole_shekel_amount_is_not_a_mismatch():
    """The regression that would fire a fraud alert on **every correct payment** in this
    product.

    A ₪1 payment comes back as `amount=1`, not `1.00` (round two B4, [VERIFIED]). Every
    charge here is whole shekels, so a parser that compares against the outbound
    `form.shekels()` rendering calls all of them tampered -- and §5.10 escalates
    `amount_mismatch` to a manager as suspected fraud.
    """
    raw = build_ipn_query(
        shape=IpnShape.SUCCESS,
        order_public_ref=REF,
        expected_amount_agorot=100,
        transaction_id="TX-WHOLE",
        payment_date=date(2026, 9, 1),
    )

    assert raw["amount"] == "1", "the simulator must send uPay's inbound format, not 1.00"
    assert _verdict(raw, expected_amount_agorot=100) is IpnVerdict.SUCCESS


# -- ordering: which verdict wins when two apply ------------------------------------------


def test_a_duplicate_wins_over_every_other_verdict():
    """A re-delivery is decided before anything else is looked at. It has already been
    recorded once with whatever verdict it earned, and §5.10 says a second delivery is
    'logged and ignored' -- re-classifying it would let a replay re-raise a manager alert,
    or re-settle charges, depending on which check ran first."""
    seen = frozenset({"TX-REPLAY"})

    for shape in (IpnShape.AMOUNT_MISMATCH, IpnShape.FORGED_REF):
        raw = _query(shape, transaction_id="TX-REPLAY")
        assert _verdict(raw, seen_transaction_ids=seen) is IpnVerdict.DUPLICATE


def test_identity_is_settled_before_money():
    """A forged reference whose amount is also wrong is FORGED_REF, not AMOUNT_MISMATCH.

    The two verdicts mean different things downstream: `amount_mismatch` records a real
    `payment` for money that arrived against **our** order, while a forged reference names
    no order of ours at all. Comparing an amount against an order we do not have is
    meaningless, so identity is answered first.
    """
    raw = _query(IpnShape.FORGED_REF)
    assert _verdict(raw, expected_amount_agorot=EXPECTED + 500) is IpnVerdict.FORGED_REF


# -- the source IP is a signal, and structurally cannot become a gate ----------------------


def test_the_source_ip_is_not_an_input_to_the_verdict():
    """§5.10: 'Treated as one weak layer, not proof.' Round two saw it on two of three
    deliveries and could not get uPay to confirm it is stable.

    The strongest way to keep it from becoming a gate is for `verify_ipn` not to *have* an
    IP parameter -- then no later edit can quietly start refusing payments from an address
    that changed, which would silently drop real money.
    """
    parameters = inspect.signature(verify_ipn).parameters
    assert not [name for name in parameters if "ip" in name.lower()]


def test_the_source_ip_signal_recognises_the_documented_address_and_nothing_else():
    assert source_ip_is_known(IPN_SOURCE_IP) is True
    assert source_ip_is_known("203.0.113.7") is False
    assert source_ip_is_known(None) is False


# -- parsing: the whole payload, and what it refuses ---------------------------------------


def test_every_field_upay_sends_survives_the_parse():
    """All 31 round-two fields. A field dropped here is a field no downstream code can
    ever look at -- `cardownername` and `fourdigits` are what §5.10's `payer_fingerprint`
    is built from, and losing them would take the reconciliation path with them."""
    raw = _query(IpnShape.SUCCESS)
    payload = parse_ipn(raw)

    assert payload.as_raw() == raw


def test_an_unknown_field_does_not_break_the_parse():
    """uPay may add a field without telling us. The raw callback is persisted verbatim by
    M6 either way, so the parse has no reason to be the thing that fails."""
    raw = _query(IpnShape.SUCCESS) | {"somethingnew": "7"}
    assert parse_ipn(raw).amount_agorot == EXPECTED


@pytest.mark.parametrize("missing", ["amount", "transactionid", "productdescription"])
def test_a_payload_missing_a_field_the_verdict_needs_is_loud(missing):
    """These three are what every verdict is computed from. Defaulting one to an empty
    string would turn a broken delivery into a confident wrong answer about money."""
    raw = _query(IpnShape.SUCCESS)
    del raw[missing]
    with pytest.raises(MalformedIpnError):
        parse_ipn(raw)


def test_a_recurring_payment_carries_no_reference_and_is_not_called_forged():
    """§5.10: 'All IPNs from the shared recurring link arrive with no `public_ref` and land
    in `upay_ipn_record` with `match_status = 'unmatched'`.'

    Those are legitimate payments from real parents. Classifying them as forged would raise
    a fraud alert on every הוראת קבע payment in the club, so `verify_ipn` refuses to answer
    rather than answering wrongly -- the reconciliation queue is M6's route for them, not a
    verdict.
    """
    raw = _query(IpnShape.SUCCESS) | {"productdescription": ""}
    payload = parse_ipn(raw)

    assert payload.public_ref is None
    with pytest.raises(NotAnOrderIpnError):
        verify_ipn(
            payload,
            expected_amount_agorot=EXPECTED,
            known_public_ref=None,
            seen_transaction_ids=frozenset(),
        )


def test_a_provider_outcome_we_have_never_observed_is_refused_not_guessed():
    """IPNs for failed or declined payments are **[NOT COVERED]** -- never observed in
    three live tests.

    Calling an unknown outcome SUCCESS settles charges for money that did not arrive;
    calling it a failure invents a payload shape nobody has seen. This module already
    raises rather than coerces on an unrecognised amount format, for the same reason, and
    the raw callback is persisted before parsing, so a human sees the real thing.
    """
    raw = _query(IpnShape.SUCCESS) | {"providererrorcode": "9", "errordescription": "DECLINED"}
    with pytest.raises(UnobservedIpnOutcomeError):
        _verdict(raw)


def test_the_payload_is_frozen():
    """Evidence about money. A parsed IPN that could be edited in place is a record whose
    later readers cannot trust what they are looking at."""
    payload = parse_ipn(_query(IpnShape.SUCCESS))
    with pytest.raises(FrozenInstanceError):
        payload.amount = "999"  # type: ignore[misc]


def test_the_four_verdicts_are_exactly_the_four_security_requirements():
    """§5.10's threat table has four rows this function answers. A fifth value added
    without a spec change is an outcome nobody designed a mitigation for."""
    assert {v.value for v in IpnVerdict} == {
        "success",
        "amount_mismatch",
        "forged_ref",
        "duplicate",
    }


def test_the_verdicts_and_the_simulator_shapes_are_named_the_same():
    """§19.5's shapes exist to exercise §5.10's verdicts. Two vocabularies for one set of
    four outcomes is how a test ends up asserting the wrong pairing."""
    assert {v.value for v in IpnVerdict} == {s.value for s in IpnShape}


def test_the_payload_type_is_what_the_seam_advertises():
    assert isinstance(parse_ipn(_query(IpnShape.SUCCESS)), IpnPayload)
