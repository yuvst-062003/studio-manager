"""SPEC §19.4's role switcher, reached from a URL bar instead of from the dev bar.

`POST /dev/act-as/{person_id}` already mints a persona session, but it hands the caller a
bearer token in a JSON body -- and a browser that has never signed in has nowhere to put
one. `useSession` bootstraps from `POST /auth/refresh` and the §11.7 cookie alone, so the
switcher was unreachable until *after* a real OAuth sign-in had already happened. On a
developer's machine, where `configured_providers()` is empty because no client id is
configured, that made it unreachable full stop: the sign-in screen renders no buttons and
there is no first session to switch from.

This route closes that gap by ending in the same place the OAuth callback's GET arm ends
-- a refresh cookie and a redirect -- so the browser arrives at the app already carrying a
session. It is the *only* way into the apps without a configured OAuth provider, which is
why it is tested as carefully as the flow it stands in for.

The restriction that matters is the last test: this route hands out sessions, so
`app/main.py`'s discovery skip is the only thing between it and a production session
minter. tests/restrictions/test_02 asserts the whole dev surface is absent there; this
file re-asserts it for this path specifically, because a route that mints sessions
deserves its own failing test rather than protection by a general one.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from urllib.parse import urlparse

import pytest
from app.core.tenancy import with_all_tenants
from app.models.audit import AuditLog
from app.services.demo.service import DemoStudioService
from app.services.identity.refresh import REFRESH_COOKIE_NAME
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.dev.conftest import app_in_env

_SCOPE = "test reads the demo studio's seeded rows directly"

SIGN_IN = "/api/v1/dev/sign-in-as"


@pytest.fixture
def demo_studio_id(app_session: Session) -> Iterator[uuid.UUID]:
    DemoStudioService.reset(app_session)
    app_session.commit()
    yield DemoStudioService.studio_id(app_session)


# -- the redirect and the cookie ----------------------------------------------
def test_it_redirects_to_the_app_it_was_asked_for(client, demo_studio_id):
    response = client.get(f"{SIGN_IN}/manager?app=dashboard", follow_redirects=False)

    assert response.status_code == 307, response.text
    # domains.json's development entry. Asserted as the host rather than the whole URL so
    # the test does not have to be edited on the day HB-domain swaps the hostnames.
    assert urlparse(response.headers["location"]).port == 5175


def test_it_sets_the_refresh_cookie_the_apps_bootstrap_from(client, demo_studio_id):
    """§11.7's cookie, and the whole point of this route.

    `POST /dev/act-as` returns a bearer token instead, which a browser arriving cold has
    no way to install -- `setAccessToken` is a module-scoped variable in
    packages/core/src/identity/session.ts, deliberately unreachable from a console.
    """
    response = client.get(f"{SIGN_IN}/manager?app=dashboard", follow_redirects=False)

    assert REFRESH_COOKIE_NAME in response.cookies


def test_the_cookie_exchanges_for_a_session_carrying_that_persona(client, demo_studio_id):
    """The assertion that proves the route actually works end to end.

    A cookie that is set but does not refresh is the failure this route exists to avoid,
    and it is invisible to a status-code check: the redirect would still be a 307.
    """
    client.get(f"{SIGN_IN}/manager?app=dashboard", follow_redirects=False)

    session = client.post("/api/v1/auth/refresh")

    assert session.status_code == 200, session.text
    assert session.json()["access_token"]


def test_the_persona_s_own_access_is_what_the_session_carries(client, demo_studio_id):
    """§19.4 -- 'the API resolves permissions from that Person exactly as it would for a
    real login.' The assistant persona exists to verify no financial data leaks, and it
    proves nothing if signing in as one silently keeps the developer's own reach.

    Walked in the order `useSession` walks it: the cookie buys an access token from
    `/auth/refresh`, and only the token opens `/auth/me`. Calling `/auth/me` straight
    after the redirect is a 401 -- the cookie is scoped to `/api/v1/auth` and is not a
    bearer credential, which is the whole point of §11.7.
    """
    client.get(f"{SIGN_IN}/assistant?app=staff", follow_redirects=False)
    token = client.post("/api/v1/auth/refresh").json()["access_token"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert me.status_code == 200, me.text
    # The assistant coach is staff and is nobody's guardian. A developer session that had
    # leaked its own reach into the persona would show parent access here too.
    assert me.json()["access"] == {"staff": True, "parent": False}


# -- refusals -----------------------------------------------------------------
def test_an_unknown_persona_is_refused(client, demo_studio_id):
    response = client.get(f"{SIGN_IN}/not-a-persona?app=dashboard", follow_redirects=False)

    assert response.status_code == 404, response.text
    assert REFRESH_COOKIE_NAME not in response.cookies


def test_an_unknown_app_is_refused_rather_than_redirected_anywhere(client, demo_studio_id):
    """An open redirect out of a route that has just minted a session is a
    credential-phishing primitive -- the same reason the OAuth callback rebuilds its
    destination from the stored transaction rather than from a query parameter."""
    response = client.get(f"{SIGN_IN}/manager?app=evil.example", follow_redirects=False)

    assert response.status_code == 422, response.text


# -- the restriction ----------------------------------------------------------
def test_the_route_does_not_exist_in_production():
    """§19.6 restriction 2, re-asserted for the one dev route that mints sessions.

    Existence, not status code: §19.2 requires the router never be registered, so that
    the endpoint is absent rather than guarded by an `if` a later edit could invert.
    """
    with app_in_env("production") as application:
        paths = [p for p in application.openapi()["paths"] if "sign-in-as" in p]
        assert paths == [], f"a session minter exists in production: {paths}"
        assert TestClient(application).get(f"{SIGN_IN}/manager").status_code == 404


# -- the trail ----------------------------------------------------------------
def test_every_sign_in_is_audit_logged(client, app_session, demo_studio_id):
    """§19.4 -- 'Every switch is audit-logged in the demo studio's own log.' A route that
    hands out a session in one GET leaves a trail or it is a hole."""
    client.get(f"{SIGN_IN}/manager?app=dashboard", follow_redirects=False)

    with with_all_tenants(reason=_SCOPE):
        actions = (
            app_session.execute(select(AuditLog.action).where(AuditLog.studio_id == demo_studio_id))
            .scalars()
            .all()
        )

    assert "dev.sign_in_as" in actions


# -- the platform operator's door (ship-audit D3) -----------------------------
def test_the_platform_key_signs_in_a_working_platform_admin(client, demo_studio_id):
    """§16's console was unreachable in development: all nine §19.3 personas live inside
    the demo studio, and `/dev/act-as` mints `is_platform_admin=False` unconditionally --
    so the studio-creation flow could never be exercised locally at all. The reserved
    `platform` key signs in the seeded developer identity, whose `platform_admin` row is
    what the session derivation already reads. Proven by capability, not by claim: the
    platform console itself must answer."""
    response = client.get(f"{SIGN_IN}/platform?app=dashboard", follow_redirects=False)
    assert response.status_code == 307, response.text

    session = client.post("/api/v1/auth/refresh")
    assert session.status_code == 200, session.text
    token = session.json()["access_token"]

    studios = client.get("/api/v1/platform/studios", headers={"Authorization": f"Bearer {token}"})
    assert studios.status_code == 200, studios.text


def test_a_persona_session_still_cannot_reach_the_platform_console(client, demo_studio_id):
    """The complement, so the new door cannot have widened the old ones: an owner is the
    demo studio's highest role and still not a platform operator."""
    client.get(f"{SIGN_IN}/owner?app=dashboard", follow_redirects=False)
    session = client.post("/api/v1/auth/refresh")
    token = session.json()["access_token"]

    studios = client.get("/api/v1/platform/studios", headers={"Authorization": f"Bearer {token}"})
    assert studios.status_code == 403, studios.text
