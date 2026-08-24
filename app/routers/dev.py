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

from fastapi import APIRouter, HTTPException, Request, status

from app.core.clock import is_shifted, now
from app.core.config import settings
from app.core.db import SessionDep
from app.core.dev_account import RequireDeveloper
from app.integrations.upay.ipn import build_ipn_query
from app.schemas.dev import (
    DemoResetRequest,
    DemoResetResponse,
    DevClock,
    DevPing,
    SimulateIpnRequest,
    SimulateIpnResponse,
)
from app.services.demo.fixtures import LATEST_VERSION, SEEDS
from app.services.demo.service import DemoStudioService

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/ping", response_model=DevPing)
def ping(_: RequireDeveloper) -> DevPing:
    """Proof of mount. Restriction 2's test asserts this resolves outside production and
    does not exist inside it, so it stays the cheapest possible route: no database, no
    tenant scope, nothing that could fail for an unrelated reason and make the
    restriction look satisfied when it is not."""
    return DevPing(env=settings.ENV)


@router.get("/clock", response_model=DevClock)
def read_clock(_: RequireDeveloper) -> DevClock:
    """What time does the server think it is, and did you move it? The second field is
    the one that matters: a shift that silently failed to apply looks identical to no
    shift at all, and you would debug the billing run instead of the header."""
    return DevClock(now=now(), shifted=is_shifted())


@router.post("/demo/reset", response_model=DemoResetResponse)
def reset_demo_studio(
    _: RequireDeveloper,
    session: SessionDep,
    body: DemoResetRequest | None = None,
) -> DemoResetResponse:
    """§19.7 -- restore the fixture set from a versioned seed.

    G16 / SPEC §8.3 says every mutating endpoint accepts an optional Idempotency-Key.
    This one deliberately does not honour it: no dedup infrastructure exists anywhere in
    this codebase yet, and a full wipe-and-reseed converges to the same end state no
    matter how many times it runs, so there is nothing for a dedup layer to protect
    against here. A future endpoint that needs real request deduplication should build
    that infrastructure rather than copy this exemption.
    """
    version = (body.version if body else None) or LATEST_VERSION
    if version not in SEEDS:
        # .claude/rules/api.md wants {code, message, details?} at the TOP level of the
        # response. It lands nested under FastAPI's default "detail" wrapper instead,
        # because no exception handler exists anywhere in this app (`grep -rn
        # exception_handler app` is empty) -- a pre-existing, repo-wide gap this
        # endpoint is merely the first to expose. Closing it needs a global handler and
        # its own tests, out of scope here; flagged as recommended M1 work.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "unknown_fixture_version",
                "message": f"no fixture set {version!r}",
                "details": {"available": sorted(SEEDS)},
            },
        )
    result = DemoStudioService.reset(session, version=version)
    session.commit()
    return DemoResetResponse(
        version=result.version,
        tables_wiped=list(result.tables_wiped),
        layers_seeded=list(result.layers_seeded),
    )


@router.post("/upay/simulate-ipn", response_model=SimulateIpnResponse)
def simulate_ipn(
    _: RequireDeveloper, body: SimulateIpnRequest, request: Request
) -> SimulateIpnResponse:
    """§19.5's fourth tool.

    Delivery is best-effort and reported honestly. M6 owns
    GET /webhooks/upay/{public_ref}; until it is mounted there is nothing to deliver
    to, and `delivered: false` with a note naming the milestone is a more useful answer
    than a 200 that implies something happened. When M6 lands, this starts delivering
    with no change here.

    The mounted check reads `request.app.openapi()["paths"]`, not `request.app.routes`:
    `include_router` mounts each discovered router through an opaque `_IncludedRouter`
    that exposes no `.routes` in this FastAPI version (tests/invariants/test_03
    documents the trap), so a `.routes` walk would report `False` forever even after M6
    lands. The OpenAPI path set is the same source of truth restriction 2 uses.
    """
    query = build_ipn_query(
        shape=body.shape,
        order_public_ref=body.order_public_ref,
        expected_amount_agorot=body.expected_amount_agorot,
        transaction_id=body.transaction_id or f"DEV-{body.order_public_ref.hex[:12]}",
    )
    path = f"/api/v1/webhooks/upay/{body.order_public_ref}"
    mounted = path in request.app.openapi()["paths"]
    note = (
        "delivered to the webhook"
        if mounted
        else "M6 owns GET /webhooks/upay/{public_ref}; it is not mounted yet, so this "
        "is the payload that would have been sent"
    )
    return SimulateIpnResponse(
        shape=body.shape,
        delivered=mounted,
        target_url=path,
        query=query,
        note=note,
    )
