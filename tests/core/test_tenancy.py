"""SPEC 4.2 -- tenant isolation at the query layer.

The probe model lives on its own DeclarativeBase so it never enters
app.models.base.Base.registry, which invariant 2 scans. A test fixture showing up in a
production invariant scan would make that invariant lie in both directions.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from app.core.tenancy import (
    CrossTenantWriteError,
    NoActiveStudioError,
    TenantMixin,
    TenantSession,
    TenantSessionDep,
    get_current_studio_id,
    require_current_studio_id,
    use_studio,
    with_all_tenants,
)
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import Column, Engine, MetaData, String, Table, select, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ALPHA = uuid.UUID("11111111-1111-1111-1111-111111111111")
BETA = uuid.UUID("22222222-2222-2222-2222-222222222222")


class ProbeBase(DeclarativeBase):
    metadata = MetaData()


# The FK target must exist in this MetaData for the mixin's ForeignKey to resolve. The
# real table is never recreated -- only Widget's table is created below.
Table("studio", ProbeBase.metadata, Column("id", PGUUID(as_uuid=True), primary_key=True))


class Widget(TenantMixin, ProbeBase):
    __tablename__ = "tenancy_probe_widget"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)


@pytest.fixture
def probe(migrated: Engine) -> Iterator[Engine]:
    with migrated.begin() as connection:
        for studio_id, slug in ((ALPHA, "alpha"), (BETA, "beta")):
            connection.execute(
                text(
                    "INSERT INTO studio (id, name, slug) VALUES (:id, :slug, :slug) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                {"id": studio_id, "slug": slug},
            )
    Widget.__table__.create(migrated, checkfirst=True)
    with (
        TenantSession(bind=migrated, expire_on_commit=False) as seed,
        with_all_tenants(reason="test fixture seeding both studios"),
    ):
        seed.add_all(
            [
                Widget(studio_id=ALPHA, name="alpha-one"),
                Widget(studio_id=ALPHA, name="alpha-two"),
                Widget(studio_id=BETA, name="beta-one"),
            ]
        )
        seed.commit()
    yield migrated
    Widget.__table__.drop(migrated, checkfirst=True)


@pytest.fixture
def session(probe: Engine) -> Iterator[TenantSession]:
    with TenantSession(bind=probe, expire_on_commit=False) as s:
        yield s


# -- the mixin ---------------------------------------------------------------
def test_the_mixin_adds_a_non_null_studio_id():
    column = Widget.__table__.c.studio_id
    assert column.nullable is False
    assert {fk.column.table.name for fk in column.foreign_keys} == {"studio"}


def test_the_mixin_adds_a_composite_index_leading_with_studio_id():
    """G9. Leading matters: an index on (id, studio_id) does not serve a tenant scan."""
    composite = [tuple(i.columns.keys()) for i in Widget.__table__.indexes]
    assert any(cols[0] == "studio_id" and len(cols) > 1 for cols in composite), composite


# -- the default filter ------------------------------------------------------
@pytest.mark.db
def test_a_query_sees_only_the_active_studio(session: TenantSession):
    with use_studio(ALPHA):
        names = set(session.scalars(select(Widget.name)).all())
    assert names == {"alpha-one", "alpha-two"}


@pytest.mark.db
def test_two_studios_in_one_process_do_not_share_a_cached_filter(session: TenantSession):
    """The failure mode this exists for: with_loader_criteria caches its lambda, and a
    naive implementation bakes the first studio's id into the cached statement. The
    second studio would then see the first's rows -- a cross-tenant leak that appears
    only on the second request and never in a single-test run."""
    with use_studio(ALPHA):
        first = set(session.scalars(select(Widget.name)).all())
    session.expunge_all()
    with use_studio(BETA):
        second = set(session.scalars(select(Widget.name)).all())

    assert first == {"alpha-one", "alpha-two"}
    assert second == {"beta-one"}


@pytest.mark.db
def test_a_query_with_no_active_studio_raises_rather_than_returning_everything(
    session: TenantSession,
):
    """Fail closed. A tenancy layer that degrades to `no filter` looks like it works."""
    assert get_current_studio_id() is None
    with pytest.raises(NoActiveStudioError):
        session.scalars(select(Widget.name)).all()


# -- the escape hatch --------------------------------------------------------
@pytest.mark.db
def test_with_all_tenants_sees_every_studio(session: TenantSession):
    with with_all_tenants(reason="platform operations board (18.3)"):
        assert len(session.scalars(select(Widget.name)).all()) == 3


@pytest.mark.db
def test_the_hatch_closes_again_when_the_block_exits(session: TenantSession):
    with with_all_tenants(reason="deliberate cross-studio job"):
        pass
    with pytest.raises(NoActiveStudioError):
        session.scalars(select(Widget.name)).all()


@pytest.mark.db
def test_the_session_method_reads_the_way_spec_4_2_writes_it(session: TenantSession):
    with session.with_all_tenants(reason="platform-admin"):
        assert len(session.scalars(select(Widget.name)).all()) == 3


def test_the_hatch_requires_a_reason():
    """SPEC 4.2 permits it only in platform-admin code and deliberate cross-studio
    jobs. A required reason is what makes which of the two visible at the call site."""
    with pytest.raises(ValueError), with_all_tenants(reason="   "):
        pass


# -- writes ------------------------------------------------------------------
@pytest.mark.db
def test_an_insert_is_stamped_with_the_active_studio(session: TenantSession):
    with use_studio(BETA):
        session.add(Widget(name="beta-two"))
        session.commit()
        assert set(session.scalars(select(Widget.name)).all()) == {"beta-one", "beta-two"}


@pytest.mark.db
def test_writing_into_another_studio_is_refused(session: TenantSession):
    with use_studio(ALPHA), pytest.raises(CrossTenantWriteError):
        session.add(Widget(studio_id=BETA, name="smuggled"))
        session.flush()


@pytest.mark.db
def test_deleting_another_studios_row_is_refused(session: TenantSession):
    with with_all_tenants(reason="fetch the beta row to attempt the cross-tenant delete"):
        victim = session.scalars(select(Widget).where(Widget.name == "beta-one")).one()
    with use_studio(ALPHA), pytest.raises(CrossTenantWriteError):
        session.delete(victim)
        session.flush()


# -- the dependency ----------------------------------------------------------
def test_the_dependency_rejects_a_request_with_no_resolved_studio():
    """SPEC 4.2 layer 1 resolves the studio from the JWT. Auth lands in M1, so the
    dependency reads request.state.studio_id, which M1's middleware sets. Until then the
    contract worth asserting is that an unresolved studio is a 401 and never an unscoped
    session."""
    from app.core.tenancy import studio_id_from_request
    from fastapi import HTTPException, Request

    request = Request({"type": "http", "headers": [], "method": "GET", "path": "/"})
    with pytest.raises(HTTPException) as caught:
        studio_id_from_request(request)
    assert caught.value.status_code == 401


# TenantSessionDep is imported at the TOP of this module, not inside the tests below.
# This file has `from __future__ import annotations`, so every annotation is a string and
# FastAPI resolves `session: TenantSessionDep` from the module globals -- a name bound
# inside a test function is invisible to it, and the route comes back 422 "field
# required" as if the parameter were a query string.
# -- the dependency, driven over HTTP -----------------------------------------
# M1 found this the expensive way. Every test above drives `use_studio` directly, so the
# FastAPI dependency was never exercised through a real request -- and it did not work.
# FastAPI wraps a SYNC generator dependency in `contextmanager_in_threadpool`: `__enter__`
# runs in one worker thread, the endpoint in another and `__exit__` in a third, so the
# ContextVar `use_studio` sets is invisible to the endpoint and `token.reset()` raises
# "was created in a different Context".
#
# The symptom is the worst available one: every tenant-scoped query inside a request
# raises NoActiveStudioError, which reads exactly like a caller who forgot to resolve a
# studio. Nothing about it points at the dependency.
def test_the_tenant_session_dependency_scopes_a_real_request():
    studio = uuid.uuid4()
    app = FastAPI()

    @app.middleware("http")
    async def _present_a_studio(request: Request, call_next):
        request.state.studio_id = studio
        return await call_next(request)

    @app.get("/scoped")
    def scoped(session: TenantSessionDep) -> dict[str, str]:
        # The read the whole mechanism exists for: inside a request, a tenant-scoped
        # query must find the studio the dependency resolved.
        return {"studio_id": str(require_current_studio_id())}

    response = TestClient(app).get("/scoped")
    assert response.status_code == 200, response.text
    assert response.json()["studio_id"] == str(studio)


def test_the_scope_does_not_leak_into_the_next_request():
    """The other half. A dependency that set the ContextVar and never reset it would pass
    the test above and hand request N+1 request N's studio -- a cross-tenant read that
    looks like the product working."""
    first, second = uuid.uuid4(), uuid.uuid4()
    seen: list[str] = []
    app = FastAPI()

    @app.middleware("http")
    async def _present_a_studio(request: Request, call_next):
        # Whatever the previous request left behind must not be visible here.
        seen.append(str(get_current_studio_id()))
        request.state.studio_id = first if not seen[1:] else second
        return await call_next(request)

    @app.get("/scoped")
    def scoped(session: TenantSessionDep) -> dict[str, str]:
        return {"studio_id": str(require_current_studio_id())}

    client = TestClient(app)
    assert client.get("/scoped").json()["studio_id"] == str(first)
    assert client.get("/scoped").json()["studio_id"] == str(second)
    assert seen == ["None", "None"]
