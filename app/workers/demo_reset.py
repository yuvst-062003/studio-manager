"""§19.7 -- the nightly demo reset.

'POST /dev/demo/reset restores the fixture set from a versioned seed, and a nightly job
does the same in staging so the data never drifts into a state that hides a bug.'

Staging and nowhere else, and the refusal is most of the job:

* **production** -- the demo studio there is a smoke-test target you may have
  deliberately left mid-flow. An overnight wipe destroys the evidence you left.
* **development** -- it is your own scratch data.

Run as `python -m app.workers.demo_reset`. The schedule is declared once, in
infra/railway/jobs.json, and tests/config/test_jobs_config.py asserts this module is
what it points at.
"""

from __future__ import annotations

import logging
import sys

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_engine
from app.core.jobs import record_run
from app.core.logging import configure_logging
from app.services.demo.service import DemoStudioService

logger = logging.getLogger(__name__)

ALLOWED_ENV = "staging"


def main() -> int:
    configure_logging()
    if settings.ENV != ALLOWED_ENV:
        logger.warning(
            "refusing to reset the demo studio outside staging",
            extra={"env": settings.ENV, "allowed": ALLOWED_ENV},
        )
        return 1

    # The heartbeat starts AFTER the environment refusal above, deliberately. Outside
    # staging this job is not meant to run, and a `job_run` row saying it did -- or that
    # it failed -- would be a fact about a decision, not about a pass. `scheduled_here` in
    # app/services/ops/checks.py is the other half of that same argument.
    with Session(get_engine()) as heartbeat, record_run(heartbeat, "demo-reset") as run:
        with Session(get_engine(), expire_on_commit=False) as session:
            result = DemoStudioService.reset(session)
            session.commit()

        # `layers` is a list of fixture-layer NAMES, which is why it may be carried here:
        # they are code identifiers, not people. §19.7's fixtures are the one dataset in
        # this product where that is true.
        counts = {"demo_version": result.version, "layers": len(result.layers_seeded)}
        logger.info(
            "nightly demo reset complete",
            extra={"demo_version": result.version, "layers": list(result.layers_seeded)},
        )
        run.detail = counts
    return 0


if __name__ == "__main__":
    sys.exit(main())
