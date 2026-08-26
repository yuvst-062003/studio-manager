"""SPEC §13 invariant 1 / G2: money is always an integer count of agorot.

Two failure modes, not one. A float column is the obvious one. The quieter one is a
money column that does not say `_agorot`, because the next person to read it will assume
shekels and divide by a hundred somewhere.

W4's contract commit is where this stopped being an empty gate: the billing ledger is the
first schema in the product with real money columns, and both detectors now have something
to bite on. The self-tests at the bottom are what kept it worth having until then, and what
keep each exemption below honest -- every skip is paired with a test proving the detector
still fires on the thing the skip is not meant to cover.
"""

from __future__ import annotations

import re

import app.models  # noqa: F401 -- seam 2 discovery populates the metadata
import pytest
import sqlalchemy as sa
from app.models.base import Base
from sqlalchemy import Column, Integer, MetaData, Numeric, String, Table

INTEGER_TYPES = (sa.Integer, sa.BigInteger, sa.SmallInteger)

# A money word counts when a `_`-separated TOKEN ends with it -- not when it appears
# anywhere in the name. The unanchored version reported `oauth_transaction.consumed_at`
# as unlabelled money, because "consumed" contains "sum", and `feedback_at` for the same
# reason with "fee". Anchoring at the end of a token still catches every real misname
# this was written for: `subtotal`, `unit_price`, `monthly_amount`, `sum_paid`.
MONEY_WORDS = re.compile(r"(amount|price|fee|balance|total|sum|cost)$", re.IGNORECASE)

# Counts, not money. `max_payments` is how many instalments, not how many shekels.
NOT_MONEY = frozenset({"max_payments", "charges_created", "payments_count"})

# Qualified `table.column` exemptions: a column that really does hold an amount, but
# deliberately does not hold agorot. Qualified rather than bare, because a bare `amount`
# in NOT_MONEY would exempt every table's `amount` -- the exact column this gate exists
# to catch.
NOT_MONEY_QUALIFIED = frozenset(
    {
        # uPay's inbound rendering, kept byte-for-byte as evidence of what actually
        # arrived (app/models/billing.py). It is text on purpose; the integer is parsed
        # out by `app.integrations.upay.ipn.agorot_from_ipn_amount`, and storing only
        # that would lose the evidence. Renaming cannot dodge the rule either -- any
        # name carrying an `amount` token trips it.
        "upay_ipn_record.amount",
    }
)


def float_money_columns(metadata: sa.MetaData) -> list[str]:
    bad = []
    for table in metadata.tables.values():
        for column in table.columns:
            if column.name.endswith("_agorot") and not isinstance(column.type, INTEGER_TYPES):
                bad.append(f"{table.name}.{column.name} is {column.type!r}, not an integer")
    return sorted(bad)


def mis_named_money_columns(metadata: sa.MetaData) -> list[str]:
    bad = []
    for table in metadata.tables.values():
        for column in table.columns:
            name = column.name
            if name in NOT_MONEY or name.endswith("_agorot"):
                continue
            if f"{table.name}.{name}" in NOT_MONEY_QUALIFIED:
                continue
            # A reference, not an amount. W2's `student.price_plan_id` is a UUID
            # pointing at a `price_plan` row, and `price` is a token in it. No money
            # column in this schema ends in `_id`.
            if name.endswith("_id"):
                continue
            if any(MONEY_WORDS.search(token) for token in name.split("_")):
                bad.append(f"{table.name}.{name} looks like money but does not end in _agorot")
    return sorted(bad)


def test_no_money_column_is_a_float():
    assert float_money_columns(Base.metadata) == []


def test_every_money_column_says_agorot():
    assert mis_named_money_columns(Base.metadata) == []


# -- the detectors are proven to fire, because today they find nothing --------
def test_the_float_detector_flags_a_float_money_column():
    probe = MetaData()
    Table("probe", probe, Column("amount_agorot", Numeric(10, 2)))
    assert float_money_columns(probe) == [
        "probe.amount_agorot is Numeric(precision=10, scale=2), not an integer"
    ]


