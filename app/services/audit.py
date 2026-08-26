"""The only supported way a row reaches ``audit_log``.

G6 -- business logic lives in a service; routers parse, call, return.

The ORM guard below is belt-and-braces. The enforcement is the grant in revision 0002:
the application role holds INSERT and SELECT and nothing else. The guard exists so the
failure arrives as a readable Python exception during development rather than as a
Postgres permission error in production.
"""

from __future__ import annotations

import ipaddress
import uuid
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def _storable_ip(value: str | None) -> str | None:
    """``audit_log.actor_ip`` is ``INET``; a caller has whatever the request had.

    Routers pass ``request.client.host``, which is not guaranteed to be an address --
    under Starlette's ``TestClient`` it is the literal ``testclient``, a proxy that could
    not resolve a peer sends ``unknown``, and an ASGI scope with no client yields nothing
    at all. Postgres rejects each of them, and the failed INSERT fails the audited action
    around it.

    §11.2 wants the trail to be reliable, so the address gives way rather than the entry:
    the address is context, the entry is the record. Dropping it is visible (the column is
    NULL) in a way a lost row is not.

    Found by lane HEALTH (M4) writing §11.2's every-read entry. It lives here rather than
    in a router because this is the one function every lane funnels through, and two lanes
    each carrying their own ``_client_ip`` helper is how one of them gets it subtly wrong.
    """
    if value is None:
        return None
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return None
    return value


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

        ``actor_ip`` is sanitised rather than trusted -- see ``_storable_ip``. A caller may
        hand over ``request.client.host`` without checking it first.
        """
        entry = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            studio_id=studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            actor_ip=_storable_ip(actor_ip),
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
