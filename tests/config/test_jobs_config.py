"""§19.7 -- 'a nightly job does the same in staging so the data never drifts into a
state that hides a bug.'

Two halves, and the second is the one that rots: the job must exist, and the schedule
that invokes it must point at something real. A declared cron entry naming a module
nobody wrote is a job that silently never runs, which is the same failure mode as a
lint rule scoped to a path that matches nothing (M0.1 found three).
"""

from __future__ import annotations

import importlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JOBS = ROOT / "infra/railway/jobs.json"

CRON = re.compile(r"^\S+ \S+ \S+ \S+ \S+$")


def _jobs() -> list[dict]:
    return json.loads(JOBS.read_text(encoding="utf-8"))["jobs"]


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


def test_every_job_cites_the_spec_section_that_asks_for_it():
    for job in _jobs():
        assert job["spec"].startswith("SPEC §"), job
