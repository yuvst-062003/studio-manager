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
    assert services["postgres"]["image"].startswith("postgres:18"), (
        "SPEC 8.1a specifies PostgreSQL 18, which is what Railway provisions. Testing\n"
        "against a different major is how a difference reaches production untested."
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


#: A key whose name contains `password` assigned a NON-EMPTY value -- in either the
#: `KEY=value` form `.env.example` uses or the `key: value` form docker-compose does.
#:
#: **Only `.env.example` is judged by this.** `docker-compose.yml` keeps the original,
#: stricter rule below -- the bare word, anywhere -- because local auth is `trust` and
#: that file has no legitimate reason to say `password` at all. Relaxing a guard
#: everywhere to resolve a conflict in one place is how a guard stops guarding.
#:
#: The conflict is real and had to be settled somewhere. `SMTP_PASSWORD` MUST appear in
#: `.env.example`, because tests/identity/test_settings.py asserts every field of
#: `Settings` has a line there -- rightly, since a setting nobody documents is a setting
#: nobody sets. So for that one file the rule now says what it always meant: an EMPTY
#: `SMTP_PASSWORD=` carries no credential, it is the documentation that one exists and
#: belongs in the deployment's secrets. A FILLED one is exactly the regression, and is
#: still caught -- see the paired test below.
#: `[ \t]` and never `\s` around the separator. `\s` matches a NEWLINE, so an empty
#: `SMTP_PASSWORD=` followed by a blank line and a comment matched `\s*\S+` across three
#: lines and reported the `#` as the committed secret. Found by this file's own paired
#: test, which is the entire reason it exists.
_ASSIGNED_CREDENTIAL = re.compile(
    r"^[ \t]*-?[ \t]*[^\s#]*password[^\s:=]*[ \t]*[:=][ \t]*\S", re.IGNORECASE | re.MULTILINE
)


def test_no_password_is_committed_anywhere_in_the_local_database_setup():
    """Local auth is `trust` precisely so this repo never carries a credential."""
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8").lower()
    assert "password" not in compose, (
        "docker-compose.yml introduces a credential; local auth is trust"
    )

    template = (ROOT / ".env.example").read_text(encoding="utf-8")
    found = _ASSIGNED_CREDENTIAL.findall(template)
    assert not found, f".env.example commits a credential value: {found}"


def test_the_credential_detector_still_fires():
    """A detector that finds nothing proves nothing, and this one was deliberately
    narrowed -- which is exactly when that risk is highest.

    Both separator styles and both directions: the shapes that must be caught, and the
    empty-key shape that must not. Without the last two cases somebody hitting a failure
    here would 'fix' it by deleting the first three.
    """
    assert _ASSIGNED_CREDENTIAL.search("SMTP_PASSWORD=hunter2")
    assert _ASSIGNED_CREDENTIAL.search("  POSTGRES_PASSWORD: swordfish"), "indented YAML too"
    assert _ASSIGNED_CREDENTIAL.search("      - PGPASSWORD=swordfish"), "a YAML list item too"
    assert _ASSIGNED_CREDENTIAL.search("password=x")
    assert not _ASSIGNED_CREDENTIAL.search("SMTP_PASSWORD=")
    assert not _ASSIGNED_CREDENTIAL.search("# use an app password here")
    # The shape that actually broke it: an empty key, then a blank line, then a comment.
    # `\s` around the separator matched across all three and called the `#` a secret.
    assert not _ASSIGNED_CREDENTIAL.search("SMTP_PASSWORD=\n\n# a following comment")


def test_no_test_builds_an_executable_path_out_of_venv():
    """G1 mandates the venv prefix for commands a *developer* types. A test that builds
    that path and executes it is a different thing, and it is wrong: CI installs into the
    system Python and has no virtualenv at all, so the hardcoded path passed locally and
    failed on the runner with 27 errors.

    Use `sys.executable -m <module>`, which works in both and additionally guarantees the
    subprocess runs under the same interpreter as the test.

    The pattern is assembled from parts so this file does not match itself, and matched
    narrowly on the path construction that actually executes. The allowlist strings in
    test_repo_config.py describe a developer command and are left alone.
    """
    needle = 'ROOT / "' + ".venv/bin/"
    offenders = [
        f"{path.relative_to(ROOT)}:{number}"
        for path in sorted((ROOT / "tests").rglob("*.py"))
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if needle in line
    ]
    assert offenders == [], offenders
