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
    """Response confirming report delivery request."""

    notification_id: uuid.UUID | None
    status: str  # queued, failed


@router.post("/{studio_id}/send-monthly")
def send_monthly_report(
    studio_id: uuid.UUID,
    body: ReportDeliveryRequest,
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> ReportDeliveryResponse:
    """Queue a monthly billing report for email delivery.

    Enqueues a notification through the COMMS lane's notification system.
    The report PDF is generated and attached by the notification worker.
    """
    from fastapi import HTTPException
    from sqlalchemy import select

    from app.models.person import Person
    from app.services.comms import NotificationService

    # Validate that recipient person belongs to the current studio
    person = session.execute(
        select(Person).where(Person.id == body.to_person_id)
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Recipient not found in studio")

    try:
        notification = NotificationService(session).enqueue(
            person_id=body.to_person_id,
            kind="report.monthly",
            title="Monthly Billing Report",
            body=f"Your billing report for {body.month}/{body.year} is ready",
            payload={
                "year": body.year,
                "month": body.month,
            },
        )
        return ReportDeliveryResponse(
            notification_id=notification.id,
            status="queued",
        )
    except NotImplementedError:
        # COMMS lane not yet implemented
        return ReportDeliveryResponse(
            notification_id=None,
            status="failed",
        )
