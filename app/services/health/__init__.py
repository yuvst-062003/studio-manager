"""W3's cross-lane seam: `HealthService.recompute_derived_flags`.

Plan §1.3 seam 4 in function form. The other half of the seam is data —
`BootstrapPayload.roster[].health_status` and `.derived_flags` — and together they are why
M4 Health and M5 Attendance can run in the same wave without either lane opening the
other's file.

**Why the flags are recomputed rather than stored by the writer.** D11 makes the question
set editable by the manager. A flag is a function of (answers, template version), so the
moment a manager rewords a question the derivation changes and every declaration's flags
are stale. A single named entry point means M4 can re-derive the studio's whole roster
after a template edit, and M5 never has to know that happened.

**G7 applies to the implementation, not the signature.** The return type is booleans, and
the reason it is booleans is that a coach sees them (§5.5) — never free text, never the
answers themselves.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.health import HealthDeclaration, HealthFormTemplate
from app.models.people import Student
from app.services.health.flags import derive_flags


class HealthService:
    """§5.5's derived-flag pipeline, and the data half of the same seam.

    **The invariant every method here inherits.** Coaches see `derived_flags` — booleans
    only. Reading the full declaration requires manager or owner and **every read is
    audit-logged** (§4.3, §11.2). Nothing on this class returns answers.

    **Why it takes a `TenantSession` and never opens one.** §4.2's filter fails closed: no studio
    in context raises rather than returning every studio's rows. A service that opened its own
    session would decide its own tenant, which is the one guarantee the query layer will not
    trade away. `session` is optional only so `tests/contracts/test_seams.py` can construct the
    class to inspect a signature without a database; calling a method on a session-less instance
    raises.
    """

    def __init__(self, session: TenantSession | None = None) -> None:
        self._session = session

    @property
    def session(self) -> TenantSession:
        if self._session is None:
            raise RuntimeError(
                "HealthService needs the request's TenantSession. It never opens one: §4.2's "
                "filter fails closed, and a service that chose its own tenant would be a service "
                "whose guarantees depend on who imported it."
            )
        return self._session

    def recompute_derived_flags(self, student_id: uuid.UUID) -> dict[str, bool]:
        """Re-derive `health_declaration.derived_flags` for one student, and return them.

        Booleans only (§4.3): `{"asthma": True, "allergy": True, "medication": False}`.
        Never free text — a free-text flag is a medical description on a coach's screen,
        which is exactly what the flag mechanism replaced.

        Returns an empty mapping for a student with no declaration. That is not an error:
        `student.health_status` is `missing`, the roster renders
        `⚠ הצהרת בריאות חסרה`, and §5.5 is explicit that nothing on the mat is blocked.

        **Derives against the template the declaration was signed against**, found by
        `template_id` rather than by "the studio's current full template". D11 makes the question
        set editable, so those are different rows the moment a manager publishes — and a
        declaration's flags must mean what the questions it was signed against asked.

        **Writes the result back before returning.** "Recompute" is the entry point a template
        publish uses to fix a whole studio's roster, so a caller that had to remember to persist
        would be a caller that eventually forgets. The row is flushed, not committed: the caller
        owns the transaction.

        G7: the answers are decrypted in memory by the column type and never leave this method.
        Nothing here logs.
        """
        row = self.session.execute(
            select(HealthDeclaration).where(HealthDeclaration.student_id == student_id)
        ).scalar_one_or_none()
        if row is None:
            return {}

        template = self.session.get(HealthFormTemplate, row.template_id)
        if template is None:
            # Impossible through the ORM -- `template_id` is `ondelete="RESTRICT"` -- and cheap
            # to state. An empty mapping is the safe direction: no flags rather than wrong ones.
            return {}

        flags = derive_flags(row.answers_encrypted or {}, template.schema)
        row.derived_flags = flags
        self.session.flush()
        return flags

    def roster_health(
        self, student_ids: Iterable[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[str, dict[str, bool]]]:
        """The data half of the W3 seam: `(health_status, derived_flags)` per student.

        These are exactly `BootstrapPayload.roster[].health_status` and `.derived_flags` — M4
        populates them, M5 renders them, and neither lane opens the other's file. Batched by id
        because a roster is a list and one query per row is what makes an offline prime slow
        enough that a coach stops waiting for it (§6.1).

        **Reads the stored flags rather than re-deriving.** Derivation decrypts, and a roster of
        thirty children would be thirty decryptions on a screen that shows booleans. Keeping the
        stored value honest is what `recompute_derived_flags` is for.

        A student with no declaration gets `("missing", {})`, which is the ⚠ badge and no chips.
        """
        ids = list(student_ids)
        if not ids:
            return {}

        statuses: dict[uuid.UUID, str] = {
            row_id: status
            for row_id, status in self.session.execute(
                select(Student.id, Student.health_status).where(Student.id.in_(ids))
            ).all()
        }
        flags_by_student: dict[uuid.UUID, dict[str, bool]] = {
            student: flags
            for student, flags in self.session.execute(
                select(HealthDeclaration.student_id, HealthDeclaration.derived_flags).where(
                    HealthDeclaration.student_id.in_(ids)
                )
            ).all()
        }
        return {
            student_id: (
                str(statuses.get(student_id, "missing")),
                dict(flags_by_student.get(student_id) or {}),
            )
            for student_id in ids
        }
