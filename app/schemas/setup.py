"""Wire shapes for `/api/v1/setup`."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SetupStepOut(BaseModel):
    id: str
    order: int
    status: Literal["pending", "done", "skipped"]
    at: str | None = None


class SetupProgressOut(BaseModel):
    """What all three setup routes return, so a caller never has to re-fetch.

    `complete` and `dismissed_at` are separate on purpose -- SPEC §5.1 states two
    different things and app/services/structure/setup.py carries the reasoning.
    """

    steps: list[SetupStepOut]
    complete: bool = Field(description="Every one of the six steps is done.")
    dismissed_at: str | None = Field(
        default=None, description="The owner chose an exit at step 6. Auto-routing stops."
    )


class SetupStepIn(BaseModel):
    #: `pending` is accepted since F6 — the reversal of the original refusal, made for
    #: the same reason the rollover wizard always accepted it: a one-way ratchet sends an
    #: owner back through the whole wizard to correct a single press. The audit trail
    #: keeps both facts (answered, then reopened), so nothing is silently un-reported.
    #:
    #: Spelled out rather than built from `SETTABLE_STATUSES`: a Literal wants literals,
    #: and the indirection would cost a type: ignore to buy nothing. A test asserts the
    #: two stay in step.
    status: Literal["done", "skipped", "pending"]
