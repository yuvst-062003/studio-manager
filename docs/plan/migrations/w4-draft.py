"""W4 — billing, events and belts. **A DRAFT, NOT A REVISION.**

See `README.md` in this directory. Seventeen tables, the only foreign-key cycle in the
schema, and the two deferred constraints W2 left behind. This is the largest of the four and
the one where a hand-tidied generated file does the most damage.
"""

from __future__ import annotations

revision = "0008"
down_revision = "0007"

TABLES = {
    "app/models/billing.py": (
        "price_plan",
        "product",
        "charge",
        "billing_run",
        "payment",
        "payment_allocation",
        "payment_order",
        "payment_order_charge",
        "upay_ipn_record",
        "payer_fingerprint",
        "recurring_subscription",
    ),
    "app/models/events.py": ("event", "event_target", "event_registration", "event_exam_result"),
    "app/models/belts.py": ("belt_rank", "student_belt"),
}

#: W2 left two UUID columns with no foreign key because the tables they point at are created
#: here. **Add the `ForeignKey(...)` to these two model columns in W4's contract commit**, and
#: autogenerate emits the ALTERs by itself. Hand-writing `op.create_foreign_key` without
#: touching the models gives a database the models do not describe, and
#: `test_the_migrations_match_the_models` then fails forever on a schema that is actually
#: correct — which is the worst kind of red, because the obvious fix is to weaken the test.
#: **Both are on `student`.** An earlier version of this file said
#: `enrollment.price_plan_id`, which is pre-C11: the club prices by how often a child
#: trains, not by which groups they attend, so the price moved to the student and
#: `enrollment` carries no price at all (app/models/people.py, `Enrollment` docstring --
#: "a `price_plan_id` here is what made a child in two groups pay twice").
#: `tests/contracts/test_w4_models.py::test_the_price_is_chosen_on_the_student` asserts
#: both halves: present on `student`, absent from `enrollment`.
DEFERRED_FROM_W2 = (
    ("student.current_belt_id", "belt_rank.id", "SET NULL"),
    ("student.price_plan_id", "price_plan.id", "RESTRICT"),
)

HAND_CHECK = (
    # ---------------------------------------------------------------------------------
    "**The cycle.** `payment` and `upay_ipn_record` reference each other and both directions "
    "are §4.3 columns, so the cycle is real rather than a modelling slip. It is resolved with "
    "`use_alter=True` and an EXPLICIT constraint name on the reconciliation side. Both halves "
    "matter: without use_alter, SQLAlchemy drops both constraints from its topological sort "
    "and emits CREATE TABLEs in an order Postgres rejects; without the explicit name, Alembic "
    "cannot write the DROP in downgrade(). This was found and fixed in the contract commit "
    "(c23e3e8) -- it is not a new problem to solve here, only one not to undo.",
    # ---------------------------------------------------------------------------------
    "charge's idempotency index is PARTIAL: unique on "
    "(student_id, period_year, period_month, kind) `postgresql_where=student_id IS NOT "
    "NULL AND period_year IS NOT NULL`. It is invariant 5's structural half -- §5.10 step 5, "
    "'re-running for the same period creates no duplicates'. **On student_id, not "
    "enrollment_id** (C11): the club prices per student, so a child in two groups is one "
    "charge, and keying on the enrollment is precisely what would let the second enrollment "
    "raise a second charge -- the defect C11 was raised to remove. It is partial because only "
    "periodic charges have a period and a manual charge may legitimately repeat. Lose the "
    "predicate and a manager can raise exactly one manual charge per family, ever.",
    # ---------------------------------------------------------------------------------
    "**Every money column is `*_agorot INTEGER`** (G2, invariant 1). Not NUMERIC(10,2), which "
    "looks more responsible and is still wrong. This is the wave where invariant 1 stops "
    "being vacuous, so the generated file is the first real exercise of it.",
    # ---------------------------------------------------------------------------------
    "payment_order.public_ref is a UUID with a unique index. §5.10: a sequential id in this "
    "column lets anyone who can count mark any family's tuition paid, because the IPN "
    "endpoint has no signature to fall back on -- upay-integration.md marks that [VERIFIED] "
    "twice.",
    # ---------------------------------------------------------------------------------
    "recurring_subscription's partial index carries `postgresql_where=status = 'active'`: one "
    "active mandate per payer, and any number of cancelled ones in the history.",
    # ---------------------------------------------------------------------------------
    "belt_rank.color_hex is a plain String and that is correct (D3). It is DATA -- configured "
    "per studio at runtime -- which is the one place G13's 'named tokens, never hardcoded "
    "hex' does not apply. secondary_color_hex is nullable for a solid belt.",
    # ---------------------------------------------------------------------------------
    "event.consent_text has a CHECK pairing it with requires_consent, and event has a "
    "`ends_at > starts_at` CHECK. Both are cheap and both catch a real class of bad row: an "
    "event that asks a parent to agree to nothing, and one that ends before it starts.",
)

VERIFY = (
    "fresh database -- this is where the payment/upay_ipn_record cycle bites, and it bites as "
    "a CREATE TABLE that Postgres refuses",
    "a 0007 database -- the two ALTERs from DEFERRED_FROM_W2 run against tables that already "
    "hold rows on staging",
    "tests/invariants/test_01_money_is_never_a_float.py and "
    "tests/invariants/test_05_the_billing_run_is_idempotent.py -- both stop being vacuous "
    "here",
    "app/services/demo/fixtures.py's wipe_plan -- the cycle also determines DELETE order, and "
    "an unresolved cycle left those two tables being deleted in an arbitrary one",
)


def upgrade() -> None:
    raise NotImplementedError(
        "This is a draft. The body comes from `alembic revision --autogenerate` on `main`, "
        "reconciled against HAND_CHECK and DEFERRED_FROM_W2 above. See README.md."
    )


def downgrade() -> None:
    raise NotImplementedError("See upgrade().")
