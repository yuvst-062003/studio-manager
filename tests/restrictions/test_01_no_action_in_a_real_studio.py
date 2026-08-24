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

import uuid
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
