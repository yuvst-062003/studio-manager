"""demo studio (SPEC 19.1)

Revision ID: 0003
Revises: 0002

SPEC 19.1 -- the demo studio exists in production too, so a live deploy can be
smoke-tested against real infrastructure without touching anyone's data. A migration is
the only thing that runs in every environment on every deploy; a seed script exists only
where someone remembered to run it.

Identified by slug, not a hardcoded UUID: studio.slug already carries a unique
constraint, which is what makes ON CONFLICT (slug) DO NOTHING the migration's
idempotence -- no magic UUID has to agree across a migration, a service and three test
files.
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SETTINGS, DEMO_STUDIO_SLUG

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # §19.1 -- the demo studio exists in production too, so a live deploy can be
    # smoke-tested against real infrastructure without touching anyone's data. A
    # migration is the only thing that runs in every environment on every deploy; a
    # seed script exists only where someone remembered to run it.
    #
    # ON CONFLICT DO NOTHING because migrations re-run against databases that already
    # have the row, and because Task 6's reset restores the row in place rather than
    # recreating it -- the studio id must survive a reset or every fixture reference
    # made after it would dangle.
    op.execute(
        sa.text(
            """
            INSERT INTO studio (id, name, slug, timezone, default_locale, status,
                                is_demo, settings, created_at, updated_at)
            VALUES (gen_random_uuid(), :name, :slug, 'Asia/Jerusalem', 'he', 'active',
                    true, CAST(:settings AS jsonb), now(), now())
            ON CONFLICT (slug) DO NOTHING
            """
        ).bindparams(
            name=DEMO_STUDIO_NAME,
            slug=DEMO_STUDIO_SLUG,
            settings=json.dumps(DEMO_STUDIO_SETTINGS, ensure_ascii=False),
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM studio WHERE slug = :slug AND is_demo").bindparams(
            slug=DEMO_STUDIO_SLUG
        )
    )
