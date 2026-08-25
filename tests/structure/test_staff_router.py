"""M1.10's backend — dashboard artboard 3d (צוות).

3d draws five columns: איש צוות · תפקיד · קבוצות · שעות שבוע · הרשאות · סטטוס, above a
red banner reading *2 שיעורים השבוע ללא מאמן*.

Two of those are honestly out of M1's reach and are reported as such rather than invented:

  שעות שבוע  — weekly load is `group_schedule_rule` × `session`, both W2 contract models.
               The field is `null` here, and the screen says so.
  the banner — 'sessions this week with no coach' needs materialised sessions, so M1
               answers the same question one level up: which GROUPS have no coach at all.
               That is the defect the banner is for, and it is computable today.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.models.person import Invitation, Person, RoleAssignment
from app.models.structure import Group, GroupStaff

STAFF = "/api/v1/staff"

T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


def _add_coach(app_session, studio_id, *, name: str, role: str, group_id=None) -> uuid.UUID:
    person = Person(studio_id=studio_id, first_name=name, last_name="מאמן")
    app_session.add(person)
    app_session.flush()
    app_session.add(
        RoleAssignment(
            studio_id=studio_id,
            person_id=person.id,
            role=role,
            scope_type="studio",
            granted_at=T0,
        )
    )
    if group_id is not None:
        app_session.add(
            GroupStaff(
                studio_id=studio_id,
                group_id=group_id,
                person_id=person.id,
                role=role,
                from_date=T0.date(),
            )
        )
    app_session.commit()
    return person.id


# -- the table ----------------------------------------------------------------
def test_the_caller_is_listed_as_staff(client, as_manager) -> None:
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert any(row["person_id"] == str(as_manager.person_id) for row in body["items"])


def test_a_row_carries_the_roles_the_person_holds(client, as_manager) -> None:
    body = client.get(STAFF, headers=as_manager.headers).json()
    me = next(row for row in body["items"] if row["person_id"] == str(as_manager.person_id))
    assert me["roles"] == ["manager"]
    assert me["status"] == "active"


def test_a_coach_row_carries_the_groups_they_are_assigned_to(
    client, as_manager, app_session, a_group
) -> None:
    _add_coach(app_session, as_manager.studio_id, name="רון", role="lead_coach", group_id=a_group)
    body = client.get(STAFF, headers=as_manager.headers).json()
    coach = next(row for row in body["items"] if row["first_name"] == "רון")
    assert [group["id"] for group in coach["groups"]] == [str(a_group)]


def test_weekly_hours_is_null_and_not_zero(client, as_manager) -> None:
    """Zero is a measurement. Null is 'W2 has not built the thing that measures it', and
    a screen that printed 0 would be reporting an idle coach."""
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert all(row["weekly_hours"] is None for row in body["items"])


def test_permissions_come_from_the_role_and_are_not_stored(client, as_manager) -> None:
    """§3.2's matrix is the source. A per-person permission list would be a second one."""
    body = client.get(STAFF, headers=as_manager.headers).json()
    me = next(row for row in body["items"] if row["person_id"] == str(as_manager.person_id))
    assert "studio_settings" in me["permissions"]
    assert "money" in me["permissions"]


def test_a_coach_never_carries_the_money_permission(client, as_manager, app_session) -> None:
    """§3.2's hard rule — 'coaches never see money'."""
    _add_coach(app_session, as_manager.studio_id, name="דנה", role="assistant_coach")
    body = client.get(STAFF, headers=as_manager.headers).json()
    coach = next(row for row in body["items"] if row["first_name"] == "דנה")
    assert "money" not in coach["permissions"]


def test_a_revoked_role_stops_listing_the_person(client, as_manager, app_session) -> None:
    person_id = _add_coach(app_session, as_manager.studio_id, name="עזב", role="lead_coach")
    assignment = (
        app_session.query(RoleAssignment).filter(RoleAssignment.person_id == person_id).one()
    )
    assignment.revoked_at = T0
    app_session.commit()

    body = client.get(STAFF, headers=as_manager.headers).json()
    assert all(row["person_id"] != str(person_id) for row in body["items"])


