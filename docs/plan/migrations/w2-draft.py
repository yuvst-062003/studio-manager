"""W2 — schedule and people. **A DRAFT, NOT A REVISION.**

This file is not in `alembic/versions/`, is not loaded by Alembic and is not run by anything.
See `README.md` in this directory for why the drafts exist and how to turn one into the real
revision on `main`.

Covers the twelve tables landed by `app/models/schedule.py` and `app/models/people.py` in the
W2 contract commit.
"""

from __future__ import annotations

# -- the chain (README.md § The chain) ----------------------------------------------------
revision = "0006"
down_revision = "0005"

#: Grouped by module. **Order is autogenerate's job**, not this list's: it sorts tables
#: topologically from the foreign keys, and the one cycle in the whole schema is in W4, not
#: here.
TABLES = {
    "app/models/schedule.py": (
        "training_year",
        "studio_closure",
        "group_schedule_rule",
        "session",
        "session_staff",
        "session_note",
    ),
    "app/models/people.py": (
        "student",
        "student_freeze",
        "student_status_history",
        "trial_booking",
        "enrollment",
        "registration_request",
    ),
}

#: What autogenerate cannot see, gets wrong, or emits in a form that must not be tidied.
HAND_CHECK = (
    # ---------------------------------------------------------------------------------
    "registration_request.payload_encrypted is EncryptedJSON, not JSONB. §11.1 keeps a "
    "stranger's personal data about a minor encrypted at rest from the moment it is "
    "submitted -- before anyone has approved anything. Writing the underlying type instead "
    "produces a working schema and a permanently dirty `alembic check`.",
    # ---------------------------------------------------------------------------------
    "student.current_belt_id and enrollment.price_plan_id are plain UUID columns with NO "
    "foreign key, deliberately: belt_rank and price_plan are W4's tables and do not exist "
    "yet. Both model docstrings say so. **W4's contract commit adds the ForeignKey to the "
    "two model columns**, and autogenerate then emits the ALTERs -- see w4-draft.py. Do not "
    "hand-write the constraints into 0008 without also adding them to the models, or "
    "`alembic check` reports a difference forever.",
    # ---------------------------------------------------------------------------------
    "student.person_id is UNIQUE. §4.3 gives a person at most one student record per studio, "
    "and losing the constraint lets an import create a second one silently -- after which "
    "every roster shows the child twice and the billing run charges them twice.",
    # ---------------------------------------------------------------------------------
    "student.health_status ships in THIS wave even though health_declaration is W3's. It is "
    "the W3 seam field: M5 reads it through BootstrapPayload.roster[], so it has to exist "
    "before the lane that populates it. A server default of 'missing' is what makes it safe "
    "to add to a table W2 is creating from empty.",
    # ---------------------------------------------------------------------------------
    "Partial indexes: enrollment's active-enrollment uniqueness carries "
    "`postgresql_where=ended_on IS NULL`, and training_year's carries "
    "`postgresql_where=status = 'active'`. Both must keep their predicate. Without it the "
    "first becomes a total unique constraint and a student can never re-enrol in a group "
    "they once left.",
    # ---------------------------------------------------------------------------------
    "session_note.deleted_at is G15's soft delete. No CASCADE cleanup job in this revision.",
)

#: The specific `upgrade head` runs README.md asks for, and what each proves here.
VERIFY = (
    "fresh database -- CREATE TABLE ordering across the two modules (enrollment references "
    "both student and group, which are in different files)",
    "a 0005 database -- these are all new tables, so the risk is not a default-less column "
    "but the two FK-less UUID columns above being 'fixed' by a well-meaning edit",
    "tests/contracts/test_w2_models.py and tests/invariants -- twelve new tables for "
    "invariant 2 to assert studio_id and a leading composite index against",
)


def upgrade() -> None:
    raise NotImplementedError(
        "This is a draft. The body comes from `alembic revision --autogenerate` on `main`, "
        "reconciled against HAND_CHECK above. See README.md in this directory."
    )


def downgrade() -> None:
    raise NotImplementedError("See upgrade().")
