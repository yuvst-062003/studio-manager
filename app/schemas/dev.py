"""Request and response models for the dev router. .claude/rules/api.md: every request
body and query param is validated by a Pydantic schema, and every endpoint declares an
explicit response_model."""

from __future__ import annotations

from pydantic import BaseModel

from app.core.config import Env


class DevPing(BaseModel):
    env: Env
