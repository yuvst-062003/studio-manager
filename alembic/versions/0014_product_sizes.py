"""product sizes -- a sellable item says which sizes it comes in, or that it comes in none

Revision ID: 0014
Revises: 0013

§4.3's catalogue is "גי, חגורה, כפפות, דמי ביטוח" and two of those four are ordered in a
size while the other two are not. The manager decides which per item, on the wizard's items
step and on the items screen; the parent then picks a size when they order one.

**One column, not two.** The emptiness of `sizes` IS "this item has no sizes". A
`has_sizes` boolean beside it would be a second column describing one fact, and
`has_sizes = true, sizes = '[]'` is a state that renders a parent a size picker with
nothing in it.

**NOT NULL with a server default, so the backfill is the default.** Every product that
exists today is sizeless -- that is the honest answer for a row written before anyone was
asked -- and NULL would make "no sizes" and "not answered yet" the same value on the one
question this column exists to answer. `server_default` stays on the column rather than
being dropped after the backfill: the app always sends a list, and the default is what
keeps a hand-written INSERT during an incident from failing on a column nobody remembers.

**No per-size price.** A size is what the club hands over, not what the family is charged;
`price_agorot` remains the one price. Per-size pricing is a `product_size` table and a
different decision.

**The CHECK earns its place.** JSONB accepts a bare string as happily as an array, and the
order endpoint tests membership -- `'M' in sizes` against a stored `"SML"` would silently
succeed. `jsonb_typeof(...) = 'array'` is what makes that unrepresentable rather than
merely unlikely.

**`op.f(...)` around the constraint name, like every other constraint in this directory.**
`app/models/base.py` gives the metadata a naming convention, so the model's
`product_sizes_is_array` is `ck_product_product_sizes_is_array` in the database. Without
`op.f` alembic would apply the convention a second time; without the prefix at all,
`tests/core/test_alembic_baseline.py` fails on a schema that does not match the models --
which is exactly how this was caught.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: str | Sequence[str] | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "product",
        sa.Column(
            "sizes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.create_check_constraint(
        op.f("ck_product_product_sizes_is_array"),
        "product",
        "jsonb_typeof(sizes) = 'array'",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_product_product_sizes_is_array"), "product", type_="check")
    op.drop_column("product", "sizes")
