"""a payment promise says whether the money has already moved

Revision ID: 0017
Revises: 0016

Owner correction (2026-08-30): the signup plan step offers four payment routes, and
"when you enter each he can actually pay or choose already paid".

Both answers raise a promise and both end at a manager confirming by hand, so until now
they produced an identical pending row. But the manager's NEXT ACTION is not the same:
"I already handed the coach cash" means go and look in the drawer now, and "I will pay
this week" means wait. A queue that cannot tell them apart is a queue the manager has to
phone the family about to read -- and two buttons in the parent app that produce the same
thing are two buttons that mean nothing.

NOT NULL DEFAULT false, and false is the safe direction: every promise that exists today
was raised by the payments screen's "request" flow, which is a promise to pay rather than
a claim that money has arrived. A row that silently claimed otherwise would put a manager
in front of an empty drawer.

**It is a claim, never a settlement.** `already_paid = true` does not settle a charge, does
not record a payment and does not change the confirm path by one line. The money is still
only real when a human says it arrived -- G8, and the whole reason the promise object
exists.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, Sequence[str], None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_promise",
        sa.Column(
            "already_paid", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )


def downgrade() -> None:
    op.drop_column("payment_promise", "already_paid")
