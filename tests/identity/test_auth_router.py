"""SPEC 5.2, 6.1 and 11.7 at the HTTP boundary.

The cookie assertions carry the weight. 11.7 says "secure/httpOnly/SameSite cookies for
the refresh token", and infra/railway/README.md explains why a `Domain=` attribute would
be actively wrong: keeping the cookie host-only is what stops a staging session being
valid against production -- and it is also the change someone reaches for when the cookie
stops flowing on Railway's generated subdomains, where it would not help anyway, because
Domain cannot cross a public suffix.
"""

from __future__ import annotations

import uuid
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlparse

from app.core.config import settings
from app.routers.identity import REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH
from sqlalchemy import select
from tests.conftest import sign_in, start_flow


def _set_cookie(response) -> str:
    raw = [v for k, v in response.headers.raw if k.lower() == b"set-cookie"]
    assert raw, "no Set-Cookie on the response"
    return raw[0].decode()


# -- 11.7's cookie ------------------------------------------------------------
def test_the_refresh_cookie_is_httponly_secure_and_samesite(client, fake_provider, monkeypatch):
    """All three asserted individually: dropping any one is a different vulnerability,
    and a single combined assertion would hide which.

    Signed in under a DEPLOYED environment rather than through the `signed_in` fixture,
    because `Secure` is now the one attribute that varies: it is dropped in development,
    where Safari would otherwise refuse the cookie over plain http and leave a developer
    with no session at all. Asserting it against the suite's own `development` default
    would assert the exception and call it the rule. Both halves are pinned in
    tests/identity/test_refresh_cookie.py; this one keeps the check end to end, on a
    cookie that came back from a real sign-in.
    """
    monkeypatch.setattr(settings, "ENV", "staging")
    fake_provider.register(
        code="c-cookie",
        subject=f"s-{uuid.uuid4()}",
        email=f"{uuid.uuid4().hex[:8]}@example.invalid",
    )
    header = _set_cookie(sign_in(client, code="c-cookie")).lower()
    assert "httponly" in header
    assert "secure" in header
    assert "samesite=lax" in header


def test_the_refresh_cookie_is_host_only(signed_in):
    """infra/railway/README.md -- 'Keep cookies host-only (no Domain= attribute) so a
    staging session is never valid against production.'"""
    assert "domain=" not in _set_cookie(signed_in).lower()


def test_the_refresh_cookie_is_scoped_to_the_auth_path(signed_in):
    """The cookie is presented to exactly one endpoint. Sending it on every API call
    would widen the CSRF surface for nothing -- nothing but /auth/refresh reads it."""
    cookie = SimpleCookie()
    cookie.load(_set_cookie(signed_in))
    assert cookie[REFRESH_COOKIE_NAME]["path"] == REFRESH_COOKIE_PATH


def test_the_access_token_is_in_the_body_and_never_in_a_cookie(signed_in):
    """10.3 -- the client holds the access token in memory and replays it. A
    cookie-borne one is sent by the browser automatically, which is what makes CSRF
    possible at all."""
    assert signed_in.json()["access_token"]
    assert "access_token" not in _set_cookie(signed_in)


def test_the_body_never_contains_the_refresh_token(signed_in):
    """If it were readable by JavaScript, httpOnly would have bought nothing."""
    assert REFRESH_COOKIE_NAME not in signed_in.text
    assert "refresh" not in signed_in.json()


