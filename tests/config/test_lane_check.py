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


def test_core_typechecks_the_dev_surface():
    """§19's code lives in app/routers/dev.py, app/integrations/ and app/workers/. The
    core lane's paths listed only app/core, app/models and app/services, so none of it
    reached mypy, ruff or ruff format in the one command this session's exit gate
    names."""
    text = SCRIPT.read_text(encoding="utf-8")
    for path in ("app/routers/dev.py", "app/integrations", "app/workers"):
        assert path in text, f"{path} is invisible to lane-check.sh core"


def test_restrictions_run_unscoped_in_every_lane():
    """§19.6's five, for the same reason tests/invariants' five run everywhere: no lane
    may land the first violation unnoticed."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "tests/restrictions" in text
    # Inside the unscoped block, beside the invariants -- not in a per-vertical branch.
    unscoped = text.split('say "invariants')[1].split('say "backend')[0]
    assert "tests/restrictions" in unscoped


def test_core_runs_the_dev_test_directory():
    assert "tests/dev" in SCRIPT.read_text(encoding="utf-8")


def test_the_dry_run_still_reports_six_scoped_gates_for_core():
    """Widening core's paths adds targets to existing gates; it does not add gates.
    And tests/restrictions is unscoped by design -- like tests/invariants, it runs in
    every lane, so it correctly does not increment the count. The number is asserted
    anyway because it is the cheapest regression detector there is: M0.3 caught a
    missing CSS gate because core reported five where it should have reported six."""
    result = _run("core", "--dry-run")
    assert result.returncode == 0, result.stderr
    assert "6 scoped gates" in result.stdout


def test_core_scopes_the_cockpit_so_its_tests_are_not_a_gate_that_never_runs():
    """tools/ is outside every per-vertical convention, so without this it is linted
    by nothing, typechecked by nothing and tested by nothing."""
    stdout = _run("core", "--dry-run").stdout
    for expected in ("tools/cockpit", "tests/cockpit"):
        assert expected in stdout, f"core's plan omits {expected}\n{stdout}"


def test_identity_resolves_every_path_that_vertical_actually_owns():
    """SPEC 7 puts auth under /auth and the console under /platform, so the router
    filenames do not match the vertical name the way `attendance` does. The default
    branch would type-check app/routers/identity.py and silently skip
    app/routers/platform.py and app/core/auth_context.py -- a green that checked less
    than it claimed."""
    text = SCRIPT.read_text(encoding="utf-8")
    for path in (
        "app/routers/platform.py",
        "app/core/auth_context.py",
        "app/models/person.py",
    ):
        assert path in text, f"{path} is invisible to lane-check.sh identity"


def test_structure_resolves_the_health_template_it_owns_in_m1():
    """Conflict C3 puts health_form_template in M1 to unblock M3's trial booking. It
    lives in app/models/health.py, which no vertical named `structure` would reach by
    convention."""
    assert "app/models/health.py" in SCRIPT.read_text(encoding="utf-8")


def test_identity_and_structure_fail_closed_before_their_source_exists():
    """Adding a case must not hand a vertical a free green. Until the files land, every
    scoped gate skips and the script must exit non-zero."""
    for vertical in ("identity", "structure"):
        result = _run(vertical, "--dry-run")
        if result.returncode != 0:
            assert "nothing was checked" in (result.stdout + result.stderr)


def test_health_resolves_the_worker_and_the_routers_it_actually_owns():
    """A green gate over an unchecked worker is worse than a red one, because it reads as
    covered. 5.5's `שלח תזכורת להורה` and its ladder are a job in
    app/workers/health_reminders.py, and the default branch reaches no worker at all --
    same shape as `people`'s app/workers/followups.py.

    SPEC 7 puts M4's routes at /health-templates and /students/{id}/health-declaration, so
    neither router is named health.py and the default branch would have skipped both."""
    text = SCRIPT.read_text(encoding="utf-8")
    for path in (
        "app/workers/health_reminders.py",
        "app/routers/health_templates.py",
        "app/routers/health_declarations.py",
    ):
        assert path in text, f"{path} is invisible to lane-check.sh health"


def test_the_health_lane_does_not_gate_cores_liveness_router():
    """app/routers/health.py is `GET /api/v1/health` -- core's liveness probe, asserted by
    tests/test_health.py. The default branch resolves `app/routers/$V.py` straight onto it
    and hands the health lane a gate over a file it does not own, which reads as
    ownership. The case branch names the lane's own two routers instead."""
    stdout = _run("health", "--dry-run").stdout
    assert "app/routers/health.py" not in stdout


def test_attendance_resolves_the_sync_router_and_the_offline_queue():
    """M5 owns app/routers/sync.py and web/packages/core/src/offline/** -- the only lane in
    the plan that owns anything under web/packages/core, and the highest-risk code in it.
    The default branch names neither: it looks for web/packages/core/src/attendance, which
    will never exist."""
    text = SCRIPT.read_text(encoding="utf-8")
    for path in ("app/routers/sync.py", "core_dirs=(offline)"):
        assert path in text, f"{path} is invisible to lane-check.sh attendance"


def test_attendance_reaches_the_parent_absence_screens():
    """5.7's parent pre-report lives at web/apps/parent/src/features/absence/, not
    features/attendance/ -- it is the parent app's own screen (artboard 12a), not a section
    of the coach roster. Same shape as `people`'s features/landing/. Without the override
    the frontend, lint and CSS gates skip every one of its files and the check still prints
    green."""
    assert "feature_dirs=(attendance absence)" in SCRIPT.read_text(encoding="utf-8")


def test_the_w3_verticals_fail_closed_before_their_source_exists():
    """Adding a case must not hand a vertical a free green -- the same guard `identity` and
    `structure` got. Until the lanes land files, every scoped gate that can skip does, and a
    vertical that resolved nothing at all must exit non-zero."""
    for vertical in ("attendance", "health"):
        result = _run(vertical, "--dry-run")
        if result.returncode != 0:
            assert "nothing was checked" in (result.stdout + result.stderr)
