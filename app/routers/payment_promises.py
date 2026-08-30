"""The payment-promise routes (cash and cheques).

Two surfaces, split exactly like the rest of billing: `/me/*` for the payer -- no role
dependency, §3.1's 'guardian is not a role' -- and manager-only decision routes. No
coach tag anywhere: every shape here carries money, and §13's third invariant keeps
financial fields off coach-reachable endpoints.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.models.payment_promise import PaymentPromise
from app.schemas.payment_promise import (
    ManagerPaymentPromiseListOut,
    ManagerPaymentPromiseOut,
    PaymentPromiseCreateIn,
    PaymentPromiseListOut,
    PaymentPromiseOut,
)
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.payment_promise import PaymentPromiseService

router = APIRouter(tags=["billing"])


def _caller(request: Request) -> uuid.UUID:
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


def _refusal(exc: Exception) -> HTTPException:
    if isinstance(exc, NotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "no such record"},
        )
    if isinstance(exc, ConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "conflict", "message": str(exc)},
        )
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": "refused", "message": str(exc)},
    )


def _out(service: PaymentPromiseService, row: PaymentPromise) -> PaymentPromiseOut:
    return PaymentPromiseOut(
        id=row.id,
        status=row.status,
        method=row.method,
        total_agorot=row.total_agorot,
        prepay_months=row.prepay_months,
        claimed_plan_id=row.claimed_plan_id,
        already_paid=row.already_paid,
        charge_ids=service.charge_ids_of(row.id),
        created_at=row.created_at,
        decided_at=row.decided_at,
    )


@router.post(
    "/me/payment-promises",
    response_model=PaymentPromiseOut,
    status_code=status.HTTP_201_CREATED,
)
def raise_payment_promise(
    body: PaymentPromiseCreateIn, request: Request, session: TenantSessionDep
) -> PaymentPromiseOut:
    """'אני אשלם במזומן' / 'אני אביא צ'קים' -- over these exact charges. The payer is the
    session, never the body, for the same reason payment orders do it: a body-supplied
    payer would let anyone volunteer anyone else's debt."""
    studio_id = require_current_studio_id()
    service = PaymentPromiseService(session)
    try:
        row = service.create(
            studio_id,
            payer_person_id=_caller(request),
            charge_ids=body.charge_ids,
            at=now(),
            method=body.method,
            prepay_months=body.prepay_months,
            claimed_plan_id=body.claimed_plan_id,
            already_paid=body.already_paid,
        )
    except (NotFoundError, ConflictError, RefusedError) as exc:
        raise _refusal(exc) from exc
    session.commit()
    return _out(service, row)


@router.get("/me/payment-promises", response_model=PaymentPromiseListOut)
def my_payment_promises(request: Request, session: TenantSessionDep) -> PaymentPromiseListOut:
    service = PaymentPromiseService(session)
    return PaymentPromiseListOut(
        items=[_out(service, row) for row in service.mine(_caller(request))]
    )


def _manager_out(
    row: PaymentPromise, payer_name: str, charge_count: int, claimed_plan_name: str | None
) -> ManagerPaymentPromiseOut:
    return ManagerPaymentPromiseOut(
        id=row.id,
        status=row.status,
        method=row.method,
        total_agorot=row.total_agorot,
        prepay_months=row.prepay_months,
        claimed_plan_name=claimed_plan_name,
        already_paid=row.already_paid,
        payer_person_id=row.payer_person_id,
        payer_name=payer_name,
        charge_count=charge_count,
        created_at=row.created_at,
    )


@router.get("/payment-promises", response_model=ManagerPaymentPromiseListOut)
def list_payment_promises(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    promise_status: str | None = Query(default=None, alias="status"),
    method: str | None = Query(default=None),
) -> ManagerPaymentPromiseListOut:
    service = PaymentPromiseService(session)
    return ManagerPaymentPromiseListOut(
        items=[
            _manager_out(row, name, count, plan_name)
            for row, name, count, plan_name in service.list_promises(
                status=promise_status, method=method
            )
        ]
    )


@router.post("/payment-promises/{promise_id}/confirm", response_model=PaymentPromiseOut)
def confirm_payment_promise(
    _: ManagerOrOwner, promise_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> PaymentPromiseOut:
    """✓ -- the money changed hands. Records the payment over what is still owed and
    settles exactly the promise's charges; see PaymentPromiseService.confirm for the
    partial-payment rule."""
    service = PaymentPromiseService(session)
    try:
        row = service.confirm(
            promise_id,
            actor_person_id=getattr(request.state, "person_id", None),
            at=now(),
        )
    except (NotFoundError, ConflictError) as exc:
        raise _refusal(exc) from exc
    session.commit()
    return _out(service, row)


@router.post("/payment-promises/{promise_id}/decline", response_model=PaymentPromiseOut)
def decline_payment_promise(
    _: ManagerOrOwner, promise_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> PaymentPromiseOut:
    service = PaymentPromiseService(session)
    try:
        row = service.decline(
            promise_id,
            actor_person_id=getattr(request.state, "person_id", None),
            at=now(),
        )
    except (NotFoundError, ConflictError) as exc:
        raise _refusal(exc) from exc
    session.commit()
    return _out(service, row)
