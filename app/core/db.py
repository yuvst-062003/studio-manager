"""Engine and session factory.

Lazy on purpose: importing this module must not open a connection, or
`pytest --collect-only` and `scripts/export_openapi.py` would both need a database.
"""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.core.config import settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)


def get_session() -> Iterator[Session]:
    """A plain, **unscoped** session.

    Deliberately not TenantSession: this is for work that legitimately spans studios or
    runs before one is resolved -- the demo reset, migrations-adjacent tooling,
    platform-admin jobs. Every request-scoped path uses TenantSessionDep from
    app.core.tenancy instead, which fails closed. Making them different types is what
    stops the unscoped one being reached for by habit.
    """
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
