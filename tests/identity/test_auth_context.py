"""Holdback 2 -- the input tenancy.py has waited for since M0.2.

tests/restrictions/test_01 already asserts the RULE in full and says so out loud: "What
is absent is only the INPUT: M1 sets request.state.is_developer and
request.state.studio_is_demo from the verified JWT." This file is that input, so it
asserts the WIRING rather than re-asserting the rule.

The negative cases matter most. A middleware that defaulted `is_developer` to True on a
malformed token, or that left stale state behind after a failed verification, would turn
19.6's guardrail into decoration while every positive test stayed green.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Annotated

import pytest
from app.core.auth_context import AuthContextMiddleware
from app.core.clock import now
from app.core.config import settings
from app.core.tenancy import studio_id_from_request
from app.services.identity.tokens import AccessClaims, mint_access_token
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import SecretStr
from tests.conftest import TEST_JWT_KEY


# Every token here is anchored on `now()` rather than on a fixed instant, and that is
# load-bearing. The middleware verifies `exp` against `app.core.clock.now()`, and the probe
# app below mounts AuthContextMiddleware WITHOUT DevClockMiddleware -- there is no X-Dev-Now
# to shift, so `now()` is the real wall clock. A token anchored at a hardcoded datetime is
# therefore valid for the fifteen real minutes that follow it and expired for the rest of
# history: this file was written green and went red the same afternoon, with four tests
# reporting 401 for reasons that had nothing to do with the wiring they assert. Anchoring on
# the one clock the middleware reads is what makes them deterministic -- and keeps them
# correct under a shift, which a `datetime.now()` here would not.
def _token(**overrides: object) -> str:
    at = now()
    base: dict[str, object] = {
        "identity_id": uuid.uuid4(),
        "person_id": uuid.uuid4(),
        "active_studio_id": uuid.uuid4(),
        "acting_as_person_id": None,
        "roles": ("manager",),
        "is_developer": False,
        "studio_is_demo": False,
        "is_platform_admin": False,
        "issued_at": at,
        "expires_at": at + timedelta(minutes=15),
    }
    return mint_access_token(
        AccessClaims(**{**base, **overrides}),  # type: ignore[arg-type]
        key=TEST_JWT_KEY,
    )


@pytest.fixture
def probe(monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", SecretStr(TEST_JWT_KEY))
    app = FastAPI()
    app.add_middleware(AuthContextMiddleware)

    @app.get("/probe")
    def read_state(request: Request) -> dict[str, object]:
        return {
            "identity_id": str(getattr(request.state, "identity_id", None)),
            "studio_id": str(getattr(request.state, "studio_id", None)),
            "is_developer": getattr(request.state, "is_developer", None),
            "studio_is_demo": getattr(request.state, "studio_is_demo", None),
            "roles": list(getattr(request.state, "roles", ()) or ()),
        }

    return TestClient(app)


def test_a_valid_token_populates_the_state_tenancy_has_been_waiting_for(probe):
    studio = uuid.uuid4()
    token = _token(active_studio_id=studio, is_developer=True, studio_is_demo=True)
    body = probe.get("/probe", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["studio_id"] == str(studio)
    assert body["is_developer"] is True
    assert body["studio_is_demo"] is True
    assert body["roles"] == ["manager"]


def test_no_header_leaves_every_flag_unset_rather_than_defaulted(probe):
    """Unset, not False. tenancy.py reads these with getattr(..., False), so the two
    agree -- but a middleware that WRITES False is one line from writing True, and the
    state would look equally deliberate either way."""
    body = probe.get("/probe").json()
    assert body["identity_id"] == "None"
    assert body["is_developer"] is None
    assert body["studio_is_demo"] is None


@pytest.mark.parametrize(
    "header", ["Bearer not-a-token", "Bearer ", "Basic abc", "not-even-a-scheme", ""]
)
def test_a_malformed_authorization_header_never_grants_anything(probe, header):
    body = probe.get("/probe", headers={"Authorization": header}).json()
    assert body["is_developer"] is None
    assert body["studio_id"] == "None"


def test_an_expired_token_grants_nothing(probe):
    """5.2's fifteen minutes are enforced here too, not only in the token module: a
    middleware that verified the signature and skipped the clock would accept a
    year-old token."""
    expired = _token(issued_at=now() - timedelta(days=400), expires_at=now() - timedelta(days=399))
    body = probe.get("/probe", headers={"Authorization": f"Bearer {expired}"}).json()
    assert body["identity_id"] == "None"


def test_a_token_signed_with_another_key_grants_nothing(probe):
    forged = mint_access_token(
        AccessClaims(
            identity_id=uuid.uuid4(),
            person_id=None,
            active_studio_id=uuid.uuid4(),
            acting_as_person_id=None,
            roles=("owner",),
            is_developer=True,
            studio_is_demo=True,
            is_platform_admin=True,
            issued_at=now(),
            expires_at=now() + timedelta(minutes=15),
        ),
        key="the-attackers-key-also-32-bytes!!!!",
    )
    body = probe.get("/probe", headers={"Authorization": f"Bearer {forged}"}).json()
    assert body["is_developer"] is None
    assert body["roles"] == []


def test_x_acting_as_rides_on_every_response(probe):
    """19.4 -- 'every response carries an X-Acting-As header so the active persona is
    visible in dev tools and in Sentry breadcrumbs.'"""
    persona = uuid.uuid4()
    token = _token(acting_as_person_id=persona)
    response = probe.get("/probe", headers={"Authorization": f"Bearer {token}"})
    assert response.headers["X-Acting-As"] == str(persona)


