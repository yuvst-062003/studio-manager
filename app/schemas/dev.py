"""Request and response models for the dev router. .claude/rules/api.md: every request
body and query param is validated by a Pydantic schema, and every endpoint declares an
explicit response_model."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.core.config import Env


class DevPing(BaseModel):
    env: Env


class DevClock(BaseModel):
    now: datetime
    shifted: bool


class DemoResetRequest(BaseModel):
    #: Omitted means "the latest set". Naming one pins a bisect to the data it was
    #: authored against.
    version: str | None = None


class DemoResetResponse(BaseModel):
    version: str
    tables_wiped: list[str]
    layers_seeded: list[str]
