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
from dataclasses import dataclass
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
from app.models.billing import (
    PayerFingerprint,
    Payment,
    PaymentOrder,
    RecurringSubscription,
    UpayIpnRecord,
)
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
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
            # IPNs for failed payments are [NOT COVERED]. Guessing the SHAPE of a failure is
            # still refused here, exactly as before: no `Payment` is recorded, no amount
            # field is trusted, `record.match_status` stays `unmatched` -- `success` would
            # settle charges for money that did not arrive, and inventing a failure shape
            # would swallow the first real one.
            #
            # §7.4 -- what WAS missing is narrower than a shape: the one fact this order
            # needs regardless of what the code turns out to mean is that something other
            # than success arrived for it, so the parent stops being told 'verifying' for
            # 24 hours. Only from `pending`, never overwriting an order that already
            # resolved -- an unrelated later delivery carrying an unseen code must not make
            # a genuinely paid family look unpaid again. `_settle_order` above overwrites
            # `status` unconditionally on any later success, so this is not a dead end: a
            # genuine retry still settles the order correctly.
            logger.warning(
                "upay ipn carries an unobserved outcome code",
                extra={
                    "ipn_record_id": str(record.id),
                    "provider_error_code": payload.provider_error_code,
                },
            )
            if order is not None and order.status == "pending":
                order.status = "failed"
                self._session.flush()
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


# -- §5.10's הוראת קבע reconciliation ------------------------------------------
def normalize_card_owner_name(raw: str) -> str:
    """`(normalized card owner name, last 4) -> payer`, and this is the normalisation half.

    **Deliberately shallow: case, and whitespace.** Nothing more. A normalisation
    aggressive enough to strip punctuation or transliterate would merge two real names, and
    §5.10 says what that costs -- 'a wrong automatic match marks the wrong payer paid and
    sends the wrong parent a debt reminder, an expensive bug in a small community'.

    `casefold` rather than `lower`: it folds the cases `lower` leaves alone in non-ASCII
    scripts, and the club's names are Hebrew.
    """
    return " ".join(raw.split()).casefold()


@dataclass(frozen=True, slots=True)
class MatchSuggestion:
    """One unmatched IPN, and the payer a fingerprint says it probably belongs to.

    `confidence` is **advisory and nothing acts on a threshold** (§5.10 step 5). It is a
    number a human reads before tapping, not a gate anything passes.
    """

    ipn_id: uuid.UUID
    payer_person_id: uuid.UUID
    confidence: int
    amount_agorot: int | None
    card_owner_name: str | None
    four_digits: str | None


