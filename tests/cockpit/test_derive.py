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


def _hb(hid: str, blocks: str, *, lead_time: bool = False, status: str = "open") -> Holdback:
    return Holdback(
        id=hid,
        kind="external",
        title=hid,
        why="because",
        blocks=blocks,
        status=status,
        lead_time=lead_time,
    )


def _plan(*holdbacks: Holdback) -> State:
    def w(wid: str, milestone: str, status: str) -> Wave:
        return Wave(
            id=wid,
            milestone=milestone,
            title=wid,
            mode="sequential",
            exit_gate="gate",
            status=status,
        )

    return State(
        version=1,
        updated=date(2026, 8, 25),
        waves=(
            w("W0", "M0", "active"),
            w("W1", "M1", "pending"),
            w("W2", "M2 ∥ M3", "pending"),
            w("W3", "M4 ∥ M5", "pending"),
            w("W4", "M6 ∥ M7", "pending"),
            w("W7", "M11", "pending"),
        ),
        holdbacks=holdbacks,
    )


def test_a_wave_id_in_blocks_resolves_to_that_wave():
    assert derive.wave_index_for(_plan(), "W4") == 4


def test_a_milestone_in_blocks_resolves_to_the_wave_that_carries_it():
    plan = _plan()
    assert derive.wave_index_for(plan, "M0 exit") == 0
    assert derive.wave_index_for(plan, "M1") == 1
    assert derive.wave_index_for(plan, "M3") == 2, "a parallel wave carries two milestones"
    assert derive.wave_index_for(plan, "M11") == 5


def test_m1_does_not_match_the_wave_carrying_m11():
    """Substring matching would put an M1 obligation in the launch wave."""
    assert derive.wave_index_for(_plan(), "M1") == 1


def test_something_that_names_no_known_wave_is_unplaceable():
    assert derive.wave_index_for(_plan(), "someday") is None


def test_the_current_waves_holdbacks_are_now_and_the_far_ones_are_later():
    """The complaint this fixes: an M11 item competing for attention while you are
    still in M0."""
    tiers = derive.tier_holdbacks(
        _plan(_hb("here", "M0 exit"), _hb("soon", "M1"), _hb("far", "M11"))
    )
    assert [h.id for h in tiers["now"]] == ["here"]
    assert [h.id for h in tiers["next"]] == ["soon"]
    assert [h.id for h in tiers["later"]] == ["far"]


def test_a_lead_time_holdback_is_promoted_however_far_out_it_blocks():
    """uPay blocks W4, and that is exactly why it has to be visible in W0: a merchant
    account discovered on the first day of W4 is a stalled wave."""
    tiers = derive.tier_holdbacks(_plan(_hb("upay", "W4", lead_time=True)))
    assert [h.id for h in tiers["now"]] == ["upay"]
    assert not tiers["later"]


def test_a_lead_time_flag_does_nothing_for_something_already_current():
    tiers = derive.tier_holdbacks(_plan(_hb("here", "M0 exit", lead_time=True)))
    assert [h.id for h in tiers["now"]] == ["here"]


def test_closed_holdbacks_appear_in_no_tier():
    tiers = derive.tier_holdbacks(_plan(_hb("done", "M0 exit", status="closed")))
    assert not any(tiers.values())


def test_an_unplaceable_holdback_lands_in_later_rather_than_vanishing():
    tiers = derive.tier_holdbacks(_plan(_hb("vague", "someday")))
    assert [h.id for h in tiers["later"]] == ["vague"]


def test_a_holdback_for_a_wave_already_passed_still_counts_as_now():
    """W0 is active with every piece shipped. Something blocking W0 has not stopped
    mattering because the code is done -- that is what keeps the wave open."""
    plan = _plan(_hb("old", "W0"))
    assert [h.id for h in derive.tier_holdbacks(plan)["now"]] == ["old"]
