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
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

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


def downgrade() -> None:
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
