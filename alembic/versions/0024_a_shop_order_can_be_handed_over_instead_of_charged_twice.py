"""a shop order can be handed over, instead of being charged for twice

Revision ID: 0024
Revises: 0023

**The defect.** The club shop has two halves that did not know about each other. A parent
orders a גי in the parent app and `POST /me/orders/items` raises a `charge` carrying
`product_id`; the parent app then promises them, in `billing.shop.deliveryNote`, "מסירה
אישית ובטוחה ישירות מהמאמן בתחילת האימון לאחר וידוא מידה". On the mat the coach opens
`11a`'s hand-over sheet, which knows nothing about orders already placed, picks the same
item, and `POST /charges/from-product` raises a SECOND charge for it. The family pays
twice, nothing warns anybody, and the two rows are indistinguishable from a family that
genuinely bought two.

**`charge.handed_over_at`** is the fact that was missing: not whether the item was PAID
for -- `status` already answers that and answers it differently -- but whether it has left
the club's hands. Nullable, because most charges are tuition and will never have one, and
because NULL is the honest value for every row that existed before this column: nobody
recorded a hand-over date, so nobody can claim one now.

**No backfill, deliberately.** Every existing shop charge is left NULL, which reads as
"waiting to be handed over" and will put a row in front of a coach for an item a family may
already be holding. That is the safe direction of the two errors: a coach glancing at a
list and saying "you already have that" costs a sentence, while stamping history as
delivered would hide a real undelivered order behind a claim this migration has no evidence
for.

**The index is (studio_id, payer_person_id) filtered to shop rows still waiting.** The
query it exists for runs once per student on a hand-over sheet -- "what has this family
ordered and not yet received" -- and a partial index keeps it proportional to the orders
outstanding rather than to every charge the club has ever raised. `product_id IS NOT NULL`
is in the predicate as well as `handed_over_at IS NULL`: tuition is the overwhelming
majority of this table and none of it is ever handed over, so without that term the index
would carry every unpaid month in the club's history.

The downgrade drops both and loses only what this column recorded, which is exactly the
hand-over dates written after it shipped.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | Sequence[str] | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("charge", sa.Column("handed_over_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_charge_studio_id_payer_person_id_awaiting_handout",
        "charge",
        ["studio_id", "payer_person_id"],
        postgresql_where=sa.text("product_id IS NOT NULL AND handed_over_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_charge_studio_id_payer_person_id_awaiting_handout", table_name="charge")
    op.drop_column("charge", "handed_over_at")
