# Build Cockpit — Core and Laptop Surface, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local dashboard at `http://127.0.0.1:7317` showing which milestone is active, what is holding it back, and the state of every gate — with buttons that run the project's existing check scripts and stream their output.

**Architecture:** A standalone Python process under `tools/cockpit/`, stdlib plus PyYAML, that never imports `app/`. Four modules are shared with the phone surface built in plan 2 (`state`, `derive`, `envs`, `render`); everything that can execute a command lives under `local/` and is never copied into the phone image. Truth is hybrid: `docs/plan/state.yaml` holds what must be authored, and everything measurable is computed.

**Tech Stack:** Python 3.14 (`.venv/bin/python`), `http.server.ThreadingHTTPServer`, `urllib.request`, `concurrent.futures`, PyYAML 6. No web framework, no build step, no npm.

**Spec:** [docs/superpowers/specs/2026-08-25-build-cockpit-design.md](../specs/2026-08-25-build-cockpit-design.md)

**Branch:** all work lands on `design/build-cockpit`.

**Scope:** this plan builds the shared core and the laptop surface only. The phone surface — GitHub reads, the auth exchange, the PWA and the Railway service — is plan 2, and depends on tasks 2, 3 and 5 here.

## Global Constraints

Every task inherits these. Values copied verbatim from the spec and CLAUDE.md.

| # | Constraint | Source |
|---|---|---|
| C1 | Python tooling is in `.venv/`. Always the `.venv/bin/` prefix — a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH. | CLAUDE.md §Commands |
| C2 | **`tools/cockpit/**` never imports `app/`, and never imports from `web/`.** The laptop surface must render when the product will not import. | Spec §1.1 |
| C3 | **The only third-party import permitted in `tools/cockpit/**` is `yaml` (PyYAML).** Not pydantic, not httpx, not fastapi — all are project dependencies and all are forbidden here. | Spec §1.1 |
| C4 | Every subprocess uses an **argv list** with `shell=False`. There is no shell string anywhere in this tool. | Spec §6.2 |
| C5 | **`COMPOSE_PROJECT_NAME=studio-manager`** is set in the environment of every command that reaches docker compose. Without it, compose creates a second project with an empty volume and claims the running container. | Spec §6.2, M0.4 retrospective |
| C6 | The server binds **`127.0.0.1`** explicitly. Never `0.0.0.0`. | Spec §7.1 |
| C7 | **`alembic downgrade` must be unreachable through any input.** It is on `.claude/settings.json`'s deny list and must not re-enter through this tool. | Spec §6.1 |
| C8 | `docs/plan/state.yaml` carries **no `#` comments** — PyYAML destroys them on write. Explanations go in `why:` and `source:` fields. | Spec §4.2 |
| C9 | Nothing measurable is declared in `state.yaml`. No test results, no env health, no git state. | Spec §4.2 |
| C10 | A failing test is written before any implementation. Confirm it fails for the stated reason before writing code. | CLAUDE.md §Workflow |

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `tools/cockpit/__init__.py` | package marker; holds `ROOT` resolution and nothing else |
| `tools/cockpit/state.py` | the `state.yaml` schema, loader and writer |
| `tools/cockpit/derive.py` | progress counts, holdback grouping, staleness — pure functions over `State` |
| `tools/cockpit/envs.py` | concurrent health probes with per-target timeouts |
| `tools/cockpit/local/__init__.py` | package marker |
| `tools/cockpit/local/commands.py` | the allowlist as data, and argv resolution |
| `tools/cockpit/local/signals.py` | git state, run history, local alembic head |
| `tools/cockpit/local/runner.py` | subprocess execution, the single-run lock, run records |
| `tools/cockpit/local/server.py` | routes, the page token, SSE |
| `tools/cockpit/local/static/index.html` | the Console — one file, inline CSS and JS |
| `scripts/cockpit.sh` | the one command that starts it |
| `docs/plan/state.yaml` | the authored truth |
| `tests/cockpit/` | the tests for all of the above |

**Modified**

| Path | Change |
|---|---|
| `scripts/lane-check.sh` | `core` vertical gains `tools/cockpit` and `tests/cockpit` |
| `pyproject.toml` | mypy `files` and ruff `src` gain `tools` |
| `scripts/ci-local.sh` | ruff check and format gain `tools` |
| `.gitignore` | ignore `tools/cockpit/local/runs/` |
| `app/routers/health.py` | `HealthResponse` gains `revision` and `started_at` |
| `tests/config/test_lane_check.py` | assert the new `core` scope |
| `tests/test_health.py` | assert the new fields and the liveness guarantee |
| `CLAUDE.md` | §Workflow gains the `state.yaml` tick rule |

`render.py` from spec §3 is deliberately **not** in this plan. It exists to share markup between two surfaces, and there is only one surface until plan 2 — building it now would be designing an interface against a single caller. The Console's markup lives in its own file until the phone gives it a second consumer.

---

### Task 1: The gate, before the code it gates

Nothing in `tools/` is currently linted, typechecked or tested by any gate. Writing the cockpit first and wiring the gate afterwards would mean every test in tasks 2–11 was, for a while, a test no gate ran. This project has found sixteen gates that could not fail; this task exists so this is not the seventeenth.

**Files:**
- Create: `tools/cockpit/__init__.py`, `tools/cockpit/local/__init__.py`, `tests/cockpit/__init__.py`
- Modify: `scripts/lane-check.sh:46-52`, `pyproject.toml`, `scripts/ci-local.sh:13-14`, `.gitignore`
- Test: `tests/config/test_lane_check.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `tools.cockpit.ROOT` — a `pathlib.Path` to the repository root, resolved from `__file__`, used by every later task instead of `Path.cwd()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/config/test_lane_check.py`:

```python
def test_core_scopes_the_cockpit_so_its_tests_are_not_a_gate_that_never_runs():
    """tools/ is outside every per-vertical convention, so without this it is linted
    by nothing, typechecked by nothing and tested by nothing."""
    stdout = _run("core", "--dry-run").stdout
    for expected in ("tools/cockpit", "tests/cockpit"):
        assert expected in stdout, f"core's plan omits {expected}\n{stdout}"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/config/test_lane_check.py::test_core_scopes_the_cockpit_so_its_tests_are_not_a_gate_that_never_runs -v`

Expected: FAIL — `core's plan omits tools/cockpit`.

- [ ] **Step 3: Create the packages**

The directories must exist before `lane-check.sh` will resolve them: the script filters its candidate list with `[ -e "$candidate" ]`, so a path that does not exist is silently dropped.

```bash
mkdir -p tools/cockpit/local tests/cockpit
```

`tools/cockpit/__init__.py`:

```python
"""The build cockpit — a developer tool, not a product surface.

Never imports `app` or anything under `web`. Its job is to report the truth when
those will not import, so it cannot depend on them. The only third-party import
permitted anywhere in this package is `yaml`.
"""

from __future__ import annotations

from pathlib import Path

# Resolved from __file__, never from the cwd: the server is started from a shell
# script that does not chdir, and every subprocess is launched with this as cwd.
ROOT = Path(__file__).resolve().parents[2]
```

`tools/cockpit/local/__init__.py`:

```python
"""Everything that can execute a command.

Kept in its own package so the phone surface's image can copy the shared modules
without copying this one. Absence, not configuration, is what makes the deployed
surface read-only.
"""
```

`tests/cockpit/__init__.py`: empty file.

- [ ] **Step 4: Wire the gate**

In `scripts/lane-check.sh`, the `core)` case:

```bash
  core)
    # §19's code is spread across routers/, integrations/ and workers/, none of which
    # follow the per-vertical convention. Listed explicitly rather than by widening to
    # all of app/routers: a lane's own router belongs to that lane's check, not to
    # core's. tools/cockpit is here for the same reason — it is outside app/ entirely,
    # so nothing else would ever reach it.
    py_candidates=(app/core app/models app/services app/routers/dev.py app/integrations app/workers tools/cockpit)
    test_candidates=(tests/core tests/config tests/dev tests/cockpit)
    ;;
```

In `pyproject.toml`:

```toml
[tool.ruff]
line-length = 100
target-version = "py314"
src = ["app", "scripts", "tests", "tools"]

[tool.mypy]
python_version = "3.14"
strict = true
files = ["app", "scripts", "tools"]
plugins = ["pydantic.mypy"]
```

In `scripts/ci-local.sh`, the two ruff lines:

