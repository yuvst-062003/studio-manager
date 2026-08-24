"""lane-check.sh is eight lanes' entire verification command, so a defect here is a
defect in all of them at once.

`--dry-run` resolves and prints the gate plan without running it, which is what makes
these assertions fast enough to keep.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/lane-check.sh"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(SCRIPT), *args], cwd=ROOT, capture_output=True, text=True, timeout=600
    )


def test_the_script_is_executable():
    assert SCRIPT.stat().st_mode & 0o111, "a lane cannot run a script it cannot execute"


def test_it_refuses_to_run_without_a_vertical():
    assert _run().returncode != 0


def test_the_invariants_gate_runs_for_every_vertical():
    """SPEC 13's five run in *every* lane, every time -- that is the point of them."""
    for vertical in ("core", "attendance", "billing"):
        assert "tests/invariants" in _run(vertical, "--dry-run").stdout, vertical


def test_a_vertical_with_no_files_at_all_fails_rather_than_passing():
    """The failure mode this guards: every gate skips, the script prints green, and a
    lane believes it verified something. A check that checked nothing is red."""
    result = _run("no-such-vertical", "--dry-run")
    assert result.returncode != 0
    assert "nothing was checked" in (result.stdout + result.stderr)


def test_core_resolves_the_cross_cutting_paths_m0_actually_built():
    stdout = _run("core", "--dry-run").stdout
    for expected in ("app/core", "tests/core", "i18n-parity"):
        assert expected in stdout, f"core's plan omits {expected}\n{stdout}"


def test_a_skipped_gate_says_so_out_loud():
    """`billing` has an i18n namespace and nothing else yet. Every absent gate must name
    itself; a silent skip is indistinguishable from a passing one."""
    stdout = _run("billing", "--dry-run").stdout
    assert "skipped" in stdout


def test_it_runs_the_frontend_tools_from_inside_the_web_workspace():
    """Source assertion by necessity, and both halves were measured rather than assumed:

    `npx eslint` from the repo root downloads a fresh eslint@10 and never reads
    web/eslint.config.js -- it exited 0 having applied none of the D10 rules. `npx
    vitest` from the repo root finds no config either, so jsdom is absent and every
    component test errors with `document is not defined`.
    """
    text = SCRIPT.read_text(encoding="utf-8")
    assert "cd web" in text
    for line in text.splitlines():
        stripped = line.strip()
        assert not stripped.startswith("npx eslint"), stripped
        assert not stripped.startswith("npx vitest"), stripped


def test_the_frontend_gate_passes_concrete_paths_not_globs():
    """vitest positional arguments are filters, not globs. A `**` pattern matches nothing
    and exits 1, which is why the milestone plan's snippet fails for every vertical with
    no frontend tests yet -- `core` included."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "**/*.test.tsx" not in text, "a glob passed to vitest matches nothing and exits 1"


# There is deliberately no `test_lane_check_core_is_green` here. `lane-check.sh core`
# runs `pytest tests/config`, which is this file: a test that shelled out to it would
# recurse until it hit a timeout, which is exactly what the first version did. The exit
# gate is asserted by `./scripts/ci-local.sh`, which runs the command once from outside.
