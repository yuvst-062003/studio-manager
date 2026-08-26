"""§M9: GDPR privacy export and data deletion requests.

Privacy lane owns:
- Data export: async job that materializes all personal data (students, charges, health,
  attendance, audit logs) into a downloadable archive
- Deletion requests: enqueue task to purge a person's data within legal retention windows
- Audit trail export: chronological record of data access and modifications
"""

import uuid

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core.auth_context import ManagerOrOwner
from app.core.tenancy import TenantSessionDep
from app.services.privacy import PrivacyService

router = APIRouter(prefix="/privacy", tags=["privacy"])


class DataExportRequest(BaseModel):
    """Request to export a person's personal data."""

    person_id: uuid.UUID
    include_audit_trail: bool = True


class DataExportResponse(BaseModel):
    """Response with export job status."""

    job_id: uuid.UUID
    status: str  # queued, processing, ready, expired
    percent_complete: int
    expires_at: str | None


class DeletionRequest(BaseModel):
    """Request to delete a person's personal data."""

    person_id: uuid.UUID
    reason: str


class DeletionResponse(BaseModel):
    """Response confirming deletion request."""

    deletion_id: uuid.UUID
    status: str  # queued, processing, completed
    person_id: uuid.UUID


@router.post("/export")
def request_data_export(
    body: DataExportRequest,
    request: Request,
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> DataExportResponse:
    """Request GDPR data export for a person.

    Returns a job ID. Client polls `/export/{job_id}` to check status.
    Data is available for download when status is 'ready'.

    Query parameters:
    - include_audit_trail: whether to include audit logs (default: true)
    """
    service = PrivacyService(session)
    export = service.request_data_export(
        subject_person_id=body.person_id,
        requested_by_person_id=request.state.person_id,
        include_audit_trail=body.include_audit_trail,
    )
    session.commit()
    return DataExportResponse(
        job_id=export.id,
        status=export.status,
        percent_complete=0,
        expires_at=None,
    )


@router.get("/export/{job_id}")
def get_export_status(
    job_id: uuid.UUID,
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> DataExportResponse:
    """Poll status of a data export job."""
    from fastapi import HTTPException

    service = PrivacyService(session)
    export = service.get_export_status(job_id)
    if not export:
        raise HTTPException(status_code=404, detail="Export job not found")
    return DataExportResponse(
        job_id=export.id,
        status=export.status,
        percent_complete=0
        if export.status == "pending"
        else 100
        if export.status == "completed"
        else 50,
        expires_at=None,
    )


@router.post("/delete")
def request_deletion(
    body: DeletionRequest,
    request: Request,
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> DeletionResponse:
    """Request deletion of a person's personal data.

    Enqueues a task to delete data within retention window constraints
    (e.g., financial records retained per Israeli law).

    Returns a deletion tracking ID for status checks.
    """
    service = PrivacyService(session)
    deletion = service.request_deletion(
        subject_person_id=body.person_id,
        requested_by_person_id=request.state.person_id,
        reason=body.reason,
    )
    session.commit()
    return DeletionResponse(
        deletion_id=deletion.id,
        status=deletion.status,
        person_id=deletion.subject_person_id,
    )


@router.get("/delete/{deletion_id}")
def get_deletion_status(
    deletion_id: uuid.UUID,
    _: ManagerOrOwner,
    session: TenantSessionDep,
) -> DeletionResponse:
    """Poll status of a deletion request."""
    from fastapi import HTTPException

    service = PrivacyService(session)
    deletion = service.get_deletion_status(deletion_id)
    if not deletion:
        raise HTTPException(status_code=404, detail="Deletion request not found")
    return DeletionResponse(
        deletion_id=deletion.id,
        status=deletion.status,
        person_id=deletion.subject_person_id,
    )
