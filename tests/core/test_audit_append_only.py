"""SPEC 11.2 -- append-only, enforced by grant.

The grant assertions are the real gate. The ORM guard is asserted too, but only so a
developer sees a readable error before Postgres does.
"""

from __future__ import annotations

import uuid

import pytest
from app.core.config import settings
from app.models.audit import AuditLog
from app.services.audit import AuditLogImmutableError, AuditService
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session


@pytest.mark.db
def test_the_table_carries_every_column_spec_4_3_lists(migrated: Engine):
    columns = {c["name"] for c in inspect(migrated).get_columns("audit_log")}
    assert {
        "id",
        "studio_id",
        "actor_person_id",
        "actor_identity_id",
        "actor_ip",
        "action",
        "entity_type",
        "entity_id",
        "is_sensitive",
        "diff",
        "created_at",
    } <= columns


@pytest.mark.db
@pytest.mark.parametrize("privilege", ["UPDATE", "DELETE", "TRUNCATE"])
def test_the_application_role_cannot_change_a_row(migrated: Engine, privilege: str):
    """The whole of 11.2, asserted against the actual grants rather than against a
    comment saying it is so."""
    with migrated.connect() as connection:
        granted = connection.execute(
            text("SELECT has_table_privilege(:role, 'audit_log', :privilege)"),
            {"role": settings.APP_DB_ROLE, "privilege": privilege},
        ).scalar_one()
    assert granted is False, f"{settings.APP_DB_ROLE} holds {privilege} on audit_log"


@pytest.mark.db
@pytest.mark.parametrize("privilege", ["INSERT", "SELECT"])
def test_the_application_role_can_still_append_and_read(migrated: Engine, privilege: str):
    """The other half. A role that cannot INSERT makes the audit log a decoration, and a
    role that cannot SELECT makes "who has seen my child's medical information?"
    unanswerable."""
    with migrated.connect() as connection:
        granted = connection.execute(
            text("SELECT has_table_privilege(:role, 'audit_log', :privilege)"),
            {"role": settings.APP_DB_ROLE, "privilege": privilege},
        ).scalar_one()
    assert granted is True


@pytest.mark.db
def test_the_grant_is_enforced_by_postgres_not_only_by_us(app_session: Session):
    """Behaviour, not metadata: issue a raw UPDATE as the application role and watch the
    database refuse it."""
    with pytest.raises(ProgrammingError) as caught:
        app_session.execute(text("UPDATE audit_log SET action = 'tampered'"))
    assert "permission denied" in str(caught.value).lower()
    app_session.rollback()


@pytest.mark.db
def test_the_application_role_really_can_insert(app_session: Session):
    """Pairs with the test above: proving UPDATE is denied is only meaningful if INSERT
    demonstrably still works as the same role."""
    entry_id = uuid.uuid4()
    app_session.execute(
        text(
            "INSERT INTO audit_log (id, action, entity_type, entity_id, is_sensitive) "
            "VALUES (:id, 'test.insert', 'studio', :entity_id, false)"
        ),
        {"id": entry_id, "entity_id": uuid.uuid4()},
    )
    app_session.commit()
    stored = app_session.execute(
        text("SELECT action FROM audit_log WHERE id = :id"), {"id": entry_id}
    ).scalar_one()
    assert stored == "test.insert"


@pytest.mark.db
def test_recording_an_entry_writes_a_row(migrated: Engine):
    entity_id = uuid.uuid4()
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session,
            action="health_declaration.read",
            entity_type="health_declaration",
            entity_id=entity_id,
            actor_ip="203.0.113.7",
            is_sensitive=True,
        )
        session.commit()

        stored = session.get(AuditLog, entry.id)
        assert stored is not None
        assert stored.is_sensitive is True
        assert stored.entity_id == entity_id
        assert stored.created_at is not None


@pytest.mark.db
def test_the_orm_refuses_to_update_an_entry(migrated: Engine):
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session, action="login", entity_type="auth_identity", entity_id=uuid.uuid4()
        )
        session.commit()
        entry.action = "rewritten"
        with pytest.raises(AuditLogImmutableError):
            session.flush()
        session.rollback()


