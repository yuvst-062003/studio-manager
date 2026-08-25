"""W4's contract commit: §4.3's billing ledger, events and belts.

**This is the wave where invariant 1 stops being vacuous.** `tests/invariants/test_01`
says so itself — "Both detectors currently find nothing: no money column exists until M6."
Every money column in the product arrives here, so the assertions below are the first real
exercise of G2.

The ledger's shape is not incidental. §4.3: "**Charges are never mutated to record
payment.** A charge is settled when the sum of its `payment_allocation` rows equals
`amount_agorot`. `charge.status` is a derived cache maintained in one place." The tests
assert the structure that makes that possible — a separate allocation table, and money on
the allocation as well as on the payment.
"""

from __future__ import annotations

import warnings

import app.models  # noqa: F401 -- seam 2 discovery populates the metadata
import pytest
import sqlalchemy as sa
from app.models.base import Base
from sqlalchemy.dialects.postgresql import UUID as PGUUID

W4_BILLING_TABLES = (
    "price_plan",
    "product",
    "charge",
    "billing_run",
    "payment",
    "payment_allocation",
    "payment_order",
    "payment_order_charge",
    "upay_ipn_record",
    "payer_fingerprint",
    "recurring_subscription",
)
W4_EVENT_TABLES = ("event", "event_target", "event_registration", "event_exam_result")
W4_BELT_TABLES = ("belt_rank", "student_belt")
W4_TABLES = W4_BILLING_TABLES + W4_EVENT_TABLES + W4_BELT_TABLES

INTEGER_TYPES = (sa.Integer, sa.BigInteger, sa.SmallInteger)


@pytest.mark.parametrize("table", W4_TABLES)
def test_the_table_exists(table):
    assert table in Base.metadata.tables


# -- G2, the wave where it becomes real ---------------------------------------
def test_the_wave_actually_introduces_money():
    """A guard on the guard. If W4's models ever stopped carrying money columns, every
    assertion below would pass vacuously and invariant 1 would go back to checking
    nothing."""
    money = [
        f"{table}.{column.name}"
        for table in W4_TABLES
        for column in Base.metadata.tables[table].columns
        if column.name.endswith("_agorot")
    ]
    assert len(money) >= 8, money


@pytest.mark.parametrize("table", W4_TABLES)
def test_every_money_column_is_an_integer(table):
    """G2 — 'Money is **always** an integer count of agorot. Never a float, never a
    decimal.' A `Numeric(10, 2)` would look responsible and still be wrong."""
    for column in Base.metadata.tables[table].columns:
        if column.name.endswith("_agorot"):
            assert isinstance(column.type, INTEGER_TYPES), f"{table}.{column.name}"


@pytest.mark.parametrize("table", W4_TABLES)
def test_no_w4_column_is_a_float_type(table):
    """The quieter half of invariant 1: a float anywhere near this schema is money that
    will eventually be off by an agora."""
    for column in Base.metadata.tables[table].columns:
        assert not isinstance(column.type, (sa.Float, sa.Numeric)), f"{table}.{column.name}"


# -- the ledger's shape -------------------------------------------------------
def test_a_payment_is_allocated_rather_than_applied_to_a_charge():
    """§4.3 — charges are never mutated to record payment. That requires allocation to be
    its own table carrying its own amount, so one payment can settle several charges and
    one charge can be settled by several payments."""
    allocation = Base.metadata.tables["payment_allocation"].c
    assert "payment_id" in allocation
    assert "charge_id" in allocation
    assert "amount_agorot" in allocation


def test_a_charge_keeps_the_original_amount_when_prorated():
    """§5.10 — 'The original amount and a human-readable `proration_note` are stored so the
    parent sees "בגין 3 מתוך 8 שיעורים".' Without the original, a prorated first month
    looks like the studio simply charges less."""
    charge = Base.metadata.tables["charge"].c
    assert "original_amount_agorot" in charge
    assert "proration_note" in charge


def test_the_billing_run_cannot_double_charge_a_period():
    """§5.10 step 5 — 'The run is **idempotent**: re-running for the same period creates no
    duplicates (unique on `enrollment_id, period_year, period_month, kind`).'

    This is invariant 5's structural half. Without the constraint, idempotency is a
    property of the code that anyone can regress; with it, the database refuses.
    """
    indexes = {index.name for index in Base.metadata.tables["charge"].indexes}
    assert "uq_charge_enrollment_period_kind" in indexes