```bash
.venv/bin/ruff check app scripts tests tools
.venv/bin/ruff format --check app scripts tests tools
```

In `.gitignore`, under `# Python`:

```
tools/cockpit/local/runs/
```

- [ ] **Step 5: Run the test and the gate**

Run: `.venv/bin/pytest tests/config/test_lane_check.py -v && ./scripts/lane-check.sh core --dry-run`

Expected: PASS, and the dry-run plan names `tools/cockpit` and `tests/cockpit`.

- [ ] **Step 6: Commit**

```bash
git add tools/cockpit tests/cockpit tests/config/test_lane_check.py scripts/lane-check.sh scripts/ci-local.sh pyproject.toml .gitignore
git commit -m "build(cockpit): gate tools/ before there is anything in it to gate"
```

---

### Task 2: `state.py` — the schema, the loader and the writer

**Files:**
- Create: `tools/cockpit/state.py`
- Test: `tests/cockpit/test_state.py`

**Interfaces:**
- Consumes: `tools.cockpit.ROOT`.
- Produces:
  - `class StateError(ValueError)`
  - `@dataclass(frozen=True) Item: title: str; status: str`
  - `@dataclass(frozen=True) Piece: id: str; title: str; status: str; on: date | None; opened: date | None; items: tuple[Item, ...]`
  - `@dataclass(frozen=True) Wave: id: str; milestone: str; title: str; mode: str; lanes: tuple[str, ...]; exit_gate: str; status: str; opened: date | None; pieces: tuple[Piece, ...]`
  - `@dataclass(frozen=True) Holdback: id: str; kind: str; title: str; why: str; blocks: str; status: str; opened: date | None; closed: date | None; source: str | None`
  - `@dataclass(frozen=True) State: version: int; updated: date; waves: tuple[Wave, ...]; holdbacks: tuple[Holdback, ...]`
  - `STATUSES: frozenset[str]` = `{"pending", "active", "shipped"}`
  - `ITEM_STATUSES: frozenset[str]` = `{"pending", "shipped"}`
  - `KINDS: frozenset[str]` = `{"external", "conflict", "carried"}`
  - `HOLDBACK_STATUSES: frozenset[str]` = `{"open", "closed"}`
  - `DEFAULT_PATH: Path` = `ROOT / "docs/plan/state.yaml"`
  - `load(path: Path = DEFAULT_PATH) -> State`
  - `dump(state: State, path: Path = DEFAULT_PATH) -> None`

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_state.py`:

```python
"""state.yaml is the only thing in the cockpit a human writes by hand, so a parse
that guesses is worse than one that refuses."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from tools.cockpit import state as st

GOOD = """\
version: 1
updated: 2026-08-25
waves:
  - id: W0
    milestone: M0
    title: Foundations
    mode: sequential
    lanes: []
    exit_gate: lane-check core green
    status: active
    opened: 2026-08-24
    pieces:
      - id: M0.4
        title: The demo studio and the dev bar
        status: shipped
        on: 2026-08-24
        items:
          - {title: /dev router, status: shipped}
          - {title: Role switcher, status: pending}
holdbacks:
  - id: HB-upay
    kind: external
    title: uPay merchant account not confirmed live
    why: Third-party turnaround is not yours to control.
    blocks: W4
    status: open
    opened: 2026-08-24
    closed: null
    source: SPEC §15 item 2
"""


def _write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "state.yaml"
    path.write_text(text, encoding="utf-8")
    return path


def test_it_loads_a_well_formed_file(tmp_path):
    loaded = st.load(_write(tmp_path, GOOD))
    assert loaded.version == 1
    assert loaded.updated == date(2026, 8, 25)
    assert loaded.waves[0].id == "W0"
    assert loaded.waves[0].pieces[0].items[1].title == "Role switcher"
    assert loaded.holdbacks[0].kind == "external"
    assert loaded.holdbacks[0].closed is None


def test_an_unknown_piece_status_is_refused_rather_than_guessed(tmp_path):
    bad = GOOD.replace("status: shipped\n        on:", "status: done\n        on:")
    with pytest.raises(st.StateError, match="done"):
        st.load(_write(tmp_path, bad))


def test_an_unknown_holdback_kind_is_refused(tmp_path):
    bad = GOOD.replace("kind: external", "kind: blocker")
    with pytest.raises(st.StateError, match="blocker"):
        st.load(_write(tmp_path, bad))


def test_a_holdback_without_a_why_is_refused(tmp_path):
    """C8 — there are no comments in this file, so `why` is the only place the reason
    can live. A holdback with no reason is a holdback nobody will action."""
    bad = GOOD.replace("    why: Third-party turnaround is not yours to control.\n", "")
    with pytest.raises(st.StateError, match="why"):
        st.load(_write(tmp_path, bad))


def test_round_trip_preserves_key_order_and_unicode(tmp_path):
    """A machine write must produce a reviewable diff, not a reordered file."""
    path = _write(tmp_path, GOOD)
    st.dump(st.load(path), path)
    written = path.read_text(encoding="utf-8")
    assert "SPEC §15 item 2" in written, "allow_unicode=False would mangle the section sign"
    assert written.index("version:") < written.index("updated:") < written.index("waves:")
    assert written.index("id: W0") < written.index("milestone: M0")


def test_round_trip_is_value_stable(tmp_path):
    path = _write(tmp_path, GOOD)
    once = st.load(path)
    st.dump(once, path)
    assert st.load(path) == once


def test_the_writer_stamps_a_header_saying_it_is_machine_written(tmp_path):
    path = _write(tmp_path, GOOD)
    st.dump(st.load(path), path)
    assert path.read_text(encoding="utf-8").startswith("#")
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_state.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.cockpit.state'`.

- [ ] **Step 3: Implement**

`tools/cockpit/state.py`:

```python
"""The schema for docs/plan/state.yaml, and the only code that reads or writes it.

Dataclasses rather than pydantic: pydantic is a project dependency, and this package
may not import one (C3). Frozen, because every consumer is a pure function over a
snapshot and nothing should be mutating a parsed file in place.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from tools.cockpit import ROOT

DEFAULT_PATH = ROOT / "docs/plan/state.yaml"

STATUSES = frozenset({"pending", "active", "shipped"})
ITEM_STATUSES = frozenset({"pending", "shipped"})
KINDS = frozenset({"external", "conflict", "carried"})
HOLDBACK_STATUSES = frozenset({"open", "closed"})

_HEADER = (
    "# Machine-written. The cockpit rewrites this file, and PyYAML does not preserve\n"
    "# comments across a round-trip, so every explanation belongs in a `why:` or\n"
    "# `source:` field rather than in a comment that would silently disappear.\n"
)


class StateError(ValueError):
    """A state file that cannot be trusted. Raised instead of guessing."""


@dataclass(frozen=True)
class Item:
    title: str
    status: str


@dataclass(frozen=True)
class Piece:
    id: str
    title: str
    status: str
    on: date | None = None
    opened: date | None = None
    items: tuple[Item, ...] = ()


@dataclass(frozen=True)
class Wave:
    id: str
    milestone: str
    title: str
    mode: str
    exit_gate: str
    status: str
    lanes: tuple[str, ...] = ()
    opened: date | None = None
    pieces: tuple[Piece, ...] = ()


@dataclass(frozen=True)
class Holdback:
    id: str
    kind: str
    title: str
    why: str
    blocks: str
    status: str
    opened: date | None = None
    closed: date | None = None
    source: str | None = None


@dataclass(frozen=True)
class State:
    version: int
    updated: date
    waves: tuple[Wave, ...]
    holdbacks: tuple[Holdback, ...]


def _require(mapping: dict[str, Any], key: str, where: str) -> Any:
    if key not in mapping or mapping[key] is None:
        raise StateError(f"{where}: missing required field {key!r}")
    return mapping[key]


def _one_of(value: Any, allowed: frozenset[str], field: str, where: str) -> str:
    if value not in allowed:
        raise StateError(
            f"{where}: {field}={value!r} is not one of {sorted(allowed)}"
        )
    return str(value)


def _date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    raise StateError(f"expected a date, got {value!r}")


