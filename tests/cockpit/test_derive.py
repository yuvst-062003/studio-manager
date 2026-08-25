"""Every number the cockpit shows is derived here. A wrong count is a lie told
confidently, which is the failure mode the whole design exists to avoid."""

from __future__ import annotations

from datetime import date

from tools.cockpit import derive
from tools.cockpit.state import Holdback, Item, Piece, State, Wave


def _piece(pid: str, status: str, *items: tuple[str, str]) -> Piece:
    return Piece(
        id=pid,
        title=pid,
        status=status,
        items=tuple(Item(title=t, status=s) for t, s in items),
    )


def _wave(status: str, *pieces: Piece) -> Wave:
    return Wave(
        id="W0",
        milestone="M0",
        title="Foundations",
        mode="sequential",
        exit_gate="lane-check core green",
        status=status,
        pieces=pieces,
    )


def test_a_piece_with_items_counts_its_items():
    piece = _piece("M0.4", "active", ("a", "shipped"), ("b", "shipped"), ("c", "pending"))
    assert derive.piece_progress(piece) == derive.Progress(done=2, total=3)


def test_a_piece_with_no_items_counts_itself():
    assert derive.piece_progress(_piece("M0.1", "shipped")) == derive.Progress(done=1, total=1)
    assert derive.piece_progress(_piece("M0.9", "pending")) == derive.Progress(done=0, total=1)


def test_an_empty_total_is_zero_not_a_division_error():
    assert derive.Progress(done=0, total=0).fraction == 0.0


def test_wave_progress_counts_shipped_pieces():
    wave = _wave("active", _piece("a", "shipped"), _piece("b", "shipped"), _piece("c", "active"))
    assert derive.wave_progress(wave) == derive.Progress(done=2, total=3)


def test_the_active_piece_is_the_first_active_one():
    wave = _wave("active", _piece("a", "shipped"), _piece("b", "active"), _piece("c", "pending"))
    active = derive.active_piece(wave)
    assert active is not None and active.id == "b"


def test_a_wave_whose_pieces_all_shipped_has_no_active_piece():
    """M0's real shape: every piece shipped, the wave still not exited because its
    exit gate needs hardware. Returning a piece here would claim work that is done."""
    wave = _wave("active", _piece("a", "shipped"), _piece("b", "shipped"))
    assert derive.active_piece(wave) is None


def test_the_active_wave_is_the_one_marked_active():
    state = State(
        version=1,
        updated=date(2026, 8, 25),
        waves=(_wave("shipped"), _wave("active"), _wave("pending")),
        holdbacks=(),
    )
    found = derive.active_wave(state)
    assert found is not None and found.status == "active"


def _holdback(hid: str, kind: str, status: str) -> Holdback:
    return Holdback(id=hid, kind=kind, title=hid, why="because", blocks="W4", status=status)


def test_grouping_keeps_only_open_holdbacks_and_orders_the_kinds():
    state = State(
        version=1,
        updated=date(2026, 8, 25),
        waves=(),
        holdbacks=(
            _holdback("a", "carried", "open"),
            _holdback("b", "external", "open"),
            _holdback("c", "external", "closed"),
            _holdback("d", "conflict", "open"),
        ),
    )
    grouped = derive.group_holdbacks(state)
    assert list(grouped) == ["external", "conflict", "carried"]
    assert [h.id for h in grouped["external"]] == ["b"]
    assert grouped["conflict"][0].id == "d"
    assert grouped["carried"][0].id == "a"


def test_state_is_stale_when_commits_have_landed_since_it_was_updated():
    state = State(version=1, updated=date(2026, 8, 25), waves=(), holdbacks=())
    assert derive.staleness(state, commits_since_update=0) == derive.Staleness(0, False)
    assert derive.staleness(state, commits_since_update=3) == derive.Staleness(3, True)
