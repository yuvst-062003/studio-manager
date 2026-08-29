"""§M9 -- GDPR data export and deletion workers.

Background jobs for asynchronous privacy request processing:
- Data export: assembles personal data bundle and uploads to object storage
- Data deletion: purges data respecting retention windows

**Neither half is built, and both say so out loud.** `assemble_export_bundle` and
`purge_subject_data` are seams that raise `NotImplementedError`; the loops below turn that
into `status='failed'` with the reason recorded, count it, and report it. This is W5's
comms-seam pattern and it is here for a sharper version of the same reason: until this
worker was scheduled at all, a request simply sat `pending`, which is a queue anybody can
see is not draining. Scheduled, the stub these functions replaced would have marked a §11.4
erasure request `completed` having deleted nothing -- and no constraint, screen, log line or
audit row downstream could have caught that. A visibly stuck queue is recoverable; a
compliance claim that is false is not.

Run as `python -m app.workers.privacy`, declared in `infra/railway/jobs.json`. It is
scheduled while still refusing on purpose: the schedule is what makes the gap visible on the
status screen §11.3 owes the subject, rather than invisible behind a request that never
moves.
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


def assemble_export_bundle(session: Session, export: DataExportRequest) -> str:
    """§11.3's bundle. Returns the object storage key; raises until it is built.

    **The seam, and it raises on purpose.** This is the shape W5's comms seam uses and the
    reason `app/workers/billing.py` gives for it: a refusal that is counted and reported is
    survivable, and a pass that reports success having done nothing is not. The caller turns
    this into `status='failed'` with the reason recorded, which is what a guardian asking
    "where is my export" needs somebody to be able to read.

    What it must do, none of which exists:
      1. Query all related data (charges, health, attendance, audit logs)
      2. Render PDFs for health declarations
      3. Assemble into a ZIP or tar.gz archive
      4. Upload to object storage
      5. Return the key, and set `expires_at` -- §11.3's "time-limited"

    §11.1's minimisation applies to the bundle's contents, and §11.7 to anything logged on
    the way: the key goes in the row, the bytes never do.
    """
    raise NotImplementedError("export bundle assembly is not implemented -- no data was collected")


def purge_subject_data(session: Session, deletion: DeletionRequest) -> None:
    """§11.4's purge. Raises until it is built.

    **This is the one the database cannot protect.** `data_export_request` carries
    `(status = 'completed') = (object_key IS NOT NULL)`, so an export that claimed success
    with nothing to show for it is rejected by PostgreSQL. There is no equivalent for a
    deletion -- "the data is gone" is not a column, and no constraint can be written that
    checks it. A stub that fell through to `status='completed'` would answer a §11.4
    erasure request with a lie that nothing downstream could catch.

    So the refusal is the feature, and `tests/privacy/test_privacy_worker.py` asserts on the
    subject's surviving row rather than on the status this function's caller writes.

    What it must do, none of which exists:
      1. Verify person_id is valid and belongs to studio
      2. Collect all deletable records (respecting retention windows)
      3. Delete in dependency order
      4. Anonymize/null sensitive fields that must be retained (financial)
      5. Log deletion for compliance

    The retention windows are the hard half: financial records are kept under Israeli law
    and §11.4 anonymizes the person rather than deleting the row, which is why every
    foreign key into `person` here is `RESTRICT`.
    """
    raise NotImplementedError("subject data purge is not implemented -- no data was deleted")


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

            export.object_key = assemble_export_bundle(session, export)
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

    **`updated_at` is the completion instant, and there is no `completed_at`.** This loop
    used to assign one. `DeletionRequest` has no such column, so SQLAlchemy accepted the
    attribute, kept it on the instance, and never wrote it -- a §11.4 request could report
    itself completed with no record of when. `TimestampColumns.updated_at` carries
    `onupdate=func.now()` and this row is only ever written when its status changes, so the
    instant is already stored, by the database rather than by the caller's `at`. Adding a
    column would mean a migration, which `main` lands one of per wave; this needs none.
    """
    tally = Tally()
    deletions = session.query(DeletionRequest).filter(DeletionRequest.status == "pending").all()

    for deletion in deletions:
        try:
            deletion.status = "running"
            session.flush()

            purge_subject_data(session, deletion)
            deletion.status = "completed"
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
