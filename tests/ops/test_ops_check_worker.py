"""The job that watches the other jobs, and the one rule that makes it bearable.

An alert that fires every fifteen minutes for as long as something is broken is an alert
that gets filtered into a folder, and a filtered alert is worse than no alert: the next
real one lands there too. So the worker compares the set of failing checks between passes
and mails only when it GROWS.

The honest limit, stated here because it belongs in the tests rather than in a comment
somebody may not reach: **this job cannot detect its own silence.** If `ops-check` stops
running, nothing mails. Its own heartbeat is on the platform console like every other
job's, which makes the gap visible to somebody who looks -- and nothing inside a single
box can do better than that. An external pinger is the only thing that closes it, and
that was a deliberate trade for having no vendor.
"""

from __future__ import annotations

from app.core.clock import now
from app.models.ops import OpsEvent
from app.services.ops.checks import last_alert_ids, record_alert_sent
from app.workers.ops_check import evaluate_and_alert
from sqlalchemy import delete, select
from sqlalchemy.orm import Session


def _clear_alerts(session: Session) -> None:
    session.execute(delete(OpsEvent).where(OpsEvent.kind == "alert.sent"))
    session.flush()


def test_the_red_set_is_remembered_between_passes(app_session: Session):
    _clear_alerts(app_session)
    assert last_alert_ids(app_session) == []

    record_alert_sent(app_session, at=now(), ids=["job.billing-run"])
    assert last_alert_ids(app_session) == ["job.billing-run"]


def test_a_second_pass_with_the_same_red_set_sends_nothing(app_session: Session, monkeypatch):
    """The whole point. A job broken over a weekend is one email, not two hundred."""
    sent: list[str] = []
    monkeypatch.setattr(
        "app.workers.ops_check.send", lambda subject, body: sent.append(subject) or True
    )
    monkeypatch.setattr("app.workers.ops_check.email_configured", lambda: True)
    monkeypatch.setattr(
        "app.workers.ops_check.red_check_ids", lambda jobs, found: ["job.comms-notify"]
    )

    _clear_alerts(app_session)
    first = evaluate_and_alert(app_session, at=now())
    second = evaluate_and_alert(app_session, at=now())

    assert first.alerted is True
    assert second.alerted is False
    assert len(sent) == 1


def test_a_new_failure_joining_an_existing_one_does_send(app_session: Session, monkeypatch):
    """Growth is the trigger, not change. A second thing breaking while the first is still
    broken is news; the first one recovering is not, and a set that merely DIFFERS would
    mail on the recovery too."""
    sent: list[str] = []
    monkeypatch.setattr(
        "app.workers.ops_check.send", lambda subject, body: sent.append(subject) or True
    )
    monkeypatch.setattr("app.workers.ops_check.email_configured", lambda: True)

    _clear_alerts(app_session)
    monkeypatch.setattr("app.workers.ops_check.red_check_ids", lambda jobs, found: ["job.a"])
    evaluate_and_alert(app_session, at=now())

    monkeypatch.setattr(
        "app.workers.ops_check.red_check_ids", lambda jobs, found: ["job.a", "job.b"]
    )
    grown = evaluate_and_alert(app_session, at=now())

    assert grown.alerted is True
    assert len(sent) == 2


def test_recovery_sends_nothing_and_clears_the_memory(app_session: Session, monkeypatch):
    """Going green is not an alert -- nobody needs waking to be told things are fine.

    But the remembered set must be cleared, or the next occurrence of the SAME failure
    would look like a repeat and stay silent forever.
    """
    sent: list[str] = []
    monkeypatch.setattr(
        "app.workers.ops_check.send", lambda subject, body: sent.append(subject) or True
    )
    monkeypatch.setattr("app.workers.ops_check.email_configured", lambda: True)

    _clear_alerts(app_session)
    monkeypatch.setattr("app.workers.ops_check.red_check_ids", lambda jobs, found: ["job.a"])
    evaluate_and_alert(app_session, at=now())

    monkeypatch.setattr("app.workers.ops_check.red_check_ids", lambda jobs, found: [])
    recovered = evaluate_and_alert(app_session, at=now())
    assert recovered.alerted is False
    assert last_alert_ids(app_session) == []

    monkeypatch.setattr("app.workers.ops_check.red_check_ids", lambda jobs, found: ["job.a"])
    again = evaluate_and_alert(app_session, at=now())
    assert again.alerted is True, "the same failure recurring after a recovery is news again"
    assert len(sent) == 2


def test_nothing_is_recorded_as_sent_when_delivery_is_not_configured(
    app_session: Session, monkeypatch
):
    """Otherwise the FIRST pass after configuring email would be silent: the red set would
    already be remembered as 'alerted' from passes that never delivered anything."""
    monkeypatch.setattr("app.workers.ops_check.email_configured", lambda: False)
    monkeypatch.setattr("app.workers.ops_check.red_check_ids", lambda jobs, found: ["job.a"])

    _clear_alerts(app_session)
    result = evaluate_and_alert(app_session, at=now())

    assert result.alerted is False
    assert last_alert_ids(app_session) == []
    assert (
        app_session.execute(select(OpsEvent).where(OpsEvent.kind == "alert.sent")).scalars().first()
        is None
    )
