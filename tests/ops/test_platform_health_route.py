"""§18.3's operations board, and the claim the console needs to know it may draw one.

Two things are asserted here that no unit test of the checks can see: the route refuses
anybody who is not a platform admin, and `/auth/me` says whether the caller IS one. The
second matters because without it the dashboard cannot decide whether to render the
console -- and a screen that has to call an endpoint and catch the 403 to find out is a
screen that offers a door before knowing it opens.

The `platform_admin` fixture is the same shape `tests/identity/test_platform_router.py`
uses, including the second sign-in: the first token is minted before the `platform_admin`
row exists, and `require_platform_admin` re-confirms against the database rather than
trusting the token's `padm` claim -- so signing in again exercises the path a
newly-appointed operator actually walks.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import pytest
from app.models.identity import AuthIdentity, PlatformAdmin
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in


@dataclass
class Admin:
    identity_id: uuid.UUID
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


@pytest.fixture
def platform_admin(client: TestClient, fake_provider, app_session: Session) -> Admin:
    subject = f"ops-{uuid.uuid4()}"
    fake_provider.register(code="c-ops", subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code="c-ops", app_name="dashboard")

    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()
    app_session.add(PlatformAdmin(auth_identity_id=identity_id))
    app_session.commit()

    signed = sign_in(client, code="c-ops", app_name="dashboard")
    return Admin(identity_id=identity_id, token=signed.json()["access_token"])


@pytest.fixture
def ordinary(client: TestClient, fake_provider) -> dict[str, str]:
    """A signed-in identity with no roles and no children -- §6.1's last row."""
    subject = f"ord-{uuid.uuid4()}"
    fake_provider.register(code="c-ord", subject=subject, email=f"{subject}@example.invalid")
    signed = sign_in(client, code="c-ord")
    return {"Authorization": f"Bearer {signed.json()['access_token']}"}


def test_the_board_refuses_an_ordinary_signed_in_caller(client: TestClient, ordinary):
    """§6.1 -- 'there is no path from I downloaded the app to I have a studio', and none
    from a signed-in parent to the operations board either."""
    response = client.get("/api/v1/platform/health", headers=ordinary)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "not_a_platform_admin"


def test_the_board_refuses_an_anonymous_caller(client: TestClient):
    assert client.get("/api/v1/platform/health").status_code == 401


def test_me_reports_platform_admin_as_false_for_an_ordinary_caller(client: TestClient, ordinary):
    """The default has to be false, and asserted. A field that were true by accident would
    offer the console to every parent in the product."""
    body = client.get("/api/v1/auth/me", headers=ordinary).json()
    assert body["is_platform_admin"] is False


def test_me_reports_platform_admin_for_an_operator(client: TestClient, platform_admin: Admin):
    body = client.get("/api/v1/auth/me", headers=platform_admin.headers).json()
    assert body["is_platform_admin"] is True


def test_the_board_answers_an_operator(client: TestClient, platform_admin: Admin):
    response = client.get("/api/v1/platform/health", headers=platform_admin.headers)
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["status"] in ("ok", "red")
    # Every declared job appears, including the monitor itself -- a monitor that omitted
    # its own heartbeat would be the one job whose silence nothing could show.
    assert {job["name"] for job in payload["jobs"]} >= {"billing-run", "ops-check"}
    assert {signal["id"] for signal in payload["signals"]} == {
        "api.unhandled_exceptions",
        "billing.zero_charge_run",
        "upay.callback_silence",
        "comms.push_transport",
    }
    # Nothing is configured in a test environment, and the screen must be able to say so:
    # "no alerts" and "no delivery" look identical from an empty inbox.
    assert payload["email_configured"] is False


def test_the_board_carries_no_user_facing_copy(client: TestClient, platform_admin: Admin):
    """G4's rule, one layer down. Hebrew belongs in web/packages/i18n; an API that shipped
    display copy would be the single place in the product where it does not."""
    raw = client.get("/api/v1/platform/health", headers=platform_admin.headers).text
    assert not any("֐" <= character <= "׿" for character in raw), (
        "the operations board returned Hebrew; copy belongs in the locale files"
    )
