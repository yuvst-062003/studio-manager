"""Tuition per class, and the half of C11 that must survive it.

The owner asked for this on 2026-09-09 -- "every class can have his own unique payments" --
and it reverses half of a decision that exists because the other shape once billed families
twice. So the point of this file is not that the new behaviour works. It is that the OLD
failure cannot come back:

    C11's failure was a child in the competition group AND the teenagers group charged twice
    a month at two different prices, silently and forever. The plan hung off `group_id`,
    falling back to `class_id`.

Two groups of ONE class is still one charge -- `_billable_students` is DISTINCT over
`group.class_id`. Judo AND karate is two, added together, which is what was asked for.

The third case is the one that decides whether this was safe to deploy at all: a student
nobody has priced per class yet. The migration deliberately leaves every multi-class child
in that state, so on the first run after this ships it is the majority case and not an edge
one. They bill ONCE, from `student.price_plan_id`, exactly as yesterday.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.billing import Charge, PricePlan, StudentClassPrice
from app.models.people import Enrollment, Student
from app.models.structure import Group
from app.services.billing.run import BillingRunService
from sqlalchemy import select
from tests.billing.conftest import PERIOD, T0, YEAR_STARTS


def _tuition(session) -> list[Charge]:
    return list(session.execute(select(Charge).where(Charge.kind == "tuition")).scalars().all())


@pytest.fixture
def a_second_group_in_the_same_class(
    app_session, studio, a_priced_student, an_enrolled_student
) -> uuid.UUID:
    """C11's ACTUAL case, which the existing `a_second_enrollment` fixture does not build.

    That one adds a group under a NEW class (תחרותית beside מתחילים), so it exercises two
    classes and calls itself two groups. The distinction did not matter while price was per
    student and both shapes collapsed to one charge. It decides everything now, so the case
    its docstring describes is built here for real: a second group under the SAME class.
    """
    group_class_id = (
        app_session.execute(
            select(Group.class_id)
            .join(Enrollment, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == a_priced_student.student_id)
        )
        .scalars()
        .first()
    )
    sibling = Group(studio_id=studio.id, class_id=group_class_id, name="מתחילים ב", is_active=True)
    app_session.add(sibling)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=a_priced_student.student_id,
            group_id=sibling.id,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    return sibling.id


def _price_for(app_session, studio, student_id, class_id, agorot, name) -> uuid.UUID:
    plan = PricePlan(
        studio_id=studio.id,
        name=name,
        class_id=class_id,
        sessions_per_week=2,
        monthly_amount_agorot=agorot,
        active_from=YEAR_STARTS,
    )
    app_session.add(plan)
    app_session.flush()
    app_session.add(
        StudentClassPrice(
            studio_id=studio.id,
            student_id=student_id,
            class_id=class_id,
            price_plan_id=plan.id,
        )
    )
    app_session.commit()
    return plan.id


def test_two_groups_of_one_class_is_still_one_charge(
    tenant_session,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    a_second_group_in_the_same_class,
):
    """C11's surviving half, and the reason this change was allowed to ship.

    One discipline, two squads. The child trains twice as often; they do not owe twice.
    """
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert len(_tuition(tenant_session)) == 1


def test_two_classes_each_priced_bills_both_added_together(
    tenant_session,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    a_second_enrollment,
):
    """What was actually asked for: judo 300 + karate 250 = two charges totalling 550.

    `a_second_enrollment` puts the child under a second CLASS, which is exactly the shape
    that must now produce two.
    """
    classes = list(
        app_session.execute(
            select(Group.class_id)
            .join(Enrollment, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == a_priced_student.student_id)
            .distinct()
        )
        .scalars()
        .all()
    )
    assert len(classes) == 2, "the fixture must put this child in two classes"
    _price_for(app_session, studio, a_priced_student.student_id, classes[0], 30_000, "ג׳ודו")
    _price_for(app_session, studio, a_priced_student.student_id, classes[1], 25_000, "קראטה")

    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charges = _tuition(tenant_session)
    assert len(charges) == 2
    assert sum(row.amount_agorot for row in charges) == 55_000


def test_a_child_in_two_classes_with_no_per_class_price_is_billed_once(
    tenant_session,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    a_second_enrollment,
):
    """**The case that decides whether this was safe to deploy.**

    The migration leaves every multi-class child unpriced on purpose -- there is no honest
    way to split one number in two -- so on the first run after this ships, this is the
    majority state and not an edge case.

    A fallback applied PER ROW would hand this child their single old price twice: C11's
    exact bug, reintroduced by the change written to avoid it, on the first run, for every
    multi-class family at once. It is applied per STUDENT instead, so they bill once, at
    the amount they paid yesterday.
    """
    assert (
        app_session.execute(
            select(StudentClassPrice).where(
                StudentClassPrice.student_id == a_priced_student.student_id
            )
        )
        .scalars()
        .all()
        == []
    ), "this test is about a student with NO per-class price"

    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charges = _tuition(tenant_session)
    assert len(charges) == 1
    # And at the OLD amount -- nobody's bill moves because of the migration alone.
    legacy_plan_id = (
        app_session.execute(
            select(Student.price_plan_id).where(Student.id == a_priced_student.student_id)
        )
        .scalars()
        .one()
    )
    plan = app_session.get(PricePlan, legacy_plan_id)
    assert charges[0].amount_agorot == plan.monthly_amount_agorot


def test_a_class_priced_and_a_class_not_bills_only_the_priced_one(
    tenant_session,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    a_second_enrollment,
):
    """Half-priced is reported, never guessed at.

    Once a student holds ANY per-class price the legacy fallback stops applying to them, so
    the unpriced class must not quietly borrow the other class's amount, and must not
    silently vanish either -- a family billed for one of their two disciplines is a number
    the manager has to be able to see.
    """
    classes = list(
        app_session.execute(
            select(Group.class_id)
            .join(Enrollment, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == a_priced_student.student_id)
            .distinct()
        )
        .scalars()
        .all()
    )
    _price_for(app_session, studio, a_priced_student.student_id, classes[0], 30_000, "ג׳ודו")

    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charges = _tuition(tenant_session)
    assert len(charges) == 1
    assert charges[0].amount_agorot == 30_000
    # the other class is named in the run's own record, not dropped
    assert str(a_priced_student.student_id) in (run.log or {}).get("unpriced", [])
