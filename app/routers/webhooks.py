"""SPEC §5.10's uPay IPN endpoint. **Unauthenticated by necessity -- uPay calls it.**

§12: there is no cryptographic signature on this callback, in either direction, [VERIFIED]
in both rounds of live testing. Anyone who learns the URL can send us bytes that look
exactly like uPay's. So the reference **is** the credential, which is why it is a UUIDv4 the
server issued, and why the amount is compared against our own row rather than believed.

**The ordering here is the contract.** §5.10's last threat row: "The endpoint persists the
raw `upay_ipn_record` and returns 200 immediately; all processing happens in a worker."
Retries on a non-200 are [NOT COVERED] by any testing against this account, so the design
never depends on knowing what they are: the bytes are written down first, the answer is
always 200, and every verdict is reached afterwards against a row that already exists.

**This router carries no `coach` tag and no auth dependency**, and both absences are
deliberate. A test asserts the second, so that nobody "fixes" the missing dependency and
silently stops every real payment in the club from reconciling.

**The tenant is resolved from the order, not from the caller.** There is no authenticated
caller and therefore no studio in context, and `TenantSession` fails closed -- it would 401
every real payment. `public_ref` is globally unique and unguessable, which is exactly what
makes looking it up across tenants safe, and it is the only cross-tenant read here.

**§11.7 -- nothing in this module logs a card owner name or last four digits.** They are
columns on `upay_ipn_record`, read on a manager-only screen. Every log line here carries ids
and nothing else, as `extra=` rather than interpolated, so the scrubber has keys to match.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import Select, select

from app.core.clock import now
from app.core.db import SessionDep
from app.core.tenancy import use_studio
from app.integrations.upay.callback import source_ip_is_known
from app.models.billing import PaymentOrder
from app.services.billing.reconciliation import IpnIntake

router = APIRouter(tags=["billing"])

logger = logging.getLogger(__name__)


def _source_ip(request: Request) -> str | None:
    """§5.10's weak layer, recorded and never acted on.

    Round two observed `84.95.87.35` on **two of three** deliveries and could not establish
    whether it is stable. An address that changed would make us refuse real payments,
    silently, and the parent would have paid -- so this is a signal for a human, never a
    gate. `X-Forwarded-For`'s first hop, because the app sits behind Railway's proxy.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return request.client.host[:45] if request.client else None


@router.get("/webhooks/upay/{public_ref}")
def upay_ipn(public_ref: uuid.UUID, request: Request, session: SessionDep) -> Response:
    """§5.10's IPN. **Always 200**, including for a forgery and including on a bug.

    A non-200 invites retries whose behaviour nobody has observed, and by the time anything
    here can fail the bytes are already safe -- which is what makes answering 200 to a
    forged callback the right answer rather than a lax one.

    `SessionDep`, not `TenantSessionDep`: there is no authenticated caller, so there is no
    studio in context and the tenant-scoped dependency would 401 every real payment. The
    scope is opened from the order's own `studio_id` once the order is found.
    """
    raw_query = str(request.url.query)
    raw = dict(request.query_params)
    source_ip = _source_ip(request)
    at = now()

    # The order lookup is a deliberate cross-tenant read, and the only one here.
    # `uq_payment_order_public_ref` makes `public_ref` globally unique, and §5.10 makes it a
    # UUIDv4 precisely so that knowing one is the same as being authorised for it.
    order = session.execute(select_order(public_ref)).scalar_one_or_none()

    if order is None:
        # 'A callback for an unknown reference is logged and rejected, not auto-created.'
        # Auto-creating an order from a callback would let anyone mint paid orders from
        # nothing. There is no tenant to attribute the bytes to, so they are logged and the
        # answer is still 200 -- a retry would tell us nothing new.
        logger.warning(
            "upay ipn for an unknown order reference",
            extra={"public_ref": str(public_ref), "source_ip": source_ip},
        )
        return Response(status_code=status.HTTP_200_OK)

    try:
        with use_studio(order.studio_id):
            intake = IpnIntake(session)
            record, is_new = intake.record(
                order.studio_id,
                raw_query=raw_query,
                raw=raw,
                source_ip=source_ip,
                at=at,
            )
            if is_new:
                intake.settle(record.id, at=at)
            session.commit()
    except Exception:  # noqa: BLE001 -- deliberate: see the docstring
        # A bug in settlement must not become a retry storm, and the raw bytes are already
        # committed by the nested savepoint in `record()`. Logged loudly, answered 200.
        session.rollback()
        logger.exception(
            "upay ipn processing failed after the callback was persisted",
            extra={"public_ref": str(public_ref)},
        )

    if source_ip is not None and not source_ip_is_known(source_ip):
        # Recorded on the row and noted here. Never a decision -- see `_source_ip`.
        logger.info(
            "upay ipn arrived from an unrecognised address",
            extra={"public_ref": str(public_ref), "source_ip": source_ip},
        )
    return Response(status_code=status.HTTP_200_OK)


def select_order(public_ref: uuid.UUID) -> Select[tuple[PaymentOrder]]:
    """The one cross-tenant statement in this module, named so it is easy to find.

    Written as a function rather than inline so that a grep for a cross-tenant read in this
    lane lands on something with a docstring explaining why it is allowed: `public_ref` is
    globally unique (`uq_payment_order_public_ref`) and a UUIDv4, so knowing one is the same
    as being authorised for it -- which is the whole of §5.10's first threat row.
    """
    return select(PaymentOrder).where(PaymentOrder.public_ref == public_ref)
