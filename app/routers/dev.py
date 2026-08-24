"""SPEC §19 -- the developer account's endpoints.

**This module's existence is the mechanism.** app/main.py's discovery loop skips a
module named `dev` when settings.ENV == "production" (seam 2, M0.2, app/main.py:31), so
in production these routes are never registered: they 404 the way any unclaimed path
does, rather than 403-ing from an `if` a later edit could invert. tests/restrictions/
test_02 asserts the OpenAPI path set, not the status code, because a status code proves
much less.

Nothing outside this module and app/services/demo may import from here. If a service
needs something in this file, the thing is in the wrong file.

Routes resolve under /api/v1/dev/... : main.py mounts every discovered router beneath
/api/v1 (G5). SPEC §7 writes the short form.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.core.dev_account import RequireDeveloper
from app.schemas.dev import DevPing

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/ping", response_model=DevPing)
def ping(_: RequireDeveloper) -> DevPing:
    """Proof of mount. Restriction 2's test asserts this resolves outside production and
    does not exist inside it, so it stays the cheapest possible route: no database, no
    tenant scope, nothing that could fail for an unrelated reason and make the
    restriction look satisfied when it is not."""
    return DevPing(env=settings.ENV)
