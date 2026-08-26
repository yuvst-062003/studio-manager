"""§5.10's ledger core: the two W4 seam methods, and the one writer of `charge.status`.

**Charges are never mutated to record payment** (§4.3). A charge is settled when its
`payment_allocation` rows sum to `amount_agorot`; `status` is a derived cache and
`recompute_charge_status` is its only writer. Every route that changes what is allocated
calls it rather than setting the field, because a derived cache with two writers is wrong
in exactly the cases nobody tests.

**The session arrives on the constructor**, the way `ScheduleService(session)` does and for
the same reason: W4's contract commit fixed both seam signatures before this worktree
existed, and neither has room for one. The service has NO studio filter of its own -- it is
exactly as scoped as the session it is handed.

**Why `studio_id` is still a parameter.** The monthly run is a worker: there is no request,
so `TenantSession` has nothing to infer from and `TenantMixin` fails closed rather than
returning every studio's rows. Under a request the session already carries a scope, and the
two disagreeing means a caller has confused two studios -- so it is checked, not trusted.

**Where the period comes from.** The seam takes a `due_date` and no period, yet its own
docstring keys idempotence on `UNIQUE(student_id, period_year, period_month, kind)`. Both
are only true together if the period is derived, and `due_date` is the only argument
carrying a month -- so `tuition` derives it and every other kind carries NULL, which is
exactly what the index's `postgresql_where` was written to allow. `BillingRunService` dues
every tuition charge on the last day of the period it bills, so the two cannot disagree.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.tenancy import get_current_studio_id
from app.models.billing import Charge, PaymentAllocation
from app.schemas.billing import ChargeKind
from app.services.billing.errors import ConflictError, NotFoundError

if TYPE_CHECKING:  # pragma: no cover -- `Charge` is imported eagerly above for the ORM
    pass

#: `tuition` is the one kind a period belongs to, so it is the one kind the partial unique
#: index applies to. A `registration` fee is charged once per student for good (§5.10 step
#: 6) and a `manual` charge may legitimately repeat, so both carry a NULL period.
PERIODIC_KINDS = frozenset({"tuition"})

#: §4.3 -- `charge  created_by(billing_run|manual|event)`. Provenance, not state. A tuition
#: or registration charge is always the run's; an event fee is always M7's.
_ORIGIN_BY_KIND: dict[str, str] = {
    "tuition": "billing_run",
    "registration": "billing_run",
    "event": "event",
    "manual": "manual",
}


class BillingService:
    """§5.10's ledger. See the module docstring for the invariant every method inherits.

    **G8 constrains what may ever live here.** הוראת קבע mandates cannot be created
    programmatically by our provider, so there is no `create_subscription`, no recurring
    billing job, and no method that charges a card on a schedule. Recurring money is marked
    paid by a human, in the same flow as a bank transfer.
    """

    #: Exported so `run.py` and the tests name the rule once.
    PERIODIC_KINDS = PERIODIC_KINDS

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- the W4 seam ---------------------------------------------------------
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

        `student_id` and `event_id` are keyword-only, and that is load-bearing rather than
        stylistic: both are `UUID | None` in adjacent positions, so positionally an event
        id binds happily to `student_id` and no type checker can see the mistake.

        Raises `ConflictError` when the period is already billed -- §5.10 step 5's
        idempotence, enforced by the database rather than by a read-then-write that two
        concurrent runs would both pass.
        """
        self._require_scope(studio_id)
        # G2, stated where it can be enforced. The annotation says `int` and Python does
        # not check it; 250.0 agorot reaching an INTEGER column rounds silently. `bool` is
        # an `int` subclass and `True` would insert one agora, so it is excluded too.
        if not isinstance(amount_agorot, int) or isinstance(amount_agorot, bool):
            raise TypeError(
                "amount_agorot must be an integer count of agorot (G2), not "
                f"{type(amount_agorot).__name__}"
            )
        if kind not in _ORIGIN_BY_KIND:
            raise ValueError(f"unknown charge kind {kind!r}")

        periodic = kind in PERIODIC_KINDS
        charge = Charge(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            student_id=student_id,
            kind=kind,
            # The due date is the only argument carrying a month, and the run dues every
            # tuition charge on the last day of the period it bills.
            period_year=due_date.year if periodic else None,
            period_month=due_date.month if periodic else None,
            amount_agorot=amount_agorot,
            due_date=due_date,
            # Derived from the first moment rather than defaulted and then corrected:
            # nothing is allocated yet, so `open` is what recompute would say if asked.
            status="open",
            created_by=_ORIGIN_BY_KIND[kind],
        )
        self._session.add(charge)
        try:
            self._session.flush()
        except IntegrityError as exc:
            raise ConflictError(
                f"{kind} for student {student_id} in "
                f"{due_date.year}-{due_date.month:02d} already exists"
            ) from exc
        return charge

    def recompute_charge_status(self, charge_id: uuid.UUID) -> None:
        """Re-derive `charge.status` from the charge's `payment_allocation` rows.

        **The one place `charge.status` is maintained** (§4.3). Returns `None`
        deliberately: handing back the `Charge` would invite a caller to read the status
        off the return value and hold it, which is how a second reader becomes a second
        writer two milestones later.

        `void` and `written_off` are manager decisions rather than sums, so they are left
        alone -- a written-off charge that acquires a late payment must not silently become
        `open` again. Recording that money is the reconciliation queue's job.
        """
        charge = self._session.get(Charge, charge_id)
        if charge is None:
            raise NotFoundError(f"no charge {charge_id}")
        if charge.status in ("void", "written_off"):
            return
        allocated = self.allocated_agorot(charge_id)
        # A negative charge is a credit (§5.10), so "covered" is about the magnitude being
        # reached, not about `>=` -- which is true for every credit the moment it is made.
        settled = (
            allocated <= charge.amount_agorot
            if charge.amount_agorot < 0
            else allocated >= charge.amount_agorot
        )
        charge.status = "settled" if settled else "open"

    # -- reads other services in this lane share ------------------------------
    def allocated_agorot(self, charge_id: uuid.UUID) -> int:
        """How much of a charge is covered by `payment_allocation` rows.

        `COALESCE` rather than a Python `sum` over loaded rows: a charge settled by nine
        partial payments is nine rows nobody needs in memory, and `ChargeOut` carries this
        on every row of a page.
        """
        total = self._session.execute(
            select(func.coalesce(func.sum(PaymentAllocation.amount_agorot), 0)).where(
                PaymentAllocation.charge_id == charge_id
            )
        ).scalar_one()
        return int(total)

    # -- internals ------------------------------------------------------------
    def _require_scope(self, studio_id: uuid.UUID) -> None:
        """A worker passes the studio and has no scope; a request has both and they must
        agree. Writing a row the session could never read back is the one failure this
        parameter makes possible, so it is the one this checks."""
        scoped = get_current_studio_id()
        if scoped is not None and scoped != studio_id:
            raise NotFoundError(f"studio {studio_id} is not the studio this session is scoped to")
