"""The gate must reach this lane's own files.

`scripts/lane-check.sh`'s default branch resolves `app/routers/$V.py`, which for `people`
is a file that does not exist -- so mypy and ruff would run against the service package
alone and every router in the lane would go unchecked. `identity` and `structure` each
carry an explicit branch for exactly this reason; this test is why `people` has one too.

The check below is split into two assertions, deliberately, because the script's own
`-e`/`-d` loops filter `py_candidates`/`test_candidates` down to paths that exist on
disk. Six of `OWNED`'s eight paths are routers, a worker and a test package that Tasks
5-12 create -- so "every OWNED path appears in the `--dry-run` output" cannot be true
until the lane is nearly finished, and asserting it here would either fail for the next
nineteen tasks or have to be weakened, which is the one thing this test must never do.

So:

  * `test_the_people_branch_names_every_backend_file_the_lane_will_own` reads the
    `people)` branch's own text and checks all eight paths are written into it. That is
    true from this task onward, and it is what actually proves the gate was widened --
    a path missing from the branch text is a path the gate can never reach, no matter
    how many files exist on disk.
  * `test_the_people_gate_reaches_every_owned_file_that_exists` runs the real
    `--dry-run` and checks it against only the OWNED paths that exist right now. That
    stays true as the lane fills in, without ever asserting a file into existence.

A path could satisfy the first and fail the second (the branch names it, the file is not
written yet -- expected, before its task lands) or satisfy the second and fail the first
(impossible: the script cannot print a path it does not candidate). The two together are
what "the gate actually reaches the files it is meant to guard" means at every point in
the lane's life, not just at the end of it.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

OWNED = (
    "app/services/people",
    "app/routers/students.py",
    "app/routers/enrollments.py",
    "app/routers/public.py",
    "app/routers/trial_bookings.py",
    "app/workers/followups.py",
    "app/models/people.py",
    "tests/people",
)


def _dry_run() -> str:
    result = subprocess.run(
        ["bash", "scripts/lane-check.sh", "people", "--dry-run"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


def _people_branch_text() -> str:
    script = (ROOT / "scripts" / "lane-check.sh").read_text()
    start = script.index("\n  people)\n")
    end = script.index("\n    ;;\n", start)
    return script[start:end]


def test_the_people_branch_names_every_backend_file_the_lane_will_own():
    branch = _people_branch_text()
    missing = [path for path in OWNED if path not in branch]
    assert missing == [], (
        "the `people)` branch in scripts/lane-check.sh does not name these paths -- a "
        f"path the branch never names is a path the gate can never reach: {missing}"
    )


def test_the_people_gate_reaches_every_owned_file_that_exists():
    printed = _dry_run()
    existing = [path for path in OWNED if (ROOT / path).exists()]
    assert existing, "none of OWNED exists yet -- nothing for this test to check"
    missing = [path for path in existing if path not in printed]
    assert missing == [], (
        "scripts/lane-check.sh people does not reach these existing files -- a green "
        f"check that verified nothing is worse than a red one: {missing}"
    )
