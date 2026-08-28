"""§5.9 -- "A judo default set is seeded and fully editable." Artboards `5d` and `5b`.

**Preset rank names are DATA, not copy.** `5b` finding 5 settles it: the manager renames
them on that screen. So they are seeded values in Python and not i18n keys -- and by
extension the preset's own name is too, because a discipline plus a rank count is a
preset's name, and a studio that renamed every rank has not renamed the preset it started
from.

**Versioned, like `app/services/demo/fixtures.py`.** A studio seeded in September and one
seeded in March must get the same ladder, or two clubs' `12d` timelines mean different
things.

**Seeding never overwrites.** A class with a ladder already has one, and a second seed over
live grades would renumber ranks that `student_belt` rows point at.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.services.belts.presets import BELT_PRESETS

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def test_every_preset_is_a_total_order_with_valid_colours():
    """Asserted over the data itself, not through the API.

    `uq_belt_rank_class_order` would reject a duplicated index as an IntegrityError halfway
    through a seed, leaving a class with half a ladder -- and `HexColour`'s pattern is what
    stops a value reaching `BeltBar` as a CSS declaration it cannot render.
    """
    assert BELT_PRESETS, "the judo default set is §5.9's, not optional"
    for preset in BELT_PRESETS:
        indices = [rank.order_index for rank in preset.ranks]
        assert indices == list(range(len(preset.ranks))), preset.key
        assert len({rank.name for rank in preset.ranks}) == len(preset.ranks), preset.key
        for rank in preset.ranks:
            assert HEX.fullmatch(rank.color_hex), (preset.key, rank.name)
            assert rank.secondary_color_hex is None or HEX.fullmatch(rank.secondary_color_hex), (
                preset.key,
                rank.name,
            )


def test_the_purple_ladder_is_the_default_and_matches_the_owners_sequence():
    """2026-08-28 — the owner's ladder: purple sits between white and yellow, every
    intermediate grade is bi-colour, twelve ranks to black. First in the tuple, which is
    what the wizard renders as the recommended card."""
    default = BELT_PRESETS[0]
    assert default.key == "judo_children_purple"
    assert [rank.name for rank in default.ranks] == [
        "לבנה",
        "לבנה-סגולה",
        "סגולה",
        "סגולה-צהובה",
        "צהובה",
        "צהובה-כתומה",
        "כתומה",
        "כתומה-ירוקה",
        "ירוקה",
        "ירוקה-חומה",
        "חומה",
        "שחורה",
    ]
    # Every in-between grade carries its second colour; every full grade is plain.
    for index, rank in enumerate(default.ranks):
        if rank.name.count("-"):
            assert rank.secondary_color_hex, rank.name
        else:
            assert rank.secondary_color_hex is None, rank.name
        assert rank.order_index == index


def test_the_children_preset_carries_bi_colour_grades():
    """Artboard `5d` -- 'חגורות ביניים לילדים הן בדרך כלל דו-צבעיות', and `5b` is explicit
    that the system includes them. A children's preset of solid belts would let this lane
    ship a belt system having never rendered `BeltBar`'s second colour."""
    children = next(p for p in BELT_PRESETS if p.key == "judo_children")
    bi_colour = [r for r in children.ranks if r.secondary_color_hex is not None]
    assert len(bi_colour) >= 4
    assert all(r.color_hex != r.secondary_color_hex for r in bi_colour)


def test_no_preset_colour_collides_with_a_semantic_token():
    """D3 -- belt colours must stay visually distinct from the semantic ones, and D12
    already moved dark `--paid` off a green belt's hex to keep them apart. A preset
    shipping one of those values would undo that decision through data rather than through
    the token layer, where nobody would look for it.

    The values are READ from `tokens.css` rather than copied here. A hardcoded list is a
    list that goes stale silently -- and it would go stale in the direction that matters,
    because a token moving onto a belt colour is exactly the collision this guards.
    **Both themes**, because D12's whole finding was that the light-mode audit had only
    measured one ground.
    """
    tokens_css = (
        Path(__file__).resolve().parents[2] / "web" / "packages" / "ui" / "src" / "tokens.css"
    )
    semantic = {
        value.lower()
        for value in re.findall(
            r"--(?:paid|pending|danger|debt|cancelled):\s*(#[0-9a-fA-F]{6})",
            tokens_css.read_text(encoding="utf-8"),
        )
    }
    assert len(semantic) >= 6, "both themes' semantic values should have been found"

    for preset in BELT_PRESETS:
        for rank in preset.ranks:
            assert rank.color_hex.lower() not in semantic, (preset.key, rank.name)
            if rank.secondary_color_hex is not None:
                assert rank.secondary_color_hex.lower() not in semantic, (
                    preset.key,
                    rank.name,
                )


def test_the_catalogue_is_readable_before_anything_is_chosen(client, as_manager):
    """`5d` renders the preset cards with a live preview of the ranks each would create,
    so the ladder has to be readable before it exists."""
    response = client.get("/api/v1/belt-presets", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    keys = {row["key"] for row in items}
    assert {"judo_adults", "judo_children", "karate"} <= keys
    first = items[0]
    assert first["ranks"] and HEX.fullmatch(first["ranks"][0]["color_hex"])


def test_seeding_creates_the_whole_ladder_in_order(client, as_manager, a_class):
    response = client.post(
        "/api/v1/belt-ranks/seed",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "preset_key": "judo_children"},
    )
    assert response.status_code == 201, response.text
    items = response.json()["items"]
    assert [row["order_index"] for row in items] == list(range(len(items)))
    assert any(row["secondary_color_hex"] for row in items)
    # The seeded ladder is a real ladder, so its top rung has no next.
    assert items[-1]["next_rank_id"] is None


def test_seeding_a_class_that_already_has_a_ladder_is_refused(
    client, as_manager, a_class, a_belt_ladder
):
    """A second seed would renumber ranks that `student_belt` rows already point at. 409
    rather than a silent merge -- `events.belt.empty` is the state a seed is for."""
    response = client.post(
        "/api/v1/belt-ranks/seed",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "preset_key": "judo_adults"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "ladder_already_seeded"


def test_an_unknown_preset_is_a_422(client, as_manager, a_class):
    response = client.post(
        "/api/v1/belt-ranks/seed",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "preset_key": "aikido"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "no_such_preset"


def test_a_lead_coach_does_not_seed_a_belt_system(client, as_lead_coach, a_class):
    """Same §3.2 line as creating a rank by hand: seeding twelve at once is not a smaller
    act of configuration."""
    response = client.post(
        "/api/v1/belt-ranks/seed",
        headers=as_lead_coach.headers,
        json={"class_id": str(a_class), "preset_key": "judo_adults"},
    )
    assert response.status_code == 403