def load(path: Path = DEFAULT_PATH) -> State:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise StateError(f"{path}: expected a mapping at the top level")

    waves: list[Wave] = []
    for wave_raw in raw.get("waves") or []:
        where = f"wave {wave_raw.get('id', '?')}"
        pieces: list[Piece] = []
        for piece_raw in wave_raw.get("pieces") or []:
            pwhere = f"{where} piece {piece_raw.get('id', '?')}"
            items = tuple(
                Item(
                    title=str(_require(item, "title", pwhere)),
                    status=_one_of(item.get("status"), ITEM_STATUSES, "status", pwhere),
                )
                for item in piece_raw.get("items") or []
            )
            pieces.append(
                Piece(
                    id=str(_require(piece_raw, "id", pwhere)),
                    title=str(_require(piece_raw, "title", pwhere)),
                    status=_one_of(piece_raw.get("status"), STATUSES, "status", pwhere),
                    on=_date(piece_raw.get("on")),
                    opened=_date(piece_raw.get("opened")),
                    items=items,
                )
            )
        waves.append(
            Wave(
                id=str(_require(wave_raw, "id", where)),
                milestone=str(_require(wave_raw, "milestone", where)),
                title=str(_require(wave_raw, "title", where)),
                mode=_one_of(wave_raw.get("mode"), frozenset({"sequential", "parallel"}), "mode", where),
                exit_gate=str(_require(wave_raw, "exit_gate", where)),
                status=_one_of(wave_raw.get("status"), STATUSES, "status", where),
                lanes=tuple(str(lane) for lane in wave_raw.get("lanes") or []),
                opened=_date(wave_raw.get("opened")),
                pieces=tuple(pieces),
            )
        )

    holdbacks: list[Holdback] = []
    for hb in raw.get("holdbacks") or []:
        where = f"holdback {hb.get('id', '?')}"
        holdbacks.append(
            Holdback(
                id=str(_require(hb, "id", where)),
                kind=_one_of(hb.get("kind"), KINDS, "kind", where),
                title=str(_require(hb, "title", where)),
                why=str(_require(hb, "why", where)),
                blocks=str(_require(hb, "blocks", where)),
                status=_one_of(hb.get("status"), HOLDBACK_STATUSES, "status", where),
                opened=_date(hb.get("opened")),
                closed=_date(hb.get("closed")),
                source=None if hb.get("source") is None else str(hb["source"]),
            )
        )

    updated = _date(_require(raw, "updated", str(path)))
    assert updated is not None  # _require rejects None, narrowing for mypy
    return State(
        version=int(_require(raw, "version", str(path))),
        updated=updated,
        waves=tuple(waves),
        holdbacks=tuple(holdbacks),
    )


def _piece_to_dict(piece: Piece) -> dict[str, Any]:
    out: dict[str, Any] = {"id": piece.id, "title": piece.title, "status": piece.status}
    if piece.on is not None:
        out["on"] = piece.on
    if piece.opened is not None:
        out["opened"] = piece.opened
    if piece.items:
        out["items"] = [{"title": i.title, "status": i.status} for i in piece.items]
    return out


def _to_dict(state: State) -> dict[str, Any]:
    return {
        "version": state.version,
        "updated": state.updated,
        "waves": [
            {
                "id": w.id,
                "milestone": w.milestone,
                "title": w.title,
                "mode": w.mode,
                "lanes": list(w.lanes),
                "exit_gate": w.exit_gate,
                "status": w.status,
                **({"opened": w.opened} if w.opened is not None else {}),
                "pieces": [_piece_to_dict(p) for p in w.pieces],
            }
            for w in state.waves
        ],
        "holdbacks": [
            {
                "id": h.id,
                "kind": h.kind,
                "title": h.title,
                "why": h.why,
                "blocks": h.blocks,
                "status": h.status,
                "opened": h.opened,
                "closed": h.closed,
                **({"source": h.source} if h.source is not None else {}),
            }
            for h in state.holdbacks
        ],
    }


def dump(state: State, path: Path = DEFAULT_PATH) -> None:
    body = yaml.safe_dump(
        _to_dict(state),
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
        width=100,
    )
    path.write_text(_HEADER + body, encoding="utf-8")
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/cockpit/test_state.py -v`

Expected: PASS, all seven.

- [ ] **Step 5: Typecheck and lint**

Run: `.venv/bin/mypy tools && .venv/bin/ruff check tools && .venv/bin/ruff format tools`

Expected: clean. `mypy --strict` is on; if `load()` complains about `Any` returns from `yaml.safe_load`, the `_require`/`_one_of` helpers are where the narrowing belongs — do not add `# type: ignore`.

- [ ] **Step 6: Commit**

```bash
git add tools/cockpit/state.py tests/cockpit/test_state.py
git commit -m "feat(cockpit): the state schema, and a loader that refuses rather than guesses"
```

---

### Task 3: `derive.py` — progress, grouping and staleness

**Files:**
- Create: `tools/cockpit/derive.py`
- Test: `tests/cockpit/test_derive.py`

**Interfaces:**
- Consumes: `tools.cockpit.state.{State, Wave, Piece, Holdback}`.
- Produces:
  - `@dataclass(frozen=True) Progress: done: int; total: int` with property `fraction: float` (0.0 when `total == 0`)
  - `piece_progress(piece: Piece) -> Progress`
  - `wave_progress(wave: Wave) -> Progress`
  - `active_wave(state: State) -> Wave | None`
  - `active_piece(wave: Wave) -> Piece | None`
  - `group_holdbacks(state: State) -> dict[str, tuple[Holdback, ...]]` — keys are `state.KINDS`, open only, insertion-ordered `external, conflict, carried`
  - `@dataclass(frozen=True) Staleness: commits_behind: int; is_stale: bool`
  - `staleness(state: State, commits_since_update: int) -> Staleness`

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_derive.py`:

```python
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


def _holdback(hid: str, kind: str, status: str) -> Holdback:
    return Holdback(
        id=hid, kind=kind, title=hid, why="because", blocks="W4", status=status
    )


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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_derive.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.cockpit.derive'`.

- [ ] **Step 3: Implement**

`tools/cockpit/derive.py`:

```python
"""Pure functions over a parsed State. No I/O, no clock, no network.

Kept separate from state.py so that every number the surfaces render can be tested
without a file on disk, and so the phone surface in plan 2 gets the same arithmetic
rather than its own copy of it.
"""

from __future__ import annotations

from dataclasses import dataclass

from tools.cockpit.state import Holdback, Piece, State, Wave

# Order is display order, most-actionable first: something a third party owes you
# outranks a contradiction in your own docs, which outranks debt you chose.
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
    """None when every piece has shipped — which is not the same as the wave being
    done. A wave stays active until its exit gate passes, and M0's needs hardware."""
    return next((piece for piece in wave.pieces if piece.status == "active"), None)


def group_holdbacks(state: State) -> dict[str, tuple[Holdback, ...]]:
    return {
        kind: tuple(h for h in state.holdbacks if h.status == "open" and h.kind == kind)
        for kind in KIND_ORDER
    }


def staleness(state: State, commits_since_update: int) -> Staleness:
    """`state` is accepted but unused today; it is the parameter that will carry the
    comparison when `updated` grows a time component. Keeping the signature stable now
    saves changing every caller then."""
    _ = state
    return Staleness(commits_behind=commits_since_update, is_stale=commits_since_update > 0)
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/cockpit/test_derive.py -v`

Expected: PASS, all nine.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
.venv/bin/mypy tools && .venv/bin/ruff check tools && .venv/bin/ruff format tools
git add tools/cockpit/derive.py tests/cockpit/test_derive.py
git commit -m "feat(cockpit): the derivations, so no count is ever stored"
```

---

### Task 4: `docs/plan/state.yaml` — the transcription

Data, not code — but it is the file everything else displays, and a wrong transcription is indistinguishable from a bug. It gets tests.

**Files:**
- Create: `docs/plan/state.yaml`
- Test: `tests/cockpit/test_state_file.py`

**Interfaces:**
- Consumes: `tools.cockpit.state.load`, `tools.cockpit.derive`.
- Produces: the real `State` every surface renders.

**Sources to transcribe from** — read all of these before writing:
- `docs/plan/milestone-plan.md` Part 2 §2.1 (the eight waves and their exit gates)
- `docs/plan/next-session.md` (M0.1–M0.4 status, and the four obligations M0.4 hands M1)
- `docs/plan/milestone-plan.md` Part 5 (conflicts C1–C9 and which remain open)
- `SPEC.md` §15 (the external prerequisites)
- `docs/deploy/railway-runbook.md` §"Open item" (the staging superuser)
- `docs/install/verification-log.md` (why M0's exit gate is not met)

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_state_file.py`:

