"""A TestClient wired to the fake provider.

The fake is injected through a FastAPI dependency override rather than by monkeypatching
`configured_providers`: an override is torn down with the app object, and it is the same
seam production resolves through, so the test exercises the real wiring rather than a
parallel one.
"""

from __future__ import annotations

import base64
import uuid
from collections.abc import Iterator
from urllib.parse import parse_qs, urlparse

import pytest
from app.core.config import settings
from app.services.identity.providers import FakeProvider
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine

#: 32 bytes. RFC 7518 3.2's floor for HS256; PyJWT warns below it, and a test key that
#: models bad practice teaches it.
TEST_JWT_KEY = base64.b64encode(b"\x11" * 32).decode()


@pytest.fixture
def fake_provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def client(migrated: Engine, fake_provider: FakeProvider, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", SecretStr(TEST_JWT_KEY))

    from app.main import app
    from app.routers import identity as identity_router

    app.dependency_overrides[identity_router.get_providers] = lambda: {"fake": fake_provider}
    # base_url is https on purpose. A `Secure` cookie is only stored by a client that
    # believes it is on a secure origin, and TestClient defaults to http://testserver --
    # so every session test would fail on a dropped cookie, for a reason that has nothing
    # to do with the code under test.
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client
    app.dependency_overrides.clear()


def start_flow(client: TestClient, app_name: str = "parent") -> str:
    """Begin a sign-in and return the `state` the server issued."""
    response = client.get(f"/api/v1/auth/fake/start?app={app_name}", follow_redirects=False)
    assert response.status_code == 307, response.text
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def sign_in(
    client: TestClient, *, code: str, app_name: str = "parent", invitation: str | None = None
):
    body: dict[str, object] = {"code": code, "state": start_flow(client, app_name)}
    if invitation is not None:
        body["invitation_token"] = invitation
    return client.post("/api/v1/auth/fake/callback", json=body)


@pytest.fixture
def signed_in(client: TestClient, fake_provider: FakeProvider):
    """An ordinary signed-in identity with no roles and no children -- 6.1's last row.

    Deliberately the *emptiest* case: every cookie assertion holds regardless of what the
    identity can reach, so binding them to a rich fixture would couple them to data they
    do not care about.
    """
    fake_provider.register(
        code="c-si", subject=f"s-{uuid.uuid4()}", email=f"{uuid.uuid4().hex[:8]}@example.invalid"
    )
    return sign_in(client, code="c-si")