def test_x_acting_as_is_absent_for_an_ordinary_login(probe):
    """A header present on every response would stop meaning anything."""
    response = probe.get("/probe", headers={"Authorization": f"Bearer {_token()}"})
    assert "X-Acting-As" not in response.headers


# -- 19.6 restriction 1, end to end for the first time -------------------------
def test_a_developer_session_cannot_resolve_a_real_studio_in_production(monkeypatch):
    """tests/restrictions/test_01 proved the RULE and the resolver, driving request.state
    by hand because nothing populated it. This proves the wire between a real signed
    token and that resolver -- which is what holdback 2 was actually blocking."""
    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", SecretStr(TEST_JWT_KEY))
    monkeypatch.setattr(settings, "ENV", "production")

    app = FastAPI()
    app.add_middleware(AuthContextMiddleware)

    @app.get("/scoped")
    def scoped(studio_id: Annotated[uuid.UUID, Depends(studio_id_from_request)]) -> dict[str, str]:
        return {"studio_id": str(studio_id)}

    client = TestClient(app)
    real = _token(is_developer=True, studio_is_demo=False)
    demo = _token(is_developer=True, studio_is_demo=True)
    assert client.get("/scoped", headers={"Authorization": f"Bearer {real}"}).status_code == 403
    assert client.get("/scoped", headers={"Authorization": f"Bearer {demo}"}).status_code == 200


def test_an_ordinary_manager_is_unaffected_in_production(monkeypatch):
    """The control. 19.6 restriction 1 is about developer sessions; a real manager in a
    real studio in production is the product working."""
    monkeypatch.setattr(settings, "JWT_SIGNING_KEY", SecretStr(TEST_JWT_KEY))
    monkeypatch.setattr(settings, "ENV", "production")

    app = FastAPI()
    app.add_middleware(AuthContextMiddleware)

    @app.get("/scoped")
    def scoped(studio_id: Annotated[uuid.UUID, Depends(studio_id_from_request)]) -> dict[str, str]:
        return {"studio_id": str(studio_id)}

    token = _token(is_developer=False, studio_is_demo=False)
    assert (
        TestClient(app).get("/scoped", headers={"Authorization": f"Bearer {token}"}).status_code
        == 200
    )
