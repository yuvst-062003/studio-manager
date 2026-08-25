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


class HealthService:
    """§5.5's derived-flag pipeline. Lane HEALTH (M4) fills these in.

    **The invariant every method here inherits.** Coaches see `derived_flags` — booleans
    only. Reading the full declaration requires manager or owner and **every read is
    audit-logged** (§4.3, §11.2). Nothing on this class returns answers.
    """

    def recompute_derived_flags(self, student_id: uuid.UUID) -> dict[str, bool]:
        """Re-derive `health_declaration.derived_flags` for one student, and return them.

        Booleans only (§4.3): `{"asthma": True, "allergy": True, "medication": False}`.
        Never free text — a free-text flag is a medical description on a coach's screen,
        which is exactly what the flag mechanism replaced.

        Returns an empty mapping for a student with no declaration. That is not an error:
        `student.health_status` is `missing`, the roster renders
        `⚠ הצהרת בריאות חסרה`, and §5.5 is explicit that nothing on the mat is blocked.
        """
        raise NotImplementedError("M4 — lane HEALTH owns app/services/health/**")
