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
from sqlalchemy import select

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


def test_weekly_hours_is_zero_when_no_sessions_are_staffed(client, as_manager) -> None:
    """F8 flipped this column from null to measured: sessions exist now, so 0 IS the
    measurement for a person staffing nothing this week. A pending invitation still
    carries null — it staffs nothing by definition."""
    body = client.get(STAFF, headers=as_manager.headers).json()
    assert all(row["weekly_hours"] == 0.0 for row in body["items"] if row["person_id"] is not None)


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


def test_an_invited_coach_row_carries_the_pre_created_person_and_name(client, as_manager) -> None:
    """F5 pre-creates the Person at invite time, so the pending row can name them. Without
    this, every screen resolving names through GET /staff renders the invited coach's raw
    person UUID — which is what the group page did (2026-08-30)."""
    email = f"named-coach-{uuid.uuid4().hex[:8]}@example.invalid"
    created = client.post(
        f"{STAFF}/invitations",
        json={"email": email, "roles": ["lead_coach"], "first_name": "לביא", "last_name": "טמיר"},
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text

    row = next(
        r
        for r in client.get(STAFF, headers=as_manager.headers).json()["items"]
        if r["email"] == email
    )
    assert row["status"] == "invited"
    assert row["person_id"] is not None
    assert row["first_name"] == "לביא"
    assert row["last_name"] == "טמיר"


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
    group = Group(studio_id=as_manager.studio_id, class_id=a_class, name="ארכיון", is_active=False)
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


def test_one_studio_never_sees_anothers_staff(
    client, as_manager, app_session, fake_provider
) -> None:
    from app.models.studio import Studio
    from tests.structure.conftest import _make_caller

    other = Studio(name="מועדון רביעי", slug=f"o4-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.commit()
    stranger = _make_caller(client, fake_provider, app_session, other, role="manager")

    body = client.get(STAFF, headers=stranger.headers).json()
    assert all(row["person_id"] != str(as_manager.person_id) for row in body["items"])


# -- F5: the lifecycle --------------------------------------------------------
def test_invite_resend_revoke_round_trip(client, as_manager) -> None:
    created = client.post(
        f"{STAFF}/invitations",
        json={"email": "coach@example.invalid", "roles": ["lead_coach"], "first_name": "רון"},
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["token"]

    listed = client.get(STAFF, headers=as_manager.headers).json()
    row = next(r for r in listed["items"] if r["email"] == "coach@example.invalid")
    assert row["status"] == "invited"
    assert row["invitation_id"] == body["id"]

    resent = client.post(
        f"{STAFF}/invitations/{body['id']}/resend", headers=as_manager.headers
    ).json()
    # A new token every time — the old hash dies with it.
    assert resent["token"] != body["token"]

    revoked = client.delete(f"{STAFF}/invitations/{body['id']}", headers=as_manager.headers)
    assert revoked.status_code == 204
    after = client.get(STAFF, headers=as_manager.headers).json()
    assert all(r["email"] != "coach@example.invalid" for r in after["items"])


def test_an_invitation_puts_the_coach_on_the_groups_it_names(
    client, as_manager, app_session, a_class
) -> None:
    """The wizard's step 5 always asked which group the coach joins, and the answer had
    nowhere to go — `StaffInvitationIn` had no group field, so every choice was dropped
    silently (2026-08-29). The assignment is possible before acceptance because
    `invite_staff` creates the Person now; only the login binding waits.
    """
    groups = [Group(studio_id=as_manager.studio_id, class_id=a_class, name=n) for n in ("א", "ב")]
    app_session.add_all(groups)
    app_session.commit()
    ids = [str(g.id) for g in groups]
    # Unique per run: this database is not dropped between runs, and a fixed address makes
    # the second run of this test find two people.
    email = f"coach-{uuid.uuid4().hex[:8]}@example.invalid"

    created = client.post(
        f"{STAFF}/invitations",
        json={"email": email, "roles": ["lead_coach"], "group_ids": ids},
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text

    person = app_session.execute(select(Person).where(Person.email == email)).scalar_one()
    on = app_session.execute(
        select(GroupStaff.group_id).where(
            GroupStaff.person_id == person.id, GroupStaff.to_date.is_(None)
        )
    ).scalars()
    assert sorted(str(g) for g in on) == sorted(ids)


def test_an_invitation_naming_an_unknown_group_creates_nothing(client, as_manager) -> None:
    """Refusing whole is the point: a coach invited to groups they were never put on is
    worse than a rejected invitation, because nothing anywhere says the roster is wrong."""
    stranger = str(uuid.uuid4())
    email = f"ghost-{uuid.uuid4().hex[:8]}@example.invalid"
    refused = client.post(
        f"{STAFF}/invitations",
        json={"email": email, "roles": ["lead_coach"], "group_ids": [stranger]},
        headers=as_manager.headers,
    )
    assert refused.status_code == 422
    assert refused.json()["detail"]["code"] == "bad_groups"
    listed = client.get(STAFF, headers=as_manager.headers).json()
    assert all(row["email"] != email for row in listed["items"])


def test_an_invitation_without_groups_still_works(client, as_manager) -> None:
    """§3.3 — a coach may exist before any group does."""
    created = client.post(
        f"{STAFF}/invitations",
        json={
            "email": f"solo-{uuid.uuid4().hex[:8]}@example.invalid",
            "roles": ["assistant_coach"],
        },
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text


def test_accepting_a_staff_invitation_makes_the_person_staff(
    client, fake_provider, as_manager, app_session
) -> None:
    """The §5.3 binding, end to end: sign in as a stranger, accept with the token, and
    the pre-created role assignments are theirs."""
    from tests.conftest import sign_in

    created = client.post(
        f"{STAFF}/invitations",
        json={"email": "newcoach@example.invalid", "roles": ["assistant_coach"]},
        headers=as_manager.headers,
    ).json()

    subject = f"newcoach-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email="newcoach@example.invalid")
    signed = sign_in(client, code=code, app_name="staff")
    token = signed.json()["access_token"]
    accepted = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": created["token"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert accepted.status_code == 200, accepted.text

    listed = client.get(STAFF, headers=as_manager.headers).json()
    row = next(r for r in listed["items"] if r["email"] == "newcoach@example.invalid")
    assert row["status"] == "active"
    assert row["roles"] == ["assistant_coach"]


def test_role_change_reconciles_grants_and_revocations(client, as_manager, app_session, studio):
    person_id = _add_coach(app_session, studio.id, name="חילופי", role="assistant_coach")
    changed = client.patch(
        f"{STAFF}/{person_id}",
        json={"roles": ["lead_coach"]},
        headers=as_manager.headers,
    )
    assert changed.status_code == 204, changed.text
    listed = client.get(STAFF, headers=as_manager.headers).json()
    row = next(r for r in listed["items"] if r["person_id"] == str(person_id))
    assert row["roles"] == ["lead_coach"]


def test_deactivate_revokes_and_closes_group_assignments(
    client, as_manager, app_session, studio, a_group
):
    lead = _add_coach(app_session, studio.id, name="ראשי", role="lead_coach", group_id=a_group)
    backup = _add_coach(app_session, studio.id, name="גיבוי", role="lead_coach", group_id=a_group)

    gone = client.post(f"{STAFF}/{lead}/deactivate", headers=as_manager.headers)
    assert gone.status_code == 204, gone.text
    listed = client.get(STAFF, headers=as_manager.headers).json()
    assert all(r["person_id"] != str(lead) for r in listed["items"])
    assert any(r["person_id"] == str(backup) for r in listed["items"])


def test_deactivating_a_groups_only_lead_coach_is_refused(
    client, as_manager, app_session, studio, a_group
):
    """F5's deferred decision, decided as REFUSE: forcing a reassignment inside the
    deactivate call would bury a scheduling decision inside an HR action."""
    lead = _add_coach(app_session, studio.id, name="יחיד", role="lead_coach", group_id=a_group)
    refused = client.post(f"{STAFF}/{lead}/deactivate", headers=as_manager.headers)
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "sole_lead_coach"


def test_the_owner_cannot_be_deactivated(client, as_owner, as_manager) -> None:
    refused = client.post(f"{STAFF}/{as_owner.person_id}/deactivate", headers=as_manager.headers)
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "owner_immovable"


def test_granting_owner_through_a_role_edit_is_refused(client, as_manager, app_session, studio):
    person_id = _add_coach(app_session, studio.id, name="שאפתן", role="lead_coach")
    refused = client.patch(
        f"{STAFF}/{person_id}",
        json={"roles": ["owner"]},
        headers=as_manager.headers,
    )
    assert refused.status_code == 422


def test_the_lifecycle_is_manager_only(client, as_lead_coach) -> None:
    refused = client.post(
        f"{STAFF}/invitations",
        json={"email": "x@example.invalid", "roles": ["lead_coach"]},
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403
