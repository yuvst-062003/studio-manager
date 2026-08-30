"""SPEC §19.7 -- 'POST /dev/demo/reset restores the fixture set from a versioned seed.'

§19.3's demo studio spans M2 through M7: ~40 students with Hebrew names, a full training
year of materialized sessions, partial attendance history, price plans, settled and open
charges, two unmatched IPNs, belt history, one competition and one belt exam. None of
those tables exist in M0. What lands here is therefore the **shape**, designed for
growth:

* a `FixtureSet` addressable by `version`, so a reset can restore a specific one and a
  bisect is not silently upgraded to a newer set;
* composed of `FixtureLayer`s, each owned by one milestone, so a wave appends a file's
  worth of seeding and nothing else;
* with `PLANNED_LAYERS` recording every layer §19.3 still owes, and a test asserting the
  two lists never overlap -- so the distance between what the spec promises and what the
  demo studio actually contains is visible in the code rather than remembered.

Adding a layer is: write `seed`, append a `FixtureLayer`, delete the matching
`PlannedLayer`, bump `version`. The reset needs no change -- it wipes from
`Base.metadata` (see service.py), so a table added by a later wave is cleaned the day it
lands.
"""

from __future__ import annotations

import copy
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.studio import Studio
from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SETTINGS, DEMO_STUDIO_SLUG
from app.services.demo.layers import (
    seed_attendance,
    seed_belts,
    seed_health,
    seed_money,
    seed_structure,
    seed_students,
)
from app.services.demo.personas import SEEDED_AT, seed_personas
from app.services.structure.health_templates import (
    ensure_full_template,
    ensure_trial_template,
)


@dataclass(frozen=True)
class StudioFixture:
    """The tenant root's own restorable state. Not a layer: the row is restored in
    place, never deleted, so every id created against it survives a reset."""

    name: str
    slug: str
    settings: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FixtureLayer:
    """One milestone's worth of demo data.

    `tables` is documentation with teeth: `tests/dev/test_demo_fixtures.py`
    asserts that every name a layer claims here is actually reachable -- either
    through `DemoStudioService.wipe_plan()` or `NEVER_WIPED` (service.py) -- so a
    layer that seeds a table nobody wipes is a red build rather than data that
    survives a reset and hides a bug.

    `seed` runs against a **plain `Session`, not `TenantSession`**
    (`DemoStudioService.seed` in service.py) -- TenantMixin's `before_flush` stamping
    is registered on `TenantSession` only and never runs on this path. **A layer's
    `seed` callable must therefore set `studio_id` on every row it creates itself.**
    `_seed_studio` below is exempt only because it UPDATEs the one row that has no
    `studio_id` column of its own (the tenant root); every layer after it creates
    rows on tenant-scoped tables and does not get a free pass.
    """

    name: str
    milestone: str
    tables: tuple[str, ...]
    seed: Callable[[Session, uuid.UUID], None]


@dataclass(frozen=True)
class PlannedLayer:
    """A layer §19.3 promises and the schema cannot yet hold."""

    name: str
    milestone: str
    contents: str


@dataclass(frozen=True)
class FixtureSet:
    #: Bump on any change to a layer's contents. Date-ordinal rather than a bare
    #: integer, so a reset log line says when the data it restored was authored.
    version: str
    studio: StudioFixture
    layers: tuple[FixtureLayer, ...]


def _seed_studio(session: Session, studio_id: uuid.UUID) -> None:
    """Restore the tenant root in place.

    An UPDATE and not a DELETE + INSERT: revision 0003 created this row and everything
    a later layer seeds references its id. Recreating it would either dangle every
    reference or force every fixture to be written against a UUID that changes on every
    reset.
    """
    session.execute(
        update(Studio)
        .where(Studio.id == studio_id)
        .values(
            name=DEMO_STUDIO_NAME,
            slug=DEMO_STUDIO_SLUG,
            settings=DEMO_STUDIO_SETTINGS,
            is_demo=True,
            status="active",
        )
        .execution_options(with_all_tenants=True)
    )


