"""SPEC §4.2 -- tenant isolation, enforced at three layers.

1. A request-scoped studio context, resolved from the JWT by the dependency below.
2. A default query option on every TenantMixin model: WHERE studio_id = :current_studio.
3. Invariant 2 (tests/invariants) asserts every tenant-scoped table carries studio_id
   and a composite index leading with it.

The filter **fails closed**. A query with no studio in context raises
NoActiveStudioError rather than returning every studio's rows: a layer that quietly
degrades to "no filter" is worse than none, because it looks like it is working.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from itertools import chain
from typing import Annotated, Any, ClassVar

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import ForeignKey, Index, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import (
    Mapped,
    ORMExecuteState,
    Session,
    declared_attr,
    mapped_column,
    with_loader_criteria,
)

from app.core.config import settings
from app.core.db import get_engine
from app.core.dev_account import developer_may_act

#: Per-statement opt-out, for code that already holds a deliberate cross-studio scope.
ALL_TENANTS_OPTION = "with_all_tenants"

_current_studio: ContextVar[uuid.UUID | None] = ContextVar("current_studio_id", default=None)
_all_tenants: ContextVar[bool] = ContextVar("with_all_tenants", default=False)


class NoActiveStudioError(RuntimeError):
    """Raised when a tenant-scoped query runs with no studio in context."""


class CrossTenantWriteError(RuntimeError):
    """Raised when a write targets a studio other than the active one."""


# -- the request-scoped context ----------------------------------------------
def get_current_studio_id() -> uuid.UUID | None:
    return _current_studio.get()


def require_current_studio_id() -> uuid.UUID:
    studio_id = _current_studio.get()
    if studio_id is None:
        raise NoActiveStudioError(
            "no active studio: a tenant-scoped query ran outside a TenantSession request "
            "scope. Use use_studio(...), or with_all_tenants(reason=...) if this is "
            "platform-admin code or a deliberate cross-studio job."
        )
    return studio_id


@contextmanager
def use_studio(studio_id: uuid.UUID) -> Iterator[None]:
    token = _current_studio.set(studio_id)
    try:
        yield
    finally:
        _current_studio.reset(token)


@contextmanager
def with_all_tenants(*, reason: str) -> Iterator[None]:
    """The SPEC §4.2 escape hatch.

    Legal **only** in platform-admin code (SPEC §18.3) and in background jobs that
    iterate studios deliberately. The reason is required so which of those two applies
    is visible at the call site rather than in a commit message.
    """
    if not reason.strip():
        raise ValueError("with_all_tenants requires a reason")
    token = _all_tenants.set(True)
    try:
        yield
    finally:
        _all_tenants.reset(token)


#: Alias, so TenantSession.with_all_tenants can reach the module-level version it
#: shadows without the reader having to work out Python's scoping rules.
_all_tenants_scope = with_all_tenants


# -- the mixin ---------------------------------------------------------------
class TenantMixin:
    """G9 -- non-null studio_id plus a composite index leading with it.

    A subclass adds its own table args through ``__tenant_table_args__`` rather than
    ``__table_args__``, so it can never drop the tenant index by overriding it.
    """

    #: Declared, not defined -- the concrete model supplies it. Without this mypy
    #: cannot see the attribute the index name below is built from.
    __tablename__: ClassVar[str]
    __tenant_table_args__: ClassVar[tuple[Any, ...]] = ()

    @declared_attr
    def studio_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805
        return mapped_column(
            PGUUID(as_uuid=True),
            ForeignKey("studio.id", ondelete="RESTRICT"),
            nullable=False,
        )

    @declared_attr.directive
    def __table_args__(cls) -> tuple[Any, ...]:  # noqa: N805
        return (
            Index(f"ix_{cls.__tablename__}_studio_id_id", "studio_id", "id"),
            *cls.__tenant_table_args__,
        )


# -- the session -------------------------------------------------------------
class TenantSession(Session):
    """The session class every request uses.

    The handlers below are registered against this class rather than against Session, so
    a deliberately unscoped session -- a migration, a seed script -- is a different type
    rather than a forgotten flag.
    """

    @contextmanager
    def with_all_tenants(self, *, reason: str) -> Iterator[TenantSession]:
        """Reads the way SPEC §4.2 writes it: ``.with_all_tenants()``."""
        with _all_tenants_scope(reason=reason):
            yield self


@event.listens_for(TenantSession, "do_orm_execute")
def _apply_tenant_filter(state: ORMExecuteState) -> None:
    if state.is_column_load or state.is_relationship_load:
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if _all_tenants.get() or state.execution_options.get(ALL_TENANTS_OPTION, False):
        return
    studio_id = require_current_studio_id()
    state.statement = state.statement.options(
        with_loader_criteria(
            TenantMixin,
            lambda cls: cls.studio_id == studio_id,
            include_aliases=True,
        )
    )


@event.listens_for(TenantSession, "before_flush")
def _stamp_and_guard_writes(session: Session, flush_context: Any, instances: Any) -> None:
    if _all_tenants.get():
        return
    studio_id = require_current_studio_id()
    for obj in session.new:
        if isinstance(obj, TenantMixin):
            if getattr(obj, "studio_id", None) is None:
                obj.studio_id = studio_id
            elif obj.studio_id != studio_id:
                raise CrossTenantWriteError(
                    f"insert targets studio {obj.studio_id}, active studio is {studio_id}"
                )
    for obj in chain(session.dirty, session.deleted):
        if isinstance(obj, TenantMixin) and obj.studio_id != studio_id:
            raise CrossTenantWriteError(
                f"write targets studio {obj.studio_id}, active studio is {studio_id}"
            )


# -- the dependency ----------------------------------------------------------
def studio_id_from_request(request: Request) -> uuid.UUID:
    """SPEC §4.2 layer 1, and §19.6 restriction 1.

    M1 owns authentication and sets ``request.state.studio_id``, ``is_developer`` and
    ``studio_is_demo`` from the verified JWT and the resolved studio. Until it lands
    this is the seam, and the contract worth holding is that an unresolved studio is a
    401 -- never an unscoped session -- and that a developer session cannot resolve a
    studio holding real people in production.
    """
    studio_id = getattr(request.state, "studio_id", None)
    if not isinstance(studio_id, uuid.UUID):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="no active studio")

    # §19.6 -- 'the studio resolver excludes is_demo = false for developer sessions in
    # production'. Both flags default to False, so an ordinary request is unaffected
    # and the rule is correct-but-unused until M1 populates them.
    if not developer_may_act(
        is_developer=bool(getattr(request.state, "is_developer", False)),
        studio_is_demo=bool(getattr(request.state, "studio_is_demo", False)),
        env=settings.ENV,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="a developer session may only act inside a demo studio in production",
        )
    return studio_id


def get_tenant_session(
    studio_id: Annotated[uuid.UUID, Depends(studio_id_from_request)],
) -> Iterator[TenantSession]:
    with use_studio(studio_id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


TenantSessionDep = Annotated[TenantSession, Depends(get_tenant_session)]
