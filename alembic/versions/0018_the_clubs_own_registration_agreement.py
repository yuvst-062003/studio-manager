"""the club's own registration agreement replaces the bundled questionnaire

Revision ID: 0018
Revises: 0017

The club handed over its real `טופס הרשמה` and its `תנאי תשלום`. Three things follow, and
this revision is all three.

**Registration data gets columns, not answers.** ת.ז., address, city, home phone, grade and
the aliyah year could all have been questions in the template, which would have cost no
migration at all -- and would have put them inside `health_declaration.answers_encrypted`,
where §11.1 makes them manager-and-owner only with every read audit-logged. An address is
not medical data, and a coach who needs to know who may collect a child cannot be sent
through a break-glass to find out. So they land where they belong: on `person` and
`student`.

**Two of them are encrypted and three are not, and the split is deliberate.** A ת.ז. is a
national identifier and a year of immigration is national-origin data; an address, a home
phone and a grade are ordinary admin fields a coach reads off a roster. Encrypting those
too would put every roster render behind a decrypt to protect something the coach is
already authorised to see -- the same trade `health_declaration.derived_flags` makes in the
other direction.

**`club_terms` is a new consent type, and it is not `terms`.** `terms` is the PLATFORM's
terms of use, versioned by `POLICY_VERSION`, currently 0 because that text is an unreviewed
draft. The club's `תקנון` and `תנאי תשלום` are a different document by a different author,
versioned by `CLUB_TERMS_VERSION` at 1. One column cannot carry two version numbers, and
folding them together would make a reviewed privacy policy silently re-open a club
agreement nobody had touched.

**The v1 template is kept, not replaced.** Declarations already signed carry
`template_version = 1`, and `render_and_store_pdf` renders each one from the template it
was signed against. Dropping v1 would leave every existing signature pointing at questions
that no longer exist.
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: str | Sequence[str] | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: A frozen copy of app/services/structure/health_templates.py::FULL_TEMPLATE_SCHEMA as it
#: stood when this revision was written, in the same spirit as 0007's copy of v1. A
#: migration that imported the live constant would rewrite history the next time somebody
#: edited a question.
_FULL_TEMPLATE_SCHEMA_V2 = {
    "version": 2,
    "kind": "full",
    "title": "הצהרת בריאות",
    "sections": [
        {
            "id": "medical_history",
            "title": "רקע רפואי",
            "questions": [
                {"id": "chronic_illness", "type": "boolean", "label": "האם קיימת מחלה כרונית?"},
                {
                    "id": "chronic_illness_details",
                    "type": "text",
                    "label": "פירוט המחלה הכרונית",
                    "required": False,
                    "visible_if": {"chronic_illness": True},
                },
                {"id": "asthma", "type": "boolean", "label": "האם יש אסתמה?", "flag": True},
                {"id": "allergy", "type": "boolean", "label": "האם יש אלרגיה?", "flag": True},
                {
                    "id": "allergy_details",
                    "type": "text",
                    "label": "פירוט האלרגיה",
                    "required": False,
                    "visible_if": {"allergy": True},
                },
                {
                    "id": "medication",
                    "type": "boolean",
                    "label": "האם התלמיד/ה נוטל/ת תרופות באופן קבוע?",
                    "flag": True,
                },
                {
                    "id": "medication_details",
                    "type": "text",
                    "label": "אילו תרופות",
                    "required": False,
                    "visible_if": {"medication": True},
                },
                {
                    "id": "epilepsy",
                    "type": "boolean",
                    "label": "האם יש אפילפסיה או פרכוסים?",
                    "flag": True,
                },
                {"id": "diabetes", "type": "boolean", "label": "האם יש סוכרת?", "flag": True},
            ],
        },
        {
            "id": "cardiac",
            "title": "לב ומאמץ",
            "questions": [
                {
                    "id": "heart",
                    "type": "boolean",
                    "label": "האם ידוע על מחלת לב, מום לבבי או ניתוח לב?",
                    "flag": True,
                },
                {
                    "id": "chest_pain",
                    "type": "boolean",
                    "label": "האם הופיעו כאבים בחזה במהלך מאמץ גופני?",
                },
                {
                    "id": "fainting",
                    "type": "boolean",
                    "label": "האם הייתה התעלפות או סחרחורת במהלך מאמץ גופני?",
                },
                {
                    "id": "family_sudden_death",
                    "type": "boolean",
                    "label": "האם היה במשפחה מקרה של מוות פתאומי לפני גיל 50?",
                },
            ],
        },
        {
            "id": "orthopaedic",
            "title": "אורתופדיה ופציעות",
            "questions": [
                {
                    "id": "injury",
                    "type": "boolean",
                    "label": "האם קיימת פציעה פעילה או בעיה אורתופדית?",
                    "flag": True,
                },
                {
                    "id": "surgery_last_year",
                    "type": "boolean",
                    "label": "האם עבר/ה ניתוח בשנה האחרונה?",
                },
                {
                    "id": "restrictions",
                    "type": "text",
                    "label": "מגבלות פעילות גופנית",
                    "required": False,
                },
            ],
        },
        {
            "id": "other",
            "title": "נוסף",
            "questions": [
                {
                    "id": "other",
                    "type": "boolean",
                    "label": "האם יש מצב רפואי נוסף שחשוב שנדע עליו?",
                    "flag": True,
                },
                {
                    "id": "other_details",
                    "type": "text",
                    "label": "פירוט",
                    "required": False,
                    "visible_if": {"other": True},
                },
                {"id": "health_fund", "type": "text", "label": "קופת חולים", "required": False},
                {
                    "id": "emergency_contact",
                    "type": "phone",
                    "label": "טלפון לשעת חירום",
                    "required": True,
                },
            ],
        },
        {
            "id": "declaration",
            "title": "הצהרה",
            "questions": [
                {
                    "id": "special_notes",
                    "type": "text",
                    "label": "הערות בריאות מיוחדות",
                    "required": False,
                },
                {
                    "id": "clause_confirmed",
                    "type": "clause",
                    "label": "אני מאשר/ת את ההצהרה שלמעלה",
                    "required": True,
                },
            ],
        },
    ],
}

#: `EncryptedBytes` and `EncryptedJSON` are both `LargeBinary` at the storage layer
#: (app/core/encryption.py) -- the ciphertext is bytes whatever the plaintext was.
_ENCRYPTED = sa.LargeBinary()


def upgrade() -> None:
    """Upgrade schema."""
    # -- registration details, on the person they describe ----------------------------
    op.add_column("person", sa.Column("national_id_encrypted", _ENCRYPTED, nullable=True))
    op.add_column("person", sa.Column("address", sa.String(length=200), nullable=True))
    op.add_column("person", sa.Column("city", sa.String(length=80), nullable=True))
    op.add_column("person", sa.Column("phone_home", sa.String(length=32), nullable=True))
    op.add_column("person", sa.Column("aliyah_year_encrypted", _ENCRYPTED, nullable=True))

    # `כיתה/גן`. String, not an integer: `ג'` and `גן חובה` are both answers the paper
    # form accepts, and a smallint refuses half the intake every September.
    op.add_column("student", sa.Column("grade", sa.String(length=20), nullable=True))

    # -- who may collect the child ----------------------------------------------------
    op.create_table(
        "student_pickup_contact",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contact_encrypted", _ENCRYPTED, nullable=False),
        # `server_default` on both, matching every other table in the schema. Without it the
        # model's `server_default=func.now()` is a promise the database does not keep, and any
        # INSERT naming `created_at` but not `updated_at` -- which is every service that takes
        # an `at=` -- dies on a not-null violation.
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
        # RESTRICT, not CASCADE: TenantMixin declares the studio FK that way for every
        # tenant-scoped table, and `alembic check` compares this against the model.
        sa.ForeignKeyConstraint(["studio_id"], ["studio.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["student_id"], ["student.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # TenantMixin's leading composite index. Both the name and the (studio_id, id) shape come
    # from app/core/tenancy.py -- `ix_{table}_studio_id_id`, not a studio_id-only index. G9,
    # and `alembic check` compares it against the model rather than taking it on trust.
    op.create_index(
        "ix_student_pickup_contact_studio_id_id",
        "student_pickup_contact",
        ["studio_id", "id"],
    )
    op.create_index(
        "ix_student_pickup_contact_student",
        "student_pickup_contact",
        ["studio_id", "student_id"],
    )

    # -- the club's own terms are a consent type of their own -------------------------
    op.drop_constraint("consent_record_consent_type", "consent_record", type_="check")
    op.create_check_constraint(
        "consent_record_consent_type",
        "consent_record",
        "consent_type IN ('terms', 'privacy', 'photo_video', 'medical_share', 'event', "
        "'club_terms')",
    )

    # -- v2 of the full template, alongside v1 ----------------------------------------
    # One row per studio, skipping any that already has one, for exactly the reason 0007
    # gives: `ensure_full_template` seeds the same row for studios provisioned after this
    # revision and the demo fixture layer re-seeds it after a reset, so a database can
    # genuinely arrive here with the row present -- and the unique index on
    # (studio_id, kind, version) would make that an integrity error rather than a no-op.
    op.execute(
        sa.text(
            "INSERT INTO health_form_template "
            "(id, studio_id, kind, version, schema, published_at, created_at, updated_at) "
            "SELECT gen_random_uuid(), s.id, 'full', 2, CAST(:schema AS jsonb), "
            "       now(), now(), now() "
            "FROM studio s "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM health_form_template t "
            "  WHERE t.studio_id = s.id AND t.kind = 'full' AND t.version = 2"
            ")"
        ).bindparams(schema=json.dumps(_FULL_TEMPLATE_SCHEMA_V2, ensure_ascii=False))
    )


def downgrade() -> None:
    """Downgrade schema."""
    # The v2 seed goes first. Scoped to v2, and skipping any row a declaration already
    # points at: a studio that has since published a v3 keeps it, because this revision
    # did not create that one, and a template with signatures against it is not ours to
    # delete.
    op.execute(
        sa.text(
            "DELETE FROM health_form_template WHERE kind = 'full' AND version = 2 "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM health_declaration d "
            "  WHERE d.template_id = health_form_template.id"
            ")"
        )
    )

    # A `club_terms` row cannot survive the narrowed constraint. Deleting one is not
    # something this codebase does anywhere -- `consent_record` is append-only by design,
    # and §11.6 makes a withdrawal a new row rather than an edit. So the downgrade REFUSES
    # rather than quietly destroying the evidence that a family agreed to something.
    count = (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM consent_record WHERE consent_type = 'club_terms'"))
        .scalar_one()
    )
    if count:
        raise RuntimeError(
            f"{count} club_terms consent rows exist; downgrading would delete signed "
            "agreements. Revoke them through the app first if this is really intended."
        )
    op.drop_constraint("consent_record_consent_type", "consent_record", type_="check")
    op.create_check_constraint(
        "consent_record_consent_type",
        "consent_record",
        "consent_type IN ('terms', 'privacy', 'photo_video', 'medical_share', 'event')",
    )

    op.drop_index("ix_student_pickup_contact_student", table_name="student_pickup_contact")
    op.drop_index("ix_student_pickup_contact_studio_id_id", table_name="student_pickup_contact")
    op.drop_table("student_pickup_contact")

    op.drop_column("student", "grade")
    op.drop_column("person", "aliyah_year_encrypted")
    op.drop_column("person", "phone_home")
    op.drop_column("person", "city")
    op.drop_column("person", "address")
    op.drop_column("person", "national_id_encrypted")
