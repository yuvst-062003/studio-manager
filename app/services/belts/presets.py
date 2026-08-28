"""§5.9's seeded belt systems -- "A judo default set is seeded and fully editable."

Artboard `5d`'s four cards, minus the build-from-scratch one: that fourth card creates
nothing, so it is the absence of a preset rather than a preset.

**These names are DATA and not copy**, and `5b` is what settles it: the manager renames
every rank on that screen. So they live here in Hebrew, in Python, and not in
`web/packages/i18n/*/events.ts` -- the same answer the health questionnaire and the price
catalogue get, and the general rule `5d` finding 3 asks for rather than three special
cases. The preset's own name is data for the same reason: a discipline plus a rank count
names a *preset*, and a studio that has renamed every rank has not renamed the set it
started from.

**Versioned, like `app/services/demo/fixtures.py`.** A studio seeded in September and one
seeded in March must get the same ladder, or one club's `12d` timeline means something
different from another's. Editing a preset in place would do exactly that, so a change is a
new key rather than a new value under an old one.

**The colours are belt colours, and none of them is a semantic token's.** D3 requires the
two stay distinct and D12 already moved dark `--paid` off a green belt's hex to keep them
apart; `tests/belts/test_seeding_a_belt_system.py` reads `tokens.css` and asserts it, in
both themes, so the rule cannot be broken from this side either. Every one of them is
ringed unconditionally by `BeltBar` (G10/D7), which is what makes white usable on the light
ground and black usable on the dark one at all.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank
from app.services.belts.errors import LadderAlreadySeededError, NoSuchPresetError


@dataclass(frozen=True)
class PresetRank:
    name: str
    kyu: int | None
    order_index: int
    color_hex: str
    #: The stripe on a two-tone junior belt. `None` is a plain belt.
    secondary_color_hex: str | None = None


@dataclass(frozen=True)
class BeltPreset:
    key: str
    #: The discipline this ladder belongs to. `5d`'s card title is the discipline plus a
    #: rank count, and both halves come from here.
    discipline: str
    name: str
    ranks: tuple[PresetRank, ...]


_WHITE = "#FFFFFF"
_YELLOW = "#F7E017"
_ORANGE = "#F08A24"
_GREEN = "#2E8B4A"
_BLUE = "#2B6CB0"
_PURPLE = "#6B46C1"
_BROWN = "#6F4A2F"
_BLACK = "#111111"

JUDO_ADULTS = BeltPreset(
    key="judo_adults",
    discipline="judo",
    name="ג'ודו",
    ranks=(
        PresetRank("לבנה", 6, 0, _WHITE),
        PresetRank("צהובה", 5, 1, _YELLOW),
        PresetRank("כתומה", 4, 2, _ORANGE),
        PresetRank("ירוקה", 3, 3, _GREEN),
        PresetRank("כחולה", 2, 4, _BLUE),
        PresetRank("חומה", 1, 5, _BROWN),
        #: No kyu: dan grades are counted the other way, which is why `belt_rank.kyu` is
        #: nullable rather than defaulted to zero.
        PresetRank("שחורה", None, 6, _BLACK),
    ),
)

#: The bi-colour ladder. `5d`: 'חגורות ביניים לילדים הן בדרך כלל דו-צבעיות', and `5b` draws
#: the same hard 50/50 split. Without these in a preset, a lane can ship a belt system
#: having never rendered `BeltBar`'s second colour -- and would meet it for the first time
#: on the day a studio configured one.
JUDO_CHILDREN = BeltPreset(
    key="judo_children",
    discipline="judo",
    name="ג'ודו ילדים",
    ranks=(
        PresetRank("לבנה", 12, 0, _WHITE),
        PresetRank("לבנה-צהובה", 11, 1, _WHITE, _YELLOW),
        PresetRank("צהובה", 10, 2, _YELLOW),
        PresetRank("צהובה-כתומה", 9, 3, _YELLOW, _ORANGE),
        PresetRank("כתומה", 8, 4, _ORANGE),
        PresetRank("כתומה-ירוקה", 7, 5, _ORANGE, _GREEN),
        PresetRank("ירוקה", 6, 6, _GREEN),
        PresetRank("ירוקה-כחולה", 5, 7, _GREEN, _BLUE),
        PresetRank("כחולה", 4, 8, _BLUE),
        PresetRank("כחולה-חומה", 3, 9, _BLUE, _BROWN),
        PresetRank("חומה", 2, 10, _BROWN),
        PresetRank("שחורה", 1, 11, _BLACK),
    ),
)

#: The owner's own ladder (requested 2026-08-28): the full children's sequence with
#: PURPLE between white and yellow, every intermediate grade bi-colour. First in the
#: tuple below, which is what makes it the recommended default card in 5d and the wizard.
JUDO_CHILDREN_PURPLE = BeltPreset(
    key="judo_children_purple",
    discipline="judo",
    name="ג'ודו ילדים (עם סגולה)",
    ranks=(
        PresetRank("לבנה", 12, 0, _WHITE),
        PresetRank("לבנה-סגולה", 11, 1, _WHITE, _PURPLE),
        PresetRank("סגולה", 10, 2, _PURPLE),
        PresetRank("סגולה-צהובה", 9, 3, _PURPLE, _YELLOW),
        PresetRank("צהובה", 8, 4, _YELLOW),
        PresetRank("צהובה-כתומה", 7, 5, _YELLOW, _ORANGE),
        PresetRank("כתומה", 6, 6, _ORANGE),
        PresetRank("כתומה-ירוקה", 5, 7, _ORANGE, _GREEN),
        PresetRank("ירוקה", 4, 8, _GREEN),
        PresetRank("ירוקה-חומה", 3, 9, _GREEN, _BROWN),
        PresetRank("חומה", 2, 10, _BROWN),
        PresetRank("שחורה", 1, 11, _BLACK),
    ),
)

KARATE = BeltPreset(
    key="karate",
    discipline="karate",
    name="קראטה",
    ranks=(
        PresetRank("לבנה", 9, 0, _WHITE),
        PresetRank("צהובה", 8, 1, _YELLOW),
        PresetRank("כתומה", 7, 2, _ORANGE),
        PresetRank("ירוקה", 6, 3, _GREEN),
        PresetRank("כחולה", 5, 4, _BLUE),
        PresetRank("סגולה", 4, 5, _PURPLE),
        PresetRank("חומה", 3, 6, _BROWN),
        PresetRank("חומה-שחורה", 2, 7, _BROWN, _BLACK),
        PresetRank("שחורה", 1, 8, _BLACK),
    ),
)

#: Children first: `5d` marks it מומלץ, and a club setting up for the first time is far
#: more often a children's club than an adults' one. The purple ladder leads since
#: 2026-08-28 — it is the owner's chosen default; the earlier children's set stays under
#: its own key, per this module's versioning rule.
BELT_PRESETS: tuple[BeltPreset, ...] = (JUDO_CHILDREN_PURPLE, JUDO_CHILDREN, JUDO_ADULTS, KARATE)

_BY_KEY = {preset.key: preset for preset in BELT_PRESETS}


class BeltPresetService:
    @staticmethod
    def get(preset_key: str) -> BeltPreset:
        try:
            return _BY_KEY[preset_key]
        except KeyError as exc:
            raise NoSuchPresetError(preset_key) from exc

    @staticmethod
    def seed(session: TenantSession, class_id: uuid.UUID, preset_key: str) -> list[BeltRank]:
        """Never over an existing ladder.

        A second seed renumbers ranks that `student_belt` rows already point at, which
        rewrites a child's history without touching their row -- the worst kind of data
        loss, because nothing about it looks like a deletion.
        """
        preset = BeltPresetService.get(preset_key)
        existing = session.execute(
            select(BeltRank.id).where(BeltRank.class_id == class_id).limit(1)
        ).first()
        if existing is not None:
            raise LadderAlreadySeededError(str(class_id))
        rows = [
            BeltRank(
                class_id=class_id,
                name=rank.name,
                kyu=rank.kyu,
                order_index=rank.order_index,
                color_hex=rank.color_hex,
                secondary_color_hex=rank.secondary_color_hex,
            )
            for rank in preset.ranks
        ]
        session.add_all(rows)
        session.flush()
        return rows
