"""SPEC §4.3's attendance block — `attendance` and `absence_report`.

**This is the table the offline queue exists for.** §10.3: a coach's mark goes to
`pending_ops` regardless of auth state, because the local write is not an API call. Every
column here is shaped by what has to survive that round trip.

**Two clocks, and both are true.** `device_marked_at` is when the coach tapped;
`marked_at` is when the server accepted it. §10.5 resolves a two-coach conflict by
`device_marked_at`, because resolving on the server clock would let whoever reconnected
second overwrite the earlier mark. A single timestamp cannot express "marked at 17:05,
synced at 19:00", and that gap is the normal case in a basement dojo.

**`unmarked` is a real status, not a missing row** (§5.14). "Nobody opened the register"
and "someone opened it and left this child undecided" are different facts, and §5.14's
sessions-held-vs-planned report is wrong if they collapse. A report must never treat
`unmarked` as `absent`.
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

#: §4.3 — `attendance  status(unmarked|present|absent_excused|absent_unexcused)`.
#: `unmarked` leads deliberately: it is the default a materialized roster starts in, and
#: §5.14 depends on it being storable rather than inferred from an absent row.
ATTENDANCE_STATUSES = ("unmarked", "present", "absent_excused", "absent_unexcused")

#: §4.3 — `attendance  source(coach|parent|bulk|system)`.
#:
#: §10.5's hardest conflict rule is expressed entirely through this column: "two coaches →
#: last write by `device_marked_at`, **except a parent pre-report, which never loses to a
#: bulk action regardless of timestamp**." A resolver cannot honour that without knowing
#: which of the four wrote the row, so `source` is not decoration.
ATTENDANCE_SOURCES = ("coach", "parent", "bulk", "system")


class Attendance(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — one row per (session, student).

    **Two unique constraints, and they do different jobs.**

    `(session_id, student_id)` is the domain rule: two rows for one student in one session
    are two different answers to "were they here", and no report can choose between them.

    `client_mark_id` is the *offline* rule, and it has to be unique independently of the
    pair above. §10.5: "same device flushes twice → no-op on `client_mark_id`." The queue
    replays a mark the server may already hold, and the client-generated id is the only
    thing that identifies it as **the same mark** rather than a correction to it. A
    constraint on the pair alone would make a replay look like a conflicting second
    opinion.
    """

    __tablename__ = "attendance"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('unmarked', 'present', 'absent_excused', 'absent_unexcused')",
            name="attendance_status",
        ),
        CheckConstraint(
            "source IN ('coach', 'parent', 'bulk', 'system')", name="attendance_source"
        ),
        Index("uq_attendance_session_id_student_id", "session_id", "student_id", unique=True),
        # §4.3's second unique index, verbatim. See the class docstring for why it is not
        # redundant with the one above.
        Index("uq_attendance_client_mark_id", "client_mark_id", unique=True),
        # `GET /students/{id}/attendance` and §5.14's consecutive-absence report.
        Index("ix_attendance_studio_id_student_id", "studio_id", "student_id"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unmarked")
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="coach")
    marked_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    #: When the server accepted it. G3 — UTC.
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: When the coach tapped, on their device. §10.5 resolves conflicts on THIS one — see
    #: the module docstring.
    device_marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Client-generated, so it exists before the row ever reaches the server. §10.3: the
    #: local write is not an API call, so the id cannot come from one.
    client_mark_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)


class AbsenceReport(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 — `absence_report  student_id, session_id, reported_by_person_id, reason?`.

    §5.7's "הודיעו מראש": a parent telling the club before the class. Distinct from an
    `attendance` row with `absent_excused`, and the distinction is load-bearing — §10.5
    says a **parent pre-report never loses to a bulk action regardless of timestamp**. A
    coach hitting "all present" at 17:00 must not silently overwrite a parent who reported
    at 09:00, and the resolver can only know that if the pre-report is its own row.

    §10.2: these **require a connection on purpose** and the parent app says so, rather
    than queuing into the void. A pre-report that syncs after the class has started is not
    a pre-report.
    """

    __tablename__ = "absence_report"
    __tenant_table_args__ = (
        # One report per (student, session). A parent tapping twice is one absence.
        Index("uq_absence_report_student_id_session_id", "student_id", "session_id", unique=True),
        Index("ix_absence_report_session_id", "session_id"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    reported_by_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    #: §5.7 — "סיבה לא חובה" on parent artboard `12a`. Optional on purpose: requiring a
    #: reason to report a sick child is friction at the worst moment.
    reason: Mapped[str | None] = mapped_column(String(200))


class AttendanceConfirmation(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """A parent saying their child WILL be at a session.

    **Its own table, and deliberately not a column on `absence_report`.** That table's
    whole meaning is "a row here is a notice of absence" -- §10.5's resolver, the roster's
    `has_absence_report`, and `bulk-present`'s `respect_absence_reports` all read it that
    way, and widening a row to also mean the opposite would silently invert every one of
    them. Two facts, two tables; the service keeps them mutually exclusive.

    **It writes no `attendance` row, and that is the point.** §5.7's absence path sets the
    register to `absent_excused` because the answer is already known -- nobody attends a
    lesson they have cancelled. A confirmation says the opposite is *intended*, which is
    not the same as having happened: §5.14 depends on `unmarked` meaning "nobody has
    opened the register", and a confirmation that pre-filled `present` would report
    attendance for a child who never arrived.

    So a coach's roster can now distinguish three states that used to be two: said yes,
    said no, and has not answered.
    """

    __tablename__ = "attendance_confirmation"
    __tenant_table_args__ = (
        # One answer per (student, session), the same shape as `absence_report` -- a
        # parent tapping twice is one answer, and an upsert needs somewhere to conflict.
        Index(
            "uq_attendance_confirmation_student_id_session_id",
            "student_id",
            "session_id",
            unique=True,
        ),
        Index("ix_attendance_confirmation_session_id", "session_id"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    #: RESTRICT, matching `absence_report`: who answered is evidence, so a person row that
    #: something still points at cannot be deleted out from under it.
    confirmed_by_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    #: The server's clock, like `attendance.marked_at`. A confirmation is not queued
    #: offline (§10.2 -- same reasoning as a pre-report), so there is one clock to record.
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
