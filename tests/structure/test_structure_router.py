"""SPEC 7's structure endpoints, and 3.2's permission matrix over them.

The permission tests earn their place. 3.2 gives 'Create/edit classes, groups, schedules'
to owner and manager only -- a coach who can create a group can assign themselves to it,
which is a privilege-escalation path no amount of tenancy filtering closes.
"""

from __future__ import annotations


# -- 3.2's matrix -------------------------------------------------------------
def test_a_manager_creates_a_class(client, as_manager):
    response = client.post(
        "/api/v1/classes",
        json={"name": "ג'ודו", "discipline": "judo"},
        headers=as_manager.headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["name"] == "ג'ודו"


def test_an_owner_creates_a_class(client, as_owner):
    response = client.post("/api/v1/classes", json={"name": "קראטה"}, headers=as_owner.headers)
    assert response.status_code == 201


def test_a_coach_cannot_create_a_class(client, as_lead_coach):
    """3.2 -- 'Create/edit classes, groups, schedules: owner ✓ manager ✓' and nothing
    else. A coach who can create a group can assign themselves to it."""
    response = client.post("/api/v1/classes", json={"name": "קראטה"}, headers=as_lead_coach.headers)
    assert response.status_code == 403


def test_a_coach_may_still_read_the_structure(client, as_lead_coach):
    """3.2 -- 'View students in own groups' is a coach capability, and a roster is
    unreadable without the group it belongs to. Refusing reads would break the coach app
    to enforce a rule about writes."""
    assert client.get("/api/v1/classes", headers=as_lead_coach.headers).status_code == 200


def test_a_guardian_cannot_reach_the_structure_api_at_all(client, as_guardian):
    """3.1 -- a guardian holds no role_assignment, and 3.2 gives them nothing here."""
    assert client.get("/api/v1/classes", headers=as_guardian.headers).status_code == 403


def test_an_anonymous_caller_gets_401_not_403(client):
    """Tenancy fails closed before the role check: with no studio resolved there is
    nothing to be forbidden FROM."""
    assert client.get("/api/v1/classes").status_code == 401


# -- tenancy ------------------------------------------------------------------
def test_a_group_cannot_be_hung_off_another_studios_class(
    client, as_manager, other_studio_class_id
):
    """404 rather than 403: the tenant filter makes the class invisible, not merely
    forbidden, and a 403 would confirm it exists."""
    response = client.post(
        "/api/v1/groups",
        json={"class_id": str(other_studio_class_id), "name": "מתחילים"},
        headers=as_manager.headers,
    )
    assert response.status_code == 404


def test_a_class_list_never_shows_another_studios_rows(client, as_manager, other_studio_class_id):
    names = {
        row["name"]
        for row in client.get("/api/v1/classes", headers=as_manager.headers).json()["items"]
    }
    assert "קראטה" not in names


# -- classes and groups -------------------------------------------------------
def test_a_duplicate_class_name_in_one_studio_is_refused(client, as_manager):
    """Two classes called ג'ודו in one club is a data-entry mistake, and the setup wizard
    is exactly where it would be made."""
    body = {"name": "ג'ודו כפול"}
    assert client.post("/api/v1/classes", json=body, headers=as_manager.headers).status_code == 201
    assert client.post("/api/v1/classes", json=body, headers=as_manager.headers).status_code == 409


def test_the_same_group_name_may_exist_under_two_classes(client, as_manager):
    """'מתחילים' under both ג'ודו and קראטה is two real groups. A studio-wide unique
    would forbid the second and the wizard would look broken."""
    judo = client.post(
        "/api/v1/classes", json={"name": "ג'ודו א"}, headers=as_manager.headers
    ).json()
    karate = client.post(
        "/api/v1/classes", json={"name": "קראטה א"}, headers=as_manager.headers
    ).json()
    for parent in (judo, karate):
        response = client.post(
            "/api/v1/groups",
            json={"class_id": parent["id"], "name": "מתחילים"},
            headers=as_manager.headers,
        )
        assert response.status_code == 201, response.text


def test_an_inverted_age_range_is_refused(client, as_manager, a_class):
    response = client.post(
        "/api/v1/groups",
        json={"class_id": str(a_class), "name": "הפוך", "age_min": 12, "age_max": 8},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


# -- coach assignment ---------------------------------------------------------
def test_assigning_a_coach_creates_group_staff_and_a_role_assignment(
    client, as_manager, a_group, a_coach_person, app_session
):
    """5.1's wizard step 5, and why it is one call rather than two.

    A coach with a group_staff row and no role_assignment cannot sign into the staff app
    at all -- 6.1's access query asks for a role assignment, not for group membership. Two
    endpoints would mean a manager who did the first and forgot the second has a coach who
    is on the roster and cannot log in, with nothing anywhere saying why.
    """
    from app.core.tenancy import with_all_tenants
    from app.models.person import RoleAssignment
    from sqlalchemy import select

    response = client.post(
        f"/api/v1/groups/{a_group}/staff",
        json={"person_id": str(a_coach_person), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    assert response.status_code == 201, response.text

    with with_all_tenants(reason="test asserts the role assignment the call also creates"):
        roles = (
            app_session.execute(
                select(RoleAssignment.role).where(
                    RoleAssignment.person_id == a_coach_person,
                    RoleAssignment.revoked_at.is_(None),
                )
            )
            .scalars()
            .all()
        )
    assert list(roles) == ["lead_coach"]


def test_the_role_assignment_is_scoped_to_that_group(
    client, as_manager, a_group, a_coach_person, app_session
):
    """3.1 -- 'lead_coach: A group.' A studio-scoped grant would give a coach of one group
    every group in the club."""
    from app.core.tenancy import with_all_tenants
    from app.models.person import RoleAssignment
    from sqlalchemy import select

    client.post(
        f"/api/v1/groups/{a_group}/staff",
        json={"person_id": str(a_coach_person), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    with with_all_tenants(reason="test asserts the grant's scope"):
        row = app_session.execute(
            select(RoleAssignment).where(RoleAssignment.person_id == a_coach_person)
        ).scalar_one()
    assert row.scope_type == "group"
    assert row.scope_id == a_group


def test_assigning_the_same_coach_twice_is_not_a_second_assignment(
    client, as_manager, a_group, a_coach_person
):
    """A duplicate is what makes 3.2's 'view students in own groups' return the same
    roster twice."""
    body = {"person_id": str(a_coach_person), "role": "lead_coach"}
    assert (
        client.post(
            f"/api/v1/groups/{a_group}/staff", json=body, headers=as_manager.headers
        ).status_code
        == 201
    )
    assert client.post(
        f"/api/v1/groups/{a_group}/staff", json=body, headers=as_manager.headers
    ).status_code in (200, 409)


def test_a_coach_cannot_assign_themselves_to_a_group(client, as_lead_coach, a_group):
    """The escalation path the whole matrix exists to close."""
    response = client.post(
        f"/api/v1/groups/{a_group}/staff",
        json={"person_id": str(as_lead_coach.person_id), "role": "lead_coach"},
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 403


def test_a_manager_is_not_group_staff(client, as_manager, a_group):
    """4.3 -- group_staff role(lead_coach|assistant_coach). A manager already sees every
    student in the studio; a manager row here would be a second, weaker path to it."""
    response = client.post(
        f"/api/v1/groups/{a_group}/staff",
        json={"person_id": str(as_manager.person_id), "role": "manager"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


# -- 8.3 / G16 ----------------------------------------------------------------
def test_every_list_endpoint_is_cursor_paginated(client):
    """G16. Asserted from the schema rather than by seeding a thousand rows."""
    schema = client.app.openapi()
    for path in ("/api/v1/classes", "/api/v1/groups", "/api/v1/locations"):
        params = {p["name"] for p in schema["paths"][path]["get"].get("parameters", [])}
        assert {"cursor", "limit"} <= params, path


def test_no_structure_endpoint_returns_a_money_field(client):
    """Invariant 3's territory. 5.1's wizard has a price step and it is M6's -- a price on
    a group here is how it would leak to a coach."""
    schema = client.app.openapi()
    structure = {
        path: ops
        for path, ops in schema["paths"].items()
        if "/classes" in path or "/groups" in path or "/locations" in path
    }
    assert "agorot" not in str(structure)


# -- F4: PATCH /groups/{id} ---------------------------------------------------
def test_rename_and_retire_a_group_outside_the_rollover(client, as_manager, a_group):
    renamed = client.patch(
        f"/api/v1/groups/{a_group}",
        json={"name": "מתקדמים ב"},
        headers=as_manager.headers,
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "מתקדמים ב"

    retired = client.patch(
        f"/api/v1/groups/{a_group}", json={"is_active": False}, headers=as_manager.headers
    )
    assert retired.status_code == 200
    assert retired.json()["is_active"] is False

    revived = client.patch(
        f"/api/v1/groups/{a_group}", json={"is_active": True}, headers=as_manager.headers
    )
    assert revived.json()["is_active"] is True


def test_renaming_onto_a_sibling_is_refused(client, as_manager, app_session, studio, a_class):
    from app.models.structure import Group

    sibling = Group(studio_id=studio.id, class_id=a_class, name="נבחרת", is_active=True)
    app_session.add(sibling)
    app_session.commit()
    other = Group(studio_id=studio.id, class_id=a_class, name="עתודה", is_active=True)
    app_session.add(other)
    app_session.commit()

    refused = client.patch(
        f"/api/v1/groups/{other.id}", json={"name": "נבחרת"}, headers=as_manager.headers
    )
    assert refused.status_code == 409


def test_group_patch_is_manager_only(client, as_lead_coach, a_group):
    refused = client.patch(
        f"/api/v1/groups/{a_group}", json={"name": "x"}, headers=as_lead_coach.headers
    )
    assert refused.status_code == 403


def test_mine_lists_only_the_groups_the_caller_coaches(
    client, app_session, studio, as_lead_coach, a_group, a_class
):
    """9e's identity block — `הכיתות שלי`. The plain list is the studio's; `mine=true`
    narrows to `group_staff`, so a coach who leads one of two groups gets exactly one."""
    from datetime import date

    from app.models.structure import Group, GroupStaff

    other = Group(studio_id=studio.id, class_id=a_class, name="נבחרת בדיקה")
    app_session.add(other)
    app_session.flush()
    app_session.add(
        GroupStaff(
            studio_id=studio.id,
            group_id=a_group,
            person_id=as_lead_coach.person_id,
            role="lead_coach",
            from_date=date(2026, 9, 1),
        )
    )
    app_session.commit()

    everything = client.get("/api/v1/groups", headers=as_lead_coach.headers).json()["items"]
    assert {row["name"] for row in everything} >= {"נבחרת בדיקה"}

    mine = client.get("/api/v1/groups?mine=true", headers=as_lead_coach.headers).json()["items"]
    assert [row["id"] for row in mine] == [str(a_group)]


# -- editing a class ----------------------------------------------------------
# `ClassUpdate` was written when the model landed and no route ever used it, so a club that
# mistyped a class name during setup had no way to correct it. The dashboard's class card
# now offers an edit popup, and this is the endpoint behind it.
def test_a_manager_renames_a_class(client, as_manager):
    created = client.post(
        "/api/v1/classes", json={"name": "ג'ודו"}, headers=as_manager.headers
    ).json()
    response = client.patch(
        f"/api/v1/classes/{created['id']}",
        json={"name": "ג'ודו אולימפי"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "ג'ודו אולימפי"


def test_an_absent_field_leaves_its_column_alone(client, as_manager):
    """`model_fields_set` decides, like SessionPatch and GroupPatch. A PATCH that names
    only the name must not null the description the club already wrote."""
    created = client.post(
        "/api/v1/classes",
        json={"name": "ג'ודו", "description": "לילדים ונוער", "discipline": "judo"},
        headers=as_manager.headers,
    ).json()
    body = client.patch(
        f"/api/v1/classes/{created['id']}",
        json={"name": "ג'ודו אולימפי"},
        headers=as_manager.headers,
    ).json()
    assert body["description"] == "לילדים ונוער"
    assert body["discipline"] == "judo"


def test_renaming_a_class_onto_a_siblings_name_is_refused(client, as_manager):
    """The same 409 `POST /classes` gives, for the same reason: the partial unique index
    would otherwise raise an IntegrityError that reads as a 500, on a name the manager
    typed."""
    first = client.post(
        "/api/v1/classes", json={"name": "ג'ודו"}, headers=as_manager.headers
    ).json()
    client.post("/api/v1/classes", json={"name": "קראטה"}, headers=as_manager.headers)
    response = client.patch(
        f"/api/v1/classes/{first['id']}", json={"name": "קראטה"}, headers=as_manager.headers
    )
    assert response.status_code == 409


def test_renaming_a_class_to_its_own_name_is_allowed(client, as_manager):
    """A form that submits every field must not refuse because the name did not change."""
    created = client.post(
        "/api/v1/classes", json={"name": "ג'ודו"}, headers=as_manager.headers
    ).json()
    response = client.patch(
        f"/api/v1/classes/{created['id']}",
        json={"name": "ג'ודו", "description": "עודכן"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["description"] == "עודכן"


def test_a_class_can_be_retired_and_revived(client, as_manager):
    created = client.post(
        "/api/v1/classes", json={"name": "ג'ודו"}, headers=as_manager.headers
    ).json()
    retired = client.patch(
        f"/api/v1/classes/{created['id']}", json={"is_active": False}, headers=as_manager.headers
    )
    assert retired.json()["is_active"] is False
    revived = client.patch(
        f"/api/v1/classes/{created['id']}", json={"is_active": True}, headers=as_manager.headers
    )
    assert revived.json()["is_active"] is True


def test_a_coach_cannot_edit_a_class(client, as_manager, as_lead_coach):
    """3.2 -- 'Create/edit classes, groups, schedules: owner, manager' and nothing else."""
    created = client.post(
        "/api/v1/classes", json={"name": "ג'ודו"}, headers=as_manager.headers
    ).json()
    response = client.patch(
        f"/api/v1/classes/{created['id']}", json={"name": "אחר"}, headers=as_lead_coach.headers
    )
    assert response.status_code == 403


def test_editing_a_class_that_does_not_exist_is_a_404(client, as_manager):
    response = client.patch(
        "/api/v1/classes/00000000-0000-0000-0000-000000000000",
        json={"name": "אחר"},
        headers=as_manager.headers,
    )
    assert response.status_code == 404


# -- taking a coach OFF a group (owner report, 2026-09-10) ---------------------------
#
# `POST /groups/{id}/staff` shipped in M1.4 and nothing ever removed the row. Classes have
# had `DELETE /classes/{id}/staff/{person_id}` since the class-manager work; groups had no
# counterpart at all, so a coach assigned to the wrong group stayed on it, and the staff
# screen's "ללא קבוצה" could be fixed in exactly one direction.


def test_removing_a_coach_closes_the_row_and_revokes_the_group_grant(
    client, as_manager, a_group, a_coach_person, app_session
):
    from app.core.tenancy import with_all_tenants
    from app.models.person import RoleAssignment
    from app.models.structure import GroupStaff
    from sqlalchemy import select

    client.post(
        f"/api/v1/groups/{a_group}/staff",
        json={"person_id": str(a_coach_person), "role": "lead_coach"},
        headers=as_manager.headers,
    )
    removed = client.delete(
        f"/api/v1/groups/{a_group}/staff/{a_coach_person}", headers=as_manager.headers
    )
    assert removed.status_code == 204, removed.text

    with with_all_tenants(reason="test asserts the row is closed, not deleted"):
        # Closed, never deleted: who coached a group last season is history the sessions
        # already point at. Same rule the class-level removal follows.
        row = app_session.execute(
            select(GroupStaff).where(
                GroupStaff.group_id == a_group, GroupStaff.person_id == a_coach_person
            )
        ).scalar_one()
        assert row.to_date is not None
        # The grant goes with it, or the coach keeps read access to a roster they are no
        # longer on — which is the whole reason assigning is one call and not two.
        live = app_session.execute(
            select(RoleAssignment.id).where(
                RoleAssignment.person_id == a_coach_person,
                RoleAssignment.scope_type == "group",
                RoleAssignment.scope_id == a_group,
                RoleAssignment.revoked_at.is_(None),
            )
        ).first()
        assert live is None


def test_removing_a_coach_who_is_not_on_the_group_is_404(
    client, as_manager, a_group, a_coach_person
):
    missing = client.delete(
        f"/api/v1/groups/{a_group}/staff/{a_coach_person}", headers=as_manager.headers
    )
    assert missing.status_code == 404


def test_removing_a_coach_is_manager_only(client, as_lead_coach, a_group, a_coach_person):
    refused = client.delete(
        f"/api/v1/groups/{a_group}/staff/{a_coach_person}", headers=as_lead_coach.headers
    )
    assert refused.status_code == 403