# -- 5.2's redirect -----------------------------------------------------------
def test_start_redirects_to_the_provider_and_never_renders_a_page(client):
    """5.2 -- 'a standard top-level redirect'. A rendered interstitial is one step closer
    to a webview, which is where Google returns disallowed_useragent."""
    response = client.get("/api/v1/auth/fake/start?app=parent", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"].startswith("https://fake.invalid/authorize")


def test_start_refuses_an_unknown_provider(client):
    assert (
        client.get("/api/v1/auth/nope/start?app=parent", follow_redirects=False).status_code == 404
    )


def test_start_refuses_an_unknown_app(client):
    """Which app began the flow decides where the callback returns to, so it is validated
    rather than echoed."""
    assert client.get("/api/v1/auth/fake/start?app=evil", follow_redirects=False).status_code == 422


def test_start_refuses_an_offsite_return_path(client):
    """An open redirect on the way back out of an OAuth flow is a credential-phishing
    primitive: the user has just authenticated and will trust wherever they land."""
    for evil in ("https://evil.invalid", "//evil.invalid", "/\\evil.invalid"):
        response = client.get(
            f"/api/v1/auth/fake/start?app=parent&return_path={evil}", follow_redirects=False
        )
        assert response.status_code == 422, evil


def test_providers_lists_only_what_is_configured(client):
    """A button for an unconfigured provider fails after the user has committed to it.
    This is also what keeps Apple invisible until HB-apple-developer closes."""
    body = client.get("/api/v1/auth/providers").json()
    assert [p["name"] for p in body["items"]] == ["fake"]
    assert body["items"][0]["start_url"] == "/api/v1/auth/fake/start"


# -- the callback -------------------------------------------------------------
def test_a_callback_with_an_unknown_state_is_refused(client):
    """The state is the CSRF defence for the whole flow. Accepting an unknown one means
    accepting a code an attacker obtained elsewhere."""
    response = client.post(
        "/api/v1/auth/fake/callback", json={"code": "code-1", "state": "never-issued"}
    )
    assert response.status_code == 400


def test_a_state_is_single_use(client, fake_provider):
    """Replaying a callback must not mint a second session from one authorization."""
    fake_provider.register(code="c1", subject=f"s-{uuid.uuid4()}", email="a@example.invalid")
    state = start_flow(client)
    first = client.post("/api/v1/auth/fake/callback", json={"code": "c1", "state": state})
    assert first.status_code == 200
    second = client.post("/api/v1/auth/fake/callback", json={"code": "c1", "state": state})
    assert second.status_code == 400


def test_a_state_issued_for_one_provider_is_not_valid_for_another(client, fake_provider):
    """Otherwise a state obtained from a provider we trust less could be spent at one we
    trust more."""
    fake_provider.register(code="c2", subject=f"s-{uuid.uuid4()}", email="b@example.invalid")
    state = start_flow(client)
    assert (
        client.post("/api/v1/auth/google/callback", json={"code": "c2", "state": state}).status_code
        == 404
    )


def test_an_unregistered_code_is_a_client_error_not_a_500(client):
    """A provider refusing the exchange is an ordinary outcome — a user who took too long,
    or a replayed code. It must not surface as a server fault."""
    state = start_flow(client)
    response = client.post(
        "/api/v1/auth/fake/callback", json={"code": "never-registered", "state": state}
    )
    assert response.status_code == 400


# -- 6.1's refusals -----------------------------------------------------------
def test_me_reports_both_refusals_for_an_identity_with_nothing(client, fake_provider):
    """6.1's last row -- 'No role and no children: ✗ ✗'. Both apps render their own
    refusal from this one response."""
    fake_provider.register(code="c-none", subject=f"s-{uuid.uuid4()}", email="none@example.invalid")
    signed = sign_in(client, code="c-none")
    token = signed.json()["access_token"]
    body = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["access"] == {"staff": False, "parent": False}
    assert body["studios"] == []
    assert body["active_studio_id"] is None


def test_me_carries_no_field_that_leaks_the_other_app(client, fake_provider):
    """6.1 -- 'Neither screen leaks whether the account exists in the other app.' The
    response says what THIS identity may do and carries no count of anything else."""
    fake_provider.register(code="c-x", subject=f"s-{uuid.uuid4()}", email="x@example.invalid")
    token = sign_in(client, code="c-x").json()["access_token"]
    body = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert set(body) == {
        "identity_id",
        "access",
        "studios",
        "active_studio_id",
        "dev_tools",
        "acting_as_person_id",
        # The signed-in person's own name for the ACTIVE studio (feature pass
        # 2026-08-27). Nothing cross-app about it: it is null until a membership
        # resolves, and it never counts or names anything in the other app.
        "display_name",
        # The account's OWN address, from the global `auth_identity` row (§3.3) --
        # unlike `display_name` it needs no membership, so it is the one field that
        # resolves even at zero studios. Self-identification, not enumeration: it says
        # nothing about whether THIS account exists in the other app, only which
        # account this caller is signed in as. §6.1's refusal renders it as "signed in
        # as <email>" so a wrong-account visitor can tell at a glance.
        "email",
        # §18.1 -- whether to offer the platform console. Nothing cross-app about it
        # either, and for a stronger reason than `display_name`: it is a fact about the
        # global `auth_identity`, which §3.3 puts outside every studio, so it cannot leak
        # a membership in the other app because it does not consult one. Reported, never
        # accepted -- `PlatformAdmin` has no creation route on purpose.
        "is_platform_admin",
    }


def test_me_reports_the_accounts_own_email_even_with_no_studio(client, fake_provider):
    """Unlike `display_name`, this needs no `Person` row -- `auth_identity` is global
    (§3.3) -- so it resolves for the exact account §6.1's refusal is written for: one
    with zero studio memberships anywhere."""
    fake_provider.register(
        code="c-email", subject=f"s-{uuid.uuid4()}", email="whoami@example.invalid"
    )
    token = sign_in(client, code="c-email").json()["access_token"]
    body = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["studios"] == []
    assert body["email"] == "whoami@example.invalid"


def test_me_without_a_token_is_401(client):
    assert client.get("/api/v1/auth/me").status_code == 401


# -- refresh, logout, switch --------------------------------------------------
def test_refresh_rotates_the_cookie(client, fake_provider):
    """The REFRESH token rotates; the access token deliberately does not have to change.

    Asserting the two access tokens differ would be asserting that a second elapsed: the
    JWT is a pure function of its claims, `iat`/`exp` are whole seconds, and two refreshes
    inside one second legitimately produce identical strings. Rotation is a property of
    the cookie, and this is where it is checked. A `jti` added only to make an assertion
    like that pass would be cargo -- §5.2 revokes refresh families, never access tokens.
    """
    fake_provider.register(code="c-r", subject=f"s-{uuid.uuid4()}", email="r@example.invalid")
    sign_in(client, code="c-r")
    before = client.cookies[REFRESH_COOKIE_NAME]
    second = client.post("/api/v1/auth/refresh")
    assert second.status_code == 200
    assert client.cookies[REFRESH_COOKIE_NAME] != before
    assert second.json()["access_token"]


def test_refresh_without_the_cookie_is_401(client):
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_refresh_never_says_why_it_failed(client, fake_provider):
    """The reason goes to the log, never to the caller: telling someone WHY their token
    failed tells an attacker whether the token existed."""
    fake_provider.register(code="c-w", subject=f"s-{uuid.uuid4()}", email="w@example.invalid")
    sign_in(client, code="c-w")
    client.cookies.set(REFRESH_COOKIE_NAME, "a-token-that-was-never-issued")
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    for leak in ("unknown", "reuse", "expired", "revoked", "denylisted"):
        assert leak not in response.text.lower()


def test_reuse_of_a_rotated_cookie_kills_the_session(client, fake_provider):
    """5.2's reuse detection, end to end. The stolen cookie and the live one both die."""
    fake_provider.register(code="c-re", subject=f"s-{uuid.uuid4()}", email="re@example.invalid")
    sign_in(client, code="c-re")
    stolen = client.cookies[REFRESH_COOKIE_NAME]
    assert client.post("/api/v1/auth/refresh").status_code == 200

    client.cookies.set(REFRESH_COOKIE_NAME, stolen)
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_logout_clears_the_cookie_and_ends_the_session_server_side(client, fake_provider):
    """Logout must actually end the session rather than merely forget it locally, or a
    stolen cookie outlives the act of signing out."""
    fake_provider.register(code="c-l", subject=f"s-{uuid.uuid4()}", email="l@example.invalid")
    sign_in(client, code="c-l")
    held = client.cookies[REFRESH_COOKIE_NAME]
    assert client.post("/api/v1/auth/logout").status_code == 204

    client.cookies.set(REFRESH_COOKIE_NAME, held)
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_switch_studio_refuses_a_studio_that_is_not_yours(client, fake_provider):
    """Tenancy's first line. A switch endpoint that trusted its input would be a
    cross-tenant read with a friendly name."""
    fake_provider.register(code="c-s", subject=f"s-{uuid.uuid4()}", email="s@example.invalid")
    token = sign_in(client, code="c-s").json()["access_token"]
    response = client.post(
        "/api/v1/auth/switch-studio",
        json={"studio_id": str(uuid.uuid4())},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# -- 19.2 ---------------------------------------------------------------------
def test_no_auth_request_schema_exposes_is_developer(client):
    """19.2, asserted at this router specifically because it is the one place a
    convenient `is_developer` field would feel natural. tests/restrictions/test_04 checks
    the whole app; this fails closer to the cause."""
    schema = client.app.openapi()
    bodies = [
        op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        for path, ops in schema["paths"].items()
        if path.startswith("/api/v1/auth")
        for op in ops.values()
    ]
    assert "is_developer" not in str(bodies)


# -- §6.1 step 3's invitation-code branch -------------------------------------
def test_an_already_signed_in_person_can_redeem_an_invitation_code(
    client, fake_provider, app_session
):
    """§6.1 step 3 -- '[ יש לי קוד הזמנה ]'. The callback's own invitation_token only helps
    someone who has the code BEFORE signing in; a parent whose email differs from the
    invitation by one character signs in successfully, matches nothing, and needs a way
    forward that is not 'sign out and start again'."""
    import hashlib
    import secrets
    from datetime import UTC, datetime, timedelta

    from app.models.person import Invitation, Person
    from app.models.studio import Studio

    at = datetime.now(UTC)
    token = secrets.token_urlsafe(16)
    studio = Studio(name="מועדון", slug=f"inv-{uuid.uuid4().hex[:8]}")
    app_session.add(studio)
    app_session.flush()
    app_session.add(
        Person(
            studio_id=studio.id,
            first_name="שירה",
            last_name="הורה",
            email="late@example.invalid",
        )
    )
    app_session.add(
        Invitation(
            studio_id=studio.id,
            email="late@example.invalid",
            intended_role="guardian",
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=at + timedelta(days=7),
        )
    )
    app_session.commit()

    # Signs in with a DIFFERENT address, so nothing matches and §6.1's 'no match' branch
    # is what she lands on.
    fake_provider.register(
        code="c-late", subject=f"late-{uuid.uuid4()}", email="typo@example.invalid"
    )
    signed = sign_in(client, code="c-late")
    assert signed.json()["studios"] == []

    token_header = {"Authorization": f"Bearer {signed.json()['access_token']}"}
    redeemed = client.post(
        "/api/v1/auth/accept-invitation", json={"token": token}, headers=token_header
    )
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["studios"][0]["studio_id"] == str(studio.id)
    # The invitation named the studio, so accepting one is also choosing it.
    assert redeemed.json()["active_studio_id"] == str(studio.id)


def test_accepting_an_invitation_survives_the_next_rotation(client, fake_provider, app_session):
    """The studio an invitation named must still be active after the token rotates.

    `accept-invitation` handed back a session scoped to the invited studio and never wrote
    it to the refresh row, so the choice lived only in the fifteen minutes that access
    token was valid. The next rotation re-read the row and silently moved the parent back
    to whichever studio they had before — the sibling of the join-link defect, and the one
    case the sole-membership rule in `_build_session` cannot cover, because a parent with
    two memberships has a real choice to lose.
    """
    import hashlib
    import secrets
    from datetime import UTC, datetime, timedelta

    from app.models.identity import AuthIdentity
    from app.models.person import Invitation, Person
    from app.models.studio import Studio

    at = datetime.now(UTC)
    subject = f"two-clubs-{uuid.uuid4()}"
    email = f"{uuid.uuid4().hex[:8]}@example.invalid"
    fake_provider.register(code="c-two", subject=subject, email=email)
    sign_in(client, code="c-two")
    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()

    # The club they already belong to, and the session that names it.
    first_club = Studio(name="מועדון א", slug=f"a-{uuid.uuid4().hex[:8]}")
    app_session.add(first_club)
    app_session.flush()
    app_session.add(
        Person(
            studio_id=first_club.id,
            auth_identity_id=identity_id,
            first_name="שירה",
            last_name="הורה",
        )
    )
    app_session.commit()
    assert client.post("/api/v1/auth/refresh").json()["active_studio_id"] == str(first_club.id)

    # A second club invites them by name.
    token = secrets.token_urlsafe(16)
    second_club = Studio(name="מועדון ב", slug=f"b-{uuid.uuid4().hex[:8]}")
    app_session.add(second_club)
    app_session.flush()
    app_session.add(
        Person(studio_id=second_club.id, first_name="שירה", last_name="הורה", email=email)
    )
    app_session.add(
        Invitation(
            studio_id=second_club.id,
            email=email,
            intended_role="guardian",
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=at + timedelta(days=7),
        )
    )
    app_session.commit()

    fresh = client.post("/api/v1/auth/refresh").json()["access_token"]
    redeemed = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token},
        headers={"Authorization": f"Bearer {fresh}"},
    )
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["active_studio_id"] == str(second_club.id)

    rotated = client.post("/api/v1/auth/refresh")
    assert rotated.json()["active_studio_id"] == str(second_club.id), (
        "the rotation moved the parent back to the club they did not just choose"
    )


