"""§19.7 -- 'POST /dev/demo/reset restores the fixture set from a versioned seed.'

The property worth testing is not "reset ran". It is that the wipe is derived from
Base.metadata rather than from a list someone has to remember to extend -- because a
reset that leaves a later wave's rows behind is worse than no reset at all: it hides
exactly the stale-state bugs it exists to prevent, and it does so silently.
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from app.models.base import Base
from app.services.demo import DEMO_STUDIO_SLUG
from app.services.demo.fixtures import LATEST_VERSION
from app.services.demo.service import (
    NEVER_WIPED,
    DemoStudioService,
    NotADemoStudioError,
)
from sqlalchemy import Column, Table
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Session


@pytest.fixture
def session(migrated) -> Session:
    with Session(migrated) as s:
        yield s


def test_the_demo_studio_is_found_by_slug(session):
    assert isinstance(DemoStudioService.studio_id(session), uuid.UUID)


def test_reset_restores_the_studio_row_after_it_is_edited(session):
    studio_id = DemoStudioService.studio_id(session)
    session.execute(sa.text("UPDATE studio SET name = 'wrecked' WHERE id = :id"), {"id": studio_id})
    session.commit()

    DemoStudioService.reset(session)
    session.commit()

    name = session.execute(
        sa.text("SELECT name FROM studio WHERE id = :id"), {"id": studio_id}
    ).scalar_one()
    assert name != "wrecked"


def test_reset_keeps_the_studio_id_stable(session):
    """Every fixture reference made after a reset points at this id. Recreating the row
    would either dangle them or force every fixture to be written against a UUID that
    changes on every reset."""
    before = DemoStudioService.studio_id(session)
    DemoStudioService.reset(session)
    session.commit()
    assert DemoStudioService.studio_id(session) == before


def test_reset_reports_the_version_it_restored(session):
    assert DemoStudioService.reset(session).version == LATEST_VERSION


def test_an_unknown_version_raises_rather_than_falling_back(session):
    with pytest.raises(KeyError):
        DemoStudioService.reset(session, version="1999-01-01.0")


def test_the_wipe_is_derived_from_the_schema_not_from_a_list():
    """The growth property, asserted against a synthetic table rather than a real one --
    no tenant-scoped table exists in M0 to test with, and inventing a real model to test
    the wipe would put a fake table in every migration from here on.

    This is the assertion that keeps working in M2, M4 and M6 without anyone editing
    this file.
    """
    probe = Table(
        "probe_tenant_table",
        Base.metadata,
        Column("id", PGUUID(as_uuid=True), primary_key=True),
        Column("studio_id", PGUUID(as_uuid=True), nullable=False),
    )
    try:
        assert "probe_tenant_table" in DemoStudioService.wipe_plan()
    finally:
        Base.metadata.remove(probe)


def test_the_audit_log_is_never_wiped():
    """§11.2 -- audit_log is append-only BY GRANT: the application role holds INSERT and
    SELECT and nothing else, so a wipe that tried would raise a Postgres permission
    error rather than a readable one. It is also evidence: the demo studio's own record
    of who switched persona is not scratch data."""
    assert "audit_log" in NEVER_WIPED
    assert "audit_log" not in DemoStudioService.wipe_plan()


def test_the_studio_row_itself_is_never_wiped():
    assert "studio" in NEVER_WIPED
    assert "studio" not in DemoStudioService.wipe_plan()


def test_the_wipe_plan_deletes_children_before_parents():
    """A wipe in metadata order hits a foreign key and fails halfway, leaving the demo
    studio in a state no fixture describes."""
    plan = DemoStudioService.wipe_plan()
    ordered = [t.name for t in Base.metadata.sorted_tables if t.name in plan]
    assert plan == list(reversed(ordered))


def test_reset_refuses_a_studio_that_is_not_a_demo_studio(session):
    """The single most dangerous thing in this module is a wipe pointed at the wrong
    studio. It takes a studio_id, so it must check."""
    real = uuid.uuid4()
    session.execute(
        sa.text(
            "INSERT INTO studio (id, name, slug, timezone, default_locale, status, "
            "is_demo, settings, created_at, updated_at) VALUES "
            "(:id, 'Real Club', :slug, 'Asia/Jerusalem', 'he', 'active', false, "
            "'{}'::jsonb, now(), now())"
        ),
        {"id": real, "slug": f"real-{real.hex[:8]}"},
    )
    session.commit()

    with pytest.raises(NotADemoStudioError):
        DemoStudioService.wipe(session, real)

    session.execute(sa.text("DELETE FROM studio WHERE id = :id"), {"id": real})
    session.commit()


def test_the_demo_slug_is_the_one_the_migration_used(session):
    slug = session.execute(
        sa.text("SELECT slug FROM studio WHERE id = :id"),
        {"id": DemoStudioService.studio_id(session)},
    ).scalar_one()
    assert slug == DEMO_STUDIO_SLUG
