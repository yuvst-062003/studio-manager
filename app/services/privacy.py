"""GDPR privacy service: data exports and deletion requests."""

import uuid

from sqlalchemy.orm import Session

from app.models.reports import DataExportRequest, DeletionRequest


class PrivacyService:
    """Handle GDPR data export and deletion requests."""

    def __init__(self, session: Session):
        self.session = session

    def request_data_export(
        self,
        subject_person_id: uuid.UUID,
        requested_by_person_id: uuid.UUID,
        include_audit_trail: bool = True,
    ) -> DataExportRequest:
        """Create a new data export request.

        Returns the created request with initial status 'pending'.
        The export is enqueued as a background job and can be polled via get_export_status.
        """
        export = DataExportRequest(
            subject_person_id=subject_person_id,
            requested_by_person_id=requested_by_person_id,
            status="pending",
        )
        self.session.add(export)
        self.session.flush()
        # TODO: Enqueue background job to assemble the export bundle
        return export

    def get_export_status(self, job_id: uuid.UUID) -> DataExportRequest | None:
        """Poll the status of an export job."""
        return self.session.query(DataExportRequest).filter(DataExportRequest.id == job_id).first()

    def request_deletion(
        self,
        subject_person_id: uuid.UUID,
        requested_by_person_id: uuid.UUID,
        reason: str,
    ) -> DeletionRequest:
        """Create a new data deletion request.

        Returns the created request with initial status 'pending'.
        The deletion is enqueued as a background job respecting retention windows.
        """
        deletion = DeletionRequest(
            subject_person_id=subject_person_id,
            requested_by_person_id=requested_by_person_id,
            status="pending",
            reason=reason,
        )
        self.session.add(deletion)
        self.session.flush()
        # TODO: Enqueue background job to perform deletion with retention constraints
        return deletion

    def get_deletion_status(self, deletion_id: uuid.UUID) -> DeletionRequest | None:
        """Poll the status of a deletion request."""
        return self.session.query(DeletionRequest).filter(DeletionRequest.id == deletion_id).first()