def test_an_unknown_invitation_code_is_refused(client, fake_provider):
    fake_provider.register(code="c-bad", subject=f"bad-{uuid.uuid4()}", email="b@example.invalid")
    token = sign_in(client, code="c-bad").json()["access_token"]
    response = client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": "not-a-real-code"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400


def test_redeeming_an_invitation_requires_being_signed_in(client):
    assert client.post("/api/v1/auth/accept-invitation", json={"token": "x"}).status_code == 401


# -- the callback a BROWSER makes ---------------------------------------------
# Every test above drives the callback with `client.post(..., json=...)`, which no browser
# ever does. §5.2's flow is "a standard top-level redirect, then PKCE code exchange
# server-side": Google finishes by navigating the user's browser to `redirect_uri` with a
# GET, and `/{provider}/start` builds that redirect_uri as this very endpoint. With only a
# POST handler registered the last step of every real sign-in is a 405 -- and the suite
# stayed green throughout, because the fake provider is driven by a test client that POSTs
# directly and no test ever walked the flow the way a browser does.
def test_the_callback_answers_the_get_a_browser_actually_arrives_with(client, fake_provider):
    """The defect, in one request. `start` sends the user to the provider with
    `redirect_uri=.../auth/fake/callback`; the provider returns them here with a GET."""
    fake_provider.register(code="c-get", subject=f"s-{uuid.uuid4()}", email="get@example.invalid")
    state = start_flow(client)
    response = client.get(
        f"/api/v1/auth/fake/callback?code=c-get&state={state}", follow_redirects=False
    )
    assert response.status_code != 405, "Google returns the browser with a GET"
    assert response.status_code == 307


