from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import Env, settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    env: Env


@router.get("/health", response_model=HealthResponse)
def read_health() -> HealthResponse:
    """Liveness. Deliberately carries no tenant data and needs no auth."""
    return HealthResponse(status="ok", env=settings.ENV)
