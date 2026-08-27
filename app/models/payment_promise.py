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

A pending promise does NOT claim its charges the way a payment order does: a parent who
said "cash" and then pays by card mid-week has simply changed their mind, and the
confirmation path treats already-settled charges as work already done.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import (
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

#: The two prepaid, human-confirmed routes. A promise's method is which words the parent
#: used -- it becomes the recorded payment's method at confirmation, so both values must
#: also appear in billing.PAYMENT_METHODS.
PROMISE_METHODS = ("cash", "cheque")


class PaymentPromise(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "payment_promise"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'received', 'declined')", name="payment_promise_status"
        ),
        CheckConstraint("method IN ('cash', 'cheque')", name="payment_promise_method"),
        CheckConstraint("total_agorot > 0", name="payment_promise_total_positive"),
        Index("ix_payment_promise_studio_id_status", "studio_id", "status"),
        Index("ix_payment_promise_studio_id_payer_person_id", "studio_id", "payer_person_id"),
    )

    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    method: Mapped[str] = mapped_column(String(12), nullable=False, default="cash")
    #: What the parent saw when they raised it. G2 -- agorot, integer.
    total_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
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
