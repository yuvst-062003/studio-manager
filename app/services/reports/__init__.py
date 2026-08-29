"""M9's read models — §5.14's reports, and artboard `4g`.

**This was a single module, `app/services/reports.py`, and that is why nothing checked
it.** `scripts/lane-check.sh` resolves a lane's backend sources with `-e
"app/services/$V"`, which tests for a *path*: `app/services/reports` did not exist, so
this lane's own gate type-checked and linted nothing at all in its service layer while
still printing green. Four other lanes ship packages and were reached; this one shipped a
flat file and was not. A package is the shape the gate was written for.

What lives where:

* `service.py` — the monthly billing summary and a student's charge history. Predates
  `4g`; kept, and the status bug it shipped with is fixed there.
* `periods.py` — the three windows behind `4g`'s switcher, resolved on the server.
* `overview.py` — `4g` itself: the KPI strip, the twelve-month revenue trend, retention
  by tenure and the belt-promotion distribution.
* `csv_export.py` — `ייצוא CSV`, a plain synchronous file. §11.3's five-state export
  request is a different object and lives in `app/routers/privacy.py`; `4g` says to
  treat this button as "a simple synchronous action, not the W5 request object".
* `schemas.py` — the response shapes, here rather than in `app/schemas/reports.py` for
  the same reason `app/services/attendance/schemas.py` exists: that module belongs to
  W5's contract commit and carries §11.3's export request, which is the privacy half of
  M9. Where a Pydantic model lives has no effect on the generated OpenAPI component.
"""

from app.services.reports.overview import build_overview
from app.services.reports.service import ReportService

__all__ = ["ReportService", "build_overview"]
