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
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
JOBS = ROOT / "infra/railway/jobs.json"
WORKERS = ROOT / "app/workers"

CRON = re.compile(r"^\S+ \S+ \S+ \S+ \S+$")

#: §13.10 -- Railway's cron runs in UTC while every `why:` in jobs.json reasons in
#: Asia/Jerusalem, so an unshifted expression fires three hours late during Israel
#: Daylight Time (the season this repository was audited in, and roughly seven months of
#: the year). Only the daily, fixed-hour jobs are listed: `*/15` and hourly entries fire
#: on the same minutes regardless of which zone you read them in, so shifting them would
#: be a no-op dressed up as a fix.
INTENDED_JERUSALEM_HOUR = {
    "demo-reset": (2, 0),
    "plan-changes": (2, 30),
    "billing-run": (8, 30),
    "people-followups": (9, 0),
    "health-reminders": (9, 30),
    "attendance-at-risk": (7, 0),
}

#: A date inside Israel Daylight Time (IDT, UTC+3), which is what "Verified 2026-09-02"
#: in the findings register was written under. A static cron shift is only ever exact for
#: one side of the DST boundary -- IST (UTC+2) runs the other five months -- and that
#: imprecision is the accepted cost of "shift the cron expressions and document that they
#: are UTC" rather than teaching the worker to read the clock itself.
_SAMPLE_IDT_DATE = (2026, 9, 2)


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


def test_daily_jobs_fire_at_their_documented_jerusalem_hour():
    """§13.10 -- production ran every daily job three hours late for as long as the eight
    cron services have existed, because `schedule` is interpreted as UTC while the `why:`
    beside each one argues in Asia/Jerusalem. `billing-run` at `30 8 * * *` UTC is 11:30
    Jerusalem, not the 08:30 the job's own `why:` leans on to argue it runs after the
    quiet-hours band -- so the argument was correct and the schedule silently missed it."""
    year, month, day = _SAMPLE_IDT_DATE
    for name, (hour, minute) in INTENDED_JERUSALEM_HOUR.items():
        job = next(j for j in _jobs() if j["name"] == name)
        cron_minute, cron_hour = job["schedule"].split()[:2]
        fired_at = datetime(year, month, day, int(cron_hour), int(cron_minute), tzinfo=UTC)
        local = fired_at.astimezone(ZoneInfo("Asia/Jerusalem"))
        assert (local.hour, local.minute) == (hour, minute), (
            f"{name}: {job['schedule']} (UTC) lands at {local:%H:%M} Jerusalem during IDT, "
            f"not the documented {hour:02d}:{minute:02d}"
        )
