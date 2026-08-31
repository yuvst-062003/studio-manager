"""a parent can say a child WILL be there, not only that they will not

Revision ID: 0020
Revises: 0019

Until now a parent could tell the club exactly one thing about a lesson: that their child
is not coming. The ABSENCE of that notice carried two different meanings at once -- "we
are coming" and "nobody has looked at this" -- and a coach opening a roster could not tell
them apart. Owner decision, 2026-09-01: make the confirmation real, so the roster shows
three states instead of two.

**A new table rather than a column on `absence_report`.** That table's meaning is "a row
here is a notice of absence", and three readers depend on it: SPEC 10.5's conflict
resolver (a parent pre-report never loses to a bulk action), the roster's
`has_absence_report`, and bulk-present's `respect_absence_reports`. A row that could also
mean the opposite would invert all three silently, which is the failure mode this project
keeps paying for. Two facts, two tables; the service keeps them mutually exclusive,
because a child cannot both be coming and not coming.

**A confirmation writes no `attendance` row**, unlike the absence path. SPEC 5.7 sets the
register to `absent_excused` when a parent cancels, because that outcome is already
settled. "Will attend" is an intention, and SPEC 5.14 needs `unmarked` to keep meaning
"nobody has opened the register" -- pre-filling `present` would report attendance for a
child who never arrived.

**Nothing is backfilled.** Every existing family has answered nothing, which is exactly
what this table represents by having no row for them.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | Sequence[str] | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attendance_confirmation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # TenantMixin's column, written out because a migration cannot inherit the mixin.
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("confirmed_by_person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # RESTRICT, not CASCADE: TenantMixin declares it that way, and a studio row is
        # never deleted out from under the rows that belong to it.
        sa.ForeignKeyConstraint(["studio_id"], ["studio.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["student_id"], ["student.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["session.id"], ondelete="CASCADE"),
        # RESTRICT, matching absence_report: who answered is evidence.
        sa.ForeignKeyConstraint(["confirmed_by_person_id"], ["person.id"], ondelete="RESTRICT"),
    )
    # G9's leading composite index, the one TenantMixin adds to every tenant table.
    op.create_index(
        "ix_attendance_confirmation_studio_id_id",
        "attendance_confirmation",
        ["studio_id", "id"],
    )
    # One answer per (student, session) -- a parent tapping twice is one answer, and the
    # service's upsert needs somewhere to conflict. Not prefixed with studio_id: the
    # mixin's own index covers tenancy, and absence_report's live DDL is the reference.
    op.create_index(
        "uq_attendance_confirmation_student_id_session_id",
        "attendance_confirmation",
        ["student_id", "session_id"],
        unique=True,
    )
    op.create_index(
        "ix_attendance_confirmation_session_id",
        "attendance_confirmation",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_confirmation_session_id", table_name="attendance_confirmation")
    op.drop_index(
        "uq_attendance_confirmation_student_id_session_id",
        table_name="attendance_confirmation",
    )
    op.drop_index("ix_attendance_confirmation_studio_id_id", table_name="attendance_confirmation")
    op.drop_table("attendance_confirmation")
