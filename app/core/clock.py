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
  unconditionally load-bearing on the worker/job path (`python -m app.workers.billing
  --at=...`): a job that calls `use_dev_now` more than once inside one task has no task
  boundary between calls, so an unreset shift from job N would otherwise apply to job
  N+1 -- the case tests/dev/test_clock.py pins directly, including nesting. On the HTTP
  path, each request already runs in its own asyncio task, and uvicorn schedules it via
  `loop.create_task(...)` with no explicit `context=`, which gives that task a *copy* of
  the server's context rather than a shared one -- verified here end-to-end against real
  uvicorn 0.52.4 with `.reset()` stripped: the second request showed no leak. That is
  not a guarantee to lean on, though: uvicorn ships an opt-in `reset_contextvars` flag
  (`config.py`, default `False`, unused in this repo) precisely because, per its own
  comment, asyncio can leak context vars between tasks (CPython issue 140947). The
  worker/job path has no such copy-per-task cushion, which is why the reset is not
  optional there regardless of what the HTTP path happens to do today.

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

from app.core.dev_account import DEV_TOKEN_HEADER, configured_dev_token, dev_tools_allowed

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
    not exist in production, not that it is switched off there.

    Staging is a public HTTPS origin (app/core/config.py's own reasoning for
    DEV_TOOLS_TOKEN existing at all), so this header must answer to the same rule
    app.core.dev_account.dev_tools_allowed already enforces for every /dev/* route.

    **It now answers to that rule by calling it, rather than by restating it.** This
    middleware used to carry its own copy, and the copies drifted twice. First on the
    token: 728b665 taught `dev_tools_allowed` that an empty configured value is no token
    and did not teach this one, so a machine whose configuration came from the committed
    template had every request carrying X-Dev-Now refused -- while every /dev/* route on
    the same machine was allowed. Second on the environment: the copy here allowed the
    shift on ANY non-production environment when no token was configured, so on staging an
    unauthenticated caller could move the server's clock, which is the capability
    DEV_TOOLS_TOKEN exists to gate. One function, one truth table, no third drift.

    Consulting `request.state.is_developer` makes this middleware's position in the stack
    load-bearing -- app/main.py adds AuthContextMiddleware afterwards so that it runs
    first, and that comment is no longer merely descriptive. It is read rather than passed
    as False so a signed-in developer on staging keeps the capability §19.5 gives them;
    passing False would have been a quiet tightening dressed as a bug fix.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        from app.core.config import settings

        raw = request.headers.get(X_DEV_NOW_HEADER)
        if raw is None or settings.ENV == "production":
            return await call_next(request)

        if not dev_tools_allowed(
            env=settings.ENV,
            is_developer=bool(getattr(request.state, "is_developer", False)),
            presented_token=request.headers.get(DEV_TOKEN_HEADER),
            configured_token=configured_dev_token(),
        ):
            return JSONResponse(
                status_code=403,
                content={
                    "code": "dev_token_required",
                    "message": f"{X_DEV_NOW_HEADER} requires a matching "
                    f"{DEV_TOKEN_HEADER} header on this environment",
                },
            )

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