```python
"""The real file, asserted against facts that are independently checkable elsewhere
in the repo. These are not schema tests — task 2 covers the schema. These catch a
transcription that parses cleanly and says something false."""

from __future__ import annotations

from tools.cockpit import derive
from tools.cockpit.state import DEFAULT_PATH, load


def test_the_real_file_parses():
    assert load().version == 1


def test_every_wave_in_the_milestone_plan_is_present():
    ids = [w.id for w in load().waves]
    assert ids == ["W0", "W1", "W2", "W3", "W4", "W5", "W6", "W7"]


def test_m0_is_active_not_shipped_because_its_exit_gate_needs_hardware():
    """docs/install/verification-log.md: the iOS simulator proved the rendering half
    and none of the install half, and the Android emulator was never run. Marking M0
    shipped because its code is complete would be the first lie in the system."""
    state = load()
    w0 = next(w for w in state.waves if w.id == "W0")
    assert w0.status == "active"
    assert all(p.status == "shipped" for p in w0.pieces), "all four M0 pieces did ship"
    assert derive.active_piece(w0) is None


def test_every_open_holdback_explains_itself_and_names_what_it_blocks():
    for holdback in load().holdbacks:
        if holdback.status == "open":
            assert holdback.why.strip(), holdback.id
            assert holdback.blocks.strip(), holdback.id


def test_the_known_external_prerequisites_are_recorded():
    ids = {h.id for h in load().holdbacks}
    assert {"HB-upay", "HB-devices", "HB-domain", "HB-parents"} <= ids


def test_the_staging_superuser_debt_is_carried_not_external():
    """It is ours to fix and M1 closes it — filing it as external would park it."""
    debt = next(h for h in load().holdbacks if h.id == "HB-staging-superuser")
    assert debt.kind == "carried"
    assert debt.blocks == "M1"


def test_nothing_measurable_is_declared():
    """C9 — a status the cockpit can compute must never be written down."""
    text = DEFAULT_PATH.read_text(encoding="utf-8")
    for forbidden in ("tests_passing", "ci_status", "gates:", "env_health", "branch:"):
        assert forbidden not in text, f"{forbidden} is measurable and must not be declared"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_state_file.py -v`

Expected: FAIL — `FileNotFoundError: docs/plan/state.yaml`.

- [ ] **Step 3: Write the file**

`docs/plan/state.yaml` — the eight waves, M0 expanded. Transcribe the remaining waves' `exit_gate` verbatim from `milestone-plan.md` §2.1's table; the four shown below are exact.

```yaml
# Machine-written. The cockpit rewrites this file, and PyYAML does not preserve
# comments across a round-trip, so every explanation belongs in a `why:` or
# `source:` field rather than in a comment that would silently disappear.
version: 1
updated: 2026-08-25
waves:
  - id: W0
    milestone: M0
    title: Foundations
    mode: sequential
    lanes: []
    exit_gate: lane-check.sh core green · all three apps install to a home screen and run standalone
    status: active
    opened: 2026-08-24
    pieces:
      - id: M0.1
        title: Corrections, skeleton, install layer
        status: shipped
        on: 2026-08-24
      - id: M0.2
        title: The seams and the core
        status: shipped
        on: 2026-08-24
      - id: M0.3
        title: The design system
        status: shipped
        on: 2026-08-24
      - id: M0.4
        title: The demo studio and the dev bar
        status: shipped
        on: 2026-08-24
  - id: W1
    milestone: M1
    title: Identity and structure
    mode: sequential
    lanes: []
    exit_gate: both apps sign in, refuse correctly, and route to the wizard
    status: pending
    pieces: []
  - id: W2
    milestone: M2 ∥ M3
    title: Schedule and People
    mode: parallel
    lanes: [SCHEDULE, PEOPLE]
    exit_gate: E2E-5 schedule change · E2E-1a registration to active
    status: pending
    pieces: []
holdbacks:
  - id: HB-devices
    kind: external
    title: One iPhone and one Android to test on
    why: >-
      M0's exit gate is that all three apps install to a home screen and launch
      standalone. The iOS simulator proved the rendering half and none of the install
      half, and the Android emulator was never run — the only installed system image
      has no Play services. This is what keeps W0 open with every piece shipped.
    blocks: M0 exit
    status: open
    opened: 2026-08-24
    closed: null
    source: SPEC §15 item 4
  - id: HB-upay
    kind: external
    title: uPay merchant account not confirmed live
    why: Third-party turnaround is not yours to control, and the whole money lane sits behind it.
    blocks: W4
    status: open
    opened: 2026-08-24
    closed: null
    source: SPEC §15 item 2
  - id: HB-domain
    kind: external
    title: A stable HTTPS domain for the apps
    why: >-
      People install this from an invitation link. A random Railway subdomain reads as
      a phishing attempt and hurts install conversion, which is the product's main
      adoption risk. infra/railway/domains.json still has base_domain null.
    blocks: M0 exit
    status: open
    opened: 2026-08-24
    closed: null
    source: SPEC §15 item 5
  - id: HB-parents
    kind: external
    title: Three to five real parents for the install walkthrough
    why: >-
      Their confusion is the only honest measure of whether the walkthrough works.
      Your own phone will not tell you.
    blocks: M11
    status: open
    opened: 2026-08-24
    closed: null
    source: SPEC §15 item 6
  - id: HB-staging-superuser
    kind: carried
    title: The staging api still connects as the superuser
    why: >-
      Railway's managed Postgres provides one role. Revision 0001 creates studio_app,
      but both DSNs point at the same superuser, so the append-only audit grant is not
      actually in force on staging. M1 closes it with a login password from a secret.
    blocks: M1
    status: open
    opened: 2026-08-24
    closed: null
    source: docs/deploy/railway-runbook.md
  - id: HB-c9-canvas
    kind: conflict
    title: C9 — the D9 canvas edits are recorded but not applied
    why: >-
      2b still shows in-app chat, 7c still shows the weight column, 12f is still titled
      קבלות ותשלומים. The mockup is what a human opens at 2am, not a table in a plan.
    blocks: W6
    status: open
    opened: 2026-08-24
    closed: null
    source: docs/plan/milestone-plan.md Part 5
```

Then add `W3` through `W7` in the same shape, and the four M1 obligations from `next-session.md` as `kind: carried` holdbacks blocking `M1`.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/cockpit/test_state_file.py -v`

Expected: PASS, all seven. `test_every_wave_in_the_milestone_plan_is_present` fails until W3–W7 are added — that is the test doing its job.

- [ ] **Step 5: Commit**

```bash
git add docs/plan/state.yaml tests/cockpit/test_state_file.py
git commit -m "docs(plan): state.yaml — the plan as data, with M0 honestly unfinished"
```

---

### Task 5: `envs.py` — health probes that degrade honestly

**Files:**
- Create: `tools/cockpit/envs.py`
- Test: `tests/cockpit/test_envs.py`

**Interfaces:**
- Consumes: `tools.cockpit.ROOT`.
- Produces:
  - `@dataclass(frozen=True) EnvStatus: name: str; state: str; revision: str | None; started_at: str | None; detail: str | None`
  - `STATES: frozenset[str]` = `{"up", "down", "unknown", "not_deployed", "local"}`
  - `targets(domains_json: dict) -> dict[str, str]` — env name to api URL
  - `classify(name, url, fetch, *, is_remote: bool) -> EnvStatus`
  - `probe_all(targets, fetch, *, is_remote=False, timeout=2.0) -> tuple[EnvStatus, ...]`
  - `fetch_json(url: str, timeout: float) -> dict` — the real `urllib` fetcher, injected in production and replaced in tests

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_envs.py`:

