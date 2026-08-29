"""A job that fails loudly is fine; a job that never runs is the dangerous case.

`tests/config/test_jobs_config.py` closed one half of this already: a declared command
must name a real module, and a runnable module must be declared. Both are static facts
about the repository. Neither says anything about whether the scheduler ever fired.

Four workers existed for a whole milestone scheduled nowhere and nothing noticed. The
error hook everybody reaches for first would not have noticed either -- there was no
error, because there was no run. So what is recorded here is the SUCCESS, per job, with
its time: absence of a heartbeat is the signal, and absence is only observable against a
declared expectation of presence.
"""

from __future__ import annotations

import ast
import json
import re
from datetime import timedelta
from pathlib import Path

import pytest
from app.core.clock import now
from app.core.jobs import DeclaredJob, record_run
from app.models.ops import JobRun
from sqlalchemy import select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[2]
JOBS = json.loads((ROOT / "infra/railway/jobs.json").read_text(encoding="utf-8"))["jobs"]


def _runs(session: Session, name: str) -> list[JobRun]:
    return list(
        session.execute(select(JobRun).where(JobRun.job_name == name).order_by(JobRun.started_at))
        .scalars()
        .all()
    )


def test_a_successful_run_records_a_heartbeat(app_session: Session):
    with record_run(app_session, "test-job-success") as run:
        run.detail = {"charges_created": 3}

    rows = _runs(app_session, "test-job-success")
    assert len(rows) == 1
    assert rows[0].status == "succeeded"
    assert rows[0].finished_at is not None
    assert rows[0].detail == {"charges_created": 3}


def test_a_failing_run_records_the_failure_and_re_raises(app_session: Session):
    """The exception is not swallowed. A job that reported its own failure and then
    exited 0 would be green in Railway's dashboard, which is the wrong place to be
    quiet."""
    with pytest.raises(NotImplementedError), record_run(app_session, "test-job-failure"):
        raise NotImplementedError("the seam that raises on purpose")

    rows = _runs(app_session, "test-job-failure")
    assert len(rows) == 1
    assert rows[0].status == "failed"
    assert rows[0].finished_at is not None
    assert rows[0].error_type == "NotImplementedError"


def test_the_failure_row_carries_no_exception_message(app_session: Session):
    """§11.7 and G7. An exception's message is arbitrary content -- a database error
    embeds the row it choked on, and this product's rows are children's health
    declarations. The class name and the frame that raised are enough to find the bug,
    and they cannot carry a person. The full traceback goes to the scrubbed logger."""
    secret = "Rivka Cohen has a heart condition"
    with pytest.raises(ValueError), record_run(app_session, "test-job-leak"):
        raise ValueError(secret)

    row = _runs(app_session, "test-job-leak")[0]
    serialized = json.dumps(
        {"type": row.error_type, "where": row.error_where, "detail": row.detail}
    )
    assert secret not in serialized
    assert "Rivka" not in serialized


def test_a_run_is_visible_while_it_is_still_running(app_session: Session):
    """Committed on entry, not only on exit. A worker killed by an OOM or a deploy
    mid-run must leave evidence that it started -- otherwise the only difference between
    'crashed hard' and 'was never scheduled' is one that nobody can see, and those two
    need different fixes."""
    with record_run(app_session, "test-job-inflight"):
        observed = _runs(app_session, "test-job-inflight")
        assert len(observed) == 1
        assert observed[0].status == "running"
        assert observed[0].finished_at is None


def test_last_success_ignores_a_failed_run(app_session: Session):
    """The heartbeat is 'last SUCCESSFUL run'. A job failing every hour is running
    perfectly well as far as a liveness check is concerned, and that is exactly the
    reading that lets a broken job look healthy."""
    from app.services.ops.checks import last_success_at

    with record_run(app_session, "test-job-mixed"):
        pass
    good = last_success_at(app_session, "test-job-mixed")
    assert good is not None

    with pytest.raises(RuntimeError), record_run(app_session, "test-job-mixed"):
        raise RuntimeError("boom")

    assert last_success_at(app_session, "test-job-mixed") == good


# -- the anti-rot half -------------------------------------------------------------


def test_every_declared_job_records_a_heartbeat_under_its_own_name():
    """The guard that keeps this feature from rotting the way the schedule did.

    A worker that records nothing is a worker whose silence means nothing, and the
    overdue check would report it permanently red or permanently unknown -- both of
    which train an operator to ignore the screen. Read from the source rather than by
    running eight jobs: the question is whether the call is THERE, and under the name
    `infra/railway/jobs.json` declares, because a heartbeat filed under a different
    string is a heartbeat nothing looks for.
    """
    missing = []
    for job in JOBS:
        module = re.fullmatch(r"python -m ([\w.]+)", job["command"]).group(1)
        path = ROOT / (module.replace(".", "/") + ".py")
        tree = ast.parse(path.read_text(encoding="utf-8"))
        names = {
            node.args[1].value
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "record_run"
            and len(node.args) >= 2
            and isinstance(node.args[1], ast.Constant)
        }
        if job["name"] not in names:
            missing.append(f"{module} does not call record_run(session, {job['name']!r})")
    assert not missing, "; ".join(missing)


