from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.clock import now
from app.core.config import Env, settings
from app.core.db import get_engine

router = APIRouter(tags=["health"])

# Module import time is process start closely enough, and unlike a lifespan hook it
# still works when the app is mounted by a TestClient. Through app.core.clock, not
# datetime.now: the wall-clock detector bans the direct call everywhere but clock.py,
# and at import there is no request, so an X-Dev-Now shift cannot reach this.
_STARTED_AT = now()


class HealthResponse(BaseModel):
    status: str
    env: Env
    revision: str | None
    started_at: datetime


def _read_revision() -> str | None:
    """The revision the *database* is at, not the one this image ships.

    Reading it from alembic/versions/ would report what was deployed rather than what
    was applied, which is the exact drift this field exists to surface. Uses the shared
    lazily-created engine so a liveness poll does not build a new pool per request.
    """
    with get_engine().connect() as connection:
        row = connection.execute(text("SELECT version_num FROM alembic_version")).first()
    return None if row is None else str(row[0])


@router.get("/health", response_model=HealthResponse)
def read_health() -> HealthResponse:
    """Liveness. Deliberately carries no tenant data and needs no auth.

    `revision` is best-effort and never affects `status`: this endpoint answers "is this
    process alive", and a database it cannot reach does not make it dead. Letting the
    failure propagate would turn every database blip into a page.
    """
    try:
        revision = _read_revision()
    except Exception:  # noqa: BLE001 -- liveness must not depend on the database
        revision = None
    return HealthResponse(status="ok", env=settings.ENV, revision=revision, started_at=_STARTED_AT)
