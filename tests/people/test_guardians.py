"""§5.3's guardians. Three rules, and the third is the one that erodes.

  1. Any number of guardians, no household entity (L9).
  2. Never duplicated -- a matched Person is linked, not recreated (L7).
  3. `is_primary` decides bill addressing and הוראת קבע matching, and NOTHING else (L8).

The third is asserted twice: once in the schema (no permission field exists to branch on)
and once at the wire (both guardians receive identically-shaped payloads).
"""

from __future__ import annotations

import uuid

import pytest
from app.models.person import Guardian, Invitation, Person
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.students import StudentService
from sqlalchemy import select
from tests.people.conftest import T0


def _student(session):
    tag = uuid.uuid4().hex[:8]
    return StudentService.create(
        session,
        first_name=f"דנה{tag}",
        last_name=f"כהן{tag}",
        birthdate=None,
        guardian_first_name=f"יעל{tag}",
        guardian_last_name=f"כהן{tag}",
        guardian_email=f"yael-{tag}@example.invalid",
        guardian_phone=None,
        at=T0,
        actor_person_id=None,
    ).student


@pytest.fixture
def a_student(tenant_session):
    student = _student(tenant_session)
    tenant_session.commit()
    return student


def _add(session, student_id, **kwargs):
    tag = uuid.uuid4().hex[:8]
    defaults = dict(
        first_name=f"דוד{tag}",
        last_name=f"כהן{tag}",
        email=f"david-{tag}@example.invalid",
        phone=None,
        relation="parent",
        is_primary=False,
        at=T0,
        actor_person_id=None,
    )
    defaults.update(kwargs)
    return StudentService.add_guardian(session, student_id=student_id, **defaults)


def _guardians(session, student_id):
    return list(
        session.execute(select(Guardian).where(Guardian.student_id == student_id)).scalars()
    )


# -- any number, never duplicated ----------------------------------------------


def test_a_second_guardian_is_a_second_row_and_not_a_household(tenant_session, a_student):
    """§5.3 -- 'Two parents on the same child are simply two guardian rows.' L9 -- there is
    no household entity, and nothing here creates one."""
    _add(tenant_session, a_student.id)
    tenant_session.commit()

    rows = _guardians(tenant_session, a_student.id)
    assert len(rows) == 2
    assert sum(1 for r in rows if r.is_primary) == 1


def test_linking_an_already_linked_person_twice_is_a_conflict(
    tenant_session, app_session, as_guardian, a_student
):
    """UNIQUE(student_id, person_id). A duplicate guardian is how a bill gets addressed
    twice and a הוראת קבע matches two rows.

    The duplicate can only arise through a real match, so the second guardian here is the
    signed-in fixture: L7 makes a verified address the only key, and the first `add` links
    that Person rather than creating one. Adding the same address again finds the same
    Person and must be refused.
    """
    parent = app_session.get(Person, as_guardian.person_id)
    _add(tenant_session, a_student.id, email=parent.email)
    tenant_session.commit()

    with pytest.raises(ConflictError):
        _add(tenant_session, a_student.id, email=parent.email)


def test_an_unverified_address_is_not_a_match_and_makes_a_second_person(
    tenant_session, a_student
):
    """The other side of L7, and the reason the test above needs a signed-in guardian: the
    Person created alongside a student has no login, so its email is a manager's typing and
    never a key. Re-entering it is a genuinely new guardian, not a duplicate.
    """
    existing = _guardians(tenant_session, a_student.id)[0]
    person = tenant_session.get(Person, existing.person_id)

    row = _add(tenant_session, a_student.id, email=person.email)
    tenant_session.commit()
    assert row.person_id != existing.person_id


def test_a_guardian_with_a_verified_address_is_linked_not_recreated(
    tenant_session, app_session, as_guardian, a_student
):
    """L7 and §5.4a -- 'A matched parent is never duplicated.' No second Person, and no
    second invitation: they already have a login."""
    parent = app_session.get(Person, as_guardian.person_id)

    row = _add(tenant_session, a_student.id, email=parent.email)
    tenant_session.commit()

    assert row.person_id == as_guardian.person_id
    assert (
        tenant_session.execute(
            select(Invitation).where(
                Invitation.student_id == a_student.id, Invitation.email == parent.email
            )
        ).first()
        is None
    )


