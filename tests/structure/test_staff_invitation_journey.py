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
from tests.structure.conftest import bearer

STAFF = "/api/v1/staff"


def live(token: str) -> dict[str, str]:
    """An auth header on the REAL clock, deliberately without `bearer`'s pin to T0.

    `bearer` pins because one assertion about a TTL drifts stale once real time passes it.
    A JOURNEY that ROTATES is the opposite case: it creates an invitation, redeems it and
    rotates the session in sequence, so what it needs is for those three to agree with EACH
    OTHER — and on the real clock they always do, however long ago T0 was.

    Pinning is what broke the two rotating journeys. Redeeming under the pin stamps the new
    refresh row at T0, so it expired at `T0 + REFRESH_TOKEN_TTL_DAYS` = 2026-09-24 and every
    rotation after it answered 401 `expired` from 2026-09-25 on, with nothing in the product
    wrong. Pinning the rotation too does not help and cannot: `AuthContextMiddleware` is
    registered AFTER `DevClockMiddleware` and therefore runs BEFORE it (`app/main.py` calls
    that order load-bearing), so an access token is always verified against the real wall
    clock — a token minted under a shifted clock is unusable by construction. Every other
    suite mints unpinned for this reason, including this module's own `_make_caller`.

    Used for a whole journey or not at all: redeeming live while inviting pinned is the
    2026-09-09 failure in `bearer`'s own docstring, an invitation from T0 reaching a
    redemption fourteen days past its expiry. The non-rotating tests here assert one thing
    each, invite and redeem under the pin, and correctly keep `bearer`.
    """
    return {"Authorization": f"Bearer {token}"}


def _invite(client, as_manager, *, email: str, roles: list[str], group_ids=(), headers=None) -> str:
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
        headers=as_manager.headers if headers is None else headers,
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
    token = _invite(
        client,
        as_manager,
        email=email,
        roles=["lead_coach"],
        group_ids=[a_group],
        headers=live(as_manager.token),
    )

    # **Signing in AT the invited address is itself the binding** — §5.3's
    # `accept_invitations_for_verified_email`, which the callback calls. So the coach is
    # staff before touching the token, and the token's own route is what a DIFFERENT address
    # needs (`accept_invitation_code`'s docstring: "a correctly-invited parent whose email
    # differs from the invitation by one character").
    #
    # This asserted `access.staff is False` and `studios == []` until 2026-10-05, and
    # passed — but only because the invitation was created under the T0 pin and had expired
    # 2026-09-08, and that binder refuses an expired invitation. So the "not yet redeemed"
    # state it was describing is the state of an invitation that has AGED OUT, not the state
    # an invited coach is ever in. With the journey on the real clock the invitation is
    # live, and the product does what §5.3 says.
    signed = _sign_in_as_the_invited(client, fake_provider, email)
    assert signed.status_code == 200, signed.text
    assert signed.json()["access"]["staff"] is True, (
        "a verified sign-in at the invited address is §5.3's binding; this answering false "
        "would mean the coach opens the staff app to the refusal screen with no way forward"
    )
    assert "lead_coach" in signed.json()["studios"][0]["roles"]

    redeemed = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token},
        headers=live(signed.json()["access_token"]),
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
    coach = live(rotated.json()["access_token"])

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
        headers=bearer(signed.json()["access_token"]),
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
    token = _invite(
        client, as_manager, email=email, roles=["manager"], headers=live(as_manager.token)
    )
    signed = _sign_in_as_the_invited(client, fake_provider, email)
    redeemed = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token},
        headers=live(signed.json()["access_token"]),
    )
    assert redeemed.status_code == 200, redeemed.text

    rotated = client.post("/api/v1/auth/refresh")
    manager = live(rotated.json()["access_token"])
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
