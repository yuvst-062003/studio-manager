"""Parsing is separated from shelling out so the parsers can be tested against real git
output without a fixture repository."""

from __future__ import annotations

from tools.cockpit.local import signals

PORCELAIN_CLEAN = ""
PORCELAIN_DIRTY = " M app/routers/health.py\n?? tools/cockpit/state.py\n"
WORKTREES_ONE = "/Users/x/studio-manager  577e130 [main]\n"
WORKTREES_TWO = WORKTREES_ONE + "/Users/x/studio-manager-m04  aef38b2 [main]\n"


def test_a_clean_tree_is_not_dirty():
    state = signals.parse_git_state(PORCELAIN_CLEAN, "main", "577e130", WORKTREES_ONE)
    assert state.dirty is False
    assert state.branch == "main"
    assert state.head == "577e130"
    assert state.worktrees == 1


def test_an_unstaged_change_makes_it_dirty():
    assert signals.parse_git_state(PORCELAIN_DIRTY, "main", "577e130", WORKTREES_ONE).dirty


def test_worktrees_are_counted_because_a_second_one_changes_what_commands_mean():
    """M0.4's retrospective: compose and node_modules both behave differently with a
    second checkout present. The count is worth showing."""
    assert signals.parse_git_state("", "main", "abc", WORKTREES_TWO).worktrees == 2


def test_a_detached_head_does_not_crash_the_parser():
    """`git branch --show-current` prints nothing when HEAD is detached."""
    state = signals.parse_git_state("", "", "577e130", WORKTREES_ONE)
    assert state.branch == ""


def test_a_run_round_trips_through_disk(tmp_path, monkeypatch):
    monkeypatch.setattr(signals, "RUNS_DIR", tmp_path)
    record = signals.RunRecord(
        command_id="pytest",
        argv=(".venv/bin/pytest", "-q"),
        exit_code=0,
        started="2026-08-25T09:12:00+00:00",
        duration_s=41.2,
        output="316 passed",
    )
    signals.save_run(record)
    assert signals.latest_runs()["pytest"] == record


def test_only_the_newest_run_per_command_survives(tmp_path, monkeypatch):
    monkeypatch.setattr(signals, "RUNS_DIR", tmp_path)
    for started, code in (("2026-08-25T09:00:00+00:00", 1), ("2026-08-25T09:30:00+00:00", 0)):
        signals.save_run(
            signals.RunRecord("pytest", (".venv/bin/pytest",), code, started, 1.0, "")
        )
    assert signals.latest_runs()["pytest"].exit_code == 0


def test_a_corrupt_run_file_is_skipped_not_fatal(tmp_path, monkeypatch):
    """A half-written record from a killed process must not take the page down."""
    monkeypatch.setattr(signals, "RUNS_DIR", tmp_path)
    (tmp_path / "broken.json").write_text("{not json", encoding="utf-8")
    assert signals.latest_runs() == {}


def test_a_missing_runs_directory_is_empty_not_an_error(tmp_path, monkeypatch):
    monkeypatch.setattr(signals, "RUNS_DIR", tmp_path / "never-created")
    assert signals.latest_runs() == {}


def test_the_run_filename_survives_a_colon_bearing_timestamp(tmp_path, monkeypatch):
    """ISO timestamps carry colons, which are legal on macOS and awkward everywhere."""
    monkeypatch.setattr(signals, "RUNS_DIR", tmp_path)
    path = signals.save_run(
        signals.RunRecord("pytest", ("x",), 0, "2026-08-25T09:12:00+00:00", 1.0, "")
    )
    assert ":" not in path.name
