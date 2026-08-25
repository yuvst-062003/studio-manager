"""The harness itself, and the router's shape."""

from __future__ import annotations

import re
from pathlib import Path

from app.core.dev_account import dev_tools_allowed
from app.services.demo import DEMO_STUDIO_NAME
from app.services.demo.fixtures import LATEST_VERSION
from app.services.demo.service import DemoStudioService
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session
from tests.dev.conftest import RELOADABLE, app_in_env


def test_the_harness_restores_what_it_swapped():
    """The failure this guards: a production app/main left in sys.modules turns every
    later test in the session into a test of a different application."""
    import app.main as before

    with app_in_env("production"):
        pass

    import app.main as after

    assert after is before
    assert TestClient(after.app).get("/api/v1/health").status_code == 200


def test_ping_reports_the_environment_it_was_built_in():
    with app_in_env("development") as application:
        body = TestClient(application).get("/api/v1/dev/ping").json()
    assert body["env"] == "development"


# -- who may call /dev/* at all (the truth table) -----------------------------
def test_a_developer_identity_is_allowed():
    assert dev_tools_allowed(
        env="staging", is_developer=True, presented_token=None, configured_token=None
    )


def test_localhost_with_no_token_configured_is_allowed():
    """Development is a machine with no auth layer yet. Documented rather than implied."""
    assert dev_tools_allowed(
        env="development", is_developer=False, presented_token=None, configured_token=None
    )


def test_staging_with_no_token_configured_is_refused():
    """Staging is a public HTTPS origin (§15 item 3). An unauthenticated
    POST /dev/demo/reset there is a stranger wiping your test data; an unauthenticated
    POST /dev/upay/simulate-ipn is a stranger inventing payments. Closed by default."""
    assert not dev_tools_allowed(
        env="staging", is_developer=False, presented_token=None, configured_token=None
    )


def test_a_matching_token_is_allowed_and_a_wrong_one_is_not():
    assert dev_tools_allowed(
        env="staging", is_developer=False, presented_token="s3cret", configured_token="s3cret"
    )
    assert not dev_tools_allowed(
        env="staging", is_developer=False, presented_token="wrong", configured_token="s3cret"
    )


def test_production_is_refused_on_every_input():
    """Defence in depth. The router is not mounted in production at all, so this branch
    is unreachable through HTTP -- which is exactly why it must be asserted directly."""
    for is_developer in (True, False):
        for token in (None, "s3cret"):
            assert not dev_tools_allowed(
                env="production",
                is_developer=is_developer,
                presented_token=token,
                configured_token="s3cret",
            )


# -- the recurrence gate: every settings.ENV binder must be in RELOADABLE -----------
APP_ROOT = Path(__file__).resolve().parents[2] / "app"

# A function-local import (app.core.logging's) re-reads app.core.config.settings fresh
# on every call and is never frozen, so only a column-0 import counts.
_MODULE_SCOPE_IMPORT = re.compile(r"^from app\.core\.config import\b.*\bsettings\b", re.MULTILINE)
_READS_ENV = re.compile(r"\bsettings\.ENV\b")

#: Modules that bind `settings` at module scope but read a field this harness never
#: swaps, so `_binds_settings_and_reads_env` correctly never flags them and they need
#: no entry in RELOADABLE. This is NOT the only reason a module gets special handling
#: in this apparatus -- see `modules_that_must_be_reloadable`'s docstring, which names
#: the other one (`app.workers.demo_reset`, which the detector DOES flag and which
#: DOES sit in RELOADABLE, for an unrelated reason).
DELIBERATELY_EXCLUDED = frozenset({"app.core.db", "app.core.encryption"})


def _binds_settings_and_reads_env(source: str) -> bool:
    """Both conditions are necessary. Binding `settings` at module scope is not itself
    the problem -- app.core.db and app.core.encryption do that too -- reading `.ENV` off
    a binding that the harness may have frozen to a stale environment is."""
    return bool(_MODULE_SCOPE_IMPORT.search(source) and _READS_ENV.search(source))


