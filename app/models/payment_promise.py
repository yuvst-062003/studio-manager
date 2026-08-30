"""'I will pay cash' / 'I will bring cheques', as one first-class object.

§5.10 records cash after the fact -- a manager types the payment in once the notes have
changed hands -- and the manager's letter adds a second route with the same shape: twelve
post-dated cheques made out to the association. Until this object existed, the parent's
half of that conversation lived on WhatsApp: there was no in-app way to SAY "I'm bringing
cash" or "I'm bringing cheques", so the manager's collections list showed a debt right up
to the moment the money appeared. A ``payment_promise`` is that sentence, over specific
open charges, with exactly two endings: a manager confirms (the payment is recorded
through ``BillingService``'s one writer and the charges settle) or declines (the charges
stay open, and the parent is told rather than left guessing). ``method`` says which words
the parent used; nothing else about the lifecycle differs between the two.

**The snapshot is display, never settlement.** ``total_agorot`` freezes what the promise
looked like when raised; confirmation always recomputes from the charges' outstanding
amounts at that moment, so a promise raised before a partial card payment cannot
over-collect.

**A promise has two halves and they never double-count.** ``charges`` are specific open
charges it settles; ``prepay_months`` is whole future months, priced at the payer's
monthly total. The club collects three months of cash or twelve cheques at a time, and
``payment_promise_charge`` can only name charges that already exist -- so the forward half
is a COUNT OF MONTHS rather than a list of rows, and what it buys becomes an unallocated
surplus on the confirmed payment. That surplus is the credit; the billing run's step 7
spends it. There is no second mechanism and no "prepayment" table, because a ``payment``
with a short allocation list already means exactly this.

A pending promise does NOT claim its charges the way a payment order does: a parent who
said "cash" and then pays by card mid-week has simply changed their mind, and the
confirmation path treats already-settled charges as work already done.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: The prepaid, human-confirmed routes. A promise's method is which words the parent
#: used -- it becomes the recorded payment's method at confirmation, so every value must
#: also appear in billing.PAYMENT_METHODS. `standing_order` joined 2026-08-30 for the
#: plan-claim flow: G8 says the provider cannot confirm a mandate, so "I set one up" is a
#: sentence only a manager can settle -- exactly what this object is.
PROMISE_METHODS = ("cash", "cheque", "standing_order")


class PaymentPromise(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "payment_promise"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'received', 'declined')", name="payment_promise_status"
        ),
        CheckConstraint(
            "method IN ('cash', 'cheque', 'standing_order')", name="payment_promise_method"
        ),
        CheckConstraint("total_agorot > 0", name="payment_promise_total_positive"),
        CheckConstraint("prepay_months >= 0", name="payment_promise_prepay_months"),
        CheckConstraint("claimed_agorot >= 0", name="payment_promise_claimed_agorot"),
        Index("ix_payment_promise_studio_id_status", "studio_id", "status"),
        Index("ix_payment_promise_studio_id_payer_person_id", "studio_id", "payer_person_id"),
    )

    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    method: Mapped[str] = mapped_column(String(16), nullable=False, default="cash")
    #: What the parent saw when they raised it. G2 -- agorot, integer.
    total_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    #: The payment program the parent says they already paid for (the plan-claim flow),
    #: or null for the ordinary settle-my-charges promise. Context for the manager's card
    #: -- "which program is this money about" -- never a discount on validation.
    claimed_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("price_plan.id", ondelete="SET NULL")
    )
    #: What that claim was priced at when raised -- by the SERVER, from the plan row.
    #: FROZEN at claim time, unlike the charges half: this is money the parent says has
    #: already changed hands, so a later price change must not re-price it.
    claimed_agorot: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Whole months of tuition bought forward, BEYOND the charges this promise names. 0 is
    #: the ordinary settle-what-is-owed promise, and is what a studio with a term of 0
    #: configured can raise at all.
    prepay_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Whether the parent says the money has ALREADY changed hands, rather than that they
    #: are about to hand it over. Both are promises and both end at a manager confirming by
    #: hand; what differs is what the manager does next -- look in the drawer now, or wait.
    #:
    #: **It settles nothing.** A claim that money arrived is not the money arriving: no
    #: payment is recorded and no charge closes until a human confirms, which is G8 and the
    #: entire reason this object exists.
    already_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: The payment a confirmed promise produced, or null while it is pending or declined.
    #:
    #: Recorded so a surplus can be RECOGNISED. §5.10 already surfaces an unallocated
    #: surplus for a manager to look at, and a prepaying family creates one deliberately
    #: every time they pay -- without this link every one of them is an anomaly nobody
    #: asked for.
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payment.id", ondelete="SET NULL")
    )
    decided_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))


class PaymentPromiseCharge(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """Which open charges one promise offers to settle."""

    __tablename__ = "payment_promise_charge"
    __tenant_table_args__ = (
        UniqueConstraint(
            "payment_promise_id", "charge_id", name="uq_payment_promise_charge_promise_charge"
        ),
        Index("ix_payment_promise_charge_charge_id", "charge_id"),
    )

    payment_promise_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("payment_promise.id", ondelete="CASCADE"),
        nullable=False,
    )
    charge_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("charge.id", ondelete="RESTRICT"), nullable=False
    )
