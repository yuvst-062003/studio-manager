"""The cash-request routes (feature pass 2026-08-27).

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
from app.models.cash import CashRequest
from app.schemas.cash import (
    CashRequestCreateIn,
    CashRequestListOut,
    CashRequestOut,
    ManagerCashRequestListOut,
    ManagerCashRequestOut,
)
from app.services.billing.cash import CashService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError

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


def _out(service: CashService, row: CashRequest) -> CashRequestOut:
    return CashRequestOut(
        id=row.id,
        status=row.status,
        total_agorot=row.total_agorot,
        charge_ids=service.charge_ids_of(row.id),
        created_at=row.created_at,
        decided_at=row.decided_at,
    )


@router.post(
    "/me/cash-requests", response_model=CashRequestOut, status_code=status.HTTP_201_CREATED
)
def raise_cash_request(
    body: CashRequestCreateIn, request: Request, session: TenantSessionDep
) -> CashRequestOut:
    """'אני אשלם במזומן' -- over these exact charges. The payer is the session, never the
    body, for the same reason payment orders do it: a body-supplied payer would let anyone
    volunteer anyone else's debt."""
    studio_id = require_current_studio_id()
    service = CashService(session)
    try:
        row = service.create(
            studio_id, payer_person_id=_caller(request), charge_ids=body.charge_ids, at=now()
        )
    except (NotFoundError, ConflictError, RefusedError) as exc:
        raise _refusal(exc) from exc
    session.commit()
    return _out(service, row)


@router.get("/me/cash-requests", response_model=CashRequestListOut)
def my_cash_requests(request: Request, session: TenantSessionDep) -> CashRequestListOut:
    service = CashService(session)
    return CashRequestListOut(items=[_out(service, row) for row in service.mine(_caller(request))])


def _manager_out(row: CashRequest, payer_name: str, charge_count: int) -> ManagerCashRequestOut:
    return ManagerCashRequestOut(
        id=row.id,
        status=row.status,
        total_agorot=row.total_agorot,
        payer_person_id=row.payer_person_id,
        payer_name=payer_name,
        charge_count=charge_count,
        created_at=row.created_at,
    )


@router.get("/cash-requests", response_model=ManagerCashRequestListOut)
def list_cash_requests(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    request_status: str | None = Query(default=None, alias="status"),
) -> ManagerCashRequestListOut:
    service = CashService(session)
    return ManagerCashRequestListOut(
        items=[
            _manager_out(row, name, count)
            for row, name, count in service.list_requests(status=request_status)
        ]
    )


@router.post("/cash-requests/{request_id}/confirm", response_model=CashRequestOut)
def confirm_cash_request(
    _: ManagerOrOwner, request_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> CashRequestOut:
    """✓ -- the notes changed hands. Records the cash payment over what is still owed and
    settles exactly the request's charges; see CashService.confirm for the partial-payment
    rule."""
    service = CashService(session)
    try:
        row = service.confirm(
            request_id,
            actor_person_id=getattr(request.state, "person_id", None),
            at=now(),
        )
    except (NotFoundError, ConflictError) as exc:
        raise _refusal(exc) from exc
    session.commit()
    return _out(service, row)


@router.post("/cash-requests/{request_id}/decline", response_model=CashRequestOut)
def decline_cash_request(
    _: ManagerOrOwner, request_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> CashRequestOut:
    service = CashService(session)
    try:
        row = service.decline(
            request_id,
            actor_person_id=getattr(request.state, "person_id", None),
            at=now(),
        )
    except (NotFoundError, ConflictError) as exc:
        raise _refusal(exc) from exc
    session.commit()
    return _out(service, row)
