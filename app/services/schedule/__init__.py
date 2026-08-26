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

from app.services.schedule.service import ConflictError, NotFoundError, ScheduleService

__all__ = ["ConflictError", "NotFoundError", "ScheduleService"]