def _seed_health_templates(session: Session, studio_id: uuid.UUID) -> None:
    """Both question sets, for the two different reasons they exist.

    The trial one is conflict C3, seeded into the demo studio for the same reason
    `provision_studio` seeds it into every new one: §5.4a's funnel puts a trial
    declaration at step 3 of five, and `dev+trial` exists to walk that funnel.

    The full one is D11. Revision `0007` seeded it, but a reset **wipes**
    `health_form_template` -- it is in this layer's `tables` -- so re-seeding the trial form
    alone would leave the demo studio the one studio in the product without a default
    question set, and it would happen the first time a developer pressed reset.
    """
    ensure_trial_template(session, studio_id, at=SEEDED_AT)
    ensure_full_template(session, studio_id, at=SEEDED_AT)


_V1 = FixtureSet(
    version="2026-08-30.1",
    studio=StudioFixture(
        name=DEMO_STUDIO_NAME,
        slug=DEMO_STUDIO_SLUG,
        # A deep copy, not a reference: DEMO_STUDIO_SETTINGS is also what revision 0003
        # writes into the row. A shallow dict() would still share the nested "upay"
        # dict -- §19.6's livesystem pin -- so anything that ever mutates
        # fixture.studio.settings in place would corrupt the migration's own source of
        # truth. Copied once at import, from the one constant, so the fixture and the
        # migration still cannot drift apart.
        settings=copy.deepcopy(DEMO_STUDIO_SETTINGS),
    ),
    layers=(
        FixtureLayer(
            name="studio",
            milestone="M0",
            tables=("studio",),
            seed=_seed_studio,
        ),
        FixtureLayer(
            name="personas",
            milestone="M1",
            # `auth_identity` is deliberately absent. It has no `studio_id`, so it is not
            # in `wipe_plan()` -- which is correct, because a reset must not invalidate a
            # developer's live session -- and this list is asserted against what the wipe
            # can reach. The layer reattaches those rows instead of recreating them.
            tables=("person", "role_assignment", "guardian"),
            seed=seed_personas,
        ),
        FixtureLayer(
            name="health_templates",
            milestone="M1",
            tables=("health_form_template",),
            seed=_seed_health_templates,
        ),
        # -- §19.3's six data layers, authored 2026-08-30 (app/services/demo/layers.py).
        # Until then every one of these was a PlannedLayer, and a reset restored a club
        # with no groups and no students — the empty picker a parent read as broken.
        FixtureLayer(
            name="structure",
            milestone="M2",
            tables=(
                "location",
                "class",
                "group",
                "group_schedule_rule",
                "training_year",
                "studio_closure",
            ),
            seed=seed_structure,
        ),
        FixtureLayer(
            name="students",
            milestone="M3",
            tables=("person", "student", "guardian", "enrollment", "trial_booking"),
            seed=seed_students,
        ),
        FixtureLayer(
            name="health",
            milestone="M4",
            tables=("health_declaration",),
            seed=seed_health,
        ),
        FixtureLayer(
            name="attendance",
            milestone="M5",
            tables=("session", "attendance"),
            seed=seed_attendance,
        ),
        FixtureLayer(
            name="money",
            milestone="M6",
            tables=(
                "price_plan",
                "product",
                "charge",
                "payment",
                "payment_allocation",
                "upay_ipn_record",
            ),
            seed=seed_money,
        ),
        FixtureLayer(
            name="belts",
            milestone="M7",
            tables=("belt_rank", "student_belt", "event", "event_exam_result"),
            seed=seed_belts,
        ),
    ),
)

SEEDS: dict[str, FixtureSet] = {_V1.version: _V1}
LATEST_VERSION: str = _V1.version

#: §19.3 in full, and the milestone that lands each part. An entry moves into
#: `_V1.layers` (and out of here) when its milestone's models exist — and on 2026-08-30
#: the last six moved. Empty is this tuple's goal state, kept so the test that guards the
#: promise-vs-reality distance still has something to hold.
PLANNED_LAYERS: tuple[PlannedLayer, ...] = ()
