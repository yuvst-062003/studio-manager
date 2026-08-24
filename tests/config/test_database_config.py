"""The two ways a database dependency passes locally and fails on the runner.

Both are source assertions by necessity: what CI installs and what services CI starts
are properties of the workflow file, not of anything importable here.
"""

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS = ROOT / "requirements-dev.txt"
WORKFLOW = ROOT / ".github/workflows/ci.yml"

# Imported by app/ or alembic/ at runtime. `.venv` having them is not enough: CI
# installs from requirements-dev.txt and nothing else.
RUNTIME_DEPENDENCIES = ["sqlalchemy", "alembic", "psycopg", "cryptography"]


def _requirements() -> list[str]:
    return [
        line.split("#", 1)[0].strip().lower()
        for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines()
        if line.split("#", 1)[0].strip()
    ]


@pytest.mark.parametrize("dependency", RUNTIME_DEPENDENCIES)
def test_every_runtime_dependency_is_declared(dependency):
    """SQLAlchemy and Alembic were in .venv but not here -- CI would have failed at
    import, not at the assertion that mattered."""
    declared = _requirements()
    assert any(re.match(rf"^{dependency}(\[|==|>=|~=|$)", d) for d in declared), (
        f"{dependency} is imported by the app but absent from requirements-dev.txt"
    )


def test_ci_backend_job_has_a_postgres_service():
    """Without it the DB tests cannot run on the runner, and a suite that cannot run
    is not a gate."""
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    services = workflow["jobs"]["backend"].get("services", {})
    assert "postgres" in services, "the backend job has no database"
    assert services["postgres"]["image"].startswith("postgres:16"), (
        "SPEC 8.1a specifies PostgreSQL 16; CI must not test against a different major"
    )


def test_ci_backend_job_points_the_suite_at_that_service():
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    env = workflow["jobs"]["backend"].get("env", {})
    assert "DATABASE_URL" in env and "MIGRATION_DATABASE_URL" in env


def test_env_example_documents_every_setting_the_backend_reads():
    from app.core.config import Settings

    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    for name in Settings.model_fields:
        assert re.search(rf"^{name}=", text, re.MULTILINE), f".env.example omits {name}"


def test_no_password_is_committed_anywhere_in_the_local_database_setup():
    """Local auth is `trust` precisely so this repo never carries a credential. A
    password appearing here is the regression this guards."""
    for path in ("docker-compose.yml", ".env.example", "infra/postgres/init/10-roles.sql"):
        text = (ROOT / path).read_text(encoding="utf-8").lower()
        assert "password" not in text, f"{path} introduces a credential; local auth is trust"