def test_a_charge_records_who_owed_it_at_the_time():
    """§4.3 — '`charge.payer_person_id` is captured at creation from the primary guardian.
    If the primary guardian changes later, historical charges stay with whoever actually
    owed them.'"""
    assert Base.metadata.tables["charge"].c["payer_person_id"].nullable is False


# -- §5.10's uPay security requirements, in the schema ------------------------
def test_a_payment_order_is_addressed_by_uuid_not_by_id():
    """§5.10's first threat row: 'Anyone can forge an IPN for a guessed order' →
    '`public_ref` is a **UUIDv4**, never a sequential id. Sequential ids in this endpoint
    would let anyone mark any tuition paid.'"""
    column = Base.metadata.tables["payment_order"].c["public_ref"]
    assert isinstance(column.type, PGUUID)
    indexes = {index.name for index in Base.metadata.tables["payment_order"].indexes}
    assert column.unique is True or "uq_payment_order_public_ref" in indexes


def test_amount_mismatch_is_a_real_status_not_a_failure():
    """§5.10 — 'Explicit `amount_mismatch` status. A `payment` **is** recorded for the real
    amount received, allocated to nothing, and a high-priority manager alert is raised.'
    Collapsing it into `failed` would lose money that actually arrived."""
    from app.models.billing import PAYMENT_ORDER_STATUSES

    assert "amount_mismatch" in PAYMENT_ORDER_STATUSES


def test_every_ipn_is_persisted_verbatim_whether_matched_or_not():
    """§5.10 — 'Every IPN is persisted verbatim in `upay_ipn_record` whether matched or
    not', and upay-integration.md calls the raw log 'the single highest-value piece of
    infrastructure here'. Retries, duplicate delivery and failed-payment IPNs are all
    [NOT COVERED] by testing, so the raw record is what turns each unknown into something
    observed rather than pre-guessed."""
    record = Base.metadata.tables["upay_ipn_record"].c
    assert "raw_query" in record
    assert "source_ip" in record
    # Idempotence keyed on transactionid neutralises retries and duplicates whatever uPay
    # actually does.
    indexes = {index.name for index in Base.metadata.tables["upay_ipn_record"].indexes}
    assert "uq_upay_ipn_record_transactionid" in indexes


def test_a_payment_can_be_reversed_without_being_deleted():
    """§11.4 — hard deletion is impossible; Israeli tax law requires ~7 years of financial
    records. A reversal is a new fact about an existing row."""
    payment = Base.metadata.tables["payment"].c
    assert "reversed_at" in payment
    assert "reversal_reason" in payment


def test_a_fingerprint_is_confirmed_by_a_human():
    """§5.10 — 'Suggestions are never auto-applied. A wrong automatic match marks the wrong
    payer paid and sends the wrong parent a debt reminder.' The column is what records that
    a person, not the system, made the call."""
    assert "confirmed_by_person_id" in Base.metadata.tables["payer_fingerprint"].c


def test_recurring_subscription_is_the_managers_record_not_a_mandate():
    """G8 — 'הוראת קבע mandates **cannot** be created in code.' This table is the
    manager's note of who is on the shared link (§5.10), which is why it has no external
    reference, no token and no provider id — there is nothing to store."""
    columns = set(Base.metadata.tables["recurring_subscription"].c.keys())
    for forbidden in ("external_ref", "provider_mandate_id", "token", "upay_link_id"):
        assert forbidden not in columns, forbidden


# -- belts and events ---------------------------------------------------------
def test_a_belt_rank_carries_its_own_colour_as_data():
    """D3 — belt colours are **data**, never brand. §5.9 defines them per class."""
    assert "color_hex" in Base.metadata.tables["belt_rank"].c


def test_belt_ranks_are_ordered_within_a_class():
    """§5.9 — progression needs a total order, and it is per class: a karate white belt and
    a judo white belt are different rows on different ladders."""
    columns = Base.metadata.tables["belt_rank"].c
    assert "order_index" in columns
    assert "class_id" in columns


