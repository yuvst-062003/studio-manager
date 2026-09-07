"""an assistant coach names somebody to call

Revision ID: 0025
Revises: 0024

Three nullable columns on `person`, for the one staff role the club needs a next-of-kin for.

**Why assistant coaches and not everyone.** An assistant coach is typically a teenager or a
young adult helping on the mat — often a graduate of the club's own youth groups — and if
one of them is hurt during a session the person to call is a parent whose number the club
does not otherwise hold. A manager or a lead coach is an adult member of staff whose
details the club already has through employment. Collecting a next-of-kin from everyone
would be gathering personal data about third parties the product has no use for, which
§11's minimisation rule is against; collecting it from nobody leaves a fifteen-year-old on
a mat with an injury and nobody to phone.

**The columns are on `person`, not a table of their own.** One contact, not a list -- unlike
`student_pickup_contact`, whose whole point is that several adults may collect a child. A
second row here would answer a question nobody asked.

**Not encrypted, and that is a decision rather than an oversight.** `person` already draws
this line: `national_id_encrypted` is a national identifier and Israel's Privacy Protection
Law treats it as sensitive, while an address and a phone number are ordinary admin data. An
emergency contact is a name and a phone -- the same shape as `Guardian`'s, which is not
encrypted either -- and encrypting it would put an emergency read behind a decrypt for no
gain. What it is NOT is something a coach may browse: the read is manager-scoped
(`GET /staff`, already `ManagerOrOwner`), which is where the protection actually lives.

Nullable with no backfill and no NOT NULL, ever. An assistant who has not filled it in is
the ordinary state on the day this ships, and a column that claimed otherwise would be
inventing a contact. The wizard step that asks for it is skippable for the reason §5.5
already argues about health declarations: a hard block makes records less accurate without
making anyone safer.

No index. The only read is by `person.id` on a row already being fetched.

The downgrade drops all three and loses exactly what they held.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | Sequence[str] | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("person", sa.Column("emergency_contact_name", sa.String(length=160), nullable=True))
    op.add_column("person", sa.Column("emergency_contact_phone", sa.String(length=32), nullable=True))
    op.add_column(
        "person", sa.Column("emergency_contact_relation", sa.String(length=40), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("person", "emergency_contact_relation")
    op.drop_column("person", "emergency_contact_phone")
    op.drop_column("person", "emergency_contact_name")
