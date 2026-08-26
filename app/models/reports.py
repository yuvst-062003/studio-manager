"""SPEC §4.3's `data_export_request` — §11.3's subject-access bundle.

One table, and it is the whole of M9's privacy half that needs schema. §11.3: "A guardian
requests everything held about their students from the app. A worker assembles a bundle —
JSON of every related record plus rendered PDFs of health declarations — and delivers a
time-limited download link. Managers can trigger the same for any student."

**The bundle is a pointer, never a column.** §8.1 puts data-export bundles in object
storage alongside signed health PDFs and student photos. Inlining one here would put a
child's complete record — health declarations included — into every database backup, every
replica and every `pg_dump` a developer ever takes, which is precisely the exposure §11's
encryption exists to prevent.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 writes `data_export_request  ... status` without enumerating it, so these five are
#: chosen rather than quoted, and each earns its place:
#:
#: `pending` -- accepted, not yet picked up. §11.3 assembles the bundle in a worker, so
#:   there is always a gap between the request and the work starting.
#: `running` -- a worker holds it. Distinct from `pending` because a request stuck here is
#:   a crashed worker, and a request stuck in `pending` is a queue that is not draining.
#: `completed` -- `object_key` is set and the link is live.
#: `failed` -- the assembly errored. The guardian asked and got nothing; someone has to see
#:   that rather than the request quietly staying `running` forever.
#: `expired` -- the link's time limit passed and the object was deleted. §11.3 says
#:   "time-limited" and this is that limit having arrived. **Not the same as `failed`**: the
#:   export worked, and a re-request is the remedy rather than an investigation.
EXPORT_STATUSES = ("pending", "running", "completed", "failed", "expired")


class DataExportRequest(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `data_export_request  studio_id, subject_person_id, requested_by_person_id,
    status, object_key?, completed_at?`.

    **Two people, deliberately.** §11.3 allows both a guardian requesting their own
    students' data and a manager triggering the same for any student. Collapsing them into
    one column would make a manager-initiated export indistinguishable from the guardian's
    own in the audit trail — and §11.2 lists a data export as one of the actions that is
    always audited, which is only meaningful if it records who asked.
    """

    __tablename__ = "data_export_request"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'expired')",
            name="data_export_request_status",
        ),
        # A completed export has a bundle; anything else does not yet have one. Stated as a
        # constraint because "completed with no object_key" is a live link to nothing, and
        # the guardian would be told their data is ready when it is not.
        #
        # `key` rather than `bundle` only because of length. The naming convention prepends
        # `ck_<table>_`, and this table's name is 19 characters, so the obvious
        # `..._bundle_when_completed` rendered as a 64-character identifier -- one over
        # PostgreSQL's 63-byte limit. SQLAlchemy then hash-truncates it while the migration
        # writes the full name, and the two disagree forever: `alembic check` reports drift
        # on a schema nobody changed. Caught by that gate in W5's contract commit.
        CheckConstraint(
            "(status = 'completed') = (object_key IS NOT NULL)",
            name="data_export_request_key_when_completed",
        ),
        CheckConstraint(
            "(status IN ('completed', 'failed', 'expired')) = (completed_at IS NOT NULL)",
            name="data_export_request_finished_at",
        ),
        # The worker's queue scan, and the subject's own "where is my export" list.
        Index("ix_data_export_request_studio_id_status", "studio_id", "status"),
        Index(
            "ix_data_export_request_studio_id_subject_person_id",
            "studio_id",
            "subject_person_id",
        ),
    )

    #: Whose data this is. `RESTRICT`, not `CASCADE`: §11.4's anonymization overwrites a
    #: person rather than deleting the row, and an export request that vanished would
    #: remove the audit trail of a subject-access response.
    subject_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    #: Who asked. The guardian themselves, or a manager acting for them.
    requested_by_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(9), nullable=False, default="pending")
    #: §8.1 -- the key into object storage, never the bytes. Null until the bundle exists,
    #: and set back to null when it expires and the object is deleted.
    object_key: Mapped[str | None] = mapped_column(String(500))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Why it failed, for the person who has to answer the guardian. Never the contents.
    error: Mapped[str | None] = mapped_column(Text)