def _module_name(path: Path) -> str:
    parts = list(path.resolve().relative_to(APP_ROOT.parent).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def modules_that_must_be_reloadable() -> list[str]:
    """Source-level by necessity: the failure this guards -- a module's `settings`
    binding silently frozen to whichever environment first imported it -- was invisible
    at runtime. Task 1 review round 1 found it only because two different processes
    disagreed about whether a bare staging call returned 200 or 403, purely depending on
    which test happened to import `app.core.dev_account` / `app.routers.health` first.
    Scanning app/'s source is the only way to catch the *next* module Tasks 2-12 add
    with the same shape before it repeats the bug rather than after.

    Two kinds of module get special-cased here, for two unrelated reasons -- naming
    both, because a criterion that only describes one of them is a rule a future editor
    can misapply to the other:

    * DELIBERATELY_EXCLUDED, above -- `app.core.db` (reads DATABASE_URL) and
      `app.core.encryption` (reads ENCRYPTION_KEYS / ENCRYPTION_ACTIVE_KEY_VERSION).
      Both bind `settings` at module scope, like every module this detector flags, but
      neither reads `.ENV` -- the field this harness swaps -- so this detector never
      flags them and they carry no entry in RELOADABLE. Reloading them would only reset
      an lru_cache'd engine and decrypted key material for nothing.
    * `app.workers.demo_reset` -- the opposite situation. It DOES read `.ENV` and IS
      flagged by this detector, and it DOES carry an entry in RELOADABLE (see
      tests/dev/conftest.py). It needs a mention here anyway because it is not reached
      through `app.main`'s import graph the way every other RELOADABLE entry is --
      tests/dev/test_demo_reset_worker.py exercises it by monkeypatching
      `settings.ENV` on the live singleton directly, never through `app_in_env` -- and
      it is still in scope for this file's scan because that scan walks every module
      under app/, not just what app.main imports. It is not a member of
      DELIBERATELY_EXCLUDED and "reads a different field" does not describe it; its own
      reason lives as an inline comment on its RELOADABLE entry in
      tests/dev/conftest.py.
    """
    return sorted(
        _module_name(path)
        for path in APP_ROOT.rglob("*.py")
        if _binds_settings_and_reads_env(path.read_text(encoding="utf-8"))
    )


def test_every_module_that_reads_settings_env_is_reloadable():
    missing = [
        name
        for name in modules_that_must_be_reloadable()
        if name not in RELOADABLE and name not in DELIBERATELY_EXCLUDED
    ]
    assert missing == [], (
        f"{missing} bind settings.ENV at import time but tests/dev/conftest.py's "
        "RELOADABLE tuple does not reload them along with app.core.config -- see its "
        "module docstring for the rule."
    )


def test_the_gate_currently_finds_exactly_what_reloadable_already_covers():
    """Guards against the detector silently degenerating to an always-empty list, which
    would pass this file's real assertion for the wrong reason -- the same failure mode
    that let the original bug through review undetected."""
    assert modules_that_must_be_reloadable() == sorted(set(RELOADABLE) - {"app.core.config"})


# -- the detector is proven to fire --------------------------------------------------
def test_the_detector_flags_a_module_scope_import_that_reads_env():
    source = "from app.core.config import settings\n\n\ndef f() -> str:\n    return settings.ENV\n"
    assert _binds_settings_and_reads_env(source)


def test_the_detector_leaves_alone_a_module_that_reads_a_different_field():
    """app.core.db and app.core.encryption in miniature: importing `settings` is not
    itself the problem, reading `.ENV` from a binding the harness may have frozen is."""
    source = (
        "from app.core.config import settings\n\n\ndef f() -> str:\n"
        "    return settings.DATABASE_URL\n"
    )
    assert not _binds_settings_and_reads_env(source)


def test_the_detector_ignores_a_function_local_import():
    """app.core.logging in miniature: a function-local import re-reads the current
    app.core.config.settings on every call, so it is never frozen and does not need to
    be in RELOADABLE."""
    source = (
        "def f() -> str:\n    from app.core.config import settings\n\n    return settings.ENV\n"
    )
    assert not _binds_settings_and_reads_env(source)


# -- POST /dev/demo/reset -----------------------------------------------------
def test_reset_returns_the_version_it_restored(migrated):
    with app_in_env("development") as application:
        body = TestClient(application).post("/api/v1/dev/demo/reset").json()
    assert body["version"] == LATEST_VERSION
    assert "studio" in body["layers_seeded"]


def test_reset_accepts_an_explicit_version(migrated):
    with app_in_env("development") as application:
        response = TestClient(application).post(
            "/api/v1/dev/demo/reset", json={"version": LATEST_VERSION}
        )
    assert response.status_code == 200


def test_reset_rejects_an_unknown_version_with_a_422_not_a_500(migrated):
    """An unknown version is a caller mistake, not a server fault. A 500 here would
    also mean a stack trace in the response, which .claude/rules/api.md forbids."""
    with app_in_env("development") as application:
        response = TestClient(application).post(
            "/api/v1/dev/demo/reset", json={"version": "1999-01-01.0"}
        )
    assert response.status_code == 422


def test_reset_does_not_exist_in_production(migrated):
    with app_in_env("production") as application:
        assert TestClient(application).post("/api/v1/dev/demo/reset").status_code == 404


def test_reset_persists_the_wipe_and_reseed(migrated):
    """The route must commit -- DemoStudioService.reset() itself does not (task 6's own
    tests commit explicitly), and the response body is built from in-process results
    regardless of whether the transaction ever landed. Only a read through a second,
    independent connection proves the reset actually persisted rather than merely
    reporting success."""
    with Session(migrated) as probe:
        studio_id = DemoStudioService.studio_id(probe)
        probe.execute(text("UPDATE studio SET name = 'wrecked' WHERE id = :id"), {"id": studio_id})
        probe.commit()

    with app_in_env("development") as application:
        response = TestClient(application).post("/api/v1/dev/demo/reset")
    assert response.status_code == 200

    with Session(migrated) as probe:
        name = probe.execute(
            text("SELECT name FROM studio WHERE id = :id"), {"id": studio_id}
        ).scalar_one()
    assert name == DEMO_STUDIO_NAME
