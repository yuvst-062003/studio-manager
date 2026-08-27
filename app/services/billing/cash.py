"""The cash-request lifecycle: raised by a payer, ended by a manager, exactly once.

See app/models/cash.py for the object's reasoning. The settlement rule that matters
lives in ``confirm``: the recorded payment is the sum of what the request's charges are
STILL owed at confirmation time -- never the snapshot -- so a card payment that landed
between raise and confirm shrinks the cash amount instead of double-collecting. All
money movement goes through ``PaymentService.record``, the one writer.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.billing import Charge, PaymentAllocation
from app.models.cash import CashRequest, CashRequestCharge
from app.models.person import Person
from app.services.audit import AuditService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.payments import PaymentService


class CashService:
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
    ) -> CashRequest:
        """§5.10's cash route, said out loud. Every refusal is reachable from a client.

        A charge already inside another PENDING request is refused -- two live requests
        over one month would show the manager the same money twice. Requests already
        decided do not block: a declined request's charges are free to try again.
        """
        if not charge_ids:
            raise RefusedError("a cash request needs at least one charge")
        already_pending = set(
            self._session.execute(
                select(CashRequestCharge.charge_id)
                .join(CashRequest, CashRequest.id == CashRequestCharge.cash_request_id)
                .where(
                    CashRequest.status == "pending",
                    CashRequestCharge.charge_id.in_(charge_ids),
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
                raise ConflictError(f"charge {charge_id} is already in a pending cash request")
            outstanding = self._outstanding(charge)
            if outstanding <= 0:
                raise RefusedError(f"charge {charge_id} has nothing outstanding")
            total += outstanding
            charges.append(charge)

        row = CashRequest(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            status="pending",
            total_agorot=total,
        )
        self._session.add(row)
        self._session.flush()
        for charge in charges:
            self._session.add(
                CashRequestCharge(studio_id=studio_id, cash_request_id=row.id, charge_id=charge.id)
            )
        AuditService.record(
            self._session,
            action="cash_request.create",
            entity_type="cash_request",
            entity_id=row.id,
            studio_id=studio_id,
            actor_person_id=payer_person_id,
            diff={"total_agorot": total, "charges": len(charges)},
        )
        self._session.flush()
        return row

    def charge_ids_of(self, request_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.execute(
                select(CashRequestCharge.charge_id)
                .where(CashRequestCharge.cash_request_id == request_id)
                .order_by(CashRequestCharge.charge_id)
            ).scalars()
        )

    def mine(self, payer_person_id: uuid.UUID) -> list[CashRequest]:
        return list(
            self._session.execute(
                select(CashRequest)
                .where(CashRequest.payer_person_id == payer_person_id)
                .order_by(CashRequest.created_at.desc())
                .limit(50)
            ).scalars()
        )

    def list_requests(self, status: str | None = None) -> list[tuple[CashRequest, str, int]]:
        """(request, payer display name, charge count) -- the manager's list, newest first."""
        stmt = (
            select(
                CashRequest,
                Person.first_name,
                Person.last_name,
                func.count(CashRequestCharge.id),
            )
            .join(Person, Person.id == CashRequest.payer_person_id)
            .join(CashRequestCharge, CashRequestCharge.cash_request_id == CashRequest.id)
            .group_by(CashRequest.id, Person.first_name, Person.last_name)
            .order_by(CashRequest.created_at.desc())
            .limit(100)
        )
        if status is not None:
            stmt = stmt.where(CashRequest.status == status)
        return [
            (row, f"{first} {last}", int(count))
            for row, first, last, count in self._session.execute(stmt).all()
        ]

    def _decidable(self, request_id: uuid.UUID) -> CashRequest:
        row = self._session.get(CashRequest, request_id)
        if row is None:
            raise NotFoundError(f"no cash request {request_id}")
        if row.status != "pending":
            raise ConflictError(f"cash request {request_id} is already {row.status}")
        return row

    def confirm(
        self, request_id: uuid.UUID, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> CashRequest:
        """The manager's ✓ -- the notes changed hands.

        Records one cash payment over what the request's charges are STILL owed and
        allocates it to exactly those charges. A request whose charges were all settled
        some other way in the meantime is marked received with no payment at all --
        the money conversation is over either way, and inventing a zero payment would
        put a meaningless row in the ledger.
        """
        row = self._decidable(request_id)
        charge_ids = self.charge_ids_of(request_id)
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
                method="cash",
                amount_agorot=outstanding_total,
                received_at=at,
                charge_ids=payable,
                recorded_by_person_id=actor_person_id,
                note=f"cash request {row.id}",
            )
        row.status = "received"
        row.decided_by_person_id = actor_person_id
        row.decided_at = at
        AuditService.record(
            self._session,
            action="cash_request.confirm",
            entity_type="cash_request",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            diff={"amount_agorot": outstanding_total},
        )
        self._session.flush()
        return row

    def decline(
        self, request_id: uuid.UUID, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> CashRequest:
        """The manager's ✗ -- no money arrived. The charges stay open and payable by any
        route, and the payer's own list shows the decline rather than leaving them to
        infer it from silence."""
        row = self._decidable(request_id)
        row.status = "declined"
        row.decided_by_person_id = actor_person_id
        row.decided_at = at
        AuditService.record(
            self._session,
            action="cash_request.decline",
            entity_type="cash_request",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
        )
        self._session.flush()
        return row
