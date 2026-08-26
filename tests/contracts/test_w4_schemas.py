"""W4's contract commit, the schema half — the ledger, events and belts.

W2, W3 and W5 each have one of these and W4 did not. It is the half of the bargain that
`tests/contracts/test_w4_models.py` cannot make: the models say what the database will
accept, these say what the API will, and the two diverging is how a lane ships a route
that passes its own tests and writes a row Postgres rejects.

The rules asserted here are the ones §4.3 and §5.10 state in prose and Pydantic can
actually enforce. They are asserted as BEHAVIOUR wherever possible -- constructing a
shape and proving it refuses something -- because `assert "status" in ChargeOut.model_fields`
only restates the source file and passes for as long as nobody deletes a line.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime
from typing import Literal, get_args

import app.schemas.billing as billing_schemas
import pytest
from app.schemas.belts import BeltRankIn, BeltRankOut, StudentBeltOut
from app.schemas.billing import (
    ChargeAdjustmentIn,
    ChargeKind,
    ChargeOut,
    ManualChargeIn,
    PayerBalanceOut,
    PaymentAllocationOut,
    PaymentMethod,
    PaymentOrderOut,
    PaymentOut,
    PricePlanOut,
    ProductOut,
    UpayIpnRecordOut,
)
from app.schemas.billing import PaymentOrderStatus as PaymentOrderStatusType
from app.schemas.events import (
    EventCreateIn,
    EventOut,
    EventRegistrationOut,
    RsvpIn,
)
from pydantic import BaseModel, ValidationError

T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)

#: Mirrors invariant 1's token rule: a money word counts when a `_`-separated token ENDS
#: with it. Duplicated rather than imported from tests/invariants/, deliberately -- a
#: contract test that imported another test module would fail for reasons that have
#: nothing to do with the contract. The rule is four lines and both copies are asserted
#: against the same schemas, so a drift between them shows up as a failure here.
MONEY_WORDS = re.compile(r"(amount|price|fee|balance|total|sum|cost)$", re.IGNORECASE)

#: `UpayIpnRecordOut.amount` is uPay's inbound rendering kept as text -- see its docstring.
#: Qualified by model, exactly as invariant 1 qualifies it by table: a bare `amount` entry
#: would exempt every shape's `amount`, which is the field this sweep exists to catch.
NOT_MONEY_QUALIFIED = frozenset({"UpayIpnRecordOut.amount"})

#: Counts, not money. Same list invariant 1 keeps, for the same reason.
NOT_MONEY = frozenset({"max_payments", "charges_created", "payments_count"})


def _mis_named_money_fields(model: type[BaseModel]) -> list[str]:
    bad = []
    for name in model.model_fields:
        if name in NOT_MONEY or name.endswith("_agorot") or name.endswith("_id"):
            continue
        if f"{model.__name__}.{name}" in NOT_MONEY_QUALIFIED:
            continue
        if any(MONEY_WORDS.search(token) for token in name.split("_")):
            bad.append(f"{model.__name__}.{name} looks like money but does not say _agorot")
    return sorted(bad)


def _w4_models() -> list[type[BaseModel]]:
    """Every Pydantic shape in the billing module, found rather than listed.

    Enumerated dynamically on purpose: a hand-written list is a list someone forgets to
    extend, and the shape they forget is the one that ships a `NUMERIC` amount.
    """
    found = []
    for value in vars(billing_schemas).values():
        if isinstance(value, type) and issubclass(value, BaseModel) and value is not BaseModel:
            found.append(value)
    return found


# -- the seam ------------------------------------------------------------------
def test_charge_kind_is_the_union_the_seam_takes():
    """`BillingService.create_charge(kind=...)` is typed `ChargeKind`, and M7 passes
    `'event'` through it for a competition fee. A bare `str` would turn M7's typo into a
    check-constraint violation at runtime inside the billing worker, instead of a red
    build in the lane that made it."""
    assert set(get_args(ChargeKind)) == {"tuition", "registration", "event", "manual"}


def test_a_manual_charge_cannot_be_tuition():
    """§5.10 — the monthly run is the only thing that may create `kind='tuition'`. A
    hand-made one is how a month ends up billed twice, and the second copy carries no
    period to collide with the idempotency key."""
    assert "tuition" not in get_args(ManualChargeIn.model_fields["kind"].annotation)
    with pytest.raises(ValidationError):
        ManualChargeIn(
            payer_person_id=uuid.uuid4(),
            kind="tuition",
            amount_agorot=1_000,
            due_date=date(2026, 11, 30),
        )


# -- G2 / invariant 1 ----------------------------------------------------------
@pytest.mark.parametrize("model", _w4_models(), ids=lambda m: m.__name__)
def test_no_billing_shape_carries_unlabelled_money(model):
    """The annotation is the last place G2 is stated before a value reaches a caller who
    cannot see the column. A field called `amount` reads as shekels to the next person and
    is agorot in the database, which is a factor of a hundred nobody notices until a
    parent is billed ₪2.50 for a month."""
    assert _mis_named_money_fields(model) == []


@pytest.mark.parametrize(
    "model",
    [
        ChargeOut,
        PricePlanOut,
        ProductOut,
        PaymentOut,
        PaymentAllocationOut,
        PaymentOrderOut,
        PayerBalanceOut,
        EventOut,
    ],
    ids=lambda m: m.__name__,
)
def test_every_agorot_field_is_typed_int(model):
    for name, field in model.model_fields.items():
        if not name.endswith("_agorot"):
            continue
        annotation = field.annotation
        assert annotation in (int, int | None), f"{model.__name__}.{name} is {annotation}"


def test_a_money_field_refuses_a_fractional_value():
    """G2 in the one place it can be demonstrated rather than described. There is no such
    thing as half an agora, and a shape that rounded one away would make the ledger and
    the receipt disagree by an amount too small to notice and too persistent to explain."""
    with pytest.raises(ValidationError):
        ProductOut(
            id=uuid.uuid4(),
            name="חגורה",
            description=None,
            price_agorot=8_000.5,
            is_active=True,
        )


def test_the_ipn_amount_stays_text_beside_its_parse():
    """uPay's inbound rendering, byte-for-byte. §12: the IPN carries no cryptographic
    signature, so what actually arrived IS the evidence — parsing it at the boundary and
    storing only the integer throws the evidence away. `amount_agorot` beside it is our
    parse, and a manager seeing both is the only way an amount mismatch is legible."""
    assert UpayIpnRecordOut.model_fields["amount"].annotation is str
    assert UpayIpnRecordOut.model_fields["amount_agorot"].annotation == int | None


# -- charges are never mutated to record payment (§4.3) ------------------------
def test_no_input_shape_can_write_a_charge_status():
    """`charge.status` is a derived cache with exactly one writer,
    `recompute_charge_status`. A shape that let a caller set it would give the cache a
    second writer, and a second writer is how a family's balance starts disagreeing with
    the receipts they were already sent."""
    offenders = [
        model.__name__
        for model in _w4_models()
        if model.__name__.endswith("In") and "status" in model.model_fields
    ]
    assert offenders == []


def test_a_charge_reports_what_has_been_allocated_to_it():
    """§4.3 settles a charge when its `payment_allocation` rows sum to `amount_agorot`, so
    a client rendering `amount_agorot` alone shows a fully-paid charge as outstanding.
    Defaults to nothing allocated, which is what a charge the run just created looks
    like."""
    charge = ChargeOut(
        id=uuid.uuid4(),
        payer_person_id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        kind="tuition",
        period_year=2026,
        period_month=11,
        amount_agorot=25_000,
        original_amount_agorot=None,
        proration_note=None,
        due_date=date(2026, 11, 30),
        status="open",
        created_by="billing_run",
    )
    assert charge.allocated_agorot == 0


def test_a_credit_is_a_new_fact_and_never_a_no_op():
    """§5.10 records a correction as a new signed amount rather than an edit, so the
    ledger stays append-only and last month's statement does not change after a parent has
    read it. Zero is the one value that records nothing while looking like a correction:
    it leaves an audit trail saying a manager adjusted the balance by nothing."""
    ChargeAdjustmentIn(amount_agorot=-5_000, reason="זיכוי על חודש שהוקפא")
    ChargeAdjustmentIn(amount_agorot=5_000, reason="תיקון חיוב")
    with pytest.raises(ValidationError):
        ChargeAdjustmentIn(amount_agorot=0, reason="לא כלום")


# -- C11 -----------------------------------------------------------------------
def test_a_charge_names_a_student_and_never_an_enrollment():
    """C11 — tuition covers a student for a period, not one of their group memberships. A
    child in the competition group and the teenagers group is two enrollments and ONE
    charge."""
    assert "student_id" in ChargeOut.model_fields
    assert "enrollment_id" not in ChargeOut.model_fields


def test_a_price_plan_is_scoped_by_training_volume_and_never_by_a_group():
    """The other half of C11, on the catalogue side. A plan priced per group is a plan
    that bills a child once per group."""
    assert "sessions_per_week" in PricePlanOut.model_fields
    assert "group_id" not in PricePlanOut.model_fields
    assert "class_id" not in PricePlanOut.model_fields


# -- §5.10's security requirements ---------------------------------------------
def test_a_payment_order_is_addressed_by_uuid_not_by_a_countable_id():
    """§5.10 — `public_ref` is the only identifier that reaches uPay, and the IPN endpoint
    has no signature to fall back on (§12). A sequential id here lets anyone who can count
    mark any family's tuition paid."""
    assert PaymentOrderOut.model_fields["public_ref"].annotation is uuid.UUID


