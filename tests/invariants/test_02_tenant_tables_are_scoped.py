"""SPEC §13 invariant 2 / G9 / SPEC §4.2 layer 3.

Stated as a closed rule rather than an open one: every mapped table either inherits
TenantMixin -- and therefore carries a non-null studio_id and a composite index leading
with it -- or appears below with a reason. A table cannot become cross-tenant by
omission, which is the only way this invariant could quietly stop meaning anything.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
import sqlalchemy as sa
from app.core.tenancy import TenantMixin
from app.models.base import Base
from sqlalchemy import Column, ForeignKey, MetaData, String, Table
from sqlalchemy.dialects.postgresql import UUID as PGUUID

CROSS_TENANT_TABLES = {
    "studio": "the tenant root -- it *is* the tenant, so it carries no studio_id",
    "audit_log": (
        "SPEC 4.3 writes `studio_id?`. A platform login, a studio switch and a "
        "break-glass grant (18.2) all happen outside any studio, and platform_admin "
        "reads the table globally (11.2)"
    ),
    "alembic_version": "Alembic's own bookkeeping, not application data",
}


def tenant_mapped_tables() -> set[str]:
    return {
        mapper.local_table.name
        for mapper in Base.registry.mappers
        if issubclass(mapper.class_, TenantMixin) and mapper.local_table is not None
    }


def unscoped_tables(metadata: sa.MetaData, tenant_tables: set[str]) -> list[str]:
    return sorted(
        table.name
        for table in metadata.tables.values()
        if table.name not in tenant_tables and table.name not in CROSS_TENANT_TABLES
    )


def badly_scoped(metadata: sa.MetaData, tenant_tables: set[str]) -> list[str]:
    bad = []
    for name in sorted(tenant_tables):
        table = metadata.tables[name]
        column = table.c.get("studio_id")
        if column is None:
            bad.append(f"{name} inherits TenantMixin but has no studio_id")
            continue
        if column.nullable:
            bad.append(f"{name}.studio_id is nullable")
        leading_composite = [
            tuple(index.columns.keys())
            for index in table.indexes
            if len(index.columns) > 1 and tuple(index.columns.keys())[0] == "studio_id"
        ]
        if not leading_composite:
            bad.append(f"{name} has no composite index leading with studio_id")
    return bad


def test_every_table_is_tenant_scoped_or_documented_as_not():
    assert unscoped_tables(Base.metadata, tenant_mapped_tables()) == []


def test_every_tenant_table_has_a_non_null_studio_id_and_a_leading_index():
    assert badly_scoped(Base.metadata, tenant_mapped_tables()) == []


def test_every_exemption_carries_a_real_reason():
    """An exemption list without reasons becomes a place to hide a table."""
    for table, reason in CROSS_TENANT_TABLES.items():
        assert len(reason) > 20, f"{table}'s exemption has no real reason"


def test_the_exemption_list_names_no_table_that_does_not_exist():
    """A stale exemption is an exemption nobody notices has stopped applying."""
    known = set(Base.metadata.tables) | {"alembic_version"}
    assert set(CROSS_TENANT_TABLES) <= known, set(CROSS_TENANT_TABLES) - known


# -- proven to fire ----------------------------------------------------------
def test_the_detector_flags_an_undocumented_table_with_no_studio_id():
    probe = MetaData()
    Table("smuggled", probe, Column("id", PGUUID(as_uuid=True), primary_key=True))
    assert unscoped_tables(probe, set()) == ["smuggled"]


def test_the_detector_flags_a_nullable_studio_id_and_a_missing_index():
    probe = MetaData()
    Table("studio", probe, Column("id", PGUUID(as_uuid=True), primary_key=True))
    Table(
        "sloppy",
        probe,
        Column("id", PGUUID(as_uuid=True), primary_key=True),
        Column("studio_id", PGUUID(as_uuid=True), ForeignKey("studio.id"), nullable=True),
        Column("name", String(10)),
    )
    assert badly_scoped(probe, {"sloppy"}) == [
        "sloppy.studio_id is nullable",
        "sloppy has no composite index leading with studio_id",
    ]


def test_the_detector_rejects_an_index_that_does_not_lead_with_studio_id():
    """An index on (id, studio_id) does not serve a tenant scan -- only the leading
    column is usable for it, so this is a real defect and not a style point."""
    probe = MetaData()
    Table("studio", probe, Column("id", PGUUID(as_uuid=True), primary_key=True))
    table = Table(
        "trailing",
        probe,
        Column("id", PGUUID(as_uuid=True), primary_key=True),
        Column("studio_id", PGUUID(as_uuid=True), ForeignKey("studio.id"), nullable=False),
    )
    sa.Index("ix_trailing_id_studio_id", table.c.id, table.c.studio_id)
    assert badly_scoped(probe, {"trailing"}) == [
        "trailing has no composite index leading with studio_id"
    ]


def test_the_detector_accepts_a_correctly_scoped_table():
    probe = MetaData()
    Table("studio", probe, Column("id", PGUUID(as_uuid=True), primary_key=True))
    table = Table(
        "proper",
        probe,
        Column("id", PGUUID(as_uuid=True), primary_key=True),
        Column("studio_id", PGUUID(as_uuid=True), ForeignKey("studio.id"), nullable=False),
    )
    sa.Index("ix_proper_studio_id_id", table.c.studio_id, table.c.id)
    assert badly_scoped(probe, {"proper"}) == []
