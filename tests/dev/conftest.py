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
"""

from __future__ import annotations

import importlib
import os
import sys
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import FastAPI

#: Order matters: config first, because app.main imports `settings` from it by value.
RELOADABLE = ("app.core.config", "app.main")


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
