"""SPEC §13 invariant 1 / G2: money is always an integer count of agorot.

Two failure modes, not one. A float column is the obvious one. The quieter one is a
money column that does not say `_agorot`, because the next person to read it will assume
shekels and divide by a hundred somewhere.

Both detectors currently find nothing -- no money column exists until M6. The self-tests
at the bottom are what make an empty gate worth having.
"""

from __future__ import annotations

import re

import app.models  # noqa: F401 -- seam 2 discovery populates the metadata
import sqlalchemy as sa
from app.models.base import Base
from sqlalchemy import Column, Integer, MetaData, Numeric, Table

INTEGER_TYPES = (sa.Integer, sa.BigInteger, sa.SmallInteger)
MONEY_WORDS = re.compile(r"(amount|price|fee|balance|total|sum|cost)", re.IGNORECASE)

# Counts, not money. `max_payments` is how many instalments, not how many shekels.
NOT_MONEY = frozenset({"max_payments", "charges_created", "payments_count"})


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
            if MONEY_WORDS.search(name):
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
