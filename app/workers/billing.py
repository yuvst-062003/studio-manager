"""§5.10's jobs: the monthly run, the debt escalation ladder, the stale-order sweep -- and
the rung that comes before the ladder's first.

**Rung zero.** §5.10's ladder starts three days after a charge went unpaid, which makes the
whole of this file reactive: it waits for money not to arrive and then chases it. A family
who handed over three months of cash in good faith therefore heard a *debt reminder* as the
first thing the product ever said to them about the end of their prepayment.
`notify_prepay_ending` is the answer -- fired on the run day, before any charge exists to be
late, to the households whose credit has just stopped covering another month.

**It routes through `ReminderService`, and the debt ladder below does not.** See that module
and `infra/railway/jobs.json`: for the ladder the cron hour IS the send hour, because
`_notify` reaches `NotificationService.enqueue` directly and §5.4a's 21:00-08:00 refusal
lives one layer up, so its rungs are protected by nothing but 08:30 being after 08:00. A new
message had the same choice and took the other one.

**Messages go through `NotificationService.enqueue`** (W5's seam) and never by inserting a
row here. Until lane COMMS lands that seam raises `NotImplementedError`; the refusals are
**counted and reported, never swallowed**. A run that said "12 reminders sent" when none
were is worse than one that says so -- the debt ladder is the feature a manager will most
want to trust, and it is the one whose failures are silent by nature.

**§19.7 -- the demo studio is excluded from all three.** Its fixtures are reset nightly, so
billing it would bill a fixture, and chasing it would send a real parent a real debt
reminder from a walkthrough.

**Every number in a tally is a COUNT, never money.** Invariant 1's `NOT_MONEY` list carries
`charges_created` for exactly that reason, and a log line here carries counts and ids only:
§11.7 forbids a card owner name or last four digits reaching a log, and §5.4a's own worker
records the same rule for children's names.
"""

from __future__ import annotations

import logging
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.logging import configure_logging
from app.core.tenancy import TenantSession, use_studio
from app.models.billing import Charge
from app.models.person import Guardian
from app.models.studio import Studio
from app.services.billing.orders import OrderService
from app.services.billing.prepay import PrepayService
from app.services.billing.run import BillingRunService, period_end
from app.services.comms import NotificationService
from app.services.comms.reminders import QuietHoursError, ReminderService

logger = logging.getLogger(__name__)

#: §5.10 -- 'day 3 a gentle reminder to the payer, day 7 a firmer one, day 14 a final notice
#: plus a task on the manager's dashboard.' Exactly these three.
ESCALATION_DAYS: tuple[int, int, int] = (3, 7, 14)

#: The rung at which §5.10 also wants the manager involved, not just the payer.
FINAL_NOTICE_DAY = 14

#: §5.10's 'IPN never arrives' row: 'a nightly job flags orders pending for more than 24h'.
STALE_ORDER_HOURS = 24


@dataclass
class Tally:
    """What each job reports. Counts only -- see the module docstring."""

    studios: int = 0
    charges_created: int = 0
    reminders: int = 0
    expired: int = 0
    #: Which rung fired, and how many households were on it. `3e` shows the rung per
    #: household, so the run has to know it rather than only the total.
    stage: dict[int, int] = field(default_factory=dict)
    #: §5.10's day 14 -- 'plus a task on the manager's dashboard'. There is no `task` table
    #: in this schema and this lane adds no migration, so the task IS the charge being 14+
    #: days overdue, which `3e` queries for. Counted here so the run can say it happened.
    manager_tasks: int = 0
    #: Notifications the comms seam refused. Counted rather than swallowed: until lane
    #: COMMS lands this is every message.
    undeliverable: int = 0
    #: Rung zero -- households told their prepayment ends with the month just billed.
    prepay_notices: int = 0
    #: And the ones the quiet-hours rule refused. Counted for the same reason
    #: `undeliverable` is: a rung that silently sent nothing looks exactly like a month in
    #: which nobody's prepayment ended.
    prepay_deferred: int = 0


def _notify(
    person_id: uuid.UUID, kind: str, title: str, body: str, payload: dict[str, object]
) -> bool:
    """One message, through W5's seam. Returns whether it was actually queued."""
    try:
        NotificationService().enqueue(
            person_id=person_id, kind=kind, title=title, body=body, payload=payload
        )
    except NotImplementedError:
        return False
    return True


def _guardians_of(session: Session, student_id: uuid.UUID | None) -> list[uuid.UUID]:
    """§5.3 -- every guardian is told, not only the primary.

    L8: `is_primary` decides bill addressing and הוראת קבע matching, and a reminder is
    neither. `app/workers/followups.py::_guardians_of` states the same rule for §5.4a.
    """
    if student_id is None:
        return []
    return list(
        session.execute(
            select(Guardian.person_id).where(Guardian.student_id == student_id)
        ).scalars()
    )


