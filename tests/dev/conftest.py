"""The environment-swapping app harness.

app/main.py reads settings.ENV **once, at import**, inside seam 2's discovery loop --
that is the mechanism §19.2 relies on, so the only faithful way to test it is to
re-import the module under a different environment.

The restore is the load-bearing half. `settings` is a module-level singleton and
`app.main` caches an app object built from it; a production-built app/main left in
sys.modules silently changes every test that imports it later in the same session,
including tests/invariants/test_03, which walks app.openapi(). The harness therefore
puts the original module objects back rather than reloading again, and
test_the_harness_restores_what_it_swapped asserts it.

**The rule for RELOADABLE**: the harness swaps ENV, so every module that binds
`settings` at import time (`from app.core.config import settings`) **and reads `.ENV`**
off it must be reloaded along with `app.core.config` -- otherwise that module's binding
is frozen to whichever environment happened to import it first, for the rest of the
process, and a test built on it becomes load-order-dependent rather than
env-dependent. `tests/dev/test_dev_router.py` carries a source-level gate that enforces
this for every module under app/.
"""

from __future__ import annotations

import importlib
import os
import sys
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

#: Order matters: config first, because every other entry imports `settings` from it by
#: value. app.core.db and app.core.encryption also bind `settings` at module scope, but
#: read DATABASE_URL / ENCRYPTION_KEYS -- fields this harness never swaps -- so they are
#: deliberately absent: reloading them would reset an lru_cache'd engine and decrypted
#: key material for nothing. tests/dev/test_dev_router.py names the same exclusion.
RELOADABLE = (
    "app.core.config",
    "app.core.dev_account",
    # M1.12 -- enforce_runtime_role branches on settings.ENV (production refuses, every
    # other environment warns), so its `settings` binding must not stay frozen to whichever
    # environment imported it first. Unlike app.core.db beside it, this module caches
    # nothing, so reloading it costs nothing either.
    "app.core.db_roles",
    # Task 12 -- studio_id_from_request now calls developer_may_act(..., env=settings.ENV)
    # for §19.6 restriction 1, so tenancy.py joins the modules whose `settings` binding
    # this harness must not leave frozen to whichever environment imported it first.
    "app.core.tenancy",
    "app.routers.health",
    # P1 (2026-08-27) -- the uPay return leg resolves the parent app's origin with
    # app_origin("parent", settings.ENV), so orders.py reads .ENV off a module-scope
    # `settings` binding like the entries above it.
    "app.services.billing.orders",
    # W2's contract session -- the OAuth callback's GET arm resolves the app it must send
    # the browser back to with app_origin(transaction.app, settings.ENV), so identity.py
    # now reads .ENV off a module-scope `settings` binding like the entries above it.
    # Freezing that binding would send a staging sign-in home to a development host.
    "app.routers.identity",
    # §19.4's sign-in route made the refresh cookie's `Secure` attribute environment
    # dependent -- Safari refuses a Secure cookie over the plain http:// that local
    # development is served on, so it is set everywhere EXCEPT development. That check
    # reads settings.ENV off a module-scope binding, which puts this module under the same
    # rule as the routers above it: leave the binding frozen and a staging test would
    # assert the development cookie.
    "app.services.identity.refresh",
    "app.routers.dev",
    # Ship-audit D3 -- seed_personas seeds the developer identity's platform_admin row
    # outside production only, so this module now reads .ENV off a module-scope
    # `settings` binding like the routers above it. Frozen, a production-env test would
    # seed a platform operator the environment says it must not.
    "app.services.demo.personas",
    # 5.4b (feature pass 2026-08-27) -- the onboarding link's URL and the landing URL are
    # both app_origin(..., settings.ENV) reads off a module-scope binding, same rule as
    # identity.py above: frozen, a staging regenerate would hand a manager a development
    # host to paste into WhatsApp.
    "app.routers.onboarding",
    "app.main",
    # Not part of app.main's import graph -- this harness never reaches it, and
    # tests/dev/test_demo_reset_worker.py monkeypatches settings.ENV on the live
    # singleton directly rather than through app_in_env. It is here anyway because
    # tests/dev/test_dev_router.py's gate is a source-level scan of all of app/, not
    # scoped to what app.main imports, and the rule it enforces ("every module that
    # binds settings at import time and reads .ENV off it must be reloadable") is
    # written that broadly on purpose -- see its own module docstring.
    "app.workers.demo_reset",
)


@contextmanager
def app_in_env(env: str) -> Iterator[FastAPI]:
    saved_modules = {name: sys.modules.get(name) for name in RELOADABLE}
    saved_env = os.environ.get("ENV")
    os.environ["ENV"] = env
    try:
        for name in RELOADABLE:
            sys.modules.pop(name, None)
        importlib.import_module("app.core.config")
        yield importlib.import_module("app.main").app
    finally:
        if saved_env is None:
            os.environ.pop("ENV", None)
        else:
            os.environ["ENV"] = saved_env
        for name, module in saved_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
            # `import app.main as x` resolves via getattr(sys.modules["app"], "main"),
            # not sys.modules["app.main"], whenever "app.main" is already cached -- so a
            # stale attribute on the parent package survives even once sys.modules is
            # put back. Restoring only the dict, as above, is not "the original module
            # object back": the parent package's attribute is part of that object's
            # identity too, and a caller doing `import app.main as after` would
            # otherwise silently receive whatever module import_module last attached to
            # the `app` package -- the swapped-in one, not the restored one.
            parent_name, _, child_name = name.rpartition(".")
            parent = sys.modules.get(parent_name)
            if parent is not None:
                if module is None:
                    parent.__dict__.pop(child_name, None)
                else:
                    setattr(parent, child_name, module)


@pytest.fixture
def production_client() -> Iterator[TestClient]:
    """The app as production builds it -- §19.6 restriction 2's whole mechanism.

    `app_in_env` reloads app.core.config and app.main with ENV pinned, which is what makes
    seam 2's discovery loop skip the `dev` module. A fixture rather than a helper call
    because more than one test needs to ask "does this path exist in production?", and the
    reload has to be undone either way.
    """
    with app_in_env("production") as app:
        yield TestClient(app)
