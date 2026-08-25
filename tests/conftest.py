"""Database fixtures.

These fail rather than skip when no database is reachable. A skipped DB test is a gate
that passes while checking nothing, which is exactly the failure mode M0.1 found three
times. The message carries the fix.
"""

from __future__ import annotations

import base64
import subprocess
import sys
import uuid
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from app.core.config import settings
from app.services.identity.providers import FakeProvider
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]

_NO_DB = (
    "No PostgreSQL at {url}\n"
    "Start one:  ./scripts/dev-db.sh up\n"
    "These tests do not skip: a skipped database test is a gate that checks nothing."
)


@pytest.fixture(scope="session")
def migration_engine() -> Iterator[Engine]:
    engine = create_engine(settings.MIGRATION_DATABASE_URL, connect_args={"connect_timeout": 5})
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 -- the message matters more than the type
        pytest.fail(_NO_DB.format(url=settings.MIGRATION_DATABASE_URL) + f"\n\n{exc}")
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def migrated(migration_engine: Engine) -> Engine:
    """Upgrade to head once per session. Forward-only, per SPEC 8.1a."""
    # `sys.executable -m alembic`, never `.venv/bin/alembic`: CI installs into the
    # system Python and has no .venv at all, so the hardcoded path passed locally and
    # failed on the runner with 27 errors. This form also guarantees migrations run
    # under the same interpreter as the tests.
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        pytest.fail(f"alembic upgrade head failed:\n{result.stdout}\n{result.stderr}")

    # Revision 0001 creates the runtime role NOLOGIN on purpose: a migration must never
    # express a credential. Staging and production grant login with a password out of
    # band. Tests need to actually connect as that role -- it is the only way to prove
    # Postgres refuses an UPDATE on audit_log (SPEC 11.2) -- so this is the test
    # environment's stand-in for that out-of-band step.
    #
    # It lives here rather than in a local init script because a local-only init script
    # is exactly what let local and CI drift: locally the role arrived WITH LOGIN from
    # docker-entrypoint-initdb.d, CI has no init hook at all, and the difference only
    # surfaced on the runner.
    with migration_engine.begin() as connection:
        connection.execute(text(f"ALTER ROLE {settings.APP_DB_ROLE} WITH LOGIN"))
        connection.execute(
            text(f"GRANT CONNECT ON DATABASE studio_manager TO {settings.APP_DB_ROLE}")
        )
    return migration_engine


@pytest.fixture
def app_session(migrated: Engine) -> Iterator[Session]:
    """A session on the runtime role -- the one that cannot UPDATE audit_log."""
    engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 5})
    with Session(engine) as session:
        yield session
    engine.dispose()


# -- the app, signed in ------------------------------------------------------
# These live here rather than in tests/identity/ because pytest does not share a conftest
# between sibling directories, and tests/structure/ needs the same signed-in client to
# exercise §3.2's matrix. They are app-level fixtures, not identity-specific ones.

#: 32 bytes. RFC 7518 §3.2's floor for HS256; PyJWT warns below it, and a test key that
#: models bad practice teaches it.
TEST_JWT_KEY = base64.b64encode(b"\x11" * 32).decode()


@pytest.fixture
def fake_provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def client(migrated: Engine, fake_provider: FakeProvider, monkeypatch) -> Iterator[TestClient]:
    """A TestClient wired to the fake OAuth provider.

    The fake is injected through a FastAPI dependency override rather than by
    monkeypatching `configured_providers`: an override is torn down with the app object,
    and it is the same seam production resolves through, so the test exercises the real
    wiring rather than a parallel one.
    """
    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", SecretStr(TEST_JWT_KEY))

    from app.main import app
    from app.routers import identity as identity_router

    app.dependency_overrides[identity_router.get_providers] = lambda: {"fake": fake_provider}
    # base_url is https on purpose. A `Secure` cookie is only stored by a client that
    # believes it is on a secure origin, and TestClient defaults to http://testserver --
    # so every session test would fail on a dropped cookie, for a reason with nothing to
    # do with the code under test.
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client
    app.dependency_overrides.clear()


def start_flow(client: TestClient, app_name: str = "parent") -> str:
    """Begin a sign-in and return the `state` the server issued."""
    response = client.get(f"/api/v1/auth/fake/start?app={app_name}", follow_redirects=False)
    assert response.status_code == 307, response.text
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def sign_in(
    client: TestClient,
    *,
    code: str,
    app_name: str = "parent",
    invitation: str | None = None,
):
    body: dict[str, object] = {"code": code, "state": start_flow(client, app_name)}
    if invitation is not None:
        body["invitation_token"] = invitation
    return client.post("/api/v1/auth/fake/callback", json=body)


@pytest.fixture
def signed_in(client: TestClient, fake_provider: FakeProvider):
    """An ordinary signed-in identity with no roles and no children -- §6.1's last row.

    Deliberately the emptiest case: every cookie assertion holds regardless of what the
    identity can reach, so binding them to a richer fixture would couple them to data
    they do not care about.
    """
    fake_provider.register(
        code="c-si", subject=f"s-{uuid.uuid4()}", email=f"{uuid.uuid4().hex[:8]}@example.invalid"
    )
    return sign_in(client, code="c-si")