# -- pending invitations ------------------------------------------------------
def test_an_unaccepted_coach_invitation_is_a_row_with_status_invited(
    client, as_manager, app_session
) -> None:
    """Artboard 5f says '2 מאמנים הוזמנו — טרם אישרו'. An invitation is not a coach yet,
    and a table that omitted it would make a manager invite the same person twice."""
    app_session.add(
        Invitation(
            studio_id=as_manager.studio_id,
            email="new-coach@example.invalid",
            intended_role="lead_coach",
            token_hash=uuid.uuid4().hex,
            expires_at=T0 + timedelta(days=7),
        )
    )
    app_session.commit()

    body = client.get(STAFF, headers=as_manager.headers).json()
    invited = next(row for row in body["items"] if row["email"] == "new-coach@example.invalid")
    assert invited["status"] == "invited"
    assert invited["person_id"] is None


def test_an_accepted_invitation_is_not_listed_twice(client, as_manager, app_session) -> None:
    app_session.add(
        Invitation(
            studio_id=as_manager.studio_id,
            email="joined@example.invalid",
            intended_role="lead_coach",
            token_hash=uuid.uuid4().hex,
            expires_at=T0 + timedelta(days=7),
            accepted_at=T0,
        )
    )
    app_session.commit()
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert all(row["email"] != "joined@example.invalid" for row in body["items"])


def test_a_guardian_invitation_is_not_staff(client, as_manager, app_session) -> None:
    """§3.1 — guardian is not a role. It has no business on a staff screen."""
    app_session.add(
        Invitation(
            studio_id=as_manager.studio_id,
            email="parent@example.invalid",
            intended_role="guardian",
            token_hash=uuid.uuid4().hex,
            expires_at=T0 + timedelta(days=7),
        )
    )
    app_session.commit()
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert all(row["email"] != "parent@example.invalid" for row in body["items"])


def test_an_expired_invitation_is_not_listed(client, as_manager, app_session) -> None:
    app_session.add(
        Invitation(
            studio_id=as_manager.studio_id,
            email="stale@example.invalid",
            intended_role="lead_coach",
            token_hash=uuid.uuid4().hex,
            expires_at=T0 - timedelta(days=1),
        )
    )
    app_session.commit()
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert all(row["email"] != "stale@example.invalid" for row in body["items"])


# -- 3d's banner --------------------------------------------------------------
def test_a_group_with_no_coach_is_reported(client, as_manager, a_group) -> None:
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert [g["id"] for g in body["groups_without_coach"]] == [str(a_group)]


def test_a_group_with_a_coach_is_not_reported(client, as_manager, app_session, a_group) -> None:
    _add_coach(app_session, as_manager.studio_id, name="רון", role="lead_coach", group_id=a_group)
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert body["groups_without_coach"] == []


def test_a_coach_whose_assignment_ended_leaves_the_group_uncovered(
    client, as_manager, app_session, a_group
) -> None:
    """`to_date` is what ends an assignment. A group whose only coach left in June is
    uncovered in September, and the banner is the only place that surfaces it."""
    _add_coach(app_session, as_manager.studio_id, name="רון", role="lead_coach", group_id=a_group)
    row = app_session.query(GroupStaff).filter(GroupStaff.group_id == a_group).one()
    row.to_date = T0.date()
    app_session.commit()
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert [g["id"] for g in body["groups_without_coach"]] == [str(a_group)]


def test_an_inactive_group_is_not_reported_as_uncovered(
    client, as_manager, app_session, a_class
) -> None:
    group = Group(
        studio_id=as_manager.studio_id, class_id=a_class, name="ארכיון", is_active=False
    )
    app_session.add(group)
    app_session.commit()
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert all(g["id"] != str(group.id) for g in body["groups_without_coach"])


# -- §3.2 ---------------------------------------------------------------------
def test_a_coach_may_not_read_the_staff_screen(client, as_lead_coach) -> None:
    """§3.2 — 'Manage staff and role assignments: owner ✓ manager ✓'."""
    assert client.get(STAFF, headers=as_lead_coach.headers).status_code == 403


def test_an_anonymous_caller_is_401(client) -> None:
    assert client.get(STAFF).status_code == 401


def test_one_studio_never_sees_anothers_staff(client, as_manager, app_session, fake_provider) -> None:
    from app.models.studio import Studio
    from tests.structure.conftest import _make_caller

    other = Studio(name="מועדון רביעי", slug=f"o4-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.commit()
    stranger = _make_caller(client, fake_provider, app_session, other, role="manager")

    body = client.get(STAFF, headers=stranger.headers).json()
    assert all(row["person_id"] != str(as_manager.person_id) for row in body["items"])
