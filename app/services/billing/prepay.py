"""Who is about to run out of prepayment -- the one question the ledger could answer and
nobody asked.

Three months of cash already works end to end. The promise is confirmed, one `payment` is
recorded, the surplus IS the credit (2026-08-27 prepayment spec §2), and the run's step 7
spends it oldest-first. Every piece of that is reactive-proof: a prepaid family never reads
as owing money, at any instant.

What none of it does is **say** anything. The product's only voice about money is
`escalate_debt`, which begins three days after a charge went unpaid -- so a family who
handed over three months of cash in good faith hears a *debt reminder* as the first thing
the product ever says to them about the end of their prepayment. This module is the query
behind the rung that comes before that.

**Derived, never stored.** The prepayment spec §6 makes the same argument for the parent's
`covers October and November` line: a stored `paid_through` becomes a lie the moment the
family upgrades to a 400 ₪ plan, because 600 ₪ no longer reaches the end of November. The
same is true of a stored "warned" flag, so there is none -- no column, no table, and no
migration. The three facts below are all readable from `payment`, `payment_allocation` and
`charge`, which is why this lane can ship the rung without owning a schema change.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import Charge, Payment, PaymentAllocation
from app.services.billing.payment_promise import PaymentPromiseService
from app.services.billing.service import BillingService

#: Every timestamp is stored UTC and rendered Asia/Jerusalem, and *which month money
#: arrived in* is a rendering question: cash handed over at 23:30 on 31 August is
#: September's money in UTC and August's money in the club's office. The club's clock wins,
#: because the club's clock is the one the family paid on.
STUDIO_TZ = ZoneInfo("Asia/Jerusalem")

#: A period is a `(year, month)` pair, which orders correctly under tuple comparison and is
#: the same key `charge`'s idempotency index uses.
Period = tuple[int, int]


def _arrival_month(received_at: datetime) -> Period:
    local = received_at.astimezone(STUDIO_TZ)
    return (local.year, local.month)


class PrepayService:
    """The three facts that decide whether a family is on the pre-debt rung.

    Session on the constructor, like every service in this lane, and **exactly as scoped as
    the session it is handed**: `TenantSession` filters every query by the active studio and
    fails closed without one, so "every payer whose prepayment ends" is already "every payer
    in THIS studio whose prepayment ends".
    """

    def __init__(self, session: Session) -> None:
        self._session = session
        self._billing = BillingService(session)
        self._promises = PaymentPromiseService(session)

    # -- fact 1: is this money a prepayment at all -----------------------------
    def last_prepaid_period(self, payer_person_id: uuid.UUID) -> Period | None:
        """The latest month this payer's money reached **ahead of itself**, or None.

        A prepayment is money that arrived before the month it paid for. That is the whole
        definition, and it is a comparison rather than a flag: `payment.received_at`'s month
        against the `charge.period` its allocation settled.

        **The direction of that comparison is the entire feature.** Equal months is a family
        paying November in November -- ordinary, and reading it as a prepayment would put
        every family in the club on this rung. Earlier means a family clearing October's
        debt in December -- also ordinary, and the opposite of paying ahead.

        Only periodic charges count. A `registration` fee or a shop item carries a NULL
        period (`BillingService.PERIODIC_KINDS`) because it belongs to no month, and a
        family who bought a gi in advance has not bought a month of training.

        Reversed payments are excluded, exactly as they are from `payer_credit`: a bounced
        cheque is money recorded as never having arrived, and warning a family that money
        the club does not have is about to run out is a message about nothing.
        """
        rows = self._session.execute(
            select(Payment.received_at, Charge.period_year, Charge.period_month)
            .select_from(PaymentAllocation)
            .join(Payment, Payment.id == PaymentAllocation.payment_id)
            .join(Charge, Charge.id == PaymentAllocation.charge_id)
            .where(
                Payment.payer_person_id == payer_person_id,
                Payment.reversed_at.is_(None),
                Charge.period_year.is_not(None),
                Charge.period_month.is_not(None),
            )
        ).all()
        # The month comparison is done here rather than in SQL. It needs the club's
        # timezone, and `AT TIME ZONE` inside a WHERE clause is the kind of expression that
        # is right once and then silently wrong the next time somebody edits around it.
        periods = [
            (year, month)
            for received_at, year, month in rows
            if (year, month) > _arrival_month(received_at)
        ]
        return max(periods) if periods else None

    # -- fact 2 and 3, and the rung ---------------------------------------------
    def payers_whose_prepay_ends(self, *, period_year: int, period_month: int) -> list[uuid.UUID]:
        """Every payer in this studio whose prepayment ends with the period just billed.

        Three conditions, and each one exists because dropping it messages a family who
        should not hear from us:

        1. **The prepayment's last month IS this one.** Not "this family once prepaid and
           has none left" -- that is true forever after, and would fire every month for the
           rest of their membership.
        2. **What is left will not cover another month.** With a month's tuition still in
           the drawer, next month is already paid and there is nothing to warn about. A
           signal that fired on every month of a three-month prepayment would teach the
           family to ignore the one that mattered.
        3. **They owe nothing right now.** When the credit no longer covers a whole month
           the shortfall is an ordinary open charge, and the day 3/7/14 ladder owns that
           conversation. Two mechanisms speaking about the same money in the same week is
           how a family stops reading either.

        A payer with no priced active student has a monthly total of zero, and `credit < 0`
        is false for every credit -- so a family whose children have left is excluded by
        arithmetic rather than by a special case. Sorted, so a run is reproducible and the
        audit row it produces names a stable first subject.
        """
        period = (period_year, period_month)
        # The candidate set is "everybody whose money reached THIS month ahead of itself",
        # not "everybody who paid this month". One query for the whole studio, narrowed in
        # Python by the same month rule `last_prepaid_period` uses -- so the per-payer reads
        # below run over a handful of prepaying families rather than over the whole club.
        arrivals = self._session.execute(
            select(Payment.payer_person_id, Payment.received_at)
            .select_from(PaymentAllocation)
            .join(Payment, Payment.id == PaymentAllocation.payment_id)
            .join(Charge, Charge.id == PaymentAllocation.charge_id)
            .where(
                Payment.reversed_at.is_(None),
                Charge.period_year == period_year,
                Charge.period_month == period_month,
            )
        ).all()
        candidates = {
            payer_person_id
            for payer_person_id, received_at in arrivals
            if period > _arrival_month(received_at)
        }
        ending: list[uuid.UUID] = []
        for payer_person_id in candidates:
            if self.last_prepaid_period(payer_person_id) != period:
                continue
            monthly = self._promises.monthly_total_agorot(payer_person_id)
            if monthly <= 0 or self._billing.payer_credit(payer_person_id) >= monthly:
                continue
            if self._owes_now(payer_person_id):
                continue
            ending.append(payer_person_id)
        return sorted(ending, key=str)

    def _owes_now(self, payer_person_id: uuid.UUID) -> bool:
        """Any open charge this payer actually owes money on.

        `amount_agorot > 0` for the same reason `escalate_debt` filters on it: a credit is a
        negative charge, and an open discount the club granted is not a debt.
        """
        return (
            self._session.execute(
                select(Charge.id)
                .where(
                    Charge.payer_person_id == payer_person_id,
                    Charge.status == "open",
                    Charge.amount_agorot > 0,
                )
                .limit(1)
            ).scalar_one_or_none()
            is not None
        )
