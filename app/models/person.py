"""SPEC §3.3 -- the tenant-scoped half of the identity model.

Four entities, deliberately separated, and one negative that carries more weight than
any of them: **guardian is not a role** (§3.1). There is no `guardian` member in ROLES
and no code path that grants one. A person is a guardian because a row exists in
`guardian` linking them to a child, which is what makes §6.1's app access a query rather
than a role check -- and what keeps the staff app and the parent app asking two different
questions.

`guardian` lands here in M1 rather than in W2's contract commit (D-M1-1). Two of M1's own
deliverables need it: §6.1's parent-app query is literally
``EXISTS(guardian WHERE person_id = :me)``, and §19.3's personas are seeded with their
guardian links. `student` is still M3's, so `guardian.student_id` is a plain UUID with no
foreign key -- the same pattern app/models/audit.py used for its actor columns until this
milestone landed the tables they point at. W2's contract commit adds the constraint
instead of creating the table.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §3.1's staff roles. `guardian` is deliberately absent and must stay absent.
ROLES = ("owner", "manager", "lead_coach", "assistant_coach")
SCOPE_TYPES = ("studio", "class", "group")

#: What an invitation may invite someone to BECOME. Wider than ROLES on purpose, and
#: only here: accepting a guardian invitation creates a `guardian` row, never a
#: role_assignment (§3.1). The two enums differ because they answer different questions.
INTENDED_ROLES = (*ROLES, "guardian")


class Person(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§3.3 -- 'a human profile inside one studio. A person does not need a login.'"""

    __tablename__ = "person"
    __tenant_table_args__ = (
        # §5.2's identity resolution walks identity -> persons across every studio, so
        # this index is read under with_all_tenants and is deliberately not composite.
        Index("ix_person_auth_identity_id", "auth_identity_id"),
        # §5.3 -- an invitation is matched to a pre-created Person by verified email or
        # phone. Scoped, because that match always happens inside one studio.
        Index("ix_person_studio_id_email", "studio_id", "email"),
        Index("ix_person_studio_id_phone", "studio_id", "phone"),
    )

    auth_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT")
    )
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    birthdate: Mapped[date | None] = mapped_column(Date)
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(320))
    photo_object_key: Mapped[str | None] = mapped_column(String(500))
    locale: Mapped[str | None] = mapped_column(String(8))
    # §11.4 and §3.3 point 5 -- anonymization wipes the Person and leaves financial rows
    # intact, because financial rows never duplicate a name. M9 writes it; the column
    # exists from the start so no later migration has to rewrite this table.
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RoleAssignment(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§3.1 -- '(person, role, scope_type, scope_id), revocable.'"""

    __tablename__ = "role_assignment"
    __tenant_table_args__ = (
        CheckConstraint(
            "role IN ('owner', 'manager', 'lead_coach', 'assistant_coach')",
            name="role_assignment_role",
        ),
        CheckConstraint(
            "scope_type IN ('studio', 'class', 'group')", name="role_assignment_scope_type"
        ),
        # §3.1 -- 'owner: exactly one; cannot be removed.' Partial, so a revoked owner
        # row does not block naming a successor, and so the constraint says exactly what
        # §3.1 says rather than something stricter than it.
        Index(
            "uq_role_assignment_one_live_owner",
            "studio_id",
            unique=True,
            postgresql_where=text("role = 'owner' AND revoked_at IS NULL"),
        ),
        # A second live grant of the same role on the same scope is a duplicate, not a
        # second grant -- and a duplicate is what makes a revocation look like it only
        # half-worked. COALESCE, because scope_id is NULL for a studio-wide role and
        # NULL never equals NULL in a unique index.
        Index(
            "uq_role_assignment_live",
            "studio_id",
            "person_id",
            "role",
            "scope_type",
            text("COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
        # §6.1's staff-app query: EXISTS(role_assignment WHERE person_id = :me AND
        # revoked_at IS NULL).
        Index("ix_role_assignment_studio_id_person_id", "studio_id", "person_id"),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(10), nullable=False, default="studio")
    scope_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    granted_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT")
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Invitation(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.1's chain of authority, made durable. §5.3: 'the invitation carries a token
    binding the accepting auth identity to the pre-created Person.'"""

    __tablename__ = "invitation"
    __tenant_table_args__ = (
        UniqueConstraint("token_hash"),
        CheckConstraint(
            "email IS NOT NULL OR phone IS NOT NULL", name="invitation_has_a_recipient"
        ),
        CheckConstraint(
            "intended_role IN ('owner', 'manager', 'lead_coach', 'assistant_coach', 'guardian')",
            name="invitation_intended_role",
        ),
        Index("ix_invitation_studio_id_email", "studio_id", "email"),
    )

    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(32))
    #: See INTENDED_ROLES. 'guardian' is legal here and in no other enum in this file.
    intended_role: Mapped[str] = mapped_column(String(20), nullable=False)
    student_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT")
    )


class Guardian(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§3.3 -- 'a link (person, student, is_primary). This is the only thing that
    connects a parent to anything.'

    D-M1-1: `student_id` carries no foreign key because `student` is M3's table. W2's
    contract commit adds the constraint rather than creating this table.

    §5.3: 'All guardians are equal.' `is_primary` means exactly two things -- whose name
    the bill is addressed to, and which person a הוראת קבע payment is matched to. There
    is no permission branching on it anywhere in the product.
    """

    __tablename__ = "guardian"
    __tenant_table_args__ = (
        UniqueConstraint("student_id", "person_id"),
        # §6.1's parent-app query: EXISTS(guardian WHERE person_id = :me).
        Index("ix_guardian_studio_id_person_id", "studio_id", "person_id"),
        # §5.3 -- 'Exactly one guardian per student carries is_primary.'
        Index(
            "uq_guardian_one_primary_per_student",
            "student_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    relation: Mapped[str] = mapped_column(String(40), nullable=False, default="parent")
