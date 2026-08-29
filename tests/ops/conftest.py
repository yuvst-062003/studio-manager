"""Cleanup for the one thing in this suite that deliberately commits.

`record_run` commits on entry and again on exit -- that is the feature, not an accident:
a run must be visible while it is still running, so a worker killed mid-pass leaves
evidence. The consequence is that its rows survive the session rollback every other test
in this repository relies on, and `assert len(rows) == 1` would pass on a fresh database
and fail on the second `pytest` run of the day.

Scoped to the `test-job-` prefix rather than truncating the table: a developer running one
file should not silently erase the heartbeats they were looking at.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from app.models.ops import JobRun
from sqlalchemy import delete
from sqlalchemy.orm import Session

#: Every job name this suite invents. Real job names never start with it, and
#: tests/ops/test_job_heartbeat.py asserts the declared names come from jobs.json.
TEST_JOB_PREFIX = "test-job-"


@pytest.fixture(autouse=True)
def _clear_test_job_runs(app_session: Session) -> Iterator[None]:
    def purge() -> None:
        # Rollback FIRST. A test that only flushed -- `session.add(...)` plus
        # `session.flush()`, the shape every other suite here relies on to stay
        # invisible -- has pending rows in this same session, and committing on the way
        # out would write them permanently. That happened: a synthetic `demo-reset` row
        # escaped into the dev database and made "this job has never run" false forever.
        app_session.rollback()
        app_session.execute(delete(JobRun).where(JobRun.job_name.like(f"{TEST_JOB_PREFIX}%")))
        app_session.commit()

    purge()
    yield
    purge()
