"""Shapes for training plans: what a student's plan buys, and how it changes.

**§12 amends SPEC §5.10 deliberately.** That section says the price is "never visible as an
input anywhere in the parent app"; this feature reverses it, because the plan becomes a
parent-facing choice and the parent app shows the three amounts. `price_plan_id` on the
manager-only student payload keeps its invariant-3 tagging; these shapes are a separate,
parent-scoped view that returns the student's own plan and no other student's anything.
"""

from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel, Field


class PlanOptionOut(BaseModel):
    """One of the club's plans, as the parent screen renders it.

    `is_offered` is §5.1's rule — offer a plan only if it raises the number of sessions
    this student could attend in a week. A plan that is not offered is **shown with its
    reason, never hidden**: a Group 1 parent who hears "400" from another parent in the
    hall and finds nothing in the app phones the manager, and one line answers the question
    before it is asked. It turns itself on when the child moves up a group.
    """

    id: uuid.UUID
    name: str
    monthly_amount_agorot: int
    #: NULL is unlimited. The screen reads this to say "no weekly limit" rather than a
    #: number, and to know that the private lesson is included.
    weekly_extra_allowance: int | None
    is_offered: bool
    is_current: bool


class BookableSessionOut(BaseModel):
    """One session this week the student could mark, with why they cannot if they cannot."""

    session_id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    kind: str
    starts_at: datetime.datetime
    ends_at: datetime.datetime
    booking_id: uuid.UUID | None
    is_markable: bool
    #: A machine-readable reason, translated on the client — never a server-side Hebrew
    #: string, per §9's locale rules. `null` when the row is markable.
    reason: str | None = None


class BaseSessionOut(BaseModel):
    """Tuesday and Friday. Included in every plan, never marked, shown so the parent can
    see what "always included" actually means for their child."""

    session_id: uuid.UUID
    group_name: str
    starts_at: datetime.datetime
    ends_at: datetime.datetime


class TrainingPlanOut(BaseModel):
    student_id: uuid.UUID
    student_name: str
    current_plan: PlanOptionOut | None
    base_sessions: list[BaseSessionOut]
    this_weeks_extras: list[BookableSessionOut]
    #: `null` when the plan has no weekly limit. The screen says "no limit" rather than a
    #: number, because a large number is a limit and this is the absence of one.
    credits_remaining: int | None
    plans: list[PlanOptionOut]
    scheduled_change: PlanChangeOut | None = None


class PlanChangeIn(BaseModel):
    to_price_plan_id: uuid.UUID


class PlanChangeOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    from_price_plan_id: uuid.UUID | None
    to_price_plan_id: uuid.UUID
    effective_on: datetime.date
    status: str
    settlement_status: str
    requested_at: datetime.datetime
    applied_at: datetime.datetime | None


class ManagerPlanChangeOut(PlanChangeOut):
    """§11's queue. The student and the plans by NAME, because "who do I chase and about
    what" is the whole question that screen answers."""

    student_name: str
    from_plan_name: str | None
    to_plan_name: str
    monthly_difference_agorot: int


class PlanChangeListOut(BaseModel):
    items: list[ManagerPlanChangeOut]


class SessionBookingIn(BaseModel):
    student_id: uuid.UUID
    session_id: uuid.UUID


class SessionBookingOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    session_id: uuid.UUID
    cancelled_at: datetime.datetime | None


class SessionRosterEntryOut(BaseModel):
    booking_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str


class SessionRosterOut(BaseModel):
    session_id: uuid.UUID
    #: A live count beside the list, because a coach glancing at a phone counts mats, not
    #: rows.
    marked_count: int
    items: list[SessionRosterEntryOut]


class GroupKindIn(BaseModel):
    """`PATCH /groups/{id}` — the manager's two switches.

    Both optional: a partial write, so setting `kind` does not silently clear an invite
    list somebody spent an evening building.
    """

    kind: str | None = Field(default=None, max_length=10)
    is_invite_only: bool | None = None


class GroupEligibilityIn(BaseModel):
    """The base groups linked to one extra group. A full replace rather than add/remove:
    the manager's mental model is a checklist ("Groups 3, 4 and 5"), and two verbs for one
    checklist is how a half-applied edit happens."""

    base_group_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class GroupEligibilityOut(BaseModel):
    extra_group_id: uuid.UUID
    base_group_ids: list[uuid.UUID]
