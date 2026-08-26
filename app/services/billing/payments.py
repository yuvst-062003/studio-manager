"""§5.10's money that actually arrived, by any route, and the allocation engine that
settles charges with it.

**Nothing in this module assigns `charge.status`.** It records allocations and then calls
`BillingService.recompute_charge_status`, which is the field's only writer (§4.3). A method
here that set the status would pass every test that checks a settled charge and fail the one
that matters: after a reversal the allocations go and the status would stay.

**G8 lands here.** `standing_order` is recorded by a human on exactly the same flow as
`bank_transfer` and `cash`, because our provider cannot create a per-payer mandate, cannot
vary its amount per payer, and its recurring callbacks carry no customer identifier. That
makes this module the *normal* route for recurring money, not an exception path.

**§11.7 -- nothing here logs a card owner name or last four digits.** Those live on
`payer_fingerprint` and `upay_ipn_record`, which are data on a manager-only screen. A log
line carrying them is a copy nobody can redact later.

**Allocation never exceeds what a charge is owed.** The remainder stays unallocated and
surfaces as §5.10's overpayment, which a manager can carry forward. Over-allocating would
make the ledger disagree with the receipt the family was handed.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.billing import Charge, Payment, PaymentAllocation
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.service import BillingService

#: §4.3 -- the statuses a charge can still receive money against. `void` and `written_off`
#: are decisions a human made, and allocating against one would silently undo it.
_ALLOCATABLE_STATUSES = ("open",)


class PaymentService:
    """Recording money and settling charges with it. Session on the constructor, like every
    service in this lane."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._billing = BillingService(session)

    # -- recording -------------------------------------------------------------
    def record(
        self,
        studio_id: uuid.UUID,
        *,
        payer_person_id: uuid.UUID,
        method: str,
        amount_agorot: int,
        received_at: datetime,
        charge_ids: list[uuid.UUID],
        recorded_by_person_id: uuid.UUID | None,
        external_receipt_number: str | None = None,
        note: str | None = None,
        payment_order_id: uuid.UUID | None = None,
        upay_ipn_id: uuid.UUID | None = None,
    ) -> Payment:
        """One arrival of money, plus the charges it settles.

        `charge_ids` may be empty: §5.10's `amount_mismatch` records a payment for the real
        amount received and allocates it to **nothing**, and the reconciliation queue does
        the same for an unmatched הוראת קבע payment until a human says whose it is.
        """
        if not isinstance(amount_agorot, int) or isinstance(amount_agorot, bool):
            raise TypeError("amount_agorot must be an integer count of agorot (G2)")
        payment = Payment(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            method=method,
            amount_agorot=amount_agorot,
            received_at=received_at,
            recorded_by_person_id=recorded_by_person_id,
            external_receipt_number=external_receipt_number,
            note=note,
            payment_order_id=payment_order_id,
            upay_ipn_id=upay_ipn_id,
        )
        self._session.add(payment)
        self._session.flush()
        if charge_ids:
            self.allocate(payment.id, charge_ids)
        return payment

    def get(self, payment_id: uuid.UUID) -> Payment:
        payment = self._session.get(Payment, payment_id)
        if payment is None:
            raise NotFoundError(f"no payment {payment_id}")
        return payment

    def list_payments(
        self,
        *,
        payer_person_id: uuid.UUID | None = None,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[Payment], uuid.UUID | None]:
        stmt = select(Payment)
        if payer_person_id is not None:
            stmt = stmt.where(Payment.payer_person_id == payer_person_id)
        if after is not None:
            stmt = stmt.where(Payment.id > after)
        rows = list(self._session.execute(stmt.order_by(Payment.id).limit(limit + 1)).scalars())
        has_more = len(rows) > limit
        rows = rows[:limit]
        return rows, (rows[-1].id if has_more and rows else None)

    def allocations_of(self, payment_id: uuid.UUID) -> list[PaymentAllocation]:
        return list(
            self._session.execute(
                select(PaymentAllocation)
                .where(PaymentAllocation.payment_id == payment_id)
                .order_by(PaymentAllocation.id)
            ).scalars()
        )

    # -- allocation ------------------------------------------------------------
    def allocate(
        self, payment_id: uuid.UUID, charge_ids: list[uuid.UUID]
    ) -> list[PaymentAllocation]:
        """Allocate a payment against named charges, in the order given.

        Each allocation is `min(what the charge still owes, what the payment still holds)`,
        so neither side can be exceeded. Refuses when the request would need more money than
        the payment has -- silently allocating less would settle some of a manager's chosen
        charges and not others, with nothing saying which.
        """
        payment = self._payable(payment_id)
        remaining = self.unallocated_agorot(payment_id)
        wanted = 0
        checked: list[Charge] = []
        for charge_id in charge_ids:
            charge = self._allocatable_charge(payment, charge_id)
            checked.append(charge)
            wanted += charge.amount_agorot - self._billing.allocated_agorot(charge_id)
        if wanted > remaining:
            # Refused whole rather than satisfied in part. Allocating as far as the money
            # went would settle some of a manager's chosen charges and not others, with
            # nothing on the screen saying which -- and they would believe all of them were
            # paid. `allocate_oldest_first` is the sweeping path and it is allowed to stop
            # halfway, because there nobody chose the list.
            raise RefusedError(f"allocating {wanted} agorot from a payment with {remaining} left")

        created: list[PaymentAllocation] = []
        for charge in checked:
            row = self._allocate_one(payment, charge, cap=remaining)
            if row is None:
                continue
            remaining -= row.amount_agorot
            created.append(row)
        return created

    def _allocate_one(
        self, payment: Payment, charge: Charge, *, cap: int
    ) -> PaymentAllocation | None:
        """One allocation row, for the smaller of what the charge owes and `cap`.

        Neither side can be exceeded: over-allocating a charge makes the ledger disagree
        with the receipt the family was handed, and over-allocating a payment invents money.
        Returns `None` when there is nothing left to do on either side.
        """
        outstanding = charge.amount_agorot - self._billing.allocated_agorot(charge.id)
        amount = min(outstanding, cap)
        if amount <= 0:
            return None
        row = PaymentAllocation(
            studio_id=payment.studio_id,
            payment_id=payment.id,
            charge_id=charge.id,
            amount_agorot=amount,
        )
        self._session.add(row)
        try:
            self._session.flush()
        except IntegrityError as exc:
            # `uq_payment_allocation_payment_id_charge_id`, as the concurrency backstop.
            # `_allocatable_charge` already refuses a repeat it can see; this catches the
            # one it cannot, where two requests both passed the read.
            raise ConflictError(
                f"payment {payment.id} is already allocated to charge {charge.id}"
            ) from exc
        # The one writer, every time what is allocated changes.
        self._billing.recompute_charge_status(charge.id)
        return row

    def _payable(self, payment_id: uuid.UUID) -> Payment:
        payment = self.get(payment_id)
        if payment.reversed_at is not None:
            raise RefusedError(
                f"payment {payment_id} was reversed on {payment.reversed_at}; its money is "
                "recorded as never having arrived"
            )
        return payment

    def _allocatable_charge(self, payment: Payment, charge_id: uuid.UUID) -> Charge:
        """The four ways a named charge can be wrong, refused with a message each.

        `charge_ids` arrives from a caller, so every one of these is reachable from a
        client rather than only from a bug.
        """
        charge = self._session.get(Charge, charge_id)
        if charge is None:
            raise NotFoundError(f"no charge {charge_id}")
        if charge.payer_person_id != payment.payer_person_id:
            # Clearing one family's debt with another family's money is the single worst
            # outcome this table can produce.
            raise RefusedError(f"charge {charge_id} is not owed by this payment's payer")
        if charge.status not in _ALLOCATABLE_STATUSES:
            raise RefusedError(f"charge {charge_id} is {charge.status}, not open")
        already = self._session.execute(
            select(PaymentAllocation.id).where(
                PaymentAllocation.payment_id == payment.id,
                PaymentAllocation.charge_id == charge_id,
            )
        ).scalar_one_or_none()
        if already is not None:
            # Refused rather than treated as a no-op. A manager who clicks twice must learn
            # that the second click did nothing; silently succeeding tells them money moved.
            raise ConflictError(f"payment {payment.id} is already allocated to charge {charge_id}")
        return charge

    def allocate_oldest_first(
        self, payment_id: uuid.UUID, *, payer_person_id: uuid.UUID
    ) -> list[PaymentAllocation]:
        """§5.10's reconciliation step 3 -- 'allocates it to that payer's open charges
        oldest-first'.

        **Positive charges only.** A credit is a negative charge, and allocating money
        "against" one would settle the discount and leave the debt open -- exactly
        backwards. Ordered by `due_date` then `id`: three charges due the same day must
        allocate in a stable order, or a re-run allocates differently and the test that
        proves oldest-first is flaky.
        """
        candidates = list(
            self._session.execute(
                select(Charge.id)
                .where(
                    Charge.payer_person_id == payer_person_id,
                    Charge.status == "open",
                    Charge.amount_agorot > 0,
                )
                .order_by(Charge.due_date, Charge.id)
            ).scalars()
        )
        payment = self._payable(payment_id)
        created: list[PaymentAllocation] = []
        for charge_id in candidates:
            remaining = self.unallocated_agorot(payment_id)
            if remaining <= 0:
                break
            charge = self._session.get(Charge, charge_id)
            if charge is None:  # pragma: no cover -- selected by id a moment ago
                continue
            # `_allocate_one` rather than `allocate`: this path is ALLOWED to stop halfway.
            # Nobody chose this list, so a payment that covers two and a half months settles
            # two and part of the third, which is exactly §5.10's oldest-first rule.
            row = self._allocate_one(payment, charge, cap=remaining)
            if row is not None:
                created.append(row)
        return created

    def unallocated_agorot(self, payment_id: uuid.UUID) -> int:
        """What a payment still holds. §5.10's overpayment is this being positive after
        allocation, and the reconciliation queue is where a manager carries it forward."""
        payment = self.get(payment_id)
        allocated = self._session.execute(
            select(func.coalesce(func.sum(PaymentAllocation.amount_agorot), 0)).where(
                PaymentAllocation.payment_id == payment_id
            )
        ).scalar_one()
        return payment.amount_agorot - int(allocated)

    # -- reversal --------------------------------------------------------------
    def reverse(
        self,
        payment_id: uuid.UUID,
        *,
        reason: str,
        actor_person_id: uuid.UUID | None,
        at: datetime,
    ) -> Payment:
        """A returned cheque, a chargeback, a payment recorded against the wrong family.

        §11.4 -- never a DELETE. Israeli tax law requires roughly seven years of financial
        records, so a reversal is a new fact on the row. The allocations DO go, because they
        were claims about money that turned out not to have arrived, and every charge they
        touched is recomputed -- otherwise the club shows a month as paid it was never paid
        for, invisible in every debt report.
        """
        payment = self.get(payment_id)
        if payment.reversed_at is not None:
            raise ConflictError(
                f"payment {payment_id} was already reversed on {payment.reversed_at}"
            )
        if not reason.strip():
            raise RefusedError(
                "a reversal needs a reason -- it is the only thing that makes it auditable"
            )
        touched = [row.charge_id for row in self.allocations_of(payment_id)]
        self._session.execute(
            delete(PaymentAllocation).where(PaymentAllocation.payment_id == payment_id)
        )
        payment.reversed_at = at
        payment.reversal_reason = reason.strip()
        self._session.flush()
        for charge_id in touched:
            self._billing.recompute_charge_status(charge_id)
        return payment
