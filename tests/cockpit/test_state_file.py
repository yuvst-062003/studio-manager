"""The real file, asserted against facts that are independently checkable elsewhere
in the repo. These are not schema tests -- task 2 covers the schema. These catch a
transcription that parses cleanly and says something false."""

from __future__ import annotations

from tools.cockpit import derive
from tools.cockpit.state import DEFAULT_PATH, load


def test_the_real_file_parses():
    assert load().version == 1


def test_every_wave_in_the_milestone_plan_is_present():
    ids = [w.id for w in load().waves]
    assert ids == ["W0", "W1", "W2", "W3", "W4", "W5", "W6", "W7"]


def test_the_parallel_waves_name_their_two_lanes():
    """W2-W5 each run two build worktrees. A wave marked parallel with no lanes named
    would leave the cockpit unable to say which lane is which."""
    for wave in load().waves:
        if wave.mode == "parallel":
            assert len(wave.lanes) == 2, f"{wave.id} is parallel but names {wave.lanes}"


def test_m0_is_active_not_shipped_because_its_exit_gate_needs_hardware():
    """docs/install/verification-log.md: the iOS simulator proved the rendering half
    and none of the install half, and the Android emulator was never run. Marking M0
    shipped because its code is complete would be the first lie in the system."""
    state = load()
    w0 = next(w for w in state.waves if w.id == "W0")
    assert w0.status == "active"
    assert all(p.status == "shipped" for p in w0.pieces), "all four M0 pieces did ship"
    assert derive.active_piece(w0) is None
    assert derive.wave_progress(w0) == derive.Progress(done=4, total=4)


def test_every_open_holdback_explains_itself_and_names_what_it_blocks():
    for holdback in load().holdbacks:
        if holdback.status == "open":
            assert holdback.why.strip(), holdback.id
            assert holdback.blocks.strip(), holdback.id


def test_the_known_external_prerequisites_are_recorded():
    ids = {h.id for h in load().holdbacks}
    assert {"HB-upay", "HB-devices", "HB-domain", "HB-parents"} <= ids


def test_the_staging_superuser_debt_is_carried_not_external():
    """It is ours to fix and M1 closes it -- filing it as external would park it."""
    debt = next(h for h in load().holdbacks if h.id == "HB-staging-superuser")
    assert debt.kind == "carried"
    assert debt.blocks == "M1"


def test_the_four_obligations_m0_4_handed_to_m1_are_recorded():
    """next-session.md: four §19 obligations, each with a test already written that
    goes red until met. A red test nobody is tracking is not a plan."""
    carried = [h for h in load().holdbacks if h.kind == "carried" and h.blocks == "M1"]
    assert len(carried) >= 5, "four M0.4 obligations plus the staging superuser debt"


def test_every_holdback_kind_is_represented():
    grouped = derive.group_holdbacks(load())
    for kind, items in grouped.items():
        assert items, f"no open holdback of kind {kind}"


def test_nothing_measurable_is_declared():
    """A status the cockpit can compute must never be written down."""
    text = DEFAULT_PATH.read_text(encoding="utf-8")
    for forbidden in ("tests_passing", "ci_status", "gates:", "env_health", "branch:"):
        assert forbidden not in text, f"{forbidden} is measurable and must not be declared"


def test_only_the_holdbacks_that_wait_on_other_people_carry_lead_time():
    """lead_time promotes a distant holdback into the current view. It is for the ones
    that take somebody else's weeks -- a merchant account, a native speaker, five
    parents -- not for anything merely important."""
    flagged = {h.id for h in load().holdbacks if h.lead_time}
    assert flagged == {"HB-upay", "HB-parents", "HB-ru-review"}


def test_the_current_tier_is_small_enough_to_read():
    """The whole point of tiering. If `now` grows past a handful, lead_time is being
    used as a synonym for important and the board is a list again."""
    now = derive.tier_holdbacks(load())["now"]
    assert len(now) <= 6, [h.id for h in now]
