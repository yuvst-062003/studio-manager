"""A class owns its coaches, and only they may be assigned to it.

Owner, 2026-09-09: "per class there is its own class main coach and assistance coaches.
They are not shareable between classes. If a coach is in both, the studio manager needs to
add his details in both classes. And only class coaches can be assigned to the class." Then,
on how strictly: "Refuse it, and hide it. Studio managers are allowed."

Coaches were attached one level DOWN -- to a group -- so "who coaches judo" could only be
inferred from the groups a person happened to hold, and "who is judo's MAIN coach" could not
be said at all. `class_staff` is the roster itself, and `admit_to_group` is the rule that reads it.

**The rule lives in the service, not in a picker.** A screen that merely hides an outsider is
a screen an API call goes around, and this decides who may stand in front of a class of
children.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.person import Person, RoleAssignment
from app.models.structure import Class as StudioClass
from app.models.structure import ClassStaff, Group
from sqlalchemy import select


@pytest.fixture
def judo_and_karate(app_session, studio):
    judo = StudioClass(studio_id=studio.id, name="ג'ודו", discipline="judo")
    karate = StudioClass(studio_id=studio.id, name="קראטה", discipline="karate")
    app_session.add_all([judo, karate])
    app_session.flush()
    judo_group = Group(studio_id=studio.id, class_id=judo.id, name="ג'ודו א")
    karate_group = Group(studio_id=studio.id, class_id=karate.id, name="קראטה א")
    app_session.add_all([judo_group, karate_group])
    app_session.commit()
    return {
        "judo": judo.id,
        "karate": karate.id,
        "judo_group": judo_group.id,
        "karate_group": karate_group.id,
    }


@pytest.fixture
def a_person(app_session, studio):
    def _make(name: str = "מאמן") -> uuid.UUID:
        person = Person(studio_id=studio.id, first_name=name, last_name=uuid.uuid4().hex[:6])
        app_session.add(person)
        app_session.commit()
        return person.id

    return _make


# -- the roster ---------------------------------------------------------------
def test_a_manager_puts_a_coach_on_a_class(client, judo_and_karate, a_person, as_manager):
    person_id = a_person("יוסי")
    response = client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assert response.status_code == 201, response.text

    listed = client.get(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff", headers=as_manager.headers
    ).json()["items"]
    assert [(row["person_id"], row["role"]) for row in listed] == [(str(person_id), "lead_coach")]
    assert listed[0]["display_name"]


def test_a_coach_of_two_classes_is_added_twice_and_leaves_one_at_a_time(
    client, app_session, judo_and_karate, a_person, as_manager
):
    """The owner's sentence, literally: "if a coach is in both, the studio manager needs to
    add his details in both classes"."""
    person_id = a_person("אורי")
    for class_id in (judo_and_karate["judo"], judo_and_karate["karate"]):
        created = client.post(
            f"/api/v1/classes/{class_id}/staff",
            json={"person_id": str(person_id), "role": "assistant_coach"},
            headers=as_manager.headers,
        )
        assert created.status_code == 201, created.text

    removed = client.delete(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff/{person_id}",
        headers=as_manager.headers,
    )
    assert removed.status_code == 204, removed.text

    judo = client.get(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff", headers=as_manager.headers
    ).json()["items"]
    karate = client.get(
        f"/api/v1/classes/{judo_and_karate['karate']}/staff", headers=as_manager.headers
    ).json()["items"]
    assert judo == []
    # Leaving one class leaves the other standing.
    assert [row["person_id"] for row in karate] == [str(person_id)]


def test_adding_the_same_coach_twice_updates_the_role_rather_than_duplicating(
    client, app_session, judo_and_karate, a_person, as_manager
):
    """A duplicate would list one person twice on the roster the rule reads. Promoting an
    assistant to main coach is the same sentence a manager would say to add them, so it is
    applied rather than refused."""
    person_id = a_person()
    first = client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person_id), "role": "assistant_coach"},
        headers=as_manager.headers,
    )
    assert first.status_code == 201
    again = client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    # 200, not 201: nothing was created.
    assert again.status_code == 200, again.text

    rows = client.get(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff", headers=as_manager.headers
    ).json()["items"]
    assert len(rows) == 1
    assert rows[0]["role"] == "lead_coach"


def test_the_main_coach_is_listed_first(client, judo_and_karate, a_person, as_manager):
    """A roster whose first row is not the person running the class is a roster a manager
    has to read twice."""
    assistant = a_person("נועם")
    lead = a_person("רון")
    for person_id, role in ((assistant, "assistant_coach"), (lead, "lead_coach")):
        client.post(
            f"/api/v1/classes/{judo_and_karate['judo']}/staff",
            json={"person_id": str(person_id), "role": role},
            headers=as_manager.headers,
        )
    rows = client.get(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff", headers=as_manager.headers
    ).json()["items"]
    assert rows[0]["person_id"] == str(lead)


