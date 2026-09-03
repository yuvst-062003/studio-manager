"""§3.5 of the completion findings register -- the most consequential finding in it.

`apply_prices` closed the old plan and opened a successor, but never touched
`Student.price_plan_id`, and the billing run fetched a plan by that stored id with no
`active_to` check anywhere in `run.py`. The wizard reported `applied`, wrote an audit row
and showed the new plan on screen -- so it looked like it worked -- while the very next
run kept charging every student the closed plan's amount, with no log line and no tally
entry saying so. A manager would have learned this from parents on 30 September.

Both halves of the agreed fix are proven here: `apply_prices` repoints an active student
onto the successor plan, and the run refuses to trust a stored id that points at a plan
closed before the charge's due date -- belt and braces, because either alone still bills
the old price if the other path is the one that runs.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.models.billing import Charge, PricePlan
from app.models.schedule import TrainingYear
from app.services.billing.catalogue import CatalogueService, unpriced_students
from app.services.billing.run import BillingRunService
from app.services.schedule.rollover import RolloverService
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.billing.conftest import PricedStudent

NEXT_STARTS = date(2027, 9, 1)
NEXT_T0 = datetime(2027, 10, 12, 9, 0, tzinfo=UTC)


@pytest.fixture
def a_draft_year(app_session: Session, studio) -> uuid.UUID:
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ח",
        starts_on=NEXT_STARTS,
        ends_on=date(2028, 6, 30),
        status="draft",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def test_a_rollover_price_rise_repoints_the_student_onto_the_successor(
    tenant_session,
    app_session,
    studio,
    a_priced_student: PricedStudent,
    an_enrolled_student,
    a_draft_year,
    a_price_plan,
):
    """The repointing half. Without it the student's `price_plan_id` still names the
    closed plan the moment the wizard reports success."""
    RolloverService(tenant_session).apply_prices(
        a_draft_year,
        repricings=[{"plan_id": a_price_plan, "monthly_amount_agorot": 27_000}],
        at=NEXT_T0,
        actor_person_id=None,
        studio_id=studio.id,
    )
    tenant_session.commit()

    app_session.expire_all()
    successor = app_session.execute(
        select(PricePlan).where(PricePlan.studio_id == studio.id, PricePlan.active_to.is_(None))
    ).scalar_one()
    from app.models.people import Student

    student = app_session.get(Student, a_priced_student.student_id)
    assert student.price_plan_id == successor.id, (
        "apply_prices closed the old plan but left the student pointing at it -- the "
        "next billing run would still charge last year's price"
    )


def test_a_rollover_price_rise_is_charged_the_new_amount_next_year(
    tenant_session,
    studio,
    a_priced_student: PricedStudent,
    an_enrolled_student,
    a_draft_year,
    a_price_plan,
):
    """The reproduction of §3.5 end to end: raise the price at rollover, run the very
    next month's billing, and read the amount actually charged."""
    RolloverService(tenant_session).apply_prices(
        a_draft_year,
        repricings=[{"plan_id": a_price_plan, "monthly_amount_agorot": 27_000}],
        at=NEXT_T0,
        actor_person_id=None,
        studio_id=studio.id,
    )
    tenant_session.commit()

    run = BillingRunService(tenant_session).run(
        studio.id, period_year=2027, period_month=10, at=NEXT_T0
    )
    charge = tenant_session.execute(
        select(Charge).where(
            Charge.student_id == a_priced_student.student_id, Charge.kind == "tuition"
        )
    ).scalar_one()
    assert charge.amount_agorot == 27_000, (
        "the student was charged the closed plan's amount, not the price rollover set"
    )
    assert run.log["unpriced"] == []


def test_a_stale_stored_plan_is_refused_rather_than_charged_the_old_amount(
    tenant_session, app_session, studio, a_priced_student: PricedStudent, an_enrolled_student
):
    """The predicate half, isolated from repointing. Simulates the drift the repointing
    fix guards against -- a plan closed by some other path than `apply_prices`, with the
    student's `price_plan_id` left exactly where it was.

    A `NOT NULL, ON DELETE RESTRICT` foreign key means `price_plan_id` can never dangle,
    so the only way this state arises in production is a plan closing without every path
    that can close one also repointing every student on it -- which is precisely the gap
    this predicate exists to survive.
    """
    catalogue = CatalogueService(tenant_session)
    # a_priced_student's plan is `a_price_plan`; close it directly, the way any future
    # caller other than apply_prices might, without repointing anyone.
    from app.models.people import Student as StudentModel
    from tests.billing.conftest import MONTHLY_AGOROT

    student = tenant_session.get(StudentModel, a_priced_student.student_id)
    plan_id = student.price_plan_id
    successor = catalogue.close_price_plan(
        plan_id,
        closes_on=date(2026, 11, 20),
        replacement_amount_agorot=MONTHLY_AGOROT + 5_000,
    )
    tenant_session.commit()

    # The student's stored id still names the now-closed plan -- nobody repointed it.
    tenant_session.expire_all()
    student = tenant_session.get(StudentModel, a_priced_student.student_id)
    assert student.price_plan_id == plan_id

    run = BillingRunService(tenant_session).run(
        studio.id, period_year=2026, period_month=12, at=datetime(2026, 12, 1, tzinfo=UTC)
    )
    assert run.charges_created == 0
    assert str(a_priced_student.student_id) in run.log["unpriced"]

    unpriced = unpriced_students(tenant_session, today=date(2026, 12, 1))
    assert [row.student_id for row in unpriced] == [a_priced_student.student_id]
    assert successor.id != plan_id
