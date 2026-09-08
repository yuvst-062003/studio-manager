"""F3 of the 2026-09-08 scaling audit — how many database connections the API may hold.

`create_engine` was called with `pool_pre_ping` and nothing else, so SQLAlchemy's defaults
applied: `pool_size=5`, `max_overflow=10`, a hard ceiling of **15 connections per process**,
`pool_timeout=30s` and `pool_recycle=-1`.

**290 of the ~295 route handlers are sync `def`**, so FastAPI runs them in Starlette's
forty-thread pool. Forty threads contend for fifteen connections; request sixteen waits up
to thirty seconds and then answers HTTP 500. That is a concurrency ceiling, not a data-volume
one — it arrives with users rather than with rows.

`pool_recycle` matters on its own: Railway drops idle connections, and today only
`pool_pre_ping` catches that — one failed round trip at a time.
"""

from __future__ import annotations

from app.core.config import settings


def test_the_pool_is_configured_rather_than_defaulted() -> None:
    assert settings.DB_POOL_SIZE > 5, "the SQLAlchemy default is the thing being fixed"
    assert settings.DB_MAX_OVERFLOW >= 0
    assert settings.DB_POOL_TIMEOUT > 0


def test_idle_connections_are_recycled() -> None:
    """Railway drops idle connections. Without this, `pool_pre_ping` discovers each dead
    one on the request that needed it."""
    assert settings.DB_POOL_RECYCLE > 0
    #: Under Railway's own idle window, or recycling never happens first.
    assert settings.DB_POOL_RECYCLE <= 3600


def test_the_ceiling_stays_under_the_database_limit() -> None:
    """The acceptance criterion the audit named: `pool_size × workers` under the plan's
    connection limit, with room left for the eight cron jobs and a human with `psql`.

    This is the check that makes raising the pool safe rather than merely bigger — an
    engine allowed more connections than the database accepts fails later, harder, and
    with a message about the database rather than about the setting that caused it."""
    per_process = settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW
    assert per_process * settings.WEB_CONCURRENCY <= settings.DB_MAX_CONNECTIONS

    #: The workers are separate processes with their own engines, and they are not counted
    #: in `WEB_CONCURRENCY`. Eight declared jobs, plus headroom for an operator.
    reserved = settings.DB_MAX_CONNECTIONS - per_process * settings.WEB_CONCURRENCY
    assert reserved >= 10, "no headroom left for the cron jobs and a psql session"