def test_the_client_never_supplies_the_amount_it_will_be_checked_against():
    """§5.10 compares the IPN against a SERVER-side sum of the selected charges. A
    client-supplied expected amount would be the very number the comparison uses, which
    makes the comparison decorative."""
    from app.schemas.billing import PaymentOrderCreateIn

    assert "expected_amount_agorot" not in PaymentOrderCreateIn.model_fields
    assert set(PaymentOrderCreateIn.model_fields) == {"charge_ids"}


def test_amount_mismatch_is_a_status_an_order_can_hold():
    """Not a failure, and not collapsible into one. The money really did arrive in the
    merchant account; §5.10 records a payment for the real amount and allocates it to
    nothing, so a manager can see it. `failed` would lose it."""
    assert "amount_mismatch" in get_args(PaymentOrderStatusType)


def test_a_human_confirms_every_reconciliation():
    """§5.10 — "A wrong automatic match marks the wrong payer paid and sends the wrong
    parent a debt reminder." So the only statuses a caller may set are the two a person
    chooses, and `auto` is not among them."""
    from app.schemas.billing import IpnMatchIn

    settable = get_args(IpnMatchIn.model_fields["match_status"].annotation)
    assert set(settable) == {"manual", "ignored"}
    assert "auto" not in settable


# -- G8 ------------------------------------------------------------------------
def test_nothing_here_can_create_a_standing_order_mandate():
    """G8 — uPay cannot create a הוראת קבע programmatically, so a `RecurringSubscriptionIn`
    would be a mandate creator by another name. `standing_order` is a payment METHOD a
    human records, in the same flow as a bank transfer."""
    assert not hasattr(billing_schemas, "RecurringSubscriptionIn")
    assert "standing_order" in get_args(PaymentMethod)

    from app.schemas.billing import ManualPaymentIn

    assert "standing_order" in get_args(ManualPaymentIn.model_fields["method"].annotation)


