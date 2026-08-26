"""The schema for docs/plan/state.yaml, and the only code that reads or writes it.

Dataclasses rather than pydantic: pydantic is a project dependency, and this package
may not import one. Frozen, because every consumer is a pure function over a snapshot
and nothing should be mutating a parsed file in place.
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
MODES = frozenset({"sequential", "parallel"})
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
    #: The day the wave was closed out. Mirrors `Holdback.closed` rather than inventing a
    #: second spelling. A wave reaches `shipped` when its lanes are merged, which is not
    #: always the day its exit gate was met -- W2 closed with its gate deferred to W3 --
    #: so the date is recorded separately from the status rather than inferred from it.
    closed: date | None = None
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
    # "surface me regardless of how far out I block". For the holdbacks whose whole
    # value is lead time -- a merchant account, a native speaker, five parents -- being
    # correctly filed under a distant wave is the same as being invisible.
    lead_time: bool = False


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
        raise StateError(f"{where}: {field}={value!r} is not one of {sorted(allowed)}")
    return str(value)


def _date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    raise StateError(f"expected a date, got {value!r}")


def _parse_piece(raw: dict[str, Any], where: str) -> Piece:
    pwhere = f"{where} piece {raw.get('id', '?')}"
    items = tuple(
        Item(
            title=str(_require(item, "title", pwhere)),
            status=_one_of(item.get("status"), ITEM_STATUSES, "status", pwhere),
        )
        for item in raw.get("items") or []
    )
    return Piece(
        id=str(_require(raw, "id", pwhere)),
        title=str(_require(raw, "title", pwhere)),
        status=_one_of(raw.get("status"), STATUSES, "status", pwhere),
        on=_date(raw.get("on")),
        opened=_date(raw.get("opened")),
        items=items,
    )


def _parse_wave(raw: dict[str, Any]) -> Wave:
    where = f"wave {raw.get('id', '?')}"
    return Wave(
        id=str(_require(raw, "id", where)),
        milestone=str(_require(raw, "milestone", where)),
        title=str(_require(raw, "title", where)),
        mode=_one_of(raw.get("mode"), MODES, "mode", where),
        exit_gate=str(_require(raw, "exit_gate", where)),
        status=_one_of(raw.get("status"), STATUSES, "status", where),
        lanes=tuple(str(lane) for lane in raw.get("lanes") or []),
        opened=_date(raw.get("opened")),
        closed=_date(raw.get("closed")),
        pieces=tuple(_parse_piece(piece, where) for piece in raw.get("pieces") or []),
    )


def _parse_holdback(raw: dict[str, Any]) -> Holdback:
    where = f"holdback {raw.get('id', '?')}"
    return Holdback(
        id=str(_require(raw, "id", where)),
        kind=_one_of(raw.get("kind"), KINDS, "kind", where),
        title=str(_require(raw, "title", where)),
        why=str(_require(raw, "why", where)),
        blocks=str(_require(raw, "blocks", where)),
        status=_one_of(raw.get("status"), HOLDBACK_STATUSES, "status", where),
        opened=_date(raw.get("opened")),
        closed=_date(raw.get("closed")),
        source=None if raw.get("source") is None else str(raw["source"]),
        lead_time=bool(raw.get("lead_time", False)),
    )


def load(path: Path = DEFAULT_PATH) -> State:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise StateError(f"{path}: expected a mapping at the top level")

    updated = _date(_require(raw, "updated", str(path)))
    if updated is None:  # pragma: no cover -- _require already rejects None
        raise StateError(f"{path}: updated must be a date")

    return State(
        version=int(_require(raw, "version", str(path))),
        updated=updated,
        waves=tuple(_parse_wave(wave) for wave in raw.get("waves") or []),
        holdbacks=tuple(_parse_holdback(hb) for hb in raw.get("holdbacks") or []),
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


def _wave_to_dict(wave: Wave) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": wave.id,
        "milestone": wave.milestone,
        "title": wave.title,
        "mode": wave.mode,
        "lanes": list(wave.lanes),
        "exit_gate": wave.exit_gate,
        "status": wave.status,
    }
    if wave.opened is not None:
        out["opened"] = wave.opened
    if wave.closed is not None:
        out["closed"] = wave.closed
    out["pieces"] = [_piece_to_dict(p) for p in wave.pieces]
    return out


def _holdback_to_dict(holdback: Holdback) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": holdback.id,
        "kind": holdback.kind,
        "title": holdback.title,
        "why": holdback.why,
        "blocks": holdback.blocks,
        "status": holdback.status,
        "opened": holdback.opened,
        "closed": holdback.closed,
    }
    if holdback.source is not None:
        out["source"] = holdback.source
    if holdback.lead_time:
        out["lead_time"] = True
    return out


def dump(state: State, path: Path = DEFAULT_PATH) -> None:
    body = yaml.safe_dump(
        {
            "version": state.version,
            "updated": state.updated,
            "waves": [_wave_to_dict(w) for w in state.waves],
            "holdbacks": [_holdback_to_dict(h) for h in state.holdbacks],
        },
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
        width=100,
    )
    path.write_text(_HEADER + body, encoding="utf-8")
