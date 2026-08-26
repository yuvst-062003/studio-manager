"""§11.7 -- 'The public registration endpoint is captcha-protected and rate-limited per
IP.' This is the rate-limiting half. See the module docstring for what it is not."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.people.rate_limit import FixedWindowLimiter

T = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)


def test_requests_under_the_limit_are_allowed():
    limiter = FixedWindowLimiter(limit=3, window=timedelta(minutes=10))
    assert all(limiter.allow("1.2.3.4", at=T) for _ in range(3))


def test_the_next_request_is_refused():
    limiter = FixedWindowLimiter(limit=2, window=timedelta(minutes=10))
    limiter.allow("1.2.3.4", at=T)
    limiter.allow("1.2.3.4", at=T)
    assert limiter.allow("1.2.3.4", at=T) is False


def test_a_different_key_has_its_own_budget():
    """Per IP, and separately per identity. A shared school Wi-Fi must not lock out the
    second family who books that afternoon -- which is why the identity key exists as well
    and the IP budget is the generous one."""
    limiter = FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    assert limiter.allow("1.2.3.4", at=T) is True
    assert limiter.allow("5.6.7.8", at=T) is True


def test_the_window_rolls_over():
    limiter = FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    limiter.allow("1.2.3.4", at=T)
    assert limiter.allow("1.2.3.4", at=T + timedelta(minutes=11)) is True


def test_a_request_inside_the_same_window_is_still_counted():
    """The control for the rollover test. A limiter that reset on every call would pass
    that one just as happily."""
    limiter = FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    limiter.allow("1.2.3.4", at=T)
    assert limiter.allow("1.2.3.4", at=T + timedelta(minutes=1)) is False


def test_expired_windows_are_evicted_so_the_map_cannot_grow_without_bound():
    """An in-process limiter that never forgets is a memory leak with a security
    justification attached."""
    limiter = FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    for i in range(200):
        limiter.allow(f"10.0.0.{i}", at=T)
    limiter.allow("1.2.3.4", at=T + timedelta(hours=1))
    assert len(limiter._windows) <= 2


def test_the_limiter_reads_no_clock_of_its_own():
    """§19.5 -- `app.core.clock.now()` is the only clock, and a test fails the build on any
    other `datetime.now()` in app/. The limiter takes `at` for that reason and also so
    `X-Dev-Now` can drive it."""
    import ast
    import inspect

    import app.services.people.rate_limit as module

    calls = [
        node
        for node in ast.walk(ast.parse(inspect.getsource(module)))
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "now"
    ]
    assert calls == []
