"""SPEC §7's `/payments` -- money that arrived, by every route except the card.

**A card payment cannot be recorded here.** `ManualPaymentIn.method` excludes `upay_card`
deliberately: only `GET /webhooks/upay/{public_ref}` may create one, because only the IPN is
evidence that a card was actually charged. A hand-recorded card payment is a settled month
with no money behind it and nothing to reconcile against.

**G8's normal route.** `standing_order` sits in that same `Literal` beside `bank_transfer`
and `cash` because our provider cannot create a per-payer mandate, cannot vary its amount,
and its recurring callbacks carry no customer identifier -- so a הוראת קבע payment is marked
in-app by a human, exactly like a transfer. That is a provider limitation (§12), not a
design choice, and no endpoint here pretends otherwise.

**No route in this module carries the `coach` tag.** §3.2 gives a coach no financial read,
and invariant 3 enforces that against the tag.

`recorded_by_person_id` comes from the request context and never from the body: a client
that could name the recorder could attribute a payment to a colleague, and the audit trail
would agree with them.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.models.billing import Payment
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.billing import (
    ManualPaymentIn,
    PaymentAllocationOut,
    PaymentOut,
    PaymentPage,
    PaymentReversalIn,
)
from app.services.audit import AuditService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.payments import PaymentService

router = APIRouter(tags=["billing"])


def _not_found(what: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": f"no such {what}"},
    )


def _conflict(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "conflict", "message": str(exc)},
    )


def _refused(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": "refused", "message": str(exc)},
    )


def _actor(request: Request) -> uuid.UUID | None:
    person_id = getattr(request.state, "person_id", None)
    return person_id if isinstance(person_id, uuid.UUID) else None


def _out(service: PaymentService, payment: Payment) -> PaymentOut:
    """`allocations` travels with the payment because the surplus is derived from it.

    §5.10's overpayment is `amount_agorot - sum(allocations)`, and carrying a second field
    for it would give one number two sources that could disagree.
    """
    return PaymentOut(
        id=payment.id,
        payer_person_id=payment.payer_person_id,
        method=payment.method,
        amount_agorot=payment.amount_agorot,
        received_at=payment.received_at,
        recorded_by_person_id=payment.recorded_by_person_id,
        payment_order_id=payment.payment_order_id,
        note=payment.note,
        external_receipt_number=payment.external_receipt_number,
        reversed_at=payment.reversed_at,
        reversal_reason=payment.reversal_reason,
        allocations=[
            PaymentAllocationOut(
                id=row.id,
                payment_id=row.payment_id,
                charge_id=row.charge_id,
                amount_agorot=row.amount_agorot,
            )
            for row in service.allocations_of(payment.id)
        ],
    )


@router.get("/payments", response_model=PaymentPage)
def list_payments(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    payer_person_id: uuid.UUID | None = None,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> PaymentPage:
    """`12f`'s history and `3e`'s per-household drill-down."""
    service = PaymentService(session)
    rows, next_cursor = service.list_payments(
        payer_person_id=payer_person_id, after=after, limit=limit
    )
    return PaymentPage(
        items=[_out(service, row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def record_payment(
    _: ManagerOrOwner,
    body: ManualPaymentIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> PaymentOut:
    """§5.10's manual payment -- cash, transfer, הוראת קבע or a credit adjustment.

    Naming `charge_ids` allocates to exactly those; leaving it empty records the money and
    allocates nothing, which is what the reconciliation queue then resolves. Either way the
    charge is settled by its allocations and never by a field written here.
    """
    studio_id = require_current_studio_id()
    service = PaymentService(session)
    try:
        payment = service.record(
            studio_id,
            payer_person_id=body.payer_person_id,
            method=body.method,
            amount_agorot=body.amount_agorot,
            received_at=body.received_at,
            charge_ids=list(body.charge_ids),
            recorded_by_person_id=_actor(request),
            external_receipt_number=body.external_receipt_number,
            note=body.note,
        )
    except NotFoundError as exc:
        raise _not_found("charge") from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    AuditService.record(
        session,
        action="payment.record",
        entity_type="payment",
        entity_id=payment.id,
        studio_id=studio_id,
        actor_person_id=_actor(request),
        # §11.7 -- ids and amounts only. No card owner name, no last four digits; those
        # are data on `payer_fingerprint` and `upay_ipn_record`, not audit payloads.
        diff={"method": body.method, "amount_agorot": body.amount_agorot},
    )
    session.commit()
    return _out(service, payment)


@router.post("/payments/{payment_id}/reverse", response_model=PaymentOut)
def reverse_payment(
    _: ManagerOrOwner,
    payment_id: uuid.UUID,
    body: PaymentReversalIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> PaymentOut:
    """A returned cheque, a chargeback, a payment recorded against the wrong family.

    §11.4 -- never a DELETE. The row stays with `reversed_at` and a reason, the allocations
    go, and every charge they touched is recomputed. Without that last step the club would
    show a month as paid that it was never paid for, invisible in every debt report.
    """
    service = PaymentService(session)
    try:
        payment = service.reverse(
            payment_id, reason=body.reason, actor_person_id=_actor(request), at=now()
        )
    except NotFoundError as exc:
        raise _not_found("payment") from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    AuditService.record(
        session,
        action="payment.reverse",
        entity_type="payment",
        entity_id=payment_id,
        studio_id=require_current_studio_id(),
        actor_person_id=_actor(request),
        diff={"reason": body.reason},
    )
    session.commit()
    return _out(service, payment)
