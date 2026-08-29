"""§11.3 and §11.4's workers, and the one thing neither may ever do.

Both request tables were built before the work they queue. The export is protected from
itself by the database: `data_export_request_key_when_completed` makes
`status = 'completed'` with a null `object_key` unrepresentable, so a stub that claimed
success would be rejected by PostgreSQL. **`deletion_request` has no such constraint**, and
none can be written -- "the data is gone" is not a column. So nothing but this file stands
between a §11.4 erasure request and a row that says `completed` while every record it named
is still on disk.

That distinction is why these tests exist before the assembly and the purge do. A request
stuck in `pending` is a queue somebody can see is not draining. A request that reports
`completed` having done nothing is a product telling a guardian their child's data was
erased when it was not, and there is no later screen, log line or audit row that catches it.

The refusal is the same one `app/workers/billing.py` and `app/workers/health_reminders.py`
make while W5's comms seam is unbuilt: raise, count, report. Never swallow, and never
report success on a pass that did nothing.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.models.person import Person
from app.models.reports import DataExportRequest, DeletionRequest
from app.workers.privacy import process_data_exports, process_deletions

AT = datetime(2026, 8, 29, 3, 0, tzinfo=UTC)


@pytest.fixture
def a_pending_export(tenant_session, studio, a_family_with_data) -> DataExportRequest:
    subject = a_family_with_data[0]
    row = DataExportRequest(
        studio_id=studio.id,
        subject_person_id=subject.person_id,
        requested_by_person_id=subject.payer_person_id,
        status="pending",
    )
    tenant_session.add(row)
    tenant_session.flush()
    return row


@pytest.fixture
def a_pending_deletion(tenant_session, studio, a_family_with_data) -> DeletionRequest:
    subject = a_family_with_data[0]
    row = DeletionRequest(
        studio_id=studio.id,
        subject_person_id=subject.person_id,
        requested_by_person_id=subject.payer_person_id,
        status="pending",
        reason="עזיבת המועדון",
    )
    tenant_session.add(row)
    tenant_session.flush()
    return row


def test_an_export_never_reports_completed_without_a_bundle(tenant_session, a_pending_export):
    """§11.3 -- `completed` means a link the guardian can open. There is no bundle yet."""
    tally = process_data_exports(tenant_session, at=AT)

    assert a_pending_export.status != "completed", (
        "an export reported completed with no bundle -- the guardian is told their data "
        "is ready and the link points at nothing"
    )
    assert a_pending_export.status == "failed"
    assert a_pending_export.error, "a failed export must say why, for whoever answers the guardian"
    assert tally.errors == 1
    assert tally.exports_processed == 0


def test_a_deletion_never_reports_completed_while_the_subject_survives(
    tenant_session, a_pending_deletion, a_family_with_data
):
    """§11.4, and the one with no constraint behind it.

    The assertion is deliberately about the data and not only the status: a purge that is
    not written cannot be caught by checking the row it wrote about itself.
    """
    subject_person_id = a_family_with_data[0].person_id

    tally = process_deletions(tenant_session, at=AT)

    survivor = tenant_session.get(Person, subject_person_id)
    assert survivor is not None, "fixture precondition: the subject exists before the run"

    assert a_pending_deletion.status != "completed", (
        "a deletion reported completed while the subject's person row is still present -- "
        "§11.4 was answered with a lie, and no constraint in the schema can catch it"
    )
    assert a_pending_deletion.status == "failed"
    assert a_pending_deletion.error
    assert tally.errors == 1
    assert tally.deletions_processed == 0


def test_a_run_with_nothing_queued_is_not_an_error(tenant_session):
    """The refusal is per request, not per run. An idle pass reports zero of everything."""
    exports = process_data_exports(tenant_session, at=AT)
    deletions = process_deletions(tenant_session, at=AT)

    assert exports.errors == 0
    assert deletions.errors == 0
    assert exports.exports_processed == 0
    assert deletions.deletions_processed == 0
