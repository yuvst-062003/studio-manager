"""§9's daily worker — apply every `plan_change` whose `effective_on` has arrived.

Run as `python -m app.workers.plan_changes`, declared once in `infra/railway/jobs.json` —
because a worker nothing invokes is a feature that ships dead, and nothing in the suite
would notice.

**Only downgrades reach this job.** An upgrade is applied the moment the parent requests
it, because withholding access somebody has volunteered to pay more for is a worse failure
than the club carrying a couple of sessions until the 1st. A downgrade waits, so a family
who paid for this month keeps this month and the sessions they marked stay marked — and
this is what takes them away when the month turns, releasing the future bookings the new
allowance no longer covers, latest first within each week.

**It never touches the money.** `settlement_status` stays `pending` after a change is
applied: §11's whole point is that two of the club's three payment routes are prepaid, so a
plan change cannot settle itself, and a person always closes that loop. This job moves
access, and access only.

**`effective_on <= today`, not `== today`.** A job that did not run yesterday must still
apply yesterday's changes today, rather than leaving a family on a plan they cancelled a
month ago.

**Cross-studio without the escape hatch**, exactly as `app/workers/health_reminders.py`
does it: a plain unscoped `Session` lists the studios, then one `use_studio` scope per
studio does the work. Calling `with_all_tenants` would put this file in front of §19.7's
demo-hygiene detector, and the loop is stricter rather than looser — every read inside it
runs through the tenant filter.

**G7.** Every log line carries counts. Not a child's name, not a guardian's.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.jobs import record_run
from app.core.logging import configure_logging
from app.core.tenancy import TenantSession, use_studio
from app.models.studio import Studio
from app.services.schedule.plan_change import PlanChangeService

logger = logging.getLogger(__name__)


@dataclass
class Tally:
    studios: list[str] = field(default_factory=list)
    applied: int = 0


def main() -> int:
    """The entry point, wrapped in its heartbeat. See app/core/jobs.py."""
    configure_logging()
    with Session(bind=get_engine()) as heartbeat, record_run(heartbeat, "plan-changes") as run:
        run.detail = _run_job()
    return 0


def _run_job() -> dict[str, int]:
    at = now()
    today = at.date()
    tally = Tally()

    with Session(bind=get_engine()) as unscoped:
        studios = list(
            unscoped.execute(select(Studio.id, Studio.slug).where(Studio.status == "active")).all()
        )

    for studio_id, slug in studios:
        tally.studios.append(slug)
        with (
            use_studio(studio_id),
            TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
        ):
            tally.applied += PlanChangeService(scoped).apply_due(on=today, at=at)
            scoped.commit()

    counts = {"studios": len(tally.studios), "applied": tally.applied}
    logger.info("plan changes applied", extra=counts)
    # The heartbeat carries the same counts the log line does. Counts only -- never a
    # studio slug, never a student: this row is read on a screen and mailed when red.
    return counts


if __name__ == "__main__":  # pragma: no cover -- the entry point itself
    sys.exit(main())
