"""A manager scoped to ONE class, and the reason it has to fail closed.

Owner, 2026-09-09, asked for a manager who runs one class rather than the whole studio, and
for it to be built alongside the coach roster.

**The dangerous half is the token, not the table.** `role_assignment.scope_type` has
permitted `'class'` since the first migration and nothing had ever written it -- but the
JWT's `roles` claim was built with a bare `DISTINCT role` over every live assignment,
scope thrown away. So the moment anything wrote `role='manager', scope_type='class'`, that
person's token would have said `manager` and every `ManagerOrOwner` route in the product
would have let them through, for the whole studio. Granting one class would have granted
all of them.

So the projection now takes only STUDIO-scoped rows into `roles`, and a class-scoped
manager travels separately in `managed_class_ids`. The consequence is the safe one and is
deliberate: a class manager is refused by every manager route that has not been taught
about them, rather than admitted by every route that has not been taught to check.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.person import Person, RoleAssignment
from app.models.structure import Class as StudioClass
from app.models.structure import Group
from tests.structure.conftest import T0, Caller, _make_caller


@pytest.fixture
def judo_and_karate(app_session, studio):
    judo = StudioClass(studio_id=studio.id, name="ג'ודו", discipline="judo")
    karate = StudioClass(studio_id=studio.id, name="קראטה", discipline="karate")
    app_session.add_all([judo, karate])
    app_session.flush()
    judo_group = Group(studio_id=studio.id, class_id=judo.id, name="ג'ודו א")
    app_session.add(judo_group)
    app_session.commit()
    return {"judo": judo.id, "karate": karate.id, "judo_group": judo_group.id}


@pytest.fixture
def as_class_manager(client, fake_provider, app_session, studio, judo_and_karate):
    """A manager OF JUDO. Built by hand because no factory should make one by accident."""
    caller = _make_caller(client, fake_provider, app_session, studio, role=None)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=caller.person_id,
            role="manager",
            scope_type="class",
            scope_id=judo_and_karate["judo"],
            granted_at=T0,
        )
    )
    app_session.commit()
    rotated = client.post("/api/v1/auth/refresh")
    assert rotated.status_code == 200, rotated.text
    return Caller(
        token=rotated.json()["access_token"],
        studio_id=studio.id,
        person_id=caller.person_id,
    )


def test_a_class_manager_is_not_a_studio_manager(client, as_class_manager):
    """THE assertion this whole file exists for.

    Before the projection was scoped, this person's token said `manager` and every
    manager-only route in the product opened. Granting one class granted all of them, and
    nothing on any screen would have shown it.
    """
    refused = client.get("/api/v1/staff", headers=as_class_manager.headers)
    assert refused.status_code == 403, refused.text


def _membership(client, caller) -> dict:
    """This studio's membership off `/auth/me`. Roles live per membership, not at the top
    level -- one identity can belong to several studios with different roles in each."""
    body = client.get("/api/v1/auth/me", headers=caller.headers).json()
    return next(m for m in body["studios"] if m["studio_id"] == str(caller.studio_id))


def test_their_membership_does_not_carry_the_manager_role(client, as_class_manager):
    """Asserted on the CLAIM and not only on one route's answer: `require_roles` reads this
    tuple, so a route added tomorrow inherits the refusal without anyone remembering to."""
    assert "manager" not in _membership(client, as_class_manager)["roles"]


def test_the_classes_they_manage_travel_separately(client, as_class_manager, judo_and_karate):
    """The grant is not lost, only kept out of `roles`. Without this the feature would be a
    role nobody can ever act on."""
    assert _membership(client, as_class_manager)["managed_class_ids"] == [
        str(judo_and_karate["judo"])
    ]


def test_a_studio_manager_manages_no_class_in_particular(client, as_manager):
    """An empty list, not every class. A studio manager's authority comes from `roles`, and
    duplicating it here would give two answers to one question -- which is how the two
    start disagreeing."""
    membership = _membership(client, as_manager)
    assert membership["managed_class_ids"] == []
    assert "manager" in membership["roles"]


def test_a_class_manager_may_read_their_own_class_roster(client, as_class_manager, judo_and_karate):
    """What the grant is FOR. The roster read is `AnyStaff`, and a class manager is staff."""
    response = client.get(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff", headers=as_class_manager.headers
    )
    assert response.status_code == 200, response.text


def test_a_class_manager_staffs_their_own_class_but_not_another(
    client, app_session, studio, as_class_manager, judo_and_karate
):
    """The line the role draws. Judo is theirs; karate is not, and the refusal must not
    depend on a screen choosing to hide the button."""
    person = Person(studio_id=studio.id, first_name="מאמן", last_name=uuid.uuid4().hex[:6])
    app_session.add(person)
    app_session.commit()

    allowed = client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(person.id), "role": "lead_coach"},
        headers=as_class_manager.headers,
    )
    assert allowed.status_code == 201, allowed.text

    refused = client.post(
        f"/api/v1/classes/{judo_and_karate['karate']}/staff",
        json={"person_id": str(person.id), "role": "lead_coach"},
        headers=as_class_manager.headers,
    )
    assert refused.status_code == 403, refused.text


def test_a_plain_coach_manages_nothing(client, as_lead_coach, judo_and_karate):
    """A coach holds group-scoped rows. None of them is a management grant, and the claim
    must not turn one into one."""
    assert _membership(client, as_lead_coach)["managed_class_ids"] == []
    refused = client.post(
        f"/api/v1/classes/{judo_and_karate['judo']}/staff",
        json={"person_id": str(uuid.uuid4()), "role": "lead_coach"},
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403


# -- inviting one -------------------------------------------------------------
def test_a_manager_invites_a_manager_for_one_class(
    client, app_session, studio, judo_and_karate, as_manager
):
    """How a class manager actually arrives. The grant is written NOW, against the Person
    the invitation creates, so it is real before anybody signs in (§5.3)."""
    from app.models.person import RoleAssignment as RA
    from sqlalchemy import select as sa_select

    # A unique address per run. The test database is NOT reset between pytest invocations,
    # so a fixed one matches the rows every previous run of this test left behind — which
    # is a failure that appears only on the second run and looks like pollution from
    # somebody else's test.
    email = f"judo-manager-{uuid.uuid4().hex[:8]}@example.invalid"
    response = client.post(
        "/api/v1/staff/invitations",
        json={
            "email": email,
            "roles": ["manager"],
            "first_name": "מנהל",
            "last_name": "ג'ודו",
            "class_ids": [str(judo_and_karate["judo"])],
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 201, response.text

    rows = app_session.execute(
        sa_select(RA.role, RA.scope_type, RA.scope_id)
        .join(Person, Person.id == RA.person_id)
        .where(Person.email == email, RA.revoked_at.is_(None))
    ).all()
    # Class-scoped and NOTHING studio-scoped: a studio row beside it would hand back the
    # club-wide authority the scoping exists to withhold.
    assert rows == [("manager", "class", judo_and_karate["judo"])]


def test_a_class_scoped_invitation_may_only_be_a_manager(client, judo_and_karate, as_manager):
    """A coach's scope is the roster `group_ids` puts them on. Letting a coach be
    class-scoped too would be a second, competing way to say the same thing — and the two
    would drift."""
    response = client.post(
        "/api/v1/staff/invitations",
        json={
            "email": f"coach-{uuid.uuid4().hex[:8]}@example.invalid",
            "roles": ["lead_coach"],
            "class_ids": [str(judo_and_karate["judo"])],
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 422, response.text


def test_an_invitation_with_no_classes_is_still_a_studio_manager(
    client, app_session, studio, as_manager
):
    """The existing shape must be untouched: every manager invited before today, and every
    one invited without naming a class, stays studio-wide."""
    from app.models.person import RoleAssignment as RA
    from sqlalchemy import select as sa_select

    email = f"studio-manager-{uuid.uuid4().hex[:8]}@example.invalid"
    response = client.post(
        "/api/v1/staff/invitations",
        json={"email": email, "roles": ["manager"]},
        headers=as_manager.headers,
    )
    assert response.status_code == 201, response.text
    rows = (
        app_session.execute(
            sa_select(RA.scope_type)
            .join(Person, Person.id == RA.person_id)
            .where(Person.email == email, RA.revoked_at.is_(None))
        )
        .scalars()
        .all()
    )
    assert rows == ["studio"]
