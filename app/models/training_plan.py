"""The three tables a training plan needs: eligibility, bookings, and scheduled changes.

The club sells 300 / 400 / 550 ₪. Base training on Tuesday and Friday is included in every
plan and is never marked; 400 buys one extra session a week, which the student **must
mark**, after which the app stops letting them mark more; 550 removes the weekly limit and
opens the Saturday private lesson. `group.kind` is what separates those three cases, and
these tables are what the rules are enforced against.

**Why bookings point at a session and not at a week plus a group.** Sessions are already
materialised rows carrying `starts_at`, so the week bucket is derivable, the coach's roster
joins directly, and a cancelled or rescheduled session takes its bookings with it rather
than leaving them pointing at a slot that no longer exists.

**Why a plan change is a row rather than an edit.** A change is *scheduled* -- a downgrade
takes effect on the first of the next month -- so it has to be recorded before it takes
effect, and somebody has to close the money loop afterwards. §11: two of the club's three
payment routes are prepaid, so a plan change cannot settle itself.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: A scheduled change's lifecycle. `cancelled` is a parent changing their mind before the
#: first of the month, which is the whole reason the change is a row and not an edit.
PLAN_CHANGE_STATUSES = ("scheduled", "applied", "cancelled")

#: §11 -- the money half, closed by a human. `pending` until somebody has collected the
#: difference, cancelled the old הוראת קבע mandate, or decided nothing is owed.
PLAN_CHANGE_SETTLEMENTS = ("pending", "settled")


class GroupEligibility(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """Which base groups may reach which extra group.

    **An explicit link, not a derivation from age.** The manager's rule reads "Sunday Judo
    is for Groups 2-4, CrossFit is for Groups 3-5" -- and the brackets OVERLAP: Groups 2
    and 3 both contain nine-year-olds, Groups 3 and 4 both contain ten-year-olds. An age
    rule would let a nine-year-old the coach placed in Group 2 into CrossFit, which is not
    what "Groups 3+4+5" means. The table is roughly fifteen rows, set once, and it matches
    how the manager states the rule.

    An invite-only group has no rows here at all -- see `Group.is_invite_only`.
    """

    __tablename__ = "group_eligibility"
    __tenant_table_args__ = (
        UniqueConstraint("extra_group_id", "base_group_id", name="uq_group_eligibility_extra_base"),
        Index("ix_group_eligibility_base_group_id", "base_group_id"),
    )

    extra_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="CASCADE"), nullable=False
    )
    base_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("group.id", ondelete="CASCADE"), nullable=False
    )


class SessionBooking(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """A student saying "I am coming to this one".

    **Only for `extra` and `private` sessions.** Base sessions come from the enrollment
    exactly as they do today; marking exists only where the plan limits something.

    **Released by `cancelled_at`, never deleted.** A booking that vanished would take the
    audit trail of a spent-and-returned credit with it, and the unique index below is
    partial on the live rows precisely so a student may release Monday and re-mark it.

    §3.2 -- free until the session starts, then spent. That gives a family real
    flexibility (a child sick on Monday moves to Wednesday) while giving the coach a roster
    that stops moving at the moment it matters.
    """

    __tablename__ = "session_booking"
    __tenant_table_args__ = (
        # Partial, on the LIVE rows only. A released booking is a row that still exists,
        # so a student who releases Monday and re-marks it must not hit a unique violation.
        Index(
            "uq_session_booking_live",
            "student_id",
            "session_id",
            unique=True,
            postgresql_where=text("cancelled_at IS NULL"),
        ),
        # The coach's roster.
        Index(
            "ix_session_booking_live_session",
            "studio_id",
            "session_id",
            postgresql_where=text("cancelled_at IS NULL"),
        ),
        # The allowance count.
        Index(
            "ix_session_booking_live_student",
            "studio_id",
            "student_id",
            postgresql_where=text("cancelled_at IS NULL"),
        ),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    #: The parent, adult student or manager who marked it. Nullable because §11.4's
    #: anonymisation destroys a person and retains the training record.
    marked_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    cancelled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))


class PlanChange(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """A student moving between price plans, recorded before it takes effect.

    **`effective_on` is always the first of a month.** There is no proration: a plan change
    moves on the first, whole, and the monthly billing run raises the new amount as an
    ordinary charge the parent pays on the screen they already use.

    **Upgrades unlock access at once; downgrades wait.** Access and price move together for
    a downgrade -- the worker applies it on `effective_on` and releases future bookings the
    new allowance no longer covers, latest first. An upgrade sets `student.price_plan_id`
    the moment it is requested, because withholding access somebody has volunteered to pay
    more for is a worse failure than the club carrying two sessions.

    **`settlement_status` is §11, and it is a human's job.** Two of the club's three
    payment routes are prepaid, so a change cannot settle itself; the prepayment design
    turns the cash and cheque cases into an ordinary open charge, and the standing-order
    case genuinely needs somebody to cancel the old mandate and send the new link.
    """

    __tablename__ = "plan_change"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('scheduled', 'applied', 'cancelled')", name="plan_change_status"
        ),
        CheckConstraint(
            "settlement_status IN ('pending', 'settled')", name="plan_change_settlement_status"
        ),
        Index(
            "ix_plan_change_studio_id_status_effective_on", "studio_id", "status", "effective_on"
        ),
        Index("ix_plan_change_studio_id_settlement_status", "studio_id", "settlement_status"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="CASCADE"), nullable=False
    )
    #: Nullable: a first assignment has nothing to move from.
    from_price_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("price_plan.id", ondelete="RESTRICT")
    )
    to_price_plan_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("price_plan.id", ondelete="RESTRICT"), nullable=False
    )
    effective_on: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    requested_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    requested_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="scheduled")
    applied_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    settlement_status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    settled_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    settled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
