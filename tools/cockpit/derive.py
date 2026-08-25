"""Pure functions over a parsed State. No I/O, no clock, no network.

Kept separate from state.py so that every number the surfaces render can be tested
without a file on disk, and so the phone surface gets the same arithmetic rather
than its own copy of it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from tools.cockpit.state import Holdback, Piece, State, Wave

# Display order, most-actionable first: something a third party owes you outranks a
# contradiction in your own docs, which outranks debt you chose knowingly.
KIND_ORDER = ("external", "conflict", "carried")


@dataclass(frozen=True)
class Progress:
    done: int
    total: int

    @property
    def fraction(self) -> float:
        return self.done / self.total if self.total else 0.0


@dataclass(frozen=True)
class Staleness:
    commits_behind: int
    is_stale: bool


def piece_progress(piece: Piece) -> Progress:
    if piece.items:
        return Progress(
            done=sum(1 for item in piece.items if item.status == "shipped"),
            total=len(piece.items),
        )
    return Progress(done=1 if piece.status == "shipped" else 0, total=1)


def wave_progress(wave: Wave) -> Progress:
    return Progress(
        done=sum(1 for piece in wave.pieces if piece.status == "shipped"),
        total=len(wave.pieces),
    )


def active_wave(state: State) -> Wave | None:
    return next((wave for wave in state.waves if wave.status == "active"), None)


def active_piece(wave: Wave) -> Piece | None:
    """None when every piece has shipped -- which is not the same as the wave being
    done. A wave stays active until its exit gate passes, and M0's needs hardware."""
    return next((piece for piece in wave.pieces if piece.status == "active"), None)


def group_holdbacks(state: State) -> dict[str, tuple[Holdback, ...]]:
    return {
        kind: tuple(h for h in state.holdbacks if h.status == "open" and h.kind == kind)
        for kind in KIND_ORDER
    }


def staleness(state: State, commits_since_update: int) -> Staleness:
    """`state` is accepted but unused today; it is the parameter that will carry the
    comparison when `updated` grows a time component. Keeping the signature stable
    now saves changing every caller then."""
    _ = state
    return Staleness(commits_behind=commits_since_update, is_stale=commits_since_update > 0)


# A wave's `milestone` reads "M0" or "M2 ∥ M3", so the ids are extracted rather than
# compared: a substring test would file an M1 obligation under the wave carrying M11.
_MILESTONE = re.compile(r"M\d+")


def wave_index_for(state: State, blocks: str) -> int | None:
    """Which wave a holdback's `blocks` text points at, or None if it names none.

    `blocks` is deliberately free text -- "W4", "M1", "M0 exit" are all things a human
    would write -- so this resolves both spellings rather than forcing a schema on the
    one field people will actually hand-edit.
    """
    text = blocks.strip()
    wave_id = re.match(r"^(W\d+)", text)
    if wave_id:
        for index, wave in enumerate(state.waves):
            if wave.id == wave_id.group(1):
                return index
    milestone = _MILESTONE.search(text)
    if milestone:
        for index, wave in enumerate(state.waves):
            if milestone.group(0) in set(_MILESTONE.findall(wave.milestone)):
                return index
    return None


def tier_holdbacks(state: State) -> dict[str, tuple[Holdback, ...]]:
    """Open holdbacks by how soon they bite: now, next, later.

    Sixteen items with an M11 entry beside an M0 one is not a status board, it is a
    list. But distance must demote rather than hide: the items worth surfacing earliest
    are precisely the ones that block a distant wave and take weeks to clear, which is
    what `lead_time` promotes back to the top.
    """
    active = active_wave(state)
    here = state.waves.index(active) if active else 0
    tiers: dict[str, list[Holdback]] = {"now": [], "next": [], "later": []}
    for holdback in state.holdbacks:
        if holdback.status != "open":
            continue
        index = wave_index_for(state, holdback.blocks)
        if index is not None and index <= here or holdback.lead_time:
            tiers["now"].append(holdback)
        elif index is not None and index == here + 1:
            tiers["next"].append(holdback)
        else:
            tiers["later"].append(holdback)
    order = {kind: position for position, kind in enumerate(KIND_ORDER)}
    return {
        tier: tuple(sorted(items, key=lambda h: order.get(h.kind, len(order))))
        for tier, items in tiers.items()
    }