class ReconciliationService:
    """§5.10's monthly reconciliation, and G8's whole consequence.

    uPay cannot create a per-payer mandate, cannot vary its amount per payer, and provides
    **no field identifying which customer paid** -- confirmed with support and re-confirmed
    in round two of live testing. So this service never claims to know. It suggests, and a
    human confirms every match.

    'Month 1 is fully manual. By month 3 most rows are one-tap confirmations.'
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- the queue -------------------------------------------------------------
    def unmatched(
        self, studio_id: uuid.UUID, *, after: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[UpayIpnRecord], uuid.UUID | None]:
        """`3e`'s left-hand column: payments waiting for a human to say whose they are."""
        stmt = select(UpayIpnRecord).where(
            UpayIpnRecord.studio_id == studio_id,
            UpayIpnRecord.match_status == "unmatched",
        )
        if after is not None:
            stmt = stmt.where(UpayIpnRecord.id > after)
        rows = list(
            self._session.execute(
                stmt.order_by(UpayIpnRecord.received_at.desc(), UpayIpnRecord.id).limit(limit + 1)
            ).scalars()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        return rows, (rows[-1].id if has_more and rows else None)

    def suggestions(self, studio_id: uuid.UUID) -> list[MatchSuggestion]:
        """§5.10 step 4 -- 'arriving IPNs are pre-matched against fingerprints and presented
        as suggestions with a confidence indicator. The manager confirms with one tap.'

        **This writes nothing.** Not a payment, not an allocation, not a changed status, not
        even a `match_status`. Computing a suggestion twice must leave the ledger exactly
        where it was, because the manager's tap is the only thing that moves money.
        """
        fingerprints = {
            (row.four_digits, row.card_owner_name_normalized): row
            for row in self._session.execute(
                select(PayerFingerprint).where(PayerFingerprint.studio_id == studio_id)
            ).scalars()
        }
        if not fingerprints:
            return []
        out: list[MatchSuggestion] = []
        rows, _cursor = self.unmatched(studio_id, limit=200)
        for record in rows:
            if not record.four_digits or not record.card_owner_name:
                continue
            key = (record.four_digits, normalize_card_owner_name(record.card_owner_name))
            fingerprint = fingerprints.get(key)
            if fingerprint is None:
                continue
            out.append(
                MatchSuggestion(
                    ipn_id=record.id,
                    payer_person_id=fingerprint.payer_person_id,
                    confidence=fingerprint.confidence,
                    amount_agorot=_maybe_agorot(record.amount),
                    card_owner_name=record.card_owner_name,
                    four_digits=record.four_digits,
                )
            )
        return out

    def expected_payers(self, studio_id: uuid.UUID) -> list[RecurringSubscription]:
        """`3e`'s right-hand column -- 'payers expected to pay this month'.

        §5.10: `recurring_subscription` 'drives the "expected to pay this month" column in
        the reconciliation queue and the double-payment warning, and nothing else.'
        """
        return list(
            self._session.execute(
                select(RecurringSubscription)
                .where(
                    RecurringSubscription.studio_id == studio_id,
                    RecurringSubscription.status == "active",
                )
                .order_by(RecurringSubscription.id)
            ).scalars()
        )

    # -- the human's decision --------------------------------------------------
    def confirm_match(
        self,
        record_id: uuid.UUID,
        *,
        payer_person_id: uuid.UUID,
        confirmed_by_person_id: uuid.UUID | None,
        at: datetime,
    ) -> Payment:
        """§5.10 step 3, verbatim: 'creates a `payment` with `method = 'standing_order'`,
        allocates it to that payer's open charges oldest-first, and writes a
        `payer_fingerprint` of (normalized card owner name, last 4 digits) -> payer'.

        `confirmed_by_person_id` is required, and that is step 5 made structural: a match
        with nobody behind it is an automatic match with extra steps.
        """
        if confirmed_by_person_id is None:
            raise RefusedError(
                "a match needs the person who confirmed it -- §5.10 step 5: a human always "
                "confirms, and a row that cannot name one is an automatic match"
            )
        record = self._session.get(UpayIpnRecord, record_id)
        if record is None:
            raise NotFoundError(f"no ipn record {record_id}")
        if record.match_status != "unmatched":
            raise ConflictError(
                f"ipn {record_id} is already {record.match_status}; two matches would "
                "create two payments for one arrival of money"
            )
        try:
            amount = agorot_from_ipn_amount(record.amount)
        except UnparsableIpnAmountError as exc:
            raise RefusedError(
                f"the recorded amount {record.amount!r} is not a format we can read"
            ) from exc

        payments = PaymentService(self._session)
        payment = payments.record(
            record.studio_id,
            payer_person_id=payer_person_id,
            method="standing_order",
            amount_agorot=amount,
            received_at=at,
            charge_ids=[],
            recorded_by_person_id=confirmed_by_person_id,
            upay_ipn_id=record.id,
        )
        payments.allocate_oldest_first(payment.id, payer_person_id=payer_person_id)
        record.match_status = "manual"
        record.matched_payment_id = payment.id
        self._remember(record, payer_person_id, confirmed_by_person_id, at)
        self._session.flush()
        return payment

    def get_record(self, record_id: uuid.UUID) -> UpayIpnRecord:
        record = self._session.get(UpayIpnRecord, record_id)
        if record is None:
            raise NotFoundError(f"no ipn record {record_id}")
        return record

    def ignore(self, record_id: uuid.UUID) -> UpayIpnRecord:
        """A manager saying 'this is not ours' -- a test charge, a refund, a payment to a
        different business on the same merchant account. **The bytes stay**: `ignored` is a
        judgement about what a record means, never a reason to stop keeping it."""
        record = self._session.get(UpayIpnRecord, record_id)
        if record is None:
            raise NotFoundError(f"no ipn record {record_id}")
        if record.match_status not in ("unmatched", "ignored"):
            raise ConflictError(f"ipn {record_id} is {record.match_status}, not unmatched")
        record.match_status = "ignored"
        self._session.flush()
        return record

    # -- the manager's record of who is on the link ----------------------------
    def list_subscriptions(
        self, studio_id: uuid.UUID, *, after: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[RecurringSubscription], uuid.UUID | None]:
        stmt = select(RecurringSubscription).where(RecurringSubscription.studio_id == studio_id)
        if after is not None:
            stmt = stmt.where(RecurringSubscription.id > after)
        rows = list(
            self._session.execute(
                stmt.order_by(RecurringSubscription.id).limit(limit + 1)
            ).scalars()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        return rows, (rows[-1].id if has_more and rows else None)

    def record_subscription(
        self,
        studio_id: uuid.UUID,
        *,
        payer_person_id: uuid.UUID,
        amount_agorot: int,
        start_date: date,
    ) -> RecurringSubscription:
        """**The manager's note of who is on הוראת קבע. Not a mandate, and not creatable.**

        G8: uPay cannot create a per-payer mandate, so there is no external reference, no
        token and no provider id to store -- there is nothing to store. The manager
        necessarily knows who is on the link, because they handed it out. **The parent never
        sets this.**
        """
        if amount_agorot <= 0:
            raise RefusedError("a subscription records what the parent pays each month")
        row = RecurringSubscription(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            amount_agorot=amount_agorot,
            start_date=start_date,
            status="active",
        )
        self._session.add(row)
        try:
            with self._session.begin_nested():
                self._session.flush()
        except IntegrityError as exc:
            # `uq_recurring_subscription_active_payer`, partial on status = 'active'. Two
            # would make 'expected this month' ambiguous for the one family it matters for.
            raise ConflictError(
                f"payer {payer_person_id} already has an active subscription"
            ) from exc
        return row

    def cancel_subscription(
        self, subscription_id: uuid.UUID, *, at: datetime
    ) -> RecurringSubscription:
        """A family who stopped. The row stays as history -- it is what explains why last
        March's reconciliation expected them."""
        row = self._session.get(RecurringSubscription, subscription_id)
        if row is None:
            raise NotFoundError(f"no subscription {subscription_id}")
        if row.status == "cancelled":
            raise ConflictError(f"subscription {subscription_id} is already cancelled")
        row.status = "cancelled"
        row.cancelled_at = at
        self._session.flush()
        return row

    # -- internals -------------------------------------------------------------
    def _remember(
        self,
        record: UpayIpnRecord,
        payer_person_id: uuid.UUID,
        confirmed_by_person_id: uuid.UUID,
        at: datetime,
    ) -> None:
        """§5.10 step 3's third clause, and the whole reason month 3 is faster than month 1.

        Upserted rather than inserted: the same card next month is the SAME fingerprint, and
        a second row would split the evidence in half -- two rows at confidence 1 instead of
        one at 2, which is exactly backwards from what the confidence is for.
        """
        if not record.four_digits or not record.card_owner_name:
            return
        normalized = normalize_card_owner_name(record.card_owner_name)
        existing = self._session.execute(
            select(PayerFingerprint).where(
                PayerFingerprint.studio_id == record.studio_id,
                PayerFingerprint.four_digits == record.four_digits,
                PayerFingerprint.card_owner_name_normalized == normalized,
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.payer_person_id = payer_person_id
            existing.confidence += 1
            existing.last_seen = at
            existing.confirmed_by_person_id = confirmed_by_person_id
            return
        self._session.add(
            PayerFingerprint(
                studio_id=record.studio_id,
                payer_person_id=payer_person_id,
                four_digits=record.four_digits,
                card_owner_name_normalized=normalized,
                confidence=1,
                first_seen=at,
                last_seen=at,
                confirmed_by_person_id=confirmed_by_person_id,
            )
        )


def _maybe_agorot(text: str) -> int | None:
    try:
        return agorot_from_ipn_amount(text)
    except UnparsableIpnAmountError:
        return None
