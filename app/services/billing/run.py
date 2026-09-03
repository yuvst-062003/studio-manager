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
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.billing import BillingRun, Charge, Payment, PricePlan
from app.models.people import Enrollment, Student, StudentFreeze
from app.models.person import Guardian
from app.models.schedule import Session as SessionRow
from app.services.billing.errors import ConflictError
from app.services.billing.payments import PaymentService
from app.services.billing.service import BillingService
from app.services.people.attendance_pattern import expected_weekdays
from app.services.people.group_days import studio_weekday


def period_end(period_year: int, period_month: int) -> date:
    """The last day of a billing period.

    The run dues every tuition charge here, because `create_charge` derives the period from
    `due_date` and the two must not be able to disagree. `calendar.monthrange` rather than
    arithmetic over 28/30/31 -- February 2028 is the case that catches a hand-rolled one.
    """
    return date(period_year, period_month, calendar.monthrange(period_year, period_month)[1])


def _midnight(day: date) -> datetime:
    """A date as a UTC instant, for comparing against `session.starts_at`.

    UTC rather than Asia/Jerusalem, and that is a deliberate approximation with a bound: a
    session at 17:00 local is 15:00 UTC, so a two-hour window at each end of the period
    could in principle land a session in the neighbouring month. No group in this product
    trains between 22:00 and 02:00, which is the only range where the two disagree.
    """
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


