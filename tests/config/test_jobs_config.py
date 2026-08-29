"""§19.7 -- 'a nightly job does the same in staging so the data never drifts into a
state that hides a bug.'

Two halves, and the second is the one that rots: the job must exist, and the schedule
that invokes it must point at something real. A declared cron entry naming a module
nobody wrote is a job that silently never runs, which is the same failure mode as a
lint rule scoped to a path that matches nothing (M0.1 found three).

**Both directions, because only one of them was guarded.** Every declared command must
name a real module -- and every runnable module must be declared. The second half is the
one that let four workers ship dead: `billing`, `schedule`, `health_reminders` and
`privacy` each had a `main()` and a `__main__` block and no cron entry anywhere, and
`health_reminders.py`'s own docstring claimed it was "declared once in
`infra/railway/jobs.json` -- because a worker nothing invokes is a feature that ships
dead, and nothing in the suite would notice." Nothing did. This file is what notices now.
"""

from __future__ import annotations

import ast
import importlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JOBS = ROOT / "infra/railway/jobs.json"
WORKERS = ROOT / "app/workers"

CRON = re.compile(r"^\S+ \S+ \S+ \S+ \S+$")


def _jobs() -> list[dict]:
    return json.loads(JOBS.read_text(encoding="utf-8"))["jobs"]


def _is_runnable(tree: ast.Module) -> bool:
    """A module is a job's entry point when it defines `main` and guards `__main__`.

    Parsed rather than imported: the question is what the source declares, and a module
    that fails to import is a different failure with a different test. Both halves are
    required -- a helper named `main` is not a job, and a `__main__` block that calls
    something else is not the shape `python -m` runs.
    """
    has_main = any(isinstance(node, ast.FunctionDef) and node.name == "main" for node in tree.body)
    has_guard = any(
        isinstance(node, ast.If)
        and isinstance(node.test, ast.Compare)
        and isinstance(node.test.left, ast.Name)
        and node.test.left.id == "__name__"
        and any(
            isinstance(comparator, ast.Constant) and comparator.value == "__main__"
            for comparator in node.test.comparators
        )
        for node in tree.body
    )
    return has_main and has_guard


def _runnable_workers() -> list[str]:
    """Every `app.workers.*` module shaped like something `python -m` can run."""
    found = []
    for path in sorted(WORKERS.glob("*.py")):
        if path.name == "__init__.py":
            continue
        if _is_runnable(ast.parse(path.read_text(encoding="utf-8"))):
            found.append(f"app.workers.{path.stem}")
    return found


def test_the_demo_reset_job_is_declared():
    assert [job for job in _jobs() if job["name"] == "demo-reset"]


def test_the_demo_reset_runs_in_staging_and_nowhere_else():
    job = next(job for job in _jobs() if job["name"] == "demo-reset")
    assert job["environment"] == "staging"


def test_every_job_has_a_five_field_cron_schedule():
    for job in _jobs():
        assert CRON.match(job["schedule"]), job


def test_every_declared_command_points_at_a_module_that_exists():
    """The anti-rot gate. `python -m app.workers.demo_reset` in a dashboard field is
    not checked by anything -- a rename lands green and the job stops running."""
    for job in _jobs():
        match = re.fullmatch(r"python -m ([\w.]+)", job["command"])
        assert match, f"{job['name']}: command must be `python -m <module>`, got {job['command']!r}"
        module = importlib.import_module(match.group(1))
        assert callable(module.main), f"{job['name']}: {match.group(1)}.main is not callable"


def test_every_runnable_worker_is_declared():
    """The converse gate, and the one that was missing.

    A module with a `main()` and a `__main__` block is a thing somebody wrote intending it
    to be run. If no cron entry names it, it is never run -- and unlike a renamed command,
    which at least breaks loudly the first time the dashboard fires it, this fails by doing
    nothing at all, forever, in production, with a green build.

    A worker that genuinely should not be scheduled does not get an exemption list here.
    Delete its `__main__` block, or declare it. Both are decisions; an exemption is a place
    to hide.
    """
    declared = {
        match.group(1)
        for job in _jobs()
        if (match := re.fullmatch(r"python -m ([\w.]+)", job["command"]))
    }
    undeclared = [module for module in _runnable_workers() if module not in declared]
    assert not undeclared, (
        "runnable worker(s) not declared in infra/railway/jobs.json: "
        + ", ".join(undeclared)
        + " -- a worker nothing invokes is a feature that ships dead."
    )


def test_every_job_cites_the_spec_section_that_asks_for_it():
    for job in _jobs():
        assert job["spec"].startswith("SPEC §"), job
