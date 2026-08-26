"""§5.10's monthly billing run. **Idempotent across repeated executions** -- invariant 5.

The idempotency is enforced by `charge`'s unique index rather than by the run's own
bookkeeping, and that is the right place for it: a run that crashed halfway and is retried
must not depend on its own records being intact to avoid double-charging a family.

**One student, one tuition charge, however many groups they are enrolled in** (C11).
Walking enrollments instead is the defect that bills a child in two groups twice, at two
different prices, silently and forever.

Proration, registration fees and freezes arrive next. This module's spine -- eligibility,
one charge per student, one run row per period -- is what invariant 5 asserts over.
"""

from __future__ import annotations

import calendar
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import BillingRun, PricePlan
from app.models.people import Enrollment, Student
from app.models.person import Guardian
from app.services.billing.errors import ConflictError
from app.services.billing.service import BillingService


def period_end(period_year: int, period_month: int) -> date:
    """The last day of a billing period.

    The run dues every tuition charge here, because `create_charge` derives the period from
    `due_date` and the two must not be able to disagree. `calendar.monthrange` rather than
    arithmetic over 28/30/31 -- February 2028 is the case that catches a hand-rolled one.
    """
    return date(period_year, period_month, calendar.monthrange(period_year, period_month)[1])


@dataclass
class _Tally:
    """What the run tells the manager afterwards.

    Every number here is a COUNT, never money -- invariant 1's `NOT_MONEY` list carries
    `charges_created` for exactly that reason.
    """

    charged: int = 0
    already_charged: int = 0
    unpriced: list[str] = field(default_factory=list)


class _AlreadyChargedError(Exception):
    """Rolls the per-student SAVEPOINT back without failing the run.

    Private: nothing outside this module should be able to catch it and mistake it for a
    real outcome.
    """


class BillingRunService:
    """§5.10's run. Takes the session on the constructor, like every service in this lane."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._billing = BillingService(session)

    def run(
        self,
        studio_id: uuid.UUID,
        *,
        period_year: int,
        period_month: int,
        at: datetime,
    ) -> BillingRun:
        """Bill one studio for one period.

        Safe to call again for a period already partly billed -- that is the retry path,
        and it is the only path that ever runs after something has already gone wrong.

        `at` is passed rather than read from the clock so the worker and the manual route
        agree about when the run happened, and so §19.5's time travel reaches it.
        """
        run = self._open_run(studio_id, period_year, period_month, at)
        tally = _Tally()
        due = period_end(period_year, period_month)
        for student_id, price_plan_id in self._billable_students(studio_id):
            self._charge_one(studio_id, student_id, price_plan_id, due, tally)
        run.charges_created = tally.charged
        run.finished_at = at
        run.status = "completed"
        run.log = {
            "charged": tally.charged,
            "already_charged": tally.already_charged,
            "unpriced": tally.unpriced,
        }
        self._session.flush()
        return run

    # -- internals ------------------------------------------------------------
    def _open_run(
        self, studio_id: uuid.UUID, period_year: int, period_month: int, at: datetime
    ) -> BillingRun:
        """One row per (studio, period).

        `uq_billing_run_studio_period` is unique, so a retry re-opens the existing row
        rather than inserting a second one the index would refuse -- on the exact path that
        only runs when something already broke.
        """
        existing = self._session.execute(
            select(BillingRun).where(
                BillingRun.studio_id == studio_id,
                BillingRun.period_year == period_year,
                BillingRun.period_month == period_month,
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.status = "running"
            existing.started_at = at
            existing.finished_at = None
            return existing
        row = BillingRun(
            studio_id=studio_id,
            period_year=period_year,
            period_month=period_month,
            started_at=at,
            status="running",
        )
        self._session.add(row)
        self._session.flush()
        return row

    def _billable_students(self, studio_id: uuid.UUID) -> list[tuple[uuid.UUID, uuid.UUID | None]]:
        """§5.10 step 1 -- every **student** with at least one `active` enrollment.

        `DISTINCT` on the student is C11 made structural: the join to `enrollment` is what
        establishes eligibility, and without the distinct a child in two groups arrives
        twice and the second arrival is refused by the index rather than by the query --
        which turns an entirely normal case into a logged conflict.
        """
        rows = self._session.execute(
            select(Student.id, Student.price_plan_id)
            .join(Enrollment, Enrollment.student_id == Student.id)
            .where(
                Student.studio_id == studio_id,
                Student.status == "active",
                Enrollment.status == "active",
            )
            .distinct()
            .order_by(Student.id)
        ).all()
        return [(row[0], row[1]) for row in rows]

    def _charge_one(
        self,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        price_plan_id: uuid.UUID | None,
        due: date,
        tally: _Tally,
    ) -> None:
        plan = self._session.get(PricePlan, price_plan_id) if price_plan_id else None
        payer_person_id = self._primary_guardian(student_id)
        if plan is None or payer_person_id is None:
            # §5.4 sets the price at conversion and nothing forces it; a child can also be
            # enrolled before a guardian is attached. Charging zero would look like a
            # working run and losing them silently would be worse, so both are reported.
            tally.unpriced.append(str(student_id))
            return
        # A SAVEPOINT per student: `create_charge` raises `ConflictError` from an
        # IntegrityError, which poisons the transaction, and the run must carry on to the
        # next family rather than losing a whole studio's month to one duplicate.
        try:
            with self._session.begin_nested():
                try:
                    self._billing.create_charge(
                        studio_id,
                        payer_person_id,
                        "tuition",
                        plan.monthly_amount_agorot,
                        due,
                        student_id=student_id,
                    )
                except ConflictError:
                    tally.already_charged += 1
                    raise _AlreadyChargedError from None
        except _AlreadyChargedError:
            return
        tally.charged += 1

    def _primary_guardian(self, student_id: uuid.UUID) -> uuid.UUID | None:
        """§4.3 -- `charge.payer_person_id` is captured at creation from the primary
        guardian, so changing it later leaves historical charges with whoever actually owed
        them. `uq_guardian_one_primary_per_student` makes this at most one row.
        """
        return self._session.execute(
            select(Guardian.person_id).where(
                Guardian.student_id == student_id, Guardian.is_primary.is_(True)
            )
        ).scalar_one_or_none()
