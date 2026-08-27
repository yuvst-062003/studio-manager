"""Every HTTP method a frontend client uses must be in the API's CORS allow-list.

The bug this pins: `allow_methods` lacked PUT while four dashboard clients used it. No
test could catch that — CORS exists only in a real browser, so the whole suite passed
while every PUT from staging's dashboard was blocked at preflight and a manager could
not give a new group its weekly schedule. The obligation list is DERIVED from the client
sources, so a new client verb makes this fail at the commit that introduces it, not at
the next manual pass on staging.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAIN = ROOT / "app" / "main.py"
WEB_SRC = [ROOT / "web" / "apps", ROOT / "web" / "packages"]

#: `method: 'PUT'` / `method: "PUT"` in any client file. fetch() with no method is GET.
_METHOD = re.compile(r"""method:\s*['"](?P<verb>[A-Z]+)['"]""")


def _allowed_methods() -> set[str]:
    match = re.search(r"allow_methods=\[(?P<items>[^\]]*)\]", MAIN.read_text(encoding="utf-8"))
    assert match, "allow_methods not found in app/main.py — the CORS shape changed"
    return set(re.findall(r"['\"]([A-Z]+)['\"]", match.group("items")))


def _methods_the_clients_use() -> dict[str, set[str]]:
    used: dict[str, set[str]] = {}
    for base in WEB_SRC:
        for path in base.rglob("*.ts*"):
            if ".test." in path.name or "node_mod" in str(path):
                continue
            for match in _METHOD.finditer(path.read_text(encoding="utf-8")):
                used.setdefault(match.group("verb"), set()).add(
                    str(path.relative_to(ROOT))
                )
    return used


def test_every_client_verb_is_cors_allowed():
    allowed = _allowed_methods()
    used = _methods_the_clients_use()
    missing = {
        verb: sorted(files) for verb, files in used.items() if verb not in allowed
    }
    assert missing == {}, (
        f"{sorted(missing)} are used by frontend clients but absent from app/main.py's "
        f"allow_methods — a browser will block them at preflight while every test "
        f"passes. Offending files: {missing}"
    )


def test_the_detector_actually_sees_the_clients():
    """Guards the guard: if the glob or regex rots, the real assertion would pass
    vacuously. PUT and POST are both in active use today."""
    used = _methods_the_clients_use()
    assert "POST" in used and "PUT" in used
