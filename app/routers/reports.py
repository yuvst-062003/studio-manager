"""§M9: Monthly billing reports and privacy/GDPR flows.

Reports lane owns:
- Monthly billing report generation (PDF export, email delivery, archive)
- GDPR data export (async job, poll endpoint)
- Deletion requests (enqueue task, return tracking ID)

The reporting service materializes charges by period and renders them; notifications
integrate via the slot pattern wired in M8's COMMS lane.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.auth_context import ManagerOrOwner
from app.core.tenancy import TenantSessionDep
from app.services.reports import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


class MonthlyReportParams(BaseModel):
    """Query parameters for fetching a monthly billing report."""

    year: int
    month: int


class MonthlyReportSummary(BaseModel):
    """Summary of charges in a billing period."""

    period_year: int
    period_month: int
    total_students: int
    total_agorot: int
    settled_agorot: int
    overdue_agorot: int
    pending_agorot: int


@router.get("/{studio_id}/monthly")
def get_monthly_report(
    studio_id: uuid.UUID,
    year: Annotated[int, Query(ge=2000, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> MonthlyReportSummary:
    """Fetch summary of charges for a given month.

    Only accessible to owner and manager roles. Returns totals by charge status:
    settled (paid charges), overdue (open charges past due date), pending (open
    charges not yet due).

    Query parameters:
    - year: billing year (2000–2100)
    - month: billing month (1–12)
    """
    summary = ReportService(session).monthly_summary(year, month)
    return MonthlyReportSummary(**summary)
