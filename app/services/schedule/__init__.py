"""W2's cross-lane seam: `ScheduleService.materialize_sessions`.

Plan §1.2 — **M3 is a pure reader.** Its trial-slot picker (§5.4, parent `13a`) needs the
next bookable sessions for a group, and M2 is the only lane that may write `session`. This
signature is the whole of the contract between them: it lands on `main` in W2's contract
commit, before either worktree exists, so neither lane can change it unilaterally.

**The body was `NotImplementedError` until lane SCHEDULE merged**, per §2.2 item 4:
"Empty-bodied service classes with **real signatures and real return types** for anything
the *other* lane calls. Each raises `NotImplementedError` and has a test asserting the
signature." A stub that returned `[]` would have let M3 build against a lie and pass its
own tests while the picker showed an empty list in production. It is now implemented, and
`tests/contracts/test_seams.py` has moved from asserting that it raises to asserting the
shape M3 calls it through.

**The session arrives on the constructor.** The seam's own signature has no room for one —
it is `(group_id, from_date, to_date)` and W2's contract commit fixed that before either
worktree existed — so `ScheduleService(session)` is how the tenancy gets in. That matters
to callers: the service has NO studio filter of its own, so it is exactly as scoped as the
session it is handed. `app/routers/public.py` is the one caller that does not already hold
a `TenantSession`, and it opens a scope rather than passing its unscoped one.
"""

from __future__ import annotations

from app.services.schedule.service import ConflictError, NotFoundError, ScheduleService

__all__ = ["ConflictError", "NotFoundError", "ScheduleService"]
