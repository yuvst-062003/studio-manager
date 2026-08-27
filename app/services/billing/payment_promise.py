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

from app.models.billing import Charge, PaymentAllocation
from app.models.payment_promise import PROMISE_METHODS, PaymentPromise, PaymentPromiseCharge
from app.models.person import Person
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

    def create(
        self,
        studio_id: uuid.UUID,
        *,
        payer_person_id: uuid.UUID,
        charge_ids: list[uuid.UUID],
        at: datetime,
        method: str = "cash",
    ) -> PaymentPromise:
        """§5.10's human-recorded routes, said out loud. Every refusal is reachable from
        a client.

        A charge already inside another PENDING promise is refused -- two live promises
        over one month would show the manager the same money twice. Promises already
        decided do not block: a declined promise's charges are free to try again.
        """
        if method not in PROMISE_METHODS:
            raise RefusedError(f"method must be one of {', '.join(PROMISE_METHODS)}")
        if not charge_ids:
            raise RefusedError("a payment promise needs at least one charge")
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
            total_agorot=total,
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
            diff={"total_agorot": total, "charges": len(charges), "method": method},
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

        Records one payment over what the promise's charges are STILL owed and allocates
        it to exactly those charges. A promise whose charges were all settled some other
        way in the meantime is marked received with no payment at all -- the money
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
        if outstanding_total > 0:
            PaymentService(self._session).record(
                row.studio_id,
                payer_person_id=row.payer_person_id,
                method=row.method,
                amount_agorot=outstanding_total,
                received_at=at,
                charge_ids=payable,
                recorded_by_person_id=actor_person_id,
                note=f"payment promise {row.id}",
            )
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
            diff={"amount_agorot": outstanding_total},
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
