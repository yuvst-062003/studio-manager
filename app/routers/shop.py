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

**Sizes (2026-08-29).** A גי is ordered in a size and a חגורה is not, and `product.sizes`
is the manager's answer per item. A line therefore carries `size`, and this route is where
the pairing is enforced in BOTH directions: a sized item without one is refused, and a size
against a sizeless item is refused too. The second half matters as much as the first --
accepting "מידה 120" on a belt would put a number on a handover sheet that means nothing to
whoever reads it.

The size is validated by MEMBERSHIP of `product.sizes`, never taken as free text. It is
about to be written onto a charge the club fulfils from, and a client that could send any
string could send one no supplier stocks.
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
from app.services.billing.catalogue import MAX_SIZE_LABEL

router = APIRouter(tags=["billing"])

MAX_LINES = 10
MAX_QUANTITY = 10


class ShopProductOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    price_agorot: int
    #: Empty means the item has no sizes and the parent is asked for none. One price covers
    #: every size -- there is no per-size amount to redact or reveal here.
    sizes: list[str] = Field(default_factory=list)


class ShopProductListOut(BaseModel):
    items: list[ShopProductOut]


class ItemOrderLineIn(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=MAX_QUANTITY)
    #: Which size, for an item that has any. Checked against the product's own list in the
    #: route -- the length bound here only keeps an absurd body out of the validator.
    size: str | None = Field(default=None, max_length=MAX_SIZE_LABEL)
    #: 2026-08-30 -- the parent's own words on the line ("רקמה: יוסי"). Short by design:
    #: it rides `charge.proration_note` (String(200)) beside the built label, so the cap
    #: leaves room for the longest label a real product name produces.
    note: str | None = Field(default=None, max_length=120)


class ItemOrderIn(BaseModel):
    items: list[ItemOrderLineIn] = Field(min_length=1, max_length=MAX_LINES)


class ItemOrderOut(BaseModel):
    charge_ids: list[uuid.UUID]
    total_agorot: int


def _checked_size(product: Product, size: str | None) -> str | None:
    """The pairing rule, enforced both ways. See the module docstring.

    Returns the size as the CATALOGUE spells it, not as the client sent it: a parent whose
    keyboard added a trailing space would otherwise put `"120 "` on a handover sheet, and
    two spellings of one size is how a club counts the same order twice.
    """
    sizes = list(product.sizes or ())
    chosen = (size or "").strip()
    if not sizes:
        if chosen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "refused", "message": "this item does not come in sizes"},
            )
        return None
    if not chosen:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "size_required", "message": "choose a size for this item"},
        )
    if chosen not in sizes:
        # Not 404: the product exists and the parent may retry with a size that is offered.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "refused", "message": "that size is not offered for this item"},
        )
    return chosen


def _line_label(name: str, quantity: int, size: str | None) -> str:
    """What the family and the club both read on the charge.

    `proration_note` is the column an item order already wrote its name into, and it is
    still the only free-text field a charge has. The name is wrong for this use -- it means
    "why this amount differs from the plan" -- and a `charge.line_note` is the right fix;
    that is a schema decision, and putting the size somewhere the club cannot see it would
    be the worse of the two errors. Trimmed to the column's 200 characters by construction:
    120 + a size label + a count cannot reach it.
    """
    label = name if quantity == 1 else f"{name} × {quantity}"
    return f"{label} · {size}" if size else label


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
                id=row.id,
                name=row.name,
                description=row.description,
                price_agorot=row.price_agorot,
                sizes=list(row.sizes or ()),
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
        size = _checked_size(product, line.size)
        amount = product.price_agorot * line.quantity
        charge = billing.create_charge(
            studio_id,
            payer,
            "manual",
            amount,
            at.date(),
            student_id=None,
        )
        label = _line_label(product.name, line.quantity, size)
        if line.note:
            # The parent's note, ON the label -- every surface that names the charge
            # (collections, the payer's own list) then shows it with no second field.
            # Clipped to the column, label first: the label is what reconciles money.
            label = f"{label} — {line.note.strip()}"[:200]
        charge.proration_note = label
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
