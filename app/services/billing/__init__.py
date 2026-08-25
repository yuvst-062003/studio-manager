"""W4's cross-lane seam: `BillingService.create_charge` and `recompute_charge_status`.

Plan §1.2 — **M7 is a pure caller.** §5.12's event fee has to appear on the family's
balance, and M6 is the only lane that may write a billing table. `create_charge` is the
whole of the contract between them: it lands on `main` in W4's contract commit, before
either worktree exists, so neither lane can change it unilaterally.

**The body is `NotImplementedError` on purpose.** §2.2 item 4: "Empty-bodied service
classes with **real signatures and real return types** for anything the *other* lane
calls. Each raises `NotImplementedError` and has a test asserting the signature." A stub
that returned a detached `Charge` would let M7 build an event-fee flow that passes its own
tests and settles nothing.

**Why `studio_id` is a parameter rather than ambient.** Every other tenant-scoped call in
this codebase reads the studio from the request through `TenantSession`. The monthly
billing run is a **worker** (§5.10) -- there is no request, so there is nothing to infer
from, and `TenantMixin` fails closed rather than returning every studio's rows. Passing it
explicitly is what lets the same method serve the worker and the manual route.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

# The model lives in `app/models/_pending/` until W4's contract commit migrates it, and
# importing it at runtime would register `charge` in `Base.metadata` with no table behind
# it -- which is `alembic check` red and a demo reset that fails on a missing relation.
# `from __future__ import annotations` makes every annotation a string, so the guard costs
# the signature nothing: mypy and the IDE resolve `Charge`, the interpreter never does.
if TYPE_CHECKING:
    from app.models._pending.billing import Charge

from app.schemas.billing import ChargeKind


class BillingService:
    """§5.10's ledger. Lane MONEY (M6) fills these in.

    **The invariant every method here inherits**, from §4.3: *charges are never mutated to
    record payment*. A charge is settled when the sum of its `payment_allocation` rows
    equals `amount_agorot`, and `charge.status` is a derived cache with exactly one writer
    -- `recompute_charge_status`. Anything on this class that appeared to set a status
    directly would give the cache a second writer, and a second writer is how a family's
    balance starts disagreeing with the receipts they were sent.

    **G8 constrains what may ever live here.** הוראת קבע mandates cannot be created
    programmatically by our provider, so there is no `create_subscription`, no recurring
    billing job, and no method that charges a card on a schedule. Recurring money is marked
    paid by a human, in the same flow as a bank transfer.
    """

    def create_charge(
        self,
        studio_id: uuid.UUID,
        payer_person_id: uuid.UUID,
        kind: ChargeKind,
        amount_agorot: int,
        due_date: date,
        *,
        student_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
    ) -> Charge:
        """Create one charge and return it. The single entry point for every route that
        puts money on a family's balance: the monthly run (§5.10 step 1), a manual charge,
        and M7's event fee.

        `amount_agorot` is an integer count of agorot (G2). Not shekels, not a decimal --
        a float here is right by luck for most prices and one agora short on an ordinary
        family of them, which surfaces as a balance that disagrees with the receipt.

        `student_id` and `event_id` are keyword-only, and that is load-bearing rather than
        stylistic: both are `UUID | None` in adjacent positions, so positionally an event
        id binds happily to `student_id` and no type checker can see the mistake. M7 is
        the lane most likely to make it, being the one that passes `event_id` at all.

        A charge for a whole studio's month is created one row at a time. §4.3's
        idempotency key -- `UNIQUE(student_id, period_year, period_month, kind)` -- is what
        makes a re-run after a partial failure safe, so this may be called again for a
        period already partly billed. **Per student, not per enrollment** (C11): a child in
        two groups is billed once, at the plan on `student.price_plan_id`.
        """
        raise NotImplementedError("M6 — lane MONEY owns app/services/billing/**")

    def recompute_charge_status(self, charge_id: uuid.UUID) -> None:
        """Re-derive `charge.status` from the charge's `payment_allocation` rows.

        **The one place `charge.status` is maintained** (§4.3). Every route that changes
        what has been allocated -- a payment recorded, a payment reversed, a charge voided
        or written off -- calls this rather than setting the field, because a derived cache
        with two writers is a cache that is wrong in exactly the cases nobody tests.

        Returns `None` deliberately. Handing back the `Charge` would invite a caller to
        read the status off the return value and hold it, which is how a second reader
        becomes a second writer two milestones later.
        """
        raise NotImplementedError("M6 — lane MONEY owns app/services/billing/**")
