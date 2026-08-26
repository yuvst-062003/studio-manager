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
from pydantic import BaseModel

from app.core.auth_context import ManagerOrOwner
from app.core.clock import now
from app.core.config import settings
from app.core.tenancy import TenantSessionDep, require_current_studio_id
from app.integrations.upay.form import (
    MAX_INSTALLMENTS,
    UPAY_ENDPOINT,
    DemoStudioHasNoLiveFormError,
)
from app.models.billing import Payment, PaymentOrder
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.billing import (
    ManualPaymentIn,
    PaymentAllocationOut,
    PaymentOrderCreateIn,
    PaymentOrderOut,
    PaymentOut,
    PaymentPage,
    PaymentReversalIn,
)
from app.services.audit import AuditService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.orders import MerchantEmailMissingError, OrderService
from app.services.billing.payments import PaymentService


class UpayFormOut(BaseModel):
    """§5.10 step 2's form, as data. The client builds the POST and auto-submits it."""

    action: str
    fields: dict[str, str]


class PaymentCompleteOut(BaseModel):
    """What the return page renders. `status` is the ORDER's, read from our own row --
    never anything uPay put in the redirect's query string."""

    status: str
    public_ref: uuid.UUID | None


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


# -- §5.10's uPay one-time flow ------------------------------------------------
def _caller(request: Request) -> uuid.UUID:
    """The signed-in person, or a 401.

    Used by the order routes, which are **parent-facing and carry no role dependency**.
    §3.1: "guardian is not a role", and §6.1 makes parent access
    `EXISTS(guardian WHERE person_id = :me)` -- so `require_roles` here would refuse every
    parent in the product and admit every coach with no children.
    """
    person_id = getattr(request.state, "person_id", None)
    if not isinstance(person_id, uuid.UUID):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return person_id


def _is_staff(request: Request) -> bool:
    roles = getattr(request.state, "roles", None) or []
    return bool({"owner", "manager"} & set(roles))


def _order_out(service: OrderService, order: PaymentOrder) -> PaymentOrderOut:
    return PaymentOrderOut(
        id=order.id,
        payer_person_id=order.payer_person_id,
        public_ref=order.public_ref,
        expected_amount_agorot=order.expected_amount_agorot,
        max_payments=order.max_payments,
        status=order.status,
        expires_at=order.expires_at,
        paid_at=order.paid_at,
        charge_ids=service.charge_ids_of(order.id),
    )