def test_a_coach_may_read_a_roster_but_not_change_one(
    client, judo_and_karate, a_person, as_lead_coach, as_manager
):
    """§3.2 — managing staff is a manager's act. Reading who else teaches your class is not
    a financial or personal-data read, and a coach app that could not show it would be worse
    than useless on the mat."""
    person_id = a_person()
    readable = client.get(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff", headers=as_lead_coach.headers
    )
    assert readable.status_code == 200

    refused = client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403


def test_a_class_from_another_studio_is_not_found(client, a_person, as_manager):
    """The tenant filter hides it, so this is 404 rather than 403 — a 403 would confirm
    another club's class is real."""
    response = client.post(
        f"/api/v1/classes/{uuid.uuid4()}/staff",
        json={"person_id": str(a_person()), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assert response.status_code == 404


def test_a_role_that_is_not_a_coach_is_refused(client, judo_and_karate, a_person, as_manager):
    """`manager` is not a mat role. A manager scoped to a class is a role assignment, not a
    row on this roster."""
    response = client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(a_person()), "role": "manager"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


# -- the rule -----------------------------------------------------------------
def test_a_coach_cannot_be_assigned_to_a_group_of_a_class_they_do_not_coach(
    client, app_session, judo_and_karate, a_person, as_manager
):
    """The owner's rule, at the point it bites.

    The message NAMES the class: "this action is not yours" would be true and useless,
    because the manager's next move is to add that coach to that class and they cannot do it
    if the refusal will not say which one.
    """
    outsider = a_person("מיכל")
    client.post(
        f"/api/v1/classes/{judo_and_karate['karate']}/staff",
        json={"person_id": str(outsider), "role": "lead_coach"},
        headers=as_manager.headers,
    )

    refused = client.post(
        f"/api/v1/groups/{judo_and_karate['judo_group']}/staff",
        json={"person_id": str(outsider), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assert refused.status_code == 422, refused.text
    assert "ג'ודו" in refused.text


def test_a_coach_of_the_class_is_assigned_normally(
    client, app_session, judo_and_karate, a_person, as_manager
):
    person_id = a_person()
    client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assigned = client.post(
        f"/api/v1/groups/{judo_and_karate['judo_group']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assert assigned.status_code == 201, assigned.text


def test_a_studio_manager_is_exempt_from_the_rule(
    client, app_session, studio, judo_and_karate, a_person, as_manager
):
    """Owner, 2026-09-09: "Studio managers are allowed."

    They are studio-wide staff by definition, and they are also who does the assigning.
    Scoping them to a class would be the feature refusing the very people it exempts.
    """
    manager_person = a_person("מנהלת")
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=manager_person,
            role="manager",
            scope_type="studio",
            granted_at=date.today(),
        )
    )
    app_session.commit()

    assigned = client.post(
        f"/api/v1/groups/{judo_and_karate['judo_group']}/staff",
        json={"person_id": str(manager_person), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assert assigned.status_code == 201, assigned.text


def test_removing_a_coach_who_still_holds_a_group_of_that_class_is_refused(
    client, app_session, judo_and_karate, a_person, as_manager
):
    """Otherwise the tidy-up creates the very state the rule forbids: a coach on a judo
    group who is not on judo's roster, and no way to tell a bug from an exception."""
    person_id = a_person()
    client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    client.post(
        f"/api/v1/groups/{judo_and_karate['judo_group']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_manager.headers,
    )

    refused = client.delete(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff/{person_id}",
        headers=as_manager.headers,
    )
    assert refused.status_code == 409, refused.text


def test_leaving_a_class_closes_the_row_rather_than_deleting_it(
    client, app_session, studio, judo_and_karate, a_person, as_manager
):
    """Who taught a class last year is history the sessions already point at."""
    person_id = a_person()
    client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person_id), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    client.delete(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff/{person_id}",
        headers=as_manager.headers,
    )
    app_session.expire_all()
    row = app_session.execute(
        select(ClassStaff).where(
            ClassStaff.class_id == judo_and_karate["judo"],
            ClassStaff.person_id == person_id,
        )
    ).scalar_one()
    assert row.to_date is not None


def test_a_coach_on_no_class_is_admitted_by_the_assignment_itself(
    client, app_session, judo_and_karate, a_person, as_manager
):
    """The bootstrap case, and why the rule is not "the roster must already say so".

    A manager putting a NEW coach on a judo group is saying "this person coaches judo".
    Refusing that would leave no way to place a coach for the first time — and would break
    every staff invitation that names a group, which is how coaches actually arrive. The
    guarantee still holds afterwards: anyone on a judo group is on judo's roster, which is
    what every picker, read and removal guard depends on.
    """
    newcomer = a_person("חדש")
    assigned = client.post(
        f"/api/v1/groups/{judo_and_karate['judo_group']}/staff",
        json={"person_id": str(newcomer), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assert assigned.status_code == 201, assigned.text

    roster = client.get(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff", headers=as_manager.headers
    ).json()["items"]
    assert [(row["person_id"], row["role"]) for row in roster] == [
        (str(newcomer), "lead_coach")
    ]
    # And they are NOT silently on the other class.
    karate = client.get(
        f"/api/v1/classes/{judo_and_karate['karate']}/staff", headers=as_manager.headers
    ).json()["items"]
    assert karate == []
