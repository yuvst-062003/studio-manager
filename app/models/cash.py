"""'I will pay cash', as a first-class object (feature pass 2026-08-27).

§5.10 records cash after the fact -- a manager types the payment in once the notes have
changed hands. Until now the parent's half of that conversation lived on WhatsApp: there
was no in-app way to SAY "I'm bringing cash", so the manager's collections list showed a
debt right up to the moment the money appeared. A ``cash_request`` is that sentence, over
specific open charges, with exactly two endings: a manager confirms (the cash payment is
recorded through ``BillingService``'s one writer and the charges settle) or declines
(the charges stay open, and the parent is told rather than left guessing).

**The snapshot is display, never settlement.** ``total_agorot`` freezes what the request
looked like when raised; confirmation always recomputes from the charges' outstanding
amounts at that moment, so a request raised before a partial card payment cannot
over-collect.

A pending request does NOT claim its charges the way a payment order does: a parent who
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


class CashRequest(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "cash_request"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'received', 'declined')", name="cash_request_status"
        ),
        CheckConstraint("total_agorot > 0", name="cash_request_total_positive"),
        Index("ix_cash_request_studio_id_status", "studio_id", "status"),
        Index("ix_cash_request_studio_id_payer_person_id", "studio_id", "payer_person_id"),
    )

    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    #: What the parent saw when they raised it. G2 -- agorot, integer.
    total_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    decided_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))


class CashRequestCharge(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """Which open charges one request offers cash for."""

    __tablename__ = "cash_request_charge"
    __tenant_table_args__ = (
        UniqueConstraint(
            "cash_request_id", "charge_id", name="uq_cash_request_charge_request_charge"
        ),
        Index("ix_cash_request_charge_charge_id", "charge_id"),
    )

    cash_request_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("cash_request.id", ondelete="CASCADE"), nullable=False
    )
    charge_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("charge.id", ondelete="RESTRICT"), nullable=False
    )