@router.post("/payment-orders", response_model=PaymentOrderOut, status_code=status.HTTP_201_CREATED)
def create_payment_order(
    body: PaymentOrderCreateIn,
    request: Request,
    session: TenantSessionDep,
    max_payments: int = Query(default=1, ge=1, le=MAX_INSTALLMENTS),
    idempotency_key: IdempotencyKey = None,
) -> PaymentOrderOut:
    """§5.10 step 1. **The payer is always the caller** and never a field in the body.

    `PaymentOrderCreateIn` carries only `charge_ids`, and that is the contract shape making
    the decision: an order is created by the person who is about to stand in front of uPay's
    hosted page with their own card. A manager settling a family's debt uses
    `POST /payments`, which is the flow for money that arrives by every other route.

    Taking the payer from the request rather than the body also closes the obvious hole --
    a body-supplied payer would let anyone open an order over anyone's charges.

    **`max_payments` is a query parameter, not a body field**, because
    `PaymentOrderCreateIn` is W4's contract shape and carries only `charge_ids`. `1b` draws
    an instalments chip group, so the count has to reach the server somehow; widening a
    shape another wave authored is the one way it must not. Capped at `MAX_INSTALLMENTS`
    here and again in `OrderService.create`, because the dashboard's dropdown stops at 12
    and behaviour above it was never tested against this account.
    """
    studio_id = require_current_studio_id()
    service = OrderService(session)
    try:
        order = service.create(
            studio_id,
            payer_person_id=_caller(request),
            charge_ids=list(body.charge_ids),
            max_payments=max_payments,
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found("charge") from exc
    except ConflictError as exc:
        raise _conflict(exc) from exc
    except RefusedError as exc:
        raise _refused(exc) from exc
    session.commit()
    return _order_out(service, order)


@router.get("/payment-orders/{public_ref}", response_model=PaymentOrderOut)
def read_payment_order(
    public_ref: uuid.UUID, request: Request, session: TenantSessionDep
) -> PaymentOrderOut:
    """The status the return page polls, and §5.10 step 5's whole point.

    'The redirect is **never** the source of truth -- the IPN arrives ~5 minutes later.'
    So this is a read the parent's browser repeats while `billing.order.verifying` is on
    screen; it reports `pending` honestly rather than guessing from the redirect.

    Readable by the payer, or by a manager. `public_ref` is unguessable, but "unguessable"
    is not "authorised" -- a reference that leaked through a shared browser history would
    otherwise expose what a family owes.
    """
    service = OrderService(session)
    try:
        order = service.get_by_public_ref(public_ref)
    except NotFoundError as exc:
        raise _not_found("order") from exc
    if order.payer_person_id != _caller(request) and not _is_staff(request):
        raise _not_found("order")
    return _order_out(service, order)


@router.get("/payment-orders/{public_ref}/form", response_model=UpayFormOut)
def read_payment_order_form(
    public_ref: uuid.UUID, request: Request, session: TenantSessionDep
) -> UpayFormOut:
    """§5.10 step 2's hidden fields. **Fields, not HTML.**

    The client builds and auto-submits the POST. Returning rendered HTML from an API the
    TypeScript client is generated against would hand that client a `string` where every
    other route has a model, and the form's own fields would stop being type-checked.

    A demo studio gets a 409 rather than a form (§19.6 restriction 5): its payment step
    renders §19.5's IPN simulator, which never leaves our origin.
    """
    service = OrderService(session)
    try:
        order = service.get_by_public_ref(public_ref)
    except NotFoundError as exc:
        raise _not_found("order") from exc
    if order.payer_person_id != _caller(request) and not _is_staff(request):
        raise _not_found("order")
    try:
        fields = service.form_fields(public_ref, base_url=settings.OAUTH_REDIRECT_BASE_URL)
    except DemoStudioHasNoLiveFormError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "demo_studio_has_no_live_form",
                "message": "the demo studio has no live payment form; use the IPN simulator",
            },
        ) from exc
    except MerchantEmailMissingError as exc:
        # Refusing to build a form beats building one that charges nobody. 503 rather than
        # 500: the deployment is misconfigured, not the request.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "merchant_account_unconfigured",
                "message": "card payment is not configured for this deployment",
            },
        ) from exc
    return UpayFormOut(action=UPAY_ENDPOINT, fields=fields)


@router.get("/payment-complete", response_model=PaymentCompleteOut)
def payment_complete(
    request: Request, session: TenantSessionDep, ref: uuid.UUID | None = None
) -> PaymentCompleteOut:
    """§5.10 step 5's `returnurl`. **It marks nothing paid.**

    'The redirect is never the source of truth -- a closed tab still produces an IPN.' So
    this reports the order's current status and says, in `billing.order.verifyingHint`, that
    the window can be closed. uPay appends its own payload to this URL and every field of it
    is ignored here: it is client-submitted, unsigned, and the IPN is what settles anything.
    """
    if ref is None:
        return PaymentCompleteOut(status="pending", public_ref=None)
    service = OrderService(session)
    try:
        order = service.get_by_public_ref(ref)
    except NotFoundError:
        # Not a 404: the parent has just come back from paying and a page reading "not
        # found" would be alarming for what may be a mistyped bookmark. Pending is honest --
        # we do not know that anything happened.
        return PaymentCompleteOut(status="pending", public_ref=ref)
    return PaymentCompleteOut(status=order.status, public_ref=order.public_ref)
