"""A class owns its own items, and its own price

Two facts the product did not carry, asked for together (owner, 2026-09-09): "every class
can have his own unique items and his own unique payments".

**`product.class_id` -- the shop stops being one catalogue for the whole club.** Until now
`GET /me/products` selected every active row in the studio, so a karate family was offered
a judo gi. Nullable, and NULL is not "club-wide": it is UNASSIGNED, which the parent shop
hides and the dashboard flags. The owner asked for every item to belong to exactly one
class, and an item that does not yet have one is not sellable rather than sellable to
everybody.

**`price_plan.class_id` and `student_class_price` -- tuition is priced per class.** This
reverses half of C11, deliberately and with the owner's explicit sign-off, so the reason
C11 exists has to be preserved rather than forgotten:

    C11's failure was a child in the competition group AND the teenagers group, charged
    twice a month at two different prices, silently and forever. The old plan hung off
    `group_id` falling back to `class_id`.

That failure is a GROUP one. This is a CLASS one, and the difference is the whole safety
argument: the run raises one charge per DISTINCT CLASS a student is enrolled in, so a child
in two judo groups still pays judo exactly once -- which is what C11 was protecting -- while
judo and karate bill separately, which is what was asked for. `student.price_plan_id` stays
where it is and keeps working; `student_class_price` is what the run prefers when a row
exists for that (student, class).

**The backfill cannot invent data, so it refuses to guess twice over.**

  * A product is assigned its studio's class only where that studio has EXACTLY ONE class.
    Two classes and there is no fact here saying which; the row stays NULL and a human
    assigns it. Zero classes and there is nothing to point at.
  * A student's existing price moves to a class only where that student is enrolled in
    EXACTLY ONE class. A child already in two is left alone entirely -- no
    `student_class_price` row at all -- because writing their one price against both
    classes is precisely the double-charge this migration is written to avoid, and writing
    it against one of the two would be a coin toss with somebody's money.

Every student the backfill skips keeps billing from `student.price_plan_id` exactly as
today, so no family's amount changes on the next run because of this migration alone.

Additive only: nothing is dropped, nothing is renamed, and every existing row stays valid.
The old code path reads none of these columns, so this revision is safe to apply before the
code that uses it ships.

Revision ID: 0027
Revises: 7050317e1aef
Create Date: 2026-09-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: str | Sequence[str] | None = "7050317e1aef"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- the shop -------------------------------------------------------------
    op.add_column("product", sa.Column("class_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_product_class_id",
        "product",
        "class",
        ["class_id"],
        ["id"],
        # RESTRICT and not CASCADE: deleting a class must not silently delete the items it
        # sold, because a charge already raised for one still has to render its name.
        ondelete="RESTRICT",
    )
    # The parent shop's query is (studio, class, active) and nothing else.
    op.create_index("ix_product_studio_id_class_id", "product", ["studio_id", "class_id"])

    # -- the price ------------------------------------------------------------
    op.add_column("price_plan", sa.Column("class_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_price_plan_class_id",
        "price_plan",
        "class",
        ["class_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_price_plan_studio_id_class_id", "price_plan", ["studio_id", "class_id"])

    op.create_table(
        "student_class_price",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("studio_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("price_plan_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["studio_id"], ["studio.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["student.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["class_id"], ["class.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["price_plan_id"], ["price_plan.id"], ondelete="RESTRICT"),
    )
    # ONE price per child per class. This unique index is the structural half of the
    # double-charge guarantee: the run reads at most one row here per (student, class), so
    # a second price for the same pair cannot be written, let alone billed.
    op.create_index(
        "uq_student_class_price_student_id_class_id",
        "student_class_price",
        ["student_id", "class_id"],
        unique=True,
    )
    # The leading composite index TenantMixin's own tables carry.
    op.create_index(
        "ix_student_class_price_studio_id_student_id",
        "student_class_price",
        ["studio_id", "student_id"],
    )

    # -- the charge has to know which class it is for -------------------------
    #
    # `uq_charge_student_period_kind` is unique on (student, period, kind), which is C11's
    # STRUCTURAL half: the database itself permits one tuition charge per child per month.
    # Per-class tuition cannot exist while that stands -- the second class's charge is
    # refused by the index, not by any code -- so the index has to gain the class.
    #
    # **COALESCE, and this is the load-bearing part.** Postgres treats NULLs as distinct in
    # a unique index, so adding a bare `class_id` to the key would let TWO rows with a NULL
    # class exist for one student and month: it would quietly WEAKEN the guarantee for every
    # charge raised before today, which is all of them. Folding NULL onto a fixed sentinel
    # keeps legacy rows under exactly the rule they were written under, while letting two
    # classes hold two charges.
    op.add_column("charge", sa.Column("class_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_charge_class_id", "charge", "class", ["class_id"], ["id"], ondelete="RESTRICT"
    )
    op.drop_index("uq_charge_student_period_kind", table_name="charge")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_charge_student_period_kind_class
            ON charge (
                student_id,
                period_year,
                period_month,
                kind,
                COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
            )
         WHERE student_id IS NOT NULL AND period_year IS NOT NULL
        """
    )

    # -- backfill: only where the answer is not a guess ------------------------
    #
    # A studio with exactly one class has exactly one place its items can belong. Written
    # as a correlated UPDATE rather than a loop so it is one statement against the DDL
    # above, inside the same transaction.
    op.execute(
        """
        UPDATE product p
           SET class_id = (SELECT c.id FROM class c WHERE c.studio_id = p.studio_id)
         WHERE p.class_id IS NULL
           AND (SELECT count(*) FROM class c WHERE c.studio_id = p.studio_id) = 1
        """
    )
    # The same rule for a price plan: a studio with one class has one class to price for.
    op.execute(
        """
        UPDATE price_plan pp
           SET class_id = (SELECT c.id FROM class c WHERE c.studio_id = pp.studio_id)
         WHERE pp.class_id IS NULL
           AND (SELECT count(*) FROM class c WHERE c.studio_id = pp.studio_id) = 1
        """
    )
    # A student's current price becomes that student's price FOR THE ONE CLASS THEY ARE IN.
    #
    # `enrollment -> group -> class`, DISTINCT, and only where the count is exactly 1. A
    # child in two classes is skipped entirely and keeps billing from
    # `student.price_plan_id` until a human prices them, because there is no honest way to
    # split one number in two.
    #
    # `status = 'active'`: an ended enrollment is not a class the child trains in, and
    # counting it would make a child who moved discipline look like they are in two.
    op.execute(
        """
        INSERT INTO student_class_price (id, studio_id, student_id, class_id, price_plan_id)
        SELECT gen_random_uuid(), s.studio_id, s.id, one.class_id, s.price_plan_id
          FROM student s
          JOIN LATERAL (
                SELECT DISTINCT g.class_id
                  FROM enrollment e
                  JOIN "group" g ON g.id = e.group_id
                 WHERE e.student_id = s.id
                   AND e.status = 'active'
               ) one ON true
         WHERE s.price_plan_id IS NOT NULL
           AND (
                SELECT count(DISTINCT g2.class_id)
                  FROM enrollment e2
                  JOIN "group" g2 ON g2.id = e2.group_id
                 WHERE e2.student_id = s.id
                   AND e2.status = 'active'
               ) = 1
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("uq_charge_student_period_kind_class", table_name="charge")
    op.create_index(
        "uq_charge_student_period_kind",
        "charge",
        ["student_id", "period_year", "period_month", "kind"],
        unique=True,
        postgresql_where=sa.text("student_id IS NOT NULL AND period_year IS NOT NULL"),
    )
    op.drop_constraint("fk_charge_class_id", "charge", type_="foreignkey")
    op.drop_column("charge", "class_id")

    op.drop_index("ix_student_class_price_studio_id_student_id", table_name="student_class_price")
    op.drop_index("uq_student_class_price_student_id_class_id", table_name="student_class_price")
    op.drop_table("student_class_price")

    op.drop_index("ix_price_plan_studio_id_class_id", table_name="price_plan")
    op.drop_constraint("fk_price_plan_class_id", "price_plan", type_="foreignkey")
    op.drop_column("price_plan", "class_id")

    op.drop_index("ix_product_studio_id_class_id", table_name="product")
    op.drop_constraint("fk_product_class_id", "product", type_="foreignkey")
    op.drop_column("product", "class_id")
