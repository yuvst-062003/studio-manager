"""Request and response shapes for §5.12's events and §5.13's belts.

**Belt strings live here, under an `events.belt.*` i18n prefix, and so do belt shapes.**
`web/packages/i18n/types.ts` lists exactly nine namespaces and `index.ts` is authored once
and never edited by a lane, so there is no `belts` namespace to add. The schema module
`app/schemas/belts.py` exists separately because Python has no such constraint; the i18n
side is the one that had to fold.

**D9.2 — artboard `7c` has no משקל / קטגוריה column**, so no shape here carries a weight
or a weight class. §2.2 defers weight categories, and a field that existed "for later"
would be filled in by someone before later arrived.

**An event fee is a charge, not a payment.** `EventRegistrationOut.charge_id` points at
one; nothing in this module carries money. M7 is a pure caller of
`BillingService.create_charge(kind="event", event_id=...)`, which is what keeps the events
lane out of every billing table.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas._pagination import CursorPage

EventType = Literal["competition", "belt_exam", "seminar", "joint_training", "trip", "other"]

#: `draft` is not decoration. §5.12 sends nothing to parents until an event is published,
#: so a manager can build one over several sittings without a half-written notification
#: reaching the club.
EventStatus = Literal["draft", "published", "cancelled", "completed"]

#: Who an event is for. `studio` is everyone; the other three narrow it. Targeting is a
#: list of these rather than one field, because "the two competition groups" is the normal
#: case and a single foreign key cannot say it.
EventTargetType = Literal["studio", "class", "group", "student"]

#: §5.12 — `pending` is a real state and the reason the RSVP screen is useful at all: the
#: office needs to know who has not answered, which is not the same as who said no.
RsvpState = Literal["pending", "yes", "no"]

ExamResult = Literal["pass", "fail"]


class EventTargetOut(BaseModel):
    target_type: EventTargetType
    target_id: uuid.UUID | None
    #: Resolved for display, so the manager's `7a` list does not need N lookups.
    display_name: str | None = None


class EventOut(BaseModel):
    """One event, as `7a`/`7b` render it.

    `location_id` and `location_text` are both here because §5.12's events happen at
    places that are not the studio's own locations -- a competition is at someone else's
    dojo, and forcing it into the `location` table would fill that table with rows nobody
    schedules against.
    """

    id: uuid.UUID
    type: EventType
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime | None
    location_id: uuid.UUID | None
    location_text: str | None
    rsvp_deadline: datetime | None
    #: §5.12's participation fee. Null is a free event, and zero is not the same thing --
    #: a zero-fee event would create a zero charge and a receipt for nothing.
    fee_agorot: int | None
    requires_consent: bool
    consent_text: str | None
    status: EventStatus
    targets: list[EventTargetOut] = Field(default_factory=list)
    #: Counts for the manager's list. §5.12's whole point is seeing who has not answered.
    rsvp_yes_count: int = 0
    rsvp_no_count: int = 0
    rsvp_pending_count: int = 0
    #: 9i's consent state — how many registrations have a signed consent. Only meaningful
    #: when `requires_consent`; zero otherwise.
    consent_signed_count: int = 0


class EventCreateIn(BaseModel):
    type: EventType
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    starts_at: datetime
    ends_at: datetime | None = None
    location_id: uuid.UUID | None = None
    location_text: str | None = Field(default=None, max_length=200)
    rsvp_deadline: datetime | None = None
    fee_agorot: int | None = Field(default=None, ge=0)
    requires_consent: bool = False
    consent_text: str | None = Field(default=None, max_length=4000)
    targets: list[EventTargetOut] = Field(default_factory=list)

    @model_validator(mode="after")
    def _consent_says_what_is_being_consented_to(self) -> EventCreateIn:
        """§5.8, and the `event_consent_has_text` CHECK on the model.

        The CHECK is the backstop, not the gate. A constraint violation reaches the
        manager as a 500 with no field attached, so the form cannot mark the offending
        input and the manager cannot tell what went wrong -- while the actual failure is
        an ordinary validation error the API should have returned. Enforcing it here is
        what makes the CHECK the thing that never fires.
        """
        if self.requires_consent and not (self.consent_text or "").strip():
            raise ValueError(
                "consent_text is required when requires_consent is set: a consent form "
                "with no text asks a parent to agree to nothing"
            )
        return self

    @model_validator(mode="after")
    def _an_event_does_not_end_before_it_starts(self) -> EventCreateIn:
        """The `event_time_range` CHECK, for the same reason as the consent pairing above.

        Only checked when `ends_at` is given. It is nullable here while the model column is
        not, because §5.8 lets a manager pencil in a date before the schedule is settled --
        so the service supplies the end when it creates the row. That gap is the service's
        to close and is deliberately not papered over here.
        """
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class EventUpdateIn(BaseModel):
    """Every field optional. `status` is absent: publishing and cancelling are their own
    transitions (§5.12 notifies on both), and a PATCH that could flip `draft` to
    `published` as a side effect of an unrelated edit would send the club a surprise."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location_id: uuid.UUID | None = None
    location_text: str | None = Field(default=None, max_length=200)
    rsvp_deadline: datetime | None = None
    fee_agorot: int | None = Field(default=None, ge=0)
    requires_consent: bool | None = None
    consent_text: str | None = Field(default=None, max_length=4000)
    targets: list[EventTargetOut] | None = None


class EventRegistrationOut(BaseModel):
    """One student's answer.

    `charge_id` rather than an amount. The fee is a `charge` created through
    `BillingService.create_charge`, so a registration row never holds money and the ledger
    stays the only place a family's balance is computed from.

    `consent_signed_at` is a timestamp, not the consent contents. §14's parental consent
    for a competition is a health-adjacent record about a minor; what a manager's list
    needs is whether it was signed, and the contents live behind an audit-logged read.
    """

    id: uuid.UUID
    event_id: uuid.UUID
    student_id: uuid.UUID
    student_display_name: str
    rsvp: RsvpState
    responded_by_person_id: uuid.UUID | None
    responded_at: datetime | None
    consent_signed_at: datetime | None
    charge_id: uuid.UUID | None
    #: §5.12 — recorded after the event, and distinct from `rsvp`. A family that said yes
    #: and did not come is exactly the row the office wants to see.
    attended: bool | None


class RsvpIn(BaseModel):
    """A parent answering. `pending` is not accepted -- it is the absence of an answer,
    and letting a caller send it would make "un-answer" a supported action that the office
    would then have to interpret."""

    rsvp: Literal["yes", "no"]


class EventExamResultOut(BaseModel):
    """§5.13's grading, recorded against the exam event that produced it.

    A pass here is what M7 turns into a `student_belt` row. Keeping the result and the
    award separate means a mistaken pass can be corrected without inventing a belt history
    the student never had.
    """

    id: uuid.UUID
    event_id: uuid.UUID
    student_id: uuid.UUID
    student_display_name: str
    belt_rank_id: uuid.UUID
    belt_rank_name: str
    result: ExamResult
    examiner_person_id: uuid.UUID | None
    note: str | None


class EventExamResultIn(BaseModel):
    student_id: uuid.UUID
    belt_rank_id: uuid.UUID
    result: ExamResult
    note: str | None = Field(default=None, max_length=500)


EventPage = CursorPage[EventOut]
EventRegistrationPage = CursorPage[EventRegistrationOut]
EventExamResultPage = CursorPage[EventExamResultOut]
