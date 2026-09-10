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

#: What a group IS, for the purposes of a training plan.
#:
#: `base` -- one per student, assigned by the coach, included in every plan, never marked.
#: `extra` -- spent from the plan's weekly allowance by marking.
#: `private` -- requires a plan with an unlimited allowance.
#:
#: **Not derived from `class` and not from the printed colour.** Sunday's Judo 8-12 is a
#: judo class in every other sense and is printed the same blue as the base groups, but
#: functionally it is an extra. The manager sets this per group, explicitly.
#:
#: There is deliberately no `team` kind. An earlier draft had one, on the assumption that
#: the coach selects the competition squad; the manager corrected it -- students put
#: THEMSELVES on the competition teams, which is exactly an extra.
GROUP_KINDS = ("base", "extra", "private")


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
        CheckConstraint("kind IN ('base', 'extra', 'private')", name="group_kind"),
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
    #: `base` / `extra` / `private` -- see GROUP_KINDS. Every rule in the training-plans
    #: design depends on this column and nothing else in that design is possible until it
    #: exists.
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="base")
    #: Eligibility comes from an active `enrollment` the manager creates, not from
    #: `group_eligibility`.
    #:
    #: **This is what the Girls Team uses, and why `person` gains no gender column.**
    #: `person` carries first name, last name, birthdate, phone, email and locale -- and no
    #: gender. Enforcing "girls only" in software would mean adding a personal-data field
    #: about minors to a system built to be careful with exactly that, for the sake of one
    #: group's filter. An invite list reuses machinery that already exists, adds no new
    #: personal data, and leaves a path open if the manager ever wants to hand-pick a squad.
    is_invite_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


#: The roles a coach holds ON A CLASS. Deliberately the same two as `GROUP_STAFF_ROLES`
#: rather than a new pair: "main coach" and "assistant" mean the same thing at both levels,
#: and a second vocabulary for one idea is how two screens end up disagreeing about who runs
#: a class. `manager` is NOT here -- a manager scoped to a class is a `role_assignment` with
#: `scope_type='class'`, because a manager is not on the mat.
CLASS_STAFF_ROLES = ("lead_coach", "assistant_coach")


class ClassStaff(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """Who coaches a class, and which of them runs it.

    Owner, 2026-09-09: "per class there is its own class main coach and assistance coaches.
    They are not shareable between classes. If a coach is in both, the studio manager needs
    to add his details in both classes."

    Until this existed, coaching was recorded one level DOWN -- on the group -- so "who
    coaches judo" could only be derived from the groups a person happened to be on, and "who
    is judo's main coach" could not be said at all. `uq_class_staff_live` is what makes the
    owner's sentence literally true: one live row per (class, person), so a coach who
    teaches judo AND karate holds two rows and leaving one leaves the other standing.

    **This roster is what makes an assignment legal.** `StructureService.assign_staff`
    refuses a coach who is not on the roster of the group's class, and the session staffing
    path refuses the same. That is the rule the owner asked for -- "only class coaches can be
    assigned to the class" -- and it lives here rather than in a screen, because a screen
    that merely hides someone is a screen an API call goes around.
    """

    __tablename__ = "class_staff"
    __tenant_table_args__ = (
        CheckConstraint("role IN ('lead_coach', 'assistant_coach')", name="class_staff_role"),
        CheckConstraint("to_date IS NULL OR to_date >= from_date", name="class_staff_date_range"),
        Index(
            "uq_class_staff_live",
            "class_id",
            "person_id",
            unique=True,
            postgresql_where=text("to_date IS NULL"),
        ),
        Index("ix_class_staff_studio_id_class_id", "studio_id", "class_id"),
        Index("ix_class_staff_studio_id_person_id", "studio_id", "person_id"),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("class.id", ondelete="RESTRICT"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date | None] = mapped_column(Date)


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