def test_a_new_guardian_is_invited(tenant_session, a_student):
    """§5.3 -- 'Guardians are invited by email or phone; the invitation carries a token
    binding the accepting auth identity to the pre-created Person.'"""
    row = _add(tenant_session, a_student.id, email="brand-new@example.invalid")
    tenant_session.commit()

    invitation = tenant_session.execute(
        select(Invitation).where(
            Invitation.student_id == a_student.id,
            Invitation.email == "brand-new@example.invalid",
        )
    ).scalar_one()
    assert invitation.intended_role == "guardian"
    assert row.person_id is not None


# -- exactly one primary -------------------------------------------------------


def test_setting_a_new_primary_clears_the_old_one_in_the_same_breath(tenant_session, a_student):
    """§5.3 -- 'Exactly one guardian per student carries is_primary.' A partial unique index
    enforces it, so a set that did not clear the old one would raise an IntegrityError
    instead of doing the job."""
    added = _add(tenant_session, a_student.id)
    tenant_session.commit()

    StudentService.set_primary_guardian(
        tenant_session,
        student_id=a_student.id,
        person_id=added.person_id,
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    rows = _guardians(tenant_session, a_student.id)
    assert [r.person_id for r in rows if r.is_primary] == [added.person_id]


def test_adding_a_guardian_as_primary_demotes_the_incumbent(tenant_session, a_student):
    added = _add(tenant_session, a_student.id, is_primary=True)
    tenant_session.commit()

    rows = _guardians(tenant_session, a_student.id)
    assert [r.person_id for r in rows if r.is_primary] == [added.person_id]


def test_setting_a_primary_who_is_not_a_guardian_is_not_found(tenant_session, a_student):
    with pytest.raises(NotFoundError):
        StudentService.set_primary_guardian(
            tenant_session,
            student_id=a_student.id,
            person_id=uuid.uuid4(),
            at=T0,
            actor_person_id=None,
        )


# -- removal -------------------------------------------------------------------


def test_removing_the_last_guardian_is_refused(tenant_session, a_student):
    """A child with no guardian is a child nobody can be contacted about, and §5.3 makes at
    least one structural. The schema cannot express it, so the service does."""
    existing = _guardians(tenant_session, a_student.id)[0]
    with pytest.raises(RefusedError):
        StudentService.remove_guardian(
            tenant_session,
            student_id=a_student.id,
            person_id=existing.person_id,
            at=T0,
            actor_person_id=None,
        )


def test_removing_the_primary_promotes_someone_else(tenant_session, a_student):
    """Leaving a student with two guardians and no primary would leave the bill addressed
    to nobody, and §5.10 has nowhere to send it."""
    existing = _guardians(tenant_session, a_student.id)[0]
    _add(tenant_session, a_student.id)
    tenant_session.commit()

    StudentService.remove_guardian(
        tenant_session,
        student_id=a_student.id,
        person_id=existing.person_id,
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    remaining = _guardians(tenant_session, a_student.id)
    assert len(remaining) == 1
    assert remaining[0].is_primary is True


def test_removing_a_non_primary_leaves_the_primary_alone(tenant_session, a_student):
    primary = _guardians(tenant_session, a_student.id)[0]
    added = _add(tenant_session, a_student.id)
    tenant_session.commit()

    StudentService.remove_guardian(
        tenant_session,
        student_id=a_student.id,
        person_id=added.person_id,
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    remaining = _guardians(tenant_session, a_student.id)
    assert [r.person_id for r in remaining] == [primary.person_id]
    assert remaining[0].is_primary is True


# -- L8: all guardians are equal -----------------------------------------------


def test_guardian_out_carries_no_permission_field():
    """L8, enforced in the shape. A `can_edit` or `is_readonly` here would invite a client
    to branch on something the server does not branch on."""
    from app.schemas.people import GuardianOut

    forbidden = {"can_edit", "is_readonly", "permissions", "role", "can_pay", "can_view"}
    assert forbidden.isdisjoint(GuardianOut.model_fields)


def test_is_primary_is_confined_to_the_guardian_management_methods():
    """L8 mechanically. `is_primary` may be written by the methods that maintain "exactly
    one primary", and it may be ordered by. What it must never do is appear in a read path
    or an authorization decision -- a `if guardian.is_primary:` guarding a capability is
    the shape of the bug this test exists to catch, and §5.3 is explicit that there is no
    such capability.
    """
    import ast
    from pathlib import Path

    source = (Path(__file__).resolve().parents[2] / "app/services/people/students.py").read_text(
        encoding="utf-8"
    )
    allowed = {"create", "add_guardian", "set_primary_guardian", "remove_guardian",
               "list_guardians", "_project"}
    offenders = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.FunctionDef) or node.name in allowed:
            continue
        # Drop the docstring before dumping. `for_guardian`'s says "no `is_primary` branch
        # anywhere in here" -- an accurate description of code, which a text match reads as
        # code. tests/restrictions/test_19_7 learned the same lesson the same way: a gate
        # that fires on accurate documentation gets vaguer documentation, not safer code.
        body = node.body[1:] if ast.get_docstring(node) else node.body
        if any("is_primary" in ast.dump(stmt) for stmt in body):
            offenders.append(node.name)
    assert offenders == [], (
        f"is_primary reached {offenders}. §5.3: it decides bill addressing and הוראת קבע "
        "matching and nothing else -- every guardian sees and does the same things."
    )


def test_both_guardians_receive_the_identically_shaped_payload(client, as_manager):
    """L8 at the wire. §5.3: 'One guardian view, no permission branching.'"""
    tag = uuid.uuid4().hex[:8]
    created = client.post(
        "/api/v1/students",
        json={
            "first_name": f"דנה{tag}",
            "last_name": f"כהן{tag}",
            "guardian": {
                "first_name": f"יעל{tag}",
                "last_name": f"כהן{tag}",
                "email": f"y-{tag}@example.invalid",
            },
        },
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text
    student_id = created.json()["student"]["id"]

    added = client.post(
        f"/api/v1/students/{student_id}/guardians",
        json={
            "first_name": f"דוד{tag}",
            "last_name": f"כהן{tag}",
            "email": f"d-{tag}@example.invalid",
            "relation": "parent",
            "is_primary": False,
        },
        headers=as_manager.headers,
    )
    assert added.status_code == 201, added.text

    body = client.get(f"/api/v1/students/{student_id}", headers=as_manager.headers).json()
    primary = next(g for g in body["guardians"] if g["is_primary"])
    secondary = next(g for g in body["guardians"] if not g["is_primary"])
    assert set(primary) == set(secondary)


# -- the routes ----------------------------------------------------------------


def _api_student(client, caller) -> str:
    tag = uuid.uuid4().hex[:8]
    response = client.post(
        "/api/v1/students",
        json={
            "first_name": f"דנה{tag}",
            "last_name": f"כהן{tag}",
            "guardian": {
                "first_name": f"יעל{tag}",
                "last_name": f"כהן{tag}",
                "email": f"y-{tag}@example.invalid",
            },
        },
        headers=caller.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["student"]["id"]


def test_listing_guardians_is_coach_reachable(client, as_manager):
    """Staff `9c`'s student card shows contact details -- §3.2 gives a coach 'View students
    in own groups', and a card without a way to reach the parent is not a card."""
    from app.main import app

    tags = app.openapi()["paths"]["/api/v1/students/{student_id}/guardians"]["get"]["tags"]
    assert "coach" in tags

    student = _api_student(client, as_manager)
    listed = client.get(f"/api/v1/students/{student}/guardians", headers=as_manager.headers)
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1


def test_writing_guardians_is_manager_only(client, as_manager, as_lead_coach):
    student = _api_student(client, as_manager)
    tag = uuid.uuid4().hex[:8]
    refused = client.post(
        f"/api/v1/students/{student}/guardians",
        json={
            "first_name": "דוד",
            "last_name": "כהן",
            "email": f"x-{tag}@example.invalid",
        },
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403


def test_removing_the_last_guardian_through_the_api_is_422(client, as_manager):
    student = _api_student(client, as_manager)
    listed = client.get(f"/api/v1/students/{student}/guardians", headers=as_manager.headers).json()
    person_id = listed["items"][0]["person_id"]

    response = client.delete(
        f"/api/v1/students/{student}/guardians/{person_id}", headers=as_manager.headers
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "refused"


def test_a_guardian_with_neither_email_nor_phone_is_rejected_by_the_schema(client, as_manager):
    """§5.3 -- guardians are invited by email or phone. One of the two is how the
    invitation reaches them, so a guardian with neither cannot be invited at all."""
    student = _api_student(client, as_manager)
    response = client.post(
        f"/api/v1/students/{student}/guardians",
        json={"first_name": "דוד", "last_name": "כהן"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422
