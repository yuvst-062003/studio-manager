"""Operational telemetry: whether the scheduled jobs ran, and what went wrong in the API.

**Both tables are global.** A job is not a tenant's -- `sessions-complete` sweeps every
studio in one pass, and an unhandled exception happens to a process, not to a club. A
`studio_id` here would have to be invented, and invented tenancy is worse than declared
cross-tenancy: `tests/invariants/test_02_tenant_tables_are_scoped.py` carries the reason
for each, which is the only way this invariant stays a closed rule.

**Nothing here may carry a person.** These rows are read by an operator on a screen and,
for the red ones, sent out by email. §11.7 forbids health data and card details in an
application log, and the same argument applies with more force to a row that leaves the
building: counts, ids, names of jobs, class names of exceptions. Never a message, never a
row's contents, never a child. `app/core/jobs.py` is where that rule is enforced for the
failure path -- see `error_type`/`error_where` below and the docstring there.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: A run that started and has not reported an outcome. Committed on entry so that a
#: worker killed mid-pass -- OOM, a deploy, a lost database connection -- still leaves
#: evidence it began. Without it, "crashed hard" and "was never scheduled" are the same
#: empty table, and they need different fixes.
RUN_STATUSES = ("running", "succeeded", "failed")


class JobRun(UUIDPrimaryKey, TimestampColumns, Base):
    """One execution of one scheduled job.

    The row that answers "when did this last WORK", which is the question four workers
    scheduled nowhere for a whole milestone could not be asked. An error hook answers a
    different and easier one: a job that never runs raises nothing.
    """

    __tablename__ = "job_run"
    __table_args__ = (
        # The only read this table serves in the hot path: the newest successful run for
        # a named job. Descending, so the answer is the first row of the scan.
        Index("ix_job_run_job_name_started_at", "job_name", "started_at"),
    )

    #: Matches `name` in infra/railway/jobs.json exactly. A heartbeat filed under a
    #: different string is a heartbeat nothing looks for, so
    #: tests/ops/test_job_heartbeat.py asserts the two agree.
    job_name: Mapped[str] = mapped_column(String(64), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), nullable=False)

    #: The worker's own tally. Counts and ids only -- `app/workers/billing.py` states the
    #: same rule for its log lines, and invariant 1's NOT_MONEY list is why
    #: `charges_created` is a count rather than a sum.
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    #: The exception's CLASS NAME, and the file:line that raised it. Never the message.
    #: An exception message is arbitrary content: a database error embeds the row it
    #: choked on, and the rows in this product are children's health declarations. Two
    #: fields are enough to find the bug and neither can carry a person; the full
    #: traceback goes to the structured logger, which is the scrubbed path.
    error_type: Mapped[str | None] = mapped_column(String(128))
    error_where: Mapped[str | None] = mapped_column(Text)


class OpsEvent(UUIDPrimaryKey, TimestampColumns, Base):
    """Something worth an operator's attention that no other table already records.

    Deliberately narrow. The business signals are NOT stored here -- "the billing run
    created zero charges" is derived from `billing_run`, and "uPay stopped calling" from
    `upay_ipn_record`, because a signal computed from the real table cannot drift from
    it. What lands here is what nothing else writes down: an unhandled exception, and the
    record of an alert having been sent so the same red does not mail every fifteen
    minutes for a week.
    """

    __tablename__ = "ops_event"
    __table_args__ = (Index("ix_ops_event_kind_at", "kind", "at"),)

    #: `api.unhandled_exception` | `alert.sent`. A dotted namespace, matching the
    #: notification kinds in app/services/comms/kinds.py.
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Same rule as JobRun above: an exception class name and a route TEMPLATE
    #: (`/api/v1/students/{student_id}`), never a populated path -- a populated path is
    #: an id, and an id plus a timestamp is a person.
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