```python
"""Every failure here must produce a distinct, honest state. The one thing this must
never do is render a red dot for something it simply cannot see."""

from __future__ import annotations

import socket

import pytest
from tools.cockpit import envs

DOMAINS = {
    "environments": {
        "development": {"api": "http://localhost:8000"},
        "staging": {"api": "https://api-staging-1e4d.up.railway.app"},
        "production": {"api": "https://PENDING-production-services"},
    }
}


def test_targets_reads_the_one_place_hostnames_are_written():
    assert envs.targets(DOMAINS)["staging"].startswith("https://api-staging")


def test_a_healthy_endpoint_reports_up_with_its_revision():
    def fetch(url, timeout):
        return {"status": "ok", "env": "staging", "revision": "0003", "started_at": "2026-08-25T05:11:00Z"}

    result = envs.classify("staging", DOMAINS["environments"]["staging"]["api"], fetch, is_remote=True)
    assert result.state == "up"
    assert result.revision == "0003"


def test_a_placeholder_host_is_not_deployed_never_an_error():
    def fetch(url, timeout):
        raise AssertionError("must not be called for a placeholder host")

    result = envs.classify("production", "https://PENDING-production-services", fetch, is_remote=True)
    assert result.state == "not_deployed"


def test_localhost_from_a_remote_surface_is_local_not_down():
    """The phone genuinely cannot see localhost:8000. A red dot would be a lie about
    the environment rather than a fact about the observer."""
    def fetch(url, timeout):
        raise AssertionError("must not be called for localhost from a remote surface")

    result = envs.classify("development", "http://localhost:8000", fetch, is_remote=True)
    assert result.state == "local"


def test_localhost_from_the_laptop_is_probed_normally():
    def fetch(url, timeout):
        return {"status": "ok", "env": "development", "revision": "0003", "started_at": None}

    result = envs.classify("development", "http://localhost:8000", fetch, is_remote=False)
    assert result.state == "up"


def test_a_timeout_is_unknown_not_down():
    def fetch(url, timeout):
        raise TimeoutError("timed out")

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "unknown"


def test_a_refused_connection_is_down():
    def fetch(url, timeout):
        raise ConnectionRefusedError("refused")

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "down"


def test_a_non_json_body_is_down_with_a_detail_rather_than_a_crash():
    def fetch(url, timeout):
        raise ValueError("Expecting value: line 1 column 1")

    result = envs.classify("staging", "https://x", fetch, is_remote=True)
    assert result.state == "down"
    assert result.detail is not None


def test_a_dns_failure_is_unknown():
    def fetch(url, timeout):
        raise socket.gaierror("nodename nor servname provided")

    assert envs.classify("staging", "https://x", fetch, is_remote=True).state == "unknown"


def test_probe_all_never_raises_even_when_every_target_fails():
    def fetch(url, timeout):
        raise TimeoutError()

    results = envs.probe_all(envs.targets(DOMAINS), fetch, is_remote=True)
    assert {r.name for r in results} == {"development", "staging", "production"}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_envs.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.cockpit.envs'`.

- [ ] **Step 3: Implement**

`tools/cockpit/envs.py`:

```python
"""Health probes over the three environments.

The fetcher is injected rather than imported so the classification logic is testable
without a network, a stub server or a sleep. `fetch_json` is the only part that
touches urllib, and it has no branching worth testing.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

STATES = frozenset({"up", "down", "unknown", "not_deployed", "local"})

# infra/railway/domains.json writes this literal for services that do not exist yet.
_PLACEHOLDER = "PENDING"

Fetcher = Callable[[str, float], dict[str, Any]]


@dataclass(frozen=True)
class EnvStatus:
    name: str
    state: str
    revision: str | None = None
    started_at: str | None = None
    detail: str | None = None


def targets(domains_json: dict[str, Any]) -> dict[str, str]:
    return {
        name: str(conf["api"])
        for name, conf in domains_json.get("environments", {}).items()
    }


def fetch_json(url: str, timeout: float) -> dict[str, Any]:
    with urllib.request.urlopen(f"{url}/api/v1/health", timeout=timeout) as response:
        body: dict[str, Any] = json.loads(response.read().decode("utf-8"))
    return body


def _is_local(url: str) -> bool:
    return "localhost" in url or "127.0.0.1" in url


def classify(name: str, url: str, fetch: Fetcher, *, is_remote: bool, timeout: float = 2.0) -> EnvStatus:
    if _PLACEHOLDER in url:
        return EnvStatus(name=name, state="not_deployed", detail="no service configured")
    if is_remote and _is_local(url):
        # Not a fact about the environment — a fact about who is looking. Rendering
        # this as down would be the observer's limitation dressed up as an outage.
        return EnvStatus(name=name, state="local", detail="not reachable from here")
    try:
        body = fetch(url, timeout)
    except (TimeoutError, socket.timeout, socket.gaierror, urllib.error.URLError) as exc:
        # Could not reach it. That is not the same as it being down, and saying "down"
        # would send you debugging an environment that is fine.
        return EnvStatus(name=name, state="unknown", detail=str(exc))
    except ConnectionRefusedError as exc:
        return EnvStatus(name=name, state="down", detail=str(exc))
    except (ValueError, KeyError) as exc:
        return EnvStatus(name=name, state="down", detail=f"unreadable response: {exc}")
    return EnvStatus(
        name=name,
        state="up" if body.get("status") == "ok" else "down",
        revision=None if body.get("revision") is None else str(body["revision"]),
        started_at=None if body.get("started_at") is None else str(body["started_at"]),
    )


def probe_all(
    target_map: dict[str, str], fetch: Fetcher, *, is_remote: bool = False, timeout: float = 2.0
) -> tuple[EnvStatus, ...]:
    with ThreadPoolExecutor(max_workers=max(1, len(target_map))) as pool:
        futures = [
            pool.submit(classify, name, url, fetch, is_remote=is_remote, timeout=timeout)
            for name, url in target_map.items()
        ]
        return tuple(future.result() for future in futures)
```

Note the ordering trap: `ConnectionRefusedError` is a subclass of `OSError`, and `urllib.error.URLError` is too — but neither is a subclass of the other, so the `except` order above is correct. If a refused connection starts reporting `unknown`, it is because urllib wrapped it in a `URLError`; unwrap `exc.reason` rather than reordering the clauses.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/cockpit/test_envs.py -v`

Expected: PASS, all eleven.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
.venv/bin/mypy tools && .venv/bin/ruff check tools && .venv/bin/ruff format tools
git add tools/cockpit/envs.py tests/cockpit/test_envs.py
git commit -m "feat(cockpit): env probes that tell unknown and down apart"
```

---

### Task 6: `health.py` — revision and start time, without becoming a readiness check

The only product code this plan touches. It is a change to shipped code and gets the same rigour as any other.

**The trap:** `read_health`'s docstring says *Liveness*. Reading the alembic revision means touching the database — and if that failure propagated, a database blip would make `/api/v1/health` fail, every environment would go red in the cockpit, and any uptime monitor pointed at this endpoint would page. `revision` is therefore **best-effort**: it is `None` when the database cannot be read, and `status` stays `"ok"`.

**Files:**
- Modify: `app/routers/health.py`
- Test: `tests/test_health.py`

**Interfaces:**
- Consumes: `app.core.config.settings`.
- Produces: `HealthResponse` with `status: str`, `env: Env`, `revision: str | None`, `started_at: datetime`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_health.py`:

```python
from datetime import datetime

import app.routers.health as health_module


def test_health_reports_the_migration_revision_and_start_time():
    body = client.get("/api/v1/health").json()
    assert "revision" in body
    assert datetime.fromisoformat(body["started_at"]).tzinfo is not None


def test_started_at_is_the_process_start_not_the_request_time():
    first = client.get("/api/v1/health").json()["started_at"]
    second = client.get("/api/v1/health").json()["started_at"]
    assert first == second


def test_an_unreadable_database_yields_a_null_revision_and_still_reports_ok(monkeypatch):
    """This endpoint is liveness. If a database blip could turn it red, every uptime
    monitor pointed at it would page for something that is not an outage."""
    def boom() -> str | None:
        raise RuntimeError("connection refused")

    monkeypatch.setattr(health_module, "_read_revision", boom)
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["revision"] is None
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/test_health.py -v`

Expected: FAIL — `KeyError: 'revision'` / `AttributeError: _read_revision`.

- [ ] **Step 3: Implement**

`app/routers/health.py`:

```python
from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import create_engine, text

from app.core.config import Env, settings

router = APIRouter(tags=["health"])

# Module import time is process start closely enough, and unlike a lifespan hook it
# still works when the app is mounted by a test client.
_STARTED_AT = datetime.now(UTC)


class HealthResponse(BaseModel):
    status: str
    env: Env
    revision: str | None
    started_at: datetime


def _read_revision() -> str | None:
    """The revision the *database* is at, not the one this image ships.

    Reading it from the filesystem would report what was deployed rather than what
    was applied, which is the exact drift this field exists to surface.
    """
    engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 2})
    try:
        with engine.connect() as connection:
            row = connection.execute(text("SELECT version_num FROM alembic_version")).first()
        return None if row is None else str(row[0])
    finally:
        engine.dispose()


