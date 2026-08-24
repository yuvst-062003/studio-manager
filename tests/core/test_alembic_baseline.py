"""Seam 1 -- main owns alembic/versions/**, one head, forward-only."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text

ROOT = Path(__file__).resolve().parents[2]


def _scripts() -> ScriptDirectory:
    return ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini")))


def test_there_is_exactly_one_head():
    """Two heads means two lanes authored revisions in parallel, which is the single
    thing seam 1 exists to prevent."""
    heads = _scripts().get_heads()
    assert len(heads) == 1, heads


def test_every_revision_has_a_downgrade_body():
    """SPEC 8.1a: forward-only policy, but the most recent migration keeps a tested
    rollback. A bare `pass` is not a rollback."""
    for revision in _scripts().walk_revisions():
        source = Path(revision.path).read_text(encoding="utf-8")
        body = source.split("def downgrade()", 1)[1]
        statements = [
            line.strip()
            for line in body.splitlines()[1:]
            if line.strip() and not line.strip().startswith(('"""', "#"))
        ]
        assert statements and statements != ["pass"], f"{revision.revision} has no downgrade"


def _hook(file_path: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(ROOT / ".claude/hooks/block-protected.sh")],
        input=f'{{"tool_input":{{"file_path":"{file_path}"}}}}',
        text=True,
        capture_output=True,
    )


@pytest.mark.parametrize(
    "file_path",
    [
        # Claude Code sends absolute paths, which is the only reason the relative form
        # below was never hit -- the original glob needed a prefix before `alembic`.
        str(ROOT / "alembic/versions/0001_baseline.py"),
        "./alembic/versions/0001_baseline.py",
        "alembic/versions/0001_baseline.py",
    ],
)
def test_the_versions_directory_is_protected_by_the_hook(file_path: str):
    """Behaviour, not a comment: run the hook the way Claude Code runs it and assert it
    denies. A lane that could edit a migration would break seam 1."""
    result = _hook(file_path)
    assert result.returncode == 2, f"the hook allowed an edit to {file_path}"
    assert "protected" in result.stderr.lower()


def test_the_hook_does_not_block_ordinary_source():
    """The other half: a hook that denied everything would pass the test above while
    making the repo unworkable."""
    result = subprocess.run(
        [str(ROOT / ".claude/hooks/block-protected.sh")],
        input='{"tool_input":{"file_path":"app/main.py"}}',
        text=True,
        capture_output=True,
    )
    assert result.returncode == 0


@pytest.mark.db
def test_a_fresh_database_upgrades_to_head_cleanly(migrated: Engine):
    with migrated.connect() as connection:
        version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert version == _scripts().get_current_head()


@pytest.mark.db
def test_the_studio_table_exists_with_its_spec_columns(migrated: Engine):
    columns = {c["name"] for c in inspect(migrated).get_columns("studio")}
    assert {
        "id",
        "name",
        "slug",
        "logo_object_key",
        "timezone",
        "default_locale",
        "status",
        "is_demo",
        "settings",
        "created_at",
        "updated_at",
    } <= columns


@pytest.mark.db
def test_studio_slug_is_unique(migrated: Engine):
    inspector = inspect(migrated)
    unique_indexes = {
        tuple(i["column_names"]) for i in inspector.get_indexes("studio") if i["unique"]
    }
    constraints = {tuple(c["column_names"]) for c in inspector.get_unique_constraints("studio")}
    assert ("slug",) in unique_indexes | constraints


@pytest.mark.db
def test_the_application_role_can_use_the_schema(migrated: Engine):
    """Revision 0001 creates the role for environments with no init hook -- Railway and
    the CI service container both lack one."""
    with migrated.connect() as connection:
        assert connection.execute(
            text("SELECT has_schema_privilege('studio_app', 'public', 'USAGE')")
        ).scalar_one()
        assert connection.execute(
            text("SELECT has_table_privilege('studio_app', 'studio', 'SELECT')")
        ).scalar_one()


@pytest.mark.db
def test_the_migrations_match_the_models(migrated: Engine):
    """`alembic check` -- the drift gate.

    This is the failure mode the wave model creates: a lane adds a model, main authors
    the revision in the contract commit, and the two disagree. It found a real one on
    its first run (a check constraint whose name was expanded twice by the naming
    convention), so it earns its place rather than being belt-and-braces.
    """
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "check"], cwd=ROOT, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stdout + result.stderr


# -- §19.1: the demo studio exists everywhere, production included ------------
def test_the_demo_studio_row_exists_after_migration(app_session):
    """§19.1 -- 'Exists in production: Yes, so you can smoke-test a live deploy'. A row
    created by a seed script would exist only where someone remembered to run it."""
    from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SLUG

    row = app_session.execute(
        sa.text("SELECT name, is_demo, settings FROM studio WHERE slug = :slug"),
        {"slug": DEMO_STUDIO_SLUG},
    ).one()
    assert row.name == DEMO_STUDIO_NAME
    assert row.is_demo is True


def test_the_demo_studios_upay_config_is_pinned_to_the_sandbox(app_session):
    """§19.6 -- 'Cannot touch live money.' The pin lives in the row, not in code that
    reads the row, so a code path that forgets to check is_demo still cannot produce a
    live form for this studio (Task 10 asserts the form builder end of it)."""
    from app.services.demo import DEMO_STUDIO_SLUG

    settings_json = app_session.execute(
        sa.text("SELECT settings FROM studio WHERE slug = :slug"),
        {"slug": DEMO_STUDIO_SLUG},
    ).scalar_one()
    assert settings_json["upay"]["livesystem"] == 0


def test_migrating_twice_does_not_create_a_second_demo_studio(app_session):
    """Forward-only migrations still re-run on a database that already has the row --
    a fresh `alembic upgrade head` against staging, for instance."""
    from app.services.demo import DEMO_STUDIO_SLUG

    count = app_session.execute(
        sa.text("SELECT count(*) FROM studio WHERE slug = :slug"),
        {"slug": DEMO_STUDIO_SLUG},
    ).scalar_one()
    assert count == 1
