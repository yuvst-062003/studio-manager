"""§19.6 restriction 1: 'Cannot act inside a non-demo studio in production. Not "is
discouraged from" -- the studio resolver excludes is_demo = false for developer sessions
in production, and a test asserts it.'

NOT VACUOUS. The rule is a function of three booleans and all eight rows are asserted
below, and the resolver calls it today. What is absent is only the INPUT: M1 sets
request.state.is_developer and request.state.studio_is_demo from the verified JWT and
the resolved studio. Until then every request presents (False, False) and the rule
correctly allows it -- which is why the resolver test drives request.state directly.

Deviation from the brief: the probe route's dependency is declared as
``Annotated[uuid.UUID, Depends(...)]`` rather than the bare ``= Depends(...)`` default
the brief's exact code used -- ruff's B008 (enabled here) flags a function call in an
argument default, and this repo has no other bare-default `Depends` to match; every
other dependency in app/ already uses the Annotated form (see
app.core.tenancy.get_tenant_session). Behaviourally identical.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Annotated

import pytest
from app.core.dev_account import developer_may_act
from app.core.tenancy import studio_id_from_request
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

STUDIO = uuid.uuid4()


# -- the rule, in full --------------------------------------------------------
@pytest.mark.parametrize("env", ["development", "staging", "test", "production"])
@pytest.mark.parametrize("studio_is_demo", [True, False])
def test_a_non_developer_is_never_affected(env, studio_is_demo):
    """The rule is about developer sessions. A real manager in a real studio in
    production is the product working."""
    assert developer_may_act(is_developer=False, studio_is_demo=studio_is_demo, env=env)


@pytest.mark.parametrize("env", ["development", "staging", "test"])
@pytest.mark.parametrize("studio_is_demo", [True, False])
def test_outside_production_a_developer_may_act_anywhere(env, studio_is_demo):
    """§19.1 -- the role switcher is available 'across any studio in that environment'
    in dev and staging."""
    assert developer_may_act(is_developer=True, studio_is_demo=studio_is_demo, env=env)


def test_in_production_a_developer_may_act_only_in_a_demo_studio():
    assert developer_may_act(is_developer=True, studio_is_demo=True, env="production")
    assert not developer_may_act(is_developer=True, studio_is_demo=False, env="production")


# -- the resolver enforces it -------------------------------------------------
def _probe_app(*, is_developer: bool, studio_is_demo: bool) -> FastAPI:
    """A minimal app whose middleware presents the state M1 will present. Driving
    request.state directly is the only honest way to test this before an auth layer
    exists -- and it tests the resolver, which is what §19.6 names."""
    probe = FastAPI()

    @probe.middleware("http")
    async def _state(request: Request, call_next):
        request.state.studio_id = STUDIO
        request.state.is_developer = is_developer
        request.state.studio_is_demo = studio_is_demo
        return await call_next(request)

    @probe.get("/probe")
    def read(studio_id: Annotated[uuid.UUID, Depends(studio_id_from_request)]) -> dict[str, str]:
        return {"studio_id": str(studio_id)}

    return probe


def test_the_resolver_refuses_a_developer_in_a_real_studio_in_production(monkeypatch):
    from app.core import tenancy

    monkeypatch.setattr(tenancy.settings, "ENV", "production", raising=False)
    client = TestClient(_probe_app(is_developer=True, studio_is_demo=False))
    assert client.get("/probe").status_code == 403


def test_the_resolver_allows_a_developer_in_the_demo_studio_in_production(monkeypatch):
    from app.core import tenancy

    monkeypatch.setattr(tenancy.settings, "ENV", "production", raising=False)
    client = TestClient(_probe_app(is_developer=True, studio_is_demo=True))
    assert client.get("/probe").status_code == 200


def test_the_resolver_leaves_an_ordinary_session_alone_in_production(monkeypatch):
    """The control. A resolver that 403'd everything would satisfy the restriction and
    break the product."""
    from app.core import tenancy

    monkeypatch.setattr(tenancy.settings, "ENV", "production", raising=False)
    client = TestClient(_probe_app(is_developer=False, studio_is_demo=False))
    assert client.get("/probe").status_code == 200


# -- the gate: restriction 1 is available, but nothing forces a router to use it -----
ROUTERS_ROOT = Path(__file__).resolve().parents[2] / "app" / "routers"

#: Routers legitimately reaching the database through the unscoped `SessionDep`
#: (app/core/db.py) rather than `TenantSessionDep` (app/core/tenancy.py), and why.
#: `studio_id_from_request` carries restriction 1, but a dependency nobody is required
#: to use has no effect -- this allowlist is what turns "available" into "enforced": a
#: new tenant-touching router that reaches for SessionDep out of habit fails this test
#: unless it justifies the choice here.
SESSION_DEP_ALLOWLIST: dict[str, str] = {
    "dev.py": (
        "POST /dev/demo/reset deliberately spans the tenant boundary: it wipes and "
        "re-seeds the demo studio (app/services/demo/service.py), work that must run "
        "before/around the studio's own scoped state exists, not inside a "
        "TenantSession that fails closed the moment no studio is in context."
    ),
    "identity.py": (
        "SPEC 5.2's auth routes run BEFORE a studio exists -- there is no tenant in "
        "context between the redirect out and the callback back -- and 3.3 requires one "
        "identity to reach several studios, so the login resolver has to see all of "
        "them to answer 'which ones are yours?'. Restriction 1 is not bypassed, it is "
        "deferred: the moment a studio is chosen it lands in the JWT's `sid` claim, "
        "app/core/auth_context.py puts it on request.state, and every OTHER router "
        "takes TenantSessionDep and fails closed on it."
    ),
    "public.py": (
        "SPEC 6.1 -- 'Parent-app access needs no provisioning at all, because booking a "
        "trial creates the guardian row itself. That is the only self-service entry point "
        "in the system.' These routes run for a stranger holding a flyer: no token, no "
        "`sid` claim, and therefore no studio for TenantSessionDep to resolve, so a "
        "tenant-scoped session would 401 the shop window rather than protect it. "
        "Restriction 1 is not bypassed, it is replaced by something narrower: every query "
        "in app/services/people/landing.py names its studio EXPLICITLY, resolved from the "
        "slug or the group the caller supplied, and the module never calls "
        "with_all_tenants -- so nothing here can reach past the one studio the URL names."
    ),
    "platform.py": (
        "SPEC 18.1 puts the platform console above every studio: 5.1 makes it the only "
        "thing that can create one, so it cannot itself be scoped to one. Its own "
        "dependency, require_platform_admin, is what guards it -- and that dependency "
        "re-confirms against the database rather than trusting the token's claim, "
        "because removing an operator must not wait fifteen minutes to take effect."
    ),
}


def routers_using_session_dep(root: Path) -> list[str]:
    """Every app/routers/*.py file that names the unscoped `SessionDep`, source-level.

    Source-level by necessity: 'this router bypasses restriction 1' is not observable
    by driving a request through it -- restriction 1 fires only once a router's
    dependency chain actually resolves a TenantSession, so a router built on plain
    `SessionDep` never reaches the code that would refuse it. The only way to see the
    gap before it ships real data access is to read which dependency a router asked
    for.

    Matches the bare name `SessionDep`, not `TenantSessionDep`: the latter contains the
    former as a substring, so a naive `"SessionDep" in text` check would flag every
    correctly tenant-scoped router too and this gate would forbid the very thing it
    exists to allow.
    """
    pattern = re.compile(r"(?<!Tenant)\bSessionDep\b")
    hits = []
    for path in sorted(root.glob("*.py")):
        if path.name == "__init__.py":
            continue
        if pattern.search(path.read_text(encoding="utf-8")):
            hits.append(path.name)
    return hits


def test_every_router_using_the_unscoped_session_is_allowlisted_with_a_reason():
    """The gate. A later lane adding a tenant-touching router with SessionDep --
    instead of TenantSessionDep -- would otherwise silently bypass restriction 1: no
    error, no 403, just a query that was never subject to the tenant filter or the
    developer-in-production check at all."""
    for name in routers_using_session_dep(ROUTERS_ROOT):
        assert name in SESSION_DEP_ALLOWLIST, (
            f"app/routers/{name} uses SessionDep (unscoped) rather than "
            "TenantSessionDep, so restriction 1 (studio_id_from_request) never runs "
            "for it. Either switch to TenantSessionDep, or add app/routers/"
            f"{name!r} to SESSION_DEP_ALLOWLIST in this file with the reason it "
            "legitimately spans the tenant boundary."
        )
        assert SESSION_DEP_ALLOWLIST[name].strip(), name


def test_every_allowlisted_router_still_exists():
    """An allowlist entry for a deleted or renamed router is an exemption nobody
    notices going stale -- and the next file to reuse that name inherits it."""
    for name in SESSION_DEP_ALLOWLIST:
        assert (ROUTERS_ROOT / name).exists(), f"{name} is allowlisted but does not exist"


# -- proven to fire -------------------------------------------------------------------
def test_the_detector_flags_an_unlisted_router_using_the_unscoped_session(tmp_path):
    (tmp_path / "probe_router.py").write_text(
        "from app.core.db import SessionDep\n\n\ndef handler(session: SessionDep): ...\n",
        encoding="utf-8",
    )
    assert routers_using_session_dep(tmp_path) == ["probe_router.py"]


def test_the_detector_leaves_a_tenant_scoped_router_alone(tmp_path):
    (tmp_path / "probe_router.py").write_text(
        "from app.core.tenancy import TenantSessionDep\n\n\n"
        "def handler(session: TenantSessionDep): ...\n",
        encoding="utf-8",
    )
    assert routers_using_session_dep(tmp_path) == []
