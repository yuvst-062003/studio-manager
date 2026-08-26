"""§5.10's jobs. Three of them, and one shared rule: **messages go through W5's seam.**

`NotificationService.enqueue` sends for real now -- lane COMMS (M8) filled W5's seam in.
The refusals are still COUNTED and reported rather than swallowed, because a send can fail
for reasons that are not "nobody implemented it": a parent with no registered device, a
notification type they switched off, a push service that errored. A run that reported "12
reminders sent" when none were is worse than one that says so -- the debt ladder is the
feature a manager will most want to trust, and its failures are silent by nature.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.models.billing import Charge
from app.workers.billing import (
    ESCALATION_DAYS,
    Tally,
    escalate_debt,
    run_billing,
    sweep_stale_orders,
)
from tests.billing.conftest import MONTHLY_AGOROT, T0


def _due(charge_session, charge_id, days_ago_from):
    """Move a charge's due date so `at` is exactly N days past it."""
    charge = charge_session.get(Charge, charge_id)
    charge.due_date = days_ago_from
    charge_session.flush()
    return charge


def test_the_escalation_days_are_three_seven_and_fourteen():
    """§5.10 -- 'day 3 a gentle reminder to the payer, day 7 a firmer one, day 14 a final
    notice plus a task on the manager's dashboard.' Exactly these three."""
    assert ESCALATION_DAYS == (3, 7, 14)


def test_a_charge_three_days_overdue_gets_the_first_reminder(
    tenant_session, studio, a_priced_student, an_open_charge
):
    _due(tenant_session, an_open_charge, T0.date() - timedelta(days=3))
    tally = escalate_debt(tenant_session, at=T0)
    assert tally.stage == {3: 1}
    assert tally.reminders == 1


