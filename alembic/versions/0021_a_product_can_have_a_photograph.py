"""a product can have a photograph

Revision ID: 0021
Revises: 0020

The parent app's shop draws a catalogue item as a card with a picture, and `product` had no
image column at all -- so every card in the redesigned club shop rendered the same
placeholder. Owner decision, 2026-09-06: "when a manager adds an item he can put an image,
if not a default image."

**A key, not a URL**, exactly as `studio.logo_object_key` is. The column points into
`app/core/storage.py`; the URL is whatever route serves those bytes today, and storing one
would freeze this table's rows against a routing decision. `String(500)` matches the logo's
column for the same reason it was chosen there.

**Nullable, and nothing is backfilled.** A product without a photo is the ORDINARY state of
a catalogue nobody has photographed yet -- not a missing value to be filled in later -- and
every client draws its own default tile for it. That is why there is no `server_default` and
no NOT NULL: an empty string would be a third state meaning the same thing as NULL, and two
spellings of "no photo" is how one screen ends up showing a broken image.

**The object is not deleted by this schema.** Dropping the column on downgrade orphans
whatever bytes are on the volume, and that is deliberate: the store is not the database, a
downgrade is a schema operation, and silently deleting a club's photographs because a
migration ran backwards is not a trade this project makes. `product_images.delete_image` is
the one place that removes an object, and it does so with an audit row to record it.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | Sequence[str] | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("product", sa.Column("image_object_key", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("product", "image_object_key")
