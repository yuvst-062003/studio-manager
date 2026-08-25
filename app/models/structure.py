"""SPEC §4.3's 'Structure and schedule' block, minus the schedule.

M1 owns `location`, `class`, `group` and `group_staff` because both W2 lanes import all
four: M2 hangs `group_schedule_rule` and `session` off `group`, and M5 hangs attendance
off `session`. Two lanes building this concurrently is precisely the collision W1 is
sequential to avoid.

`training_year`, `studio_closure`, `group_schedule_rule`, `session` and `session_staff`
are M2's and are deliberately absent -- a test in tests/structure asserts they have not
crept in.

§4.3 reaches a group through its class and gives `group` no `studio_id` of its own. G9
and invariant 2 are unconditional, so it is denormalized one level here: the tenant
filter stays a single predicate rather than becoming a join, which is what lets
`TenantSession` apply it to every query without knowing the schema.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 -- group_staff role(lead_coach|assistant_coach). A manager is not group staff;
#: a manager is a studio-scoped role_assignment (§3.1).
GROUP_STAFF_ROLES = ("lead_coach", "assistant_coach")


class Location(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `location  studio_id, name, address, notes`. M2's schedule rules point
    at these; M1 creates them in the setup wizard's step 5."""

    __tablename__ = "location"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)


class Class(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """`class` is a legal SQL table name and a Python keyword, which is why the mapped
    class is `Class` and every reference names the table rather than the attribute."""

    __tablename__ = "class"
    __tenant_table_args__ = (Index("uq_class_studio_id_name", "studio_id", "name", unique=True),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discipline: Mapped[str | None] = mapped_column(String(60))
    # G13 -- a token name, never a hex literal. The wizard offers the palette; what is
    # stored is which token was chosen, so a theme change does not have to rewrite rows.
    color: Mapped[str | None] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Group(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "group"
    __tenant_table_args__ = (
        CheckConstraint(
            "age_min IS NULL OR age_max IS NULL OR age_min <= age_max", name="group_age_range"
        ),
        # Unique inside the CLASS, not the studio: 'מתחילים' under both ג'ודו and קראטה
        # is two real groups, and a studio-wide unique would forbid the second.
        Index("uq_group_class_id_name", "class_id", "name", unique=True),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("class.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    age_min: Mapped[int | None] = mapped_column(Integer)
    age_max: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class GroupStaff(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `group_staff  group_id, person_id, role(lead_coach|assistant_coach),
    from, to?`. `from` and `to` are SQL reserved words, so the columns are `from_date`
    and `to_date`."""

    __tablename__ = "group_staff"
    __tenant_table_args__ = (
        CheckConstraint("role IN ('lead_coach', 'assistant_coach')", name="group_staff_role"),
        CheckConstraint("to_date IS NULL OR to_date >= from_date", name="group_staff_date_range"),
        # One live assignment per (group, person). A coach re-added to a group they
        # already lead is a duplicate, and a duplicate is what makes §3.2's 'view
        # students in own groups' return the same roster twice.
        Index(
            "uq_group_staff_live",
            "group_id",
            "person_id",
            unique=True,
            postgresql_where=text("to_date IS NULL"),
        ),
        Index("ix_group_staff_studio_id_person_id", "studio_id", "person_id"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="RESTRICT"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date | None] = mapped_column(Date)
