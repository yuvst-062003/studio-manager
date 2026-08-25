"""SPEC §4.3's schedule block — the half `app/models/structure.py` deliberately left out.

M1 owns `location`, `class`, `group` and `group_staff` because both W2 lanes import all
four. This module is the rest: the training year, its closures, the weekly rules, and the
materialized sessions those rules produce.

**Why this is a contract commit and not lane M2's own file.** M3's trial-slot picker is a
pure reader of `session` (plan §1.2), and M5 hangs attendance off it in W3. Three
milestones read this table; one writes it. Landing it before either worktree exists is
what stops two lanes creating it twice.

**`session` is the table E2E-5 is about.** §5.6: changing a rule rewrites **only future**
sessions, and never one carrying `is_manually_edited`. Both of the columns that make that
expressible are here, non-null, from the first revision — a nullable flag would have
`NULL` meaning "we don't know", and "we don't know whether a human edited this" is not a
state a regenerate can safely act on.

`group` reaches its studio through `class`, so §4.3 gives it no `studio_id`. G9 is
unconditional, so every table here denormalizes one level exactly as `structure.py` does:
the tenant filter stays a single predicate rather than becoming a join.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 — `training_year  status(draft|active|closed)`. §5.15's rollover wizard builds a
#: `draft` year across seven resumable steps and **nothing is visible to guardians until
#: it is activated**, which is the whole reason `draft` is a persisted state rather than
#: an in-memory wizard.
TRAINING_YEAR_STATUSES = ("draft", "active", "closed")

#: §5.6 — 'Israeli holiday presets are offered as proposals the manager ticks, never
#: automatic closures.' The column is what makes that auditable after the fact: a closure
#: sourced from a preset was still a human decision, and this records which kind it was.
CLOSURE_SOURCES = ("holiday_preset", "manual")

#: §4.3 — `session  status(scheduled|cancelled|completed)`.
SESSION_STATUSES = ("scheduled", "cancelled", "completed")

#: §4.3 — `session_staff  role`. Mirrors `structure.GROUP_STAFF_ROLES`; a substitute is
#: the `is_substitute` flag, not a third role, because a substitute lead coach is still
#: leading the session.
SESSION_STAFF_ROLES = ("lead_coach", "assistant_coach")


class TrainingYear(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `training_year  studio_id, name, starts_on, ends_on, status`.

    §5.15 makes this the spine of the rollover: sessions, closures and the year's groups
    all hang off it, so "generate every session for the year" is one foreign key rather
    than a date range someone has to remember to filter on.
    """

    __tablename__ = "training_year"
    __tenant_table_args__ = (
        CheckConstraint("status IN ('draft', 'active', 'closed')", name="training_year_status"),
        CheckConstraint("ends_on > starts_on", name="training_year_date_range"),
        Index("uq_training_year_studio_id_name", "studio_id", "name", unique=True),
        # §5.15 — the rollover wizard is resumable, so a studio can hold a draft year
        # while the current one is still active. Exactly one ACTIVE year, any number of
        # drafts and closed ones.
        Index(
            "uq_training_year_one_active",
            "studio_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft")


class StudioClosure(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `studio_closure  studio_id, training_year_id, date_from, date_to, reason,
    source(holiday_preset|manual)`.

    §5.6 is emphatic that holidays are **proposals the manager ticks**. A preset the
    manager never ticked leaves no row here, which is why generation can treat this table
    as the complete and final answer to "is the club closed" without consulting a holiday
    calendar at generation time.
    """

    __tablename__ = "studio_closure"
    __tenant_table_args__ = (
        CheckConstraint("source IN ('holiday_preset', 'manual')", name="studio_closure_source"),
        CheckConstraint("date_to >= date_from", name="studio_closure_date_range"),
        # Session generation scans closures by year, once per group. The composite index
        # is what keeps a full-year generate from re-scanning the table per group.
        Index("ix_studio_closure_training_year_id_date_from", "training_year_id", "date_from"),
    )

    training_year_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("training_year.id", ondelete="CASCADE"), nullable=False
    )
    date_from: Mapped[date] = mapped_column(Date, nullable=False)
    date_to: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")


class GroupScheduleRule(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `group_schedule_rule  group_id, weekday(0-6), start_time, end_time,
    location_id, effective_from, effective_to?`.

    **Versioned by date, never edited in place.** §5.6's impact preview on
    `PUT /groups/{id}/schedule` has to show what will change *before* it changes, and a
    rule rewritten in place has already destroyed the "before". Changing a schedule closes
    the current rule with an `effective_to` and opens a new one.

    `weekday` is 0–6 with **0 = Sunday**, matching Israel's working week and Postgres's
    own `EXTRACT(DOW)`. A Monday-based scale would silently shift every session in the
    product by one day.
    """

    __tablename__ = "group_schedule_rule"
    __tenant_table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="group_schedule_rule_weekday"),
        CheckConstraint("end_time > start_time", name="group_schedule_rule_time_range"),
        CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="group_schedule_rule_effective_range",
        ),
        Index("ix_group_schedule_rule_group_id_weekday", "group_id", "weekday"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("location.id", ondelete="RESTRICT")
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)


