"""Setting a child's price, per class -- the half a human operates.

The run has read `student_class_price` since 2026-09-09, but nothing could WRITE it, so
every family kept billing through `student.price_plan_id`'s fallback and per-class pricing
was inert in production. These are the two routes that end that.

The refusals are the interesting part. A screen that could file judo's price under karate
would produce real money, wrong, explicable only by reading two tables side by side.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.billing import PricePlan, StudentClassPrice
from app.models.people import Enrollment
from app.models.structure import Class as StudioClass
from app.models.structure import Group
from sqlalchemy import select
from tests.billing.conftest import YEAR_STARTS


def _plan(app_session, studio, name, agorot, class_id=None) -> uuid.UUID:
    row = PricePlan(
        studio_id=studio.id,
        name=name,
        class_id=class_id,
        sessions_per_week=2,
        monthly_amount_agorot=agorot,
        active_from=YEAR_STARTS,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def two_classes(app_session, studio, a_priced_student, an_enrolled_student):
    """The child's own class, plus a second one they are also enrolled in."""
    judo_id = (
        app_session.execute(
            select(Group.class_id)
            .join(Enrollment, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == a_priced_student.student_id)
        )
        .scalars()
        .first()
    )
    karate = StudioClass(studio_id=studio.id, name="קראטה", is_active=True)
    app_session.add(karate)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=karate.id, name="קראטה א", is_active=True)
    app_session.add(group)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=a_priced_student.student_id,
            group_id=group.id,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    return judo_id, karate.id


def test_it_lists_every_class_the_child_trains_in_priced_or_not(
    client, app_session, studio, a_priced_student, an_enrolled_student, two_classes, as_manager
):
    """The UNPRICED rows are the point. A manager cannot set a price for a class the screen
    never mentions, and those are exactly the rows the run reports as `unpriced`."""
    judo_id, karate_id = two_classes
    response = client.get(
        f"/api/v1/students/{a_priced_student.student_id}/class-prices",
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert {row["class_id"] for row in body["items"]} == {str(judo_id), str(karate_id)}
    assert all(row["price_plan_id"] is None for row in body["items"])
    # and it says what the child bills today if none of this is set
    assert body["fallback_price_plan_id"] is not None


def test_a_manager_prices_each_class_and_reads_the_amounts_back(
    client, app_session, studio, a_priced_student, an_enrolled_student, two_classes, as_manager
):
    judo_id, karate_id = two_classes
    judo_plan = _plan(app_session, studio, "ג׳ודו · פעמיים", 30_000, judo_id)
    karate_plan = _plan(app_session, studio, "קראטה · פעמיים", 25_000, karate_id)

    saved = client.put(
        f"/api/v1/students/{a_priced_student.student_id}/class-prices",
        json={
            "items": [
                {"class_id": str(judo_id), "price_plan_id": str(judo_plan)},
                {"class_id": str(karate_id), "price_plan_id": str(karate_plan)},
            ]
        },
        headers=as_manager.headers,
    )
    assert saved.status_code == 200, saved.text
    amounts = {row["class_id"]: row["monthly_amount_agorot"] for row in saved.json()["items"]}
    assert amounts == {str(judo_id): 30_000, str(karate_id): 25_000}


def test_a_plan_belonging_to_another_class_is_refused(
    client, app_session, studio, a_priced_student, an_enrolled_student, two_classes, as_manager
):
    """Filing judo's price under karate would bill a real amount that is wrong, and the
    run would raise it without complaint. Refused at the door instead."""
    judo_id, karate_id = two_classes
    judo_plan = _plan(app_session, studio, "ג׳ודו · פעמיים", 30_000, judo_id)

    response = client.put(
        f"/api/v1/students/{a_priced_student.student_id}/class-prices",
        json={"items": [{"class_id": str(karate_id), "price_plan_id": str(judo_plan)}]},
        headers=as_manager.headers,
    )
    assert response.status_code == 422, response.text


def test_clearing_a_class_returns_the_child_to_the_fallback(
    client, app_session, studio, a_priced_student, an_enrolled_student, two_classes, as_manager
):
    """`price_plan_id: null` DELETES the row rather than storing a null.

    A null row would be a third state meaning the same thing as no row, and the billing run
    would have to know about both -- two spellings of "not priced" is how one of them gets
    forgotten.
    """
    judo_id, _ = two_classes
    judo_plan = _plan(app_session, studio, "ג׳ודו · פעמיים", 30_000, judo_id)
    client.put(
        f"/api/v1/students/{a_priced_student.student_id}/class-prices",
        json={"items": [{"class_id": str(judo_id), "price_plan_id": str(judo_plan)}]},
        headers=as_manager.headers,
    )
    client.put(
        f"/api/v1/students/{a_priced_student.student_id}/class-prices",
        json={"items": [{"class_id": str(judo_id), "price_plan_id": None}]},
        headers=as_manager.headers,
    )
    rows = (
        app_session.execute(
            select(StudentClassPrice).where(
                StudentClassPrice.student_id == a_priced_student.student_id
            )
        )
        .scalars()
        .all()
    )
    assert rows == []


def test_a_coach_cannot_read_what_a_family_pays(
    client, a_priced_student, an_enrolled_student, two_classes, as_lead_coach
):
    """§3.2 -- a coach has no financial read, and invariant 3 enforces it against the tag."""
    response = client.get(
        f"/api/v1/students/{a_priced_student.student_id}/class-prices",
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 403
