"""§5.4a's funnel, and the single writer that keeps it honest.

`student_status_history` is not an audit convenience -- §5.4a computes the whole funnel
report from it ("enquiries -> trials booked -> trials attended -> converted, sliced by
source and by month"). That only holds if every move through the graph leaves exactly one
row, which in turn only holds if one function does the moving. Set `student.status`
anywhere else and the report starts disagreeing with the roster.

The graph is narrower than the CHECK constraint on purpose. The constraint says which
values are *legal in the column*; this says which moves are *legal in the product*, and
the difference is where the bugs are. A `lead` promoted straight to `left` passes the
constraint and puts a departure in the funnel for somebody who never arrived.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.people import Student, StudentStatusHistory
from app.services.audit import AuditService
from app.services.people.errors import RefusedError

#: §5.4a's diagram, as a graph.
#:
#:     lead --> trial --> pending_approval --> active --> frozen --> left
#:        |                                                      \\-> lost
#:
#: `lead -> active` is legal and deliberate: §5.4(a)'s manager-added student never books a
#: trial, and forcing one through `trial` would put a trial in the funnel that never
#: happened. `left` and `lost` are terminal -- a student who can leave them is a student
#: the funnel can count twice.
LEGAL_TRANSITIONS: dict[str, frozenset[str]] = {
    "lead": frozenset({"trial", "pending_approval", "active", "lost"}),
    "trial": frozenset({"pending_approval", "active", "lost"}),
    "pending_approval": frozenset({"active", "lost"}),
    "active": frozenset({"frozen", "left"}),
    "frozen": frozenset({"active", "left"}),
    "left": frozenset(),
    "lost": frozenset(),
}


class StudentStatusService:
    """The only writer of `student.status`."""

    @staticmethod
    def transition(
        session: Session,
        *,
        student: Student,
        to_status: str,
        at: datetime,
        actor_person_id: uuid.UUID | None = None,
        reason: str | None = None,
    ) -> StudentStatusHistory:
        """Move one student, and record the move.

        `actor_person_id` is nullable because §5.4a's follow-up job moves a student to
        `lost` with no human behind it. Attributing that to whoever happened to configure
        the cron would make the audit trail lie about who decided.

        Does not commit. Every caller is inside a larger transaction -- conversion writes
        an enrollment in the same breath (§5.4a step 5), and a status that survived a
        failed enrollment would be a student marked active in no group.
        """
        allowed = LEGAL_TRANSITIONS.get(student.status, frozenset())
        if to_status not in allowed:
            raise RefusedError(
                f"a student cannot move from {student.status!r} to {to_status!r}; "
                f"legal moves are {sorted(allowed)}"
            )

        from_status = student.status
        student.status = to_status
        row = StudentStatusHistory(
            studio_id=student.studio_id,
            student_id=student.id,
            from_status=from_status,
            to_status=to_status,
            reason=reason,
            changed_by_person_id=actor_person_id,
            changed_at=at,
        )
        session.add(row)
        AuditService.record(
            session,
            action="student.status.changed",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            # Statuses and a reason. No name, no birthdate, nothing about health -- §11.2
            # keeps a diff to what changed, and what changed here is one enum.
            diff={"from": from_status, "to": to_status, "reason": reason},
        )
        session.flush()
        return row
