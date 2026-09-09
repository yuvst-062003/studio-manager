"""The shop stops being one catalogue for the whole club.

Owner, 2026-09-09: "every class can have his own unique items". Until this, `GET
/me/products` selected every active row in the studio, so a karate family was offered a judo
gi and there was no way for the club to say otherwise.

Two rules, and the second is the one that could go wrong quietly:

  * a family sees the items of the classes their own children actively train in;
  * an item with NO class is seen by NOBODY. The owner chose "every item belongs to exactly
    one class" over a club-wide tier, so NULL means unfiled, not universal. Reading it the
    other way would take every item the migration could not place and show it to the whole
    club -- the opposite of what was asked for, arrived at by treating a missing value as a
    permission.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.billing import Product
from app.models.people import Enrollment
from app.models.structure import Class as StudioClass
from app.models.structure import Group
from sqlalchemy import select
from tests.billing.conftest import YEAR_STARTS


def _product(app_session, studio, name: str, class_id: uuid.UUID | None) -> uuid.UUID:
    row = Product(
        studio_id=studio.id,
        name=name,
        price_agorot=12_000,
        is_active=True,
        sizes=[],
        class_id=class_id,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def judo_and_karate(app_session, studio, a_priced_student, an_enrolled_student):
    """The child's own class, plus a class they do NOT train in."""
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
    app_session.commit()
    return judo_id, karate.id


def test_a_family_sees_their_own_class_items_and_not_another_class_s(
    client,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    as_guardian_of,
):
    judo_id, karate_id = judo_and_karate
    _product(app_session, studio, "גי לג׳ודו", judo_id)
    _product(app_session, studio, "כפפות קראטה", karate_id)
    parent = as_guardian_of(a_priced_student.student_id)

    response = client.get("/api/v1/me/products", headers=parent.headers)
    assert response.status_code == 200, response.text
    names = [row["name"] for row in response.json()["items"]]
    assert names == ["גי לג׳ודו"]


def test_an_item_with_no_class_is_sold_to_nobody(
    client,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    as_guardian_of,
):
    """NULL is unfiled, never club-wide.

    The migration leaves `class_id` NULL wherever it could not tell which class was meant.
    Reading that as "everyone" would show the whole club every item nobody had filed, which
    is the opposite of what was asked for -- arrived at by treating a missing value as a
    permission.
    """
    judo_id, _ = judo_and_karate
    _product(app_session, studio, "ביטוח שנתי", None)
    _product(app_session, studio, "גי לג׳ודו", judo_id)
    parent = as_guardian_of(a_priced_student.student_id)

    response = client.get("/api/v1/me/products", headers=parent.headers)
    names = [row["name"] for row in response.json()["items"]]
    assert names == ["גי לג׳ודו"]
    assert "ביטוח שנתי" not in names


def test_a_class_the_child_has_left_stops_selling_to_them(
    client,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    as_guardian_of,
):
    """`active` enrollments only. A child who left judo last year is not a reason to keep
    selling judo kit to that family."""
    judo_id, _ = judo_and_karate
    _product(app_session, studio, "גי לג׳ודו", judo_id)
    app_session.execute(
        Enrollment.__table__.update()
        .where(Enrollment.student_id == a_priced_student.student_id)
        .values(status="ended", ended_on=YEAR_STARTS)
    )
    app_session.commit()
    parent = as_guardian_of(a_priced_student.student_id)

    response = client.get("/api/v1/me/products", headers=parent.headers)
    assert response.json()["items"] == []


def test_the_manager_files_an_item_under_a_class(
    client, app_session, studio, judo_and_karate, as_manager
):
    """The dashboard's half: create with a class, and read it back on the row so the screen
    can show which class an item belongs to."""
    judo_id, _ = judo_and_karate
    manager = as_manager
    created = client.post(
        "/api/v1/products",
        json={"name": "חגורה", "price_agorot": 5_000, "class_id": str(judo_id)},
        headers=manager.headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["class_id"] == str(judo_id)

    listed = client.get("/api/v1/products", headers=manager.headers)
    rows = {row["name"]: row["class_id"] for row in listed.json()["items"]}
    assert rows["חגורה"] == str(judo_id)
