"""SPEC 5.1's chain of authority, enforced at the only place it can be::

    platform_admin --creates studio + designates--> owner
          owner    --invites--> managers ... --> guardians

6.1: "Staff-app access is provisioned, never self-service. Signing in with a Google
account that holds no role assignment produces a refusal -- there is no path from 'I
downloaded the app' to 'I have a studio'." These tests are that sentence.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.identity import AuthIdentity, PlatformAdmin
from sqlalchemy.orm import Session
from tests.identity.conftest import sign_in


@pytest.fixture
def platform_admin(client, fake_provider, app_session: Session):
    """3.1 -- 'Seeded manually.' A fixture and not an endpoint, deliberately: there is no
    route anywhere that creates one, because a console able to mint its own operators
    would make the top of the chain self-issuing."""
    from dataclasses import dataclass

    from sqlalchemy import select

    @dataclass
    class Admin:
        identity_id: uuid.UUID
        token: str

        @property
        def headers(self) -> dict[str, str]:
            return {"Authorization": f"Bearer {self.token}"}

    subject = f"padm-{uuid.uuid4()}"
    fake_provider.register(code="c-padm", subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code="c-padm", app_name="dashboard")

    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()
    app_session.add(PlatformAdmin(auth_identity_id=identity_id))
    app_session.commit()

    # Sign in AGAIN. The first token was minted before the platform_admin row existed, and
    # require_platform_admin re-confirms against the database rather than trusting the
    # token's claim -- so this second sign-in is not working around the design, it is
    # exercising the same path a newly-appointed operator walks.
    signed = sign_in(client, code="c-padm", app_name="dashboard")
    return Admin(identity_id=identity_id, token=signed.json()["access_token"])


def _new_studio(client, admin, **overrides):
    body = {
        "name": "מועדון חדש",
        "slug": f"nc-{uuid.uuid4().hex[:8]}",
        "timezone": "Asia/Jerusalem",
        "default_locale": "he",
    }
    body.update(overrides)
    return client.post("/api/v1/platform/studios", json=body, headers=admin.headers)


# -- 5.1's first link ---------------------------------------------------------
def test_an_ordinary_signed_in_identity_cannot_create_a_studio(client, fake_provider):
    """The single most important assertion in this file. If this ever returns 201, 5.1's
    chain of authority has no first link and 6.1's 'never self-service' is false."""
    fake_provider.register(code="c-ord", subject=f"o-{uuid.uuid4()}", email="ord@example.invalid")
    token = sign_in(client, code="c-ord").json()["access_token"]
    response = client.post(
        "/api/v1/platform/studios",
        json={"name": "מועדון", "slug": f"x-{uuid.uuid4().hex[:8]}"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_an_anonymous_caller_cannot_create_a_studio(client):
    response = client.post(
        "/api/v1/platform/studios", json={"name": "x", "slug": f"y-{uuid.uuid4().hex[:6]}"}
    )
    assert response.status_code == 401


def test_a_platform_admin_creates_a_studio(client, platform_admin):
    response = _new_studio(client, platform_admin)
    assert response.status_code == 201, response.text
    assert response.json()["created_by_identity_id"] == str(platform_admin.identity_id)


def test_a_new_studio_is_never_a_demo_studio(client, platform_admin):
    """19.1 makes is_demo the flag deciding whether a studio contains real people, and
    19.7 excludes flagged studios from every cross-studio total -- so a console that could
    set it could make a real club invisible to the numbers used to judge real clubs."""
    response = _new_studio(client, platform_admin, is_demo=True)
    assert response.status_code == 201
    assert response.json()["is_demo"] is False


def test_a_new_studio_gets_its_trial_health_template(client, platform_admin, app_session):
    """Conflict C3. 5.4a's funnel puts a declaration at step 3 of five, so a studio that
    reaches M3 without a trial template is a funnel that stops there."""
    from app.models.health import HealthFormTemplate
    from sqlalchemy import func, select

    studio_id = uuid.UUID(_new_studio(client, platform_admin).json()["id"])
    count = app_session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.studio_id == studio_id, HealthFormTemplate.kind == "trial")
    ).scalar_one()
    assert count == 1


def test_a_malformed_slug_is_refused(client, platform_admin):
    """The slug appears in URLs and in the demo studio's own lookup. Anything outside
    lower-case, digits and hyphens either needs escaping or is invisibly different from
    something that looks the same."""
    for bad in ("Has Spaces", "UPPER", "-leading", "trailing-", "sl/ash"):
        assert _new_studio(client, platform_admin, slug=bad).status_code == 422, bad


