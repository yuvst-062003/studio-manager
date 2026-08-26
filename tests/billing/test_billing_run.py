"""§5.10's monthly run.

Proration, registration fees and freezes are Task 2; this file is the run's spine -- who is
billable, one charge per student, one run row per period -- and it is what invariant 5
asserts idempotence over.
"""

from __future__ import annotations

from datetime import date

from app.models.billing import BillingRun, Charge
from app.services.billing.run import BillingRunService, period_end
from sqlalchemy import func, select
from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0


def test_period_end_is_the_last_day_of_the_month():
    """The other half of deriving a period from a due date: the run dues every tuition
    charge here, so the period the seam derives cannot disagree with the period the run
    believes it billed. `calendar.monthrange`, not arithmetic on 28/30/31 -- February 2028
    is the case that catches a hand-rolled one."""
    assert period_end(2026, 11) == date(2026, 11, 30)
    assert period_end(2026, 12) == date(2026, 12, 31)
    assert period_end(2028, 2) == date(2028, 2, 29)


def test_the_run_charges_one_student_once(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """§5.10 step 1 -- 'One student, one tuition charge, however many groups they are
    enrolled in.'"""
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert run.status == "completed"
    assert run.charges_created == 1
    charge = tenant_session.execute(
        select(Charge).where(Charge.student_id == a_priced_student.student_id)
    ).scalar_one()
    assert charge.amount_agorot == MONTHLY_AGOROT
    assert charge.due_date == date(2026, 11, 30)
    assert charge.created_by == "billing_run"


def test_the_charge_is_owed_by_the_primary_guardian(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """§4.3 -- captured at creation, so changing the primary guardian later leaves
    historical charges with whoever actually owed them."""
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = tenant_session.execute(select(Charge)).scalars().one()
    assert charge.payer_person_id == a_priced_student.payer_person_id


def test_a_student_in_two_groups_is_charged_once(
    tenant_session, studio, a_priced_student, an_enrolled_student, a_second_enrollment
):
    """C11's whole point, and the defect the unique index makes unforgeable. Walking
    enrollments instead of students is what bills this child twice at two prices."""
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert run.charges_created == 1
    assert tenant_session.execute(select(func.count()).select_from(Charge)).scalar_one() == 1


def test_a_student_with_no_price_plan_is_skipped_and_reported(
    tenant_session, studio, an_unpriced_student
):
    """A child the manager has not priced yet. Charging them zero would look like a working
    run; skipping silently would lose them. The run records both."""
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert run.charges_created == 0
    assert str(an_unpriced_student.student_id) in run.log["unpriced"]


def test_rerunning_the_same_period_creates_no_duplicates(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """§5.10 step 5, in this lane's own suite. A run that crashed halfway and is retried
    must not double-charge, and it must not depend on its own bookkeeping being intact to
    avoid it -- the database refuses."""
    service = BillingRunService(tenant_session)
    service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    second = service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    assert second.charges_created == 0
    assert second.log["already_charged"] == 1
    assert tenant_session.execute(select(func.count()).select_from(Charge)).scalar_one() == 1


def test_a_rerun_reuses_the_period_s_run_row(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """`uq_billing_run_studio_period` is unique, so a second run for one period is the same
    row re-opened. Inserting a second would be an IntegrityError on the retry path -- the
    exact path that only ever runs when something has already gone wrong."""
    service = BillingRunService(tenant_session)
    first = service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    second = service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    assert first.id == second.id
    assert tenant_session.execute(select(func.count()).select_from(BillingRun)).scalar_one() == 1
