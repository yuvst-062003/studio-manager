"""The tenant root. Not itself tenant-scoped -- it *is* the tenant, so it carries no
`studio_id` and does not inherit TenantMixin.

SPEC §4.3's `created_by_identity_id` was deferred out of M0 because it references
`auth_identity`, which M1 owns. It landed in revision 0005, the same revision that
creates the table it points at -- the pattern app/models/audit.py's actor columns used
for the same reason.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
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
    # §4.3, and §5.1's chain of authority made durable: a studio is provisioned by the
    # platform operator, never self-created, so this records which identity did it.
    # Nullable because revision 0003 created the demo studio before any identity existed
    # to attribute it to.
    created_by_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT")
    )
