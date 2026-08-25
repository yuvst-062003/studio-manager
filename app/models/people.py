"""SPEC §4.3's 'Students and guardians' block, plus the enrollment funnel.

`guardian` is **not** here — M1 already landed it in `app/models/person.py`, because §3.3
makes the (person, student, is_primary) link the only thing connecting a parent to
anything and the identity milestone needed it. This module supplies the `student` table
that link points at.

**There is no household or family entity**, and this module must never grow one. §4.3:
"'My children' is simply `SELECT student_id FROM guardian WHERE person_id = me`." A
household table would immediately raise the question of which household a child belongs to
after a separation, and the product has no good answer to that question by design.

**`is_primary` means exactly two things** (§4.3, §5.3): whose name the bill is addressed
to, and which person a הוראת קבע payment is matched to. Every guardian sees and does
exactly the same things, payments included. Nothing in this module branches on it.

**There is no `payment_mode` on a person** (§4.3). A payer is never locked into one way of
paying; §5.10's payments screen always offers all three. What a manager sets is the
*price*, on the group's price plan (W4), never a mode on a person.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encryption import EncryptedJSON
from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 — `student  status(lead|trial|pending_approval|active|frozen|left|lost)`.
#: This is §5.4's funnel, and `student_status_history` records every move between them so
#: `GET /reports/funnel` is a query rather than a guess.
STUDENT_STATUSES = (
    "lead",
    "trial",
    "pending_approval",
    "active",
    "frozen",
    "left",
    "lost",
)

#: §4.3 — `student  health_status(missing|trial_signed|signed)`. **The W3 seam.** M4
#: populates it, M5 renders it through `BootstrapPayload.roster[]`, and neither lane opens
#: the other's file (plan §1.3 seam 4). It lives on `student` rather than being derived
#: per request because a coach's roster must render it offline, from the bootstrap cache.
HEALTH_STATUSES = ("missing", "trial_signed", "signed")

#: §4.3 — `enrollment  status(pending|active|frozen|ended)`. Distinct from the student's
#: own status: a student is `active` in the club while one of their enrollments has
#: `ended` because they moved group mid-year.
ENROLLMENT_STATUSES = ("pending", "active", "frozen", "ended")

#: §4.3 — `trial_booking  outcome(pending|converted|lost)`. §5.4's trial follow-up
#: automation reads this; `lost` is a real outcome and not an absence of one, which is
#: what makes the funnel report's denominator honest.
TRIAL_OUTCOMES = ("pending", "converted", "lost")

#: §4.3 — `registration_request  source(public_link|parent_app|manager)`.
REGISTRATION_SOURCES = ("public_link", "parent_app", "manager")

#: §4.3 — `registration_request  status(pending|approved|rejected)`.
REGISTRATION_STATUSES = ("pending", "approved", "rejected")


class Student(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `student  studio_id, person_id UNIQUE, status, source?, joined_on?,
    left_on?, current_belt_id?, health_status`.

    A student **is** a person (`person_id UNIQUE`), not a copy of one. §3.3's identity
    model allows an adult student who is also their own guardian, and a second name/
    birthdate column here would immediately let the two drift apart.

    `current_belt_id` carries no foreign key: `belt_rank` is W4's table. W4's contract
    commit adds the constraint, exactly as W2's adds `guardian.student_id`'s. A forward
    reference in a `ForeignKey` string would fail at mapper-configuration time, which is
    every test in the suite rather than one.
    """

    __tablename__ = "student"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('lead', 'trial', 'pending_approval', 'active', 'frozen', 'left', 'lost')",
            name="student_status",
        ),
        CheckConstraint(
            "health_status IN ('missing', 'trial_signed', 'signed')",
            name="student_health_status",
        ),
        CheckConstraint(
            "left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on",
            name="student_membership_range",
        ),
        # §5.14's dashboard counts and §11.5's retention job both scan by status.
        Index("ix_student_studio_id_status", "studio_id", "status"),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("person.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="lead")
    source: Mapped[str | None] = mapped_column(String(40))
    joined_on: Mapped[date | None] = mapped_column(Date)
    left_on: Mapped[date | None] = mapped_column(Date)
    #: W4's `belt_rank`. Unconstrained until that wave's contract commit — see the class
    #: docstring.
    current_belt_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    health_status: Mapped[str] = mapped_column(String(15), nullable=False, default="missing")


class StudentFreeze(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `student_freeze  student_id, from_date, to_date?, reason,
    created_by_person_id`.

    §5.10 step 4: "A frozen student generates nothing." The billing run reads this table
    rather than `student.status`, because a freeze is a date range and the run is asking
    about a *period*, not about right now. A student frozen for March and back in April
    is `frozen` today and still owes April.
    """

    __tablename__ = "student_freeze"
    __tenant_table_args__ = (
        CheckConstraint(
            "to_date IS NULL OR to_date >= from_date", name="student_freeze_date_range"
        ),
        Index("ix_student_freeze_student_id_from_date", "student_id", "from_date"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(200))
    created_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )


class StudentStatusHistory(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `student_status_history  student_id, from_status?, to_status, reason?,
    changed_by_person_id?, changed_at`.

    §5.4's funnel is computed from this table. There is deliberately **no `deleted_at`**:
    a row here is a fact that happened, and un-happening a status change would let the
    funnel report disagree with itself between two runs. `from_status` is nullable because
    the first row for a student has no previous state.
    """

    __tablename__ = "student_status_history"
    __tenant_table_args__ = (
        Index("ix_student_status_history_student_id_changed_at", "student_id", "changed_at"),
        # `GET /reports/funnel` groups by destination status over a window.
        Index("ix_student_status_history_studio_id_changed_at", "studio_id", "changed_at"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(200))
    changed_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TrialBooking(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `trial_booking  student_id, session_id?, group_id, booked_at, attended?,
    outcome?, coach_note?, is_override BOOL`.

    §5.4: the public link's **only** job is a first lesson — enrollment is always a
    manager decision. This table is that first lesson and nothing more.

    `is_override` is a manager granting a **second** free trial. It is a column rather
    than a convention because §5.4 makes one free trial the rule, and a second one needs
    to be a deliberate, visible, countable act rather than someone quietly adding a row.

    `attended` is a nullable boolean on purpose — three states. `NULL` is "the lesson has
    not happened yet", which is different from `false`, "they did not turn up". The
    follow-up automation treats those two completely differently.
    """

    __tablename__ = "trial_booking"
    __tenant_table_args__ = (
        CheckConstraint(
            "outcome IS NULL OR outcome IN ('pending', 'converted', 'lost')",
            name="trial_booking_outcome",
        ),
        Index("ix_trial_booking_studio_id_booked_at", "studio_id", "booked_at"),
        Index("ix_trial_booking_student_id", "student_id"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="SET NULL")
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="RESTRICT"), nullable=False
    )
    booked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attended: Mapped[bool | None] = mapped_column(Boolean)
    outcome: Mapped[str | None] = mapped_column(String(12))
    coach_note: Mapped[str | None] = mapped_column(Text)
    is_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Enrollment(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `enrollment  student_id, group_id, status, started_on, ended_on?,
    price_plan_id`.

    The billing run's unit of work: §5.10 step 1 creates one tuition charge per active
    enrollment not covered by a freeze. A student in two groups has two enrollments and
    two charges, which is correct — they are attending twice.

    `price_plan_id` carries no foreign key for the same reason as `student.current_belt_id`
    — `price_plan` is W4's table and W4's contract commit adds the constraint.
    """

    __tablename__ = "enrollment"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'active', 'frozen', 'ended')", name="enrollment_status"
        ),
        CheckConstraint("ended_on IS NULL OR ended_on >= started_on", name="enrollment_date_range"),
        # One live enrollment per (student, group). A student re-added to a group they are
        # already in is a duplicate, and a duplicate here bills them twice.
        Index(
            "uq_enrollment_live",
            "student_id",
            "group_id",
            unique=True,
            postgresql_where=text("ended_on IS NULL"),
        ),
        # The billing run's scan: every active enrollment in the studio.
        Index("ix_enrollment_studio_id_status", "studio_id", "status"),
        Index("ix_enrollment_group_id_status", "group_id", "status"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    started_on: Mapped[date] = mapped_column(Date, nullable=False)
    ended_on: Mapped[date | None] = mapped_column(Date)
    #: W4's `price_plan`. Unconstrained until that wave — see the class docstring.
    price_plan_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))


class RegistrationRequest(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `registration_request  studio_id, source, payload_encrypted,
    matched_person_id?, status, submitted_at, reviewed_by_person_id?, reviewed_at?`.

    **The payload is encrypted at rest** (§11.1, `EncryptedJSON`). An unapproved
    registration is a stranger's personal data about a minor sitting in a queue — name,
    birthdate, phone, and under §5.4a a trial health declaration. It is the one table in
    W2 holding data nobody in the studio has yet agreed to receive, so it is the one that
    cannot sit in plaintext.

    `matched_person_id` is §5.4's person-and-child matching on **verified email or phone**.
    Nullable: a genuinely new family matches nobody, and that is the common case.
    """

    __tablename__ = "registration_request"
    __tenant_table_args__ = (
        CheckConstraint(
            "source IN ('public_link', 'parent_app', 'manager')",
            name="registration_request_source",
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="registration_request_status"
        ),
        CheckConstraint(
            "status = 'pending' OR reviewed_at IS NOT NULL",
            name="registration_request_review_recorded",
        ),
        # The approval queue on dashboard `6c`: pending first, oldest first.
        Index("ix_registration_request_studio_id_status", "studio_id", "status"),
    )

    source: Mapped[str] = mapped_column(String(20), nullable=False)
    #: G7-adjacent: never log this, never put it in an audit `diff`. §11.2 is explicit
    #: that health contents never reach `audit_log.diff`, and under §5.4a this payload
    #: can carry a trial declaration's answers.
    payload_encrypted: Mapped[Any] = mapped_column(
        EncryptedJSON("registration_request.payload_encrypted"), nullable=False
    )
    matched_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
