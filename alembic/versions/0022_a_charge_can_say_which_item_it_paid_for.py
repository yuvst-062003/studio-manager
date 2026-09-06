"""a charge can say which catalogue item it paid for

Revision ID: 0022
Revises: 0021

The parent app's "ההזמנות שלי" could not be built without this. A shop order writes
`kind='manual'`, and so does a manager's ad-hoc charge -- including SPEC 5.10's *negative*
credit or discount. Nothing on the row said which was which, so a family's purchase history
would have listed a discount as a purchase of minus two hundred shekels, and `created_by`
cannot answer it because both really are manual.

**Nullable, and nothing is backfilled.** Most charges are tuition and point at no product;
orders placed before this column existed keep a NULL and simply do not appear in the
history. Backfilling them by guessing from `proration_note` would be reading a label a
manager can type freely and calling the result a foreign key.

**RESTRICT, not CASCADE.** SPEC 11.4's rule that a financial row is never deleted applies to
what it points at as well: a club retires a product with `is_active`, and `Product` has no
delete path today. If one is ever added, a charge naming that product must block it rather
than silently lose what a family bought.

**Indexed on (studio_id, product_id).** The read this exists for is "this payer's charges
that came from the shop", and it runs inside a tenant filter, so the studio leads -- G9's
shape for every tenant index in this schema.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022"
down_revision: str | Sequence[str] | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "charge",
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_charge_product_id",
        "charge",
        "product",
        ["product_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_charge_studio_id_product_id", "charge", ["studio_id", "product_id"])


def downgrade() -> None:
    op.drop_index("ix_charge_studio_id_product_id", table_name="charge")
    op.drop_constraint("fk_charge_product_id", "charge", type_="foreignkey")
    op.drop_column("charge", "product_id")