def test_every_declared_job_declares_how_long_its_silence_may_last():
    """`max_silence_minutes` is what turns 'no heartbeat' into 'overdue'.

    Declared per job rather than derived from the cron expression. Deriving it would
    need a cron parser, and a parser that mis-reads `*/15 * * * *` produces a monitor
    that is confidently wrong -- the one failure mode worse than no monitor. The number
    is a decision with a `why` beside it, in the file that already carries a `why` for
    every schedule.
    """
    for job in JOBS:
        silence = job.get("max_silence_minutes")
        assert isinstance(silence, int) and silence > 0, job["name"]


def test_the_tolerance_is_never_shorter_than_the_schedule_itself():
    """A tolerance below the job's own period pages on a job that is working.

    Only the cron shapes this file actually uses are understood; an unrecognised one
    fails rather than being assumed daily, because a silently-assumed period is how a
    monitor starts lying.
    """
    for job in JOBS:
        minute, hour = job["schedule"].split()[0], job["schedule"].split()[1]
        if minute.startswith("*/"):
            period = int(minute[2:])
        elif hour == "*":
            period = 60
        elif hour.isdigit() and minute.isdigit():
            period = 24 * 60
        else:
            pytest.fail(f"{job['name']}: unrecognised cron shape {job['schedule']!r}")
        assert job["max_silence_minutes"] >= period, (
            f"{job['name']}: a {job['max_silence_minutes']}m tolerance on a {period}m "
            "schedule reports a healthy job as overdue"
        )


#: The overdue tests run against a SYNTHETIC job rather than `JOBS[0]`.
#:
#: Two reasons, both learned the hard way here. A real job's name matches rows a
#: developer's own `python -m app.workers.…` may have left in the dev database, so
#: "this job has never run" is an assertion about the machine rather than about the code.
#: And `JOBS[0]` is whichever entry happens to be first in the file, so reordering
#: jobs.json would quietly change what these tests exercise.
FAKE = DeclaredJob(
    name="test-job-synthetic",
    schedule="0 2 * * *",
    environment="staging",
    command="python -m app.workers.nothing",
    max_silence_minutes=120,
)


@pytest.fixture
def only_the_fake_job(monkeypatch):
    """`job_health` reads the declared list through this name; replacing it is what keeps
    these tests about the overdue RULE rather than about the eight real jobs."""
    monkeypatch.setattr("app.services.ops.checks.declared_jobs", lambda: (FAKE,))
    return FAKE


def _stale_run(session: Session, job: DeclaredJob) -> None:
    stale = now() - timedelta(minutes=job.max_silence_minutes + 1)
    session.add(JobRun(job_name=job.name, started_at=stale, finished_at=stale, status="succeeded"))
    session.flush()


def test_the_overdue_check_reads_the_declared_tolerance(
    app_session: Session, monkeypatch, only_the_fake_job
):
    from app.core.config import settings
    from app.services.ops.checks import job_health

    monkeypatch.setattr(settings, "ENV", only_the_fake_job.environment)
    _stale_run(app_session, only_the_fake_job)

    health = {row.name: row for row in job_health(app_session, at=now())}
    assert health[only_the_fake_job.name].overdue is True
    assert health[only_the_fake_job.name].last_success_at is not None


def test_a_run_inside_the_tolerance_is_not_overdue(
    app_session: Session, monkeypatch, only_the_fake_job
):
    """The other direction. Without it, a check hardcoded to `overdue=True` would pass
    every case above."""
    from app.core.config import settings
    from app.services.ops.checks import job_health

    monkeypatch.setattr(settings, "ENV", only_the_fake_job.environment)
    fresh = now() - timedelta(minutes=only_the_fake_job.max_silence_minutes - 1)
    app_session.add(
        JobRun(
            job_name=only_the_fake_job.name,
            started_at=fresh,
            finished_at=fresh,
            status="succeeded",
        )
    )
    app_session.flush()

    health = {row.name: row for row in job_health(app_session, at=now())}
    assert health[only_the_fake_job.name].overdue is False


def test_a_job_this_environment_does_not_schedule_is_never_overdue(
    app_session: Session, monkeypatch, only_the_fake_job
):
    """Half the jobs in the file are production's and half are staging's.

    Read on the wrong environment they have all been silent forever, which is true and
    means nothing -- nobody asked them to run. Reporting seven permanent reds is how a
    status screen teaches its reader to ignore it, which costs more than having no screen.
    """
    from app.core.config import settings
    from app.services.ops.checks import job_health

    monkeypatch.setattr(settings, "ENV", "production")
    _stale_run(app_session, only_the_fake_job)

    health = {row.name: row for row in job_health(app_session, at=now())}
    assert health[only_the_fake_job.name].scheduled_here is False
    assert health[only_the_fake_job.name].overdue is False


def test_a_job_that_has_never_run_is_overdue_immediately(
    app_session: Session, monkeypatch, only_the_fake_job
):
    """No grace period for a job with no history, and this is the whole feature.

    The four workers that shipped dead had never run once. A check that waits for a
    baseline before it will complain is a check that never complains about exactly the
    case it was built for.
    """
    from app.core.config import settings
    from app.services.ops.checks import job_health

    monkeypatch.setattr(settings, "ENV", only_the_fake_job.environment)

    health = {row.name: row for row in job_health(app_session, at=now())}
    assert health[only_the_fake_job.name].last_success_at is None
    assert health[only_the_fake_job.name].overdue is True
