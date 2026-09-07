"""Owner report #18 — "nothing tells a parent they owe money".

**The gap, precisely.** §5.10's run raises a tuition charge on the run day and dues it on
`period_end` — the LAST day of the month it bills. §5.10's ladder then starts three days
after a charge passes its due date. So a family charged on 1 November first heard from the
product on 3 December, five weeks later, and the club's only voice about money was a debt
reminder for a month that had already ended. Nothing at all said "this month's charge is
waiting" while there was still a month left to pay it in.

**The rung, and why it is a rung rather than a fourth thing.** `notify_prepay_ending` already
established the shape for a message the run itself raises: fired on the run day, bounded to
it, routed through `ReminderService` so §5.4a's 21:00–08:00 refusal and the 24-hour rate
limit both apply, counted rather than swallowed. This is the same shape for the family the
prepayment rung deliberately excludes — the one who ends the run owing money.

The two are disjoint by construction and this file asserts it: `payers_whose_prepay_ends`
skips anyone who `_owes_now`, and `payers_owing_for` is only ever those who do. A household
hears about their prepayment ending, or about a charge to pay, and never both in one morning.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.models.billing import Charge
from app.models.comms import Notification, NotificationPreference
from app.services.billing.payments import PaymentService
from app.services.billing.run import BillingRunService
from app.services.comms.actions import InboxActionResolver
from app.workers.billing import Tally, notify_charges_raised, run_daily
from sqlalchemy import select
from tests.billing.conftest import MONTHLY_AGOROT, REGISTRATION_AGOROT

#: 08:30 Asia/Jerusalem on the studio's default run day — the hour
#: `infra/railway/jobs.json` pins `billing-run` to, on the day `_is_run_day` fires.
RUN_DAY = datetime(2026, 11, 1, 6, 30, tzinfo=UTC)

#: 03:00 Asia/Jerusalem on the same day. The hour nobody may be sent anything (§5.4a).
THREE_AM = datetime(2026, 11, 1, 1, 0, tzinfo=UTC)

CHARGE_RAISED = "billing.charge_raised"


def _kinds(session, person_id: uuid.UUID) -> list[str]:
    return sorted(
        session.execute(
            select(Notification.kind).where(Notification.person_id == person_id)
        ).scalars()
    )


def _run(session, studio, at: datetime = RUN_DAY):
    return BillingRunService(session).run(studio.id, period_year=2026, period_month=11, at=at)


# -- who is on the rung ---------------------------------------------------------
def test_the_run_names_the_payer_it_just_charged(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """The audience is derived from the charges the run left open, not from a list the run
    kept: a retried run that crashed halfway must reach the same families as one that did
    not, and only the ledger knows which those are."""
    _run(tenant_session, studio)
    assert BillingRunService(tenant_session).payers_owing_for(
        studio.id, period_year=2026, period_month=11
    ) == [a_priced_student.payer_person_id]


def test_a_family_whose_credit_covered_the_month_is_not_told_they_owe_anything(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """**Step 7 runs before this question is asked, and that ordering is the feature.**

    A family who handed over three months of cash is charged like everybody else and then
    settled from their own credit inside the same transaction. Asking "who was charged"
    would message them; asking "who is left owing" does not. §5.10's own words: a family who
    has paid ahead must never, at any instant, read as owing money.
    """
    registration = Charge(
        studio_id=studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        student_id=a_priced_student.student_id,
        kind="registration",
        amount_agorot=REGISTRATION_AGOROT,
        due_date=date(2026, 9, 30),
        status="open",
        created_by="billing_run",
    )
    tenant_session.add(registration)
    tenant_session.flush()
    PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=REGISTRATION_AGOROT + MONTHLY_AGOROT,
        received_at=datetime(2026, 10, 20, 9, 0, tzinfo=UTC),
        charge_ids=[registration.id],
        recorded_by_person_id=None,
    )
    tenant_session.flush()

    _run(tenant_session, studio)
    assert (
        BillingRunService(tenant_session).payers_owing_for(
            studio.id, period_year=2026, period_month=11
        )
        == []
    )
    assert (
        notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id).charge_notices == 0
    )


def test_a_credit_note_is_not_a_debt(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """`amount_agorot > 0`, for the same reason `escalate_debt` filters on it: a credit is a
    negative charge, and telling a family they owe money for a discount the club granted them
    is the most avoidable message in the product.

    Built for December so it collides with nothing: `uq_charge_...` keys a periodic charge on
    (student, period, kind), and the run has already raised November's.
    """
    tenant_session.add(
        Charge(
            studio_id=studio.id,
            payer_person_id=a_priced_student.payer_person_id,
            student_id=a_priced_student.student_id,
            kind="tuition",
            period_year=2026,
            period_month=12,
            amount_agorot=-5_000,
            due_date=date(2026, 12, 31),
            status="open",
            created_by="billing_run",
        )
    )
    tenant_session.flush()
    assert (
        BillingRunService(tenant_session).payers_owing_for(
            studio.id, period_year=2026, period_month=12
        )
        == []
    )


def test_a_manual_credit_alone_never_makes_a_family_a_debtor(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """The other half of the same rule, and the one that actually happens.

    §5.10's discount is a NEGATIVE `manual` charge, and `BillingService.PERIODIC_KINDS` is
    `{"tuition"}` -- so a manual charge carries a NULL period and belongs to no month. It is
    therefore invisible to a period-scoped audience by construction rather than by the filter
    above, which is worth pinning both ways: the filter is what stops a granted discount from
    becoming a demand for money if a later milestone makes another kind periodic.
    """
    from app.services.billing.service import BillingService

    BillingService(tenant_session).create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        -5_000,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    tenant_session.flush()
    assert (
        BillingRunService(tenant_session).payers_owing_for(
            studio.id, period_year=2026, period_month=11
        )
        == []
    )


def test_last_months_debt_is_left_to_the_ladder(
    tenant_session, studio, a_priced_student, an_enrolled_student, three_open_months
) -> None:
    """Scoped to the period just billed, and September's arrears are not it. §5.10's day
    3/7/14 ladder owns an overdue charge; this rung owns the one that has only just been
    raised. Two mechanisms speaking about the same month is how a family stops reading
    either."""
    payers = BillingRunService(tenant_session).payers_owing_for(
        studio.id, period_year=2026, period_month=9
    )
    assert payers == [a_priced_student.payer_person_id]
    assert (
        BillingRunService(tenant_session).payers_owing_for(
            studio.id, period_year=2026, period_month=12
        )
        == []
    )


# -- the message itself ---------------------------------------------------------
def test_the_run_day_tells_the_family_a_charge_is_waiting(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """**The failure #18 reports.** The November run raises November's tuition, due on the
    30th, and the family is told on the 1st — with a month left to pay rather than five weeks
    after the fact."""
    _run(tenant_session, studio)
    tally = notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id)
    assert tally.charge_notices == 1
    assert _kinds(tenant_session, a_priced_student.payer_person_id) == [CHARGE_RAISED]


def test_the_notice_opens_the_payments_screen(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """**The seam the owner actually asked for, asserted end to end.**

    `#/payments` is never named by the server: §5.11's trigger list grows every milestone and
    a server that shipped a hash route would need a deploy to fix a typo. The server names
    the FACT — `action.kind == 'payment'` — and the parent app's own
    `features/comms/actionCatalogue.ts` maps that one kind to `#/payments`. Asserting the
    resolver rather than the string is what proves the whole chain: a kind absent from
    `ACTION_BY_KIND` renders as a plain row with no button at all, which is what every
    `billing.overdue.*` rung still does.
    """
    _run(tenant_session, studio)
    notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id)
    note = tenant_session.execute(
        select(Notification).where(Notification.kind == CHARGE_RAISED)
    ).scalar_one()

    action = InboxActionResolver(tenant_session).resolve(note)
    assert action is not None
    assert action.kind == "payment"
    assert action.outstanding is True


def test_the_notice_settles_itself_once_the_family_pays(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """`InboxActionResolver` resolves on READ against the payer's balance, never a stored
    flag — so the demand disappears when the money arrives rather than when somebody
    remembers to clear it. Asserted here because a notice that goes on demanding a settled
    payment is the exact defect `actions.py` was written to fix."""
    _run(tenant_session, studio)
    notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id)
    note = tenant_session.execute(
        select(Notification).where(Notification.kind == CHARGE_RAISED)
    ).scalar_one()

    charges = list(
        tenant_session.execute(
            select(Charge.id, Charge.amount_agorot).where(
                Charge.payer_person_id == a_priced_student.payer_person_id, Charge.status == "open"
            )
        ).all()
    )
    PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=sum(amount for _id, amount in charges),
        received_at=RUN_DAY,
        charge_ids=[charge_id for charge_id, _amount in charges],
        recorded_by_person_id=None,
    )
    tenant_session.flush()

    action = InboxActionResolver(tenant_session).resolve(note)
    assert action is not None
    assert action.outstanding is False


def test_the_notice_carries_no_money_and_no_child(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """§11.7 and invariant 1. A payload is copied to a push service, so it names the period
    and nothing else — the amount is on the screen the tap opens. And a debt is the
    household's, not one child's, so there is no student to name."""
    _run(tenant_session, studio)
    notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id)
    payload = tenant_session.execute(
        select(Notification.payload).where(Notification.kind == CHARGE_RAISED)
    ).scalar_one()
    assert payload["period"] == "2026-11"
    assert not any(key.endswith("_agorot") for key in payload)
    assert "student_id" not in payload

    body = tenant_session.execute(
        select(Notification.body).where(Notification.kind == CHARGE_RAISED)
    ).scalar_one()
    assert str(MONTHLY_AGOROT) not in body
    assert "250" not in body


def test_the_notice_goes_to_the_payer_and_not_to_every_guardian(
    tenant_session, studio, a_priced_student, an_enrolled_student, a_second_guardian
) -> None:
    """§6.3, and the same call `remind_debt` and `remind_prepay_ending` both make: one
    message per household, to the person who owes it.

    It matters more here than for the debt ladder, which writes to every guardian. The notice
    carries a payment action, and `InboxActionResolver` resolves that action against the
    RECIPIENT's own balance — so a non-paying guardian would be handed a payment card marked
    already settled, for a debt nobody has paid.
    """
    _run(tenant_session, studio)
    assert (
        notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id).charge_notices == 1
    )
    assert _kinds(tenant_session, a_second_guardian) == []


# -- the three rules a job-raised message obeys ---------------------------------
def test_a_three_am_run_defers_the_notice_rather_than_sending_it(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """§5.4a — `לא נשלחות הודעות אחרי 21:00`. Routed through `ReminderService` for the reason
    that module's docstring gives about rung zero: a run moved to 03:00 refuses instead of
    lighting up a phone at 03:15. Counted, never swallowed."""
    _run(tenant_session, studio, at=THREE_AM)
    tally = notify_charges_raised(tenant_session, at=THREE_AM, studio_id=studio.id)
    assert tally.charge_notices == 0
    assert tally.charge_notices_deferred == 1
    assert _kinds(tenant_session, a_priced_student.payer_person_id) == []


def test_a_second_pass_on_the_same_day_does_not_tell_the_family_twice(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """A retried job, or a manager pressing `הרצה עכשיו` after the cron already ran. The
    subject is the PERIOD, so the 24-hour window is exact: this month is silent the second
    time and next month is a different subject rather than a message the window happens to be
    past."""
    _run(tenant_session, studio)
    assert (
        notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id).charge_notices == 1
    )
    assert (
        notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id).charge_notices == 0
    )
    assert _kinds(tenant_session, a_priced_student.payer_person_id) == [CHARGE_RAISED]


def test_a_parent_who_switched_payment_notices_off_still_gets_the_inbox_row(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """§5.11 — "a preference silences the doorbell, never the letter". `billing.` maps onto
    the `payment` switch through the kind PREFIX, with no edit to
    `app/services/comms/kinds.py`, which is the whole point of that mapping."""
    tenant_session.add(
        NotificationPreference(
            studio_id=studio.id,
            person_id=a_priced_student.payer_person_id,
            kind_group="payment",
            enabled=False,
        )
    )
    tenant_session.flush()

    _run(tenant_session, studio)
    notify_charges_raised(tenant_session, at=RUN_DAY, studio_id=studio.id)
    assert _kinds(tenant_session, a_priced_student.payer_person_id) == [CHARGE_RAISED]


# -- the way the job actually runs ----------------------------------------------
def test_a_whole_month_of_daily_passes_says_it_once(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """**The bound, asserted the way the cron drives it.**

    `billing-run` fires every morning and "this family owes for November" stays true for all
    of November. An unbounded predicate would say it thirty times, which is how a message
    stops being read — and the day-3 rung would then be the thirty-first. `run_daily` is the
    per-studio body `main()` loops over, so driving it across the month exercises the same
    order: run, the two run-day notices, ladder, sweep.
    """
    notices = 0
    for day in range(1, 31):
        at = datetime(2026, 11, day, 6, 30, tzinfo=UTC)
        notices += run_daily(tenant_session, at=at, studio_id=studio.id).charge_notices
    assert notices == 1
    assert _kinds(tenant_session, a_priced_student.payer_person_id).count(CHARGE_RAISED) == 1


def test_the_family_hears_about_the_charge_before_the_ladder_hears_about_the_debt(
    tenant_session, studio, a_priced_student, an_enrolled_student
) -> None:
    """The whole of #18 in one assertion. November's charge is due on the 30th, so the first
    rung of §5.10's ladder cannot fire before 3 December. Nothing in the product spoke in
    between, and now something does — on 1 November."""
    november = run_daily(tenant_session, at=RUN_DAY, studio_id=studio.id)
    assert november.charge_notices == 1
    assert november.reminders == 0

    ladder = run_daily(
        tenant_session, at=datetime(2026, 12, 3, 6, 30, tzinfo=UTC), studio_id=studio.id
    )
    assert ladder.reminders >= 1


def test_the_tally_still_carries_counts_and_never_money() -> None:
    """Invariant 1, re-asserted over the two fields this rung adds."""
    fields = set(Tally.__dataclass_fields__)
    assert {"charge_notices", "charge_notices_deferred"} <= fields
    assert not any(name.endswith("_agorot") for name in fields)