@router.get("/health", response_model=HealthResponse)
def read_health() -> HealthResponse:
    """Liveness. Deliberately carries no tenant data and needs no auth.

    `revision` is best-effort and never affects `status`: this endpoint answers "is
    this process alive", and a database it cannot reach does not make it dead.
    """
    try:
        revision = _read_revision()
    except Exception:  # noqa: BLE001 -- liveness must not depend on the database
        revision = None
    return HealthResponse(
        status="ok", env=settings.ENV, revision=revision, started_at=_STARTED_AT
    )
```

- [ ] **Step 4: Run the tests, then regenerate the API client**

The response schema changed, so the committed generated client is now stale — `ci-local.sh` fails on an uncommitted generated diff (SPEC §8.2).

```bash
.venv/bin/pytest tests/test_health.py -v
.venv/bin/python scripts/export_openapi.py
(cd web && npx openapi-typescript ../openapi.json -o packages/api-client/src/schema.d.ts)
```

Expected: tests PASS; `openapi.json` and `schema.d.ts` both show `revision` and `started_at`.

- [ ] **Step 5: Commit**

```bash
git add app/routers/health.py tests/test_health.py openapi.json web/packages/api-client/src/schema.d.ts
git commit -m "feat(api): health reports the database's revision, best-effort"
```

---

### Task 7: `local/commands.py` — the allowlist

The load-bearing security boundary. Every other safety property in the laptop surface assumes this table cannot be escaped.

**Files:**
- Create: `tools/cockpit/local/commands.py`
- Test: `tests/cockpit/test_commands.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class CommandError(ValueError)`
  - `@dataclass(frozen=True) Command: id: str; argv: tuple[str, ...]; takes_vertical: bool; cwd: str; compose: bool; confirm: bool; label: str`
  - `COMMANDS: dict[str, Command]`
  - `VERTICALS: tuple[str, ...]`
  - `resolve(command_id: str, vertical: str | None = None) -> tuple[str, ...]`
  - `env_for(command_id: str) -> dict[str, str]`
  - `cwd_for(command_id: str) -> str`

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_commands.py`:

```python
"""If this table can be escaped, every other safety property of the laptop surface
is decoration. These tests are the boundary."""

from __future__ import annotations

import pytest
from tools.cockpit.local import commands


def test_the_verticals_are_the_ones_lane_check_is_actually_invoked_with():
    """Taken from lane-check.sh invocations in the milestone plan, not from milestone
    names. M6's lane is called MONEY but its vertical is `billing`, and M1 checks as
    two verticals, not one."""
    assert "billing" in commands.VERTICALS
    assert "money" not in commands.VERTICALS
    assert {"identity", "structure"} <= set(commands.VERTICALS)


def test_a_known_command_resolves_to_an_argv_list():
    assert commands.resolve("pytest") == (".venv/bin/pytest", "-q")


def test_lane_check_takes_a_vertical():
    assert commands.resolve("lane-check", "core") == ("./scripts/lane-check.sh", "core")


def test_an_unknown_command_id_is_refused():
    with pytest.raises(commands.CommandError, match="unknown command"):
        commands.resolve("rm-rf")


def test_a_vertical_outside_the_enum_is_refused():
    with pytest.raises(commands.CommandError, match="not a known vertical"):
        commands.resolve("lane-check", "../../etc")


@pytest.mark.parametrize(
    "hostile",
    ["core; rm -rf /", "core && whoami", "core|sh", "core$(id)", "core `id`",
     "../core", "core/../..", "core core", "core\n", ""],
)
def test_hostile_verticals_are_refused(hostile):
    with pytest.raises(commands.CommandError):
        commands.resolve("lane-check", hostile)


def test_a_vertical_passed_to_a_command_that_takes_none_is_refused():
    with pytest.raises(commands.CommandError, match="takes no argument"):
        commands.resolve("ci-local", "core")


def test_lane_check_without_a_vertical_is_refused():
    with pytest.raises(commands.CommandError, match="requires a vertical"):
        commands.resolve("lane-check")


def test_alembic_downgrade_is_unreachable_through_any_input():
    """It is on .claude/settings.json's deny list. It must not re-enter here."""
    for command in commands.COMMANDS.values():
        assert "downgrade" not in " ".join(command.argv)
    for candidate in ("alembic-downgrade", "downgrade", "alembic_downgrade"):
        with pytest.raises(commands.CommandError):
            commands.resolve(candidate)


def test_every_compose_command_carries_the_project_name():
    """M0.4's retrospective: docker-compose.yml pins container_name, so compose from a
    second worktree creates a new project with an empty volume and then claims the
    running container. Without this, db-reset can wipe a volume nothing is using."""
    for command_id in ("db-up", "db-reset", "ci-local"):
        assert commands.env_for(command_id)["COMPOSE_PROJECT_NAME"] == "studio-manager"


def test_a_non_compose_command_does_not_set_the_project_name():
    assert "COMPOSE_PROJECT_NAME" not in commands.env_for("pytest")


def test_only_db_reset_requires_confirmation():
    confirming = {cid for cid, c in commands.COMMANDS.items() if c.confirm}
    assert confirming == {"db-reset"}


def test_the_frontend_command_runs_from_inside_the_web_workspace():
    """npx from the repo root downloads a fresh toolchain and reads none of web/'s
    config — measured in M0.1 and recorded in lane-check.sh's header."""
    assert commands.cwd_for("typecheck-web") == "web"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_commands.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'tools.cockpit.local.commands'`.

- [ ] **Step 3: Implement**

`tools/cockpit/local/commands.py`:

```python
"""The allowlist, as data.

There is no free-text path into a subprocess anywhere in this tool. A caller names an
entry in this table and optionally a vertical from a closed enum; nothing else reaches
argv. `alembic downgrade` is absent by design — it is on .claude/settings.json's deny
list and must not re-enter the project through a button.
"""

from __future__ import annotations

from dataclasses import dataclass

# Every value taken from an actual `lane-check.sh <vertical>` invocation in
# docs/plan/milestone-plan.md, not inferred from milestone names.
VERTICALS = (
    "core", "identity", "structure", "schedule", "people", "health",
    "attendance", "billing", "events", "belts", "comms", "reports", "privacy",
)


class CommandError(ValueError):
    """A request that does not name an allowlisted command and a legal argument."""


@dataclass(frozen=True)
class Command:
    id: str
    argv: tuple[str, ...]
    label: str
    takes_vertical: bool = False
    cwd: str = "."
    compose: bool = False
    confirm: bool = False


_ALL = (
    Command("lane-check", ("./scripts/lane-check.sh",), "lane-check", takes_vertical=True),
    Command("ci-local", ("./scripts/ci-local.sh",), "ci-local", compose=True),
    Command("pytest", (".venv/bin/pytest", "-q"), "pytest"),
    Command("mypy", (".venv/bin/mypy", "app", "scripts", "tools"), "mypy"),
    Command("ruff", (".venv/bin/ruff", "check", "app", "scripts", "tests", "tools"), "ruff"),
    Command("typecheck-web", ("npm", "run", "typecheck"), "typecheck (web)", cwd="web"),
    Command("i18n-parity", ("node", "web/scripts/i18n-parity.mjs"), "i18n parity"),
    Command("db-up", ("./scripts/dev-db.sh", "up"), "db up", compose=True),
    Command("db-reset", ("./scripts/dev-db.sh", "reset"), "db reset", compose=True, confirm=True),
    Command("alembic-head", (".venv/bin/alembic", "upgrade", "head"), "alembic upgrade head"),
    Command("alembic-current", (".venv/bin/alembic", "current"), "alembic current"),
    Command("alembic-check", (".venv/bin/alembic", "check"), "alembic check"),
)

COMMANDS: dict[str, Command] = {command.id: command for command in _ALL}


def _get(command_id: str) -> Command:
    command = COMMANDS.get(command_id)
    if command is None:
        raise CommandError(f"unknown command {command_id!r}")
    return command


def resolve(command_id: str, vertical: str | None = None) -> tuple[str, ...]:
    command = _get(command_id)
    if not command.takes_vertical:
        if vertical is not None:
            raise CommandError(f"{command_id!r} takes no argument")
        return command.argv
    if vertical is None:
        raise CommandError(f"{command_id!r} requires a vertical")
    if vertical not in VERTICALS:
        raise CommandError(f"{vertical!r} is not a known vertical")
    return (*command.argv, vertical)


def env_for(command_id: str) -> dict[str, str]:
    """Extra environment for one command. Merged over os.environ by the runner.

    COMPOSE_PROJECT_NAME is not a nicety: docker-compose.yml pins container_name, so
    compose invoked without it from a second worktree creates a *new* project with an
    empty volume and then claims the running container.
    """
    return {"COMPOSE_PROJECT_NAME": "studio-manager"} if _get(command_id).compose else {}


def cwd_for(command_id: str) -> str:
    return _get(command_id).cwd
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/cockpit/test_commands.py -v`

