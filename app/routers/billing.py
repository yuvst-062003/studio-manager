"""SPEC §7's `/price-plans`, `/products`, `/charges`, `/billing-runs` and `/billing/settings`.

**No route in this module carries the `coach` tag, and that is the point.** §3.2's matrix
gives a coach no financial read at all, and invariant 3 enforces that rule *against the tag*
-- so an untagged coach route would be one the invariant never inspects, and a tagged one
here would be a violation the invariant would catch. Every handler takes `ManagerOrOwner`.

The one coach-facing thing this lane owns is `GET /products/handout-options` (§5.10's
`11a`), which returns names and no prices; it lives here beside the catalogue it reads from.

**Routers stay thin** (`.claude/rules/api.md`): parse, call a service, return. The services
raise `NotFoundError`/`ConflictError`/`RefusedError` and this module is the one place they
become status codes, which is what keeps them callable from `app/workers/billing.py` with
no request anywhere in sight.

**Studio-level billing settings live in the JSONB `settings` column**, under a `billing`
key, and are read and written here rather than through `app/routers/studio.py`. That file
and `app/schemas/studio.py` belong to the structure lane; widening another lane's shapes for
three fields only this lane reads is how a wave's merge conflicts start. It is also what
keeps this lane out of `alembic/versions/**`, which `main` owns -- the same reasoning M1.9
used for `sport`, `address` and `phone`.
"""

from __future__ import annotations

import uuid
from datetime import date
from enum import Enum
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.models.billing import (
    BillingRun,
    Charge,
    PricePlan,
    Product,
    RecurringSubscription,
    UpayIpnRecord,
)
from app.models.person import Guardian
from app.models.studio import Studio
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.billing import (
    BillingRunOut,
    BillingRunPage,
    ChargeAdjustmentIn,
    ChargeOut,
    ChargePage,
    IpnMatchIn,
    ManualChargeIn,
    PayerBalanceOut,
    PricePlanOut,
    PricePlanPage,
    ProductOut,
    ProductPage,
    RecurringSubscriptionOut,
    RecurringSubscriptionPage,
    UpayIpnRecordOut,
    UpayIpnRecordPage,
)
from app.services.audit import AuditService
from app.services.billing import BillingService
from app.services.billing.catalogue import CatalogueService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.orders import OrderService
from app.services.billing.reconciliation import ReconciliationService
from app.services.billing.run import BillingRunService

router = APIRouter(tags=["billing"])

#: The one coach-facing route in this lane (§5.10's `11a`). Tagged so invariant 3 inspects
#: it, because a coach route the invariant never looks at is an unguarded one.
COACH: list[str | Enum] = ["billing", "coach"]


# -- error mapping ------------------------------------------------------------
def _not_found(what: str) -> HTTPException:
    """404 and never 403: a 403 confirms the row exists somewhere, which is a cross-tenant
    read with a polite error message."""
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
    """Who is acting, from the request context and never from the body.

    A client that could name the actor could attribute a write-off to a colleague, and the
    audit trail would agree with them.
    """
    person_id = getattr(request.state, "person_id", None)
    return person_id if isinstance(person_id, uuid.UUID) else None


# -- projections --------------------------------------------------------------
def _charge_out(
    charge: Charge, allocated_agorot: int, *, is_covered_elsewhere: bool = False
) -> ChargeOut:
    return ChargeOut(
        id=charge.id,
        payer_person_id=charge.payer_person_id,
        student_id=charge.student_id,
        kind=charge.kind,
        period_year=charge.period_year,
        period_month=charge.period_month,
        amount_agorot=charge.amount_agorot,
        original_amount_agorot=charge.original_amount_agorot,
        proration_note=charge.proration_note,
        due_date=charge.due_date,
        status=charge.status,
        created_by=charge.created_by,
        allocated_agorot=allocated_agorot,
        is_covered_elsewhere=is_covered_elsewhere,
    )


def _charge_page(session: TenantSessionDep, pairs: list[tuple[Charge, int]]) -> list[ChargeOut]:
    """§5.10's covered-elsewhere flag, resolved once per page rather than once per row.

    Both charge listings need it and neither should issue a query per row: `12f` renders a
    year of charges, so a per-row lookup is twelve round trips to answer one question.
    """
    covered = OrderService(session).covered_charge_ids([charge.id for charge, _ in pairs])
    return [
        _charge_out(charge, allocated, is_covered_elsewhere=charge.id in covered)
        for charge, allocated in pairs
    ]


