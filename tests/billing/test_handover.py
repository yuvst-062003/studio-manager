"""The club shop's two halves, and the double charge that happened between them.

A parent orders a גי in the parent app and a `charge` is raised. The parent app then
promises them, in `billing.shop.deliveryNote`, a hand-over from the coach at the start of
training. On the mat the coach opened `11a`'s sheet -- which could not see that order --
picked the same item, and raised a SECOND charge for it. Every test here is about the seam
that now joins the two.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta

import pytest
from app.core.clock import now
from app.models.billing import Charge, Product
from sqlalchemy import select

API = "/api/v1"


def _product(
    app_session, studio, *, name: str, price: int, sizes: list[str] | None = None
) -> uuid.UUID:
    row = Product(
        studio_id=studio.id, name=name, price_agorot=price, is_active=True, sizes=sizes or []
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def _order(client, parent, product_id: uuid.UUID, *, size: str | None = None) -> str:
    line: dict[str, object] = {"product_id": str(product_id), "quantity": 1}
    if size is not None:
        line["size"] = size
    response = client.post(f"{API}/me/orders/items", json={"items": [line]}, headers=parent.headers)
    assert response.status_code == 201, response.text
    return response.json()["charge_ids"][0]


@pytest.fixture
def a_session_for_the_student(app_session, studio, a_priced_student, a_group) -> uuid.UUID:
    """A lesson `a_priced_student` is on the roster of.

    The route is session-scoped (see its own docstring: both callers ask the question about
    a lesson, not a child), so every read here needs a real session with a real roster
    behind it rather than a bare student id.

    `started_on` is a year back and `ends_on` a year forward so the enrolment covers the
    session's date whatever `clock.now()` says — a fixture that quietly stops matching in
    January is a fixture that fails for a reason no assertion names.
    """
    from app.models.people import Enrollment
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
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=a_priced_student.student_id,
            group_id=a_group,
            status="active",
            started_on=today - timedelta(days=30),
        )
    )
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


def test_a_coach_sees_what_the_family_has_already_ordered(
    client,
    app_session,
    studio,
    a_priced_student,
    as_guardian_of,
    as_lead_coach,
    a_session_for_the_student,
):
    """The read that did not exist, and whose absence is the whole bug.

    Matched on the PAYER: `POST /me/orders/items` writes `student_id=None`, because a
    parent orders from a shop that never asks which of their children it is for.
    """
    gi = _product(app_session, studio, name="גי", price=18_000, sizes=["140"])
    parent = as_guardian_of(a_priced_student.student_id)
    charge_id = _order(client, parent, gi, size="140")

    waiting = client.get(
        f"{API}/sessions/{a_session_for_the_student}/awaiting-handout",
        headers=as_lead_coach.headers,
    )
    assert waiting.status_code == 200, waiting.text
    items = waiting.json()["items"]
    assert len(items) == 1
    assert items[0]["charge_id"] == charge_id
    assert items[0]["product_name"] == "גי"
    # The size is the reason a coach needs this row at all -- the family was promised a
    # hand-over "לאחר וידוא מידה".
    assert items[0]["line_note"] == "גי · 140"


def test_the_awaiting_list_names_no_price(
    client,
    app_session,
    studio,
    a_priced_student,
    as_guardian_of,
    as_lead_coach,
    a_session_for_the_student,
):
    """§3.2 and invariant 3. The route is coach-tagged; the shape's absence is the
    guarantee, asserted here from the client's side as well."""
    gi = _product(app_session, studio, name="גי", price=18_000)
    _order(client, as_guardian_of(a_priced_student.student_id), gi)

    row = client.get(
        f"{API}/sessions/{a_session_for_the_student}/awaiting-handout",
        headers=as_lead_coach.headers,
    ).json()["items"][0]
    for forbidden in ("price_agorot", "amount_agorot", "total_agorot"):
        assert forbidden not in row


def test_handing_over_an_order_settles_it_instead_of_charging_again(
    client,
    app_session,
    studio,
    a_priced_student,
    as_guardian_of,
    as_lead_coach,
    a_session_for_the_student,
):
    """**The defect, end to end.** One order in, one charge out -- not two."""
    gi = _product(app_session, studio, name="גי", price=18_000, sizes=["140"])
    parent = as_guardian_of(a_priced_student.student_id)
    charge_id = _order(client, parent, gi, size="140")

    handed = client.post(f"{API}/charges/{charge_id}/hand-over", headers=as_lead_coach.headers)
    assert handed.status_code == 200, handed.text
    assert handed.json()["product_name"] == "גי"
    # Says THAT it was handed over, never for how much (invariant 3).
    assert "amount_agorot" not in handed.json()

    app_session.expire_all()
    charges = list(app_session.execute(select(Charge).where(Charge.product_id == gi)).scalars())
    assert len(charges) == 1, "the hand-over settled the order rather than raising a second charge"
    assert charges[0].handed_over_at is not None

    # And it drops off the coach's list, because that list is what it is now settled against.
    assert (
        client.get(
            f"{API}/sessions/{a_session_for_the_student}/awaiting-handout",
            headers=as_lead_coach.headers,
        ).json()["items"]
        == []
    )


