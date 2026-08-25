"""W3 — attendance and health. **A DRAFT, NOT A REVISION.**

See `README.md` in this directory. Covers `app/models/attendance.py` and the two tables the
W3 contract commit appended to `app/models/health.py`.
"""

from __future__ import annotations

revision = "0007"
down_revision = "0006"

TABLES = {
    "app/models/attendance.py": ("attendance", "absence_report"),
    "app/models/health.py": ("health_declaration", "consent_record"),
}

#: **health_form_template is NOT in the list above and must not be created here.** Revision
#: 0005 already created it — M1 seeded the `kind='trial'` template as conflict C3's
#: resolution, which is what unblocked M3's trial booking without pulling M4 forward. A
#: CREATE TABLE for it in 0008 fails on a database that has ever run 0005, which is all of
#: them.
ALREADY_EXISTS = ("health_form_template",)

HAND_CHECK = (
    # ---------------------------------------------------------------------------------
    "health_declaration.answers_encrypted is EncryptedJSON and "
    "health_declaration.signature_image_encrypted is EncryptedBytes. Not JSONB and not "
    "LargeBinary. These hold a minor's medical answers and a drawn signature -- §11.1's "
    "envelope is the reason a database backup is not a medical record, and the wrapped type "
    "is what carries it.",
    # ---------------------------------------------------------------------------------
    "derived_flags is JSONB holding booleans only (§4.3, G7). The column type cannot enforce "
    "that; `app/schemas/health.py` rejects a non-boolean in `mode='before'` and the reason is "
    "written there. Nothing in this revision should imply the database is the guard.",
    # ---------------------------------------------------------------------------------
    "attendance has TWO unique indexes and they are not redundant. `(session_id, student_id)` "
    "is the domain rule -- two rows are two answers to 'were they here'. `client_mark_id` "
    "alone is the OFFLINE rule (§10.5): the queue replays a mark the server may already hold, "
    "and the client-generated id is the only thing identifying it as the same mark rather "
    "than a corrected second opinion. Dropping either one loses a different guarantee.",
    # ---------------------------------------------------------------------------------
    "attendance.status includes 'unmarked' as a real, storable state (§5.14). Not a NULL and "
    "not an absent row. §5.14's sessions-held-vs-planned report is wrong the moment "
    "'unmarked' and 'absent' collapse, and it is wrong in the direction that blames a coach.",
    # ---------------------------------------------------------------------------------
    "attendance carries device_marked_at AND marked_at. §10.5 resolves a two-coach conflict "
    "on device_marked_at, because resolving on the server clock lets whoever reconnected "
    "second overwrite the earlier mark. Both columns, both timestamptz (G3).",
    # ---------------------------------------------------------------------------------
    "No GRANT for health_declaration. It inherits 0001's default privileges like every other "
    "table -- see README.md. The protection on health data is §11.1's encryption and the "
    "audit log, not a table-level grant.",
)

VERIFY = (
    "fresh database -- attendance references session and student, which 0006 created",
    "a 0006 database -- the realistic failure here is health_form_template being recreated; "
    "see ALREADY_EXISTS",
    "tests/invariants/test_04_health_never_reaches_logs.py -- this is the wave where health "
    "columns exist, so the scrubber's gate stops being vacuous",
)


def upgrade() -> None:
    raise NotImplementedError(
        "This is a draft. The body comes from `alembic revision --autogenerate` on `main`, "
        "reconciled against HAND_CHECK above. See README.md in this directory."
    )


def downgrade() -> None:
    raise NotImplementedError("See upgrade().")
