"""Wire shapes for `/api/v1/studio`."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StudioLogoOut(BaseModel):
    """What POST /studio/logo returns.

    A URL and not a key. The key is an internal address that no client should learn, let
    alone send back -- §2.5 constructs every key server-side precisely so that no request
    ever carries one.
    """

    logo_url: str = Field(description="The scoped read route, cache-busted by updated_at.")
