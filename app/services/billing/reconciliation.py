"""§5.10's IPN intake, and the ledger path from a callback to a settled charge.

**Persist first, always.** upay-integration.md calls the raw record "the single
highest-value piece of infrastructure here": retries on a non-200, IPNs for failed payments
and duplicate delivery are all **[NOT COVERED]** by any testing anyone has done against this
account. Logging the raw callback before parsing turns each of those unknowns into something
observed in production with full data, rather than pre-guessed. So `record()` writes the
bytes whatever they are, and `settle()` reaches a verdict afterwards against a row that
already exists.

That ordering is also what makes refusing safe. `app/integrations/upay/callback.py` raises
rather than coercing on an unrecognised amount, an unobserved outcome code or a missing
field -- and it can, because by the time it runs the evidence is already written down and a
human can see it.

**Idempotence is keyed on `transactionid`**, which neutralises retries and duplicates
whatever uPay actually does. The design deliberately does not depend on knowing.

**§11.7 -- nothing here logs a card owner name or last four digits.** They are columns on
`upay_ipn_record`, read on a manager-only screen, which is where reconciling actually
happens. A log line carrying them is a copy nobody can redact later.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.upay.callback import (
    IpnVerdict,
    MalformedIpnError,
    NotAnOrderIpnError,
    UnobservedIpnOutcomeError,
    parse_ipn,
    verify_ipn,
)
from app.integrations.upay.ipn import UnparsableIpnAmountError, agorot_from_ipn_amount
from app.models.billing import PaymentOrder, UpayIpnRecord
from app.services.billing.errors import NotFoundError
from app.services.billing.orders import OrderService
from app.services.billing.payments import PaymentService

logger = logging.getLogger(__name__)


def _first(raw: dict[str, str], key: str) -> str:
    return (raw.get(key) or "").strip()


class IpnIntake:
    """The endpoint's two halves: write the bytes down, then work out what they mean."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- persist ---------------------------------------------------------------
    def record(
        self,
        studio_id: uuid.UUID,
        *,
        raw_query: str,
        raw: dict[str, str],
        source_ip: str | None,
        at: datetime,
    ) -> tuple[UpayIpnRecord, bool]:
        """Persist one callback verbatim. Returns `(record, is_new)`.

        Parses leniently and **never raises**: a callback missing `transactionid` still
        produces a row, because the whole point of this table is that a shape nobody has
        seen becomes evidence rather than a 500. A deterministic placeholder stands in for
        the missing id so the row can exist at all, and the record lands `unmatched` for a
        human.

        `is_new` is False for a re-delivery. Detected by catching the unique violation
        rather than by pre-checking, so two concurrent deliveries cannot both pass a read.
        """
        transaction_id = (
            _first(raw, "transactionid") or f"UNPARSED-{uuid.uuid5(uuid.NAMESPACE_URL, raw_query)}"
        )
        record = UpayIpnRecord(
            studio_id=studio_id,
            received_at=at,
            source_ip=source_ip,
            raw_query=raw_query,
            order_public_ref=_maybe_uuid(_first(raw, "productdescription")),
            transactionid=transaction_id,
            # Kept as uPay sent it. Storing only our parse would lose the evidence of what
            # actually arrived, which is the one thing an amount dispute turns on.
            amount=_first(raw, "amount")[:30],
            card_owner_name=_first(raw, "cardownername")[:120] or None,
            four_digits=_first(raw, "fourdigits")[:4] or None,
            payment_date=_maybe_date(_first(raw, "paymentdate")),
            match_status="unmatched",
        )
        # **The SAVEPOINT is opened BEFORE the add**, and that ordering is the whole trick.
        # `begin_nested()` snapshots the session by flushing it, so a row added first is
        # written OUTSIDE the savepoint -- the unique violation then poisons the outer
        # transaction and the "already delivered" read below fails with
        # `PendingRollbackError` instead of returning the existing row. Which would turn
        # every duplicate delivery into a 500 on the one endpoint that must never have one.
        try:
            with self._session.begin_nested():
                self._session.add(record)
                self._session.flush()
        except IntegrityError:
            # `uq_upay_ipn_record_transactionid`. Caught rather than pre-checked, so two
            # concurrent deliveries cannot both pass a read and both insert.
            existing = self._session.execute(
                select(UpayIpnRecord).where(UpayIpnRecord.transactionid == transaction_id)
            ).scalar_one()
            return existing, False
        return record, True

    # -- settle ----------------------------------------------------------------
    def settle(self, record_id: uuid.UUID, *, at: datetime) -> IpnVerdict | None:
        """Reach §5.10's verdict for one already-persisted callback and act on it.

        Returns the verdict, or `None` when there is none to give -- an unreferenced
        recurring payment, a malformed delivery, an outcome code nobody has observed. Each
        of those leaves the record `unmatched`, which is the reconciliation queue.
        """
        record = self._session.get(UpayIpnRecord, record_id)
        if record is None:  # pragma: no cover -- written a moment ago
            raise NotFoundError(f"no ipn record {record_id}")
        raw = _query_to_dict(record.raw_query)
        try:
            payload = parse_ipn(raw)
        except MalformedIpnError:
            # A delivery missing a field the verdict is computed from cannot be classified
            # at all. The bytes are kept; a human sees it.
            logger.warning("upay ipn is malformed", extra={"ipn_record_id": str(record.id)})
            return None

        orders = OrderService(self._session)
        order: PaymentOrder | None = None
        if payload.public_ref is not None:
            try:
                order = orders.get_by_public_ref(payload.public_ref)
            except NotFoundError:
                order = None

        seen = self._other_transaction_ids(record)
        try:
            verdict = verify_ipn(
                payload,
                expected_amount_agorot=order.expected_amount_agorot if order else 0,
                known_public_ref=order.public_ref if order else None,
                seen_transaction_ids=seen,
            )
        except NotAnOrderIpnError:
            # §5.10's recurring path, and it is LEGITIMATE. Every הוראת קבע payment arrives
            # with no reference, and answering `forged_ref` for them would raise a fraud
            # alert on every one of them.
            return None
        except UnobservedIpnOutcomeError:
            # IPNs for failed payments are [NOT COVERED]. Guessing either way is worse than
            # refusing: `success` settles charges for money that did not arrive, and
            # inventing a failure shape would swallow the first real one.
            logger.warning(
                "upay ipn carries an unobserved outcome code",
                extra={
                    "ipn_record_id": str(record.id),
                    "provider_error_code": payload.provider_error_code,
                },
            )
            return None
        except UnparsableIpnAmountError:
            logger.warning(
                "upay ipn amount is in a format we have never seen",
                extra={"ipn_record_id": str(record.id)},
            )
            return None

        if verdict is IpnVerdict.DUPLICATE:
            # 'A second delivery is logged and ignored.' The first earned its verdict.
            record.match_status = "ignored"
            self._session.flush()
            return verdict
        if verdict is IpnVerdict.FORGED_REF or order is None:
            # The reference names no order of ours. Nothing to settle -- and the bytes are
            # kept, because a forged callback is the one we most want a record of.
            self._session.flush()
            return IpnVerdict.FORGED_REF

        if verdict is IpnVerdict.AMOUNT_MISMATCH:
            self._record_mismatch(record, order, payload.amount, at=at)
            return verdict

        self._settle_order(record, order, payload.transaction_id, at=at)
        return verdict

    # -- the two money paths ---------------------------------------------------
    def _settle_order(
        self, record: UpayIpnRecord, order: PaymentOrder, transaction_id: str, *, at: datetime
    ) -> None:
        """§5.10's happy path. One payment, allocated across every charge the order covers."""
        payments = PaymentService(self._session)
        orders = OrderService(self._session)
        payment = payments.record(
            order.studio_id,
            payer_person_id=order.payer_person_id,
            method="upay_card",
            amount_agorot=order.expected_amount_agorot,
            received_at=at,
            charge_ids=orders.charge_ids_of(order.id),
            # Nobody typed this in. §11.7 aside, attributing it to a person would be a lie.
            recorded_by_person_id=None,
            payment_order_id=order.id,
            upay_ipn_id=record.id,
        )
        order.status = "paid"
        order.paid_at = at
        order.external_payment_ref = transaction_id
        record.matched_payment_id = payment.id
        record.match_status = "auto"
        self._session.flush()

    def _record_mismatch(
        self, record: UpayIpnRecord, order: PaymentOrder, amount: str, *, at: datetime
    ) -> None:
        """§5.10's fourth threat row, verbatim: 'A `payment` **is** recorded for the real
        amount received, allocated to nothing, and a high-priority manager alert is raised.
        Charges are **not** settled.'

        **Never collapse this into `failed`.** The money is in the merchant account, and an
        `amount_mismatch` that recorded nothing would lose it.
        """
        try:
            received = agorot_from_ipn_amount(amount)
        except UnparsableIpnAmountError:
            # The amount is both wrong AND unreadable. The record stays unmatched with the
            # raw string on it; inventing a number here would be the coercion `ipn.py`
            # refuses for exactly this reason.
            logger.warning(
                "upay ipn amount mismatch is also unparsable",
                extra={"ipn_record_id": str(record.id)},
            )
            order.status = "amount_mismatch"
            self._session.flush()
            return
        payment = PaymentService(self._session).record(
            order.studio_id,
            payer_person_id=order.payer_person_id,
            method="upay_card",
            amount_agorot=received,
            received_at=at,
            # Allocated to NOTHING. The charges stay open.
            charge_ids=[],
            recorded_by_person_id=None,
            payment_order_id=order.id,
            upay_ipn_id=record.id,
            note="amount_mismatch",
        )
        order.status = "amount_mismatch"
        record.matched_payment_id = payment.id
        record.match_status = "unmatched"
        self._session.flush()

    # -- internals -------------------------------------------------------------
    def _other_transaction_ids(self, record: UpayIpnRecord) -> set[str]:
        """Every transaction id we have already seen, except this record's own.

        Excluding itself is load-bearing: `record()` has already persisted this delivery, so
        including it would make every first delivery look like a duplicate of itself.
        """
        return set(
            self._session.execute(
                select(UpayIpnRecord.transactionid).where(UpayIpnRecord.id != record.id)
            ).scalars()
        )


def _query_to_dict(raw_query: str) -> dict[str, str]:
    """uPay's query string back to a mapping, from the verbatim column.

    Re-parsed from the stored bytes rather than passed along in memory, so `settle()` reads
    exactly what was written down -- which is what makes it safe to run in a worker, later,
    against a row somebody is looking at on a screen.
    """
    from urllib.parse import parse_qsl

    return dict(parse_qsl(raw_query, keep_blank_values=True))


def _maybe_uuid(text: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(text)
    except ValueError:
        return None


def _maybe_date(text: str) -> date | None:
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None
