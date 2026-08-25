"""W2's cross-lane seam: `ScheduleService.materialize_sessions`.

Plan §1.2 — **M3 is a pure reader.** Its trial-slot picker (§5.4, parent `13a`) needs the
next bookable sessions for a group, and M2 is the only lane that may write `session`. This
signature is the whole of the contract between them: it lands on `main` in W2's contract
commit, before either worktree exists, so neither lane can change it unilaterally.

**The body is `NotImplementedError` on purpose.** §2.2 item 4: "Empty-bodied service
classes with **real signatures and real return types** for anything the *other* lane
calls. Each raises `NotImplementedError` and has a test asserting the signature." A stub
that returned `[]` would let M3 build against a lie and pass its own tests while the
picker showed an empty list in production.
"""

from __future__ import annotations

import uuid
from datetime import date

from app.models.schedule import Session


class ScheduleService:
    """§5.6's session materialization. Lane SCHEDULE (M2) fills these in.

    **The invariant every method here inherits**, from §5.6 and E2E-5: changing a rule
    rewrites **only future** sessions. A session in the past, a session carrying
    `is_manually_edited`, and an ad-hoc session are never overwritten. That rule lives
    with the writer, not with the callers, which is why M3 reads through this class rather
    than querying `session` itself.
    """

    def materialize_sessions(
        self,
        group_id: uuid.UUID,
        from_date: date,
        to_date: date,
    ) -> list[Session]:
        """Every session for `group_id` in `[from_date, to_date]`, in start order.

        Materialized, not projected: the rows exist in `session` before this returns, so a
        caller may hold their ids. §5.6 generates a whole training year at once and this
        is the range-scoped form of the same operation.

        Closures (§5.6) are skipped. A date the studio is closed produces no session, and
        that is why a parent's month view can show a gap without a cancelled row.
        """
        raise NotImplementedError("M2 — lane SCHEDULE owns app/services/schedule/**")