# -- §5.10's monthly run -------------------------------------------------------
def run_billing(session: Session, *, at: datetime, studio_id: uuid.UUID) -> Tally:
    """Bill one studio for the period `at` falls in, inside an already-scoped session."""
    tally = Tally(studios=1)
    run = BillingRunService(session).run(
        studio_id, period_year=at.year, period_month=at.month, at=at
    )
    tally.charges_created = run.charges_created
    return tally


# -- §5.10's debt escalation ladder --------------------------------------------
def escalate_debt(session: Session, *, at: datetime, tally: Tally | None = None) -> Tally:
    """§5.10 -- 'A charge that passes its due date unpaid triggers an escalating ladder
    rather than sitting silently in a report.'

    **Bounded to the exact day.** A daily job asking "is this more than three days overdue"
    would send the day-3 reminder on days 3, 4, 5, 6 and 7 -- five reminders for one rung,
    from a ladder whose whole point is that each rung means something different. Bounding it
    is also what makes this job idempotent across a daily schedule without storing per-charge
    state, which is the same trick `followups.py` uses for its 24-hour window.

    Only `open` charges are chased. `settled` is the bug that costs a club its credibility --
    a debt reminder to a parent who paid -- and `written_off` or `void` is a decision a
    manager made that chasing would undo once a week forever.
    """
    tally = tally or Tally()
    for offset in ESCALATION_DAYS:
        due_on = at.date() - timedelta(days=offset)
        charges = list(
            session.execute(
                select(Charge).where(
                    Charge.due_date == due_on,
                    Charge.status == "open",
                    # A credit is a negative charge. Chasing a family for a discount the
                    # club granted them is the most avoidable message in the product.
                    Charge.amount_agorot > 0,
                )
            ).scalars()
        )
        for charge in charges:
            _chase(session, charge, offset=offset, tally=tally)
    return tally


def _chase(session: Session, charge: Charge, *, offset: int, tally: Tally) -> None:
    recipients = _guardians_of(session, charge.student_id)
    if not recipients:
        # A manual charge with no student, or a child with no guardian attached yet. The
        # charge still shows on `3e`; there is simply nobody to message.
        return
    for person_id in recipients:
        if _notify(
            person_id,
            f"billing.overdue.day{offset}",
            "תזכורת תשלום",
            "נרשם חוב פתוח",
            # ids only. §11.7, and the amount is on the screen the link opens.
            {"charge_id": str(charge.id), "stage": offset},
        ):
            tally.reminders += 1
        else:
            tally.undeliverable += 1
            tally.reminders += 1
    tally.stage[offset] = tally.stage.get(offset, 0) + 1
    if offset == FINAL_NOTICE_DAY:
        # §5.10's 'plus a task on the manager's dashboard'. There is no `task` table and
        # this lane writes no migration, so the task IS this charge being fourteen days
        # overdue -- `3e`'s ageing column is the query. Counted so the run can report it.
        tally.manager_tasks += 1


# -- rung zero: before the ladder's first --------------------------------------
def notify_prepay_ending(
    session: TenantSession, *, at: datetime, tally: Tally | None = None
) -> Tally:
    """Tell the households whose prepayment ends with the period just billed.

    **Called on the run day only, immediately after the run, inside its transaction.** Two
    reasons, and the first is the same one `escalate_debt` gives for bounding itself to an
    exact day: "this family's prepayment ends with the month just billed" stays true for
    thirty days, so a daily job asking it without a bound sends thirty messages. The run day
    is the honest bound -- it is the day step 7 spent the last of the credit, so it is the
    day the fact becomes true rather than an arbitrary offset from it.

    The second is that step 7 has to have run. Before it, the household still holds credit
    and the month's charge is still open; after it, both halves of the predicate are
    settled. Reading them from the same transaction is what makes the message agree with the
    screen the family is about to open.

    **`ReminderService`, not `_notify`.** The rest of this file reaches
    `NotificationService.enqueue` directly, so §5.4a's 21:00-08:00 refusal and the 24h rate
    limit do not apply to it and the cron hour is the only thing standing between a parent
    and a 03:15 push. This message goes through the service that enforces both. The refusal
    is counted, never swallowed, and never fails the run: every state change the run made
    already happened, and a message that did not go out is not a reason to leave a studio
    unbilled.

    `actor_person_id=None` because nobody pressed anything. §5.10's ladder is the club
    speaking in the club's voice, and so is this.
    """
    tally = tally or Tally()
    period = (at.year, at.month)
    payers = PrepayService(session).payers_whose_prepay_ends(
        period_year=at.year, period_month=at.month
    )
    if not payers:
        return tally
    try:
        result = ReminderService(session).remind_prepay_ending(
            payers, period=period, actor_person_id=None, at=at
        )
    except QuietHoursError:
        tally.prepay_deferred += len(payers)
        return tally
    tally.prepay_notices += result["sent"]
    return tally


