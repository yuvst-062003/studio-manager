"""§19.7 -- restoring the demo studio from a versioned seed.

**The wipe is derived from `Base.metadata`, not from a list.** Every table carrying a
`studio_id` column is emptied for this studio, deepest dependency first. A list would be
a list someone forgets to extend when M4 adds `health_declaration`, and a reset that
leaves rows behind is worse than none: it hides exactly the stale-state bugs §19.7 exists
to prevent, and it hides them quietly.

Two tables are never wiped, each for its own reason -- see NEVER_WIPED.

G6: this is a service. The router parses, calls it, and returns.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import Table, delete, select
from sqlalchemy.orm import Session

from app.core.tenancy import use_studio
from app.models.base import Base
from app.models.studio import Studio
from app.services.demo import DEMO_STUDIO_SLUG
from app.services.demo.fixtures import LATEST_VERSION, SEEDS

logger = logging.getLogger(__name__)

#: Neither of these is an oversight.
NEVER_WIPED = frozenset(
    {
        # §11.2 -- append-only BY GRANT. The application role holds INSERT and SELECT
        # and nothing else, so a DELETE here raises a Postgres permission error rather
        # than a readable one. It is also evidence: §19.4 audit-logs every persona
        # switch to the demo studio's own log, and evidence is not scratch data.
        "audit_log",
        # The tenant root is restored in place by the `studio` fixture layer. Deleting
        # it would change the studio id on every reset and dangle every reference a
        # later layer made.
        "studio",
    }
)


class NotADemoStudioError(RuntimeError):
    """Raised when a wipe is pointed at a studio holding real people."""


@dataclass(frozen=True)
class DemoResetResult:
    version: str
    tables_wiped: tuple[str, ...]
    layers_seeded: tuple[str, ...]


class DemoStudioService:
    @staticmethod
    def studio_id(session: Session) -> uuid.UUID:
        """The demo studio's id, looked up by the slug revision 0003 inserted."""
        return session.execute(
            select(Studio.id)
            .where(Studio.slug == DEMO_STUDIO_SLUG)
            .execution_options(with_all_tenants=True)
        ).scalar_one()

    @staticmethod
    def wipe_plan() -> list[str]:
        """Every tenant-scoped table, children first.

        `Base.metadata.sorted_tables` is parents-first (creation order), so deletion is
        its reverse. Computed on every call rather than cached at import: seam 2's
        discovery loop populates the metadata when `app.models` is imported, and a
        module-level constant would freeze whatever happened to be imported first.
        """
        return [
            table.name
            for table in reversed(Base.metadata.sorted_tables)
            if "studio_id" in table.c and table.name not in NEVER_WIPED
        ]

    @staticmethod
    def wipe(session: Session, studio_id: uuid.UUID) -> list[str]:
        """Empty every tenant-scoped table for this studio.

        Refuses a non-demo studio. The check is not decoration: this function takes a
        studio_id, and the single most damaging thing in this module is a wipe pointed
        at a real club.
        """
        is_demo = session.execute(
            select(Studio.is_demo)
            .where(Studio.id == studio_id)
            .execution_options(with_all_tenants=True)
        ).scalar_one_or_none()
        if is_demo is not True:
            raise NotADemoStudioError(
                f"studio {studio_id} is not a demo studio; refusing to wipe it "
                "(§19.7 -- the reset exists for a studio that contains no real people)"
            )

        wiped: list[str] = []
        tables: dict[str, Table] = {t.name: t for t in Base.metadata.sorted_tables}
        for name in DemoStudioService.wipe_plan():
            table = tables[name]
            session.execute(
                delete(table)
                .where(table.c.studio_id == studio_id)
                .execution_options(with_all_tenants=True)
            )
            wiped.append(name)
        return wiped

    @staticmethod
    def seed(session: Session, *, version: str = LATEST_VERSION) -> tuple[str, ...]:
        """Apply every layer of one fixture set, in declaration order.

        `SEEDS[version]` raises KeyError on an unknown version deliberately: a reset
        that quietly upgrades you to a newer fixture set is a reset that hides the
        regression you were bisecting.

        **TenantMixin's stamping does NOT apply on this path.** `session` here is a
        plain `Session` -- both callers (app/core/db.py's `get_session`, and
        app/workers/demo_reset.py) pass one, never `TenantSession` -- and
        `_stamp_and_guard_writes` / `_apply_tenant_filter` are registered against
        `TenantSession` only (`event.contains(Session, "before_flush",
        _stamp_and_guard_writes)` is `False`). `use_studio` below sets the
        `current_studio_id` ContextVar, but nothing on this path reads it: no listener
        is attached to a plain `Session` to consult it, so it neither stamps a new
        row's `studio_id` nor refuses a write aimed at a different studio. **Every
        layer must therefore set `studio_id` on every row it creates itself** -- see
        `FixtureLayer`'s docstring in fixtures.py, which is where a layer author reads
        the contract. Swapping to `TenantSession` here is deliberately out of scope:
        it fails closed in ways the wipe's cross-cutting deletes above would have to be
        re-reasoned about, this late in the milestone.
        """
        fixture_set = SEEDS[version]
        studio_id = DemoStudioService.studio_id(session)
        seeded: list[str] = []
        # Kept for any tenant-scoped SELECT a layer's own seed function needs to run
        # (e.g. looking up a row it is about to UPDATE) -- NOT because it makes writes
        # safe. It does not: see the docstring above.
        with use_studio(studio_id):
            for layer in fixture_set.layers:
                layer.seed(session, studio_id)
                seeded.append(layer.name)
        return tuple(seeded)

    @staticmethod
    def reset(session: Session, *, version: str = LATEST_VERSION) -> DemoResetResult:
        fixture_set = SEEDS[version]
        studio_id = DemoStudioService.studio_id(session)
        wiped = DemoStudioService.wipe(session, studio_id)
        seeded = DemoStudioService.seed(session, version=version)
        # Logged as `extra`, never interpolated -- an f-string has no key for the
        # scrubber to match (app/core/logging.py).
        logger.info(
            "demo studio reset",
            extra={"demo_version": version, "tables_wiped": wiped, "layers": list(seeded)},
        )
        return DemoResetResult(
            version=fixture_set.version, tables_wiped=tuple(wiped), layers_seeded=seeded
        )
