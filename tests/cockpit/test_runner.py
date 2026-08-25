"""The runner is where an allowlisted id becomes a real process. Everything it must
refuse is refused before anything is spawned."""

from __future__ import annotations

from typing import Any

import pytest
from tools.cockpit.local import runner as run_mod


class _FakeProc:
    def __init__(self, lines: tuple[str, ...] = (), code: int = 0) -> None:
        self.returncode = code
        self.stdout = iter(f"{line}\n" for line in lines)

    def wait(self) -> int:
        return self.returncode


@pytest.fixture
def runner(tmp_path, monkeypatch):
    monkeypatch.setattr("tools.cockpit.local.signals.RUNS_DIR", tmp_path)
    return run_mod.Runner()


def _no_spawn(*args: Any, **kwargs: Any) -> Any:
    raise AssertionError("nothing should have been spawned")


def test_an_unknown_command_never_reaches_a_subprocess(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", _no_spawn)
    with pytest.raises(run_mod.CommandError):
        runner.start("rm-rf")


def test_a_hostile_vertical_never_reaches_a_subprocess(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", _no_spawn)
    with pytest.raises(run_mod.CommandError):
        runner.start("lane-check", "core; rm -rf /")


def test_a_second_run_while_one_is_in_flight_is_refused(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", lambda *a, **k: _FakeProc())
    runner.start("pytest")
    with pytest.raises(run_mod.BusyError):
        runner.start("mypy")


def test_db_reset_refuses_without_a_nonce_and_hands_one_back(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", _no_spawn)
    with pytest.raises(run_mod.ConfirmRequiredError) as caught:
        runner.start("db-reset")
    assert caught.value.nonce


def test_an_invented_nonce_is_refused(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", _no_spawn)
    with pytest.raises(run_mod.ConfirmRequiredError):
        runner.start("db-reset", nonce="not-the-one-i-issued")


def test_a_nonce_is_single_use(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", lambda *a, **k: _FakeProc())
    with pytest.raises(run_mod.ConfirmRequiredError) as issued:
        runner.start("db-reset")
    nonce = issued.value.nonce
    run_id = runner.start("db-reset", nonce=nonce)
    list(runner.stream(run_id))
    with pytest.raises(run_mod.ConfirmRequiredError):
        runner.start("db-reset", nonce=nonce)


def test_a_completed_run_is_recorded_with_its_exit_code(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", lambda *a, **k: _FakeProc(("ok",), 3))
    run_id = runner.start("pytest")
    assert list(runner.stream(run_id))[-1] == "__exit__:3"
    from tools.cockpit.local import signals

    assert signals.latest_runs()["pytest"].exit_code == 3


def test_the_lock_is_released_so_a_later_run_can_start(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", lambda *a, **k: _FakeProc(("x",), 0))
    list(runner.stream(runner.start("pytest")))
    assert runner.is_running() is False
    runner.start("mypy")


def test_the_spawn_receives_the_compose_project_name(runner, monkeypatch):
    seen: dict[str, Any] = {}

    def capture(argv, cwd, extra_env):
        seen.update({"argv": argv, "cwd": cwd, "env": extra_env})
        return _FakeProc()

    monkeypatch.setattr(run_mod, "_spawn", capture)
    runner.start("db-up")
    assert seen["env"]["COMPOSE_PROJECT_NAME"] == "studio-manager"
    assert seen["argv"] == ("./scripts/dev-db.sh", "up")
