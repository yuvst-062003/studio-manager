"""SPEC §4.3's health block -- the template, the declaration and the consent ledger.

Conflict C3 is why this file arrived in two pieces. §14 puts health declarations in M4,
but M3's trial booking (§5.4a) needed a `kind='trial'` template before that, and §4.3
already types the column `kind(full|trial)` -- so the seam was already cut. M1 created
`health_form_template` in revision `0005` and seeded the trial form; W3's contract commit
appended `health_declaration` and `consent_record` beneath it in revision `0007`.

**The two tables below the template are the most sensitive in the product.** G7 and §19.6
restriction 3: they hold a minor's medical answers and a drawn signature. Never logged,
never in an audit `diff` (§11.2), never returned to a coach-scoped caller. What a coach
sees is `derived_flags` -- booleans, never free text (§5.5).

`HealthFormTemplate` still holds questions and never answers, and
`test_no_column_here_could_hold_an_answer` in tests/structure keeps it that way. That
absence is the property that let M1 touch health at all, and it survives this wave.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encryption import EncryptedBytes, EncryptedJSON
from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

HEALTH_TEMPLATE_KINDS = ("full", "trial")

#: §4.3 -- `consent_record  subject_type(person|student)`. A photo consent is about a
#: child; a terms acceptance is about the adult who accepted it. One table, two subjects,
#: because the revocation and versioning rules are identical for both.
CONSENT_SUBJECT_TYPES = ("person", "student")

#: §4.3 -- `consent_record  consent_type(terms|privacy|photo_video|medical_share|event)`,
#: plus `club_terms`.
#:
#: **`club_terms` is the club's own regulations and payment terms, and `terms` is not.**
#: `terms` is the PLATFORM's terms of use, versioned by `POLICY_VERSION` and gating §6.1
#: step 5. The club's `תקנון` and `תנאי תשלום` are a different document, written by a
#: different party, versioned by `CLUB_TERMS_VERSION`, and gating the registration
#: agreement instead. Folding them into `terms` would make one version number answer for
#: two documents, so a reviewed privacy policy would silently re-open a club agreement
#: nobody had changed.
#:
#: **One value, not two.** The paper form's single signature covers the regulations and
#: (now) the payment terms together, and splitting them would let a club change a payment
#: date without re-confirming the regulations that date sits inside.
CONSENT_TYPES = ("terms", "privacy", "photo_video", "medical_share", "event", "club_terms")


class HealthFormTemplate(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.5 -- 'the studio's existing PDF is mapped once into
    health_form_template.schema (a versioned JSON schema of sections, questions and
    types) and the original is kept at source_pdf_object_key for reference.'"""

    __tablename__ = "health_form_template"
    __tenant_table_args__ = (
        CheckConstraint("kind IN ('full', 'trial')", name="health_form_template_kind"),
        # A second v1 trial template in one studio is ambiguity at the exact moment a
        # parent is signing something.
        Index(
            "uq_health_form_template_kind_version",
            "studio_id",
            "kind",
            "version",
            unique=True,
        ),
    )

    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    # §4.3 stores template_version on the declaration, so a signature records which
    # questions were actually asked. A template with no version makes that column
    # meaningless the first time the questions change.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # The questions, never the answers. Nothing in this row is personal data.
    schema: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    source_pdf_object_key: Mapped[str | None] = mapped_column(String(500))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HealthDeclaration(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3's `health_declaration`. **The most sensitive table in the product.**

    **Why the answers are encrypted and the flags are not.** D11 explains the design: a
    coach must see `⚠ אסתמה` on the roster, and that badge is derived from structured
    answers. If the flags were encrypted too, rendering a roster would mean decrypting
    every child's medical record on every render -- the exact "open the full declaration to
    see a badge" outcome §11.1 and §11.2 exist to prevent. So the answers are encrypted
    and manager-only with every read audit-logged, and the flags are plaintext booleans a
    coach is already authorised for.

    `derived_flags` holds **booleans only** -- `{"asthma": true, "allergy": true}` -- never
    free text (§4.3). A free-text flag would put a medical description on a roster, which
    is precisely what the flag mechanism replaced.

    **Declarations do not expire.** §5.5: `valid_until` is `NULL` and
    `health_declaration_validity_months` defaults to `null` -- a config flag on
    `studio.settings`, not a migration. A studio that later wants annual renewal sets the
    setting; nothing here changes.
    """

    __tablename__ = "health_declaration"
    __tenant_table_args__ = (
        # One live declaration per student. A second signature supersedes rather than
        # coexists: two declarations means two answers to "is this child asthmatic".
        Index(
            "uq_health_declaration_student_id",
            "student_id",
            unique=True,
        ),
        Index("ix_health_declaration_studio_id_signed_at", "studio_id", "signed_at"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("health_form_template.id", ondelete="RESTRICT"),
        nullable=False,
    )
    #: §4.3 stores the version alongside the id. D11 makes editing the questions a
    #: manager's right, so without this a template edit silently rewrites the meaning of
    #: every signature already collected.
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    #: §11.1 -- a minor's medical information. Manager and owner only, every read
    #: audit-logged (§11.2). G7: never logged, never in an audit `diff`.
    answers_encrypted: Mapped[Any] = mapped_column(
        EncryptedJSON("health_declaration.answers_encrypted"), nullable=False
    )
    #: **Booleans only.** This is what a coach sees. See the class docstring for why it is
    #: deliberately NOT encrypted.
    derived_flags: Mapped[dict[str, bool]] = mapped_column(JSONB, nullable=False, default=dict)
    #: A finger-drawn signature is biometric-adjacent personal data, stored the same way
    #: as the answers rather than as a plain BYTEA blob.
    signature_image_encrypted: Mapped[bytes | None] = mapped_column(
        EncryptedBytes("health_declaration.signature_image_encrypted")
    )
    signed_by_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: §5.5 -- NULL by default; declarations do not expire. See the class docstring.
    valid_until: Mapped[date | None] = mapped_column(Date)
    #: The signing context. D11's caveat is that the bundled template is a starting point
    #: and explicitly not a compliance artefact; a defensible audit trail is what makes it
    #: usable anyway.
    signed_ip: Mapped[str | None] = mapped_column(String(45))
    signed_user_agent: Mapped[str | None] = mapped_column(String(400))
    #: §5.5's rendered PDF. Object storage, not a column -- the file is large and its
    #: contents are the same personal data as `answers_encrypted`.
    pdf_object_key: Mapped[str | None] = mapped_column(String(500))


class ConsentRecord(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3's `consent_record`, §11.6's consent ledger.

    **Versioned and revocable, and both are the point.** Agreeing to v1 of a privacy
    policy is not agreeing to v2, and a consent that cannot be withdrawn is not consent.
    `granted` is a boolean rather than a status because a withdrawal is a *new row*, not
    an edit -- §11.2's append-only reasoning applied to consent.
    """

    __tablename__ = "consent_record"
    __tenant_table_args__ = (
        CheckConstraint(
            "subject_type IN ('person', 'student')", name="consent_record_subject_type"
        ),
        CheckConstraint(
            "consent_type IN ('terms', 'privacy', 'photo_video', 'medical_share', 'event', "
            "'club_terms')",
            name="consent_record_consent_type",
        ),
        Index(
            "ix_consent_record_subject",
            "studio_id",
            "subject_type",
            "subject_id",
            "consent_type",
        ),
    )

    subject_type: Mapped[str] = mapped_column(String(10), nullable=False)
    #: No foreign key: the subject is a `person` or a `student` depending on
    #: `subject_type`, and a polymorphic reference cannot carry one.
    subject_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    consent_type: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(String(45))
