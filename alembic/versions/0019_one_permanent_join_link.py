"""one permanent join link the club can always copy

Revision ID: 0019
Revises: 0018

The join link was a one-time secret with a seven-day life, and both halves cost the club
more than they protected (owner report, 2026-08-31).

**It could not be copied twice.** Only the token's SHA-256 was stored, so a manager who
reloaded the page saw "פעיל · יפוג 6 בספטמבר" and no way to reach the link itself. The
card the spec draws carries a permanent העתקה button; a hash-only row could never serve
it. `token_encrypted` holds the token under `app/core/encryption.py`, whose keyring lives
in Railway secrets and never in this database -- so "a database read yields no usable
link", the sentence the hash existed to satisfy, still holds.

**It expired in seven days.** The spec justified that as convenience rather than safety
("regeneration is one tap"), while every family joining mid-season cost the manager a
regenerate -- and each regenerate silently killed the link already sitting in the club's
WhatsApp groups. Revocation, unchanged and instant, is what actually answers a leak;
`revoked_at` was always the real control. `expires_at` becomes nullable, NULL meaning
never, and stays a column rather than being dropped so a time-boxed link needs no second
migration.

**Nothing is backfilled.** Rows written before this revision keep their date and their
unrecoverable token; they age out on their own, and the card offers those a regenerate
rather than a copy it cannot honour.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | Sequence[str] | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "onboarding_link",
        sa.Column("token_encrypted", sa.LargeBinary(), nullable=True),
    )
    op.alter_column(
        "onboarding_link",
        "expires_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )


def downgrade() -> None:
    # Every row must carry a date again before the NOT NULL can come back. A permanent
    # link becomes a week-long one rather than blocking the downgrade -- the same seven
    # days this revision removed.
    op.execute(
        "UPDATE onboarding_link SET expires_at = created_at + INTERVAL \'7 days\' "
        "WHERE expires_at IS NULL"
    )
    op.alter_column(
        "onboarding_link",
        "expires_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.drop_column("onboarding_link", "token_encrypted")
