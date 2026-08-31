"""F5 end to end: a manager invites a coach, and the coach can USE the staff app.

`test_accepting_a_staff_invitation_makes_the_person_staff` already proves the §5.3
binding, but it proves it by reading the MANAGER's staff table. That is the inviter's
view of the invitation, not the invited coach's view of the product — every assertion in
it would still pass if the coach's own session were scoped to nothing and every screen
they opened answered 401.

So this file asserts the coach's side, and asserts it AFTER a refresh. `accept-invitation`
mints a session naming the invited studio and also writes that studio to the refresh row
(0fbb313). Only the second of those survives the next rotation, and a session with no
active studio 401s on every tenant-scoped route -- the staff app renders empty with
nothing on screen to explain it. The rotation is therefore part of the journey, not a
detail of it: fifteen minutes after accepting, the rotated token is the only one the app
still holds.
"""

from __future__ import annotations

import uuid

from app.models.structure import GroupStaff
from sqlalchemy import select
from tests.conftest import sign_in

STAFF = "/api/v1/staff"


def _invite(client, as_manager, *, email: str, roles: list[str], group_ids=()) -> str:
    """The manager's half of F5. Returns the plaintext token, which is returned once."""
    created = client.post(
        f"{STAFF}/invitations",
        json={
            "email": email,
            "roles": roles,
            "first_name": "לירון",
            "last_name": "מאמנת",
            "group_ids": [str(g) for g in group_ids],
        },
        headers=as_manager.headers,
    )
    assert created.status_code == 201, created.text
    token = created.json()["token"]
    assert token, "the invite screen has nothing to show the manager"
    return token


def _sign_in_as_the_invited(client, fake_provider, email: str):
    """Step 3's first half: the invited person signs in to the STAFF app with Google."""
    subject = f"invited-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=email)
    return sign_in(client, code=code, app_name="staff")


def test_an_invited_coach_can_work_in_the_staff_app_after_a_rotation(
    client, fake_provider, as_manager, app_session, a_group
) -> None:
    """The whole journey, ending where it actually matters: the coach's own screens.

    The four steps are the product's, not the test's -- invite, sign in, redeem, work --
    and the assertions after the redemption are the ones a 201 cannot make.
    """
    email = f"coach-{uuid.uuid4().hex[:8]}@example.invalid"
    token = _invite(client, as_manager, email=email, roles=["lead_coach"], group_ids=[a_group])

    # Signed in, but not yet redeemed: no Person is bound to this identity, so §6.1's
    # `access.staff` query answers false and the staff app shows the refusal. This is the
    # state the invited coach is in when they open the app for the first time.
    signed = _sign_in_as_the_invited(client, fake_provider, email)
    assert signed.status_code == 200, signed.text
    assert signed.json()["access"]["staff"] is False
    assert signed.json()["studios"] == []

    redeemed = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token},
        headers={"Authorization": f"Bearer {signed.json()['access_token']}"},
    )
    assert redeemed.status_code == 200, redeemed.text
    body = redeemed.json()
    assert body["access"]["staff"] is True, "redeeming a staff invitation must open the staff app"
    assert body["active_studio_id"] == str(as_manager.studio_id)
    assert "lead_coach" in body["studios"][0]["roles"]

    # The rotation the app makes fifteen minutes later, and the token it holds from then
    # on. 0fbb313 put the studio on the refresh ROW for exactly this moment.
    rotated = client.post("/api/v1/auth/refresh")
    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["active_studio_id"] == str(as_manager.studio_id), (
        "the rotation dropped the invited studio; every tenant-scoped route now 401s "
        "and the staff app renders empty with no error on screen"
    )
    assert rotated.json()["access"]["staff"] is True
    coach = {"Authorization": f"Bearer {rotated.json()['access_token']}"}

    # The screens a lead_coach's roles allow, on the token the app is actually holding.
    # A 401 here is the failure this file exists to catch: it means the session named no
    # studio, which is invisible on screen.
    assert client.get("/api/v1/studio", headers=coach).status_code == 200
    groups = client.get("/api/v1/groups", headers=coach)
    assert groups.status_code == 200, groups.text
    assert str(a_group) in [g["id"] for g in groups.json()["items"]]
    assert client.get(f"/api/v1/groups/{a_group}/staff", headers=coach).status_code == 200
    sessions = client.get(
        "/api/v1/sessions", params={"from": "2026-08-24", "to": "2026-08-30"}, headers=coach
    )
    assert sessions.status_code == 200, sessions.text

    # And the screen their roles do NOT allow. 403 and not 401: they are authenticated
    # and scoped, they simply may not manage staff. A blanket 200 here would mean the
    # invitation handed out more than it named.
    assert client.get(STAFF, headers=coach).status_code == 403


def test_the_groups_the_invitation_named_are_the_coachs_on_arrival(
    client, fake_provider, as_manager, app_session, a_group
) -> None:
    """The rosters are the reason a coach opens the app at all.

    `invite_staff` puts the coach on the group at invite time, before any login exists.
    Nothing in acceptance re-runs that, so if the binding attached the identity to a
    DIFFERENT Person than the one the roster row names, the coach arrives to an empty app
    while the manager's screen shows them correctly staffed.
    """
    email = f"roster-{uuid.uuid4().hex[:8]}@example.invalid"
    token = _invite(client, as_manager, email=email, roles=["lead_coach"], group_ids=[a_group])
    signed = _sign_in_as_the_invited(client, fake_provider, email)
    redeemed = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token},
        headers={"Authorization": f"Bearer {signed.json()['access_token']}"},
    )
    assert redeemed.status_code == 200, redeemed.text
    person_id = uuid.UUID(redeemed.json()["studios"][0]["person_id"])

    staffed = (
        app_session.execute(
            select(GroupStaff.person_id).where(
                GroupStaff.group_id == a_group, GroupStaff.to_date.is_(None)
            )
        )
        .scalars()
        .all()
    )
    assert person_id in staffed, (
        "the identity bound to a Person the roster row does not name -- the coach's app "
        "is empty and the manager's screen says otherwise"
    )


def test_an_invited_manager_reaches_the_staff_screen_the_invitation_promised(
    client, fake_provider, as_manager
) -> None:
    """The roles are not decoration. An invitation naming `manager` must actually open the
    manager-only screens, on the rotated token."""
    email = f"mgr-{uuid.uuid4().hex[:8]}@example.invalid"
    token = _invite(client, as_manager, email=email, roles=["manager"])
    signed = _sign_in_as_the_invited(client, fake_provider, email)
    redeemed = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token},
        headers={"Authorization": f"Bearer {signed.json()['access_token']}"},
    )
    assert redeemed.status_code == 200, redeemed.text

    rotated = client.post("/api/v1/auth/refresh")
    manager = {"Authorization": f"Bearer {rotated.json()['access_token']}"}
    assert client.get(STAFF, headers=manager).status_code == 200


def test_the_invitation_token_is_shown_once_and_never_again(client, as_manager) -> None:
    """The manager copies it from the screen or it is gone. `list_staff` is the only other
    place the invitation appears, and a token reachable from a LIST is a token any later
    reader of that screen can redeem."""
    email = f"once-{uuid.uuid4().hex[:8]}@example.invalid"
    _invite(client, as_manager, email=email, roles=["assistant_coach"])
    listed = client.get(STAFF, headers=as_manager.headers).json()
    row = next(r for r in listed["items"] if r["email"] == email)
    assert row["status"] == "invited"
    assert "token" not in row
    assert "token_hash" not in row