# -- §5.10's 'IPN never arrives' row -------------------------------------------
def sweep_stale_orders(
    session: Session, *, at: datetime, studio_id: uuid.UUID, tally: Tally | None = None
) -> Tally:
    """'A nightly job flags orders pending for more than 24h; the dashboard shows them for
    manual verification against uPay's own reports.'

    upay-integration.md puts it more strongly than the spec: **treat "no IPN ever arrived"
    as a failure signal in its own right**, because a failure-shaped payload may not exist
    at all -- IPNs for failed payments are [NOT COVERED] by any testing against this
    account. Expiring the order also releases its charges, so the double-payment guard does
    not become a permanent lock on a parent who simply closed the tab.
    """
    tally = tally or Tally()
    tally.expired += len(OrderService(session).expire_stale(studio_id, at=at))
    return tally


# -- the entry point -----------------------------------------------------------
def _active_studios(unscoped: Session) -> list[tuple[uuid.UUID, str]]:
    """Which studios exist -- the one question with no tenant.

    §19.7: the demo studio is excluded. Its fixtures are reset nightly, so billing it bills
    a fixture, and chasing it sends a real parent a real reminder from a walkthrough.
    """
    rows = unscoped.execute(
        select(Studio.id, Studio.slug).where(Studio.status == "active", Studio.is_demo.is_(False))
    ).all()
    return [(row[0], row[1]) for row in rows]


def run_daily(
    session: TenantSession, *, at: datetime, studio_id: uuid.UUID, tally: Tally | None = None
) -> Tally:
    """One studio's daily pass, in the order it has to happen in. `main()` is this plus the
    loop over studios and the transaction around each.

    **A function rather than four lines inside `main()`, because the ORDER is the feature.**
    Rung zero must come after the run and before the ladder: after, because step 7 has to
    have spent the credit before "what is left will not cover another month" means anything;
    before, because the whole point of the rung is that a family hears about their
    prepayment ending from something other than a debt reminder. Inlined in `main()`, that
    order was only assertable by opening a database, a scheduler and eight studios. Here a
    test can drive a month of mornings through the same code the cron drives.
    """
    tally = tally or Tally()
    if _is_run_day(session, studio_id, at.date()):
        run = BillingRunService(session).run(
            studio_id, period_year=at.year, period_month=at.month, at=at
        )
        tally.charges_created += run.charges_created
        notify_prepay_ending(session, at=at, tally=tally)
    escalate_debt(session, at=at, tally=tally)
    sweep_stale_orders(session, at=at, studio_id=studio_id, tally=tally)
    return tally


def main() -> int:
    """The daily pass over every studio: `run_daily`, in its own transaction, for each."""
    configure_logging()
    at = now()
    tally = Tally()

    with Session(get_engine(), expire_on_commit=False) as unscoped:
        studios = _active_studios(unscoped)

    for studio_id, _slug in studios:
        tally.studios += 1
        with (
            use_studio(studio_id),
            TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
        ):
            run_daily(scoped, at=at, studio_id=studio_id, tally=tally)
            scoped.commit()

    logger.info(
        "billing jobs complete",
        # Counts only. A log line naming a family, an amount or a card would be a copy in
        # an aggregator that no later redaction can reach (§11.7).
        extra={
            "studios": tally.studios,
            "charges_created": tally.charges_created,
            "reminders": tally.reminders,
            "manager_tasks": tally.manager_tasks,
            "expired_orders": tally.expired,
            "undeliverable": tally.undeliverable,
            "prepay_notices": tally.prepay_notices,
            "prepay_deferred": tally.prepay_deferred,
        },
    )
    if tally.prepay_deferred:
        # Quiet hours refused them. Not a failure -- the run is complete and the credit is
        # spent -- but the households on rung zero were not told, and the fix is the cron
        # hour rather than a retry. WARNING so it is visible rather than inferred from a gap
        # between `prepay_notices` and the number of prepaying families.
        logger.warning(
            "prepay-ending notices refused by quiet hours",
            extra={"prepay_deferred": tally.prepay_deferred},
        )
    if tally.undeliverable:
        # Not a failure: lane COMMS has not landed, and every state change above still
        # happened. WARNING so it is visible rather than inferred from a gap.
        logger.warning(
            "some debt reminders could not be queued",
            extra={"undeliverable": tally.undeliverable},
        )
    return 0


def _is_run_day(session: Session, studio_id: uuid.UUID, today: date) -> bool:
    """§5.10 -- 'a configurable day (default the 1st)'.

    Read from `studio.settings["billing"]["run_day"]`, which `PATCH /billing/settings`
    writes. Capped at 28 there, because the 30th never comes round in February and a run day
    that never fires is a month nobody is billed and nobody notices until March.
    """
    studio = session.get(Studio, studio_id)
    settings = (studio.settings or {}).get("billing", {}) if studio else {}
    run_day = settings.get("run_day", 1)
    if today.day == run_day:
        return True
    # A run day past the end of a short month fires on its last day instead, so February
    # is billed rather than skipped.
    return today == period_end(today.year, today.month) and run_day > today.day


if __name__ == "__main__":
    sys.exit(main())