def test_each_rung_fires_once_and_not_again(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """A daily job must not send the day-3 reminder on days 3, 4, 5, 6 and 7 -- five
    reminders for one rung, from a ladder whose whole point is that each rung means
    something different. Bounded to the exact day, the same way followups.py bounds its
    24-hour window."""
    fired = {}
    for offset in range(1, 16):
        _due(tenant_session, an_open_charge, T0.date() - timedelta(days=offset))
        tally = escalate_debt(tenant_session, at=T0)
        if tally.stage:
            fired[offset] = tally.stage
    assert sorted(fired) == [3, 7, 14]


def test_a_settled_charge_is_never_chased(tenant_session, studio, a_priced_student, an_open_charge):
    """The bug that costs a club its credibility: a debt reminder to a parent who paid."""
    from app.services.billing.payments import PaymentService

    _due(tenant_session, an_open_charge, T0.date() - timedelta(days=7))
    PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    assert escalate_debt(tenant_session, at=T0).reminders == 0


def test_a_written_off_charge_is_never_chased(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """A written-off debt is a decision a manager made. Chasing it undoes that decision once
    a week, forever."""
    from app.services.billing import BillingService

    _due(tenant_session, an_open_charge, T0.date() - timedelta(days=14))
    BillingService(tenant_session).close_charge(
        an_open_charge, status="written_off", reason="משפחה עזבה"
    )
    assert escalate_debt(tenant_session, at=T0).reminders == 0


def test_a_credit_is_never_chased(tenant_session, studio, a_priced_student):
    """A credit is a negative charge. Chasing a family for a discount the club granted them
    is the most avoidable message in the product."""
    from app.services.billing import BillingService

    BillingService(tenant_session).create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        -5_000,
        T0.date() - timedelta(days=7),
        student_id=a_priced_student.student_id,
    )
    assert escalate_debt(tenant_session, at=T0).reminders == 0


def test_day_fourteen_raises_a_manager_task_as_well_as_a_notice(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """§5.10 -- 'day 14 a final notice PLUS a task on the manager's dashboard.' The parent
    message and the manager's task are two different facts and both have to happen."""
    _due(tenant_session, an_open_charge, T0.date() - timedelta(days=14))
    tally = escalate_debt(tenant_session, at=T0)
    assert tally.stage == {14: 1}
    assert tally.manager_tasks == 1


def test_earlier_rungs_raise_no_manager_task(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """Only day 14. A task on every rung would make the dashboard's alert centre a list of
    everything, which is a list of nothing."""
    for offset in (3, 7):
        _due(tenant_session, an_open_charge, T0.date() - timedelta(days=offset))
        assert escalate_debt(tenant_session, at=T0).manager_tasks == 0


def test_the_seam_delivers_now_and_the_counter_still_reports_honestly(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """**Updated by lane COMMS (M8), which filled W5's seam in.**

    This read `tally.undeliverable == tally.reminders` while
    `NotificationService.enqueue` raised -- every message refused, and the point was that the
    job carried on and said so. The seam sends now, so the honest assertion is the mirror
    image: nothing was refused, and the reminders were real.

    `undeliverable` stays in the tally and `_notify`'s `except NotImplementedError` stays in
    the worker. A send can still fail for reasons that are not "nobody implemented it", and a
    run reporting "12 reminders sent" when none were is exactly as wrong as it ever was.
    """
    _due(tenant_session, an_open_charge, T0.date() - timedelta(days=3))
    tally = escalate_debt(tenant_session, at=T0)
    assert tally.undeliverable == 0
    assert tally.reminders > 0


def test_every_guardian_is_reminded_and_not_only_the_payer(
    tenant_session, studio, a_priced_student, an_open_charge, a_second_guardian
):
    """§5.3 and L8 -- `is_primary` decides bill addressing and הוראת קבע matching, and a
    reminder is neither. `followups.py::_guardians_of` states the same rule."""
    _due(tenant_session, an_open_charge, T0.date() - timedelta(days=3))
    tally = escalate_debt(tenant_session, at=T0)
    assert tally.reminders == 2
    assert tally.stage == {3: 1}


def test_a_charge_with_no_student_is_not_chased(tenant_session, studio, a_priced_student):
    """A manual charge raised against a payer directly has no child, so there are no
    guardians to message. It still shows on `3e`; there is simply nobody to write to."""
    from app.services.billing import BillingService

    BillingService(tenant_session).create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "manual",
        5_000,
        T0.date() - timedelta(days=3),
    )
    assert escalate_debt(tenant_session, at=T0).reminders == 0


def test_an_order_pending_past_twenty_four_hours_is_swept(
    tenant_session, studio, a_priced_student, an_order
):
    """§5.10's 'IPN never arrives' row. upay-integration.md puts it more strongly: treat 'no
    IPN ever arrived' as a failure signal in its own right, because a failure-shaped payload
    may not exist at all."""
    tally = sweep_stale_orders(tenant_session, at=T0 + timedelta(hours=25), studio_id=studio.id)
    assert tally.expired == 1


def test_a_fresh_order_is_left_alone(tenant_session, studio, a_priced_student, an_order):
    """uPay's IPN is delayed [VERIFIED] and the ~5 minutes is approximate. Sweeping early
    would expire an order the parent is halfway through paying."""
    tally = sweep_stale_orders(tenant_session, at=T0 + timedelta(hours=2), studio_id=studio.id)
    assert tally.expired == 0


def test_the_monthly_run_bills_the_period_the_clock_is_in(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """The job derives the period from `at`, so §19.5's time travel reaches it: a manager
    can test December's billing in November."""
    tally = run_billing(tenant_session, at=T0, studio_id=studio.id)
    assert tally.charges_created == 2  # tuition plus the once-ever registration fee
    charge = tenant_session.execute(select_tuition(a_priced_student.student_id)).scalar_one()
    assert charge.period_month == T0.month


def select_tuition(student_id):
    from sqlalchemy import select

    return select(Charge).where(Charge.student_id == student_id, Charge.kind == "tuition")


def test_a_tally_carries_counts_and_never_money():
    """Invariant 1's rule, applied to the thing the run reports. A tally field named for an
    amount would be money in a structure that gets logged."""
    fields = set(Tally.__dataclass_fields__)
    assert not any(name.endswith("_agorot") for name in fields)
    assert "charges_created" in fields


def test_the_run_day_defaults_to_the_first(tenant_session, studio):
    """§5.10 -- 'a configurable day (default the 1st)'."""
    from app.workers.billing import _is_run_day

    assert _is_run_day(tenant_session, studio.id, date(2026, 11, 1)) is True
    assert _is_run_day(tenant_session, studio.id, date(2026, 11, 12)) is False


def test_a_run_day_past_the_end_of_a_short_month_fires_on_its_last_day(tenant_session, studio):
    """The 28-cap in `PATCH /billing/settings` makes this unreachable today, and it is
    written anyway: a run day that never comes round is a month nobody is billed and nobody
    notices until March."""
    from app.workers.billing import _is_run_day

    studio_row = tenant_session.get(type(studio), studio.id)
    studio_row.settings = {"billing": {"run_day": 30}}
    tenant_session.flush()
    assert _is_run_day(tenant_session, studio.id, date(2027, 2, 28)) is True
    assert _is_run_day(tenant_session, studio.id, date(2027, 2, 27)) is False
