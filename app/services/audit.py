"""The only supported way a row reaches ``audit_log``.

G6 -- business logic lives in a service; routers parse, call, return.

The ORM guard below is belt-and-braces. The enforcement is the grant in revision 0002:
the application role holds INSERT and SELECT and nothing else. The guard exists so the
failure arrives as a readable Python exception during development rather than as a
Postgres permission error in production.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.audit import AuditLog


class AuditLogImmutableError(RuntimeError):
    """Raised on any attempt to modify or delete an audit entry."""


class AuditService:
    @staticmethod
    def record(
        session: Session,
        *,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID,
        studio_id: uuid.UUID | None = None,
        actor_person_id: uuid.UUID | None = None,
        actor_identity_id: uuid.UUID | None = None,
        actor_ip: str | None = None,
        is_sensitive: bool = False,
        diff: dict[str, Any] | None = None,
    ) -> AuditLog:
        """Append one entry.

        ``diff`` is written verbatim, so a caller must never put a health declaration's
        contents in it (G7). Pass the derived booleans or the names of the fields that
        changed -- never the answers.
        """
        entry = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            studio_id=studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=actor_ip,
            is_sensitive=is_sensitive,
            diff=diff,
        )
        session.add(entry)
        return entry


@event.listens_for(Session, "before_flush")
def _refuse_to_mutate_audit_entries(session: Session, flush_context: Any, instances: Any) -> None:
    for obj in session.dirty:
        if isinstance(obj, AuditLog) and session.is_modified(obj, include_collections=False):
            raise AuditLogImmutableError(
                "audit_log is append-only (SPEC §11.2). The application DB role holds "
                "INSERT and no UPDATE; this guard only makes that arrive sooner."
            )
    for obj in session.deleted:
        if isinstance(obj, AuditLog):
            raise AuditLogImmutableError("audit_log is append-only (SPEC §11.2)")
