"""SPEC §4.3's events block -- competitions, belt exams, seminars and trips (§5.8).

**An event never writes a billing table.** Plan W4: "Event fees call
`BillingService.create_charge(kind='event')`. The events lane never writes to a billing
table directly." So `event.fee_agorot` is the *price of the event* -- a setting -- while
what a family actually owes is a `charge`, reached through `event_registration.charge_id`.
There is deliberately no amount on the registration: a second copy of what is owed is a
second source of truth that will eventually disagree with the ledger.

**D9.2 -- there is no weight category anywhere in this module.** Artboard `7c` drew a
`משקל / קטגוריה` column and it is cut: §2.2 defers weight categories to v2 and they imply
`student` fields §4.3 does not carry. RSVP counts, parent consent and payment status --
the rest of `7c` -- all stand.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 -- `event  type(competition|belt_exam|seminar|joint_training|trip|other)`.
EVENT_TYPES = ("competition", "belt_exam", "seminar", "joint_training", "trip", "other")

#: §4.3 -- `event  status(draft|published|cancelled|completed)`. Nothing is visible to a
#: guardian while it is `draft`, which is what makes an event safe to build up over days.
EVENT_STATUSES = ("draft", "published", "cancelled", "completed")

#: §4.3 -- `event_target  target_type(studio|class|group|student)`. §5.8's targeting.
EVENT_TARGET_TYPES = ("studio", "class", "group", "student")

#: §4.3 -- `event_registration  rsvp(pending|yes|no)`. `pending` is a real state: nobody
#: has answered yet, which is different from having declined.
RSVP_STATES = ("pending", "yes", "no")

#: §4.3 -- `event_exam_result  result(pass|fail)`.
EXAM_RESULTS = ("pass", "fail")


class Event(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3's `event`. Dashboard artboards `7a`, `7b`, `7c`.

    `location_id` **or** `location_text`: §5.8 allows an external venue that is not one of
    the studio's own locations, and a competition in another city is the common case. Both
    nullable, because a seminar at the club needs neither until it is scheduled.
    """

    __tablename__ = "event"
    __tenant_table_args__ = (
        CheckConstraint(
            "type IN ('competition', 'belt_exam', 'seminar', 'joint_training', 'trip', 'other')",
            name="event_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'cancelled', 'completed')", name="event_status"
        ),
        CheckConstraint("ends_at > starts_at", name="event_time_range"),
        CheckConstraint("fee_agorot IS NULL OR fee_agorot >= 0", name="event_fee_non_negative"),
        # §5.8 -- consent text is required when consent is required, or the parent is
        # asked to agree to nothing.
        CheckConstraint(
            "requires_consent = false OR consent_text IS NOT NULL",
            name="event_consent_has_text",
        ),
        Index("ix_event_studio_id_starts_at", "studio_id", "starts_at"),
    )

    type: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("location.id", ondelete="SET NULL")
    )
    #: An external venue. §5.8 -- a competition in another city is not a studio location.
    location_text: Mapped[str | None] = mapped_column(String(300))
    rsvp_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: The event's **price**, a setting. What a family owes is a `charge` -- see the
    #: module docstring.
    fee_agorot: Mapped[int | None] = mapped_column(Integer)
    requires_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft")


class EventTarget(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- who the event is for. §5.8's targeting: the whole studio, a class, a group,
    or named students. Several rows compose, so "both beginner groups plus three seniors"
    is three rows rather than a query language.

    `target_id` carries no foreign key because the referent depends on `target_type`, and a
    polymorphic reference cannot have one. It is nullable for `target_type='studio'`, which
    names no particular row.
    """

    __tablename__ = "event_target"
    __tenant_table_args__ = (
        CheckConstraint(
            "target_type IN ('studio', 'class', 'group', 'student')", name="event_target_type"
        ),
        CheckConstraint(
            "target_type = 'studio' OR target_id IS NOT NULL", name="event_target_has_an_id"
        ),
        Index("uq_event_target", "event_id", "target_type", "target_id", unique=True),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    target_type: Mapped[str] = mapped_column(String(10), nullable=False)
    target_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))


class EventRegistration(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- one student's participation in one event. Parent artboard `7d`.

    **No money column, deliberately.** `charge_id` points at the ledger's row; an
    `amount_agorot` here would be a second answer to what the family owes, and the two
    would diverge the first time a manager applied a discount. See the module docstring.

    `attended` is separate from `rsvp`: saying yes and turning up are different facts, and
    §5.8's post-event report is about the second one.
    """

    __tablename__ = "event_registration"
    __tenant_table_args__ = (
        CheckConstraint("rsvp IN ('pending', 'yes', 'no')", name="event_registration_rsvp"),
        Index("uq_event_registration", "event_id", "student_id", unique=True),
        Index("ix_event_registration_student_id", "student_id"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    rsvp: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    responded_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: The ledger's row. Created by `BillingService.create_charge(kind='event')` -- the
    #: events lane never writes a billing table itself.
    charge_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("charge.id", ondelete="SET NULL")
    )
    attended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class EventExamResult(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `event_exam_result  event_id, student_id, belt_rank_id, result(pass|fail),
    examiner_person_id, note?`. Staff artboard `9d`, dashboard `4d`.

    A `fail` is recorded, not omitted. §5.9's eligibility view needs to know that a student
    was examined and did not pass -- an absent row would read as "never examined", which is
    a different conversation with a parent.
    """

    __tablename__ = "event_exam_result"
    __tenant_table_args__ = (
        CheckConstraint("result IN ('pass', 'fail')", name="event_exam_result_result"),
        Index("uq_event_exam_result", "event_id", "student_id", unique=True),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    belt_rank_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("belt_rank.id", ondelete="RESTRICT"), nullable=False
    )
    result: Mapped[str] = mapped_column(String(4), nullable=False)
    examiner_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(Text)
