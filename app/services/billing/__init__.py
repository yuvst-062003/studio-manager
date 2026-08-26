"""W4's cross-lane seam: `BillingService.create_charge` and `recompute_charge_status`.

Plan §1.2 -- **M7 is a pure caller.** §5.12's event fee has to appear on the family's
balance, and M6 is the only lane that may write a billing table. `create_charge` is the
whole of the contract between them: it landed on `main` in W4's contract commit, before
either worktree existed, so neither lane could change it unilaterally.

**The bodies were `NotImplementedError` until lane MONEY merged**, per §2.2 item 4: "Empty-
bodied service classes with **real signatures and real return types** for anything the
*other* lane calls." A stub that returned a detached `Charge` would have let M7 build an
event-fee flow that passed its own tests and settled nothing. They are implemented now, and
`tests/contracts/test_seams.py` has moved from asserting that they raise to asserting the
shape M7 calls them through -- the same move lane SCHEDULE made for
`ScheduleService.materialize_sessions`.

**The session arrives on the constructor.** Neither seam signature has room for one and
W4's contract fixed both before this worktree existed, so `BillingService(session)` is how
the tenancy gets in. The service has NO studio filter of its own: it is exactly as scoped
as the session it is handed, which is why `create_charge` still takes `studio_id` and
checks it against the session's scope rather than trusting either alone.
"""

from __future__ import annotations

from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.service import PERIODIC_KINDS, BillingService

__all__ = [
    "PERIODIC_KINDS",
    "BillingService",
    "ConflictError",
    "NotFoundError",
    "RefusedError",
]
