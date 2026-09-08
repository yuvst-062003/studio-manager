"""A family can say how they pay, for each child

`student.payment_method` -- where the join wizard's choice finally lands.

It had nowhere to live. `payment_promise.method` is `IN ('cash', 'cheque',
'standing_order')` -- correctly, since a promise is a statement that money will arrive by
hand and a card order is money already in motion. The consequence was that the wizard
wrote a promise for three of its four methods and a `payment_order` for the fourth, and
the parent's profile screen -- which derived the method from the promise list -- told
every card family `לא הוגדר` however many times they answered the question.

**Per child**, beside `price_plan_id`, because that is the same kind of fact and because a
הוראת קבע mandate is signed per child at that child's own price.

**The vocabulary is `payment.method`'s**, not the promise's, so the client's existing
`methodKey` mapping translates it untouched.

Revision ID: 7050317e1aef
Revises: 0025
Create Date: 2026-09-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7050317e1aef"
down_revision: str | Sequence[str] | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("student", sa.Column("payment_method", sa.String(length=20), nullable=True))
    op.create_check_constraint(
        op.f("ck_student_student_payment_method"),
        "student",
        "payment_method IS NULL OR payment_method IN "
        "('upay_card', 'cash', 'cheque', 'standing_order')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_student_student_payment_method"), "student", type_="check")
    op.drop_column("student", "payment_method")
