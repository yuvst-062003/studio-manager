"""The payment-promise lifecycle: raised by a payer, ended by a manager, exactly once.

See app/models/payment_promise.py for the object's reasoning. The settlement rule that
matters lives in ``confirm``: the recorded payment is the sum of what the promise's
charges are STILL owed at confirmation time -- never the snapshot -- so a promise raised
before a card payment that landed in between shrinks instead of double-collecting. All
money movement goes through ``PaymentService.record``, the one writer.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.billing import Charge, PaymentAllocation, PricePlan
from app.models.payment_promise import PROMISE_METHODS, PaymentPromise, PaymentPromiseCharge
from app.models.people import Student
from app.models.person import Guardian, Person
from app.services.audit import AuditService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.payments import PaymentService


class PaymentPromiseService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _outstanding(self, charge: Charge) -> int:
        allocated = self._session.execute(
            select(func.coalesce(func.sum(PaymentAllocation.amount_agorot), 0)).where(
                PaymentAllocation.charge_id == charge.id
            )
        ).scalar_one()
        return charge.amount_agorot - int(allocated)

    def monthly_total_agorot(self, payer_person_id: uuid.UUID) -> int:
        """What one month of tuition costs this payer, across ALL their active children.

        Prepayment spec §4: the sum runs over every active student, because a parent with
        two children thinks in "three months for both" and credit is payer-level in any
        case. Only plans that are still open count -- a student pointing at last year's
        closed plan is priced by whatever the run will actually raise, and the run reads
        `student.price_plan_id` directly, so a closed plan there is a data problem this
        method must not paper over by inventing a price.

        Integer arithmetic throughout (G2). `prepay_months x monthly` never touches a float.
        """
        rows = self._session.execute(
            select(func.coalesce(func.sum(PricePlan.monthly_amount_agorot), 0))
            .select_from(Student)
            .join(Guardian, Guardian.student_id == Student.id)
            .join(PricePlan, PricePlan.id == Student.price_plan_id)
            .where(
                Guardian.person_id == payer_person_id,
                Student.status == "active",
                PricePlan.active_to.is_(None),
            )
        ).scalar_one()
        return int(rows)

    def create(
        self,
        studio_id: uuid.UUID,
        *,
        payer_person_id: uuid.UUID,
        charge_ids: list[uuid.UUID],
        at: datetime,
        method: str = "cash",
        prepay_months: int = 0,
    ) -> PaymentPromise:
        """§5.10's human-recorded routes, said out loud. Every refusal is reachable from
        a client.

        A charge already inside another PENDING promise is refused -- two live promises
        over one month would show the manager the same money twice. Promises already
        decided do not block: a declined promise's charges are free to try again.

        **The two halves never double-count.** `charge_ids` settles charges that exist;
        `prepay_months` buys whole months that do not, priced at the payer's monthly total.
        Either may be empty -- a family with nothing owed may still pay three months
        forward, and a family with no plan may still settle a shop item -- but a promise
        that is neither is a promise about nothing.
        """
        if method not in PROMISE_METHODS:
            raise RefusedError(f"method must be one of {', '.join(PROMISE_METHODS)}")
        if prepay_months < 0:
            raise RefusedError("prepay_months cannot be negative")
        forward = prepay_months * self.monthly_total_agorot(payer_person_id)
        if not charge_ids and forward <= 0:
            raise RefusedError(
                "a payment promise needs at least one charge or a month bought forward"
            )
        already_pending = set(
            self._session.execute(
                select(PaymentPromiseCharge.charge_id)
                .join(
                    PaymentPromise,
                    PaymentPromise.id == PaymentPromiseCharge.payment_promise_id,
                )
                .where(
                    PaymentPromise.status == "pending",
                    PaymentPromiseCharge.charge_id.in_(charge_ids),
                )
            ).scalars()
        )
        total = 0
        charges: list[Charge] = []
        for charge_id in charge_ids:
            charge = self._session.get(Charge, charge_id)
            if charge is None or charge.studio_id != studio_id:
                raise NotFoundError(f"no charge {charge_id}")
            if charge.payer_person_id != payer_person_id:
                # Same rule as payment orders: a parent may offer to pay only what THEY
                # owe. 404, not 403 -- a foreign charge id must not be confirmed to exist.
                raise NotFoundError(f"charge {charge_id} is not owed by this payer")
            if charge.status != "open":
                raise RefusedError(f"charge {charge_id} is {charge.status}, not open")
            if charge_id in already_pending:
                raise ConflictError(f"charge {charge_id} is already in a pending promise")
            outstanding = self._outstanding(charge)
            if outstanding <= 0:
                raise RefusedError(f"charge {charge_id} has nothing outstanding")
            total += outstanding
            charges.append(charge)

        row = PaymentPromise(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            status="pending",
            method=method,
            # Display, never settlement -- what the parent saw when they raised it.
            # Confirmation recomputes both halves.
            total_agorot=total + forward,
            prepay_months=prepay_months,
        )
        self._session.add(row)
        self._session.flush()
        for charge in charges:
            self._session.add(
                PaymentPromiseCharge(
                    studio_id=studio_id, payment_promise_id=row.id, charge_id=charge.id
                )
            )
        AuditService.record(
            self._session,
            action="payment_promise.create",
            entity_type="payment_promise",
            entity_id=row.id,
            studio_id=studio_id,
            actor_person_id=payer_person_id,
            diff={
                "total_agorot": total + forward,
                "charges": len(charges),
                "method": method,
                "prepay_months": prepay_months,
            },
        )
        self._session.flush()
        return row

    def charge_ids_of(self, promise_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.execute(
                select(PaymentPromiseCharge.charge_id)
                .where(PaymentPromiseCharge.payment_promise_id == promise_id)
                .order_by(PaymentPromiseCharge.charge_id)
            ).scalars()
        )

    def mine(self, payer_person_id: uuid.UUID) -> list[PaymentPromise]:
        return list(
            self._session.execute(
                select(PaymentPromise)
                .where(PaymentPromise.payer_person_id == payer_person_id)
                .order_by(PaymentPromise.created_at.desc())
                .limit(50)
            ).scalars()
        )

    def list_promises(
        self, status: str | None = None, method: str | None = None
    ) -> list[tuple[PaymentPromise, str, int]]:
        """(promise, payer display name, charge count) -- the manager's list, newest
        first."""
        stmt = (
            select(
                PaymentPromise,
                Person.first_name,
                Person.last_name,
                func.count(PaymentPromiseCharge.id),
            )
            .join(Person, Person.id == PaymentPromise.payer_person_id)
            .join(
                PaymentPromiseCharge,
                PaymentPromiseCharge.payment_promise_id == PaymentPromise.id,
            )
            .group_by(PaymentPromise.id, Person.first_name, Person.last_name)
            .order_by(PaymentPromise.created_at.desc())
            .limit(100)
        )
        if status is not None:
            stmt = stmt.where(PaymentPromise.status == status)
        if method is not None:
            stmt = stmt.where(PaymentPromise.method == method)
        return [
            (row, f"{first} {last}", int(count))
            for row, first, last, count in self._session.execute(stmt).all()
        ]

    def _decidable(self, promise_id: uuid.UUID) -> PaymentPromise:
        row = self._session.get(PaymentPromise, promise_id)
        if row is None:
            raise NotFoundError(f"no payment promise {promise_id}")
        if row.status != "pending":
            raise ConflictError(f"payment promise {promise_id} is already {row.status}")
        return row

    def confirm(
        self, promise_id: uuid.UUID, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> PaymentPromise:
        """The manager's ✓ -- the money changed hands.

        Records ONE payment for both halves and allocates it to exactly the promise's own
        charges. Whatever remains is left **unallocated**, and that remainder is the
        credit the billing run's step 7 will spend over the coming months. There is no
        second mechanism and no "prepayment" row: a payment with a short allocation list
        already means this.

        **Both halves are recomputed here, never read from `total_agorot`.** The charges
        half can only shrink -- a card payment that landed in between settles the month and
        the promise collects less rather than double-collecting, which is the rule this
        object has always had. The forward half is re-priced at the payer's monthly total
        as it stands now, because that is the price of the months being bought; the two can
        only disagree if a plan change lands between raising and confirming, and a plan
        change moves on the 1st while a promise lives for days.

        A promise whose charges were all settled some other way in the meantime and which
        buys no months forward is marked received with no payment at all -- the money
        conversation is over either way, and inventing a zero payment would put a
        meaningless row in the ledger.
        """
        row = self._decidable(promise_id)
        charge_ids = self.charge_ids_of(promise_id)
        outstanding_total = 0
        payable: list[uuid.UUID] = []
        for charge_id in charge_ids:
            charge = self._session.get(Charge, charge_id)
            if charge is None or charge.status != "open":
                continue
            outstanding = self._outstanding(charge)
            if outstanding > 0:
                outstanding_total += outstanding
                payable.append(charge_id)
        forward = row.prepay_months * self.monthly_total_agorot(row.payer_person_id)
        amount = outstanding_total + forward
        if amount > 0:
            payment = PaymentService(self._session).record(
                row.studio_id,
                payer_person_id=row.payer_person_id,
                method=row.method,
                amount_agorot=amount,
                # Exactly the promise's own charges, never `allocate_oldest_first`: this
                # money was offered over named months, and the surplus is deliberate rather
                # than something to spread over whatever else happens to be open. Step 7
                # spends it, on the run, in the order the ledger decides.
                received_at=at,
                charge_ids=payable,
                recorded_by_person_id=actor_person_id,
                note=f"payment promise {row.id}",
            )
            row.payment_id = payment.id
        row.status = "received"
        row.decided_by_person_id = actor_person_id
        row.decided_at = at
        AuditService.record(
            self._session,
            action="payment_promise.confirm",
            entity_type="payment_promise",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            diff={"amount_agorot": amount, "forward_agorot": forward},
        )
        self._session.flush()
        return row

    def decline(
        self, promise_id: uuid.UUID, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> PaymentPromise:
        """The manager's ✗ -- no money arrived. The charges stay open and payable by any
        route, and the payer's own list shows the decline rather than leaving them to
        infer it from silence."""
        row = self._decidable(promise_id)
        row.status = "declined"
        row.decided_by_person_id = actor_person_id
        row.decided_at = at
        AuditService.record(
            self._session,
            action="payment_promise.decline",
            entity_type="payment_promise",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
        )
        self._session.flush()
        return row
