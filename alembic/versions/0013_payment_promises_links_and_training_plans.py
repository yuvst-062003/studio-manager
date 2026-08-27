"""payment promises, cheques, standing-order links, prepayment, training plans

Revision ID: 0013
Revises: 0012

The 2026-08-27 spec wave (docs/superpowers/specs/2026-08-27-*.md), one revision because
main owns this directory and the three specs land on one branch. The revision grows in
place as the branch's stages land; it is unreleased until the branch merges.

**Part 1 -- cash_request becomes payment_promise, and cheques become a route.** The
manager collects twelve post-dated cheques made out to the association; mechanically that
is identical to "I will pay cash" over open charges, so the mechanism generalises instead
of duplicating: the tables rename, a `method` column ('cash' | 'cheque') says which words
the parent used, and `cheque` joins the human-recorded payment methods so a confirmed
cheque stops recording as `bank_transfer`. Renames are ALTER .. RENAME throughout --
staging data survives, and every constraint keeps a name the models would generate.

**Part 2 -- the standing-order link, per price plan.** `price_plan` is versioned by
`active_from`/`active_to` and never edited in place, and this column is the deliberate
exception: a URL explains nothing about a historical charge, so a typo in it must be
fixable without inventing a price change that never happened. Nullable with no default and
no backfill -- NULL means "the manager has not pasted this plan's link yet", which is also
what every successor plan is born as, because a uPay shared link carries a fixed amount and
copying it forward would under-collect all year in silence. No CHECK: the https-only rule
and the host allowlist are configuration (`STANDING_ORDER_LINK_HOSTS`), and a constraint
would freeze one environment's payment provider into the schema.

**Part 3 -- prepayment.** The club collects a monthly subscription in lumps: cash three
months forward, twelve cheques for a year. Nothing new holds that money -- a `payment`
whose allocations total less than its amount already leaves a surplus, and that surplus IS
the credit. So this adds only the parent's way of DECLARING one: `prepay_months` on the
promise, whole months bought forward beyond the charges it names. `payment_id` records
which payment a confirmed promise produced, which is what lets a surplus be recognised as
an expected prepayment rather than an anomaly. Both nullable-or-defaulted, because every
promise that exists today declared no forward months and settled charges only.

**Part 4 -- training plans.** The club sells 300 / 400 / 550 ₪: base training on Tuesday
and Friday for everyone, one extra session a week on 400, and no weekly limit plus the
Saturday private lesson on 550. None of that is expressible today, because the schema
cannot tell a Tuesday judo class from a Monday CrossFit session from a Saturday private
lesson -- they are all `group` rows. `group.kind` is that distinction and every rule
depends on it. `price_plan.weekly_extra_allowance` is the enforced rule (0 / 1 / NULL for
unlimited); `sessions_per_week` becomes nullable and stays what its docstring already
calls it, a label rather than a rule. `group_eligibility` says which base groups may
reach which extra; `session_booking` is a student marking one; `plan_change` is a change
scheduled before it takes effect, so it can be recorded, applied and settled.

Deriving the allowance as `sessions_per_week - 2` was considered and rejected: it hardcodes
"every base is two sessions", which is true this season and is precisely the assumption
§5.15's rollover breaks when the timetable moves.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # -- Part 1: cash_request -> payment_promise ---------------------------------
    op.rename_table("cash_request", "payment_promise")
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT pk_cash_request TO pk_payment_promise"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT ck_cash_request_cash_request_status"
        " TO ck_payment_promise_payment_promise_status"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT ck_cash_request_cash_request_total_positive"
        " TO ck_payment_promise_payment_promise_total_positive"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT fk_cash_request_studio_id_studio"
        " TO fk_payment_promise_studio_id_studio"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT fk_cash_request_payer_person_id_person"
        " TO fk_payment_promise_payer_person_id_person"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT fk_cash_request_decided_by_person_id_person"
        " TO fk_payment_promise_decided_by_person_id_person"
    )
    op.execute("ALTER INDEX ix_cash_request_studio_id_id RENAME TO ix_payment_promise_studio_id_id")
    op.execute(
        "ALTER INDEX ix_cash_request_studio_id_status RENAME TO ix_payment_promise_studio_id_status"
    )
    op.execute(
        "ALTER INDEX ix_cash_request_studio_id_payer_person_id"
        " RENAME TO ix_payment_promise_studio_id_payer_person_id"
    )

    op.rename_table("cash_request_charge", "payment_promise_charge")
    op.alter_column("payment_promise_charge", "cash_request_id", new_column_name="payment_promise_id")
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT pk_cash_request_charge"
        " TO pk_payment_promise_charge"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT fk_cash_request_charge_studio_id_studio"
        " TO fk_payment_promise_charge_studio_id_studio"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge"
        " RENAME CONSTRAINT fk_cash_request_charge_cash_request_id_cash_request"
        " TO fk_payment_promise_charge_payment_promise_id_payment_promise"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT fk_cash_request_charge_charge_id_charge"
        " TO fk_payment_promise_charge_charge_id_charge"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT uq_cash_request_charge_request_charge"
        " TO uq_payment_promise_charge_promise_charge"
    )
    op.execute(
        "ALTER INDEX ix_cash_request_charge_studio_id_id"
        " RENAME TO ix_payment_promise_charge_studio_id_id"
    )
    op.execute(
        "ALTER INDEX ix_cash_request_charge_charge_id RENAME TO ix_payment_promise_charge_charge_id"
    )

    # 'cash' is the honest backfill: every promise that exists today was raised by the
    # cash card, because no other card existed.
    op.add_column(
        "payment_promise",
        sa.Column("method", sa.String(length=12), nullable=False, server_default="cash"),
    )
    op.execute(
        "ALTER TABLE payment_promise ADD CONSTRAINT ck_payment_promise_payment_promise_method"
        " CHECK (method IN ('cash', 'cheque'))"
    )

    # cheque joins the human-recorded payment methods (G8: only upay_card is automatic)
    op.execute("ALTER TABLE payment DROP CONSTRAINT ck_payment_payment_method")
    op.execute(
        "ALTER TABLE payment ADD CONSTRAINT ck_payment_payment_method CHECK"
        " (method IN ('upay_card', 'standing_order', 'bank_transfer', 'cash', 'cheque',"
        " 'credit_adjustment'))"
    )

    # -- Part 2: the standing-order link, per price plan -------------------------
    op.add_column("price_plan", sa.Column("standing_order_link_url", sa.Text(), nullable=True))

    # -- Part 3: prepayment ------------------------------------------------------
    # 0 is the honest backfill: every promise raised so far settled open charges only,
    # because no forward offer existed to accept.
    op.add_column(
        "payment_promise",
        sa.Column("prepay_months", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        "ALTER TABLE payment_promise"
        " ADD CONSTRAINT ck_payment_promise_payment_promise_prepay_months"
        " CHECK (prepay_months >= 0)"
    )
    # SET NULL rather than CASCADE: §11.4 never deletes a financial row, so this only fires
    # if one is ever removed by hand, and a promise that lost its payment must survive to
    # say that it was confirmed.
    op.add_column(
        "payment_promise",
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_payment_promise_payment_id_payment",
        "payment_promise",
        "payment",
        ["payment_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # -- Part 4: training plans --------------------------------------------------
    # 'base' is the honest backfill: every group that exists is a group students are
    # enrolled in and attend, which is exactly what base means.
    op.add_column(
        "group",
        sa.Column("kind", sa.String(length=10), nullable=False, server_default="base"),
    )
    op.execute(
        "ALTER TABLE \"group\" ADD CONSTRAINT ck_group_group_kind"
        " CHECK (kind IN ('base', 'extra', 'private'))"
    )
    op.add_column(
        "group",
        sa.Column(
            "is_invite_only", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )

    # NULL means unlimited, which is why it cannot be NOT NULL with a default: 0, 1 and
    # "no limit" are three states and only two of them are numbers.
    op.add_column("price_plan", sa.Column("weekly_extra_allowance", sa.Integer(), nullable=True))
    # NULL means open membership. The existing `sessions_per_week > 0` CHECK tolerates NULL
    # unchanged -- an SQL check is true-or-unknown, and unknown does not fail a row.
    op.alter_column("price_plan", "sessions_per_week", nullable=True)

    op.create_table(
        "group_eligibility",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("extra_group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("base_group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_group_eligibility"),
        sa.ForeignKeyConstraint(
            ["studio_id"], ["studio.id"], name="fk_group_eligibility_studio_id_studio",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["extra_group_id"], ["group.id"],
            name="fk_group_eligibility_extra_group_id_group", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["base_group_id"], ["group.id"],
            name="fk_group_eligibility_base_group_id_group", ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "extra_group_id", "base_group_id", name="uq_group_eligibility_extra_base"
        ),
    )
    op.create_index(
        "ix_group_eligibility_studio_id_id", "group_eligibility", ["studio_id", "id"]
    )
    op.create_index(
        "ix_group_eligibility_base_group_id", "group_eligibility", ["base_group_id"]
    )

    op.create_table(
        "session_booking",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("marked_by_person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_session_booking"),
        sa.ForeignKeyConstraint(
            ["studio_id"], ["studio.id"], name="fk_session_booking_studio_id_studio",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["student.id"], name="fk_session_booking_student_id_student",
            ondelete="CASCADE",
        ),
        # CASCADE: §3's own reasoning for pointing at a session rather than at a week plus
        # a group -- a cancelled or rescheduled session takes its bookings with it rather
        # than leaving them pointing at a slot that no longer exists.
        sa.ForeignKeyConstraint(
            ["session_id"], ["session.id"], name="fk_session_booking_session_id_session",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["marked_by_person_id"], ["person.id"],
            name="fk_session_booking_marked_by_person_id_person", ondelete="SET NULL",
        ),
    )
    op.create_index("ix_session_booking_studio_id_id", "session_booking", ["studio_id", "id"])
    # Partial, on the LIVE rows only: a released booking is a row that still exists, and a
    # student who releases Monday and re-marks it must not hit a unique violation.
    op.create_index(
        "uq_session_booking_live",
        "session_booking",
        ["student_id", "session_id"],
        unique=True,
        postgresql_where=sa.text("cancelled_at IS NULL"),
    )
    op.create_index(
        "ix_session_booking_live_session",
        "session_booking",
        ["studio_id", "session_id"],
        postgresql_where=sa.text("cancelled_at IS NULL"),
    )
    op.create_index(
        "ix_session_booking_live_student",
        "session_booking",
        ["studio_id", "student_id"],
        postgresql_where=sa.text("cancelled_at IS NULL"),
    )

    op.create_table(
        "plan_change",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_price_plan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("to_price_plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("effective_on", sa.Date(), nullable=False),
        sa.Column("requested_by_person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="scheduled"),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "settlement_status", sa.String(length=12), nullable=False, server_default="pending"
        ),
        sa.Column("settled_by_person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_plan_change"),
        # Bare names: the metadata naming convention prefixes them `ck_<table>_`, so
        # spelling the prefix here yields `ck_plan_change_ck_plan_change_...` and
        # `alembic check` reports a drift that is entirely this line's fault.
        sa.CheckConstraint(
            "status IN ('scheduled', 'applied', 'cancelled')", name="plan_change_status"
        ),
        sa.CheckConstraint(
            "settlement_status IN ('pending', 'settled')",
            name="plan_change_settlement_status",
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"], ["studio.id"], name="fk_plan_change_studio_id_studio",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["student.id"], name="fk_plan_change_student_id_student",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["from_price_plan_id"], ["price_plan.id"],
            name="fk_plan_change_from_price_plan_id_price_plan", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["to_price_plan_id"], ["price_plan.id"],
            name="fk_plan_change_to_price_plan_id_price_plan", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_person_id"], ["person.id"],
            name="fk_plan_change_requested_by_person_id_person", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["settled_by_person_id"], ["person.id"],
            name="fk_plan_change_settled_by_person_id_person", ondelete="SET NULL",
        ),
    )
    op.create_index("ix_plan_change_studio_id_id", "plan_change", ["studio_id", "id"])
    # The worker's daily question: which changes are due today.
    op.create_index(
        "ix_plan_change_studio_id_status_effective_on",
        "plan_change",
        ["studio_id", "status", "effective_on"],
    )
    # §11's queue: which changes still need a human to close the money loop.
    op.create_index(
        "ix_plan_change_studio_id_settlement_status",
        "plan_change",
        ["studio_id", "settlement_status"],
    )


def downgrade() -> None:
    op.drop_table("plan_change")
    op.drop_table("session_booking")
    op.drop_table("group_eligibility")
    op.alter_column("price_plan", "sessions_per_week", nullable=False)
    op.drop_column("price_plan", "weekly_extra_allowance")
    op.drop_column("group", "is_invite_only")
    op.execute('ALTER TABLE "group" DROP CONSTRAINT ck_group_group_kind')
    op.drop_column("group", "kind")

    op.drop_constraint("fk_payment_promise_payment_id_payment", "payment_promise")
    op.drop_column("payment_promise", "payment_id")
    op.execute(
        "ALTER TABLE payment_promise"
        " DROP CONSTRAINT ck_payment_promise_payment_promise_prepay_months"
    )
    op.drop_column("payment_promise", "prepay_months")

    op.drop_column("price_plan", "standing_order_link_url")

    op.execute("ALTER TABLE payment DROP CONSTRAINT ck_payment_payment_method")
    op.execute(
        "ALTER TABLE payment ADD CONSTRAINT ck_payment_payment_method CHECK"
        " (method IN ('upay_card', 'standing_order', 'bank_transfer', 'cash',"
        " 'credit_adjustment'))"
    )
    op.execute("ALTER TABLE payment_promise DROP CONSTRAINT ck_payment_promise_payment_promise_method")
    op.drop_column("payment_promise", "method")

    op.execute(
        "ALTER INDEX ix_payment_promise_charge_charge_id RENAME TO ix_cash_request_charge_charge_id"
    )
    op.execute(
        "ALTER INDEX ix_payment_promise_charge_studio_id_id"
        " RENAME TO ix_cash_request_charge_studio_id_id"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT uq_payment_promise_charge_promise_charge"
        " TO uq_cash_request_charge_request_charge"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT fk_payment_promise_charge_charge_id_charge"
        " TO fk_cash_request_charge_charge_id_charge"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge"
        " RENAME CONSTRAINT fk_payment_promise_charge_payment_promise_id_payment_promise"
        " TO fk_cash_request_charge_cash_request_id_cash_request"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT fk_payment_promise_charge_studio_id_studio"
        " TO fk_cash_request_charge_studio_id_studio"
    )
    op.execute(
        "ALTER TABLE payment_promise_charge RENAME CONSTRAINT pk_payment_promise_charge"
        " TO pk_cash_request_charge"
    )
    op.alter_column("payment_promise_charge", "payment_promise_id", new_column_name="cash_request_id")
    op.rename_table("payment_promise_charge", "cash_request_charge")

    op.execute(
        "ALTER INDEX ix_payment_promise_studio_id_payer_person_id"
        " RENAME TO ix_cash_request_studio_id_payer_person_id"
    )
    op.execute(
        "ALTER INDEX ix_payment_promise_studio_id_status RENAME TO ix_cash_request_studio_id_status"
    )
    op.execute("ALTER INDEX ix_payment_promise_studio_id_id RENAME TO ix_cash_request_studio_id_id")
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT fk_payment_promise_decided_by_person_id_person"
        " TO fk_cash_request_decided_by_person_id_person"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT fk_payment_promise_payer_person_id_person"
        " TO fk_cash_request_payer_person_id_person"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT fk_payment_promise_studio_id_studio"
        " TO fk_cash_request_studio_id_studio"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT ck_payment_promise_payment_promise_total_positive"
        " TO ck_cash_request_cash_request_total_positive"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT ck_payment_promise_payment_promise_status"
        " TO ck_cash_request_cash_request_status"
    )
    op.execute(
        "ALTER TABLE payment_promise RENAME CONSTRAINT pk_payment_promise TO pk_cash_request"
    )
    op.rename_table("payment_promise", "cash_request")