class Session(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — the materialized session. **The table E2E-5 is about.**

    §5.6: "changing a rule rewrites only future sessions. Past sessions and any session
    with `is_manually_edited = true` are never overwritten."

    Both flags are non-null with a default, deliberately. A nullable `is_manually_edited`
    would make `NULL` mean "unknown", and a regenerate cannot safely act on "we don't know
    whether a human edited this" — it either destroys a coach's change or refuses to touch
    a machine-made row. Non-null makes the rewrite predicate total.

    `generated_from_rule_id` IS nullable, and that is a different case with a real
    meaning: an ad-hoc session (§5.6, `is_ad_hoc`) came from no rule and must survive
    every regenerate.
    """

    __tablename__ = "session"
    __tenant_table_args__ = (
        CheckConstraint("status IN ('scheduled', 'cancelled', 'completed')", name="session_status"),
        CheckConstraint("ends_at > starts_at", name="session_time_range"),
        CheckConstraint(
            "status <> 'cancelled' OR cancel_reason IS NOT NULL",
            name="session_cancel_reason_required",
        ),
        # The staff app's "Today" and the dashboard's week view are both this index.
        Index("ix_session_studio_id_starts_at", "studio_id", "starts_at"),
        # The regenerate predicate: every session this rule produced, in date order.
        Index("ix_session_group_id_starts_at", "group_id", "starts_at"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="RESTRICT"), nullable=False
    )
    training_year_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("training_year.id", ondelete="RESTRICT"), nullable=False
    )
    # G3 — stored UTC, rendered Asia/Jerusalem. A session is an instant, not a wall clock
    # time: DST is why `starts_at` is timestamptz and the RULE carries a naive `Time`.
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("location.id", ondelete="RESTRICT")
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="scheduled")
    is_manually_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    generated_from_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group_schedule_rule.id", ondelete="SET NULL")
    )
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    is_ad_hoc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SessionStaff(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `session_staff  session_id, person_id, role, is_substitute BOOL`.

    Distinct from `group_staff`: that is who normally coaches the group, this is who
    actually coached **this** session. §5.14's "sessions without a coach" report is the
    difference between the two, and the dashboard's `3d` צוות screen renders it.
    """

    __tablename__ = "session_staff"
    __tenant_table_args__ = (
        CheckConstraint("role IN ('lead_coach', 'assistant_coach')", name="session_staff_role"),
        Index("uq_session_staff_session_id_person_id", "session_id", "person_id", unique=True),
        # The coach filter on staff `9a` היום: my sessions, by date.
        Index("ix_session_staff_studio_id_person_id", "studio_id", "person_id"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_substitute: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SessionNote(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `session_note  session_id, author_person_id, body, deleted_at?`.

    §5.13's coach note on a session (staff `9g` סיכום מפגש). G15 — soft-deleted, because
    it is user-generated content about a child and a hard delete would remove the audit
    trail along with the text.
    """

    __tablename__ = "session_note"
    __tenant_table_args__ = (
        Index("ix_session_note_session_id_created_at", "session_id", "created_at"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    author_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
