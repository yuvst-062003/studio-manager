"""baseline: roles, default privileges, studio

Revision ID: 0001
Revises:

Roles are created here and not only in the local init script, because environments with
no `docker-entrypoint-initdb.d` hook -- Railway, and GitHub Actions service containers
-- have no other place to get them. SPEC §11.2's append-only audit log needs
`studio_app` to exist before revision 0002 can revoke UPDATE and DELETE from it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.config import settings

revision: str = "0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    role = settings.APP_DB_ROLE
    # NOLOGIN by default: infrastructure grants login and a password out of band, so no
    # credential is ever expressed in a migration. The local init script creates the
    # same role WITH LOGIN under trust auth, and this block is a no-op there.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                CREATE ROLE {role} NOLOGIN;
            END IF;
        END
        $$;
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {role}")
    # FOR ROLE is omitted deliberately: it defaults to current_user, which is whichever
    # role runs migrations in this environment -- studio_migrator locally, the Railway
    # superuser in staging. Naming one would break the other.
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role}"
    )
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO {role}")

    op.create_table(
        "studio",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("logo_object_key", sa.String(length=500), nullable=True),
        sa.Column(
            "timezone", sa.String(length=64), nullable=False, server_default="Asia/Jerusalem"
        ),
        sa.Column("default_locale", sa.String(length=8), nullable=False, server_default="he"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("status IN ('active', 'suspended')", name="studio_status"),
        sa.PrimaryKeyConstraint("id", name="pk_studio"),
        sa.UniqueConstraint("slug", name="uq_studio_slug"),
    )
    # ALTER DEFAULT PRIVILEGES above only covers tables created afterwards by the role
    # that ran it. Grant explicitly too, so a mismatch between the migrating role here
    # and elsewhere cannot silently leave the app without rights.
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON studio TO {role}")


def downgrade() -> None:
    role = settings.APP_DB_ROLE
    op.execute(f"REVOKE ALL ON studio FROM {role}")
    op.drop_table("studio")
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM {role}"
    )
