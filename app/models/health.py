"""SPEC §4.3's health block -- **the template only**.

Conflict C3: §14 puts health declarations in M4, but M3's trial booking (§5.4a) needs a
`kind='trial'` declaration before that. §4.3 already types the column `kind(full|trial)`,
so the seam was already cut -- M1 creates the template table and seeds the trial form,
and M4 adds `health_declaration` and `consent_record` to this file and owns everything
about them: the signature capture, the encryption, the PDF render, the derived-flag
pipeline.

**Nothing here may ever hold a minor's answers.** G7 and §19.6 restriction 3 are about
`health_declaration`, and two tests in tests/structure assert this module has not quietly
grown one -- neither a new table nor an `answers` column on this one. That absence is the
property that lets M1 touch health at all.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

HEALTH_TEMPLATE_KINDS = ("full", "trial")


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
