"""SPEC §5.15's wire shapes — the seven-step training-year rollover.

Its own module rather than an extension of `app/schemas/schedule.py`, because §5.15 spans
four verticals: it reads the schedule, writes groups, moves enrollments, reprices plans and
publishes an announcement. Filing it under any one of them would put a shape three other
lanes must read inside a file one lane owns.

**Every bulk shape carries a cap.** A rollover is the one screen in the product where a
single press can touch every row a studio has, and an uncapped list is an uncapped
transaction: one request that holds locks over `enrollment` and `price_plan` long enough for
the staff app's attendance writes to queue behind it. The caps below are large enough for a
real club's year and small enough that the request stays a request.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.schedule import TrainingYearOut

#: How many rows one bulk press may carry. A 400-student club rolling over in one press is
#: the design target; beyond that the screen pages, which it has to do to render anyway.
MAX_BULK_ROWS = 500

RolloverStepId = Literal["year", "closures", "groups", "students", "prices", "generate", "announce"]
RolloverStepStatus = Literal["pending", "done", "skipped"]


class RolloverStepOut(BaseModel):
    """One row of the wizard rail."""

    id: RolloverStepId
    status: RolloverStepStatus
    #: Only the derived steps carry one — the count that made the status true. `None` on an
    #: acknowledged step is deliberate and not a missing value: there is no count that
    #: justifies "the manager looked at this", and rendering one would claim evidence the
    #: server does not have.
    detail: int | None = None


class RolloverStateOut(BaseModel):
    """What `GET /rollover/{id}` returns: the whole wizard, in one read.

    One read rather than seven, because the rail renders every step's status at once and a
    per-step fetch would show the manager a rail that fills in raggedly.
    """

    training_year: TrainingYearOut
    steps: list[RolloverStepOut]
    #: The step the client should open. Never `year` unless nothing else is pending — §5.15
    #: calls the wizard resumable, and resuming at step 1 is starting over.
    resume_at: RolloverStepId
    complete: bool
    closures: int
    groups_active: int
    students_enrolled: int
    price_plans_open: int
    sessions_generated: int


class RolloverStepPatch(BaseModel):
    """Acknowledge one step. `pending` is accepted so a manager can reopen a step they
    ticked by mistake — a one-way ratchet would send them back through the whole wizard to
    correct a single press."""

    status: RolloverStepStatus


class BulkRefusal(BaseModel):
    """One row a bulk press could not apply, and why.

    A machine-readable `reason` rather than a sentence: the screen renders it through the
    i18n layer, and an English string from the server would be the one piece of copy on a
    Hebrew screen that nobody could translate.
    """

    id: str
    reason: str


class BulkOutcomeOut(BaseModel):
    """What a bulk step did. `applied` counts rows CHANGED, not rows submitted — a group
    already named what you renamed it to is not a change, and inflating the count would make
    the summary §5.15 step 6 asks for a fiction."""

    applied: int
    refused: list[BulkRefusal] = Field(default_factory=list)


# -- step 3: groups -----------------------------------------------------------
class GroupRename(BaseModel):
    group_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)


class GroupCreate(BaseModel):
    """A group created during the rollover. Same fields as `POST /groups`, because a group
    made here must be indistinguishable from one made there — a rollover that produced a
    second-class group would show up as a bug six months later, in a different screen."""

    class_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    age_min: int | None = Field(default=None, ge=0, le=120)
    age_max: int | None = Field(default=None, ge=0, le=120)

    @model_validator(mode="after")
    def _age_range(self) -> GroupCreate:
        if self.age_min is not None and self.age_max is not None and self.age_max < self.age_min:
            raise ValueError("age_max must not be below age_min")
        return self


class RolloverGroupsIn(BaseModel):
    """§5.15 step 3. **There is no `carry_forward` list, and that is the design.** A group is
    not scoped to a training year — the year reaches it only through the sessions generated
    for it — so carrying one forward unchanged is the absence of an operation. A field for it
    would be a field the server ignores, which is worse than no field at all."""

    renames: list[GroupRename] = Field(default_factory=list, max_length=MAX_BULK_ROWS)
    retire: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_BULK_ROWS)
    #: The undo for a retire pressed in error, available in the same batch.
    revive: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_BULK_ROWS)
    creates: list[GroupCreate] = Field(default_factory=list, max_length=MAX_BULK_ROWS)

    @model_validator(mode="after")
    def _not_both_ways(self) -> RolloverGroupsIn:
        overlap = set(self.retire) & set(self.revive)
        if overlap:
            raise ValueError(f"{len(overlap)} group(s) are in both retire and revive")
        return self


# -- step 4: students ---------------------------------------------------------
class EnrollmentMove(BaseModel):
    enrollment_id: uuid.UUID
    to_group_id: uuid.UUID


class RolloverStudentsIn(BaseModel):
    """§5.15 step 4. **No `confirm` list either**, for the same reason as `carry_forward`: an
    enrollment left alone continues, so confirming one writes nothing. §5.15 also forbids
    automatic age-based promotion in v1, so every move here is named by a human."""

    moves: list[EnrollmentMove] = Field(default_factory=list, max_length=MAX_BULK_ROWS)
    not_returning: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_BULK_ROWS)

    @model_validator(mode="after")
    def _not_both_ways(self) -> RolloverStudentsIn:
        moving = {move.enrollment_id for move in self.moves}
        overlap = moving & set(self.not_returning)
        if overlap:
            raise ValueError(f"{len(overlap)} enrollment(s) are both moved and not returning")
        return self


# -- step 5: prices -----------------------------------------------------------
class PlanRepricing(BaseModel):
    """A new amount for one open plan, effective from the new year's start.

    `registration_fee_agorot` omitted means *inherit* the current fee, which is different
    from sending `0` — that sets the fee to nothing. The distinction is real money and the
    field is deliberately nullable rather than defaulted.
    """

    plan_id: uuid.UUID
    #: G1 — agorot, integer. A shekel float here is how a studio charges ₪249.99000000002.
    monthly_amount_agorot: int = Field(ge=0)
    registration_fee_agorot: int | None = Field(default=None, ge=0)


class RolloverPricesIn(BaseModel):
    repricings: list[PlanRepricing] = Field(default_factory=list, max_length=MAX_BULK_ROWS)


# -- step 7: announce ---------------------------------------------------------
class RolloverAnnounceIn(BaseModel):
    """§5.15 step 7 — "optionally publish the new schedule to all guardians in one action".

    No `scope_type`: the step's whole definition is *all guardians*, and offering a narrower
    audience here would be a second announcements composer hiding inside a wizard. A manager
    who wants one group has `4f`.
    """

    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class RolloverAnnounceOut(BaseModel):
    announcement_id: uuid.UUID
    #: Families reached, deduplicated on the guardian person — §5.11 counts a two-child
    #: household once, because two notifications about one schedule is what makes people
    #: turn notifications off.
    families: int


# -- step 6: generate ---------------------------------------------------------
class RolloverActivateOut(BaseModel):
    """The end of the wizard. §5.15: nothing is visible to guardians until activation, so
    this is the single moment the year becomes real."""

    training_year: TrainingYearOut
    activated_on: date
