"""grant the runtime role SELECT on alembic_version

Revision ID: 0004
Revises: 0003

`/api/v1/health` reports the revision the *database* is at, so an environment running
last week's migrations is visible rather than merely suspected. Reading it from
alembic/versions/ instead would report what the image ships, which is the exact drift
the field exists to surface.

The grant is needed because 0001 hands out table rights with ALTER DEFAULT PRIVILEGES,
and that only covers tables created *afterwards* by the migrator. Alembic creates
`alembic_version` before any revision runs, so it was never covered.

SELECT only, deliberately. SPEC 11.2's two-role split exists so the runtime role cannot
own or alter the schema and cannot UPDATE or DELETE audit_log; reading one revision hash
from a single-row table takes nothing away from that. INSERT, UPDATE and DELETE stay
with the migrator, so the app still cannot forge migration state.
"""

from collections.abc import Sequence

from alembic import op

from app.core.config import settings

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute(f"GRANT SELECT ON alembic_version TO {settings.APP_DB_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE SELECT ON alembic_version FROM {settings.APP_DB_ROLE}")