def test_the_float_detector_accepts_an_integer_money_column():
    probe = MetaData()
    Table("probe", probe, Column("amount_agorot", Integer))
    assert float_money_columns(probe) == []


def test_the_naming_detector_flags_a_bare_amount_column():
    probe = MetaData()
    Table("probe", probe, Column("monthly_amount", Integer))
    assert mis_named_money_columns(probe) == [
        "probe.monthly_amount looks like money but does not end in _agorot"
    ]


def test_the_naming_detector_leaves_a_count_alone():
    probe = MetaData()
    Table("probe", probe, Column("max_payments", Integer))
    assert mis_named_money_columns(probe) == []


# -- and proven NOT to fire on words that merely contain a money word ---------
# M1 found this the expensive way: `oauth_transaction.consumed_at` contains "sum", so an
# unanchored substring search reported a timestamp as unlabelled money. The fix is not a
# NOT_MONEY entry -- that would leave `assumed_at` and `resumed_at` to rediscover it --
# but a token rule: a money word counts when a `_`-separated token ENDS with it. That
# still catches `subtotal` and `unit_price`, which are the real misnames.
@pytest.mark.parametrize(
    "name",
    ["consumed_at", "assumed_role", "resumed_at", "summary", "feedback_at", "profile_id"],
)
def test_the_naming_detector_leaves_a_word_that_merely_contains_a_money_word_alone(name):
    probe = MetaData()
    Table("probe", probe, Column(name, Integer))
    assert mis_named_money_columns(probe) == []


@pytest.mark.parametrize("name", ["subtotal", "unit_price", "monthly_amount", "sum_paid"])
def test_the_naming_detector_still_catches_a_real_misname(name):
    """The other half. A rule tightened until it stops false-positiving has to be shown
    still catching what it was written for, or the fix is just a deletion."""
    probe = MetaData()
    Table("probe", probe, Column(name, Integer))
    assert mis_named_money_columns(probe) == [
        f"probe.{name} looks like money but does not end in _agorot"
    ]


# -- and proven NOT to fire on a reference column -----------------------------
# W2 brought `student.price_plan_id`: a UUID pointing at W4's `price_plan` row -- on the
# STUDENT and not the enrollment, which is C11: the club prices by how often a child
# trains, so a child in two groups has one price and one tuition charge. It is
# a reference, not an amount, and the token rule flags it because `price` is a token. The
# fix is structural rather than another NOT_MONEY entry -- `*_plan_id`, `*_price_id` and
# `*_fee_id` would each have to be enumerated, leaving the next one to be rediscovered.
# No money column in this schema ends in `_id`.
@pytest.mark.parametrize("name", ["price_plan_id", "fee_schedule_id", "total_run_id"])
def test_the_naming_detector_leaves_a_reference_column_alone(name):
    probe = MetaData()
    Table("probe", probe, Column(name, Integer))
    assert mis_named_money_columns(probe) == []


def test_the_id_rule_does_not_blind_the_detector():
    """The other half of the `_id` exemption. It skips the whole column, so it has to be
    shown that dropping the suffix brings the same name straight back into the net --
    otherwise the rule is indistinguishable from deleting the check."""
    probe = MetaData()
    Table("probe", probe, Column("unit_price", Integer), Column("unit_price_id", Integer))
    assert mis_named_money_columns(probe) == [
        "probe.unit_price looks like money but does not end in _agorot"
    ]


def test_the_named_exception_is_scoped_to_one_table():
    """`upay_ipn_record.amount` is uPay's inbound rendering kept verbatim as evidence of
    what arrived (app/models/billing.py) -- text on purpose, parsed to agorot by
    `app.integrations.upay.ipn.agorot_from_ipn_amount`. A bare `amount` entry in
    NOT_MONEY would exempt *every* table's `amount`, which is precisely the column this
    gate exists to catch. The exemption is therefore qualified by table."""
    probe = MetaData()
    Table("upay_ipn_record", probe, Column("amount", String(30)))
    Table("invoice", probe, Column("amount", Integer))
    assert mis_named_money_columns(probe) == [
        "invoice.amount looks like money but does not end in _agorot"
    ]
