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


def test_the_manager_moves_an_item_to_another_class(
    client,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    as_manager,
    as_guardian_of,
):
    """Filing is not only a creation-time decision.

    `ProductPatch` has carried `class_id` since the field existed, and its docstring says
    an item may be moved -- but `CatalogueService.update_product` never grew the parameter,
    so the route's `**fields` splat raised `TypeError` and the PATCH answered 500. It is
    the migration's leftovers that make this matter: every item the migration could not
    place is NULL, NULL is sold to nobody, and filing one afterwards was the only way to
    put it back on sale.
    """
    judo_id, karate_id = judo_and_karate
    created = client.post(
        "/api/v1/products",
        json={"name": "חגורה", "price_agorot": 5_000, "class_id": str(karate_id)},
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text

    moved = client.patch(
        f"/api/v1/products/{created.json()['id']}",
        json={"class_id": str(judo_id)},
        headers=as_manager.headers,
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["class_id"] == str(judo_id)

    # The seam that matters: the shop is what the manager was actually changing.
    parent = as_guardian_of(a_priced_student.student_id)
    names = [
        row["name"]
        for row in client.get("/api/v1/me/products", headers=parent.headers).json()["items"]
    ]
    assert "חגורה" in names


def test_the_manager_unfiles_an_item_and_it_leaves_every_shop(
    client,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    as_manager,
    as_guardian_of,
):
    """`class_id: null` is a deliberate write, not an omission -- `exclude_unset` is what
    separates the two -- and it takes the item off sale everywhere rather than putting it
    on sale for the whole club."""
    judo_id, _ = judo_and_karate
    created = client.post(
        "/api/v1/products",
        json={"name": "ביטוח שנתי", "price_agorot": 5_000, "class_id": str(judo_id)},
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text

    unfiled = client.patch(
        f"/api/v1/products/{created.json()['id']}",
        json={"class_id": None},
        headers=as_manager.headers,
    )
    assert unfiled.status_code == 200, unfiled.text
    assert unfiled.json()["class_id"] is None

    parent = as_guardian_of(a_priced_student.student_id)
    names = [
        row["name"]
        for row in client.get("/api/v1/me/products", headers=parent.headers).json()["items"]
    ]
    assert "ביטוח שנתי" not in names


@pytest.fixture
def a_judo_lesson(app_session, studio, a_group, a_priced_student):
    """A real lesson of the class `a_priced_student` trains in.

    The picker is scoped by the SESSION rather than by a class id the coach passes: a coach
    holds a lesson, not a class, and a route that took `class_id` would invite a caller to
    name one the lesson is not.
    """
    from datetime import UTC, datetime, time, timedelta

    from app.core.clock import now
    from app.models.schedule import Session as SessionRow
    from app.models.schedule import TrainingYear

    today = now().date()
    year = TrainingYear(
        studio_id=studio.id,
        name="שנת בדיקה",
        starts_on=today - timedelta(days=365),
        ends_on=today + timedelta(days=365),
        status="active",
    )
    app_session.add(year)
    app_session.flush()
    lesson = SessionRow(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=year.id,
        starts_at=datetime.combine(today, time(17, 0), tzinfo=UTC),
        ends_at=datetime.combine(today, time(18, 0), tzinfo=UTC),
    )
    app_session.add(lesson)
    app_session.commit()
    return lesson.id


def test_a_coach_is_offered_only_this_lessons_items(
    client,
    app_session,
    studio,
    a_group,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    a_judo_lesson,
    as_lead_coach,
):
    """A coach teaching judo was being offered karate gloves.

    The club decided an item belongs to exactly one class; the picker never learned it, so
    `handout-options` returned every active row in the studio. Unfiled items go too -- NULL
    is sold to nobody, and handing one over would raise a charge for an item no parent can
    see in the shop.
    """
    judo_id, karate_id = judo_and_karate
    _product(app_session, studio, "גי לג׳ודו", judo_id)
    _product(app_session, studio, "כפפות קראטה", karate_id)
    _product(app_session, studio, "ביטוח שנתי", None)

    response = client.get(
        f"/api/v1/products/handout-options?session_id={a_judo_lesson}",
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 200, response.text
    names = [row["name"] for row in response.json()["items"]]
    assert names == ["גי לג׳ודו"]


def test_the_handout_picker_still_carries_no_money_when_scoped(
    client,
    app_session,
    studio,
    a_group,
    a_priced_student,
    judo_and_karate,
    a_judo_lesson,
    as_lead_coach,
):
    """Invariant 3 is a property of the SHAPE, and narrowing the list must not widen it."""
    judo_id, _ = judo_and_karate
    _product(app_session, studio, "גי לג׳ודו", judo_id)
    items = client.get(
        f"/api/v1/products/handout-options?session_id={a_judo_lesson}",
        headers=as_lead_coach.headers,
    ).json()["items"]
    assert items, "the fixture must offer the coach something to inspect"
    for row in items:
        assert set(row) == {"id", "name"}


def test_the_shop_names_the_class_each_item_belongs_to(
    client,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    as_guardian_of,
):
    """A family with children in two classes was shown one merged list.

    Two classes may both sell a `חגורה`, and until now nothing on the row said which was
    which -- so the parent picked one of two identical lines and found out which they had
    bought when it arrived. The class travels WITH the item rather than as a second request
    the shop would have to correlate.
    """
    judo_id, karate_id = judo_and_karate
    _product(app_session, studio, "חגורה", judo_id)
    parent = as_guardian_of(a_priced_student.student_id)

    rows = client.get("/api/v1/me/products", headers=parent.headers).json()["items"]
    assert [row["name"] for row in rows] == ["חגורה"]
    assert rows[0]["class_id"] == str(judo_id)
    # The NAME and not only the id: the shop renders a heading, and an id is not a heading.
    assert rows[0]["class_name"]


def test_the_shop_still_names_no_class_a_family_cannot_buy_from(
    client,
    app_session,
    studio,
    a_priced_student,
    an_enrolled_student,
    judo_and_karate,
    as_guardian_of,
):
    """Carrying the class on the row must not become a way to learn the club's other
    classes. The filter is unchanged; only the rows that survive it gain a name."""
    judo_id, karate_id = judo_and_karate
    _product(app_session, studio, "גי לג׳ודו", judo_id)
    _product(app_session, studio, "כפפות קראטה", karate_id)
    parent = as_guardian_of(a_priced_student.student_id)

    rows = client.get("/api/v1/me/products", headers=parent.headers).json()["items"]
    assert {row["class_id"] for row in rows} == {str(judo_id)}
