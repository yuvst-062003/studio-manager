"""Everything the laptop can measure locally.

Parsers take strings so they can be tested against captured git output; the functions
that shell out are thin wrappers with nothing branching in them.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from tools.cockpit import ROOT

RUNS_DIR = ROOT / "tools/cockpit/local/runs"


@dataclass(frozen=True)
class GitState:
    branch: str
    head: str
    dirty: bool
    worktrees: int


@dataclass(frozen=True)
class RunRecord:
    command_id: str
    argv: tuple[str, ...]
    exit_code: int
    started: str
    duration_s: float
    output: str


def _git(*args: str) -> str:
    """check=False on purpose: a git that fails should degrade the tile, not raise
    through the request handler."""
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=10, check=False
    ).stdout


def parse_git_state(porcelain: str, branch: str, head: str, worktree_list: str) -> GitState:
    return GitState(
        branch=branch.strip(),
        head=head.strip(),
        dirty=bool(porcelain.strip()),
        worktrees=len([line for line in worktree_list.splitlines() if line.strip()]),
    )


def git_state() -> GitState:
    return parse_git_state(
        _git("status", "--porcelain"),
        _git("branch", "--show-current"),
        _git("rev-parse", "--short", "HEAD"),
        _git("worktree", "list"),
    )


def commits_since(when: date) -> int:
    output = _git("rev-list", "--count", f"--since={when.isoformat()}", "HEAD")
    return int(output.strip() or 0)


def save_run(record: RunRecord) -> Path:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNS_DIR / f"{record.started.replace(':', '-')}-{record.command_id}.json"
    path.write_text(json.dumps(asdict(record)), encoding="utf-8")
    return path


def latest_runs() -> dict[str, RunRecord]:
    """Newest record per command. A corrupt file is skipped: a half-written record from
    a killed process must not take the whole page down."""
    latest: dict[str, RunRecord] = {}
    if not RUNS_DIR.exists():
        return latest
    for path in sorted(RUNS_DIR.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            record = RunRecord(
                command_id=str(raw["command_id"]),
                argv=tuple(str(a) for a in raw["argv"]),
                exit_code=int(raw["exit_code"]),
                started=str(raw["started"]),
                duration_s=float(raw["duration_s"]),
                output=str(raw["output"]),
            )
        except ValueError, KeyError, TypeError, OSError:
            continue
        current = latest.get(record.command_id)
        if current is None or record.started > current.started:
            latest[record.command_id] = record
    return latest
