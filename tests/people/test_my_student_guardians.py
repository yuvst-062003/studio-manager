"""`GET /me/students/{id}/guardians` -- the guardians of ONE of my children.

**The defect this closes.** The trainee card read `/me/guardians`, which walks every one of
the caller's children and deduplicates by person. Right for a screen about the family;
wrong for a card about one child, and wrong in two directions at once: a household with two
children rendered an identical list on both cards, and a grandparent who guards only one of
them appeared on the other.

Filtering that deduplicated list client-side would have been worse. Dedup keeps only the
first child's row for a person who guards both, so a shared parent filtered by `student_id`
would vanish from the second child's card entirely -- a parent's own name missing from their
own child's record, with nothing on screen to suggest why.
"""

from __future__ import annotations

import uuid

from app.models.people import Student
from app.models.person import Guardian, Person
from app.models.studio import Studio
from sqlalchemy.orm import Session


def _child(app_session: Session, studio: Studio, first: str) -> Student:
    person = Person(studio_id=studio.id, first_name=first, last_name="בודק")
    app_session.add(person)
    app_session.flush()
    student = Student(studio_id=studio.id, person_id=person.id, status="active")
    app_session.add(student)
    app_session.flush()
    return student


def _link(
    app_session: Session,
    studio: Studio,
    student_id: uuid.UUID,
    person_id: uuid.UUID,
    *,
    relation: str = "parent",
    is_primary: bool = False,
) -> None:
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=student_id,
            person_id=person_id,
            is_primary=is_primary,
            relation=relation,
        )
    )


def test_two_children_get_two_different_guardian_lists(client, as_guardian, app_session, studio):
    """The defect, stated as a property.

    The signed-in parent guards both children; a grandmother guards only the second. The
    first child's card must not name her -- and the shared parent must appear on BOTH,
    which is the half a client-side filter over the deduplicated list would have broken.
    """
    first = _child(app_session, studio, "ראשון")
    second = _child(app_session, studio, "שני")
    granny = Person(studio_id=studio.id, first_name="סבתא", last_name="בודק")
    app_session.add(granny)
    app_session.flush()
    _link(app_session, studio, first.id, as_guardian.person_id, is_primary=True)
    _link(app_session, studio, second.id, as_guardian.person_id, is_primary=True)
    _link(app_session, studio, second.id, granny.id, relation="grandparent")
    app_session.commit()

    first_list = client.get(
        f"/api/v1/me/students/{first.id}/guardians", headers=as_guardian.headers
    ).json()["items"]
    second_list = client.get(
        f"/api/v1/me/students/{second.id}/guardians", headers=as_guardian.headers
    ).json()["items"]

    assert [row["person_id"] for row in first_list] == [str(as_guardian.person_id)]
    assert {row["person_id"] for row in second_list} == {
        str(as_guardian.person_id),
        str(granny.id),
    }


def test_the_relation_is_on_the_wire(client, as_guardian, app_session, studio):
    """What the card's label reads.

    `relation` decides the row: an adult member who registered themselves is `'self'` and
    the card draws no guardians row at all rather than filing them under הורים, and any
    non-parent moves the whole row to אפוטרופוסים.
    """
    student = _child(app_session, studio, "בוגר")
    granny = Person(studio_id=studio.id, first_name="סבתא", last_name="בודק")
    app_session.add(granny)
    app_session.flush()
    _link(app_session, studio, student.id, as_guardian.person_id, is_primary=True)
    _link(app_session, studio, student.id, granny.id, relation="grandparent")
    app_session.commit()

    rows = client.get(
        f"/api/v1/me/students/{student.id}/guardians", headers=as_guardian.headers
    ).json()["items"]

    assert sorted(row["relation"] for row in rows) == ["grandparent", "parent"]


def test_a_self_guarding_adult_is_reported_as_such(client, as_guardian, app_session, studio):
    """§5.3's adult member -- one person in both roles.

    `services/people/onboarding.py` already writes `relation='self'` for them. Nothing read
    it, which is why an adult member's own card listed him under הורים as his own parent.
    """
    student = _child(app_session, studio, "בוגר")
    _link(app_session, studio, student.id, as_guardian.person_id, relation="self", is_primary=True)
    app_session.commit()

    rows = client.get(
        f"/api/v1/me/students/{student.id}/guardians", headers=as_guardian.headers
    ).json()["items"]

    assert [row["relation"] for row in rows] == ["self"]


def test_another_familys_child_is_a_404_and_never_a_403(client, as_guardian, app_session, studio):
    """A 403 would confirm the student exists in this studio, which is the leak the check
    is for. Under `/me/` the collection is "my children", so an id outside it does not
    exist."""
    mine = _child(app_session, studio, "שלי")
    theirs = _child(app_session, studio, "שלהם")
    _link(app_session, studio, mine.id, as_guardian.person_id, is_primary=True)
    app_session.commit()

    response = client.get(f"/api/v1/me/students/{theirs.id}/guardians", headers=as_guardian.headers)

    assert response.status_code == 404


def test_an_unknown_student_id_is_also_a_404(client, as_guardian, app_session, studio):
    mine = _child(app_session, studio, "שלי")
    _link(app_session, studio, mine.id, as_guardian.person_id, is_primary=True)
    app_session.commit()

    response = client.get(
        f"/api/v1/me/students/{uuid.uuid4()}/guardians", headers=as_guardian.headers
    )

    assert response.status_code == 404
