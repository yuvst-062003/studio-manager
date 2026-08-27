"""§5.7 and §10.5 against the database. G6 — the routers parse, call, and return.

Everything here runs inside a `TenantSession`, so the tenant filter is already on every
query and the stamp already on every insert. Nothing below passes `studio_id` by hand:
doing so would be a second, weaker copy of a guarantee `app/core/tenancy.py` already makes,
and the two could disagree.

`at` is a parameter on every writing method. `app.core.clock.now()` is the only clock
(§19.5) and a service that read it could not be time-travelled — which is what every test
in this lane depends on, because §10.5 compares a device clock against a server clock in
almost every assertion.

**Nothing here ever drops a mark.** §10.3: "there is no code path that discards unsynced
work." A mark against a cancelled session is stored *and* flagged; a mark for a student
unenrolled meanwhile is stored *and* flagged. The conflict card is what a human resolves,
and it exists precisely so the server never has to choose between silently dropping and
silently applying.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import cast

from sqlalchemy import Select, select
from sqlalchemy.orm import Session as OrmSession

from app.core.tenancy import TenantSession
from app.models.attendance import AbsenceReport, Attendance
from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.schedule import Session as SessionRow
from app.schemas.attendance import (
    AbsenceReportIn,
    AttendanceIn,
    AttendanceStatus,
    BatchAttendanceIn,
    BulkPresentIn,
    RosterEntry,
    SessionRosterOut,
)
from app.schemas.schedule import SessionOut
from app.services.attendance.errors import ForbiddenError, NotFoundError, PreconditionError
from app.services.attendance.resolve import (
    Decision,
    ExistingMark,
    IncomingMark,
    resolve_mark,
)
from app.services.attendance.roster import RosterRowRaw, build_roster, require_session
from app.services.attendance.schemas import AttendanceConflictOut, BatchResult
from app.services.audit import AuditService
from app.services.comms import NotificationService
from app.services.schedule.service import ScheduleService

#: §5.7 — "סמן הכל נוכח sets every `unmarked` row to `present`."
BULK_TARGET_STATUS: AttendanceStatus = "present"


def _paged[Row](
    stmt: Select[tuple[Row]], *, cursor: uuid.UUID | None, limit: int
) -> Select[tuple[Row]]:
    """G16 — keyset pagination on the primary key, the same helper shape
    `app/services/schedule/service.py` uses."""
    if cursor is not None:
        stmt = stmt.where(stmt.column_descriptions[0]["entity"].id > cursor)
    return stmt.limit(limit + 1)


def _page_out[Row](rows: list[Row], limit: int) -> tuple[list[Row], uuid.UUID | None]:
    if len(rows) > limit:
        return rows[:limit], rows[limit - 1].id  # type: ignore[attr-defined]
    return rows, None


class AttendanceService:
    """§5.7's marks and §10's flush.

    **An instance, not a namespace of `@staticmethod`s**, matching `ScheduleService`: the
    session arrives through the constructor so a caller cannot accidentally run a method
    against an unscoped one.
    """

    def __init__(self, session: OrmSession) -> None:
        self.session = session

    # -- reading --------------------------------------------------------------
    def session_roster(self, session_id: uuid.UUID) -> SessionRosterOut:
        session_row, rows = build_roster(self.session, session_id)
        return SessionRosterOut(
            session=self._project_session(session_row, rows),
            roster=[self._project_row(row) for row in rows],
        )

    def report_injury(
        self,
        session_id: uuid.UUID,
        *,
        student_id: uuid.UUID,
        description: str,
        actor_person_id: uuid.UUID | None,
    ) -> int:
        """`9g`'s injury report (S2) -- to the manager and the guardians IMMEDIATELY.

        Online-only by design, like the parent's absence pre-report: an injury report
        that syncs after everyone has gone home is not a report. The kind's `health.`
        prefix makes it transactional under §5.11 -- no preference switch can mute a
        child being hurt. The description travels in the notification, which is FOR the
        manager and the guardians; the audit diff carries none of it, and neither does
        any log line.
        """
        session_row = require_session(self.session, session_id)
        student = self.session.get(Student, student_id)
        if student is None:
            raise NotFoundError(f"no student {student_id}")
        person = self.session.get(Person, student.person_id)
        display_name = f"{person.first_name} {person.last_name}" if person else ""

        guardian_ids = set(
            self.session.execute(
                select(Guardian.person_id).where(Guardian.student_id == student_id)
            ).scalars()
        )
        manager_ids = set(
            self.session.execute(
                select(RoleAssignment.person_id).where(
                    RoleAssignment.role.in_(("owner", "manager")),
                    RoleAssignment.scope_type == "studio",
                    RoleAssignment.revoked_at.is_(None),
                )
            ).scalars()
        )
        recipients = (guardian_ids | manager_ids) - {actor_person_id}

        # The router hands this service a TenantSession (TenantSessionDep); the class
        # annotation is the broader OrmSession because every other method needs no more.
        # The cast states the runtime fact rather than widening NotificationService.
        notifier = NotificationService(cast(TenantSession, self.session))
        for person_id in sorted(recipients, key=str):
            notifier.enqueue(
                person_id=person_id,
                kind="health.injury",
                title="דיווח פציעה בשיעור",
                body=f"{display_name} — {description}",
                payload={
                    "student_id": str(student_id),
                    "session_id": str(session_id),
                    "description": description,
                },
            )

        AuditService.record(
            self.session,
            action="attendance.injury_reported",
            entity_type="student",
            entity_id=student_id,
            studio_id=session_row.studio_id,
            actor_person_id=actor_person_id,
            # The session and the recipient count -- never the description. An audit
            # entry is read by a wider audience than the notification is.
            diff={"session_id": str(session_id), "notified": len(recipients)},
        )
        return len(recipients)

    def student_history(
        self, student_id: uuid.UUID, *, cursor: uuid.UUID | None, limit: int
    ) -> tuple[list[Attendance], uuid.UUID | None]:
        """`GET /students/{id}/attendance` — artboard `2d`'s eight marks and `4a`'s twelve.

        Ordered by the **device** clock, not by insertion: a queue that flushed two days
        late would otherwise put last Tuesday's lesson at the top of the list.
        """
        stmt = _paged(
            select(Attendance)
            .where(Attendance.student_id == student_id)
            .order_by(Attendance.device_marked_at.desc(), Attendance.id),
            cursor=cursor,
            limit=limit,
        )
        return _page_out(list(self.session.execute(stmt).scalars().all()), limit)

    # -- writing --------------------------------------------------------------
    def apply_batch(
        self,
        body: BatchAttendanceIn,
        *,
        actor_person_id: uuid.UUID | None,
        at: datetime,
        source: str = "coach",
    ) -> BatchResult:
        """§7's `POST /attendance/batch  (idempotent)` — the offline queue's flush.

        Idempotent **per mark**, on `client_mark_id`, rather than per request: a queue that
        partially reached the server must be safe to resend whole, and a request-level key
        would make the second attempt a no-op that silently dropped the marks the first
        attempt never delivered.
        """
        session_row = require_session(self.session, body.session_id)
        return self._apply(
            session_row,
            body.marks,
            actor_person_id=actor_person_id,
            at=at,
            source=source,
            session_status_seen=body.session_status_seen,
        )

    def bulk_present(
        self,
        session_id: uuid.UUID,
        body: BulkPresentIn,
        *,
        actor_person_id: uuid.UUID | None,
        at: datetime,
    ) -> BatchResult:
        """§5.7's `סמן הכל נוכח`, with the rule the artboards get wrong.

        "It sets every `unmarked` row to `present`. It **does not touch** rows that are
        `absent_excused` with `source = parent`, and it does not touch rows a coach has
        already set."

        **Two independent refusals, and `body.respect_absence_reports` overrides neither.**
        `_bulk_touches` chooses which rows to offer and skips a pre-report unconditionally;
        `resolve_mark` refuses a `source='bulk'` mark against a `source='parent'` row even
        if one were offered. §10.5 is stated without an escape hatch — "regardless of
        timestamp" — so the contract's flag is honoured as the *default* the schema's own
        docstring asks for and never as a capability. See `_bulk_touches` for the hole that
        reading it as a switch actually opened.

        Every generated mark is derived deterministically from `client_mark_id_prefix`, so
        a bulk action replayed from a queue is idempotent exactly as a single mark is.
        """
        session_row = require_session(self.session, session_id)
        _, rows = build_roster(self.session, session_id)
        marks = [
            AttendanceIn(
                student_id=row.student_id,
                status=BULK_TARGET_STATUS,
                # A v5 UUID keyed on the prefix and the student: stable across replays of
                # the same bulk tap, distinct per child, and computable on the client so a
                # queued bulk and its flush agree without a round trip.
                client_mark_id=uuid.uuid5(body.client_mark_id_prefix, str(row.student_id)),
                device_marked_at=body.device_marked_at,
            )
            for row in rows
            if self._bulk_touches(row)
        ]
        if not marks:
            return BatchResult()
        return self._apply(
            session_row,
            marks,
            actor_person_id=actor_person_id,
            at=at,
            source="bulk",
            # A bulk action is taken on the screen in front of the coach, so the device's
            # view of the session is whatever the roster it just rendered said.
            session_status_seen=session_row.status,
        )

    def report_absence(
        self,
        body: AbsenceReportIn,
        *,
        reporter_person_id: uuid.UUID,
        guardian_student_ids: set[uuid.UUID] | None,
        at: datetime,
    ) -> AbsenceReport:
        """§5.7's "לא אגיע היום", and §10.2's deadline enforced on the server.

        `guardian_student_ids` is `None` for staff — a manager may report on anyone's
        behalf, which is the phone call the office takes. A guardian gets the set of their
        own children, and an empty set is a real answer rather than a missing one.

        **The deadline is the server's.** §10.2: "a pre-report requires a connection on
        purpose: it is time-critical and worthless if it lands after the lesson." A client
        that checked the clock itself would let a device an hour behind file a pre-report
        for a lesson already in progress.
        """
        session_row = require_session(self.session, body.session_id)
        if guardian_student_ids is not None and body.student_id not in guardian_student_ids:
            # Not-found rather than forbidden: a 403 would confirm another family's child
            # exists in this studio.
            raise NotFoundError(str(body.student_id))
        if at >= session_row.starts_at:
            raise PreconditionError("too_late", "the lesson has already started")

        existing = self.session.execute(
            select(AbsenceReport).where(
                AbsenceReport.session_id == body.session_id,
                AbsenceReport.student_id == body.student_id,
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise PreconditionError("already_reported", "this absence was already reported")

        report = AbsenceReport(
            student_id=body.student_id,
            session_id=body.session_id,
            reported_by_person_id=reporter_person_id,
            reason=body.reason,
        )
        self.session.add(report)
        self.session.flush()

        # §5.7 — "This writes an `absence_report` AND sets the attendance row to
        # `absent_excused` with `source = parent`." Both, because the two answer different
        # questions: the report is the notice, the attendance row is the register. §10.5
        # protects the second from a bulk action by reading `source`.
        self._apply(
            session_row,
            [
                AttendanceIn(
                    student_id=body.student_id,
                    status="absent_excused",
                    client_mark_id=uuid.uuid5(report.id, "absence_report"),
                    device_marked_at=at,
                )
            ],
            actor_person_id=reporter_person_id,
            at=at,
            source="parent",
            session_status_seen=session_row.status,
        )
        return report

    def cancel_absence_report(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        *,
        guardian_student_ids: set[uuid.UUID] | None,
        at: datetime,
    ) -> None:
        """Artboard `12a`'s `ביטול הדיווח`. A parent who reported and then changed their
        mind returns the row to `unmarked`, not to `present` — nobody has been to the
        lesson yet, and §5.14 depends on that distinction."""
        require_session(self.session, session_id)
        if guardian_student_ids is not None and student_id not in guardian_student_ids:
            raise NotFoundError(str(student_id))
        report = self.session.execute(
            select(AbsenceReport).where(
                AbsenceReport.session_id == session_id,
                AbsenceReport.student_id == student_id,
            )
        ).scalar_one_or_none()
        if report is None:
            raise NotFoundError(str(student_id))
        mark = self.session.execute(
            select(Attendance).where(
                Attendance.session_id == session_id,
                Attendance.student_id == student_id,
            )
        ).scalar_one_or_none()
        if mark is not None and mark.source == "parent":
            mark.status = "unmarked"
            mark.marked_at = at
            mark.device_marked_at = at
        elif mark is not None:
            # A coach has since said something. Withdrawing the notice must not erase the
            # register — the coach was on the mat and the parent was not.
            raise ForbiddenError("a coach has already marked this session")
        self.session.delete(report)

    # -- internals ------------------------------------------------------------
    def _bulk_touches(self, row: RosterRowRaw) -> bool:
        """Which rows `סמן הכל נוכח` offers.

        §5.7, three clauses: only `unmarked` rows, never a parent's pre-report, and never
        the `לא אמורים להגיע היום` section — "`סמן הכל נוכח` never touches that section,
        and its rows never count toward `לא סומן`."
        """
        if not row.expected:
            return False
        if row.status != "unmarked":
            return False
        # **Unconditional, and `respect_reports` cannot turn it off.** The obvious
        # reading of `BulkPresentIn.respect_absence_reports` is a switch, and writing
        # it as one opened a real hole: a pre-report whose `attendance` row has not
        # landed yet -- a report filed while the roster was being materialized -- shows
        # `status='unmarked'` with `has_absence_report=True`, so the status filter above
        # lets it through and `resolve_mark` sees no existing row to protect. One tap
        # would then overwrite exactly the notice §10.5 says never loses.
        #
        # So the flag is honoured as a DEFAULT and not as a capability. §10.5 is
        # unconditional -- "regardless of timestamp", with no caller-supplied escape --
        # and a client sending `false` gets the safe branch anyway. That is the
        # difference between a default and a guarantee, and the schema's own docstring
        # asks for the second: "a caller that omits the field gets the safe branch
        # rather than overwriting every parent who reported this morning."
        return not row.has_absence_report

    def _apply(
        self,
        session_row: SessionRow,
        marks: Sequence[AttendanceIn],
        *,
        actor_person_id: uuid.UUID | None,
        at: datetime,
        source: str,
        session_status_seen: str | None,
    ) -> BatchResult:
        student_ids = [mark.student_id for mark in marks]
        by_student = {
            row.student_id: row
            for row in self.session.execute(
                select(Attendance).where(
                    Attendance.session_id == session_row.id,
                    Attendance.student_id.in_(student_ids),
                )
            )
            .scalars()
            .all()
        }
        # `client_mark_id` is UNIQUE across the whole table (§4.3's second index), so a
        # replay has to be recognised by the id ALONE — not by (session, student). A
        # client that reused one for a different child is a client bug, and treating it as
        # the replay it looks like beats a constraint violation the coach cannot act on.
        known_ids = set(
            self.session.execute(
                select(Attendance.client_mark_id).where(
                    Attendance.client_mark_id.in_([mark.client_mark_id for mark in marks])
                )
            )
            .scalars()
            .all()
        )

        result = BatchResult()
        accepted: list[uuid.UUID] = []
        for mark in marks:
            existing = by_student.get(mark.student_id)
            decision = resolve_mark(
                (
                    ExistingMark(
                        status=existing.status,
                        source=existing.source,
                        device_marked_at=existing.device_marked_at,
                        client_mark_id=existing.client_mark_id,
                    )
                    if existing is not None
                    else None
                ),
                IncomingMark(
                    status=mark.status,
                    source=source,
                    device_marked_at=mark.device_marked_at,
                    client_mark_id=mark.client_mark_id,
                ),
            )
            if decision is Decision.REPLAY or (
                decision is Decision.APPLY and mark.client_mark_id in known_ids
            ):
                result.replayed += 1
                continue
            if decision is Decision.KEEP_EXISTING:
                result.superseded += 1
                continue

            if existing is None:
                existing = Attendance(
                    session_id=session_row.id,
                    student_id=mark.student_id,
                    status=mark.status,
                    source=source,
                    marked_by_person_id=actor_person_id,
                    marked_at=at,
                    device_marked_at=mark.device_marked_at,
                    client_mark_id=mark.client_mark_id,
                    note=mark.note,
                )
                self.session.add(existing)
                by_student[mark.student_id] = existing
            else:
                existing.status = mark.status
                existing.source = source
                existing.marked_by_person_id = actor_person_id
                existing.marked_at = at
                existing.device_marked_at = mark.device_marked_at
                existing.client_mark_id = mark.client_mark_id
                if mark.note is not None:
                    existing.note = mark.note
            known_ids.add(mark.client_mark_id)
            result.applied += 1
            accepted.append(mark.student_id)

        self.session.flush()
        result.conflicts = self._conflicts(
            session_row,
            accepted=accepted,
            session_status_seen=session_status_seen,
        )
        AuditService.record(
            self.session,
            action="attendance.batch",
            entity_type="attendance_batch",
            entity_id=session_row.id,
            studio_id=session_row.studio_id,
            actor_person_id=actor_person_id,
            # Counts, never a child's name. An audit entry is read by a wider audience
            # than the roster is, and §11.2 puts no attendance detail in reach of one.
            diff={
                "applied": result.applied,
                "replayed": result.replayed,
                "superseded": result.superseded,
                "conflicts": len(result.conflicts),
            },
        )
        return result

    def _conflicts(
        self,
        session_row: SessionRow,
        *,
        accepted: list[uuid.UUID],
        session_status_seen: str | None,
    ) -> list[AttendanceConflictOut]:
        """§10.5's two cross-actor cases, raised **beside** the stored marks.

        Nothing here removes anything. The card is a question for a human, and the marks it
        concerns are already in the database when it is raised.
        """
        cards: list[AttendanceConflictOut] = []
        if not accepted:
            return cards

        if session_row.status == "cancelled" and session_status_seen != "cancelled":
            # `session_status_seen` is what makes this a COLLISION rather than a standing
            # complaint. A coach who can see the lesson is cancelled and marks it anyway
            # ran the lesson; that is a decision, not a conflict.
            cards.append(
                AttendanceConflictOut(
                    kind="session_cancelled",
                    session_id=session_row.id,
                    count=len(accepted),
                )
            )

        on_roster = {row.student_id for row in self._roster_ids(session_row)}
        strays = [student_id for student_id in accepted if student_id not in on_roster]
        if strays:
            cards.append(
                AttendanceConflictOut(
                    kind="student_unenrolled",
                    session_id=session_row.id,
                    student_ids=strays,
                    count=len(strays),
                )
            )
        return cards

    def _roster_ids(self, session_row: SessionRow) -> list[RosterRowRaw]:
        _, rows = build_roster(self.session, session_row.id)
        return rows

    def _project_row(self, row: RosterRowRaw) -> RosterEntry:
        return RosterEntry(
            student_id=row.student_id,
            display_name=row.display_name,
            belt_color_hex=row.belt_color_hex,
            belt_name=row.belt_name,
            health_status=row.health_status,
            derived_flags=row.derived_flags,
            status=row.status,
            source=row.source,
            has_absence_report=row.has_absence_report,
            absence_reason=row.absence_reason,
        )

    def _project_session(self, session_row: SessionRow, rows: list[RosterRowRaw]) -> SessionOut:
        out = ScheduleService(self.session).project_sessions([session_row])[0]
        # D5's block "surfaces coverage and completion — is a coach assigned, is it
        # cancelled, has attendance been taken". A session where every expected child is
        # still `unmarked` has not been taken; one where any of them has been marked has.
        out.attendance_taken = any(row.status != "unmarked" for row in rows if row.expected)
        return out
