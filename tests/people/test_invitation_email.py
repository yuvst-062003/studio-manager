"""Decision 21, the backend half -- the invitation reaches the parent two ways: the
copyable `?invite=` link (`tests/people/test_students_router.py` already covers that one)
and an email. This file covers the second channel and the contract
`app/schemas/people.py`'s `StudentCreateResult` makes about it: `invitation_email_configured`
says whether this deployment can send mail at all, `invitation_email_sent` says whether
this particular request's email actually went out, and neither one may turn a working
student-creation request into a failed one.

No socket is ever opened here -- `httpx.post` inside `app/services/comms/mail_transport.py`
is replaced with `FakeMailApi` before any test that expects a send to be attempted, and the
tests that expect NO send replace it with something that raises if called at all, so
"nothing was sent" is proven rather than merely unobserved.

The transport is HTTPS rather than SMTP since 2026-09-13; that module carries the
measurement showing why SMTP could never have worked from production.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

import app.services.comms.mail_transport as mail_transport
from app.core.config import settings
from pydantic import SecretStr
from tests.people.conftest import Caller


def _payload() -> dict:
    import uuid

    tag = uuid.uuid4().hex[:8]
    return {
        "first_name": f"דנה{tag}",
        "last_name": f"כהן{tag}",
        "birthdate": "2018-05-01",
        "guardian": {
            "first_name": f"יעל{tag}",
            "last_name": f"כהן{tag}",
            "email": f"yael-{tag}@example.invalid",
            "relation": "parent",
        },
    }


def _create(client, caller: Caller, payload: dict | None = None) -> dict:
    response = client.post("/api/v1/students", json=payload or _payload(), headers=caller.headers)
    assert response.status_code == 201, response.text
    return response.json()


class FakeMailApi:
    """Stands in for the provider's HTTPS endpoint. No socket is ever opened.

    One fake plays the whole seam: `mail_transport` calls `httpx.post(url, headers=...,
    json=..., timeout=...)` and reads `.status_code` off the answer.
    """

    def __init__(self, status: int = 200) -> None:
        self.status = status
        self.requests: list[dict] = []

    def __call__(self, url, *, headers=None, json=None, timeout=None):
        self.requests.append({"url": url, "headers": headers or {}, "json": json or {}})
        return SimpleNamespace(status_code=self.status)

    @property
    def sent_bodies(self) -> list[str]:
        return [request["json"].get("text", "") for request in self.requests]


class ExplodingMailApi:
    """Fails the test the instant anything tries to reach the provider at all."""

    def __call__(self, *args, **kwargs):
        raise AssertionError("the mail provider was contacted although nothing should be sent")


class BoomMailApi:
    """The provider is unreachable -- the outage case."""

    def __call__(self, *args, **kwargs):
        raise OSError("connection refused")


def _configure_mail(monkeypatch, *, key="re_test_key", sender="club@example.invalid"):
    """Mail moved off SMTP on 2026-09-13 -- Railway blocks every outbound SMTP port, so the
    old `SMTP_HOST`/`SMTP_PASSWORD` pair could never have delivered anything from
    production. See `app/services/comms/mail_transport.py`."""
    monkeypatch.setattr(settings, "RESEND_API_KEY", SecretStr(key) if key else None)
    monkeypatch.setattr(settings, "MAIL_FROM", sender)


# -- 1. configured, guardian has an email -> it is sent -----------------------------------


def test_configured_and_a_guardian_email_sends_and_reports_it(client, as_manager, monkeypatch):
    _configure_mail(monkeypatch)
    fake = FakeMailApi()
    monkeypatch.setattr(mail_transport.httpx, "post", fake)

    body = _create(client, as_manager)

    assert body["invitation_email_configured"] is True
    assert body["invitation_email_sent"] is True
    assert len(fake.requests) == 1
    assert body["invitation_url"] in fake.sent_bodies[0]
    # It authenticated, and to the provider's endpoint rather than anywhere else.
    assert fake.requests[0]["headers"]["Authorization"].startswith("Bearer ")
    assert fake.requests[0]["url"].startswith("https://")


# -- 2. SMTP_PASSWORD unset -> nothing is sent, reported as unconfigured ------------------


def test_no_api_key_means_unconfigured_and_nothing_is_sent(client, as_manager, monkeypatch):
    """Decision 21's whole point, on the transport that replaced SMTP: no key means nothing
    can be delivered, so this must not read as configured. Production was in exactly this
    state -- and when the old check said `SMTP_HOST and SMTP_PASSWORD`, both could be set on
    a host where SMTP is blocked outright, which reported "configured" for a transport that
    could not connect."""
    _configure_mail(monkeypatch, key=None)
    monkeypatch.setattr(mail_transport.httpx, "post", ExplodingMailApi())

    body = _create(client, as_manager)

    assert body["invitation_email_configured"] is False
    assert body["invitation_email_sent"] is False
    # the copyable link is the channel that always works, and it must still work here.
    assert body["invitation_token"]
    assert body["invitation_url"].endswith(f"/?invite={body['invitation_token']}")


# -- 3. the transport raises -> student creation still succeeds ---------------------------


def test_a_provider_outage_does_not_fail_student_creation(client, as_manager, monkeypatch):
    _configure_mail(monkeypatch)
    monkeypatch.setattr(mail_transport.httpx, "post", BoomMailApi())

    response = client.post("/api/v1/students", json=_payload(), headers=as_manager.headers)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["invitation_email_sent"] is False
    assert body["invitation_email_configured"] is True
    assert body["invitation_token"]
    assert body["invitation_url"]


# -- 4. no guardian email at all -> nothing sent, no crash --------------------------------


def test_no_guardian_email_sends_nothing_and_does_not_crash(client, as_manager, monkeypatch):
    _configure_mail(monkeypatch)
    monkeypatch.setattr(mail_transport.httpx, "post", ExplodingMailApi())

    payload = _payload()
    payload["guardian"]["email"] = None
    payload["guardian"]["phone"] = "050-1112222"  # a guardian needs email OR phone

    response = client.post("/api/v1/students", json=payload, headers=as_manager.headers)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["invitation_email_sent"] is False
    assert body["invitation_token"]  # the copyable link is unaffected


# -- 5. the token never reaches a log record -----------------------------------------------


def test_the_invitation_token_never_reaches_a_log_record(client, as_manager, monkeypatch, caplog):
    _configure_mail(monkeypatch)
    fake = FakeMailApi()
    monkeypatch.setattr(mail_transport.httpx, "post", fake)

    with caplog.at_level(logging.INFO, logger="app.services.people.invitations"):
        body = _create(client, as_manager)

    token = body["invitation_token"]
    url = body["invitation_url"]
    assert token and url

    records = [r for r in caplog.records if r.name == "app.services.people.invitations"]
    assert records, "expected the send path to log something"
    for record in records:
        haystack = record.getMessage()
        assert token not in haystack
        assert url not in haystack
        for value in vars(record).values():
            rendered = str(value)
            assert token not in rendered
            assert url not in rendered
