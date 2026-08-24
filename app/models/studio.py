"""The tenant root. Not itself tenant-scoped -- it *is* the tenant, so it carries no
`studio_id` and does not inherit TenantMixin.

SPEC §4.3's `created_by_identity_id` is deliberately absent: it references
`auth_identity`, which M1 owns. M1 adds the column and the foreign key in the same
revision that creates the table it points at.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, CheckConstraint, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

STUDIO_STATUSES = ("active", "suspended")


class Studio(UUIDPrimaryKey, TimestampColumns, Base):
    __tablename__ = "studio"
    __table_args__ = (CheckConstraint("status IN ('active', 'suspended')", name="studio_status"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    logo_object_key: Mapped[str | None] = mapped_column(String(500))
    # G3 -- a rendering timezone, never a storage timezone.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Jerusalem")
    default_locale: Mapped[str] = mapped_column(String(8), nullable=False, default="he")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # §19.7 -- the demo studio is excluded from every cross-studio total.
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
