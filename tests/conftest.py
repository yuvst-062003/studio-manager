"""Database fixtures.

These fail rather than skip when no database is reachable. A skipped DB test is a gate
that passes while checking nothing, which is exactly the failure mode M0.1 found three
times. The message carries the fix.
"""

from __future__ import annotations

import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from app.core.config import settings
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
