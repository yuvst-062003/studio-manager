"""G16, in one place: cursor pagination and the optional `Idempotency-Key`.

> "Every list endpoint is cursor-paginated. Every mutating endpoint accepts an optional
> `Idempotency-Key`." — SPEC §8.3

M1 wrote `ClassListResponse`/`GroupListResponse` by hand, each with the same two fields.
That is fine for two, and it is nine verticals' worth of drift by W5. This module is the
generic both halves of every later wave use, so the client generator sees one shape
rather than thirty near-identical ones.

**Why a cursor and not an offset.** §5.14's rosters and §5.10's charge lists are written
to while they are being read — a coach marks attendance during the same minute a manager
pages through the register. `LIMIT/OFFSET` silently skips or repeats rows when the
underlying set shifts under it. A keyset cursor cannot, because it names a position rather
than a count.

**`Idempotency-Key` is optional and that is deliberate.** §10.3's offline queue replays
writes after a reconnect and needs the guarantee; a manager clicking a button in the
dashboard does not. Making it required would fail every hand-made request for the benefit
of one caller. Attendance is the exception that does not need this header at all — it
carries `client_mark_id` per mark (§4.3), which is a stronger, row-level version of the
same idea.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Generic, TypeVar

from fastapi import Header
from pydantic import BaseModel, Field

#: G16. 50 is what fits a phone screen's worth of scrolling without a second round trip;
#: 200 is the ceiling a caller may ask for. An unbounded page size is a denial-of-service
#: vector on a roster of a thousand students.
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    """One page of a cursor-paginated list.

    `next_cursor` is the id to resume *after*, not an index. `has_more` is carried
    explicitly rather than left as "next_cursor is not None", because a client rendering
    an infinite scroll needs to know whether to show a spinner before it has decided what
    to request next.
    """

    items: list[T]
    next_cursor: uuid.UUID | None = None
    has_more: bool = False


class CursorParams(BaseModel):
    """The query half. `after` is the previous page's `next_cursor`."""

    after: uuid.UUID | None = None
    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)


#: The header dependency every mutating endpoint declares. Optional by design — see the
#: module docstring. A service that honours it stores the key against the created row and
#: returns the original result on a repeat; a service that does not yet honour it is not
#: made wrong by accepting the header.
IdempotencyKey = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        max_length=255,
        description=(
            "Optional. Repeat a request safely after a network failure: the same key "
            "returns the original result rather than performing the write twice."
        ),
    ),
]
