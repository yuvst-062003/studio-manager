"""Cheques are written for the TRAINING YEAR, not for a fixed count.

Owner, 2026-09-12: *"12 for the full year. If the person joins later then the cheques is the
num months left. Cheques is for the full year."* So `CHEQUE_PREPAY_MONTHS` is a ceiling and
not the answer — a family joining in September writes twelve, one joining in January writes
what is left.

**Inclusive of the joining month.** That month's cheque is one of the twelve. The caller
buying months FORWARD wants one fewer, because the joining month already has a charge of its
own — the same off-by-one that makes cash's `2` the club's "three months".
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.schedule import TrainingYear
from app.services.billing.studio_settings import (
    CHEQUE_PREPAY_MONTHS,
    cheque_months_remaining,
)


@pytest.fixture
def a_year(app_session, studio) -> TrainingYear:
    """September 2026 → August 2027, the ordinary Israeli training year."""
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ז",
        starts_on=date(2026, 9, 1),
        ends_on=date(2027, 8, 31),
        status="active",
    )
    app_session.add(row)
    app_session.commit()
    return row


def test_joining_at_the_start_of_the_year_writes_twelve(tenant_session, studio, a_year):
    assert cheque_months_remaining(tenant_session, studio.id, on=date(2026, 9, 12)) == 12


def test_joining_in_january_writes_only_the_months_that_are_left(tenant_session, studio, a_year):
    """January through August inclusive is eight. The rule the owner stated, as a number:
    a family joining late does not write twelve cheques for a year that has four months
    already gone."""
    assert cheque_months_remaining(tenant_session, studio.id, on=date(2027, 1, 15)) == 8


def test_joining_in_the_last_month_writes_one(tenant_session, studio, a_year):
    assert cheque_months_remaining(tenant_session, studio.id, on=date(2027, 8, 2)) == 1


def test_joining_after_the_year_has_ended_still_writes_one(tenant_session, studio, a_year):
    """Clamped rather than zero or negative. A date past the year is a studio that has not
    rolled over yet, and the month being joined is still owed — `prepay_months` would take a
    negative straight into `prepay_months * monthly` and credit the family."""
    assert cheque_months_remaining(tenant_session, studio.id, on=date(2027, 11, 1)) == 1


def test_a_studio_with_no_active_year_falls_back_to_the_full_year(tenant_session, studio):
    """A club that has not run the rollover has no year row. Falling back to zero would
    silently stop asking for cheques at all; the full year is the answer it had before this
    function existed."""
    assert (
        cheque_months_remaining(tenant_session, studio.id, on=date(2026, 9, 12))
        == CHEQUE_PREPAY_MONTHS
    )


def test_a_draft_year_is_not_the_active_one(tenant_session, studio, app_session, a_year):
    """`uq_training_year_one_active` allows any number of drafts beside the active year —
    the rollover wizard is resumable. A draft must not be read as the year in force, or a
    club half-way through planning next year prices this year's cheques off it."""
    app_session.add(
        TrainingYear(
            studio_id=studio.id,
            name="תשפ״ח",
            starts_on=date(2027, 9, 1),
            ends_on=date(2028, 8, 31),
            status="draft",
        )
    )
    app_session.commit()
    assert cheque_months_remaining(tenant_session, studio.id, on=date(2026, 9, 12)) == 12


def test_it_never_exceeds_the_configured_ceiling(tenant_session, studio, app_session):
    """A two-year row (an import, or a studio that spells its year differently) must not
    hand a family a twenty-four cheque arrangement nobody agreed to."""
    app_session.add(
        TrainingYear(
            studio_id=studio.id,
            name="שנתיים",
            starts_on=date(2026, 9, 1),
            ends_on=date(2028, 8, 31),
            status="active",
        )
    )
    app_session.commit()
    assert (
        cheque_months_remaining(tenant_session, studio.id, on=date(2026, 9, 12))
        == CHEQUE_PREPAY_MONTHS
    )


def test_it_is_scoped_to_the_studio_asking(tenant_session, studio, a_year):
    """A year belonging to another club prices nobody here. Asked with a studio id that has
    no year of its own, the answer is the fallback, not the neighbour's."""
    assert (
        cheque_months_remaining(tenant_session, uuid.uuid4(), on=date(2027, 1, 15))
        == CHEQUE_PREPAY_MONTHS
    )
