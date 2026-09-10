"""student_class_price matches the model it was written from

Revision 0027 created `student_class_price` by hand and got two details of `TenantMixin`
wrong. Neither hurt anything at runtime -- which is exactly why they survived: the only
thing that noticed was `tests/core/test_alembic_baseline.py`, the autogenerate gate, which
has been red ever since and stays red for as long as any drift exists. A gate that is
always red reports nothing, so the next real mismatch would have arrived unannounced.

  * **The leading composite index was missing.** `TenantMixin` declares
    `ix_<table>_studio_id_id` on every tenant table -- it is the index the tenant filter
    leads with -- and this table never got one.
  * **The studio foreign key was CASCADE, and the mixin declares RESTRICT.** RESTRICT is
    the deliberate choice: deleting a studio should be refused while its rows exist, not
    silently take a club's pricing history with it.

Both are corrections to a table that already exists in staging and production. Adding an
index is additive, and tightening CASCADE to RESTRICT only makes a studio DELETE harder --
nothing in the product deletes one, and if anything ever tries, being stopped is the
outcome the mixin asked for.

The two indexes on `product` and `price_plan` that 0027 also created are NOT touched here.
They are real and useful -- the parent shop reads one on every load -- and the drift was
that the MODELS never declared them. That is fixed in `app/models/billing.py`, where a
declaration costs no migration at all.

Revision ID: 0029
Revises: 0028
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029"
down_revision: str | Sequence[str] | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: 0027 let Alembic name this one, so it carries the convention's own name rather than a
#: hand-written one. Spelled out because the DROP below has to find it again.
_STUDIO_FK = "fk_student_class_price_studio_id_studio"


def upgrade() -> None:
    op.create_index(
        "ix_student_class_price_studio_id_id",
        "student_class_price",
        ["studio_id", "id"],
    )
    op.drop_constraint(_STUDIO_FK, "student_class_price", type_="foreignkey")
    op.create_foreign_key(
        _STUDIO_FK,
        "student_class_price",
        "studio",
        ["studio_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(_STUDIO_FK, "student_class_price", type_="foreignkey")
    op.create_foreign_key(
        _STUDIO_FK,
        "student_class_price",
        "studio",
        ["studio_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_index("ix_student_class_price_studio_id_id", table_name="student_class_price")


# `sa` is imported for parity with every other revision in this directory; this one needs
# no types of its own.
_ = sa
