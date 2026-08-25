"""The only writer of `session.status = 'completed'`.

A session ends by the passage of time, not by anybody doing anything, so nothing in a
request path can be responsible for it. Leaving it to the attendance screen would mean a
class nobody marked stayed `scheduled` forever, and §5.14's 'sessions held vs planned'
would report a club that held nothing.

Run as `python -m app.workers.schedule`, and under time travel as
`python -m app.workers.schedule --at=2027-03-01` — §19.5's `use_dev_now` is the same
mechanism the `X-Dev-Now` header uses, not a second one.

**Cross-studio on purpose.** This is maintenance, not a report: every studio's ended
sessions become `completed`, the demo studio included. `app.core.demo.exclude_demo_studios`
guards cross-studio *numbers*, and a status that lagged only in the demo studio would make
the demo the one place the product looked broken.

**Not yet scheduled.** `infra/railway/jobs.json` is the source of truth for cron and is not
this lane's file; until an entry lands there this module runs only when invoked by hand.
`tests/config/test_jobs_config.py` checks that declared jobs name real modules, not that
every module is declared, so nothing here goes red about it — see the lane's report.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.core.clock import now, parse_dev_now, use_dev_now
from app.core.db import get_engine
from app.core.logging import configure_logging
from app.core.tenancy import with_all_tenants
from app.models.schedule import Session

logger = logging.getLogger(__name__)


def complete_ended_sessions(session: OrmSession, *, at: datetime) -> int:
    """Mark every session that has ended `completed`. Returns how many changed.

    `ends_at <= at`, not `starts_at`: a class in progress has people on the mat and a coach
    who is about to mark attendance on it.

    A cancelled session is never touched. It did not happen, and completing it would put it
    into §5.14's 'sessions held' count and tell the club it ran a class it cancelled.
    """
    rows = (
        session.execute(select(Session).where(Session.ends_at <= at, Session.status == "scheduled"))
        .scalars()
        .all()
    )
    for row in rows:
        row.status = "completed"
    session.flush()
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(prog="app.workers.schedule")
    parser.add_argument("--at", help="ISO 8601. §19.5's time travel, for the job path.")
    args = parser.parse_args(argv)

    shifted = parse_dev_now(args.at) if args.at else None
    with use_dev_now(shifted):
        at = now()
        # A plain Session, not a TenantSession: this walks every studio deliberately, which
        # is exactly the case §4.2's escape hatch exists for. The reason is required so
        # which of the two legal uses this is stays visible at the call site.
        with (
            with_all_tenants(reason="maintenance job: complete ended sessions in every studio"),
            OrmSession(get_engine(), expire_on_commit=False) as session,
        ):
            completed = complete_ended_sessions(session, at=at)
            session.commit()

    logger.info("sessions completed", extra={"completed": completed, "at": at.isoformat()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
