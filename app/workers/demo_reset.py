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

    with Session(get_engine(), expire_on_commit=False) as session:
        result = DemoStudioService.reset(session)
        session.commit()

    logger.info(
        "nightly demo reset complete",
        extra={"demo_version": result.version, "layers": list(result.layers_seeded)},
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