# -- 5.1's second link --------------------------------------------------------
def test_inviting_an_owner_returns_the_token_exactly_once(client, platform_admin):
    """5.3's token is a bearer credential. It is returned here and stored as a hash, so a
    later listing must never be able to produce it."""
    studio = _new_studio(client, platform_admin).json()
    invite = client.post(
        f"/api/v1/platform/studios/{studio['id']}/invite-owner",
        json={"email": "owner@example.invalid", "first_name": "עידו", "last_name": "בעלים"},
        headers=platform_admin.headers,
    )
    assert invite.status_code == 201, invite.text
    assert invite.json()["token"]

    listing = client.get("/api/v1/platform/studios", headers=platform_admin.headers)
    assert "token" not in listing.text


def test_accepting_an_owner_invitation_grants_exactly_one_owner(
    client, platform_admin, fake_provider
):
    """3.1 -- 'owner: created with the studio; exactly one; cannot be removed.' The role
    is created with the Person up front, so accepting attaches a login to a profile that
    already holds it rather than granting anything at accept time."""
    studio = _new_studio(client, platform_admin).json()
    token = client.post(
        f"/api/v1/platform/studios/{studio['id']}/invite-owner",
        json={"email": "newowner@example.invalid", "first_name": "עידו", "last_name": "בעלים"},
        headers=platform_admin.headers,
    ).json()["token"]

    fake_provider.register(
        code="c-own", subject=f"own-{uuid.uuid4()}", email="newowner@example.invalid"
    )
    response = sign_in(client, code="c-own", app_name="staff", invitation=token)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access"]["staff"] is True
    assert body["studios"][0]["roles"] == ["owner"]
    assert body["studios"][0]["studio_id"] == studio["id"]


def test_an_invitation_token_is_single_use(client, platform_admin, fake_provider):
    """5.3's token binds ONE identity to a pre-created Person. A replayable one would let
    whoever saw the email attach themselves after the real owner had."""
    studio = _new_studio(client, platform_admin).json()
    token = client.post(
        f"/api/v1/platform/studios/{studio['id']}/invite-owner",
        json={"email": "once@example.invalid", "first_name": "עידו", "last_name": "בעלים"},
        headers=platform_admin.headers,
    ).json()["token"]

    fake_provider.register(code="c-1", subject=f"a-{uuid.uuid4()}", email="once@example.invalid")
    fake_provider.register(code="c-2", subject=f"b-{uuid.uuid4()}", email="once@example.invalid")
    assert sign_in(client, code="c-1", app_name="staff", invitation=token).status_code == 200
    assert sign_in(client, code="c-2", app_name="staff", invitation=token).status_code == 400


def test_inviting_an_owner_for_a_studio_that_does_not_exist_is_404(client, platform_admin):
    response = client.post(
        f"/api/v1/platform/studios/{uuid.uuid4()}/invite-owner",
        json={"email": "x@example.invalid", "first_name": "א", "last_name": "ב"},
        headers=platform_admin.headers,
    )
    assert response.status_code == 404


# -- 18.3's suspend -----------------------------------------------------------
def test_suspending_a_studio_removes_it_from_the_switcher(client, platform_admin, fake_provider):
    """A suspended studio a person can still switch into is a suspension that suspended
    nothing."""
    studio = _new_studio(client, platform_admin).json()
    token = client.post(
        f"/api/v1/platform/studios/{studio['id']}/invite-owner",
        json={"email": "susp@example.invalid", "first_name": "א", "last_name": "ב"},
        headers=platform_admin.headers,
    ).json()["token"]
    fake_provider.register(code="c-su", subject=f"su-{uuid.uuid4()}", email="susp@example.invalid")
    first = sign_in(client, code="c-su", app_name="staff", invitation=token)
    assert first.json()["studios"][0]["studio_id"] == studio["id"]

    assert (
        client.post(
            f"/api/v1/platform/studios/{studio['id']}/suspend", headers=platform_admin.headers
        ).status_code
        == 200
    )

    again = sign_in(client, code="c-su", app_name="staff")
    assert again.json()["studios"] == []
    assert again.json()["access"]["staff"] is False


# -- 19.2 ---------------------------------------------------------------------
def test_no_platform_schema_exposes_is_developer_or_is_demo(client):
    """19.2 for the first, 19.1 for the second. The console is where 'just let me flag
    this account' would feel most reasonable, which is why both are asserted here as well
    as globally."""
    schema = client.app.openapi()
    bodies = [
        op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        for path, ops in schema["paths"].items()
        if path.startswith("/api/v1/platform")
        for op in ops.values()
    ]
    components = schema.get("components", {}).get("schemas", {})
    request_models = str(bodies) + str(
        {k: v for k, v in components.items() if k.endswith("Request")}
    )
    assert "is_developer" not in request_models
    assert "is_demo" not in request_models


def test_there_is_no_route_that_grants_platform_admin(client):
    """3.1 -- 'Seeded manually.' A console able to mint its own operators would make the
    top of 5.1's chain self-issuing, which is the same defect 19.2 forbids for
    is_developer."""
    paths = client.app.openapi()["paths"]
    assert not [p for p in paths if "platform-admin" in p or "platform_admin" in p]
    assert "PlatformAdmin" not in str(client.app.openapi().get("components", {}).get("schemas", {}))
