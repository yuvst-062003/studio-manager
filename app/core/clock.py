"""The only clock in the application.

SPEC §19.5: "An X-Dev-Now header shifts the server's clock **for that request only**,
in non-production. This is the only practical way to test the billing run, the debt
escalation ladder (day 3 / 7 / 14), health reminders (day 1 / 3 / 7) and trial
follow-ups without waiting a fortnight."

Two rules follow from that sentence and both are enforced by tests:

* **Nothing else calls `datetime.now()`.** A module that reads the wall clock directly
  cannot be time-travelled, so a run that half-shifts is worse than one that does not
  shift at all -- it looks like a billing bug rather than a missing feature.
* **The shift must not outlive the call that set it.** `use_dev_now`'s `.reset()` is
  what enforces that -- but *not* because it is what protects one HTTP request from the
  next. On the HTTP path that isolation already belongs to the server: uvicorn hands
  every real request a brand new, empty `contextvars.Context`, not a copy of the
  previous request's (`uvicorn/protocols/http/h11_impl.py`, `task =
  self.loop.create_task(self.cycle.run_asgi(app), context=contextvars.Context())`), so
  a missing `.reset()` would be inert there regardless of whether it ran. What
  `.reset()` is load-bearing for is the *other* caller this module advertises: a worker
  or job (`python -m app.workers.billing --at=...`) that calls `use_dev_now` more than
  once **inside a single task**. There is no fresh-Context boundary between one job and
  the next the way there is between one HTTP request and the next, so an unreset shift
  from job N would silently apply to job N+1. tests/dev/test_clock.py proves both
  halves: the contract directly (enter/exit, and nested enter/exit restoring the outer
  value rather than clearing it), and the worker's shape specifically -- two sequential
  calls sharing one task, driven through `httpx.ASGITransport` rather than
  `fastapi.testclient.TestClient`, because `TestClient` (and uvicorn) both destroy the
  very condition being tested. See that test's docstring for why the two are not
  interchangeable.

G3: always timezone-aware UTC. Rendering in Asia/Jerusalem happens at the edge.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

X_DEV_NOW_HEADER = "X-Dev-Now"

_dev_now: ContextVar[datetime | None] = ContextVar("dev_now", default=None)


def now() -> datetime:
    """The current time, honouring an active X-Dev-Now shift."""
    return _dev_now.get() or datetime.now(UTC)


def is_shifted() -> bool:
    return _dev_now.get() is not None


@contextmanager
def use_dev_now(value: datetime | None) -> Iterator[None]:
    """Also the seam a worker uses: `python -m app.workers.billing --at=...` under
    time travel is the same mechanism as the header, not a second one."""
    token = _dev_now.set(value)
    try:
        yield
    finally:
        _dev_now.reset(token)


def parse_dev_now(raw: str) -> datetime:
    """ISO 8601. A bare date is accepted and read as midnight UTC, because
    `?at=2027-03-01` is what you actually type when testing a billing day."""
    parsed = datetime.fromisoformat(raw)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class DevClockMiddleware(BaseHTTPMiddleware):
    """Installed only when ENV != production (app/main.py). The internal guard below is
    defence in depth, not the mechanism: §19.2's standard is that the capability does
    not exist in production, not that it is switched off there."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        from app.core.config import settings

        raw = request.headers.get(X_DEV_NOW_HEADER)
        if raw is None or settings.ENV == "production":
            return await call_next(request)
        try:
            shifted = parse_dev_now(raw)
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "code": "invalid_dev_now",
                    "message": f"{X_DEV_NOW_HEADER} must be ISO 8601, got {raw!r}",
                },
            )
        with use_dev_now(shifted):
            return await call_next(request)