# -- events --------------------------------------------------------------------
def test_an_event_registration_points_at_a_charge_rather_than_holding_money():
    """Plan W4 — the events lane never writes a billing table. An `amount_agorot` here
    would be a second answer to what the family owes, and the two diverge the first time a
    manager applies a discount."""
    assert "charge_id" in EventRegistrationOut.model_fields
    assert not any(name.endswith("_agorot") for name in EventRegistrationOut.model_fields)


def test_an_event_that_asks_for_consent_must_say_what_to_consent_to():
    """§5.8, and `event_consent_has_text` in the model. Without this the CHECK is the only
    thing standing between a manager and a consent form that asks a parent to agree to
    nothing — and a CHECK violation surfaces as a 500, not a field error the form can
    show."""
    EventCreateIn(
        type="competition",
        title="אליפות",
        starts_at=T0,
        requires_consent=False,
    )
    with pytest.raises(ValidationError):
        EventCreateIn(
            type="competition",
            title="אליפות",
            starts_at=T0,
            requires_consent=True,
            consent_text=None,
        )


def test_an_event_cannot_end_before_it_starts():
    """`event_time_range` in the model. Same reasoning as the consent pairing: the CHECK
    catches it, but only after the round trip and only as a 500."""
    with pytest.raises(ValidationError):
        EventCreateIn(
            type="seminar",
            title="סמינר",
            starts_at=T0,
            ends_at=T0.replace(hour=8),
        )


def test_a_parent_cannot_un_answer_an_rsvp():
    """`pending` is the ABSENCE of an answer, not an answer. Accepting it would make
    "un-RSVP" a supported action the office then has to interpret — and §5.12's whole
    point is seeing who has not replied."""
    assert set(get_args(RsvpIn.model_fields["rsvp"].annotation)) == {"yes", "no"}


