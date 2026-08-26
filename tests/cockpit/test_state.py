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
    """C8 -- there are no comments in this file, so `why` is the only place the reason
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


def test_a_closed_wave_keeps_its_closing_date_across_a_round_trip(tmp_path):
    """The failure this guards is silent, not loud.

    `_wave_to_dict` builds an explicit dict, so a key the Wave dataclass does not carry is
    not rejected on load -- it is dropped on the next machine WRITE. A closing date added
    to state.yaml by hand would survive every read, look correct in review, and vanish the
    first time the cockpit rewrote the file. `status` alone cannot stand in for it: a wave
    reaches `shipped` when its lanes merge, which is not always the day its exit gate was
    met, and W2 is exactly that case.
    """
    closed = GOOD.replace("    status: active\n", "    status: shipped\n    closed: 2026-08-26\n")
    path = _write(tmp_path, closed)
    loaded = st.load(path)
    assert loaded.waves[0].closed == date(2026, 8, 26)

    st.dump(loaded, path)
    assert "closed: 2026-08-26" in path.read_text(encoding="utf-8")
    assert st.load(path) == loaded


def test_a_wave_with_no_closing_date_does_not_grow_an_empty_one(tmp_path):
    """`opened` is written only when set, and `closed` follows it. An unclosed wave that
    round-tripped into `closed: null` would put a field on every pending wave in the file
    for no reader's benefit."""
    path = _write(tmp_path, GOOD)
    st.dump(st.load(path), path)
    assert "closed:" not in path.read_text(encoding="utf-8").split("holdbacks:")[0]


def test_the_writer_stamps_a_header_saying_it_is_machine_written(tmp_path):
    path = _write(tmp_path, GOOD)
    st.dump(st.load(path), path)
    assert path.read_text(encoding="utf-8").startswith("#")
