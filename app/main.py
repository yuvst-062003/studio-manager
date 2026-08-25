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
from fastapi.middleware.cors import CORSMiddleware

from app import routers as routers_pkg
from app.core.auth_context import AuthContextMiddleware
from app.core.clock import X_DEV_NOW_HEADER, DevClockMiddleware
from app.core.config import settings
from app.core.cors import allowed_origins
from app.core.dev_account import DEV_TOKEN_HEADER
from app.core.logging import configure_logging

# SPEC 11.7 -- structured JSON logs with the scrubbing filter installed before
# anything can log. Not a registration: seam 2's discovery loop is untouched.
configure_logging()

app = FastAPI(title="Studio Manager API", version="0.1.0")

# §19.5 -- X-Dev-Now shifts the clock for one request, and only where the router that
# documents it exists. Not a registration: seam 2's discovery loop below is untouched,
# exactly as configure_logging() above is not one.
if settings.ENV != "production":
    app.add_middleware(DevClockMiddleware)

# Holdback 2 -- request.state.is_developer / studio_is_demo from the verified JWT, which
# app/core/tenancy.py::studio_id_from_request has expected since M0.2. Not a registration:
# seam 2's discovery loop below is untouched, exactly as configure_logging() above and
# DevClockMiddleware are not registrations.
#
# Added AFTER DevClockMiddleware, so it runs BEFORE it (Starlette runs the last-added
# outermost). That order is deliberate but not load-bearing: neither reads what the other
# writes. It is stated so a later reader does not have to re-derive that it is safe.
app.add_middleware(AuthContextMiddleware)

# The refresh cookie is cross-ORIGIN in every environment -- the api and the three PWAs
# are separate services on purpose (infra/railway/README.md § Why four services). So
# allow_credentials is not optional, and the fetch spec forbids pairing it with a wildcard
# origin. app/core/cors.py carries the full reasoning and reads every host from
# domains.json, so HB-domain's swap stays a one-file change.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(settings.ENV),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        X_DEV_NOW_HEADER,
        DEV_TOKEN_HEADER,
    ],
    # §19.4 -- the dev bar reads the active persona off the response, and a header a
    # cross-origin client cannot read is a header it does not have.
    expose_headers=["X-Acting-As"],
)

v1 = APIRouter(prefix="/api/v1")
for _module in pkgutil.iter_modules(routers_pkg.__path__):
    if _module.name.startswith("_"):
        continue
    # §19.6 -- the dev router does not exist in production, not merely guarded.
    if _module.name == "dev" and settings.ENV == "production":
        continue
    v1.include_router(importlib.import_module(f"{routers_pkg.__name__}.{_module.name}").router)

app.include_router(v1)
