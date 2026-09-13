"""The one way mail leaves this product.

**Why this transport exists at all.** Measured from inside the production api container on
2026-09-13: outbound SMTP ports 25, 465, 587 and 2525 all time out, to `smtp.gmail.com`,
`smtp.sendgrid.net` and `smtp.fastmail.com` alike, while HTTPS connects immediately. So
`smtplib` could never have delivered anything from production, whatever was configured --
and the shape of the old failure made that invisible, because `SMTP_HOST`, `SMTP_PORT` and
`SMTP_USERNAME` were all set and only the password was missing, which reads as "one secret
away" on every screen that reports it.

No socket is opened here either: `httpx.post` is replaced, so the tests assert the contract
this module offers its two callers rather than a provider's availability.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

import app.services.comms.mail_transport as mail_transport
from app.core.config import settings
from app.services.comms.mail_transport import deliver, mail_configured
from pydantic import SecretStr


def _configure(monkeypatch, *, key="re_test_key", sender="club@example.invalid"):
    monkeypatch.setattr(settings, "RESEND_API_KEY", SecretStr(key) if key else None)
    monkeypatch.setattr(settings, "MAIL_FROM", sender)


class _Recorder:
    def __init__(self, status: int = 200) -> None:
        self.status = status
        self.calls: list[dict] = []

    def __call__(self, url, *, headers=None, json=None, timeout=None):
        self.calls.append(
            {"url": url, "headers": headers or {}, "json": json or {}, "timeout": timeout}
        )
        return SimpleNamespace(status_code=self.status)


def test_both_halves_are_needed_before_anything_is_called_configured(monkeypatch) -> None:
    """A key with no verified sender is refused by the provider at send time, and a sender
    with no key never gets that far. Either gap means nothing arrives, so neither may read
    as configured -- which is what the dashboard shows the manager."""
    _configure(monkeypatch)
    assert mail_configured() is True

    _configure(monkeypatch, key=None)
    assert mail_configured() is False

    _configure(monkeypatch, sender=None)
    assert mail_configured() is False


def test_nothing_is_attempted_when_no_transport_is_configured(monkeypatch) -> None:
    """**The trap this closes.** `app/services/people/invitations.py` and
    `app/routers/trial_bookings.py` both send INSIDE the request that creates a student or
    books a trial. When the old SMTP check went true against a blocked transport, each of
    those hung for thirty seconds before silently failing. A transport that cannot deliver
    must refuse before it dials, not after a timeout."""
    _configure(monkeypatch, key=None)

    def explode(*args, **kwargs):
        raise AssertionError("the provider was contacted with nothing configured")

    monkeypatch.setattr(mail_transport.httpx, "post", explode)

    assert deliver(to="a@example.invalid", subject="s", body="b") is False


def test_a_send_authenticates_and_carries_the_message(monkeypatch) -> None:
    _configure(monkeypatch)
    recorder = _Recorder()
    monkeypatch.setattr(mail_transport.httpx, "post", recorder)

    assert deliver(to="parent@example.invalid", subject="נושא", body="גוף ההודעה") is True

    (call,) = recorder.calls
    assert call["url"].startswith("https://")
    assert call["headers"]["Authorization"] == "Bearer re_test_key"
    assert call["json"]["to"] == ["parent@example.invalid"]
    assert call["json"]["from"] == "club@example.invalid"
    assert call["json"]["subject"] == "נושא"
    assert call["json"]["text"] == "גוף ההודעה"
    # Short on purpose: two callers send inside a request, and a person's browser must not
    # wait on a third party the way it waited thirty seconds on the blocked SMTP socket.
    assert call["timeout"] is not None


def test_a_refusal_is_false_rather_than_an_exception(monkeypatch) -> None:
    """Every caller is either a scheduled job whose real work already succeeded or a request
    whose real work is already committed. Neither may fail because a provider had a bad
    minute -- `invitation_email_sent: false` beside a working copyable link is the honest
    outcome, and a 500 is not."""
    _configure(monkeypatch)
    monkeypatch.setattr(mail_transport.httpx, "post", _Recorder(status=422))

    assert deliver(to="a@example.invalid", subject="s", body="b") is False


def test_an_unreachable_provider_is_false_rather_than_an_exception(monkeypatch) -> None:
    _configure(monkeypatch)

    def boom(*args, **kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr(mail_transport.httpx, "post", boom)

    assert deliver(to="a@example.invalid", subject="s", body="b") is False


def test_a_refusal_never_logs_what_was_being_sent(monkeypatch, caplog) -> None:
    """§18.3. A provider's error body echoes the request it refused -- which for an
    invitation is a live token inside a URL, and for a health reminder is a child's name.
    Only the status is worth logging and only the status is logged."""
    _configure(monkeypatch)
    monkeypatch.setattr(mail_transport.httpx, "post", _Recorder(status=400))

    secret_body = "https://app.example.invalid/?invite=SUPER-SECRET-TOKEN"
    with caplog.at_level(logging.INFO, logger="app.services.comms.mail_transport"):
        deliver(to="parent@example.invalid", subject="הזמנה", body=secret_body)

    records = [r for r in caplog.records if r.name == "app.services.comms.mail_transport"]
    assert records, "expected the refusal to be logged at all"
    for record in records:
        for value in (record.getMessage(), *(str(v) for v in vars(record).values())):
            assert "SUPER-SECRET-TOKEN" not in value
            assert "parent@example.invalid" not in value
