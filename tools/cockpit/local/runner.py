"""Executes allowlisted commands, one at a time, streaming and recording output.

`_spawn` is a module-level function rather than a method so tests can replace it
without a real subprocess. Nothing here builds a shell string: `resolve()` returns an
argv tuple and it is passed through unchanged with shell=False.
"""

from __future__ import annotations

import os
import secrets
import subprocess
import threading
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

from tools.cockpit import ROOT
from tools.cockpit.local import signals
from tools.cockpit.local.commands import COMMANDS, CommandError, cwd_for, env_for, resolve

__all__ = ["BusyError", "CommandError", "ConfirmRequiredError", "Runner"]


class BusyError(RuntimeError):
    """One run at a time. Two concurrent `alembic upgrade head` calls is not a state
    worth supporting, so the second request is refused rather than queued."""


class ConfirmRequiredError(RuntimeError):
    def __init__(self, nonce: str) -> None:
        super().__init__("confirmation required")
        self.nonce = nonce


def _spawn(argv: tuple[str, ...], cwd: str, extra_env: dict[str, str]) -> Any:
    # argv list with shell=False, and the id came from a closed table -- there is no
    # shell string in this process for anything to be injected into.
    return subprocess.Popen(
        list(argv),
        cwd=ROOT / cwd,
        env={**os.environ, **extra_env},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        shell=False,
    )


class Runner:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: Any | None = None
        self._runs: dict[str, dict[str, Any]] = {}
        self._pending_nonce: str | None = None

    def is_running(self) -> bool:
        return self._active is not None

    def start(self, command_id: str, vertical: str | None = None, nonce: str | None = None) -> str:
        # resolve() first, always: an unknown id or a hostile vertical must be refused
        # before anything is spawned, and before a nonce is issued for it.
        argv = resolve(command_id, vertical)
        if self._active is not None:
            raise BusyError(f"{command_id} refused: a run is already in flight")
        if COMMANDS[command_id].confirm:
            if nonce is None or nonce != self._pending_nonce:
                self._pending_nonce = secrets.token_urlsafe(16)
                raise ConfirmRequiredError(self._pending_nonce)
            self._pending_nonce = None  # single use
        with self._lock:
            run_id = secrets.token_urlsafe(8)
            self._active = _spawn(argv, cwd_for(command_id), env_for(command_id))
            self._runs[run_id] = {
                "command_id": command_id,
                "argv": argv,
                "proc": self._active,
                "started": datetime.now(UTC).isoformat(),
                "t0": time.monotonic(),
            }
        return run_id

    def stream(self, run_id: str) -> Iterator[str]:
        run = self._runs[run_id]
        proc = run["proc"]
        lines: list[str] = []
        try:
            for line in proc.stdout:
                text = line.rstrip("\n")
                lines.append(text)
                yield text
            code = int(proc.wait())
            signals.save_run(
                signals.RunRecord(
                    command_id=str(run["command_id"]),
                    argv=tuple(run["argv"]),
                    exit_code=code,
                    started=str(run["started"]),
                    duration_s=round(time.monotonic() - float(run["t0"]), 2),
                    output="\n".join(lines),
                )
            )
            yield f"__exit__:{code}"
        finally:
            # Released in a finally: a client that disconnects mid-stream must not leave
            # the runner permanently busy with nothing running.
            self._active = None
