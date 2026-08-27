"""cash requests and the onboarding link

Revision ID: 0012
Revises: 0011

Two features from the post-W6 feature pass, one revision because main owns this
directory and they land together.

**cash_request** -- 'I will pay cash' as a first-class object. §5.10 records cash after
the fact; until now the parent's side of that conversation happened on WhatsApp. A payer
raises a request over specific open charges; a manager confirms (records the cash
payment through the one BillingService writer) or declines (the charges stay open and
the parent is told). The amount is a snapshot for display -- settlement always recomputes
from the charges at confirmation time, so a request raised before a partial card payment
cannot over-collect.

**onboarding_link** -- docs/onboarding-link-spec.md (§5.4b draft). One studio-level URL,
7-day expiry, revocable, token stored only as SHA-256 (same reasoning as
invitation.token_hash). student.source = 'onboarding_link' reuses the existing column;
no schema change on student.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cash_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payer_person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="pending"),
        sa.Column("total_agorot", sa.Integer(), nullable=False),
        sa.Column("decided_by_person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'received', 'declined')", name="cash_request_status"
        ),
        sa.CheckConstraint("total_agorot > 0", name="cash_request_total_positive"),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name="fk_cash_request_studio_id_studio",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payer_person_id"],
            ["person.id"],
            name="fk_cash_request_payer_person_id_person",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by_person_id"],
            ["person.id"],
            name="fk_cash_request_decided_by_person_id_person",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cash_request"),
    )
    op.create_index("ix_cash_request_studio_id_id", "cash_request", ["studio_id", "id"])
    op.create_index("ix_cash_request_studio_id_status", "cash_request", ["studio_id", "status"])
    op.create_index(
        "ix_cash_request_studio_id_payer_person_id",
        "cash_request",
        ["studio_id", "payer_person_id"],
    )

    op.create_table(
        "cash_request_charge",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cash_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("charge_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name="fk_cash_request_charge_studio_id_studio",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["cash_request_id"],
            ["cash_request.id"],
            name="fk_cash_request_charge_cash_request_id_cash_request",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["charge_id"],
            ["charge.id"],
            name="fk_cash_request_charge_charge_id_charge",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cash_request_charge"),
        sa.UniqueConstraint(
            "cash_request_id", "charge_id", name="uq_cash_request_charge_request_charge"
        ),
    )
    op.create_index(
        "ix_cash_request_charge_studio_id_id", "cash_request_charge", ["studio_id", "id"]
    )
    op.create_index("ix_cash_request_charge_charge_id", "cash_request_charge", ["charge_id"])

    op.create_table(
        "onboarding_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name="fk_onboarding_link_studio_id_studio",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_person_id"],
            ["person.id"],
            name="fk_onboarding_link_created_by_person_id_person",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_onboarding_link"),
        sa.UniqueConstraint("token_hash", name="uq_onboarding_link_token_hash"),
    )
    op.create_index("ix_onboarding_link_studio_id_id", "onboarding_link", ["studio_id", "id"])


def downgrade() -> None:
    op.drop_table("onboarding_link")
    op.drop_table("cash_request_charge")
    op.drop_table("cash_request")
