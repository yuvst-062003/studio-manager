"""W3's half of §4.3's health block — `health_declaration` and `consent_record`.

**Not discovered, and that is the point.** `app/models/__init__.py` imports every module
beside it whose name does not start with `_`, so nothing in this package reaches
`Base.metadata`. `main` owns `alembic/versions/**` and authors one revision per wave in
that wave's contract commit; a model in the metadata with no table behind it makes
`alembic check` red and the demo wipe (which derives its plan from the metadata) fail on a
relation that does not exist. Sitting here, these are reviewed, diffable and inert.

**W3's contract commit moves this file up one directory**, adds the two classes to
`app/models/health.py` beside `HealthFormTemplate`, and autogenerates `0007`. The split is
here rather than in `health.py` because M1 already created `health_form_template` in
revision `0005` as conflict C3's resolution — half this module is migrated and half is not.

See `docs/plan/migrations/w3-draft.py` for what that revision must contain, and
specifically what autogenerate gets wrong.
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

# ---------------------------------------------------------------------------
# W3's contract commit adds the two tables the module docstring reserved for M4.
#
# C3 is now fully resolved: M1 created the template and seeded the trial form, and this
# is the declaration those questions are answered into, plus §11.6's consent ledger.
#
# **G7 governs everything below.** Never log these contents, never put them in an audit
# `diff` (§11.2), and never return `answers_encrypted` to a coach-scoped caller. What a
# coach sees is `derived_flags` — booleans, never free text (§5.5).
# ---------------------------------------------------------------------------

#: §4.3 — `consent_record  subject_type(person|student)`. A photo consent is about a
#: child; a terms acceptance is about the adult who accepted it. One table, two subjects,
#: because the revocation and versioning rules are identical for both.
CONSENT_SUBJECT_TYPES = ("person", "student")

#: §4.3 — `consent_record  consent_type(terms|privacy|photo_video|medical_share|event)`.
CONSENT_TYPES = ("terms", "privacy", "photo_video", "medical_share", "event")


class HealthDeclaration(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3's `health_declaration`. **The most sensitive table in the product.**

    **Why the answers are encrypted and the flags are not.** D11 explains the design: a
    coach must see `⚠ אסתמה` on the roster, and that badge is derived from structured
    answers. If the flags were encrypted too, rendering a roster would mean decrypting
    every child's medical record on every render — the exact "open the full declaration to
    see a badge" outcome §11.1 and §11.2 exist to prevent. So the answers are encrypted
    and manager-only with every read audit-logged, and the flags are plaintext booleans a
    coach is already authorised for.

    `derived_flags` holds **booleans only** — `{"asthma": true, "allergy": true}` — never
    free text (§4.3). A free-text flag would put a medical description on a roster, which
    is precisely what the flag mechanism replaced.

    **Declarations do not expire.** §5.5: `valid_until` is `NULL` and
    `health_declaration_validity_months` defaults to `null` — a config flag on
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
    #: §11.1 — a minor's medical information. Manager and owner only, every read
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
    #: §5.5 — NULL by default; declarations do not expire. See the class docstring.
    valid_until: Mapped[date | None] = mapped_column(Date)
    #: The signing context. D11's caveat is that the bundled template is a starting point
    #: and explicitly not a compliance artefact; a defensible audit trail is what makes it
    #: usable anyway.
    signed_ip: Mapped[str | None] = mapped_column(String(45))
    signed_user_agent: Mapped[str | None] = mapped_column(String(400))
    #: §5.5's rendered PDF. Object storage, not a column — the file is large and its
    #: contents are the same personal data as `answers_encrypted`.
    pdf_object_key: Mapped[str | None] = mapped_column(String(500))


class ConsentRecord(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3's `consent_record`, §11.6's consent ledger.

    **Versioned and revocable, and both are the point.** Agreeing to v1 of a privacy
    policy is not agreeing to v2, and a consent that cannot be withdrawn is not consent.
    `granted` is a boolean rather than a status because a withdrawal is a *new row*, not
    an edit — §11.2's append-only reasoning applied to consent.
    """

    __tablename__ = "consent_record"
    __tenant_table_args__ = (
        CheckConstraint(
            "subject_type IN ('person', 'student')", name="consent_record_subject_type"
        ),
        CheckConstraint(
            "consent_type IN ('terms', 'privacy', 'photo_video', 'medical_share', 'event')",
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
