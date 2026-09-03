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
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.services.reports import ReportService, build_overview
from app.services.reports.csv_export import overview_csv, overview_filename
from app.services.reports.periods import PeriodKind, Window
from app.services.reports.schemas import MonthlyReportSummary, ReportsOverviewOut

router = APIRouter(prefix="/reports", tags=["reports"])


class MonthlyReportParams(BaseModel):
    """Query parameters for fetching a monthly billing report."""

    year: int
    month: int


class ChargeDetail(BaseModel):
    """Details of a single charge for invoice rendering."""

    charge_id: uuid.UUID
    student_id: uuid.UUID
    payer_person_id: uuid.UUID
    kind: str
    period_year: int
    period_month: int
    amount_agorot: int
    due_date: str
    status: str
    created_at: str


class StudentChargeDetails(BaseModel):
    """Charges for a student across all periods."""

    student_id: uuid.UUID
    charges: list[ChargeDetail]


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


@router.get("/{studio_id}/charges/{student_id}")
def get_student_charges(
    studio_id: uuid.UUID,
    student_id: uuid.UUID,
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> StudentChargeDetails:
    """Fetch all charges for a student for invoice generation.

    Returns charge details across all periods, sorted by period (newest first).
    Only accessible to owner and manager roles.
    """
    charges = ReportService(session).student_charges(student_id)
    return StudentChargeDetails(
        student_id=student_id,
        charges=[ChargeDetail(**charge) for charge in charges],
    )


class ReportDeliveryRequest(BaseModel):
    """Request to send a monthly report via email."""

    year: int
    month: int
    to_person_id: uuid.UUID


class ReportDeliveryResponse(BaseModel):
    """Response confirming report delivery request.

    `notification_id` is nullable and `status` stays a plain string rather than a Literal
    with one member -- both are the honest shape for a seam that, as of §2.7's fix, only
    ever succeeds or raises. A future real failure mode (the recipient's push preferences,
    a transport error) has somewhere to report itself without a schema change.
    """

    notification_id: uuid.UUID | None
    status: str


@router.post("/{studio_id}/send-monthly")
def send_monthly_report(
    studio_id: uuid.UUID,
    body: ReportDeliveryRequest,
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> ReportDeliveryResponse:
    """Queue a monthly billing report for delivery through §5.11's fan-out.

    **§2.7 of the 2026-09-02 findings register.** Two things were wrong, not the one this
    endpoint's own comment named: `NotificationService.enqueue` has never raised
    `NotImplementedError` (COMMS shipped in W5), so the `except` below was dead and
    `status: "failed"` could never actually be returned. The real hole was that this
    function never called `session.commit()` -- `TenantSessionDep` closes its session on
    the way out of the request, which discards an uncommitted flush, so the response
    claimed `status: "queued"` for a notification that was rolled back the moment the
    request ended and never reached anyone.

    There is no inbox action for `report.monthly` yet (`app/services/comms/actions.py`)
    and nothing attaches the report itself to the message -- the payload carries only
    `year`/`month`. Tapping the notification today opens nothing. Named here rather than
    fixed: building that is a new capability, not the dead-code question this walk was for.
    """
    from fastapi import HTTPException
    from sqlalchemy import select

    from app.models.person import Person
    from app.services.comms import NotificationService

    # Validate that recipient person belongs to the current studio
    person = session.execute(
        select(Person).where(
            Person.id == body.to_person_id,
            Person.studio_id == studio_id,
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Recipient not found in studio")

    notification = NotificationService(session).enqueue(
        person_id=body.to_person_id,
        kind="report.monthly",
        title="הדוח החודשי מוכן",
        body=f"הדוח החודשי שלך ל-{body.month:02d}/{body.year} מוכן",
        payload={
            "year": body.year,
            "month": body.month,
        },
    )
    session.commit()
    return ReportDeliveryResponse(
        notification_id=notification.id,
        status="queued",
    )


# ── artboard `4g` — the whole screen, and the file version of it ─────────────────────
#: `4g` draws `חודש / עונה / שנה`. See `app/services/reports/periods.py` for why the
#: artboard's taxonomy won over `reports.period.*`'s four values.
PeriodQuery = Annotated[PeriodKind, Query(description="month | season | year")]


@router.get("/{studio_id}/overview", response_model=ReportsOverviewOut)
def get_overview(
    studio_id: uuid.UUID,
    _: ManagerOrOwner,
    session: TenantSessionDep,
    period: PeriodQuery = "month",
) -> ReportsOverviewOut:
    """Artboard `4g` — the KPI strip, the twelve-month revenue trend, retention by tenure
    and the belt-promotion distribution, in one round trip.

    **One request rather than five.** The five panels are one question asked of one
    window, and five endpoints would let the period switcher drive them out of step for a
    frame — the argument `GET /attendance/report` already makes for `4c`.

    **`ManagerOrOwner`.** §3.2 puts studio-wide figures and `Export data` on owner and
    manager only, and the CSV button sitting beside this data is the same. A coach's view
    of attendance is the register itself.

    A season the studio does not have answers **200 with a null period**, not 404: "no
    data for the selected period" is a state `reports.empty` is written for, and a screen
    that showed an error there would be telling a manager something broke when nothing
    did.
    """
    return build_overview(session, kind=period, now=now())


@router.get("/{studio_id}/overview.csv")
def export_overview_csv(
    studio_id: uuid.UUID,
    _: ManagerOrOwner,
    session: TenantSessionDep,
    period: PeriodQuery = "month",
) -> Response:
    """`ייצוא CSV` — the same numbers, as a file, synchronously.

    §11.3's five-state export request is a different object for a different job; see
    `app/services/reports/csv_export.py`. This one is built and returned in the request
    that asked for it, over the same window the screen is showing, so a manager can never
    download a period other than the one they are looking at.
    """
    overview = build_overview(session, kind=period, now=now())
    if overview.period is None:
        # Nothing to export, and an empty file with headers would be worse than none: it
        # opens in Excel looking like a report of zeroes.
        return Response(status_code=204)
    window = Window(
        kind=overview.period.kind,
        from_date=overview.period.from_date,
        to_date=overview.period.to_date,
    )
    return Response(
        content=overview_csv(overview),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{overview_filename(window)}"'},
    )