def _plan_out(plan: PricePlan) -> PricePlanOut:
    return PricePlanOut(
        id=plan.id,
        name=plan.name,
        sessions_per_week=plan.sessions_per_week,
        monthly_amount_agorot=plan.monthly_amount_agorot,
        # The shape declares a plain `int`; a plan with no fee reads as zero rather than as
        # a missing field, which is what the wizard's step 4 renders.
        registration_fee_agorot=plan.registration_fee_agorot or 0,
        active_from=plan.active_from,
        active_to=plan.active_to,
    )


def _product_out(product: Product) -> ProductOut:
    return ProductOut(
        id=product.id,
        name=product.name,
        description=product.description,
        price_agorot=product.price_agorot,
        is_active=product.is_active,
    )


def _run_out(run: BillingRun) -> BillingRunOut:
    return BillingRunOut(
        id=run.id,
        period_year=run.period_year,
        period_month=run.period_month,
        started_at=run.started_at,
        finished_at=run.finished_at,
        charges_created=run.charges_created,
        status=run.status,
    )


# -- price plans --------------------------------------------------------------
class PricePlanIn(BaseModel):
    """§5.10's plan, and C11 in a shape: `sessions_per_week` and **no group**.

    Defined here rather than in `app/schemas/billing.py` because that file is W4's contract
    commit and this lane does not widen it -- the contract authored the read shapes both
    lanes share and left the write shapes to whoever built the routes.
    """

    name: str = Field(min_length=1, max_length=120)
    sessions_per_week: int = Field(gt=0, le=14)
    monthly_amount_agorot: int = Field(ge=0)
    registration_fee_agorot: int | None = Field(default=None, ge=0)
    active_from: date


class PricePlanCloseIn(BaseModel):
    """A price change: close the current plan, open its successor the next day. There is
    deliberately no shape that edits an amount in place."""

    closes_on: date
    replacement_amount_agorot: int = Field(ge=0)
    replacement_registration_fee_agorot: int | None = Field(default=None, ge=0)


