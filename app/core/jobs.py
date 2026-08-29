"""The heartbeat every scheduled job writes.

A job that fails loudly is fine. A job that never runs is the dangerous case, and it is
the one this repository has actually had: `billing`, `schedule`, `health_reminders` and
`privacy` each had a `main()` and a `__main__` block and no cron entry anywhere, for a
whole milestone, with a green build. `tests/config/test_jobs_config.py` now catches that
particular shape -- a runnable module nothing declares -- but it is a static check on the
repository, and it has nothing to say about whether the scheduler ever fired.

An error hook does not answer this either, and that is the whole point: **a job that never
runs raises nothing.** So what is recorded is the SUCCESS, with its time. Silence is then
observable, because `infra/railway/jobs.json` declares how long each job's silence may
last (`max_silence_minutes`) and `app/services/ops/checks.py` compares the two.

Usage, at the top of a worker's `main()`::

    with Session(get_engine()) as session, record_run(session, "billing-run") as run:
        ...
        run.detail = {"charges_created": tally.charges_created}

The name is the job's name in `infra/railway/jobs.json`, and
`tests/ops/test_job_heartbeat.py` asserts every declared job calls this under exactly
that string -- a heartbeat filed under a different one is a heartbeat nothing looks for.
"""

from __future__ import annotations

import json
import logging
import traceback
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.clock import now
from app.models.ops import JobRun

logger = logging.getLogger(__name__)

#: The schedule, as declared. Read by the API so the ops screen can say "this job has
#: been silent for longer than it is allowed to be" -- which needs the tolerance, and
#: the tolerance lives beside the `why` that argues for the schedule.
#:
#: `tests/test_the_image_ships_what_the_api_reads.py` is what makes this safe: a
#: module-level Path pointing outside `app/` fails that test until the Dockerfile copies
#: the file. app/core/cors.py's missing `domains.json` was a container that could not
#: boot, discovered on a real deploy rather than in CI.
JOBS_PATH = Path(__file__).resolve().parents[2] / "infra" / "railway" / "jobs.json"


@dataclass(frozen=True)
class DeclaredJob:
    """One entry of infra/railway/jobs.json, as the monitor needs it."""

    name: str
    schedule: str
    environment: str
    command: str
    #: How long this job may be silent before silence means something is wrong.
    #: Declared rather than derived from the cron expression: deriving it needs a cron
    #: parser, and a parser that mis-reads `*/15 * * * *` produces a monitor that is
    #: confidently wrong -- worse than no monitor. tests/ops/test_job_heartbeat.py
    #: asserts the number is never shorter than the schedule's own period.
    max_silence_minutes: int


@lru_cache(maxsize=1)
def declared_jobs() -> tuple[DeclaredJob, ...]:
    """Every scheduled job, from the one file that declares them.

    Cached: the file cannot change under a running process, and the ops endpoint reads
    it on every poll.
    """
    raw = json.loads(JOBS_PATH.read_text(encoding="utf-8"))["jobs"]
    return tuple(
        DeclaredJob(
            name=job["name"],
            schedule=job["schedule"],
            environment=job["environment"],
            command=job["command"],
            max_silence_minutes=job["max_silence_minutes"],
        )
        for job in raw
    )


class RunRecord:
    """The handle a worker sets its tally on.

    A tiny object rather than yielding the ORM row itself: the only thing a caller may
    write is `detail`, and handing over the row would also hand over `status`, which the
    context manager owns. A job that could mark itself succeeded is a job that can lie.
    """

    __slots__ = ("detail",)

    def __init__(self) -> None:
        #: Counts and ids only. This lands in a database row an operator reads on screen
        #: and, when red, in an email that leaves the building -- see app/models/ops.py.
        self.detail: dict[str, Any] | None = None


def _where(exc: BaseException) -> str | None:
    """The file and line that raised, and nothing else.

    `traceback.extract_tb` gives frames with filename, lineno and the source LINE. The
    source line is dropped: a line like `raise ValueError(f"no such student {name}")` is
    source, not data, but the same extraction on a different frame can carry an
    interpolated local. Filename and line number cannot.
    """
    frames = traceback.extract_tb(exc.__traceback__)
    if not frames:
        return None
    last = frames[-1]
    return f"{last.filename}:{last.lineno}"


@contextmanager
def record_run(session: Session, job_name: str) -> Iterator[RunRecord]:
    """Write a `job_run` row around a worker's body. Re-raises whatever the body raised.

    **Committed on entry.** A worker killed mid-pass by an OOM or a deploy must still
    leave evidence that it started; otherwise "crashed hard" and "was never scheduled"
    are the same empty table, and they need different fixes.

    **The exception is never swallowed.** A job that recorded its own failure and then
    exited 0 would be green in Railway's dashboard, which is the wrong place to be quiet.
    The row is the operator's record; the non-zero exit is the scheduler's.

    **No exception message reaches the row.** See `app/models/ops.py` -- the class name
    and the raising frame are enough to find the bug and cannot carry a child's name. The
    full traceback goes to the logger, which is the scrubbed path (§11.7).
    """
    row = JobRun(job_name=job_name, started_at=now(), status="running")
    session.add(row)
    session.commit()

    record = RunRecord()
    try:
        yield record
    except BaseException as exc:
        row.status = "failed"
        row.finished_at = now()
        row.error_type = type(exc).__name__
        row.error_where = _where(exc)
        row.detail = record.detail
        session.commit()
        # `exc_info` rather than the message in `extra`: the traceback goes through the
        # logging formatter, and the scrubber walks `extra` by key. Neither is a place to
        # interpolate a payload -- see app/core/logging.py's own note on f-strings.
        logger.exception("scheduled job failed", extra={"job_name": job_name})
        raise
    else:
        row.status = "succeeded"
        row.finished_at = now()
        row.detail = record.detail
        session.commit()
        logger.info("scheduled job finished", extra={"job_name": job_name, "detail": record.detail})
