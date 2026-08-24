from app.main import app
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
