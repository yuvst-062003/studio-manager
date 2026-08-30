"""payment promises carry a plan claim, and a standing order is a promise method

Revision ID: 0015
Revises: 00cc140ce237

Owner request (2026-08-30): a parent picking a payment program in the plan screen can
declare "already paid" instead of paying through the app -- cash, cheques, or a standing
order -- and the manager marks whether the money actually arrived. The promise object
already IS that lifecycle, so this widens it rather than inventing a sibling:

* ``method`` gains ``standing_order``. G8 -- the provider cannot confirm a mandate, so
  "I set one up" is a sentence only a manager can settle, which is exactly what a
  promise is. The column widens to 16 because ``standing_order`` is 14 characters.
* ``claimed_plan_id`` + ``claimed_agorot`` are the claim half: which payment program the
  parent says they paid for, priced by the SERVER from the plan row when raised. Frozen
  at claim time -- unlike the charges half, this is money the parent says has already
  changed hands, so a later plan-price change must not re-price it.

``claimed_agorot`` is NOT NULL DEFAULT 0: every promise that exists today has no claim,
and 0 is the honest backfill -- a nullable column would make "no claim" and "not
answered" the same fact twice.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0015"
down_revision: Union[str, Sequence[str], None] = "00cc140ce237"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "payment_promise",
        "method",
        existing_type=sa.String(length=12),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
    op.drop_constraint("payment_promise_method", "payment_promise", type_="check")
    op.create_check_constraint(
        "payment_promise_method",
        "payment_promise",
        "method IN ('cash', 'cheque', 'standing_order')",
    )
    op.add_column(
        "payment_promise",
        sa.Column("claimed_plan_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_payment_promise_claimed_plan_id",
        "payment_promise",
        "price_plan",
        ["claimed_plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "payment_promise",
        sa.Column("claimed_agorot", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "payment_promise_claimed_agorot", "payment_promise", "claimed_agorot >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("payment_promise_claimed_agorot", "payment_promise", type_="check")
    op.drop_column("payment_promise", "claimed_agorot")
    op.drop_constraint("fk_payment_promise_claimed_plan_id", "payment_promise", type_="foreignkey")
    op.drop_column("payment_promise", "claimed_plan_id")
    op.drop_constraint("payment_promise_method", "payment_promise", type_="check")
    op.create_check_constraint(
        "payment_promise_method", "payment_promise", "method IN ('cash', 'cheque')"
    )
    op.alter_column(
        "payment_promise",
        "method",
        existing_type=sa.String(length=16),
        type_=sa.String(length=12),
        existing_nullable=False,
    )