def test_a_belt_rank_can_be_bi_colour():
    """§5.9 and artboard `5b` — 'מערכת חגורות, כולל חגורות דו-צבעיות'. `BeltBar` already
    renders a second colour; without a column to hold it, M7 would have to invent one."""
    assert "secondary_color_hex" in Base.metadata.tables["belt_rank"].c


def test_an_event_registration_points_at_its_charge_rather_than_holding_money():
    """Plan W4 — 'Event fees call `BillingService.create_charge(kind='event')`. The events
    lane never writes to a billing table directly.'

    So the registration carries a `charge_id` and **no amount of its own**. An
    `amount_agorot` here would be a second, divergent source of truth for what the family
    owes.
    """
    registration = Base.metadata.tables["event_registration"].c
    assert "charge_id" in registration
    # SIM118 reads `registration` as a dict; it is a ColumnCollection, and iterating it
    # yields Column objects rather than names. `.keys()` is the correct call here.
    assert [name for name in registration.keys() if name.endswith("_agorot")] == []  # noqa: SIM118


def test_no_event_table_carries_a_weight_category():
    """D9.2 — the `משקל / קטגוריה` column is cut from artboard `7c`. §2.2 defers weight
    categories to v2 and they imply `student` fields §4.3 does not carry."""
    for table in ("event", "event_registration", "event_exam_result"):
        columns = set(Base.metadata.tables[table].c.keys())
        for forbidden in ("weight", "weight_kg", "weight_category"):
            assert forbidden not in columns, f"{table}.{forbidden} — D9.2 cut this"


@pytest.mark.parametrize("table", W4_TABLES)
def test_every_w4_table_is_tenant_scoped(table):
    """G9. `payment_allocation`, `payment_order_charge` and `event_target` are join tables
    and still carry `studio_id`: `TenantSession` filters every query with a single
    predicate, and a join table without one would be the hole in that."""
    columns = Base.metadata.tables[table].c
    assert "studio_id" in columns
    assert columns["studio_id"].nullable is False


def test_the_payment_ipn_cycle_is_resolvable():
    """§4.3 puts a foreign key on both ends: `payment.upay_ipn_id?` (which IPN produced
    this payment) and `upay_ipn_record.matched_payment_id?` (which payment a human
    reconciled this orphan הוראת קבע IPN to, §5.10). Both are spec'd, so the cycle is
    real and cannot be modelled away -- one side has to be `use_alter=True` so the
    constraint is added by ALTER after both tables exist.

    Without it SQLAlchemy drops both constraints from its topological sort and warns.
    That is not cosmetic. `DemoStudioService.wipe_plan()` derives its DELETE order from
    `reversed(Base.metadata.sorted_tables)`, so an unresolved cycle leaves the order
    between these two tables arbitrary -- and the wave's migration would emit CREATE
    TABLE in an order Postgres rejects.
    """
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        # Accessing it is what runs the topological sort, and the sort is what warns.
        assert Base.metadata.sorted_tables
    cycles = [
        str(w.message)
        for w in caught
        if issubclass(w.category, sa.exc.SAWarning) and "unresolvable cycles" in str(w.message)
    ]
    assert cycles == []


def test_exactly_one_side_of_the_payment_ipn_cycle_defers():
    """The other half. `use_alter` on *both* sides would silence the warning just as
    well and leave neither table creatable first, so the test names which side defers:
    the IPN is persisted verbatim before anything else happens (§5.10 -- the endpoint
    returns 200 immediately), the payment is created from it, and the match is recorded
    last. So `upay_ipn_record.matched_payment_id` is the one that arrives by ALTER.
    """
    payment_fk = next(fk for fk in Base.metadata.tables["payment"].c.upay_ipn_id.foreign_keys)
    matched_fk = next(
        fk for fk in Base.metadata.tables["upay_ipn_record"].c.matched_payment_id.foreign_keys
    )
    assert payment_fk.use_alter is False
    assert matched_fk.use_alter is True
    # Named, because Alembic cannot drop an auto-named constraint it added by ALTER.
    assert matched_fk.constraint.name == "fk_upay_ipn_record_matched_payment_id"