def test_no_event_shape_carries_a_weight_category():
    """D9.2 — artboard `7c`'s `משקל / קטגוריה` column is cut. §2.2 defers weight categories
    to v2 and they imply `student` fields §4.3 does not carry."""
    for model in (EventOut, EventCreateIn, EventRegistrationOut):
        assert not any("weight" in name for name in model.model_fields), model.__name__


def test_a_registration_records_consent_as_a_timestamp_not_as_contents():
    """§14 — parental consent for a competition is a health-adjacent record about a minor.
    A manager's list needs to know whether it was signed; the contents belong behind an
    audit-logged read, not on every row of a table."""
    assert EventRegistrationOut.model_fields["consent_signed_at"].annotation == datetime | None
    assert "consent_text" not in EventRegistrationOut.model_fields


# -- belts ---------------------------------------------------------------------
def test_a_belt_rank_carries_a_second_colour_for_a_bi_colour_grade():
    """Artboard `5b` — 'מערכת חגורות, כולל חגורות דו-צבעיות'. Without a field for it M7
    would invent its own storage or its own bar, and a second bar is how the fill-only bug
    D7 exists to prevent comes back."""
    assert "secondary_color_hex" in BeltRankOut.model_fields
    rank = BeltRankIn(
        name="צהובה-כתומה", order_index=2, color_hex="#F7E017", secondary_color_hex="#F08A24"
    )
    assert rank.secondary_color_hex == "#F08A24"
    assert BeltRankIn(name="לבנה", order_index=0, color_hex="#FFFFFF").secondary_color_hex is None


def test_a_belt_colour_must_be_a_colour():
    """`color_hex` is DATA, not a token (D3) — the one place in the product where a raw hex
    is correct, because the value is configured per studio at runtime. Data still has a
    shape: a name that is not a colour reaches `BeltBar` as a CSS value it cannot render,
    and the belt disappears rather than erroring."""
    with pytest.raises(ValidationError):
        BeltRankIn(name="צהובה", order_index=1, color_hex="yellow")
    with pytest.raises(ValidationError):
        BeltRankIn(name="צהובה", order_index=1, color_hex="#FFF")


def test_a_belt_award_keeps_its_own_colour_so_history_survives_a_recolour():
    """§5.13 keeps the whole history. `12d` התקדמות חגורה is a timeline, and carrying the
    colour on the award means a studio recolouring its ladder does not rewrite what a
    child was given three years ago."""
    assert "color_hex" in StudentBeltOut.model_fields
    assert "secondary_color_hex" in StudentBeltOut.model_fields


def test_a_belt_can_be_awarded_without_an_exam():
    """§5.9 — a coach awarding a stripe at the end of a session is a real thing in a
    children's club. Requiring an event would make managers invent fake ones."""
    from app.schemas.belts import StudentBeltIn

    award = StudentBeltIn(belt_rank_id=uuid.uuid4(), awarded_on=date(2026, 11, 12))
    assert award.event_id is None


# -- the sweep proves it can fail ---------------------------------------------
def test_the_money_naming_sweep_actually_fires():
    """The other half of `test_no_billing_shape_carries_unlabelled_money`. It passes today
    because it finds nothing, which is indistinguishable from a rule that matches nothing
    — so the detector is shown biting on the exact shape it exists to catch."""

    class Probe(BaseModel):
        monthly_amount: int
        registration_fee: int
        plan_id: uuid.UUID
        max_payments: int
        amount_agorot: int

    assert _mis_named_money_fields(Probe) == [
        "Probe.monthly_amount looks like money but does not say _agorot",
        "Probe.registration_fee looks like money but does not say _agorot",
    ]


def test_the_qualified_exemption_is_scoped_to_one_shape():
    """`UpayIpnRecordOut.amount` is exempt by name. An unqualified `amount` entry would
    exempt every shape's `amount`, which is precisely the field the sweep exists to
    catch."""

    class Invoice(BaseModel):
        amount: str

    assert _mis_named_money_fields(Invoice) == [
        "Invoice.amount looks like money but does not say _agorot"
    ]
    assert _mis_named_money_fields(UpayIpnRecordOut) == []


def test_the_literal_helper_sees_a_real_union():
    """Guards every `get_args` assertion above. If a `Literal` were ever replaced by a
    bare `str`, `get_args` returns an empty tuple and half this file would pass by
    asserting `set() == set()` on something that constrains nothing."""
    assert get_args(Literal["a", "b"]) == ("a", "b")
    assert get_args(str) == ()
    assert get_args(ChargeKind) != ()
