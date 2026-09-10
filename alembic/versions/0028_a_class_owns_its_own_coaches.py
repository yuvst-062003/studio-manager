"""A class owns its own coaches, and a manager can be scoped to one

Owner, 2026-09-09: "per class there is its own class main coach and assistance coaches.
They are not shareable between classes. If a coach is in both, the studio manager needs to
add his details in both classes. And only class coaches can be assigned to the class."

**`class_staff` -- the roster that did not exist.** Coaches have always been attached to a
GROUP (`group_staff`), and a group belongs to a class, so "who coaches judo" could only ever
be *derived* -- and "who is judo's MAIN coach" could not be expressed at all, because the
lead/assistant distinction lived one level too low. This table is the roster itself:

    class_staff  class_id, person_id, role(lead_coach|assistant_coach), from_date, to_date

`uq_class_staff_live` makes one live row per (class, person), so a person genuinely is added
per class exactly as asked -- a coach who teaches judo AND karate holds two rows and can be
removed from one without touching the other. That is the shape the owner described, and it
is why this is a table rather than a view over `group_staff`.

**No unique index on the main coach, deliberately.** A partial unique index over
`(class_id) WHERE role = 'lead_coach' AND to_date IS NULL` would refuse the ordinary act of
naming a successor before the outgoing coach's last day, and would refuse a class that
genuinely runs two senior coaches. `group_staff` made the same choice for the same reason,
and the guard that matters -- refusing to deactivate a class's only lead coach -- is a
service rule that can say WHY, where an index can only say 23505.

**The class-scoped manager needs no schema at all.** `role_assignment` has carried
`scope_type IN ('studio','class','group')` since the first migration; nothing had ever
written `'class'`. So a manager of one class is an ordinary role assignment with
`scope_type='class'` and `scope_id=<class id>`, and the work of making it mean something is
in the token and the router dependencies, not here.

**Every existing coach keeps working exactly as they do today.** Their `group_staff` rows
are untouched, and the new rule -- only a class's own coaches may be assigned to its groups
-- is enforced from this roster, which the backfill below seeds from the group assignments
those coaches already hold. A migration that instead started refusing existing assignments
would take a club's whole schedule offline at deploy, to enforce a rule about a list nobody
had been able to fill in yet.

Revision ID: 0028
Revises: 0027
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028"
down_revision: str | Sequence[str] | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "class_staff",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("studio_id", sa.Uuid(), nullable=False),
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=False),
        sa.Column("to_date", sa.Date(), nullable=True),
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
        # RESTRICT, not CASCADE: that is what `TenantMixin` declares for every tenant
        # table, and a migration disagreeing with the model leaves the autogenerate
        # gate (`tests/core/test_alembic_baseline.py`) permanently red.
        sa.ForeignKeyConstraint(["studio_id"], ["studio.id"], ondelete="RESTRICT"),
        # RESTRICT, like `group_staff`: deleting a class must not silently erase who taught
        # it, because sessions and attendance already point at that history.
        sa.ForeignKeyConstraint(["class_id"], ["class.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["person_id"], ["person.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("role IN ('lead_coach', 'assistant_coach')", name="class_staff_role"),
        sa.CheckConstraint(
            "to_date IS NULL OR to_date >= from_date", name="class_staff_date_range"
        ),
    )
    # One LIVE row per (class, person). A coach re-added to a class they already coach is a
    # duplicate, and a duplicate is what would make "the coaches of judo" list them twice.
    # Partial on `to_date IS NULL`, so a coach who left and came back is two rows of history
    # rather than an update that erases the first spell.
    op.create_index(
        "uq_class_staff_live",
        "class_staff",
        ["class_id", "person_id"],
        unique=True,
        postgresql_where=sa.text("to_date IS NULL"),
    )
    # The two reads this table has: "who coaches this class" -- the picker, and the rule
    # that refuses an outsider -- and "which classes does this person coach".
    # The leading composite index `TenantMixin` puts on every tenant table.
    op.create_index("ix_class_staff_studio_id_id", "class_staff", ["studio_id", "id"])
    op.create_index("ix_class_staff_studio_id_class_id", "class_staff", ["studio_id", "class_id"])
    op.create_index("ix_class_staff_studio_id_person_id", "class_staff", ["studio_id", "person_id"])

    # -- the backfill ---------------------------------------------------------
    # Every coach holding a LIVE group assignment becomes a coach of that group's class, at
    # the same role, from the date they started. Without this the new rule would meet an
    # empty roster and refuse every assignment a club already has.
    #
    # DISTINCT ON (class, person): a coach on three judo groups is ONE judo coach. Ordered
    # by role so 'assistant_coach' loses to 'lead_coach' -- alphabetical here, and asserted
    # by a test rather than trusted to the alphabet. The window MIN keeps the earliest start
    # across the groups being collapsed, which is when they began coaching that class.
    op.execute(
        """
        INSERT INTO class_staff (id, studio_id, class_id, person_id, role, from_date, to_date)
        SELECT DISTINCT ON (g.class_id, gs.person_id)
               gen_random_uuid(),
               gs.studio_id,
               g.class_id,
               gs.person_id,
               gs.role,
               MIN(gs.from_date) OVER (PARTITION BY g.class_id, gs.person_id),
               NULL
          FROM group_staff gs
          JOIN "group" g ON g.id = gs.group_id
         WHERE gs.to_date IS NULL
         ORDER BY g.class_id, gs.person_id, gs.role
        """
    )


def downgrade() -> None:
    op.drop_index("ix_class_staff_studio_id_person_id", table_name="class_staff")
    op.drop_index("ix_class_staff_studio_id_class_id", table_name="class_staff")
    op.drop_index("uq_class_staff_live", table_name="class_staff")
    op.drop_index("ix_class_staff_studio_id_id", table_name="class_staff")
    op.drop_table("class_staff")
