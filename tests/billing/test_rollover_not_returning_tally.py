"""§3.6 of the completion findings register.

`apply_students` ends the enrollment of a student marked "not returning" -- correctly,
since they should not be billed for a group they no longer attend. But `_billable_students`
excludes anyone with no active enrollment through an INNER JOIN, before any tally sees
them, so the run recorded nothing that explained why the club had one fewer billable
student that month. A tally line naming who was skipped and why is the whole fix.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.schedule import TrainingYear
from app.services.billing.run import BillingRunService
from app.services.schedule.rollover import RolloverService
from sqlalchemy.orm import Session
from tests.billing.conftest import PERIOD, T0, PricedStudent

NEXT_STARTS = date(2027, 9, 1)


@pytest.fixture
def a_draft_year(app_session: Session, studio) -> uuid.UUID:
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ח",
        starts_on=NEXT_STARTS,
        ends_on=date(2028, 6, 30),
        status="draft",
    )
    app_session.add(row)
    app_session.commit()
    return row.id


def test_a_not_returning_student_is_named_in_the_run_s_tally(
    tenant_session,
    studio,
    a_priced_student: PricedStudent,
    an_enrolled_student,
    a_draft_year,
):
    """The reproduction: end the enrollment the way rollover's step 4 does, then run the
    very next billing and read what the run says about the missing student -- which,
    before this fix, is nothing at all."""
    RolloverService(tenant_session).apply_students(
        a_draft_year,
        not_returning=[an_enrolled_student],
        at=T0,
        actor_person_id=None,
        studio_id=studio.id,
    )
    tenant_session.commit()

    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert run.charges_created == 0
    assert str(a_priced_student.student_id) in run.log["no_active_enrollment"]
    # Not billing them is correct. Landing in a DIFFERENT bucket would misname the reason
    # -- `unpriced` means no plan/guardian, `frozen` means an active enrollment that was
    # paused, and neither is what happened here.
    assert str(a_priced_student.student_id) not in run.log["unpriced"]
    assert str(a_priced_student.student_id) not in run.log["frozen"]
