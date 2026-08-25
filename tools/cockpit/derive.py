"""Pure functions over a parsed State. No I/O, no clock, no network.

Kept separate from state.py so that every number the surfaces render can be tested
without a file on disk, and so the phone surface gets the same arithmetic rather
than its own copy of it.
"""

from __future__ import annotations

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
