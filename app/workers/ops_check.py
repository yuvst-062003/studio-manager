"""The job that watches the other jobs.

Every fifteen minutes: evaluate the checks in `app/services/ops/checks.py`, and email if
the set of failing ones has GROWN since the last email. Growth rather than change, because
a check recovering is not something to wake anybody for -- and rather than "any red",
because a job broken over a weekend would otherwise be two hundred and eighty-eight
identical emails, and the two hundred and eighty-ninth would be filtered.

**This job cannot detect its own silence, and nothing self-contained can.** If this stops
running, nothing mails -- the same failure it exists to catch, one level up. What it gets
instead is the same treatment as every other job: its own heartbeat, on the platform
console, where a human looking at the screen sees it has gone quiet. Closing the gap
properly needs something outside the box pinging in, which is exactly the vendor that was
deliberately not bought. Written down here rather than left for somebody to discover.

Run as `python -m app.workers.ops_check`, declared in `infra/railway/jobs.json`.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.jobs import record_run
from app.core.logging import configure_logging
from app.services.ops.alerts import email_configured, render, send
from app.services.ops.checks import (
    job_health,
    last_alert_ids,
    record_alert_sent,
    red_check_ids,
    signals,
)

logger = logging.getLogger(__name__)


@dataclass
class Result:
    """What one pass concluded. Counts and a boolean -- never a check's contents."""

    red: int
    alerted: bool


def evaluate_and_alert(session: Session, *, at: datetime) -> Result:
    """One pass. Separated from `main` so the dedupe rule can be tested without SMTP."""
    jobs = job_health(session, at=at)
    found = signals(session, at=at)
    red = red_check_ids(jobs, found)
    remembered = set(last_alert_ids(session))

    if not red:
        # Recovered. Forget the remembered set, or the next occurrence of the SAME
        # failure would look like a repeat and stay silent for ever.
        if remembered:
            record_alert_sent(session, at=at, ids=[])
            session.flush()
        return Result(red=0, alerted=False)

    new = set(red) - remembered
    if not new:
        return Result(red=len(red), alerted=False)

    if not email_configured():
        # Deliberately does NOT record the set as alerted. Otherwise the first pass after
        # somebody configures SMTP would be silent -- the backlog would already be
        # remembered as sent, by passes that delivered nothing.
        logger.warning(
            "checks are failing and email delivery is not configured",
            extra={"red": len(red)},
        )
        return Result(red=len(red), alerted=False)

    subject, body = render(jobs=jobs, found=found, red_ids=red, at=at)
    if not send(subject, body):
        # Same argument as the unconfigured branch: a send that failed is not a send, and
        # remembering it would swallow the alert permanently.
        return Result(red=len(red), alerted=False)

    record_alert_sent(session, at=at, ids=red)
    session.flush()
    return Result(red=len(red), alerted=True)


def main() -> int:
    """The entry point, wrapped in its own heartbeat. See app/core/jobs.py."""
    configure_logging()
    at = now()
    with Session(get_engine()) as heartbeat, record_run(heartbeat, "ops-check") as run:
        with Session(get_engine(), expire_on_commit=False) as session:
            result = evaluate_and_alert(session, at=at)
            session.commit()
        counts = {"red": result.red, "alerted": int(result.alerted)}
        logger.info("ops check complete", extra=counts)
        run.detail = counts
    return 0


if __name__ == "__main__":
    sys.exit(main())
