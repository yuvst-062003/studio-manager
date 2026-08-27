"""§5.9's `belt_rank`: per class, ordered, editable. Artboard `5b`.

Three rules carry the weight here.

Ranks are ordered **within a class** -- a karate white belt and a judo white belt are
different rows on different ladders -- and `uq_belt_rank_class_order` makes that order
total, because "what is this child's next belt" is the question every progression screen
answers and two ranks at one position make it unanswerable.

A rank students **hold** is not deletable. `student_belt.belt_rank_id` is ON DELETE
RESTRICT, so the alternative to refusing is a 500 -- or, if the constraint were ever
relaxed, a grading history pointing at nothing.

And `class_id` is `NOT NULL` in the database while `BeltRankIn.class_id` is optional, so
the API has to refuse the null rather than hand it to Postgres: a constraint violation
reaches the manager as a 500 with no field attached, and the form cannot mark what is
wrong.
"""

from __future__ import annotations

from datetime import date

from app.models.belts import BeltRank, StudentBelt
from tests.belts.conftest import TODAY


def test_the_ladder_lists_in_order_within_its_class(client, as_manager, a_class, a_belt_ladder):
    response = client.get(f"/api/v1/belt-ranks?class_id={a_class}", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [row["order_index"] for row in items] == [0, 1, 2]
    assert [row["name"] for row in items] == ["לבנה", "צהובה", "צהובה-כתומה"]
    assert items[2]["secondary_color_hex"] == "#F08A24"


def test_a_rank_without_a_class_is_refused_rather_than_handed_to_postgres(client, as_manager):
    """`belt_rank.class_id` is NOT NULL and `BeltRankIn.class_id` is `UUID | None`."""
    response = client.post(
        "/api/v1/belt-ranks",
        headers=as_manager.headers,
        json={"name": "חדשה", "order_index": 9, "color_hex": "#123456"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "class_required"


def test_two_ranks_cannot_share_a_position(client, as_manager, a_class, a_belt_ladder):
    """`uq_belt_rank_class_order`. A collision is a 409 the editor can act on, not the
    integrity error the constraint would otherwise surface as."""
    response = client.post(
        "/api/v1/belt-ranks",
        headers=as_manager.headers,
        json={
            "class_id": str(a_class),
            "name": "כתומה",
            "order_index": 1,
            "color_hex": "#F08A24",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_index_taken"


def test_a_colour_that_is_not_a_colour_is_refused(client, as_manager, a_class):
    """D3 -- `color_hex` is DATA, and the one place in the product where a raw hex is
    correct. Data still has a shape: a name reaches `BeltBar` as a CSS value it cannot
    render, and the belt disappears rather than erroring."""
    response = client.post(
        "/api/v1/belt-ranks",
        headers=as_manager.headers,
        json={
            "class_id": str(a_class),
            "name": "צהובה",
            "order_index": 7,
            "color_hex": "yellow",
        },
    )
    assert response.status_code == 422


def test_a_rank_students_hold_is_not_deleted(
    client, app_session, as_manager, studio, a_belt_ladder, a_student
):
    """`5b` draws a delete icon on a row that shows a student count, and no confirmation.
    The count is the data to refuse with."""
    app_session.add(
        StudentBelt(
            studio_id=studio.id,
            student_id=a_student,
            belt_rank_id=a_belt_ladder[0],
            awarded_on=TODAY,
        )
    )
    app_session.commit()

    response = client.delete(f"/api/v1/belt-ranks/{a_belt_ladder[0]}", headers=as_manager.headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "rank_is_held"
    assert app_session.get(BeltRank, a_belt_ladder[0]) is not None


def test_the_ladder_reports_how_many_students_hold_each_rank(
    client, app_session, as_manager, studio, a_class, a_belt_ladder, a_student
):
    """`5b`'s חניכים column, and the reason the delete above has something to say."""
    app_session.add(
        StudentBelt(
            studio_id=studio.id,
            student_id=a_student,
            belt_rank_id=a_belt_ladder[0],
            awarded_on=TODAY,
        )
    )
    app_session.commit()
    items = client.get(f"/api/v1/belt-ranks?class_id={a_class}", headers=as_manager.headers).json()[
        "items"
    ]
    assert [row["holders"] for row in items] == [1, 0, 0]


def test_an_unheld_rank_is_deleted(client, app_session, as_manager, a_belt_ladder):
    response = client.delete(f"/api/v1/belt-ranks/{a_belt_ladder[2]}", headers=as_manager.headers)
    assert response.status_code == 204
    assert app_session.get(BeltRank, a_belt_ladder[2]) is None


def test_reordering_rewrites_the_whole_ladder_in_one_go(client, as_manager, a_class, a_belt_ladder):
    """`5b` reorders by drag. There is no drag primitive and no shared drag utility, so
    the screen moves rows with buttons -- but either way the WRITE is the whole list: a
    pairwise swap through a UNIQUE index has to pass through a colliding intermediate
    state, and this does not."""
    reversed_ids = [str(rank_id) for rank_id in reversed(a_belt_ladder)]
    response = client.post(
        "/api/v1/belt-ranks/reorder",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "ordered_ids": reversed_ids},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [row["id"] for row in items] == reversed_ids
    assert [row["order_index"] for row in items] == [0, 1, 2]


def test_a_reorder_must_name_the_whole_ladder(client, as_manager, a_class, a_belt_ladder):
    """A partial list would leave the omitted ranks at indices the named ones are about to
    take. Refused rather than half-applied."""
    response = client.post(
        "/api/v1/belt-ranks/reorder",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "ordered_ids": [str(a_belt_ladder[0])]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "reorder_must_name_the_whole_ladder"


def test_a_lead_coach_does_not_configure_the_belt_system(client, as_lead_coach, a_class):
    """§3.2 -- the belt system is studio configuration. A lead coach RECORDS results
    (§5.9, and the `as_lead_coach` fixture's own docstring); a lead coach does not redefine
    the ladder those results are graded against."""
    response = client.post(
        "/api/v1/belt-ranks",
        headers=as_lead_coach.headers,
        json={
            "class_id": str(a_class),
            "name": "דרגה",
            "order_index": 7,
            "color_hex": "#000000",
        },
    )
    assert response.status_code == 403


def test_a_coach_can_still_read_the_ladder(client, as_assistant_coach, a_class, a_belt_ladder):
    """`9d` renders every candidate's current and next belt, and a coach who cannot read
    the ladder cannot run the exam. A ladder carries no money, so §3.2's hard rule does not
    reach it."""
    response = client.get(
        f"/api/v1/belt-ranks?class_id={a_class}", headers=as_assistant_coach.headers
    )
    assert response.status_code == 200
    assert len(response.json()["items"]) == 3


def test_the_next_rank_is_the_one_above_and_the_top_has_none(
    client, as_manager, a_class, a_belt_ladder
):
    """`events.belt.orderHint` -- הסדר קובע מהי הדרגה הבאה. The top of the ladder having no
    next rank is what makes a student there ineligible, so it is asserted here rather than
    discovered by the eligibility screen."""
    items = client.get(f"/api/v1/belt-ranks?class_id={a_class}", headers=as_manager.headers).json()[
        "items"
    ]
    assert items[0]["next_rank_id"] == items[1]["id"]
    assert items[1]["next_rank_id"] == items[2]["id"]
    assert items[2]["next_rank_id"] is None


def test_a_rank_is_renamed_and_recoloured_in_place(client, as_manager, a_class, a_belt_ladder):
    """`5b` finding 5 -- belt names are DATA, because the manager edits them on that
    screen. That is what settles the data-or-copy question for every preset too."""
    response = client.patch(
        f"/api/v1/belt-ranks/{a_belt_ladder[1]}",
        headers=as_manager.headers,
        json={
            "class_id": str(a_class),
            "name": "צהובה בהירה",
            "kyu": 5,
            "order_index": 1,
            "color_hex": "#FFE066",
            "secondary_color_hex": None,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "צהובה בהירה"
    assert response.json()["color_hex"] == "#FFE066"


# -- F8: 4b's belt range, measured ---------------------------------------------
def test_belt_ranges_by_group_span_the_enrolled_students(
    client, as_manager, app_session, studio, a_class, a_belt_ladder, a_student
):
    from app.models.people import Enrollment, Student
    from app.models.person import Person
    from app.models.structure import Group

    group = Group(studio_id=studio.id, class_id=a_class, name="טווח", is_active=True)
    app_session.add(group)
    app_session.flush()

    # a_student holds the FIRST rank; a second student holds the last.
    first_rank, last_rank = a_belt_ladder[0], a_belt_ladder[-1]
    app_session.get(Student, a_student).current_belt_id = first_rank
    person = Person(studio_id=studio.id, first_name="בכיר", last_name="חגורה")
    app_session.add(person)
    app_session.flush()
    senior = Student(
        studio_id=studio.id, person_id=person.id, status="active", current_belt_id=last_rank
    )
    app_session.add(senior)
    app_session.flush()
    for student_id in (a_student, senior.id):
        app_session.add(
            Enrollment(
                studio_id=studio.id,
                student_id=student_id,
                group_id=group.id,
                status="active",
                started_on=date(2026, 9, 1),
            )
        )
    app_session.commit()

    body = client.get("/api/v1/belt-ranges/by-group", headers=as_manager.headers).json()
    row = next(item for item in body["items"] if item["group_id"] == str(group.id))
    assert row["min_name"] != row["max_name"]
    assert row["min_color_hex"].startswith("#")
