"""M1.12 / HB-staging-superuser — is the app actually connecting as the runtime role?

SPEC §11.2 makes `audit_log` append-only **by grant**: the application role holds INSERT
and SELECT and nothing else. Revision 0001 creates `studio_app` and 0002 revokes UPDATE
and DELETE from it, and tests/core/test_audit_append_only.py has asserted that grant since
M0.2.

None of that is worth anything if the API connects as a superuser instead. Railway's
managed Postgres hands out one role, so staging pointed both DSNs at it — the grant was
correct and unused, which is the most dangerous shape a security control can take: it
passes every test and protects nothing.

This module is the measurement that closes the gap. It asks the live connection what it
actually is, rather than asking the migration what it intended.
"""

from __future__ import annotations

import pytest
from app.core.config import settings
from app.core.db_roles import (
    RuntimeRoleNotEnforcedError,
    describe_runtime_role,
    enforce_runtime_role,
)
from sqlalchemy import create_engine, text


@pytest.fixture
def app_engine(migrated):
    engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 5})
    yield engine
    engine.dispose()


@pytest.fixture
def migrator_engine(migrated):
    return migrated


# -- the measurement ----------------------------------------------------------
def test_it_reports_the_role_the_connection_actually_holds(app_engine) -> None:
    report = describe_runtime_role(app_engine)
    assert report.connected_as == settings.APP_DB_ROLE


def test_the_runtime_role_cannot_update_or_delete_audit_log(app_engine) -> None:
    report = describe_runtime_role(app_engine)
    assert report.can_update_audit_log is False
    assert report.can_delete_audit_log is False
    assert report.enforced is True


def test_it_can_still_insert_and_select(app_engine) -> None:
    """Append-only, not read-only. §11.2 needs both halves or the app cannot audit."""
    report = describe_runtime_role(app_engine)
    assert report.can_insert_audit_log is True
    assert report.can_select_audit_log is True


def test_the_schema_owner_is_reported_as_not_enforced(migrator_engine) -> None:
    """The staging shape, reproduced. `studio_migrator` owns the table, so it can UPDATE
    it — which is exactly why the app must not connect as it."""
    report = describe_runtime_role(migrator_engine)
    assert report.enforced is False
    assert report.can_update_audit_log is True


def test_a_report_that_is_not_enforced_names_what_to_do(migrator_engine) -> None:
    report = describe_runtime_role(migrator_engine)
    assert "studio_app" in report.explain()
    assert "DATABASE_URL" in report.explain()


# -- what happens when it is not enforced -------------------------------------
def test_production_refuses_to_serve_on_an_unenforced_role(migrator_engine, monkeypatch) -> None:
    """Fail closed, in the one environment where a silent superuser is unrecoverable.

    A deploy that refuses is visible in thirty seconds. A deploy that quietly runs the
    whole product as a superuser is visible when someone edits an audit entry, which is
    the moment the audit log stops being evidence.
    """
    monkeypatch.setattr(settings, "ENV", "production")
    with pytest.raises(RuntimeRoleNotEnforcedError, match="studio_app"):
        enforce_runtime_role(migrator_engine)


def test_staging_warns_rather_than_refusing(migrator_engine, monkeypatch, caplog) -> None:
    """HB-staging-superuser is open TODAY. Refusing here would take staging down for a
    condition that is currently true, and a gate that has to be disabled to deploy is a
    gate that gets deleted."""
    monkeypatch.setattr(settings, "ENV", "staging")
    with caplog.at_level("WARNING"):
        enforce_runtime_role(migrator_engine)
    assert any("studio_app" in record.getMessage() for record in caplog.records)


def test_an_enforced_role_passes_in_every_environment(app_engine, monkeypatch) -> None:
    for env in ("development", "staging", "production", "test"):
        monkeypatch.setattr(settings, "ENV", env)
        enforce_runtime_role(app_engine)


def test_an_unreachable_database_never_takes_the_process_down(monkeypatch) -> None:
    """This check must not become a new way for a database blip to fail a boot. It
    answers a question about grants; when it cannot ask, it says so and stands aside."""
    monkeypatch.setattr(settings, "ENV", "production")
    dead = create_engine(
        "postgresql+psycopg://nobody@127.0.0.1:1/nothing", connect_args={"connect_timeout": 1}
    )
    enforce_runtime_role(dead)


def test_the_check_reads_the_live_connection_and_not_the_settings(app_engine) -> None:
    """A check that trusted APP_DB_ROLE would report whatever the config claimed, which is
    precisely the thing that was wrong on staging."""
    with app_engine.connect() as connection:
        live = connection.execute(text("SELECT current_user")).scalar_one()
    assert describe_runtime_role(app_engine).connected_as == live


# -- where it runs ------------------------------------------------------------
def test_the_check_runs_on_boot_and_not_on_import() -> None:
    """app/core/db.py is lazy on purpose: importing it must not open a connection, or
    `pytest --collect-only` and scripts/export_openapi.py would both need a database.

    So this lives in a lifespan hook. Asserted structurally rather than by observing a
    connection, because the failure mode is a module-scope call someone adds later.
    """
    import inspect

    import app.main as main

    source = inspect.getsource(main)
    assert "lifespan" in source
    body = source[source.index("async def lifespan") :]
    call = body.index("enforce_runtime_role(get_engine())")
    # The call is inside the lifespan function, i.e. after its `def`.
    assert call > 0
    # ...and it appears exactly once in the module, so there is no module-scope twin.
    assert source.count("enforce_runtime_role(get_engine())") == 1
