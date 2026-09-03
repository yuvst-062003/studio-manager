"""§2.8/§13.2's comms-specific check: the one the 2026-09-02 findings register said did not
exist at all. "A notify run that 'sends' 400 pushes to nobody is a green heartbeat" -- this
is what stops it.

Unit-level and monkeypatched at `_latest_run` rather than driven through a real `job_run`
row: `tests/ops/conftest.py`'s own docstring explains why `job_run` rows commit for real and
survive the rollback every other test relies on, and this suite's shared dev database
already carries far more of those than any one test should add to.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.ops import checks

AT = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)


def _run(detail: dict | None):
    return SimpleNamespace(detail=detail, started_at=AT)


def test_unknown_with_no_comms_notify_history_yet(monkeypatch):
    """A fresh environment that has never run `comms-notify` has not lost its transport --
    `unknown` rather than `red`, the same distinction `_upay_callback_silence` draws for a
    studio's first quiet week."""
    monkeypatch.setattr(checks, "_latest_run", lambda session, job_name: None)
    signal = checks._push_transport_unconfigured(session=None, at=AT)
    assert signal.status == "unknown"
    assert signal.value is None


def test_ok_when_nothing_was_attempted_even_through_the_recording_fallback(monkeypatch):
    """A run with nothing queued proves nothing about whether the transport works --
    `RecordingPushSender` being the resolved sender is not itself red."""
    monkeypatch.setattr(
        checks,
        "_latest_run",
        lambda session, job_name: _run(
            {"pushed": 0, "push_failed": 0, "push_transport": "recording"}
        ),
    )
    signal = checks._push_transport_unconfigured(session=None, at=AT)
    assert signal.status == "ok"


def test_red_when_pushes_were_attempted_through_the_recording_fallback(monkeypatch):
    """The exact failure the register named: pushes were attempted -- some sent, some
    failed -- and none of them went through a real transport."""
    monkeypatch.setattr(
        checks,
        "_latest_run",
        lambda session, job_name: _run(
            {"pushed": 3, "push_failed": 1, "push_transport": "recording"}
        ),
    )
    signal = checks._push_transport_unconfigured(session=None, at=AT)
    assert signal.status == "red"
    assert signal.value == 4
    assert signal.since == AT


def test_ok_when_pushes_went_through_the_real_transport(monkeypatch):
    monkeypatch.setattr(
        checks,
        "_latest_run",
        lambda session, job_name: _run(
            {"pushed": 10, "push_failed": 0, "push_transport": "webpush"}
        ),
    )
    signal = checks._push_transport_unconfigured(session=None, at=AT)
    assert signal.status == "ok"


def test_unknown_when_the_latest_run_predates_this_check(monkeypatch):
    """An older `job_run` row written before this signal existed carries no
    `push_transport` key at all -- `unknown`, not a false `red` for a run that never made
    any claim about its transport, and not a `KeyError` on a field it does not have."""
    monkeypatch.setattr(
        checks, "_latest_run", lambda session, job_name: _run({"pushed": 5, "push_failed": 0})
    )
    signal = checks._push_transport_unconfigured(session=None, at=AT)
    assert signal.status == "unknown"