@pytest.mark.db
def test_the_orm_refuses_to_delete_an_entry(migrated: Engine):
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session, action="login", entity_type="auth_identity", entity_id=uuid.uuid4()
        )
        session.commit()
        session.delete(entry)
        with pytest.raises(AuditLogImmutableError):
            session.flush()
        session.rollback()


@pytest.mark.db
def test_a_platform_level_action_may_have_no_studio(migrated: Engine):
    """SPEC 4.3 writes `studio_id?`. A break-glass grant (18.2) and a platform login
    happen outside any studio, which is why audit_log sits in invariant 2's documented
    exemption list rather than being silently different."""
    with Session(migrated, expire_on_commit=False) as session:
        entry = AuditService.record(
            session,
            action="platform.break_glass",
            entity_type="studio",
            entity_id=uuid.uuid4(),
        )
        session.commit()
        assert entry.studio_id is None


@pytest.mark.db
def test_the_entity_lookup_index_leads_with_studio_id(migrated: Engine):
    """Managers read the trail for one entity inside their own studio; platform_admin
    reads it globally. Leading with studio_id serves the first without hurting the
    second."""
    indexes = inspect(migrated).get_indexes("audit_log")
    leading = {tuple(i["column_names"])[0] for i in indexes}
    assert "studio_id" in leading, indexes


# -- actor_ip is INET, and callers hand it whatever the request had -------------------
@pytest.mark.parametrize(
    "not_an_address",
    [
        # Starlette's TestClient sets request.client.host to this. Every audited route
        # exercised by a test therefore passes it, and INET rejects it -- taking the
        # audited write, and the request around it, down with it.
        "testclient",
        # A proxy that could not resolve a peer. Seen in the wild as a literal.
        "unknown",
        # An empty client host, which is what an ASGI scope with no client yields.
        "",
    ],
)
def test_a_non_address_actor_ip_is_dropped_rather_than_breaking_the_write(
    app_session: Session, not_an_address: str
):
    """`audit_log.actor_ip` is INET. A caller passes `request.client.host`, which is not
    guaranteed to be an address -- under TestClient it is the literal `testclient`.

    Postgres rejects it and the INSERT fails, which fails the audited action too. §11.2
    wants the trail to be reliable; a service that lets an unparseable client host destroy
    the write has the reliability backwards. The address is context, the entry is the
    record -- so the address is what gives way.

    Found by lane HEALTH (M4), which hit it writing §11.2's every-read entry and worked
    around it in its own routers. Fixed here instead: `AuditService.record` is the one
    place every lane funnels through, and two lanes each carrying their own `_client_ip`
    helper is how one of them gets it subtly wrong.
    """
    entry = AuditService.record(
        app_session,
        action="probe.non_address_ip",
        entity_type="student",
        entity_id=uuid.uuid4(),
        studio_id=None,
        actor_ip=not_an_address,
    )
    app_session.commit()
    assert entry.actor_ip is None


@pytest.mark.parametrize("address", ["203.0.113.7", "::1", "2001:db8::1", "127.0.0.1"])
def test_a_real_address_still_survives(app_session: Session, address: str):
    """The other half. A sanitiser that dropped every address would satisfy the test above
    and delete the column's reason for existing -- §18.2's break-glass trail is worth less
    without the peer it came from. IPv6 is included because the naive fix is a dotted-quad
    regex.

    Compared as text because psycopg adapts INET back to an `ipaddress` object on read, so
    the round-tripped value is `IPv4Address('203.0.113.7')` and not the `str` the model
    types the column as. Worth knowing before anyone writes `actor_ip.startswith(...)`.
    """
    entry = AuditService.record(
        app_session,
        action="probe.real_ip",
        entity_type="student",
        entity_id=uuid.uuid4(),
        studio_id=None,
        actor_ip=address,
    )
    app_session.commit()
    assert str(entry.actor_ip) == address