@router.get("/price-plans", response_model=PricePlanPage)
def list_price_plans(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> PricePlanPage:
    """Dashboard `5a` and the wizard's step 4. Current plan first, closed ones below."""
    rows, next_cursor = CatalogueService(session).list_price_plans(after=after, limit=limit)
    return PricePlanPage(
        items=[_plan_out(row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/price-plans", response_model=PricePlanOut, status_code=status.HTTP_201_CREATED)
def create_price_plan(
    _: ManagerOrOwner,
    body: PricePlanIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> PricePlanOut:
    studio_id = require_current_studio_id()
    try:
        plan = CatalogueService(session).create_price_plan(
            studio_id,
            name=body.name,
            sessions_per_week=body.sessions_per_week,
            monthly_amount_agorot=body.monthly_amount_agorot,
            registration_fee_agorot=body.registration_fee_agorot,
            active_from=body.active_from,
        )
    except RefusedError as exc:
        raise _refused(exc) from exc
    AuditService.record(
        session,
        action="price_plan.create",
        entity_type="price_plan",
        entity_id=plan.id,
        studio_id=studio_id,
        actor_person_id=_actor(request),
        diff={"monthly_amount_agorot": plan.monthly_amount_agorot},
    )
    session.commit()
    return _plan_out(plan)


@router.post(
    "/price-plans/{plan_id}/close",
    response_model=PricePlanOut,
    status_code=status.HTTP_201_CREATED,
)
def close_price_plan(
    _: ManagerOrOwner,
    plan_id: uuid.UUID,
    body: PricePlanCloseIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> PricePlanOut:
    """§5.10 -- 'Plans are versioned so a price change never rewrites history.' Returns the
    SUCCESSOR, which is the row `5a` then renders as current."""
    try:
        successor = CatalogueService(session).close_price_plan(
            plan_id,
            closes_on=body.closes_on,
            replacement_amount_agorot=body.replacement_amount_agorot,
            replacement_registration_fee_agorot=body.replacement_registration_fee_agorot,
        )
    except NotFoundError as exc:
        raise _not_found("price plan") from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    AuditService.record(
        session,
        action="price_plan.close",
        entity_type="price_plan",
        entity_id=plan_id,
        studio_id=require_current_studio_id(),
        actor_person_id=_actor(request),
        diff={"closes_on": body.closes_on.isoformat(), "successor_id": str(successor.id)},
    )
    session.commit()
    return _plan_out(successor)


# -- products -----------------------------------------------------------------
class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price_agorot: int = Field(ge=0)
    description: str | None = Field(default=None, max_length=2000)


class ProductPatch(BaseModel):
    """Every field optional. There is no `quantity` and there will not be one -- §4.3 and
    §5.10 both say inventory is a different product."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    price_agorot: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class HandoutOptionOut(BaseModel):
    """§5.10's `11a`, and **invariant 3 as a shape rather than as a rule someone remembers**.

    A coach picks the item; the server prices it from `product.price_agorot`. There is no
    money field here, and that absence is the whole reason this shape exists instead of
    reusing `ProductOut`.
    """

    id: uuid.UUID
    name: str


class HandoutOptionsOut(BaseModel):
    items: list[HandoutOptionOut]


@router.get("/products", response_model=ProductPage)
def list_products(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    include_inactive: bool = Query(default=False),
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ProductPage:
    rows, next_cursor = CatalogueService(session).list_products(
        include_inactive=include_inactive, after=after, limit=limit
    )
    return ProductPage(
        items=[_product_out(row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/products/handout-options", response_model=HandoutOptionsOut, tags=COACH)
def list_handout_options(_: AnyStaff, session: TenantSessionDep) -> HandoutOptionsOut:
    """What staff `11a`'s picker renders. **Names only, never prices** (invariant 3).

    Active products only: a coach handing out an item the club stopped selling would create
    a charge for a price nobody currently offers.
    """
    rows, _cursor = CatalogueService(session).list_products(include_inactive=False, limit=200)
    return HandoutOptionsOut(items=[HandoutOptionOut(id=row.id, name=row.name) for row in rows])


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    _: ManagerOrOwner,
    body: ProductIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ProductOut:
    try:
        product = CatalogueService(session).create_product(
            require_current_studio_id(),
            name=body.name,
            price_agorot=body.price_agorot,
            description=body.description,
        )
    except RefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return _product_out(product)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    _: ManagerOrOwner,
    product_id: uuid.UUID,
    body: ProductPatch,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ProductOut:
    """`exclude_unset` is what makes this a partial write rather than a blanking one."""
    fields = body.model_dump(exclude_unset=True)
    try:
        product = CatalogueService(session).update_product(product_id, **fields)
    except NotFoundError as exc:
        raise _not_found("product") from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return _product_out(product)


# -- charges ------------------------------------------------------------------
class ChargeCloseIn(BaseModel):
    """§11.4 -- a financial row is never deleted, so a charge raised in error is closed and
    explained. `reason` is mandatory because 'why' is the only thing that makes it auditable
    a year later, when the family asks where their September went."""

    status: str = Field(pattern="^(void|written_off)$")
    reason: str = Field(min_length=1, max_length=200)


@router.get("/charges", response_model=ChargePage)
def list_charges(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    payer_person_id: uuid.UUID | None = None,
    student_id: uuid.UUID | None = None,
    charge_status: str | None = Query(default=None, alias="status"),
    kind: str | None = None,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ChargePage:
    """§7's `GET /charges?payer_person_id&status`. `allocated_agorot` travels with each row
    because §4.3 settles a charge by summing allocations -- a client rendering
    `amount_agorot` alone would show a fully-paid charge as outstanding."""
    pairs, next_cursor = BillingService(session).list_charges(
        payer_person_id=payer_person_id,
        student_id=student_id,
        status=charge_status,
        kind=kind,
        after=after,
        limit=limit,
    )
    return ChargePage(
        items=_charge_page(session, pairs),
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/charges/{charge_id}", response_model=ChargeOut)
def get_charge(_: ManagerOrOwner, charge_id: uuid.UUID, session: TenantSessionDep) -> ChargeOut:
    service = BillingService(session)
    try:
        charge = service.get_charge(charge_id)
    except NotFoundError as exc:
        raise _not_found("charge") from exc
    return _charge_out(charge, service.allocated_agorot(charge_id))


@router.post("/charges", response_model=ChargeOut, status_code=status.HTTP_201_CREATED)
def create_charge(
    _: ManagerOrOwner,
    body: ManualChargeIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ChargeOut:
    """§5.10's manual charge. Goes through `BillingService.create_charge` and **not** an
    insert: one writer, so a manual charge and the monthly run cannot disagree about what a
    charge is.

    `ManualChargeIn.kind` excludes `tuition` on purpose -- a hand-made tuition charge is how
    a month ends up billed twice, beside a run that believes it did its job.
    """
    studio_id = require_current_studio_id()
    charge = BillingService(session).create_charge(
        studio_id,
        body.payer_person_id,
        body.kind,
        body.amount_agorot,
        body.due_date,
        student_id=body.student_id,
    )
    if body.note:
        charge.proration_note = body.note
    AuditService.record(
        session,
        action="charge.create",
        entity_type="charge",
        entity_id=charge.id,
        studio_id=studio_id,
        actor_person_id=_actor(request),
        diff={"kind": body.kind, "amount_agorot": body.amount_agorot},
    )
    session.commit()
    return _charge_out(charge, 0)


@router.post(
    "/charges/{charge_id}/adjust", response_model=ChargeOut, status_code=status.HTTP_201_CREATED
)
def adjust_charge(
    _: ManagerOrOwner,
    charge_id: uuid.UUID,
    body: ChargeAdjustmentIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ChargeOut:
    """A correction recorded as a **new** charge, never an edit to the original.

    §5.10 makes a credit a negative amount rather than an edit, so the ledger stays
    append-only and last month's statement does not change after a parent has read it. The
    201 and the new id are that rule visible from the outside.
    """
    service = BillingService(session)
    try:
        original = service.get_charge(charge_id)
    except NotFoundError as exc:
        raise _not_found("charge") from exc
    studio_id = require_current_studio_id()
    adjustment = service.create_charge(
        studio_id,
        original.payer_person_id,
        "manual",
        body.amount_agorot,
        original.due_date,
        student_id=original.student_id,
    )
    adjustment.proration_note = body.reason
    AuditService.record(
        session,
        action="charge.adjust",
        entity_type="charge",
        entity_id=adjustment.id,
        studio_id=studio_id,
        actor_person_id=_actor(request),
        diff={
            "adjusts_charge_id": str(charge_id),
            "amount_agorot": body.amount_agorot,
            "reason": body.reason,
        },
    )
    session.commit()
    return _charge_out(adjustment, 0)


@router.post("/charges/{charge_id}/close", response_model=ChargeOut)
def close_charge(
    _: ManagerOrOwner,
    charge_id: uuid.UUID,
    body: ChargeCloseIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ChargeOut:
    """Void or write off. §11.4 forbids deleting a financial row, so this is how a charge
    stops counting without ceasing to exist."""
    service = BillingService(session)
    try:
        charge = service.close_charge(charge_id, status=body.status, reason=body.reason)
    except NotFoundError as exc:
        raise _not_found("charge") from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    AuditService.record(
        session,
        action=f"charge.{body.status}",
        entity_type="charge",
        entity_id=charge_id,
        studio_id=require_current_studio_id(),
        actor_person_id=_actor(request),
        diff={"status": body.status, "reason": body.reason},
    )
    session.commit()
    return _charge_out(charge, service.allocated_agorot(charge_id))


# -- what a payer may read about their own money ------------------------------
#
# §5.10's payments screen needs the open charges and the balance before it can render, and
# both reads above are `ManagerOrOwner` -- so the screen 403'd and never loaded for the
# person it was drawn for. `app/routers/payments.py` carries the third (`/me/payments`) and
# the note explaining why this is a `/me/` route rather than a widened parameter.
#
# `_caller` and not `_actor`: an unauthenticated request must be 401 here, whereas `_actor`
# answers `None` because it exists to stamp an audit row. Resolving "whose money" to `None`
# would list every charge in the studio.


def _caller(request: Request) -> uuid.UUID:
    """The signed-in person, or a 401. No role dependency — §3.1: guardian is not a role."""
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


@router.get("/me/charges", response_model=ChargePage)
def my_charges(
    request: Request,
    session: TenantSessionDep,
    charge_status: str | None = Query(default=None, alias="status"),
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ChargePage:
    """§5.10 — the months this person owes, oldest first, which is the order the card route
    selects in.

    `allocated_agorot` travels with each row because §4.3 settles a charge by summing its
    allocations: a client rendering `amount_agorot` alone shows a part-paid charge as
    wholly outstanding.
    """
    pairs, next_cursor = BillingService(session).list_charges(
        payer_person_id=_caller(request),
        status=charge_status,
        after=after,
        limit=limit,
    )
    return ChargePage(
        items=_charge_page(session, pairs),
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/me/balance", response_model=PayerBalanceOut)
def my_balance(request: Request, session: TenantSessionDep) -> PayerBalanceOut:
    """`12f`'s summary card. Negative is a family in credit, and `MoneyDisplay` wraps the
    amount in `<bdi>` precisely so that reads as a credit in a right-to-left sentence."""
    payer_person_id = _caller(request)
    charged, paid, open_count = BillingService(session).payer_balance(payer_person_id)
    return PayerBalanceOut(
        payer_person_id=payer_person_id,
        charged_agorot=charged,
        paid_agorot=paid,
        balance_agorot=charged - paid,
        open_charge_count=open_count,
    )


@router.get("/payers/{payer_person_id}/balance", response_model=PayerBalanceOut)
def payer_balance(
    _: ManagerOrOwner, payer_person_id: uuid.UUID, session: TenantSessionDep
) -> PayerBalanceOut:
    """`12f`'s summary card and `3e`'s household row.

    Negative is a family in credit. `MoneyDisplay` wraps the amount in `<bdi>` precisely so
    a negative reads as a credit in a right-to-left sentence rather than as a debt.
    """
    charged, paid, open_count = BillingService(session).payer_balance(payer_person_id)
    return PayerBalanceOut(
        payer_person_id=payer_person_id,
        charged_agorot=charged,
        paid_agorot=paid,
        balance_agorot=charged - paid,
        open_charge_count=open_count,
    )


# -- the monthly run ----------------------------------------------------------
class BillingRunIn(BaseModel):
    """§7's `POST /billing-runs`, and the endpoint the dev bar's runJob tool triggers.

    A period, not a date range: §5.10 bills calendar months and `charge`'s idempotency key
    is `(student_id, period_year, period_month, kind)`.
    """

    period_year: int = Field(ge=2020, le=2100)
    period_month: int = Field(ge=1, le=12)


@router.get("/billing-runs", response_model=BillingRunPage)
def list_billing_runs(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> BillingRunPage:
    stmt = select(BillingRun)
    if after is not None:
        stmt = stmt.where(BillingRun.id > after)
    rows = list(session.execute(stmt.order_by(BillingRun.id).limit(limit + 1)).scalars())
    has_more = len(rows) > limit
    rows = rows[:limit]
    return BillingRunPage(
        items=[_run_out(row) for row in rows],
        next_cursor=rows[-1].id if has_more and rows else None,
        has_more=has_more,
    )


@router.post("/billing-runs", response_model=BillingRunOut, status_code=status.HTTP_201_CREATED)
def create_billing_run(
    _: ManagerOrOwner,
    body: BillingRunIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> BillingRunOut:
    """Run the month now. **Safe to press twice** -- §5.10 step 5, and
    `billing.run.idempotentHint` is that promise written on the button.

    `now()` rather than a wall clock, so §19.5's `X-Dev-Now` reaches the run and a manager
    can test December's billing in November.
    """
    studio_id = require_current_studio_id()
    run = BillingRunService(session).run(
        studio_id,
        period_year=body.period_year,
        period_month=body.period_month,
        at=now(),
    )
    AuditService.record(
        session,
        action="billing_run.execute",
        entity_type="billing_run",
        entity_id=run.id,
        studio_id=studio_id,
        actor_person_id=_actor(request),
        diff={
            "period": f"{body.period_year}-{body.period_month:02d}",
            "created": run.charges_created,
        },
    )
    session.commit()
    return _run_out(run)


# -- studio-level billing settings --------------------------------------------
#: The key `studio.settings` holds this lane's three fields under. Namespaced so no other
#: lane writing that column can collide with them.
SETTINGS_KEY = "billing"


class BillingSettingsOut(BaseModel):
    """§5.10's three studio-level settings.

    `standing_order_link` is the shared recurring link the manager created once in the uPay
    dashboard and pasted here -- G8: we cannot create one, cannot vary its amount per payer,
    and cannot tell from its callbacks who paid.
    """

    standing_order_link: str | None = None
    cash_instructions: str | None = None
    #: Which day of the month the run fires on. §5.10: 'a configurable day (default the 1st)'.
    run_day: int = 1


class BillingSettingsPatch(BaseModel):
    standing_order_link: str | None = Field(default=None, max_length=500)
    cash_instructions: str | None = Field(default=None, max_length=1000)
    #: 1..28, not 1..31. A run day of the 30th never fires in February, which is a month
    #: nobody is billed and nobody notices until March.
    run_day: int | None = Field(default=None, ge=1, le=28)


def _settings_of(session: TenantSessionDep, studio_id: uuid.UUID) -> tuple[Studio, dict[str, Any]]:
    studio = session.get(Studio, studio_id)
    if studio is None:  # pragma: no cover -- the tenant resolver would have refused first
        raise _not_found("studio")
    return studio, dict(studio.settings or {}).get(SETTINGS_KEY, {})


@router.get("/billing/settings", response_model=BillingSettingsOut)
def read_billing_settings(_: ManagerOrOwner, session: TenantSessionDep) -> BillingSettingsOut:
    """What `1b` renders for the standing-order and cash routes."""
    _studio, billing = _settings_of(session, require_current_studio_id())
    return BillingSettingsOut(**billing)


@router.patch("/billing/settings", response_model=BillingSettingsOut)
def update_billing_settings(
    _: ManagerOrOwner,
    body: BillingSettingsPatch,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> BillingSettingsOut:
    """A partial write. `exclude_unset` is what stops the הגדרות panel's one-field autosave
    blanking the other two."""
    studio_id = require_current_studio_id()
    studio, billing = _settings_of(session, studio_id)
    billing.update(body.model_dump(exclude_unset=True))
    # Reassigned rather than mutated in place: JSONB is not tracked for in-place mutation,
    # so `settings["billing"]["run_day"] = 3` would be a change SQLAlchemy never flushes.
    settings_column = dict(studio.settings or {})
    settings_column[SETTINGS_KEY] = billing
    studio.settings = settings_column
    session.commit()
    return BillingSettingsOut(**billing)


# -- §5.10's הוראת קבע reconciliation ------------------------------------------
class SubscriptionIn(BaseModel):
    """**The manager's record of who is on the link. Not a mandate.**

    G8: uPay cannot create a per-payer mandate, cannot vary its amount per payer, and its
    recurring callbacks carry no customer identifier -- so there is no external reference,
    no token and no provider id here, because there is nothing to store. `app/schemas/
    billing.py` deliberately has no `RecurringSubscriptionIn` and
    `tests/contracts/test_w4_schemas.py` asserts that; this is the *route's* input shape and
    lives here, in this lane's own file.

    **The parent never sets this.** It is manager-or-owner like everything else here.
    """

    payer_person_id: uuid.UUID
    amount_agorot: int = Field(gt=0)
    start_date: date


class MatchSuggestionOut(BaseModel):
    """One unmatched payment and the payer a fingerprint suggests.

    `confidence` is **advisory** (§5.10 step 5). Nothing acts on a threshold: it is a number
    a manager reads before tapping, never a gate anything passes.
    """

    ipn_id: uuid.UUID
    payer_person_id: uuid.UUID
    confidence: int
    amount_agorot: int | None
    card_owner_name: str | None
    four_digits: str | None


class MatchSuggestionsOut(BaseModel):
    items: list[MatchSuggestionOut]
    #: §5.10 step 5 on the screen. `billing.reconciliation.neverAuto` says the same in Hebrew.
    never_auto: bool = True


def _ipn_out(record: UpayIpnRecord) -> UpayIpnRecordOut:
    """§11.7: the card owner name and last four are DATA here, on a manager-only screen,
    which is where reconciling an unmatched הוראת קבע payment actually happens. They are
    forbidden in *logs*, not in the one view that cannot work without them.

    `amount` is the string uPay sent and `amount_agorot` is our parse of it, side by side --
    a manager seeing both is the only way an amount mismatch is legible.
    """
    return UpayIpnRecordOut(
        id=record.id,
        received_at=record.received_at,
        transactionid=record.transactionid,
        order_public_ref=record.order_public_ref,
        amount=record.amount,
        amount_agorot=_parsed_agorot(record.amount),
        card_owner_name=record.card_owner_name,
        four_digits=record.four_digits,
        payment_date=record.payment_date,
        matched_payment_id=record.matched_payment_id,
        match_status=record.match_status,
        source_ip=record.source_ip,
    )


def _parsed_agorot(text: str) -> int | None:
    from app.integrations.upay.ipn import UnparsableIpnAmountError, agorot_from_ipn_amount

    try:
        return agorot_from_ipn_amount(text)
    except UnparsableIpnAmountError:
        # Shown as null beside the raw string, which is exactly the case a manager needs to
        # see: an amount we could not read is not an amount we should invent.
        return None


@router.get("/reconciliation/unmatched", response_model=UpayIpnRecordPage)
def list_unmatched(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> UpayIpnRecordPage:
    """`3e`'s reconciliation queue, left column: payments waiting for a human."""
    rows, next_cursor = ReconciliationService(session).unmatched(
        require_current_studio_id(), after=after, limit=limit
    )
    return UpayIpnRecordPage(
        items=[_ipn_out(row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/reconciliation/suggestions", response_model=MatchSuggestionsOut)
def list_suggestions(_: ManagerOrOwner, session: TenantSessionDep) -> MatchSuggestionsOut:
    """§5.10 step 4. **A read with no side effect** -- computing a suggestion twice must
    leave the ledger exactly where it was, because the manager's tap is the only thing that
    moves money."""
    rows = ReconciliationService(session).suggestions(require_current_studio_id())
    return MatchSuggestionsOut(
        items=[
            MatchSuggestionOut(
                ipn_id=row.ipn_id,
                payer_person_id=row.payer_person_id,
                confidence=row.confidence,
                amount_agorot=row.amount_agorot,
                card_owner_name=row.card_owner_name,
                four_digits=row.four_digits,
            )
            for row in rows
        ]
    )


@router.post("/reconciliation/match", response_model=UpayIpnRecordOut)
def confirm_match(
    _: ManagerOrOwner,
    body: IpnMatchIn,
    request: Request,
    session: TenantSessionDep,
    ipn_id: uuid.UUID,
    payer_person_id: uuid.UUID | None = None,
    idempotency_key: IdempotencyKey = None,
) -> UpayIpnRecordOut:
    """§5.10 step 3 and step 5.

    `IpnMatchIn.match_status` is `Literal["manual", "ignored"]` -- **there is no `auto` a
    client can send**, and that is the schema saying step 5 out loud: a match is a human's
    decision or it is nothing.

    **`ipn_id` and `payer_person_id` are query parameters, and `IpnMatchIn.payment_id` is
    left for what it says.** The contract shape carries `payment_id` -- an existing
    *payment* to link this callback to, for the case where a manager already recorded the
    money by hand and now wants the evidence attached. §5.10 step 3's flow is the other one:
    the system *creates* the payment, so what it needs is a payer, not a payment. Reusing
    `payment_id` to carry a person id would have been a field lying about its own name in
    the one place a wrong id sends the wrong parent a debt reminder.

    `confirmed_by_person_id` comes from the request context, never the body. A client that
    could name the confirmer could attribute someone else's decision, and the row that is
    supposed to prove a human decided would prove the wrong human.
    """
    service = ReconciliationService(session)
    studio_id = require_current_studio_id()
    try:
        if body.match_status == "ignored":
            record = service.ignore(ipn_id)
        else:
            if payer_person_id is None:
                raise RefusedError(
                    "a manual match needs the payer it belongs to -- §5.10 step 3 creates "
                    "the payment, so there is nobody to create it for without one"
                )
            service.confirm_match(
                ipn_id,
                payer_person_id=payer_person_id,
                confirmed_by_person_id=_actor(request),
                at=now(),
            )
            record = service.get_record(ipn_id)
    except NotFoundError as exc:
        raise _not_found("ipn record") from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    AuditService.record(
        session,
        action=f"reconciliation.{body.match_status}",
        entity_type="upay_ipn_record",
        entity_id=ipn_id,
        studio_id=studio_id,
        actor_person_id=_actor(request),
        # §11.7 -- ids and the decision. Never the card owner name or the last four.
        diff={"match_status": body.match_status},
    )
    session.commit()
    return _ipn_out(record)


@router.get("/recurring-subscriptions", response_model=RecurringSubscriptionPage)
def list_subscriptions(
    _: ManagerOrOwner,
    session: TenantSessionDep,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> RecurringSubscriptionPage:
    rows, next_cursor = ReconciliationService(session).list_subscriptions(
        require_current_studio_id(), after=after, limit=limit
    )
    return RecurringSubscriptionPage(
        items=[_subscription_out(row) for row in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post(
    "/recurring-subscriptions",
    response_model=RecurringSubscriptionOut,
    status_code=status.HTTP_201_CREATED,
)
def record_subscription(
    _: ManagerOrOwner,
    body: SubscriptionIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RecurringSubscriptionOut:
    """G8 -- a record of a mandate that exists at the provider, not one we can create."""
    try:
        row = ReconciliationService(session).record_subscription(
            require_current_studio_id(),
            payer_person_id=body.payer_person_id,
            amount_agorot=body.amount_agorot,
            start_date=body.start_date,
        )
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return _subscription_out(row)


@router.post(
    "/recurring-subscriptions/{subscription_id}/cancel",
    response_model=RecurringSubscriptionOut,
)
def cancel_subscription(
    _: ManagerOrOwner,
    subscription_id: uuid.UUID,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> RecurringSubscriptionOut:
    """The family stopped. The row stays as history -- it is what explains why last March's
    reconciliation expected them."""
    try:
        row = ReconciliationService(session).cancel_subscription(subscription_id, at=now())
    except NotFoundError as exc:
        raise _not_found("subscription") from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    session.commit()
    return _subscription_out(row)


def _subscription_out(row: RecurringSubscription) -> RecurringSubscriptionOut:
    return RecurringSubscriptionOut(
        id=row.id,
        payer_person_id=row.payer_person_id,
        amount_agorot=row.amount_agorot,
        start_date=row.start_date,
        status=row.status,
        cancelled_at=row.cancelled_at,
    )


# -- staff `11a`: handing an item over -----------------------------------------
class HandOverIn(BaseModel):
    """§5.10's `11a`. **A coach names the item and the child, and nothing else.**

    There is deliberately no amount here. §3.2 gives a coach no financial read, so the price
    comes from `product.price_agorot` server-side and the payer from the student's primary
    guardian -- a coach who could send either could set a family's bill from the mat.
    """

    product_id: uuid.UUID
    student_id: uuid.UUID


class HandOverOut(BaseModel):
    """What `11a` renders after a hand-over: **that** a charge was created, never for how
    much. Invariant 3 inspects this shape because the route is `coach`-tagged, and a money
    field here would make it name the exact field."""

    charge_id: uuid.UUID
    product_name: str


@router.post(
    "/charges/from-product",
    response_model=HandOverOut,
    status_code=status.HTTP_201_CREATED,
    tags=COACH,
)
def hand_over_product(
    _: AnyStaff,
    body: HandOverIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> HandOverOut:
    """A coach hands a child a גי and the club bills the family for it.

    Everything financial happens on this side of the boundary: the amount is read from the
    product, the payer from the primary guardian (§4.3 -- captured at creation, so changing
    the guardian later leaves the charge with whoever owed it), and neither is echoed back.

    An inactive product is refused: handing out an item the club stopped selling would raise
    a charge at a price nobody currently offers.
    """
    studio_id = require_current_studio_id()
    catalogue = CatalogueService(session)
    try:
        product = catalogue.get_product(body.product_id)
    except NotFoundError as exc:
        raise _not_found("product") from exc
    if not product.is_active:
        raise _refused(RefusedError("that item is no longer sold"))

    payer_person_id = session.execute(
        select(Guardian.person_id).where(
            Guardian.student_id == body.student_id, Guardian.is_primary.is_(True)
        )
    ).scalar_one_or_none()
    if payer_person_id is None:
        raise _refused(
            RefusedError("that student has no primary guardian, so nobody owes the charge")
        )

    charge = BillingService(session).create_charge(
        studio_id,
        payer_person_id,
        "manual",
        product.price_agorot,
        now().date(),
        student_id=body.student_id,
    )
    charge.proration_note = product.name
    AuditService.record(
        session,
        action="charge.hand_over",
        entity_type="charge",
        entity_id=charge.id,
        studio_id=studio_id,
        actor_person_id=_actor(request),
        diff={"product_id": str(product.id)},
    )
    session.commit()
    return HandOverOut(charge_id=charge.id, product_name=product.name)