def test_the_browser_callback_lands_back_in_the_app_that_started_the_flow(client, fake_provider):
    """`OAuthTransaction` stores `app` and `return_path` for exactly this moment. A JSON
    body would leave the user staring at a serialized session -- the browser has nowhere
    to put it, and §5.2 ends the flow "returning to the app's start URL"."""
    fake_provider.register(code="c-get2", subject=f"s-{uuid.uuid4()}", email="g2@example.invalid")
    state = start_flow(client, "staff")
    response = client.get(
        f"/api/v1/auth/fake/callback?code=c-get2&state={state}&", follow_redirects=False
    )
    assert response.status_code == 307
    assert response.headers["location"].endswith("/?signed_in=1")


def test_the_browser_callback_marks_the_return_url_as_signed_in(client, fake_provider):
    """The landing renders its booking flow from the in-memory token alone and never fires
    /auth/refresh for an anonymous visitor. A full-page OAuth return is a fresh JS context
    with an empty memory, so without a marker the flow bounces back to its sign-in step
    forever. The marker is the callback telling the landing that ONE refresh is worth it
    (§5.4a step 1 → step 2)."""
    fake_provider.register(
        code="c-get-marker", subject=f"s-{uuid.uuid4()}", email="marker@example.invalid"
    )
    response = client.get(
        "/api/v1/auth/fake/start?app=parent&return_path=/t/gladiator", follow_redirects=False
    )
    state = parse_qs(urlparse(response.headers["location"]).query)["state"][0]
    response = client.get(
        f"/api/v1/auth/fake/callback?code=c-get-marker&state={state}", follow_redirects=False
    )
    assert response.status_code == 307
    assert response.headers["location"].endswith("/t/gladiator?signed_in=1")


