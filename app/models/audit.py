"""SPEC §11.2 -- the append-only audit log.

Not TenantMixin, deliberately. SPEC §4.3 writes ``studio_id?``: a platform login, a
studio switch and a break-glass grant (§18.2) all happen outside any one studio, and
``platform_admin`` reads this table globally. It is therefore listed in invariant 2's
exemption set with that reason, rather than being silently different from every other
table.

``actor_person_id`` and ``actor_identity_id`` referenced ``person`` and ``auth_identity``
with no foreign key until M1 created those tables. Revision 0005 added both constraints
and this module now declares them, so ``alembic check`` stops proposing to drop what the
migration just created.

``ondelete="RESTRICT"``, like every other reference in this schema, and here it earns it
twice over: §11.2 makes this table append-only, and a cascade would let deleting a person
silently erase the record of what they did. §11.4's anonymization wipes the Person's
fields and leaves the row -- which is exactly why RESTRICT never fires in practice.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampColumns, UUIDPrimaryKey


class AuditLog(UUIDPrimaryKey, TimestampColumns, Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        # Managers view the trail for one entity; platform_admin views it globally.
        # Leading with studio_id serves the first without hurting the second.
        Index(
            "ix_audit_log_studio_id_entity_type_entity_id",
            "studio_id",
            "entity_type",
            "entity_id",
        ),
        Index("ix_audit_log_studio_id_created_at", "studio_id", "created_at"),
    )

    studio_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("studio.id", ondelete="RESTRICT")
    )
    actor_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT")
    )
    actor_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT")
    )
    actor_ip: Mapped[str | None] = mapped_column(INET)

    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    # §11.2 -- "whether the data was sensitive". Answers "who has seen my child's medical
    # information?" without reading anything sensitive in order to do it.
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diff: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
