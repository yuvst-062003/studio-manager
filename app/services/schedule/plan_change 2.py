"""Moving a student between price plans — scheduled, applied, and settled by a human.

**Upgrades unlock access immediately; downgrades wait for the first of the month.**

That asymmetry is a decision, not an oversight. §10 moves access and price together on the
first, and §15's open item 3 records the alternative: "Unlocking access immediately would
be a friendlier upgrade and costs the club roughly two sessions; it is a one-line change to
the worker." It is taken here, in both directions:

* An **upgrade** sets `student.price_plan_id` at request time. The child marks their extra
  session tonight, and the monthly run raises the new amount on the 1st with no proration —
  the club carries the difference for the rest of the month, deliberately. Withholding
  access somebody has volunteered to pay more for is the worse failure.
* A **downgrade** does not move until `effective_on`. A family who paid for this month
  keeps this month, and the sessions they have already marked stay marked.

Either way the change is **recorded before it takes effect**, which is what lets a parent
cancel one, a worker apply one, and a manager settle the money afterwards.

**Every change lands in the settlement queue.** §11: two of the club's three payment routes
are prepaid, so a plan change cannot settle itself. The prepayment design turns the cash
and cheque cases into an ordinary open charge on the parent's own screen; the
standing-order case genuinely needs a human to cancel the old uPay mandate and send the new
link, because G8 says the provider cannot do it. `settlement_status` stays `pending` until
somebody closes that loop.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import PricePlan
from app.models.people import Student
from app.models.schedule import Session as SessionRow
from app.models.training_plan import PlanChange, SessionBooking
from app.services.audit import AuditService
from app.services.schedule.errors import PlanChangeRefusedError


def first_of_next_month(day: date) -> date:
    """§10 — a plan change moves on the first, whole.

    The first of a month still moves to the NEXT one: a change requested on the 1st is
    requested after that month's run has already raised its charge, so applying it that day
    would move the access and leave the price behind.
    """
    return date(day.year + (day.month == 12), 1 if day.month == 12 else day.month + 1, 1)


def _is_upgrade(before: PricePlan | None, after: PricePlan) -> bool:
    """A plan is an upgrade when it costs more. Price rather than allowance, because that
    is what the parent is agreeing to and what the club collects — and because two plans
    can share an allowance and differ in what else they open (the Saturday lesson)."""
    if before is None:
        return True
    return after.monthly_amount_agorot > before.monthly_amount_agorot


class PlanChangeService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def request(
        self,
        studio_id: uuid.UUID,
        *,
        student_id: uuid.UUID,
        to_price_plan_id: uuid.UUID,
        by_person_id: uuid.UUID | None,
        at: datetime,
    ) -> PlanChange:
        """A parent's tap. Returns the recorded change, already applied if it is an upgrade."""
        student = self._session.get(Student, student_id)
        if student is None:
            raise PlanChangeRefusedError("no such student")
        target = self._session.get(PricePlan, to_price_plan_id)
        if target is None:
            raise PlanChangeRefusedError("no such price plan")
        if target.active_to is not None:
            raise PlanChangeRefusedError("that plan is closed and prices nobody")
        if student.price_plan_id == to_price_plan_id:
            raise PlanChangeRefusedError("this student is already on that plan")
        pending = self._session.execute(
            select(PlanChange).where(
                PlanChange.student_id == student_id, PlanChange.status == "scheduled"
            )
        ).scalar_one_or_none()
        if pending is not None:
            # One at a time. Two scheduled changes for one student would apply in whichever
            # order the worker happened to read them, and the parent chose neither order.
            raise PlanChangeRefusedError("this student already has a change waiting")

        current = (
            self._session.get(PricePlan, student.price_plan_id)
            if student.price_plan_id is not None
            else None
        )
        change = PlanChange(
            studio_id=studio_id,
            student_id=student_id,
            from_price_plan_id=student.price_plan_id,
            to_price_plan_id=to_price_plan_id,
            effective_on=first_of_next_month(at.date()),
            requested_by_person_id=by_person_id,
            requested_at=at,
            status="scheduled",
            settlement_status="pending",
        )
        self._session.add(change)
        self._session.flush()

        if _is_upgrade(current, target):
            # Access now, price on the 1st. `effective_on` still records the 1st, because
            # that is the date the billing run and the settlement queue both mean.
            student.price_plan_id = to_price_plan_id
            change.status = "applied"
            change.applied_at = at

        AuditService.record(
            self._session,
            action="plan_change.request",
            entity_type="plan_change",
            entity_id=change.id,
            studio_id=studio_id,
            actor_person_id=by_person_id,
            diff={
                "student_id": str(student_id),
                "from": str(change.from_price_plan_id) if change.from_price_plan_id else None,
                "to": str(to_price_plan_id),
                "effective_on": change.effective_on.isoformat(),
                "applied_now": change.status == "applied",
            },
        )
        self._session.flush()
        return change

    def cancel(self, change_id: uuid.UUID, *, at: datetime) -> PlanChange:
        """A parent changing their mind before the first — the whole reason this is a row."""
        change = self._session.get(PlanChange, change_id)
        if change is None:
            raise PlanChangeRefusedError("no such plan change")
        if change.status != "scheduled":
            raise PlanChangeRefusedError(f"that change is already {change.status}")
        change.status = "cancelled"
        self._session.flush()
        return change

    def due(self, *, on: date) -> list[PlanChange]:
        """Scheduled changes whose day has arrived. `<=` rather than `==`: a worker that
        did not run yesterday must still apply yesterday's changes today, rather than
        leaving a family on a plan they cancelled a month ago."""
        return list(
            self._session.execute(
                select(PlanChange)
                .where(PlanChange.status == "scheduled", PlanChange.effective_on <= on)
                .order_by(PlanChange.effective_on, PlanChange.id)
            ).scalars()
        )

    def apply_due(self, *, on: date, at: datetime) -> int:
        """The worker's daily pass. Returns how many changes it applied.

        Sets `student.price_plan_id`, releases the future bookings the new allowance no
        longer covers, stamps `applied_at`, and audits. `settlement_status` is untouched:
        the money is a human's job and applying the access does not close it.
        """
        applied = 0
        for change in self.due(on=on):
            student = self._session.get(Student, change.student_id)
            if student is None:  # pragma: no cover -- FK is ON DELETE CASCADE
                continue
            student.price_plan_id = change.to_price_plan_id
            released = self._release_excess(change, at=at)
            change.status = "applied"
            change.applied_at = at
            AuditService.record(
                self._session,
                action="plan_change.apply",
                entity_type="plan_change",
                entity_id=change.id,
                studio_id=change.studio_id,
                actor_person_id=None,
                diff={
                    "student_id": str(change.student_id),
                    "to": str(change.to_price_plan_id),
                    "bookings_released": released,
                },
            )
            applied += 1
        self._session.flush()
        return applied

    def settlement_queue(self) -> list[PlanChange]:
        """§11's queue — every change whose money a human has not closed yet."""
        return list(
            self._session.execute(
                select(PlanChange)
                .where(PlanChange.settlement_status == "pending")
                .order_by(PlanChange.effective_on, PlanChange.id)
            ).scalars()
        )

    def settle(
        self, change_id: uuid.UUID, *, by_person_id: uuid.UUID | None, at: datetime
    ) -> PlanChange:
        """A manager saying the money is handled — collected, waived, or a mandate
        re-signed. The app never decides this, because it cannot see a drawer of cheques."""
        change = self._session.get(PlanChange, change_id)
        if change is None:
            raise PlanChangeRefusedError("no such plan change")
        if change.settlement_status == "settled":
            raise PlanChangeRefusedError("that change was already settled")
        change.settlement_status = "settled"
        change.settled_by_person_id = by_person_id
        change.settled_at = at
        AuditService.record(
            self._session,
            action="plan_change.settle",
            entity_type="plan_change",
            entity_id=change.id,
            studio_id=change.studio_id,
            actor_person_id=by_person_id,
        )
        self._session.flush()
        return change

    # -- internals ------------------------------------------------------------
    def _release_excess(self, change: PlanChange, *, at: datetime) -> int:
        """Future bookings the new allowance no longer covers, released **latest first**.

        Latest-first and deterministically. The sessions nearest the change are the ones a
        family has already arranged their week around; releasing tomorrow's and keeping
        next month's would be the least useful order available. `id` breaks ties so two
        sessions at the same instant release in the same order on a re-run.

        **Only future ones.** A downgrade takes away future access, never a session the
        child already attended — nor the record of it, which §5.14's denominators read.

        Counted per week, because the allowance is per week: a student dropping to one
        extra a week keeps one booking in each week rather than one in total.
        """
        plan = self._session.get(PricePlan, change.to_price_plan_id)
        allowance = plan.weekly_extra_allowance if plan is not None else None
        if allowance is None:
            # Unlimited: nothing to release. A "downgrade" to an unlimited plan is not one.
            return 0
        from app.services.schedule.booking import week_start

        rows = self._session.execute(
            select(SessionBooking, SessionRow.starts_at)
            .join(SessionRow, SessionRow.id == SessionBooking.session_id)
            .join(
                # Only `extra` sessions count against an allowance; a private booking on a
                # plan that no longer allows one is released by the same sweep below.
                PricePlan,
                PricePlan.id == change.to_price_plan_id,
            )
            .where(
                SessionBooking.student_id == change.student_id,
                SessionBooking.cancelled_at.is_(None),
                SessionRow.starts_at > at,
            )
            .order_by(SessionRow.starts_at.desc(), SessionBooking.id.desc())
        ).all()

        kept: dict[date, int] = {}
        released = 0
        # Ascending by start, so the EARLIEST bookings in each week are the ones kept and
        # the latest are the ones that go.
        for booking, starts_at in sorted(rows, key=lambda pair: (pair[1], pair[0].id)):
            group_kind = self._kind_of(booking.session_id)
            if group_kind == "private" and allowance is not None:
                booking.cancelled_at = at
                released += 1
                continue
            if group_kind != "extra":
                continue
            week = week_start(starts_at)
            if kept.get(week, 0) < allowance:
                kept[week] = kept.get(week, 0) + 1
                continue
            booking.cancelled_at = at
            released += 1
        return released

    def _kind_of(self, session_id: uuid.UUID) -> str:
        from app.models.structure import Group

        return (
            self._session.execute(
                select(Group.kind)
                .join(SessionRow, SessionRow.group_id == Group.id)
                .where(SessionRow.id == session_id)
            ).scalar_one_or_none()
            or "base"
        )
