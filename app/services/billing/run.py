"""§5.10's monthly billing run. **Idempotent across repeated executions** -- invariant 5.

The idempotency is enforced by `charge`'s unique index rather than by the run's own
bookkeeping, and that is the right place for it: a run that crashed halfway and is retried
must not depend on its own records being intact to avoid double-charging a family.

**One tuition charge per student PER CLASS, however many groups of that class they are
enrolled in.** C11's half that stays: two groups of one discipline is one charge, because
`_billable_students` is DISTINCT over `group.class_id`. C11's half that the owner reversed
on 2026-09-09: judo and karate are two charges, added together. A student nobody has priced
per class yet still bills exactly once, from `student.price_plan_id` -- see the fallback
note in `_billable_students`, which is the line that stops this change from re-creating the
bug it replaces.
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

from app.models.billing import BillingRun, Charge, Payment, PricePlan, StudentClassPrice
from app.models.people import Enrollment, Student, StudentFreeze
from app.models.person import Guardian
from app.models.structure import Group
from app.services.billing.errors import ConflictError
from app.services.billing.payments import PaymentService
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
    registrations: int = 0
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
        for student_id, price_plan_id, class_id in self._billable_students(
            studio_id, starts, due, tally
        ):
            self._charge_one(studio_id, student_id, price_plan_id, class_id, due, tally)
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
        class_id: uuid.UUID | None = None,
    ) -> int:
        """One student's first tuition charge, raised the moment they are enrolled.

        **Every enrolment path calls this and none of them reaches into `_charge_one`.**
        §5.4b's join link raised the first month immediately and `StudentService.convert`
        raised nothing, so a child a manager converted on the 12th was active, enrolled and
        priced with nothing to pay until the 1st -- and §6.1's payment step, which has
        something to show only when a charge exists, stood itself down and never asked the
        family for money. Two doors into the same room, one of which skipped the till.

        `class_id` names the class this first month is for, and defaults to None so every
        existing caller keeps its behaviour exactly: a charge with no class folds onto the
        unique index's sentinel and is the one-per-student-per-month row it always was. A
        caller that knows the class should pass it, or the monthly run will raise a SECOND
        charge for that class next time round -- the classless first month does not satisfy
        the per-class key.

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
            class_id,
            period_end(on.year, on.month),
            counter,
        )
        return counter.charged - before

    def payers_owing_for(
        self, studio_id: uuid.UUID, *, period_year: int, period_month: int
    ) -> list[uuid.UUID]:
        """Every payer left owing money on a charge for one period. Owner report #18.

        **Asked of the ledger, not of the run.** A run that crashed halfway and is retried
        must reach the same families as one that did not, and only the charges know which
        those are -- the same argument `_open_run` makes for keying idempotency on the unique
        index rather than on the run's own bookkeeping.

        **Asked AFTER step 7, which is what makes it honest.** `run()` raises every charge and
        then spends existing credit against them inside one transaction, so a family who
        handed over three months of cash is charged like everybody else and settled from their
        own money before this question is put. Asking "who was charged" would message them;
        asking "who is left owing" does not. §5.10's own rule: a family who has paid ahead
        must never, at any instant, read as owing money.

        `amount_agorot > 0` for the same reason `escalate_debt` filters on it: a credit is a
        negative charge, and chasing a family for a discount the club granted them is the most
        avoidable message in the product. `status == 'open'` excludes `settled`, and excludes
        `written_off` and `void`, which are decisions a manager made.

        Scoped to the PERIOD just billed. Last month's arrears are §5.10's day 3/7/14 ladder's
        conversation, and two mechanisms speaking about the same money in the same week is how
        a family stops reading either.

        Sorted, so a run is reproducible and the audit row it produces names a stable first
        subject -- `PrepayService.payers_whose_prepay_ends` sorts for the same reason.
        """
        return sorted(
            set(
                self._session.execute(
                    select(Charge.payer_person_id).where(
                        Charge.studio_id == studio_id,
                        Charge.period_year == period_year,
                        Charge.period_month == period_month,
                        Charge.status == "open",
                        Charge.amount_agorot > 0,
                    )
                ).scalars()
            ),
            key=str,
        )

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
    ) -> list[tuple[uuid.UUID, uuid.UUID | None, uuid.UUID | None]]:
        """§5.10 step 1 -- every **student** with at least one `active` enrollment, minus
        step 4's frozen ones.

        `DISTINCT` on the (student, CLASS) is what C11 became on 2026-09-09: the join to
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
        # (student, class) -- one row per DISTINCT CLASS the student actually trains in.
        #
        # **This is the whole of the double-charge guard, and it is why the join reaches
        # through `group` to `class` rather than stopping at the enrollment.** C11's failure
        # was a child in the competition group AND the teenagers group billed twice for one
        # discipline; `DISTINCT` over `group.class_id` collapses exactly that back to one,
        # while leaving judo and karate as the two rows the owner asked for (2026-09-09).
        rows = self._session.execute(
            select(Student.id, Group.class_id, Student.price_plan_id)
            .join(Enrollment, Enrollment.student_id == Student.id)
            .join(Group, Group.id == Enrollment.group_id)
            .where(
                Student.studio_id == studio_id,
                Student.status == "active",
                Enrollment.status == "active",
            )
            .distinct()
            .order_by(Student.id, Group.class_id)
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
        enrolled_ids = {student_id for student_id, _, _ in rows}
        for student_id in sorted(active_ids - enrolled_ids, key=str):
            tally.no_active_enrollment.append(str(student_id))

        # Every per-class price this studio holds, read once. A per-row lookup would be a
        # query per class per student in the one job that walks the whole club.
        per_class: dict[tuple[uuid.UUID, uuid.UUID], uuid.UUID] = {
            (student_id, class_id): plan_id
            for student_id, class_id, plan_id in self._session.execute(
                select(
                    StudentClassPrice.student_id,
                    StudentClassPrice.class_id,
                    StudentClassPrice.price_plan_id,
                ).where(StudentClassPrice.studio_id == studio_id)
            ).all()
        }
        # Which students hold ANY per-class price. This set is what decides whether a
        # student is billed the new way or the old way, and it is decided per STUDENT and
        # never per row -- see the fallback note below.
        priced_students = {student_id for student_id, _ in per_class}

        billable: list[tuple[uuid.UUID, uuid.UUID | None, uuid.UUID | None]] = []
        seen_legacy: set[uuid.UUID] = set()
        for student_id, class_id, student_plan_id in rows:
            if student_id in frozen:
                # §5.10 step 4: 'A frozen student generates nothing.' Recorded rather than
                # silently dropped -- a family who was frozen and does not appear in the
                # run's own record is a number nobody can explain next month.
                if student_id not in seen_legacy:
                    tally.frozen.append(str(student_id))
                    seen_legacy.add(student_id)
                continue

            if student_id not in priced_students:
                # **THE FALLBACK, AND WHY IT IS PER STUDENT.**
                #
                # A student nobody has priced per class yet bills exactly as they did
                # yesterday: ONE charge, from `student.price_plan_id`. Falling back per ROW
                # instead would hand a child in two classes their single old price twice --
                # which is precisely C11's bug, reintroduced by the very change written to
                # avoid it, and it would fire on the first run after deploy for every
                # multi-class family in the club.
                #
                # `seen_legacy` is what makes it once. The migration deliberately leaves
                # multi-class students unpriced, so this path is not an edge case on the
                # day this ships -- it is the majority.
                if student_id in seen_legacy:
                    continue
                seen_legacy.add(student_id)
                # No class on the charge: this is the legacy shape, and the unique index
                # folds a NULL class onto its sentinel so the row keeps exactly the
                # one-per-student-per-month rule it would have had yesterday.
                billable.append((student_id, student_plan_id, None))
                continue

            plan_id = per_class.get((student_id, class_id))
            if plan_id is None:
                # Priced for one of their classes and not this one. Reported rather than
                # billed at the other class's price or silently skipped: a half-priced
                # family is a number the manager has to be able to see.
                tally.unpriced.append(str(student_id))
                continue
            billable.append((student_id, plan_id, class_id))
        return billable

    def _charge_one(
        self,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        price_plan_id: uuid.UUID | None,
        class_id: uuid.UUID | None,
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

        # §5.10 step 2 -- **the first month is the full month.** Proration was removed on
        # 2026-09-12 by owner decision; `tests/billing/test_first_month.py` carries the two
        # reasons, of which the load-bearing one is that הוראת קבע is a fixed uPay link at
        # the plan's monthly amount and cannot be varied. A rule the mandate route could
        # not honour meant the same family was priced by which button they pressed.
        #
        # A late joiner a manager wants to be generous to is `POST /charges/{id}/adjust`
        # or `/close` -- a judgement call belongs with the human, not in a rule that has to
        # hold for everybody.
        if self._raise_charge(
            studio_id,
            payer_person_id,
            "tuition",
            plan.monthly_amount_agorot,
            due,
            student_id,
            tally,
            class_id,
        ):
            tally.charged += 1
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
        class_id: uuid.UUID | None = None,
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
                        class_id=class_id,
                    )
                except ConflictError:
                    tally.already_charged += 1
                    raise _AlreadyChargedError from None
        except _AlreadyChargedError:
            return False
        return True

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
        if not plan.registration_fee_agorot:
            # Nullable because most plans have none. A zero-amount charge would appear on
            # the parent's screen as a line item for nothing.
            #
            # **Zero counts, and only checking for NULL was a live defect.** The dashboard's
            # class wizard initialises its registration box to `'0'` and posts a number, so
            # every plan created through the product arrives here as `0` rather than `None`
            # -- and every child on one got a ₪0 registration line. It also 500'd the
            # manager's already-paid conversion, because a charge with nothing outstanding
            # cannot enter a payment promise.
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
