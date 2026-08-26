"""One test per lane conftest, exercising every fixture in it against the real schema.

This exists because a conftest is only ever run by the tests that use it, so a fixture
that trips a CHECK constraint or names a column that moved is discovered on the lane's
first morning rather than in the contract commit that promised it. It costs one test and
it is the only thing standing between a typo here and lane MONEY losing half a day.
"""

from __future__ import annotations

import uuid

from app.models.billing import Charge
from app.models.person import Guardian
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, PricedStudent


def test_every_billing_fixture_builds_against_the_real_schema(
    app_session: Session,
    as_owner,
    as_manager,
    as_lead_coach,
    as_assistant_coach,
    a_price_plan: uuid.UUID,
    a_priced_student: PricedStudent,
    an_open_charge: uuid.UUID,
    tenant_session,
) -> None:
    charge = app_session.get(Charge, an_open_charge)
    assert charge is not None
    # The payer is the guardian, not the child. §4.3 keeps them apart so that changing the
    # primary guardian later leaves historical charges with whoever actually owed them.
    assert charge.payer_person_id == a_priced_student.payer_person_id
    assert charge.student_id == a_priced_student.student_id
    assert charge.payer_person_id != a_priced_student.person_id
    assert (charge.period_year, charge.period_month) == PERIOD
    assert charge.amount_agorot == MONTHLY_AGOROT
    assert charge.status == "open"


def test_a_second_signed_in_parent_joins_without_displacing_the_payer(
    as_guardian_of, a_priced_student: PricedStudent
) -> None:
    """`as_guardian_of` takes a student id rather than making one, so a two-child family
    is expressible. Proving it accepts the fixture's child is what makes the parent-facing
    tests (12e, 12f) able to assert a balance at all.

    It lands as a NON-primary guardian, because `a_priced_student` already installed the
    primary -- the person `charge.payer_person_id` was captured from -- and
    `uq_guardian_one_primary_per_student` allows exactly one. §3.3 allows several
    guardians per child and one of them pays, so this is the realistic shape rather than a
    concession to the constraint."""
    parent = as_guardian_of(a_priced_student.student_id)
    assert parent.person_id != a_priced_student.payer_person_id
    assert "X-Dev-Now" in parent.headers


def test_the_primary_guardian_is_the_one_the_charge_names(
    app_session: Session, a_priced_student: PricedStudent, an_open_charge: uuid.UUID
) -> None:
    """§4.3 captures the payer on the charge at creation, from the PRIMARY guardian. If
    this ever stops holding, every balance in the parent app is attributed to the wrong
    adult."""
    primary = app_session.execute(
        select(Guardian).where(
            Guardian.student_id == a_priced_student.student_id,
            Guardian.is_primary.is_(True),
        )
    ).scalar_one()
    assert primary.person_id == a_priced_student.payer_person_id
    assert app_session.get(Charge, an_open_charge).payer_person_id == primary.person_id
