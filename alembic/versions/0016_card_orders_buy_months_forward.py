"""a card order can buy months that have no charge yet

Revision ID: 0016
Revises: 0015

Owner request (2026-08-30): "when want to pay with card should have an option to choose
number of month; there is only one available. user can pay with card 3 month ahead and the
payment will be nummonth * payment options."

Until now the card route could only settle debt, so the month chips were capped at the
number of months the family happened to OWE -- a family in good standing was offered "1"
and could not hand the club a term by card at all, while cash and cheques have been able to
since the 2026-08-27 prepayment wave. This column is the card's half of that.

**It holds a count, not money**, exactly like ``max_payments`` beside it and
``payment_promise.prepay_months`` in the flow this mirrors. The months are priced into
``expected_amount_agorot`` at creation, from the payer's own monthly total, and no new
ledger shape is introduced: on settlement the payment allocates to the order's charges and
the remainder stays unallocated, which IS the credit the billing run's step 7 spends. A
per-month price stored here would be a second source able to disagree with the amount uPay
actually charged -- and ``expected_amount_agorot`` is the column SPEC 5.10 compares the IPN
against, so it must stay the only answer.

NOT NULL DEFAULT 0: every order that exists today buys no month forward, and 0 is the
honest backfill. A nullable column would spell "no months" and "not asked" the same way.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, Sequence[str], None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_order",
        sa.Column("prepay_months", sa.Integer(), nullable=False, server_default="0"),
    )
    # The screen's chips stop at 6; twelve is the backstop against a client posting a year
    # and a half, and it mirrors `payment_order_max_payments` beside it.
    op.create_check_constraint(
        "payment_order_prepay_months", "payment_order", "prepay_months BETWEEN 0 AND 12"
    )


def downgrade() -> None:
    op.drop_constraint("payment_order_prepay_months", "payment_order", type_="check")
    op.drop_column("payment_order", "prepay_months")
