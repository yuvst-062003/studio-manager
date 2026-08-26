"""ship-audit fixes: runtime role LOGIN, audit actor FK to SET NULL

Revision ID: 0011
Revises: b943f8b4b4ee

Two defects the W0-W6 ship audit proved on a fresh database, one revision because both
are schema-owned facts the environments had silently diverged on.

**B1 -- the runtime role could not log in anywhere revision 0001 was the only source.**
docker-compose.yml deliberately dropped the initdb hook ("the runtime role comes from
revision 0001 in every environment") while 0001 creates the role NOLOGIN, its comment
still assuming the deleted init script grants LOGIN. Fresh local databases and CI's
service container both got a role that exists and cannot connect, and every API request
answered 500. LOGIN is an attribute, not a credential -- no password is expressed here,
and under scram a passwordless role still cannot authenticate, so environments where
infrastructure already provisioned the role (Railway) see a no-op.

**B6 -- HB-e2e-demo-reset.** audit_log is NEVER_WIPED and `person` is wiped, so the
first audited action a demo person takes made every later demo reset fail on the actor
foreign key: RESTRICT. app/models/audit.py reasoned RESTRICT never fires because SPEC
11.4 anonymizes rather than deletes -- true for GDPR, false for the demo wipe, which
deletes. SET NULL keeps 11.2 intact (the record survives, append-only by grant is
untouched); only the pointer to a person who no longer exists is cleared, which is also
what the record honestly knows once the person is gone.
"""

from collections.abc import Sequence

from alembic import op
from app.core.config import settings

revision: str = "0011"
down_revision: str | None = "b943f8b4b4ee"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute(f"ALTER ROLE {settings.APP_DB_ROLE} WITH LOGIN")
    op.drop_constraint("fk_audit_log_actor_person_id_person", "audit_log", type_="foreignkey")
    op.create_foreign_key(
        "fk_audit_log_actor_person_id_person",
        "audit_log",
        "person",
        ["actor_person_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # The identity half too, exactly as docs/plan's proven pending migration wrote it: an
    # account deletion that removes an auth_identity row must not be blocked by the trail
    # of what that account once did, for the same reason as the person half above.
    op.drop_constraint(
        "fk_audit_log_actor_identity_id_auth_identity", "audit_log", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_audit_log_actor_identity_id_auth_identity",
        "audit_log",
        "auth_identity",
        ["actor_identity_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # LOGIN is left in place: revoking it would re-break every environment that has no
    # other source for it, which is the defect this revision exists to close.
    op.drop_constraint("fk_audit_log_actor_person_id_person", "audit_log", type_="foreignkey")
    op.create_foreign_key(
        "fk_audit_log_actor_person_id_person",
        "audit_log",
        "person",
        ["actor_person_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint(
        "fk_audit_log_actor_identity_id_auth_identity", "audit_log", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_audit_log_actor_identity_id_auth_identity",
        "audit_log",
        "auth_identity",
        ["actor_identity_id"],
        ["id"],
        ondelete="RESTRICT",
    )
