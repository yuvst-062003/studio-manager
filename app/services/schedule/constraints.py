"""§6.1 of the staff app redesign — a coach's filed unavailability, and decision 12's
"who is free" reader.

Deliberately its own file rather than a further section of `service.py`: this lane's
`ScheduleService` is sessions, rules and training years, and `CoachConstraintService` reads
two OTHER lanes' tables it does not otherwise touch — `role_assignment` (who counts as
staff) and `session_staff` (who is already teaching). Folding the two together would make
`service.py` the place every future schedule-adjacent feature grows from, which is exactly
how a 1,000-line file happens.

G6 — business logic lives here; `app/routers/coach_constraints.py` parses, calls, returns.
`at` is a parameter on every writing method, never `datetime.now()` — §19.5's only clock.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import cast

from sqlalchemy import Select, select
from sqlalchemy.orm import Session as OrmSession

from app.core.tenancy import TenantSession
from app.models.person import Person, RoleAssignment
from app.models.schedule import CoachConstraint, Session, SessionStaff
from app.schemas.schedule import (
    CoachConstraintApprove,
    CoachConstraintCreate,
    CoachConstraintRefuse,
)
from app.services.audit import AuditService
from app.services.comms import NotificationService
from app.services.people.naming import format_person_name
from app.services.schedule.rules import STUDIO_TZ
from app.services.schedule.service import ConflictError, NotFoundError

#: §3.1 — the same four roles `app/services/structure/staff.py::STAFF_ROLES` names.
#: Duplicated rather than imported: that module is lane STRUCTURE's own, and importing a
#: private-by-convention constant across a lane boundary for four literal strings is a
#: coupling this file does not need.
STAFF_ROLES: tuple[str, ...] = ("owner", "manager", "lead_coach", "assistant_coach")

#: §6.1 — "the coach is notified of the outcome. That notification's kind gets a prefix of
#: its own, not `coach.` — because §6.4 removes the group that prefix mapped to." Neither
#: prefix appears in `app/services/comms/kinds.py::_GROUP_BY_PREFIX`, so both are
#: ungoverned rather than muted (that file's own docstring: "an unmapped prefix is
#: UNGOVERNED, not muted") — exactly what a leave-request answer needs, since a switch a
#: coach could toggle off would mean they simply never learn whether they must show up.
CONSTRAINT_APPROVED_KIND = "constraint.approved"
CONSTRAINT_REFUSED_KIND = "constraint.refused"


def _paged[Row](
    stmt: Select[tuple[Row]], *, cursor: uuid.UUID | None, limit: int
) -> Select[tuple[Row]]:
    """The same keyset shape `app/services/schedule/service.py::_paged` uses — copied
    rather than imported, matching that file's own note that `app/services/structure/
    service.py` already carries an identical copy. A shared generic here would cost this
    module a dependency on a sibling service file for four lines."""
    if cursor is not None:
        stmt = stmt.where(stmt.column_descriptions[0]["entity"].id > cursor)
    return stmt.limit(limit + 1)


def _page_out[Row](rows: list[Row], limit: int) -> tuple[list[Row], uuid.UUID | None]:
    if len(rows) > limit:
        return rows[:limit], rows[limit - 1].id  # type: ignore[attr-defined]
    return rows, None


class SubstituteRefusedError(Exception):
    """§6.1 / §5's "refuse rather than half-do": a chosen substitute who is not staff at
    this studio, or who is themselves unavailable in the constraint's own window.

    `reason` is machine-readable (`not_staff` | `unavailable`) so the router can name the
    problem in the 422 rather than returning one flat, unexplained refusal.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class CoachConstraintService:
    """§6.1's six endpoints against the database. Constructed with a `TenantSession` the
    same way `ScheduleService` is — the tenant filter and the studio stamp are already on
    every query and insert, so nothing here passes `studio_id` by hand."""

    def __init__(self, session: OrmSession) -> None:
        self.session = session

    # -- reading ----------------------------------------------------------------------
    def list_mine(
        self, person_id: uuid.UUID, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[CoachConstraint], uuid.UUID | None]:
        """The coach's own history, every status included — a withdrawn or refused row
        still belongs on the screen that shows what happened to what they filed."""
        stmt = (
            select(CoachConstraint)
            .where(CoachConstraint.person_id == person_id)
            .order_by(CoachConstraint.id)
        )
        rows = self.session.execute(_paged(stmt, cursor=cursor, limit=limit)).scalars().all()
        return _page_out(list(rows), limit)

    def list_pending(
        self, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[CoachConstraint], uuid.UUID | None]:
        """The queue behind the manager's alert — C12's, not this checkpoint's, to render."""
        stmt = (
            select(CoachConstraint)
            .where(CoachConstraint.status == "pending")
            .order_by(CoachConstraint.id)
        )
        rows = self.session.execute(_paged(stmt, cursor=cursor, limit=limit)).scalars().all()
        return _page_out(list(rows), limit)

    # -- filing and withdrawing ---------------------------------------------------------
    def create(
        self, person_id: uuid.UUID, body: CoachConstraintCreate, *, at: datetime
    ) -> CoachConstraint:
        """Always lands `pending` — §6.1's table, no exceptions. `substitute_person_id`
        here is only ever the filer's own suggestion (the model's own docstring: "a
        suggestion, not a decision"), so it is stored as given and validated nowhere —
        the 422 §6.1 asks for belongs to `approve`, the moment a suggestion becomes a
        decision."""
        row = CoachConstraint(
            person_id=person_id,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            all_day=body.all_day,
            reason=body.reason,
            note=body.note,
            status="pending",
            substitute_person_id=body.substitute_person_id,
            created_at=at,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def withdraw(
        self, constraint_id: uuid.UUID, person_id: uuid.UUID, *, at: datetime
    ) -> CoachConstraint:
        """`DELETE /coach-constraints/{id}` — the filer only. A row belonging to someone
        else, or to no one in this studio, answers the same `NotFoundError` a stranger's
        session does: invisible, not forbidden, so a 403 never confirms a colleague's
        constraint exists.

        Refused from `refused` or already-`withdrawn` — nothing left to retract from a
        decision that already stands, or from a row already in this state. Allowed from
        `approved`: plans change, and a coach un-filing a granted leave (their papers came
        back early, they can coach after all) is retracting their OWN notice, not undoing
        the manager's decision — the decision itself, and who made it, stay on the row.
        """
        row = self.session.get(CoachConstraint, constraint_id)
        if row is None or row.person_id != person_id:
            raise NotFoundError(str(constraint_id))
        if row.status in ("refused", "withdrawn"):
            raise ConflictError(f"a {row.status} constraint cannot be withdrawn")
        row.status = "withdrawn"
        row.updated_at = at
        self.session.flush()
        return row

    # -- the manager's decision ----------------------------------------------------------
    def _require_pending(self, constraint_id: uuid.UUID) -> CoachConstraint:
        row = self.session.get(CoachConstraint, constraint_id)
        if row is None:
            raise NotFoundError(str(constraint_id))
        if row.status != "pending":
            raise ConflictError(f"a {row.status} constraint cannot be decided again")
        return row

    def _is_staff(self, person_id: uuid.UUID) -> bool:
        return (
            self.session.execute(
                select(RoleAssignment.id)
                .where(
                    RoleAssignment.person_id == person_id,
                    RoleAssignment.revoked_at.is_(None),
                    RoleAssignment.role.in_(STAFF_ROLES),
                )
                .limit(1)
            ).first()
            is not None
        )

    def is_available(self, person_id: uuid.UUID, starts_at: datetime, ends_at: datetime) -> bool:
        """Decision 12's exact rule, shared by `/staff/available` and `approve`'s
        substitute check so the two can never disagree about what "free" means: not
        already on a session's `session_staff` in the window, and no `approved` constraint
        of their own overlapping it. Interval overlap, not containment — a session or a
        constraint that merely touches the edge of the other does not count as a clash.
        """
        busy_session = self.session.execute(
            select(SessionStaff.id)
            .join(Session, Session.id == SessionStaff.session_id)
            .where(
                SessionStaff.person_id == person_id,
                Session.status != "cancelled",
                Session.starts_at < ends_at,
                Session.ends_at > starts_at,
            )
            .limit(1)
        ).first()
        if busy_session is not None:
            return False
        busy_constraint = self.session.execute(
            select(CoachConstraint.id)
            .where(
                CoachConstraint.person_id == person_id,
                CoachConstraint.status == "approved",
                CoachConstraint.starts_at < ends_at,
                CoachConstraint.ends_at > starts_at,
            )
            .limit(1)
        ).first()
        return busy_constraint is None

    def _require_available_substitute(
        self, person_id: uuid.UUID, starts_at: datetime, ends_at: datetime
    ) -> None:
        if not self._is_staff(person_id):
            raise SubstituteRefusedError("not_staff")
        if not self.is_available(person_id, starts_at, ends_at):
            raise SubstituteRefusedError("unavailable")

    def approve(
        self,
        constraint_id: uuid.UUID,
        body: CoachConstraintApprove,
        *,
        decided_by_person_id: uuid.UUID | None,
        at: datetime,
    ) -> CoachConstraint:
        """§6.1 / §5 — approving records the decision and the substitute. **It does not
        touch a single session**: reassigning is C12's popup, calling the existing
        `PATCH /sessions/{id}`, on purpose — see this module's own header and §5's own
        line, 'do not reach into the schedule from here'.

        `substitute_person_id` follows `SessionPatch`'s own absence rule: omitted leaves
        whatever was already on the row (the filer's suggestion, or nothing) untouched;
        given — including explicitly `null` — replaces it. A given, non-null id is
        validated against decision 12's rule FIRST, so approving never half-succeeds: a
        refused substitute leaves the constraint exactly as pending as it was before the
        call.
        """
        row = self._require_pending(constraint_id)
        if "substitute_person_id" in body.model_fields_set:
            if body.substitute_person_id is not None:
                self._require_available_substitute(
                    body.substitute_person_id, row.starts_at, row.ends_at
                )
            row.substitute_person_id = body.substitute_person_id
        row.status = "approved"
        row.decided_by_person_id = decided_by_person_id
        row.decided_at = at
        row.updated_at = at
        self.session.flush()
        AuditService.record(
            self.session,
            action="coach_constraint.approved",
            entity_type="coach_constraint",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=decided_by_person_id,
            diff={
                "substitute_person_id": str(row.substitute_person_id)
                if row.substitute_person_id
                else None
            },
        )
        self._notify_decision(row, approved=True, reason=None)
        return row

    def refuse(
        self,
        constraint_id: uuid.UUID,
        body: CoachConstraintRefuse,
        *,
        decided_by_person_id: uuid.UUID | None,
        at: datetime,
    ) -> CoachConstraint:
        """The reason is never stored on `coach_constraint` (no column carries it — see
        the model's own docstring); it reaches the coach through the notification body
        below and reaches the studio's own record through the audit entry, which is the
        durable "why" a notification the coach later dismisses is not."""
        row = self._require_pending(constraint_id)
        row.status = "refused"
        row.decided_by_person_id = decided_by_person_id
        row.decided_at = at
        row.updated_at = at
        self.session.flush()
        AuditService.record(
            self.session,
            action="coach_constraint.refused",
            entity_type="coach_constraint",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=decided_by_person_id,
            diff={"reason": body.reason},
        )
        self._notify_decision(row, approved=False, reason=body.reason)
        return row

    def _notify_decision(self, row: CoachConstraint, *, approved: bool, reason: str | None) -> None:
        local_start = row.starts_at.astimezone(STUDIO_TZ)
        local_end = row.ends_at.astimezone(STUDIO_TZ)
        when = (
            f"{local_start:%d/%m}"
            if local_start.date() == local_end.date()
            else f"{local_start:%d/%m}–{local_end:%d/%m}"
        )
        notifier = NotificationService(cast(TenantSession, self.session))
        if approved:
            notifier.enqueue(
                person_id=row.person_id,
                kind=CONSTRAINT_APPROVED_KIND,
                title="האילוץ אושר",
                body=f"האילוץ שהגשת ל-{when} אושר.",
                payload={"constraint_id": str(row.id), "status": row.status},
            )
        else:
            notifier.enqueue(
                person_id=row.person_id,
                kind=CONSTRAINT_REFUSED_KIND,
                title="האילוץ נדחה",
                body=f"האילוץ שהגשת ל-{when} נדחה: {reason}",
                payload={"constraint_id": str(row.id), "status": row.status},
            )

    # -- decision 12: who is free -------------------------------------------------------
    def _studio_staff(self) -> list[tuple[uuid.UUID, str, list[str]]]:
        rows = self.session.execute(
            select(Person, RoleAssignment.role)
            .join(RoleAssignment, RoleAssignment.person_id == Person.id)
            .where(RoleAssignment.revoked_at.is_(None), RoleAssignment.role.in_(STAFF_ROLES))
            .order_by(Person.last_name, Person.first_name)
        ).all()
        by_person: dict[uuid.UUID, tuple[Person, list[str]]] = {}
        for person, role in rows:
            entry = by_person.setdefault(person.id, (person, []))
            if role not in entry[1]:
                entry[1].append(role)
        return [
            (person_id, format_person_name(person.first_name, person.last_name), sorted(roles))
            for person_id, (person, roles) in by_person.items()
        ]

    def staff_availability(self, *, from_at: datetime, to_at: datetime) -> list[dict[str, object]]:
        """`GET /staff/available` — decision 12, verbatim: everyone, with a flag. **No
        ranking, nothing filtered out** — the dashboard shows the busy greyed rather than
        absent, because sometimes the manager asks the busy person anyway."""
        return [
            {
                "person_id": person_id,
                "display_name": display_name,
                "roles": roles,
                "available": self.is_available(person_id, from_at, to_at),
            }
            for person_id, display_name, roles in self._studio_staff()
        ]
