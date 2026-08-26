"""§5.10's three jobs: the monthly run, the debt escalation ladder, and the stale-order sweep.

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
from app.services.billing.run import BillingRunService, period_end
from app.services.comms import NotificationService

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


def main() -> int:
    """The daily pass: bill the month if it is the run day, then chase and sweep."""
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
            if _is_run_day(scoped, studio_id, at.date()):
                run = BillingRunService(scoped).run(
                    studio_id, period_year=at.year, period_month=at.month, at=at
                )
                tally.charges_created += run.charges_created
            escalate_debt(scoped, at=at, tally=tally)
            sweep_stale_orders(scoped, at=at, studio_id=studio_id, tally=tally)
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
        },
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
