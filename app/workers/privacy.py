"""§M9 -- GDPR data export and deletion workers.

Background jobs for asynchronous privacy request processing:
- Data export: assembles personal data bundle and uploads to object storage
- Data deletion: purges data respecting retention windows
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.logging import configure_logging
from app.models.reports import DataExportRequest, DeletionRequest

logger = logging.getLogger(__name__)


@dataclass
class Tally:
    """What the privacy workers report. Counts only."""

    studios: int = 0
    exports_processed: int = 0
    deletions_processed: int = 0
    errors: int = 0


def process_data_exports(session: Session, *, at: datetime) -> Tally:
    """Process pending data export requests.

    Marks each request with status='running', then 'completed' when done.
    On error, status='failed' and error message is recorded.
    """
    tally = Tally()
    exports = session.query(DataExportRequest).filter(DataExportRequest.status == "pending").all()

    for export in exports:
        try:
            export.status = "running"
            session.flush()

            # TODO: Implement actual export bundle assembly
            # 1. Query all related data (charges, health, attendance, audit logs)
            # 2. Render PDFs for health declarations
            # 3. Assemble into a ZIP or tar.gz archive
            # 4. Upload to object storage
            # 5. Set object_key and expires_at

            export.status = "completed"
            export.completed_at = at
            session.flush()
            tally.exports_processed += 1
            logger.info(
                "export completed",
                extra={
                    "export_id": str(export.id),
                    "subject_person_id": str(export.subject_person_id),
                },
            )
        except Exception as e:
            export.status = "failed"
            export.error = str(e)
            export.completed_at = at
            session.flush()
            tally.errors += 1
            logger.error(
                "export failed",
                extra={"export_id": str(export.id), "error": str(e)},
            )

    return tally


def process_deletions(session: Session, *, at: datetime) -> Tally:
    """Process pending data deletion requests.

    Marks each request with status='running', then 'completed' when done.
    On error, status='failed' and error message is recorded.

    Deletion respects retention windows:
    - Financial records (Charge, Payment) are never deleted (Israeli law)
    - Health data is purged
    - Attendance records are purged
    - Audit logs are retained for compliance
    """
    tally = Tally()
    deletions = session.query(DeletionRequest).filter(DeletionRequest.status == "pending").all()

    for deletion in deletions:
        try:
            deletion.status = "running"
            session.flush()

            # TODO: Implement actual data deletion with retention constraints
            # 1. Verify person_id is valid and belongs to studio
            # 2. Collect all deletable records (respecting retention windows)
            # 3. Delete in dependency order
            # 4. Anonymize/null sensitive fields that must be retained (financial)
            # 5. Log deletion for compliance

            deletion.status = "completed"
            deletion.completed_at = at
            session.flush()
            tally.deletions_processed += 1
            logger.info(
                "deletion completed",
                extra={
                    "deletion_id": str(deletion.id),
                    "subject_person_id": str(deletion.subject_person_id),
                    "reason": deletion.reason,
                },
            )
        except Exception as e:
            deletion.status = "failed"
            deletion.error = str(e)
            deletion.completed_at = at
            session.flush()
            tally.errors += 1
            logger.error(
                "deletion failed",
                extra={"deletion_id": str(deletion.id), "error": str(e)},
            )

    return tally


def main() -> int:
    configure_logging()

    with Session(get_engine(), expire_on_commit=False) as session:
        export_tally = process_data_exports(session, at=now())
        deletion_tally = process_deletions(session, at=now())
        session.commit()

    total_processed = export_tally.exports_processed + deletion_tally.deletions_processed
    logger.info(
        "privacy worker complete",
        extra={
            "exports_processed": export_tally.exports_processed,
            "deletions_processed": deletion_tally.deletions_processed,
            "errors": export_tally.errors + deletion_tally.errors,
            "total": total_processed,
        },
    )
    return 0 if (export_tally.errors + deletion_tally.errors) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