Expected: PASS, including all ten parametrised hostile verticals.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
.venv/bin/mypy tools && .venv/bin/ruff check tools && .venv/bin/ruff format tools
git add tools/cockpit/local/commands.py tests/cockpit/test_commands.py
git commit -m "feat(cockpit): the allowlist, and the tests that are its whole security model"
```

---

### Task 8: `local/signals.py` — git state, run history, local head

**Files:**
- Create: `tools/cockpit/local/signals.py`
- Test: `tests/cockpit/test_signals.py`

**Interfaces:**
- Consumes: `tools.cockpit.ROOT`.
- Produces:
  - `@dataclass(frozen=True) GitState: branch: str; head: str; dirty: bool; worktrees: int`
  - `@dataclass(frozen=True) RunRecord: command_id: str; argv: tuple[str, ...]; exit_code: int; started: str; duration_s: float; output: str`
  - `RUNS_DIR: Path` = `ROOT / "tools/cockpit/local/runs"`
  - `parse_git_state(porcelain: str, branch: str, head: str, worktree_list: str) -> GitState`
  - `git_state() -> GitState`
  - `commits_since(when: date) -> int`
  - `save_run(record: RunRecord) -> Path`
  - `latest_runs() -> dict[str, RunRecord]`

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_signals.py`:

```python
"""Parsing is separated from shelling out so the parsers can be tested against real
git output without a fixture repository."""

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
    assert state.worktrees == 1


def test_an_unstaged_change_makes_it_dirty():
    assert signals.parse_git_state(PORCELAIN_DIRTY, "main", "577e130", WORKTREES_ONE).dirty


def test_worktrees_are_counted_because_a_second_one_changes_what_commands_mean():
    """M0.4's retrospective: compose and node_modules both behave differently with a
    second checkout present. The count is worth showing."""
    assert signals.parse_git_state("", "main", "abc", WORKTREES_TWO).worktrees == 2


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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_signals.py -v`

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`tools/cockpit/local/signals.py`:

```python
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
    """Newest record per command. A corrupt file is skipped: a half-written record
    from a killed process must not take the whole page down."""
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
        except (ValueError, KeyError, TypeError):
            continue
        current = latest.get(record.command_id)
        if current is None or record.started > current.started:
            latest[record.command_id] = record
    return latest
```

- [ ] **Step 4: Run, typecheck, lint, commit**

```bash
.venv/bin/pytest tests/cockpit/test_signals.py -v
.venv/bin/mypy tools && .venv/bin/ruff check tools && .venv/bin/ruff format tools
git add tools/cockpit/local/signals.py tests/cockpit/test_signals.py
git commit -m "feat(cockpit): git state and run history, with corrupt records skipped"
```

---

### Task 9: `local/runner.py` — one run at a time, streamed and recorded

**Files:**
- Create: `tools/cockpit/local/runner.py`
- Test: `tests/cockpit/test_runner.py`

**Interfaces:**
- Consumes: `commands.{resolve, env_for, cwd_for, COMMANDS, CommandError}`, `signals.{RunRecord, save_run}`, `tools.cockpit.ROOT`.
- Produces:
  - `class Busy(RuntimeError)`, `class ConfirmRequired(RuntimeError)` with attribute `nonce: str`
  - `class Runner`, constructed with no arguments
  - `Runner.start(command_id: str, vertical: str | None = None, nonce: str | None = None) -> str` — returns a run id
  - `Runner.stream(run_id: str) -> Iterator[str]` — yields output lines, then `"__exit__:<code>"`
  - `Runner.is_running() -> bool`

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_runner.py`:

```python
from __future__ import annotations

import pytest
from tools.cockpit.local import runner as run_mod


@pytest.fixture
def runner(tmp_path, monkeypatch):
    monkeypatch.setattr("tools.cockpit.local.signals.RUNS_DIR", tmp_path)
    return run_mod.Runner()


def test_a_second_run_while_one_is_in_flight_is_refused(runner, monkeypatch):
    monkeypatch.setattr(runner, "_active", object())
    with pytest.raises(run_mod.Busy):
        runner.start("pytest")


def test_db_reset_refuses_without_a_nonce_and_hands_one_back(runner):
    with pytest.raises(run_mod.ConfirmRequired) as caught:
        runner.start("db-reset")
    assert caught.value.nonce


def test_a_stale_or_invented_nonce_is_refused(runner):
    with pytest.raises(run_mod.ConfirmRequired):
        runner.start("db-reset", nonce="not-the-one-i-issued")