def test_a_second_hand_over_is_refused_rather_than_silently_redated(
    client, app_session, studio, a_priced_student, as_guardian_of, as_lead_coach
):
    """Two coaches tapping the same row is ordinary -- one hands it over, the other has a
    stale list. The second must be told, not quietly overwrite the first date."""
    gi = _product(app_session, studio, name="גי", price=18_000)
    charge_id = _order(client, as_guardian_of(a_priced_student.student_id), gi)

    assert (
        client.post(
            f"{API}/charges/{charge_id}/hand-over", headers=as_lead_coach.headers
        ).status_code
        == 200
    )
    again = client.post(f"{API}/charges/{charge_id}/hand-over", headers=as_lead_coach.headers)
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "already_handed_over"
    assert again.json()["detail"]["handed_over_at"]


def test_a_tuition_charge_cannot_be_handed_over(client, an_open_charge, as_lead_coach):
    """Not 422: a tuition charge and a nonexistent one answer alike, so a coach cannot
    probe charge ids for what kind they are."""
    response = client.post(
        f"{API}/charges/{an_open_charge}/hand-over", headers=as_lead_coach.headers
    )
    assert response.status_code == 404


def test_an_item_handed_over_from_the_mat_names_its_product_and_is_never_waiting(
    client,
    app_session,
    studio,
    a_priced_student,
    as_lead_coach,
    as_manager,
    a_session_for_the_student,
):
    """`POST /charges/from-product` IS the act of putting the item in a child's hands.

    Two things it did not do before: it left `product_id` NULL, so the item never appeared
    in the family's own "ההזמנות שלי" (which filters on exactly that column) and was
    indistinguishable from a manager's ad-hoc charge -- including §5.10's negative credit.
    And with the new column it would have left `handed_over_at` NULL, putting every
    hand-over straight back onto the coach's own "bring this" list.
    """
    product = client.post(
        f"{API}/products",
        json={"name": "חגורה", "price_agorot": 6_000},
        headers=as_manager.headers,
    ).json()

    handed = client.post(
        f"{API}/charges/from-product",
        json={"product_id": product["id"], "student_id": str(a_priced_student.student_id)},
        headers=as_lead_coach.headers,
    )
    assert handed.status_code == 201, handed.text

    app_session.expire_all()
    charge = app_session.execute(
        select(Charge).where(Charge.id == uuid.UUID(handed.json()["charge_id"]))
    ).scalar_one()
    assert charge.product_id == uuid.UUID(product["id"])
    assert charge.handed_over_at is not None

    assert (
        client.get(
            f"{API}/sessions/{a_session_for_the_student}/awaiting-handout",
            headers=as_lead_coach.headers,
        ).json()["items"]
        == []
    )


def test_a_two_child_family_sees_the_order_on_both_children(
    client,
    app_session,
    studio,
    a_priced_student,
    as_guardian_of,
    as_lead_coach,
    a_price_plan,
    a_session_for_the_student,
):
    """Not a defect being papered over.

    The shop never asks which child an order is for, so the only link is the guardian who
    paid. Showing it on both and letting the coach pick is the real act; guessing would
    stamp the wrong order and leave the right one open forever.
    """
    from app.models.people import Enrollment, Student
    from app.models.person import Guardian, Person
    from app.models.schedule import Session as SessionRow
    from tests.billing.conftest import YEAR_STARTS

    # The parent who ORDERS is `as_guardian_of`'s own guardian row, which is a different
    # person from `a_priced_student.payer_person_id` (that one never signs in -- see the
    # fixture's docstring). The sibling has to be attached to the one who actually paid, or
    # this test asserts nothing about a family and everything about a fixture.
    parent = as_guardian_of(a_priced_student.student_id)

    sibling_person = Person(studio_id=studio.id, first_name="אח", last_name="בודק")
    app_session.add(sibling_person)
    app_session.flush()
    sibling = Student(
        studio_id=studio.id,
        person_id=sibling_person.id,
        status="active",
        joined_on=YEAR_STARTS,
        price_plan_id=a_price_plan,
    )
    app_session.add(sibling)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=sibling.id,
            person_id=parent.person_id,
            is_primary=True,
            relation="parent",
        )
    )
    # On the SAME roster as their sibling — which is the case this test is about. A route
    # scoped to a lesson can only offer a row against a child who is in it.
    lesson = app_session.execute(
        select(SessionRow).where(SessionRow.id == a_session_for_the_student)
    ).scalar_one()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=sibling.id,
            group_id=lesson.group_id,
            status="active",
            started_on=now().date() - timedelta(days=30),
        )
    )
    app_session.commit()

    gi = _product(app_session, studio, name="גי", price=18_000)
    _order(client, parent, gi)

    items = client.get(
        f"{API}/sessions/{a_session_for_the_student}/awaiting-handout",
        headers=as_lead_coach.headers,
    ).json()["items"]
    # One charge, offered against BOTH siblings on the roster -- same `charge_id`, two rows.
    assert len({row["charge_id"] for row in items}) == 1
    assert {row["student_id"] for row in items} == {
        str(a_priced_student.student_id),
        str(sibling.id),
    }
