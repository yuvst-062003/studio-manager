"""§5.13's belt ranks and awards.

**D3 — belt colours are data, never brand.** `color_hex` travels raw from the studio's own
`belt_rank` rows, because a judo belt is a real-world object whose colour is not the
product's to theme. That is the one place in this codebase where a hex reaches a component
legitimately (G13 bans hardcoded colour in *design* tokens, which this is not).

**D7 — the ring is not optional.** `BeltBar` draws a 1px ring in the current foreground
colour around every bar and carries no opt-out prop, because a white belt on a white
background is invisible and a yellow one on the dark theme nearly so. Nothing in this
module can turn it off, which is deliberate: the guarantee belongs to the component, not
to whoever assembles the props.

The i18n strings for all of this live in the `events` namespace under `belt.*`. See
`app/schemas/events.py` for why there is no `belts` namespace to put them in.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas._pagination import CursorPage

#: Six hex digits with the hash. Validated rather than free text because the value is
#: interpolated into a style, and D3's "colours are data" stops being safe the moment the
#: data can be arbitrary.
HexColour = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class BeltRankOut(BaseModel):
    """One rung of one class's ladder.

    Per-studio and per-class, because a children's ladder and an adults' ladder are
    different sequences in the same club. `order_index` rather than sorting by `kyu`:
    not every rank has a kyu (a striped junior belt often does not), and a null would
    scatter those rows to one end of the list.
    """

    id: uuid.UUID
    class_id: uuid.UUID | None
    name: str
    kyu: int | None
    order_index: int
    color_hex: HexColour
    #: The stripe on a two-tone junior belt. Null is a plain belt, which is the common
    #: case; `BeltBar` renders one band or two from this field alone.
    secondary_color_hex: HexColour | None


class BeltRankIn(BaseModel):
    class_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=60)
    kyu: int | None = Field(default=None, ge=0, le=20)
    order_index: int = Field(ge=0)
    color_hex: HexColour
    secondary_color_hex: HexColour | None = None


class StudentBeltOut(BaseModel):
    """One award. §5.13 keeps the whole history rather than a current-belt pointer alone,
    because `12d` התקדמות חגורה is a timeline and "when did she get her orange belt" is the
    question parents actually ask.

    `event_id` is nullable: a belt awarded in class rather than at a graded exam is normal,
    and requiring an event would make managers create fake ones.
    """

    id: uuid.UUID
    student_id: uuid.UUID
    belt_rank_id: uuid.UUID
    #: The class whose ladder this rank belongs to (P7) — what lets a parent's award row
    #: link to `12d` without a staff-only /groups read.
    class_id: uuid.UUID
    belt_rank_name: str
    color_hex: HexColour
    secondary_color_hex: HexColour | None
    awarded_on: date
    awarded_by_person_id: uuid.UUID | None
    event_id: uuid.UUID | None
    note: str | None


class StudentBeltIn(BaseModel):
    belt_rank_id: uuid.UUID
    awarded_on: date
    event_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=500)


BeltRankPage = CursorPage[BeltRankOut]
StudentBeltPage = CursorPage[StudentBeltOut]
