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

from app.routers.identity import REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH
from tests.conftest import sign_in, start_flow


def _set_cookie(response) -> str:
    raw = [v for k, v in response.headers.raw if k.lower() == b"set-cookie"]
    assert raw, "no Set-Cookie on the response"
    return raw[0].decode()


# -- 11.7's cookie ------------------------------------------------------------
def test_the_refresh_cookie_is_httponly_secure_and_samesite(signed_in):
    """All three asserted individually: dropping any one is a different vulnerability,
    and a single combined assertion would hide which."""
    header = _set_cookie(signed_in).lower()
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
    }


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
