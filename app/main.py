"""Router mounting by discovery. Seam 2 -- never edited to register a router.

A lane adds app/routers/attendance.py and it mounts under /api/v1/. No shared
file changes, so two lanes never conflict here.

Note the `routers_pkg` alias: binding `app = FastAPI(...)` shadows the `app`
package, so `app.routers.__path__` would resolve against the FastAPI instance
rather than the package and discovery would silently find nothing.
"""

import importlib
import pkgutil

from fastapi import APIRouter, FastAPI

from app import routers as routers_pkg
from app.core.config import settings

app = FastAPI(title="Studio Manager API", version="0.1.0")

v1 = APIRouter(prefix="/api/v1")
for _module in pkgutil.iter_modules(routers_pkg.__path__):
    if _module.name.startswith("_"):
        continue
    # §19.6 -- the dev router does not exist in production, not merely guarded.
    if _module.name == "dev" and settings.ENV == "production":
        continue
    v1.include_router(importlib.import_module(f"{routers_pkg.__name__}.{_module.name}").router)

app.include_router(v1)
