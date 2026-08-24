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

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.studio import Studio
from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SETTINGS, DEMO_STUDIO_SLUG


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

    `tables` is documentation with teeth: the reset asserts it can actually reach every
    table a layer claims, so a layer that seeds a table nobody wipes is a red build
    rather than data that survives a reset and hides a bug.
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


_V1 = FixtureSet(
    version="2026-08-24.1",
    studio=StudioFixture(
        name=DEMO_STUDIO_NAME, slug=DEMO_STUDIO_SLUG, settings=DEMO_STUDIO_SETTINGS
    ),
    layers=(
        FixtureLayer(
            name="studio",
            milestone="M0",
            tables=("studio",),
            seed=_seed_studio,
        ),
    ),
)

SEEDS: dict[str, FixtureSet] = {_V1.version: _V1}
LATEST_VERSION: str = _V1.version

#: §19.3 in full, and the milestone that lands each part. An entry moves into
#: `_V1.layers` (and out of here) when its milestone's models exist.
PLANNED_LAYERS: tuple[PlannedLayer, ...] = (
    PlannedLayer(
        "personas",
        "M1",
        "the nine §19.3 personas, their auth identities, role assignments and guardian links",
    ),
    PlannedLayer(
        "structure",
        "M2",
        "2 classes, 5 groups, schedule rules, one training year, holiday closures",
    ),
    PlannedLayer(
        "students",
        "M3",
        "~40 students with Hebrew names, enrollments, one trial booking, one lead",
    ),
    PlannedLayer(
        "health",
        "M4",
        "signed, trial-signed and missing declarations across the roster",
    ),
    PlannedLayer(
        "attendance",
        "M5",
        "a full training year of materialized sessions and partial attendance history",
    ),
    PlannedLayer(
        "money",
        "M6",
        "price plans, settled and open charges, and two unmatched IPNs",
    ),
    PlannedLayer(
        "belts",
        "M7",
        "belt history, one competition and one belt exam",
    ),
)