def test_the_browser_callback_sets_the_refresh_cookie(client, fake_provider, monkeypatch):
    """The redirect carries the session or it carries nothing. §11.7's cookie is how the
    app that receives the user gets an access token, through POST /auth/refresh -- there
    is no body on a 307 for it to read one from."""
    # Staging, for the same reason as the cookie test above: `Secure` is deliberately
    # absent in development, so asserting it there would assert the exception.
    monkeypatch.setattr(settings, "ENV", "staging")
    fake_provider.register(code="c-get3", subject=f"s-{uuid.uuid4()}", email="g3@example.invalid")
    state = start_flow(client)
    response = client.get(
        f"/api/v1/auth/fake/callback?code=c-get3&state={state}", follow_redirects=False
    )
    header = _set_cookie(response).lower()
    assert REFRESH_COOKIE_NAME.lower() in header
    assert "httponly" in header and "secure" in header and "samesite=lax" in header


def test_the_browser_callback_still_refuses_an_unknown_state(client):
    """Every rule the POST arm enforces holds on the GET arm — the verb changed, not the
    CSRF defence. A GET that skipped the state check would be the more dangerous half."""
    response = client.get(
        "/api/v1/auth/fake/callback?code=c&state=never-issued", follow_redirects=False
    )
    assert response.status_code == 400


def test_the_post_callback_is_kept_for_apple(client, fake_provider):
    """Not an accident of history. `providers.py` records that Apple POSTs its callback
    whenever `name` or `email` is in scope (`response_mode=form_post`), so both verbs are
    genuinely needed and the POST arm must not be replaced by the GET one."""
    fake_provider.register(code="c-post", subject=f"s-{uuid.uuid4()}", email="p@example.invalid")
    state = start_flow(client)
    assert (
        client.post(
            "/api/v1/auth/fake/callback", json={"code": "c-post", "state": state}
        ).status_code
        == 200
    )
