"""Decision 21, the backend half -- the invitation reaches the parent two ways: the
copyable `?invite=` link (`tests/people/test_students_router.py` already covers that one)
and an email. This file covers the second channel and the contract
`app/schemas/people.py`'s `StudentCreateResult` makes about it: `invitation_email_configured`
says whether this deployment can send mail at all, `invitation_email_sent` says whether
this particular request's email actually went out, and neither one may turn a working
student-creation request into a failed one.

No socket is ever opened here -- `smtplib.SMTP` is replaced with `FakeSMTP` before any
test that expects a send to be attempted, and the tests that expect NO send replace it
with something that raises if called at all, so "nothing was sent" is proven rather than
merely unobserved.
"""

from __future__ import annotations

import logging

import app.services.people.invitations as invitations
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


class FakeSMTP:
    """A stand-in for `smtplib.SMTP` that never touches a socket."""

    def __init__(self) -> None:
        self.started_tls = False
        self.login_call: tuple[str, str] | None = None
        self.sent_messages: list = []

    def __call__(self, *args, **kwargs) -> FakeSMTP:
        # `smtplib.SMTP(host, port, timeout=...)` is a constructor call in the real
        # module; this instance plays both the module attribute and the object the call
        # returns, so one fake serves as the whole seam.
        return self

    def __enter__(self) -> FakeSMTP:
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def starttls(self) -> None:
        self.started_tls = True

    def login(self, username: str, password: str) -> None:
        self.login_call = (username, password)

    def send_message(self, message) -> None:
        self.sent_messages.append(message)


class ExplodingSMTP:
    """Fails the test the instant anything tries to reach an SMTP server at all."""

    def __call__(self, *args, **kwargs):
        raise AssertionError("SMTP was contacted although nothing should have been sent")


def _configure_smtp(monkeypatch, *, host="smtp.example.invalid", password="app-password"):
    monkeypatch.setattr(settings, "SMTP_HOST", host)
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SecretStr(password) if password else None)
    monkeypatch.setattr(settings, "SMTP_USERNAME", "bot@example.invalid")


# -- 1. configured, guardian has an email -> it is sent -----------------------------------


def test_configured_and_a_guardian_email_sends_and_reports_it(client, as_manager, monkeypatch):
    _configure_smtp(monkeypatch)
    fake = FakeSMTP()
    monkeypatch.setattr(invitations.smtplib, "SMTP", fake)

    body = _create(client, as_manager)

    assert body["invitation_email_configured"] is True
    assert body["invitation_email_sent"] is True
    assert len(fake.sent_messages) == 1
    sent = fake.sent_messages[0]
    assert body["invitation_url"] in sent.get_content()
    assert fake.started_tls is True


# -- 2. SMTP_PASSWORD unset -> nothing is sent, reported as unconfigured ------------------


def test_smtp_password_unset_means_unconfigured_and_nothing_is_sent(
    client, as_manager, monkeypatch
):
    """Decision 21's whole point: a host with no password cannot authenticate, so
    `SMTP_HOST` alone must not read as configured. This is the state production is in
    today."""
    _configure_smtp(monkeypatch, password=None)
    monkeypatch.setattr(invitations.smtplib, "SMTP", ExplodingSMTP())

    body = _create(client, as_manager)

    assert body["invitation_email_configured"] is False
    assert body["invitation_email_sent"] is False
    # the copyable link is the channel that always works, and it must still work here.
    assert body["invitation_token"]
    assert body["invitation_url"].endswith(f"/?invite={body['invitation_token']}")


# -- 3. the transport raises -> student creation still succeeds ---------------------------


class BoomSMTP:
    def __call__(self, *args, **kwargs) -> BoomSMTP:
        return self

    def __enter__(self) -> BoomSMTP:
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def starttls(self) -> None:
        raise OSError("connection refused")


def test_an_smtp_failure_does_not_fail_student_creation(client, as_manager, monkeypatch):
    _configure_smtp(monkeypatch)
    monkeypatch.setattr(invitations.smtplib, "SMTP", BoomSMTP())

    response = client.post("/api/v1/students", json=_payload(), headers=as_manager.headers)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["invitation_email_sent"] is False
    assert body["invitation_email_configured"] is True
    assert body["invitation_token"]
    assert body["invitation_url"]


# -- 4. no guardian email at all -> nothing sent, no crash --------------------------------


def test_no_guardian_email_sends_nothing_and_does_not_crash(client, as_manager, monkeypatch):
    _configure_smtp(monkeypatch)
    monkeypatch.setattr(invitations.smtplib, "SMTP", ExplodingSMTP())

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
    _configure_smtp(monkeypatch)
    fake = FakeSMTP()
    monkeypatch.setattr(invitations.smtplib, "SMTP", fake)

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
