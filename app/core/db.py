"""Engine and session factory.

Lazy on purpose: importing this module must not open a connection, or
`pytest --collect-only` and `scripts/export_openapi.py` would both need a database.
"""

from __future__ import annotations

from functools import lru_cache

from sqlalchemy import Engine, create_engine

from app.core.config import settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