def test_a_nonce_is_single_use(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", lambda *a, **k: _FakeProc())
    try:
        runner.start("db-reset")
    except run_mod.ConfirmRequired as issued:
        nonce = issued.nonce
    runner.start("db-reset", nonce=nonce)
    runner._active = None
    with pytest.raises(run_mod.ConfirmRequired):
        runner.start("db-reset", nonce=nonce)


def test_an_unknown_command_never_reaches_a_subprocess(runner, monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("resolve() must reject before anything is spawned")

    monkeypatch.setattr(run_mod, "_spawn", explode)
    with pytest.raises(run_mod.CommandError):
        runner.start("rm-rf")


def test_a_completed_run_is_recorded_with_its_exit_code(runner, monkeypatch):
    monkeypatch.setattr(run_mod, "_spawn", lambda *a, **k: _FakeProc(lines=["ok"], code=3))
    run_id = runner.start("pytest")
    assert list(runner.stream(run_id))[-1] == "__exit__:3"
    from tools.cockpit.local import signals
    assert signals.latest_runs()["pytest"].exit_code == 3


class _FakeProc:
    def __init__(self, lines=(), code=0):
        self._lines = list(lines)
        self.returncode = code
        self.stdout = iter(f"{line}\n" for line in self._lines)

    def wait(self):
        return self.returncode
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_runner.py -v`

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`tools/cockpit/local/runner.py`:

```python
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

__all__ = ["Busy", "ConfirmRequired", "CommandError", "Runner"]


class Busy(RuntimeError):
    """One run at a time. Two concurrent `alembic upgrade head` calls is not a state
    worth supporting, so the second request is refused rather than queued."""


class ConfirmRequired(RuntimeError):
    def __init__(self, nonce: str) -> None:
        super().__init__("confirmation required")
        self.nonce = nonce


def _spawn(argv: tuple[str, ...], cwd: str, extra_env: dict[str, str]) -> Any:
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
        argv = resolve(command_id, vertical)  # raises CommandError before anything spawns
        if self._active is not None:
            raise Busy(f"{command_id} refused: a run is already in flight")
        if COMMANDS[command_id].confirm:
            if nonce is None or nonce != self._pending_nonce:
                self._pending_nonce = secrets.token_urlsafe(16)
                raise ConfirmRequired(self._pending_nonce)
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
        for line in proc.stdout:
            text = line.rstrip("\n")
            lines.append(text)
            yield text
        code = proc.wait()
        signals.save_run(
            signals.RunRecord(
                command_id=str(run["command_id"]),
                argv=tuple(run["argv"]),
                exit_code=int(code),
                started=str(run["started"]),
                duration_s=round(time.monotonic() - float(run["t0"]), 2),
                output="\n".join(lines),
            )
        )
        self._active = None
        yield f"__exit__:{code}"
```

- [ ] **Step 4: Run, typecheck, lint, commit**

```bash
.venv/bin/pytest tests/cockpit/test_runner.py -v
.venv/bin/mypy tools && .venv/bin/ruff check tools && .venv/bin/ruff format tools
git add tools/cockpit/local/runner.py tests/cockpit/test_runner.py
git commit -m "feat(cockpit): one run at a time, confirmed for db-reset, always recorded"
```

---

### Task 10: `local/server.py` — routes, the page token, SSE

**Files:**
- Create: `tools/cockpit/local/server.py`
- Test: `tests/cockpit/test_server.py`

**Interfaces:**
- Consumes: everything from tasks 2, 3, 5, 7, 8, 9.
- Produces:
  - `PAGE_TOKEN: str` — regenerated per process
  - `class Handler(BaseHTTPRequestHandler)`
  - `build_state_payload() -> dict[str, Any]`
  - `serve(port: int = 7317) -> None`
  - `HOST: str` = `"127.0.0.1"`

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_server.py`:

```python
"""The security properties are structural, so they are asserted structurally."""

from __future__ import annotations

from pathlib import Path

from tools.cockpit.local import server

SOURCE = Path(server.__file__).read_text(encoding="utf-8")


def test_it_binds_loopback_and_never_all_interfaces():
    assert server.HOST == "127.0.0.1"
    assert "0.0.0.0" not in SOURCE


def test_the_page_token_is_not_a_constant():
    assert len(server.PAGE_TOKEN) >= 16


def test_no_cors_header_is_ever_sent():
    assert "Access-Control-Allow-Origin" not in SOURCE


def test_the_state_payload_carries_no_secret():
    payload = server.build_state_payload()
    assert server.PAGE_TOKEN not in repr(payload)


def test_the_payload_reports_waves_holdbacks_and_git():
    payload = server.build_state_payload()
    assert {"waves", "holdbacks", "git", "runs", "staleness"} <= set(payload)


def test_the_payload_does_not_probe_the_network():
    """/api/state must never be slow. Env probes live on their own route."""
    assert "envs" not in server.build_state_payload()
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_server.py -v`

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

Write `tools/cockpit/local/server.py` with:

- `HOST = "127.0.0.1"`, `DEFAULT_PORT = 7317`, `PAGE_TOKEN = secrets.token_urlsafe(24)`.
- A module-level `RUNNER = Runner()`.
- `build_state_payload()` returning `{"waves": [...], "holdbacks": {...}, "git": {...}, "runs": {...}, "staleness": {...}, "commands": [...]}` — built from `state.load()`, `derive`, `signals.git_state()`, `signals.latest_runs()`, and `commands.COMMANDS`. It performs **no** network I/O.
- `class Handler(BaseHTTPRequestHandler)` with:
  - `do_GET`: `/` serves `static/index.html` with `{{TOKEN}}` replaced by `PAGE_TOKEN`; `/api/state` and `/api/envs` and `/api/run/<id>/stream` require the token; anything else 404.
  - `do_POST`: `/api/run` only.
  - `_authorised(self) -> bool`: returns `False` unless `X-Cockpit-Token` equals `PAGE_TOKEN` **and** any `Origin` header is absent. Never send CORS headers.
  - `log_message`: overridden to stay quiet.
  - `/api/run` maps `Busy` → 409 `{"error": "busy"}`, `ConfirmRequired` → 409 `{"error": "confirm_required", "nonce": ...}`, `CommandError` → 400.
  - `/api/run/<id>/stream` sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and writes `data: <line>\n\n` per yielded line, flushing each time.
- `serve(port)` running `ThreadingHTTPServer((HOST, port), Handler)`, printing the URL **with** the token as a one-time query string so the shell can open it.

- [ ] **Step 4: Run, typecheck, lint, commit**

```bash
.venv/bin/pytest tests/cockpit/test_server.py -v
.venv/bin/mypy tools && .venv/bin/ruff check tools && .venv/bin/ruff format tools
git add tools/cockpit/local/server.py tests/cockpit/test_server.py
git commit -m "feat(cockpit): the local server — loopback, token-gated, no CORS"
```

---

### Task 11: The Console page and `scripts/cockpit.sh`

**Files:**
- Create: `tools/cockpit/local/static/index.html`, `scripts/cockpit.sh`
- Test: `tests/cockpit/test_page.py`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `/api/state`, `/api/envs`, `/api/run`, `/api/run/<id>/stream`.
- Produces: the running tool.

**Layout:** follow the *Laptop — the Console* artboard — top chrome, a full-width environment bar, then three columns (wave rail · summary tiles and holdback board · commands and streaming output). Use the token values from `web/packages/ui/src/tokens.css` inline; **do not import** anything from `web/` (C2). Rubik from Google Fonts with a `system-ui` fallback.

- [ ] **Step 1: Write the failing tests**

`tests/cockpit/test_page.py`:

```python
from __future__ import annotations

from pathlib import Path

from tools.cockpit import ROOT

PAGE = ROOT / "tools/cockpit/local/static/index.html"
SCRIPT = ROOT / "scripts/cockpit.sh"


def test_the_page_exists_and_has_no_build_step():
    text = PAGE.read_text(encoding="utf-8")
    assert "<script type=\"module\" src=" not in text, "no bundler output — this file is served as-is"


def test_the_page_takes_its_token_by_substitution_not_by_hardcoding():
    assert "{{TOKEN}}" in PAGE.read_text(encoding="utf-8")


def test_the_page_never_loads_anything_from_the_product_workspace():
    text = PAGE.read_text(encoding="utf-8")
    for forbidden in ("@studio/", "../../web/", "/web/packages/"):
        assert forbidden not in text


def test_the_start_script_is_executable_and_uses_the_venv_interpreter():
    assert SCRIPT.stat().st_mode & 0o111
    text = SCRIPT.read_text(encoding="utf-8")
    assert ".venv/bin/python" in text, "a bare python3 is the 3.8 on PATH"


def test_claude_md_carries_the_state_tick_rule():
    """Spec §4.3 — the one discipline the design asks for. If it is not written down
    where every agent reads it, it will not happen."""
    text = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "state.yaml" in text
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/cockpit/test_page.py -v`

Expected: FAIL — `FileNotFoundError`.

- [ ] **Step 3: Write the page, the script, and the CLAUDE.md rule**

`scripts/cockpit.sh`:

```bash
#!/usr/bin/env bash
# The build cockpit. Loopback only; the token is printed with the URL.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec .venv/bin/python -m tools.cockpit.local.server "$@"
```

Then `chmod +x scripts/cockpit.sh`.

In `CLAUDE.md`, under `## Workflow`, add:

```markdown
- When you finish a piece of the active milestone, tick it in `docs/plan/state.yaml`
  **in the same commit as the work**. The cockpit and its phone view read that file;
  a piece finished but not ticked is progress nobody can see. Never write anything
  measurable there — no test results, no branch, no environment health.
```

- [ ] **Step 4: Run it for real**

```bash
./scripts/dev-db.sh up
./scripts/cockpit.sh
```

Open the printed URL. Confirm: the wave rail shows W0 active with four shipped pieces; the holdback board shows the open holdbacks grouped; the environment bar fills in after the page paints; `lane-check core` streams output and the gate tile updates; `db-reset` asks for confirmation before doing anything.

- [ ] **Step 5: Full gate, then commit**

```bash
.venv/bin/pytest tests/cockpit -v
./scripts/lane-check.sh core
git add tools/cockpit/local/static/index.html scripts/cockpit.sh tests/cockpit/test_page.py CLAUDE.md
git commit -m "feat(cockpit): the Console, and the one command that starts it"
```

---

## Self-Review

**Spec coverage.** §1.1 laptop constraint → C2/C3 and task 11's import test. §3 architecture → the file structure, minus `render.py`, deliberately deferred with a reason. §4 schema and rules → tasks 2 and 4. §4.3 workflow rule → task 11. §5.1/5.3 signals and staleness → tasks 3 and 8. §5.4 probes → task 5. §5.5 health → task 6. §6.1/6.2 runner → tasks 7 and 9. §7.1 laptop security → task 10. §8 laptop routes → task 10. §9 Console layout → task 11. §10 testing → distributed, with `lane-check` wiring pulled forward to task 1.

**Not covered here, by design:** §5.2 activity list, §7.2 phone auth, §7.3 GitHub token, §8 phone routes, §9 phone layout, §11 deployment. All are plan 2, and all depend on tasks 2, 3 and 5 landing first.

**Type consistency.** `Progress`, `Staleness`, `EnvStatus`, `GitState`, `RunRecord`, `Command` are each defined once and referenced with the same field names throughout. `resolve()` returns `tuple[str, ...]` in task 7 and is consumed as an argv tuple in task 9. `RUNS_DIR` is monkeypatched by name in tasks 8 and 9, so it must stay a module-level attribute of `signals`, not a constant closed over at import.

**One known gap, stated rather than hidden.** Task 10's implementation is described structurally rather than given as a complete code block — it is a ~200-line HTTP handler whose details (SSE flushing, header order) are better read from `http.server`'s docs at the keyboard than transcribed here. Every one of its *behaviours* is pinned by a test in step 1. If the executor wants the code spelled out, that is a reasonable request to make before starting task 10.
