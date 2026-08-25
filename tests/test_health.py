import inspect
from datetime import datetime

import pytest
from app.main import app
from app.routers import health as health_module
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_is_versioned_under_api_v1():
    """G5 -- new API endpoints are versioned under /api/v1/."""
    assert client.get("/health").status_code == 404
    assert client.get("/api/v1/health").status_code == 200


def test_health_reports_status_and_env():
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["env"] in {"development", "staging", "production", "test"}


def test_health_reports_the_migration_revision_and_start_time():
    body = client.get("/api/v1/health").json()
    assert "revision" in body
    assert datetime.fromisoformat(body["started_at"]).tzinfo is not None


@pytest.mark.db
def test_the_revision_is_actually_readable_by_the_runtime_role():
    """`assert "revision" in body` is true of null, so on its own it is a gate that
    cannot fail. studio_app is a different role from studio_migrator and does not
    inherit rights on the migrator's own bookkeeping table -- if that grant is missing,
    this field is decorative in every environment and nothing else would say so."""
    assert client.get("/api/v1/health").json()["revision"] is not None


def test_started_at_is_the_process_start_not_the_request_time():
    first = client.get("/api/v1/health").json()["started_at"]
    second = client.get("/api/v1/health").json()["started_at"]
    assert first == second


def test_an_unreadable_database_yields_a_null_revision_and_still_reports_ok(monkeypatch):
    """This endpoint is liveness. If a database blip could turn it red, every uptime
    monitor pointed at it would page for something that is not an outage."""

    def boom() -> str | None:
        raise RuntimeError("connection refused")

    monkeypatch.setattr(health_module, "_read_revision", boom)
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["revision"] is None


def test_the_revision_comes_from_the_database_not_the_filesystem():
    """Reading alembic/versions/ would report what the image ships rather than what
    the database is at -- which is the exact drift this field exists to surface."""
    source = inspect.getsource(health_module._read_revision)
    assert "alembic_version" in source, "the revision must be read from the database"
