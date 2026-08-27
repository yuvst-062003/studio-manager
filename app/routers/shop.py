"""12e -- הזמנת פריטים, the payer's side (feature pass 2026-08-27).

The catalogue existed since W4 (`product`, manager-managed at `/products`) and the parent
had no read at all -- `OrderItemsScreen` shipped mounted to nothing and the client's
`products()` returned `[]` by design. These are the two routes that make 12e real:

* ``GET /me/products`` -- the active catalogue, priced. No role dependency, §3.1's
  'guardian is not a role'; the shapes carry a price, so the route is deliberately NOT
  coach-tagged (§13 invariant 3 concerns coach-scoped endpoints, and this is payer-scoped).
* ``POST /me/orders/items`` -- one manual charge per line, per §4.3's own rule: "Selling
  one creates a normal `charge` with kind='manual'". The charges are then payable by any
  route -- the card order and the cash request both take charge ids, which is exactly why
  this endpoint returns them.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.models.billing import Product
from app.services.audit import AuditService
from app.services.billing import BillingService

router = APIRouter(tags=["billing"])

MAX_LINES = 10
MAX_QUANTITY = 10


class ShopProductOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    price_agorot: int


class ShopProductListOut(BaseModel):
    items: list[ShopProductOut]


class ItemOrderLineIn(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=MAX_QUANTITY)


class ItemOrderIn(BaseModel):
    items: list[ItemOrderLineIn] = Field(min_length=1, max_length=MAX_LINES)


class ItemOrderOut(BaseModel):
    charge_ids: list[uuid.UUID]
    total_agorot: int


def _caller(request: Request) -> uuid.UUID:
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


@router.get("/me/products", response_model=ShopProductListOut)
def my_products(request: Request, session: TenantSessionDep) -> ShopProductListOut:
    _caller(request)
    rows = (
        session.execute(select(Product).where(Product.is_active.is_(True)).order_by(Product.name))
        .scalars()
        .all()
    )
    return ShopProductListOut(
        items=[
            ShopProductOut(
                id=row.id, name=row.name, description=row.description, price_agorot=row.price_agorot
            )
            for row in rows
        ]
    )


@router.post("/me/orders/items", response_model=ItemOrderOut, status_code=status.HTTP_201_CREATED)
def order_items(body: ItemOrderIn, request: Request, session: TenantSessionDep) -> ItemOrderOut:
    """One manual charge per line, priced SERVER-side from the catalogue -- the client
    sends ids and quantities and never an amount, for the same reason payment orders
    never take a payer from the body."""
    studio_id = require_current_studio_id()
    payer = _caller(request)
    billing = BillingService(session)
    at = now()
    charge_ids: list[uuid.UUID] = []
    total = 0
    for line in body.items:
        product = session.get(Product, line.product_id)
        if product is None or not product.is_active:
            # 404 for inactive too: a retired product must not be distinguishable from a
            # nonexistent one by whoever is probing ids.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "not_found", "message": "no such product"},
            )
        if product.price_agorot <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "refused", "message": "this item cannot be ordered"},
            )
        amount = product.price_agorot * line.quantity
        charge = billing.create_charge(
            studio_id,
            payer,
            "manual",
            amount,
            at.date(),
            student_id=None,
        )
        charge.proration_note = (
            product.name if line.quantity == 1 else f"{product.name} × {line.quantity}"
        )
        charge_ids.append(charge.id)
        total += amount
    AuditService.record(
        session,
        action="item_order.create",
        entity_type="charge",
        entity_id=charge_ids[0],
        studio_id=studio_id,
        actor_person_id=payer,
        diff={"lines": len(charge_ids), "total_agorot": total},
    )
    session.commit()
    return ItemOrderOut(charge_ids=charge_ids, total_agorot=total)
