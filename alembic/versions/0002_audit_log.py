"""audit_log, append-only by grant

Revision ID: 0002
Revises: 0001

The REVOKE is the point. Revision 0001's ALTER DEFAULT PRIVILEGES grants the application
role UPDATE and DELETE on every new table, which is right for every table except this
one, so it is taken back explicitly here. An explicit grant beats the default, and the
test asserts the result rather than the intent.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.config import settings

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    role = settings.APP_DB_ROLE
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_identity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_ip", postgresql.INET(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=60), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("diff", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name="fk_audit_log_studio_id_studio",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
    )
    op.create_index(
        "ix_audit_log_studio_id_entity_type_entity_id",
        "audit_log",
        ["studio_id", "entity_type", "entity_id"],
    )
    op.create_index("ix_audit_log_studio_id_created_at", "audit_log", ["studio_id", "created_at"])

    # SPEC 11.2, the whole of it.
    op.execute(f"REVOKE ALL ON audit_log FROM {role}")
    op.execute(f"GRANT SELECT, INSERT ON audit_log TO {role}")


def downgrade() -> None:
    op.execute(f"REVOKE ALL ON audit_log FROM {settings.APP_DB_ROLE}")
    op.drop_index("ix_audit_log_studio_id_created_at", table_name="audit_log")
    op.drop_index("ix_audit_log_studio_id_entity_type_entity_id", table_name="audit_log")
    op.drop_table("audit_log")
