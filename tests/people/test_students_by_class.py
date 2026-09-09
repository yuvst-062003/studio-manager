"""Filtering the students list by CLASS, not only by group.

Owner, 2026-09-09, choosing it from the per-class list: "Students — filter by class."

The list has been filterable by `group_id` since it existed, and a group is one timetable
slot -- "ג'ודו יום שלישי 17:00". A manager asking "who trains judo" has to ask it five times
and add the answers up, and a child in two judo groups is in the answer twice.

`class_id` is the question they were actually asking. It is DISTINCT over the child, for
the same reason the billing run keys on the distinct class: a child in two judo groups is
one judo student and must appear once.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.models.structure import Class as StudioClass
from app.models.structure import Group


@pytest.fixture
def judo_and_karate_groups(app_session, studio):
    """Two classes, and two groups inside judo -- the case a group filter answers wrongly."""
    judo = StudioClass(studio_id=studio.id, name="ג'ודו", discipline="judo")
    karate = StudioClass(studio_id=studio.id, name="קראטה", discipline="karate")
    app_session.add_all([judo, karate])
    app_session.flush()
    judo_a = Group(studio_id=studio.id, class_id=judo.id, name="ג'ודו א")
    judo_b = Group(studio_id=studio.id, class_id=judo.id, name="ג'ודו ב")
    karate_a = Group(studio_id=studio.id, class_id=karate.id, name="קראטה א")
    app_session.add_all([judo_a, judo_b, karate_a])
    app_session.commit()
    return {
        "judo": judo.id,
        "karate": karate.id,
        "judo_a": judo_a.id,
        "judo_b": judo_b.id,
        "karate_a": karate_a.id,
    }


@pytest.fixture
def a_student(app_session, studio) -> uuid.UUID:
    """One active student, built directly. `StudentService.create` would do it too, but it
    also wants a guardian and a clock, and neither is what these tests are about."""
    tag = uuid.uuid4().hex[:8]
    person = Person(studio_id=studio.id, first_name=f"דנה{tag}", last_name=f"כהן{tag}")
    app_session.add(person)
    app_session.flush()
    student = Student(studio_id=studio.id, person_id=person.id, status="active")
    app_session.add(student)
    app_session.commit()
    return student.id


def _enrol(app_session, studio, student_id: uuid.UUID, group_id: uuid.UUID) -> None:
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student_id,
            group_id=group_id,
            status="active",
            started_on="2026-01-01",
        )
    )
    app_session.commit()


def test_the_list_can_be_asked_for_one_class(
    client, app_session, studio, a_student, judo_and_karate_groups, as_manager
):
    ids = judo_and_karate_groups
    _enrol(app_session, studio, a_student, ids["judo_a"])

    judo = client.get(f"/api/v1/students?class_id={ids['judo']}", headers=as_manager.headers)
    assert judo.status_code == 200, judo.text
    assert str(a_student) in [row["id"] for row in judo.json()["items"]]

    karate = client.get(f"/api/v1/students?class_id={ids['karate']}", headers=as_manager.headers)
    assert str(a_student) not in [row["id"] for row in karate.json()["items"]]


def test_a_child_in_two_groups_of_one_class_appears_once(
    client, app_session, studio, a_student, judo_and_karate_groups, as_manager
):
    """The reason this is a class filter and not five group filters added together.

    Two judo groups are one judo student -- the same DISTINCT the billing run applies when
    it raises one charge per class. A join that fanned out over enrollments would list the
    child twice and make the count on the screen wrong.
    """
    ids = judo_and_karate_groups
    _enrol(app_session, studio, a_student, ids["judo_a"])
    _enrol(app_session, studio, a_student, ids["judo_b"])

    rows = client.get(
        f"/api/v1/students?class_id={ids['judo']}", headers=as_manager.headers
    ).json()["items"]
    assert [row["id"] for row in rows].count(str(a_student)) == 1


def test_a_child_who_left_the_class_is_not_in_it(
    client, app_session, studio, a_student, judo_and_karate_groups, as_manager
):
    """`ended_on IS NULL`, exactly like the group filter beside it: a child who left judo
    last year is not who a manager means by "the judo students"."""
    ids = judo_and_karate_groups
    _enrol(app_session, studio, a_student, ids["judo_a"])
    app_session.execute(
        Enrollment.__table__.update()
        .where(Enrollment.student_id == a_student)
        .values(ended_on="2026-02-01")
    )
    app_session.commit()

    rows = client.get(
        f"/api/v1/students?class_id={ids['judo']}", headers=as_manager.headers
    ).json()["items"]
    assert str(a_student) not in [row["id"] for row in rows]


def test_the_class_filter_combines_with_the_group_one_rather_than_replacing_it(
    client, app_session, studio, a_student, judo_and_karate_groups, as_manager
):
    """Both are `AND`, so a narrower question stays narrower. A class filter that quietly
    widened a group filter would be a filter that shows MORE rows than the one it replaced.
    """
    ids = judo_and_karate_groups
    _enrol(app_session, studio, a_student, ids["judo_a"])

    same = client.get(
        f"/api/v1/students?class_id={ids['judo']}&group_id={ids['judo_a']}",
        headers=as_manager.headers,
    ).json()["items"]
    assert str(a_student) in [row["id"] for row in same]

    # Judo's class, but the karate group: nobody is in both.
    contradictory = client.get(
        f"/api/v1/students?class_id={ids['judo']}&group_id={ids['karate_a']}",
        headers=as_manager.headers,
    ).json()["items"]
    assert contradictory == []