def proration(monthly_agorot: int, *, remaining: int, total: int) -> int:
    """§5.10 step 2 -- `round(monthly x remaining / total_sessions_in_period)`.

    **Integer arithmetic, half-up.** G2 forbids a float touching money, and Python's
    `round` is banker's rounding: `round(2.5)` is 2, so a float path charges a family one
    agora less than the spec says for every exact half. `(n + d // 2) // d` is half-up in
    integers and has no representation error to argue about.

    `total == 0` is a real state -- a group whose period was entirely cancelled, or a
    student joining after the last session -- and it charges nothing. `remaining > total`
    is not: it means the two were computed against different periods, and clamping would
    hide a plausible over-charge behind a correct-looking number.
    """
    if remaining < 0 or total < 0:
        raise ValueError(f"negative session counts: remaining={remaining} total={total}")
    if remaining > total:
        raise ValueError(
            f"remaining={remaining} exceeds total={total}: the two were computed against "
            "different periods"
        )
    if total == 0:
        return 0
    return (monthly_agorot * remaining + total // 2) // total


@dataclass
class _Tally:
    """What the run tells the manager afterwards.

    Every number here is a COUNT, never money -- invariant 1's `NOT_MONEY` list carries
    `charges_created` for exactly that reason.
    """

    charged: int = 0
    already_charged: int = 0
    registrations: int = 0
    prorated: int = 0
    unpriced: list[str] = field(default_factory=list)
    #: §5.10 step 4 -- reported rather than silently skipped. A family who asked for a
    #: freeze and was billed anyway is a phone call; a family who was frozen and does not
    #: appear in the run's own record is a number nobody can explain next month.
    frozen: list[str] = field(default_factory=list)
    #: §3.6 -- an active student with no active enrollment at all (most often rollover's
    #: `apply_students` ending one as "not returning"). Not billing them is correct; saying
    #: nothing about why is what this fixes.
    no_active_enrollment: list[str] = field(default_factory=list)
    #: Step 7 -- agorot of existing credit spent on this period's charges. Reported for the
    #: same reason `frozen` is: a run that settled 40 families out of money already in the
    #: drawer looks, from `charges_created` alone, exactly like a run that collected
    #: nothing.
    credit_applied: int = 0


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
        starts = date(period_year, period_month, 1)
        due = period_end(period_year, period_month)
        for student_id, price_plan_id in self._billable_students(studio_id, starts, due, tally):
            self._charge_one(studio_id, student_id, price_plan_id, starts, due, tally)
        # Step 7, after every charge for the period has been raised and INSIDE the same
        # transaction. See `_apply_credit`.
        self._apply_credit(tally)
        run.charges_created = tally.charged
        run.finished_at = at
        run.status = "completed"
        run.log = {
            "charged": tally.charged,
            "already_charged": tally.already_charged,
            "registrations": tally.registrations,
            "prorated": tally.prorated,
            "unpriced": tally.unpriced,
            "frozen": tally.frozen,
            "no_active_enrollment": tally.no_active_enrollment,
            "credit_applied": tally.credit_applied,
        }
        self._session.flush()
        return run

    def charge_first_month(
        self,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        price_plan_id: uuid.UUID | None,
        *,
        on: date,
        tally: _Tally | None = None,
    ) -> int:
        """One student's first tuition charge, raised the moment they are enrolled.

        **Every enrolment path calls this and none of them reaches into `_charge_one`.**
        §5.4b's join link raised the first month immediately and `StudentService.convert`
        raised nothing, so a child a manager converted on the 12th was active, enrolled and
        priced with nothing to pay until the 1st -- and §6.1's payment step, which has
        something to show only when a charge exists, stood itself down and never asked the
        family for money. Two doors into the same room, one of which skipped the till.

        Returns the number of charges created: 1, or 0 when the student is unpriced, has no
        primary guardian, or was already charged for this period. The run's own idempotency
        key makes the next monthly run a no-op for the period this covers, which is what
        lets both the immediate charge and the monthly run exist.
        """
        counter = tally if tally is not None else _Tally()
        before = counter.charged
        self._charge_one(
            studio_id,
            student_id,
            price_plan_id,
            on.replace(day=1),
            period_end(on.year, on.month),
            counter,
        )
        return counter.charged - before

    # -- internals ------------------------------------------------------------
    def _apply_credit(self, tally: _Tally) -> None:
        """**Step 7 -- spend money that has already arrived.**

        The club sells a monthly subscription and collects it in lumps: 900 ₪ of cash for
        three months, twelve cheques for a year. Each of those leaves a `payment` whose
        allocations total less than its amount, and that surplus IS the credit. This step
        allocates it to the payer's open charges, oldest first, until the credit is
        exhausted or no open charge remains.

        **It must be in the same transaction as steps 1-6, and it is because it is in the
        same method.** If the drawdown were a separate job, every prepaid family in the
        club would appear in the manager's collections list as a debtor for as long as the
        gap lasted, and the parent's app would show a debt they had already paid. A family
        who has paid ahead must never, at any instant, read as owing money.

        Nothing about steps 1-6 changes. The run still raises one tuition charge per
        student at their plan's amount, still prorates the first month, still skips frozen
        students, still charges the registration fee once. This only spends what is there.

        Oldest-first, and each charge FULLY before the next: `allocate_oldest_first` is the
        same rule §5.10's reconciliation uses, so a partial credit settles the oldest debt
        rather than scattering across several and settling none -- which is what a manager
        doing it by hand would do, and what keeps the collections list one row shorter
        rather than two rows lighter.

        Scoped by the session, not by an argument: `TenantSession` filters every query by
        the active studio and fails closed without one, so "every payer with credit" is
        already "every payer in THIS studio with credit".
        """
        payments = PaymentService(self._session)
        holders = list(
            self._session.execute(
                select(Payment.payer_person_id)
                .where(Payment.reversed_at.is_(None))
                .group_by(Payment.payer_person_id)
            ).scalars()
        )
        for payer_person_id in holders:
            unspent = list(
                self._session.execute(
                    select(Payment.id)
                    .where(
                        Payment.payer_person_id == payer_person_id,
                        Payment.reversed_at.is_(None),
                    )
                    # Oldest money first, so a family's September cash is spent before their
                    # October cash -- which is the order they handed it over in and the only
                    # order that makes a statement readable.
                    .order_by(Payment.received_at, Payment.id)
                ).scalars()
            )
            for payment_id in unspent:
                if payments.unallocated_agorot(payment_id) <= 0:
                    continue
                for row in payments.allocate_oldest_first(
                    payment_id, payer_person_id=payer_person_id
                ):
                    tally.credit_applied += row.amount_agorot

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

    def _billable_students(
        self, studio_id: uuid.UUID, starts: date, ends: date, tally: _Tally
    ) -> list[tuple[uuid.UUID, uuid.UUID | None]]:
        """§5.10 step 1 -- every **student** with at least one `active` enrollment, minus
        step 4's frozen ones.

        `DISTINCT` on the student is C11 made structural: the join to `enrollment` is what
        establishes eligibility, and without the distinct a child in two groups arrives
        twice and the second arrival is refused by the index rather than by the query --
        which turns an entirely normal case into a logged conflict.

        A freeze **overlapping** the period excludes the student, rather than one
        containing it: a freeze from mid-October to mid-November is a real freeze over
        November, and requiring containment would bill that month in full.
        """
        frozen = set(
            self._session.execute(
                select(StudentFreeze.student_id).where(
                    StudentFreeze.studio_id == studio_id,
                    StudentFreeze.from_date <= ends,
                    StudentFreeze.to_date >= starts,
                )
            ).scalars()
        )
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
        # §3.6 -- an active student who reaches this point with no active enrollment at all
        # (most often §5.15 rollover's `apply_students` ending one as "not returning") is
        # excluded by the JOIN above before anything else runs. That is the right outcome --
        # nobody is billed for a group they no longer attend -- but until now it happened
        # with no tally entry and no `unpriced`/`frozen` line to explain it either, so a
        # student simply stopped appearing in the run with nothing recording why.
        active_ids = set(
            self._session.execute(
                select(Student.id).where(Student.studio_id == studio_id, Student.status == "active")
            ).scalars()
        )
        enrolled_ids = {student_id for student_id, _ in rows}
        for student_id in sorted(active_ids - enrolled_ids, key=str):
            tally.no_active_enrollment.append(str(student_id))
        billable: list[tuple[uuid.UUID, uuid.UUID | None]] = []
        for student_id, price_plan_id in rows:
            if student_id in frozen:
                # §5.10 step 4: 'A frozen student generates nothing.' Recorded rather than
                # silently dropped -- a family who was frozen and does not appear in the
                # run's own record is a number nobody can explain next month.
                tally.frozen.append(str(student_id))
                continue
            billable.append((student_id, price_plan_id))
        return billable

    def _charge_one(
        self,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        price_plan_id: uuid.UUID | None,
        starts: date,
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
        if plan.active_to is not None and due > plan.active_to:
            # §3.5 -- belt and braces alongside rollover's repointing. `Student.price_plan_id`
            # is trusted everywhere else in this file; the one place it must not be trusted
            # blindly is here, because a closed plan is last year's price and nothing forces
            # every path that changes a plan to also repoint the student. Charging it anyway
            # would silently restate an amount the plan itself says stopped applying before
            # this charge's due date -- reported as unpriced rather than raised wrong.
            tally.unpriced.append(str(student_id))
            return

        amount = plan.monthly_amount_agorot
        original: int | None = None
        note: str | None = None
        if self._is_first_tuition(studio_id, student_id):
            remaining, total = self._sessions_in_period(
                student_id, starts=starts, ends=due, joined=self._joined_on(student_id, starts)
            )
            # **No sessions means no denominator, not a free month.** A studio whose
            # schedule has not been materialized yet counts zero of zero, and prorating
            # against that bills every family in the club nothing -- silently, in the one
            # run nobody re-reads. The two cases the count cannot tell apart are "every
            # session was cancelled" and "the schedule was never generated", and §5.10
            # step 3 already says closures never change the amount, so the flat month is
            # right for the first and the only safe answer for the second.
            prorated = proration(amount, remaining=remaining, total=total) if total > 0 else amount
            if prorated != amount:
                # Only when it actually differs. A first month the student was present for
                # the whole of is a full month, and a note reading 'בגין 8 מתוך 8 שיעורים'
                # would explain something that did not happen.
                original, amount = amount, prorated
                note = f"בגין {remaining} מתוך {total} שיעורים"

        if self._raise_charge(
            studio_id, payer_person_id, "tuition", amount, due, student_id, tally
        ):
            tally.charged += 1
            if note is not None:
                tally.prorated += 1
            self._explain_proration(studio_id, student_id, due, original, note)
        self._charge_registration_fee(studio_id, student_id, payer_person_id, plan, due, tally)

    def _raise_charge(
        self,
        studio_id: uuid.UUID,
        payer_person_id: uuid.UUID,
        kind: str,
        amount_agorot: int,
        due: date,
        student_id: uuid.UUID,
        tally: _Tally,
    ) -> bool:
        """One charge, inside its own SAVEPOINT. True when it was actually created.

        `create_charge` raises `ConflictError` from an IntegrityError, which poisons the
        transaction -- so the run must carry on to the next family rather than losing a
        whole studio's month to one duplicate.
        """
        try:
            with self._session.begin_nested():
                try:
                    self._billing.create_charge(
                        studio_id,
                        payer_person_id,
                        kind,  # type: ignore[arg-type]
                        amount_agorot,
                        due,
                        student_id=student_id,
                    )
                except ConflictError:
                    tally.already_charged += 1
                    raise _AlreadyChargedError from None
        except _AlreadyChargedError:
            return False
        return True

    def _explain_proration(
        self,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        due: date,
        original: int | None,
        note: str | None,
    ) -> None:
        """§5.10 -- 'The original amount and a human-readable proration_note are stored so
        the parent sees בגין 3 מתוך 8 שיעורים.'

        Written after the fact rather than passed into `create_charge`, because the seam's
        signature is W4's contract and carries neither field. Both belong to the charge and
        neither is money the family owes, so nothing here touches `amount_agorot`.
        """
        if note is None:
            return
        charge = self._session.execute(
            select(Charge).where(
                Charge.studio_id == studio_id,
                Charge.student_id == student_id,
                Charge.kind == "tuition",
                Charge.period_year == due.year,
                Charge.period_month == due.month,
            )
        ).scalar_one()
        charge.original_amount_agorot = original
        charge.proration_note = note

    def _charge_registration_fee(
        self,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        payer_person_id: uuid.UUID,
        plan: PricePlan,
        due: date,
        tally: _Tally,
    ) -> None:
        """§5.10 step 6 -- 'charged once per **student**, on the first billing run after
        their first enrollment -- never again when they add or change a group.'

        **Not the unique index's job.** The index keys on the period, and a `registration`
        charge carries a NULL period, so the index does not apply to it at all. Even if it
        did, a period-keyed fee would be re-raisable every month, correctly, forever. The
        guard is this query.

        Never prorated: it is a fee for joining, not for a month's teaching, and prorating
        it would charge a child who joined late less to join than one who joined on the 1st.
        """
        if plan.registration_fee_agorot is None:
            # Nullable because most plans have none. A zero-amount charge would appear on
            # the parent's screen as a line item for nothing.
            return
        already = self._session.execute(
            select(Charge.id)
            .where(
                Charge.studio_id == studio_id,
                Charge.student_id == student_id,
                Charge.kind == "registration",
            )
            .limit(1)
        ).scalar_one_or_none()
        if already is not None:
            return
        if self._raise_charge(
            studio_id,
            payer_person_id,
            "registration",
            plan.registration_fee_agorot,
            due,
            student_id,
            tally,
        ):
            tally.charged += 1
            tally.registrations += 1

    def _is_first_tuition(self, studio_id: uuid.UUID, student_id: uuid.UUID) -> bool:
        """§5.10 step 2 -- proration applies to the **first month only**.

        Asked as "has this student ever been billed tuition", not as "did they join this
        month". A club that starts using the app in March has students who joined in
        September, and comparing dates would prorate every one of them against a period
        they were present for the whole of.
        """
        return (
            self._session.execute(
                select(Charge.id)
                .where(
                    Charge.studio_id == studio_id,
                    Charge.student_id == student_id,
                    Charge.kind == "tuition",
                )
                .limit(1)
            ).scalar_one_or_none()
            is None
        )

    def _joined_on(self, student_id: uuid.UUID, starts: date) -> date:
        """When this student's teaching in this period begins.

        The **earliest active enrollment start**, not `student.joined_on`: a child converted
        from a trial in September and enrolled into their group in November is taught from
        November, and §5.10 prorates what they are taught. Clamped to the period's own start
        so an enrollment that predates it prorates nothing.
        """
        earliest = self._session.execute(
            select(func.min(Enrollment.started_on)).where(
                Enrollment.student_id == student_id, Enrollment.status == "active"
            )
        ).scalar_one_or_none()
        return max(earliest, starts) if earliest else starts

    def _sessions_in_period(
        self, student_id: uuid.UUID, *, starts: date, ends: date, joined: date
    ) -> tuple[int, int]:
        """(remaining, total) for one student across one period, from MATERIALIZED sessions.

        §5.10 step 2 is explicit that this is not a calendar-day calculation, and the club's
        own timetable is why: it trains Tuesdays and Fridays (§5.6), which are not evenly
        spread through a month, so the two answers differ for most joining dates.

        The student's expected days come from `app/services/people/attendance_pattern.py` --
        C11 and C12's shared seam. The roster reads the same module, because a second
        implementation of "what is this child expected at" is a second answer.

        A student in two groups counts **both** groups' sessions: C11 prices training
        volume, and the volume is every session they attend.
        """
        enrollments = self._session.execute(
            select(Enrollment.group_id, Enrollment.attends_weekdays).where(
                Enrollment.student_id == student_id, Enrollment.status == "active"
            )
        ).all()
        if not enrollments:
            return (0, 0)

        rows = self._session.execute(
            select(SessionRow.group_id, SessionRow.starts_at).where(
                SessionRow.group_id.in_([group_id for group_id, _ in enrollments]),
                SessionRow.starts_at >= _midnight(starts),
                SessionRow.starts_at < _midnight(ends + timedelta(days=1)),
                SessionRow.status != "cancelled",
            )
        ).all()

        # The days each group actually trains, as this period's own sessions show them --
        # read from the materialized rows rather than from the rules, so a rule closed
        # mid-period cannot claim a day that produced no session.
        group_weekdays: dict[uuid.UUID, set[int]] = {}
        for group_id, starts_at in rows:
            group_weekdays.setdefault(group_id, set()).add(studio_weekday(starts_at))

        expected: dict[uuid.UUID, frozenset[int]] = {
            group_id: expected_weekdays(attends, group_weekdays.get(group_id, set()))
            for group_id, attends in enrollments
        }

        total = 0
        remaining = 0
        for group_id, starts_at in rows:
            if studio_weekday(starts_at) not in expected.get(group_id, frozenset()):
                continue
            total += 1
            if starts_at.date() >= joined:
                remaining += 1
        return (remaining, total)

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
