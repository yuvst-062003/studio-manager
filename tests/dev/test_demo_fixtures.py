"""The fixture module's growth contract.

§19.3 describes a demo studio spanning M2-M7. None of those tables exist yet, so what
is asserted here is the shape and the bookkeeping: that the set is addressable by
version, that its layers are ordered and unique, and -- the load-bearing one -- that
the layers §19.3 still owes are recorded rather than remembered.

PARTIALLY VACUOUS TODAY: `LATEST.layers` holds one layer (the studio itself). It stops
being vacuous the moment M1 moves `personas` out of PLANNED_LAYERS, and
test_no_layer_is_both_planned_and_present is what makes forgetting to do so a red build
rather than a quiet omission.
"""

from __future__ import annotations

import pytest
from app.services.demo import DEMO_STUDIO_NAME, DEMO_STUDIO_SETTINGS, DEMO_STUDIO_SLUG
from app.services.demo.fixtures import (
    LATEST_VERSION,
    PLANNED_LAYERS,
    SEEDS,
)

MILESTONES = {f"M{n}" for n in range(12)}


def test_the_latest_version_is_addressable():
    assert LATEST_VERSION in SEEDS


def test_every_version_is_addressable_by_its_own_version_string():
    """§19.7 -- 'restores the fixture set from a versioned seed'. A dict whose keys can
    disagree with its values' version fields is not addressable, it is two facts."""
    for key, fixture_set in SEEDS.items():
        assert key == fixture_set.version


def test_the_studio_fixture_matches_the_row_the_migration_creates():
    """Revision 0003 creates the row and the fixture restores it. If those two ever
    disagree, a reset silently renames the studio."""
    studio = SEEDS[LATEST_VERSION].studio
    assert studio.slug == DEMO_STUDIO_SLUG
    assert studio.name == DEMO_STUDIO_NAME


def test_the_demo_studios_upay_config_is_pinned_in_the_fixture_too():
    """§19.6 restriction 5. The reset must not be the thing that un-pins it."""
    assert SEEDS[LATEST_VERSION].studio.settings["upay"]["livesystem"] == 0


def test_mutating_the_fixtures_settings_does_not_corrupt_the_shared_constant():
    """StudioFixture.settings must be an isolated copy of DEMO_STUDIO_SETTINGS, not a
    reference to it -- that same constant is what revision 0003 writes into the demo
    studio row, so a mutation reaching it here would corrupt the migration's own source
    of truth. Mutates the nested "upay" dict specifically, not just the top level: a
    shallow `dict()` copy would still share that nested object, and it holds §19.6's
    livesystem pin."""
    fixture_settings = SEEDS[LATEST_VERSION].studio.settings
    original_billing_day = DEMO_STUDIO_SETTINGS["billing_day"]
    original_livesystem = DEMO_STUDIO_SETTINGS["upay"]["livesystem"]
    try:
        fixture_settings["billing_day"] = original_billing_day + 1
        fixture_settings["upay"]["livesystem"] = 1
        assert DEMO_STUDIO_SETTINGS["billing_day"] == original_billing_day
        assert DEMO_STUDIO_SETTINGS["upay"]["livesystem"] == 0
    finally:
        fixture_settings["billing_day"] = original_billing_day
        fixture_settings["upay"]["livesystem"] = original_livesystem


def test_layer_names_are_unique():
    names = [layer.name for layer in SEEDS[LATEST_VERSION].layers]
    assert len(names) == len(set(names))


def test_every_layer_names_a_real_milestone():
    for layer in SEEDS[LATEST_VERSION].layers:
        assert layer.milestone in MILESTONES, layer


def test_every_planned_layer_names_a_real_milestone_and_says_what_it_holds():
    for planned in PLANNED_LAYERS:
        assert planned.milestone in MILESTONES, planned
        assert planned.contents.strip(), planned


def test_no_layer_is_both_planned_and_present():
    """The bookkeeping gate. When M1 lands the nine personas it adds a FixtureLayer and
    must remove the PlannedLayer; this is what fails if it does not, so §19.3's promise
    and the demo studio's actual contents can never quietly drift apart."""
    present = {layer.name for layer in SEEDS[LATEST_VERSION].layers}
    planned = {p.name for p in PLANNED_LAYERS}
    assert present & planned == set(), (
        f"{sorted(present & planned)} is both seeded and still listed as planned -- "
        "remove it from PLANNED_LAYERS"
    )


def test_the_full_19_3_fixture_set_is_accounted_for():
    """Every part of §19.3's paragraph is either seeded or explicitly owed. Written as
    an exact set so adding a layer without deciding where it belongs fails."""
    accounted = {layer.name for layer in SEEDS[LATEST_VERSION].layers} | {
        p.name for p in PLANNED_LAYERS
    }
    assert accounted == {
        "studio",
        "personas",
        "structure",
        "students",
        "health",
        "attendance",
        "money",
        "belts",
    }


def test_an_unknown_version_raises_rather_than_silently_seeding_the_latest():
    """A reset that quietly upgrades you to a newer fixture set is a reset that hides
    the regression you were bisecting."""
    with pytest.raises(KeyError):
        SEEDS["1999-01-01.0"]
