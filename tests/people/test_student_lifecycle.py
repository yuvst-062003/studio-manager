"""§5.4's leaving and freezing, and §5.4a's conversion and loss.

Two rules here are stated in the spec in a way that is easy to soften into something
friendlier and wrong, so both are pinned:

  * §5.4 -- 'ending an enrollment mid-month does NOT void that month's charge and produces
    no refund.' Parent `12i` says it to the parent's face. Nothing in `leave` touches
    money, and the test asserts the absence.
  * §5.4 -- while frozen 'the enrollment and the spot are retained.' A freeze that ended
    enrollments would give the spot away, which is the one thing the parent was promised
    would not happen.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.models.people import Enrollment, StudentFreeze, StudentStatusHistory, TrialBooking
from app.services.people.enrollments import EnrollmentService
from app.services.people.errors import RefusedError
from app.services.people.status import StudentStatusService
from app.services.people.students import StudentService
from sqlalchemy import select
from tests.people.conftest import T0, TODAY, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)


def _student(session, *, status: str = "lead"):
    tag = uuid.uuid4().hex[:8]
    return StudentService.create(
        session,
        first_name=f"דנה{tag}",
        last_name=f"כהן{tag}",
        birthdate=date(2016, 4, 2),
        guardian_first_name=f"יעל{tag}",
        guardian_last_name=f"כהן{tag}",
        guardian_email=f"g-{tag}@example.invalid",
        guardian_phone=None,
        at=T0,
        actor_person_id=None,
        status=status,
    ).student


@pytest.fixture
def trains_sundays(fake_schedule, studio, a_group, a_second_group, a_training_year):
    for group in (a_group, a_second_group):
        fake_schedule.sessions[group] = [
            make_session(
                studio_id=studio.id,
                group_id=group,
                training_year_id=a_training_year,
                starts_at=SUNDAY,
            )
        ]
    return fake_schedule


@pytest.fixture
def an_active_student(tenant_session, a_group, trains_sundays):
    student = _student(tenant_session)
    StudentStatusService.transition(tenant_session, student=student, to_status="active", at=T0)
    student.joined_on = TODAY
    EnrollmentService.create(
        tenant_session,
        student_id=student.id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=trains_sundays,
    )
    tenant_session.commit()
    return student


# -- freezing ------------------------------------------------------------------


def test_freezing_records_a_range_and_keeps_the_enrollment(tenant_session, an_active_student):
    """§5.4 -- 'the enrollment and the spot are retained.'"""
    StudentService.freeze(
        tenant_session,
        student_id=an_active_student.id,
        from_date=date(2026, 10, 1),
        to_date=date(2026, 11, 1),
        reason="פציעה",
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    assert an_active_student.status == "frozen"
    freeze = tenant_session.execute(
        select(StudentFreeze).where(StudentFreeze.student_id == an_active_student.id)
    ).scalar_one()
    assert (freeze.from_date, freeze.to_date) == (date(2026, 10, 1), date(2026, 11, 1))

    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == an_active_student.id)
    ).scalar_one()
    assert enrollment.ended_on is None


def test_a_freeze_may_be_open_ended(tenant_session, an_active_student):
    """§5.4's army case has no return date, and the guardian view shows 'מוקפא' with no
    date rather than a made-up one."""
    StudentService.freeze(
        tenant_session,
        student_id=an_active_student.id,
        from_date=date(2026, 10, 1),
        to_date=None,
        reason="שירות מילואים",
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()
    row = tenant_session.execute(
        select(StudentFreeze).where(StudentFreeze.student_id == an_active_student.id)
    ).scalar_one()
    assert row.to_date is None


def test_a_freeze_that_has_run_out_returns_the_student_to_active(tenant_session, an_active_student):
    """§7 has no unfreeze endpoint and §5.4 gives the freeze a return date, so the date is
    what ends it. Without this the student is `frozen` forever, the roster never shows them
    again, and the parent is still reading 'מוקפא' in April."""
    StudentService.freeze(
        tenant_session,
        student_id=an_active_student.id,
        from_date=date(2026, 10, 1),
        to_date=date(2026, 10, 31),
        reason=None,
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    reactivated = StudentService.expire_freezes(tenant_session, on=date(2026, 11, 1), at=T0)
    tenant_session.commit()

    assert an_active_student.id in {s.id for s in reactivated}
    assert an_active_student.status == "active"


def test_an_open_ended_freeze_never_expires_on_its_own(tenant_session, an_active_student):
    """Inventing a return date for §5.4's army case would put a child back on a roster
    they are not at."""
    StudentService.freeze(
        tenant_session,
        student_id=an_active_student.id,
        from_date=date(2026, 10, 1),
        to_date=None,
        reason=None,
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    reactivated = StudentService.expire_freezes(tenant_session, on=date(2030, 1, 1), at=T0)
    assert an_active_student.id not in {s.id for s in reactivated}
    assert an_active_student.status == "frozen"


def test_a_freeze_still_running_is_left_alone(tenant_session, an_active_student):
    """The control for the expiry test. A sweep that reactivated everyone would look
    identical to one that worked, on the day every freeze happened to have ended."""
    StudentService.freeze(
        tenant_session,
        student_id=an_active_student.id,
        from_date=date(2026, 10, 1),
        to_date=date(2026, 12, 31),
        reason=None,
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    reactivated = StudentService.expire_freezes(tenant_session, on=date(2026, 11, 1), at=T0)
    assert an_active_student.id not in {s.id for s in reactivated}
    assert an_active_student.status == "frozen"


# -- leaving -------------------------------------------------------------------


def test_leaving_ends_every_live_enrollment_and_touches_no_money(
    tenant_session, an_active_student, a_second_group, trains_sundays
):
    """C11 -- several live enrollments are normal, so leaving must end all of them.
    Parent `12i` -- the monthly charge stays the parent's responsibility, so nothing here
    writes, cancels or refunds anything financial."""
    EnrollmentService.create(
        tenant_session,
        student_id=an_active_student.id,
        group_id=a_second_group,
        started_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=trains_sundays,
    )
    tenant_session.commit()

    StudentService.leave(
        tenant_session,
        student_id=an_active_student.id,
        left_on=date(2026, 12, 15),
        reason="עבר עיר",
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    assert an_active_student.status == "left"
    assert an_active_student.left_on == date(2026, 12, 15)
    enrollments = list(
        tenant_session.execute(
            select(Enrollment).where(Enrollment.student_id == an_active_student.id)
        ).scalars()
    )
    assert len(enrollments) == 2
    assert all(e.ended_on == date(2026, 12, 15) and e.status == "ended" for e in enrollments)


def test_leaving_keeps_every_row_of_history(tenant_session, an_active_student):
    """§5.4 -- 'The student's status becomes left; all history is retained.'"""
    StudentService.leave(
        tenant_session,
        student_id=an_active_student.id,
        left_on=TODAY,
        reason=None,
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()
    rows = list(
        tenant_session.execute(
            select(StudentStatusHistory)
            .where(StudentStatusHistory.student_id == an_active_student.id)
            .order_by(StudentStatusHistory.created_at)
        ).scalars()
    )
    assert [r.to_status for r in rows] == ["active", "left"]


def test_the_leave_shape_carries_no_money_field():
    """Parent `12i`. Leaving is not a refund, so there is no field to ask for one and no
    "cancel outstanding charges" flag to tick by accident."""
    from app.schemas.people import StudentLeaveIn

    forbidden = {"refund", "write_off", "cancel_charges", "amount_agorot", "balance"}
    assert forbidden.isdisjoint(StudentLeaveIn.model_fields)


# -- conversion ----------------------------------------------------------------


def test_converting_a_trial_creates_the_enrollment_and_sets_the_price_on_the_student(
    tenant_session, a_group, trains_sundays
):
    """§5.4a step 5, and C11. One student, one `price_plan_id`, however many groups -- and
    `enrollment` carries no price at all."""
    student = _student(tenant_session, status="lead")
    StudentStatusService.transition(tenant_session, student=student, to_status="trial", at=T0)
    tenant_session.commit()

    plan = uuid.uuid4()
    StudentService.convert(
        tenant_session,
        student_id=student.id,
        group_id=a_group,
        started_on=TODAY,
        price_plan_id=plan,
        attends_weekdays=None,
        reason=None,
        at=T0,
        actor_person_id=None,
        schedule=trains_sundays,
    )
    tenant_session.commit()

    assert student.status == "active"
    assert student.joined_on == TODAY
    assert student.price_plan_id == plan
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student.id)
    ).scalar_one()
    assert enrollment.group_id == a_group
    assert enrollment.status == "active"


def test_converting_closes_the_trial_booking_as_converted(
    tenant_session, studio, a_group, trains_sundays
):
    """§5.4a -- `trial_booking.outcome` is what makes the funnel's denominator honest. A
    conversion that left it `pending` would show as a trial nobody ever decided about."""
    student = _student(tenant_session)
    StudentStatusService.transition(tenant_session, student=student, to_status="trial", at=T0)
    booking = TrialBooking(
        student_id=student.id,
        group_id=a_group,
        booked_at=T0,
        attended=True,
        outcome="pending",
        is_override=False,
    )
    tenant_session.add(booking)
    tenant_session.commit()

    StudentService.convert(
        tenant_session,
        student_id=student.id,
        group_id=a_group,
        started_on=TODAY,
        price_plan_id=None,
        attends_weekdays=None,
        reason=None,
        at=T0,
        actor_person_id=None,
        schedule=trains_sundays,
    )
    tenant_session.commit()
    assert booking.outcome == "converted"


def test_converting_does_not_promote_the_health_status(tenant_session, a_group, trains_sundays):
    """§5.4a -- 'The trial declaration is not sufficient for enrollment. health_status
    moves missing → trial_signed → signed; converting requires the full form.' Moving it to
    `signed` here would switch off the app's health gate for exactly the students who have
    signed nothing."""
    student = _student(tenant_session)
    student.health_status = "trial_signed"
    StudentStatusService.transition(tenant_session, student=student, to_status="trial", at=T0)
    tenant_session.commit()

    StudentService.convert(
        tenant_session,
        student_id=student.id,
        group_id=a_group,
        started_on=TODAY,
        price_plan_id=None,
        attends_weekdays=None,
        reason=None,
        at=T0,
        actor_person_id=None,
        schedule=trains_sundays,
    )
    tenant_session.commit()
    assert student.health_status == "trial_signed"


def test_converting_an_active_student_is_refused(
    tenant_session, an_active_student, a_group, trains_sundays
):
    """`active → active` is not in the graph, and a second conversion would try to create a
    second enrollment in a group they are already in."""
    with pytest.raises(RefusedError):
        StudentService.convert(
            tenant_session,
            student_id=an_active_student.id,
            group_id=a_group,
            started_on=TODAY,
            price_plan_id=None,
            attends_weekdays=None,
            reason=None,
            at=T0,
            actor_person_id=None,
            schedule=trains_sundays,
        )


def test_a_refused_conversion_leaves_no_enrollment_behind(tenant_session, a_group, trains_sundays):
    """The transition runs before the enrollment for exactly this reason: a refused
    conversion must not leave the student in a group they were never put in."""
    student = _student(tenant_session, status="left")
    tenant_session.commit()

    with pytest.raises(RefusedError):
        StudentService.convert(
            tenant_session,
            student_id=student.id,
            group_id=a_group,
            started_on=TODAY,
            price_plan_id=None,
            attends_weekdays=None,
            reason=None,
            at=T0,
            actor_person_id=None,
            schedule=trains_sundays,
        )
    tenant_session.rollback()
    assert (
        tenant_session.execute(
            select(Enrollment).where(Enrollment.student_id == student.id)
        ).first()
        is None
    )


# -- loss ----------------------------------------------------------------------


def test_marking_lost_records_the_reason_and_closes_the_booking(tenant_session, studio, a_group):
    student = _student(tenant_session)
    StudentStatusService.transition(tenant_session, student=student, to_status="trial", at=T0)
    booking = TrialBooking(
        student_id=student.id,
        group_id=a_group,
        booked_at=T0,
        attended=False,
        outcome="pending",
        is_override=False,
    )
    tenant_session.add(booking)
    tenant_session.commit()

    StudentService.mark_lost(
        tenant_session,
        student_id=student.id,
        reason="בחרו קראטה",
        at=T0,
        actor_person_id=None,
    )
    tenant_session.commit()

    assert student.status == "lost"
    assert booking.outcome == "lost"
    row = tenant_session.execute(
        select(StudentStatusHistory).where(
            StudentStatusHistory.student_id == student.id,
            StudentStatusHistory.to_status == "lost",
        )
    ).scalar_one()
    assert row.reason == "בחרו קראטה"


# -- the routes ----------------------------------------------------------------


def _api_student(client, caller) -> str:
    tag = uuid.uuid4().hex[:8]
    response = client.post(
        "/api/v1/students",
        json={
            "first_name": f"דנה{tag}",
            "last_name": f"כהן{tag}",
            "guardian": {
                "first_name": f"יעל{tag}",
                "last_name": f"כהן{tag}",
                "email": f"y-{tag}@example.invalid",
            },
        },
        headers=caller.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["student"]["id"]


def test_freezing_is_manager_only(client, as_manager, as_lead_coach):
    student = _api_student(client, as_manager)
    refused = client.post(
        f"/api/v1/students/{student}/freeze",
        json={"from_date": "2026-10-01"},
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403


def test_leaving_through_the_api_returns_no_money_field_of_any_kind(client, as_manager):
    """Invariant 3 plus parent `12i`, asserted at the wire rather than only at the model --
    a later `response_model` change is exactly how one would appear."""
    student = _api_student(client, as_manager)
    client.post(
        f"/api/v1/students/{student}/convert",
        json={"group_id": str(uuid.uuid4()), "started_on": "2026-09-01"},
        headers=as_manager.headers,
    )
    left = client.post(
        f"/api/v1/students/{student}/leave",
        json={"left_on": "2026-12-15"},
        headers=as_manager.headers,
    )
    body = str(left.json())
    assert not any(word in body for word in ("amount", "balance", "debt", "agorot", "refund"))


def test_an_illegal_transition_through_the_api_is_422_not_500(client, as_manager):
    """A `lead` cannot leave -- they never arrived. The service refuses, and the router
    turns that into a message rather than a stack trace."""
    student = _api_student(client, as_manager)
    response = client.post(
        f"/api/v1/students/{student}/leave",
        json={"left_on": "2026-12-15"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "refused"


def test_the_status_history_route_is_readable_by_a_coach(
    client, as_manager, as_lead_coach, assign_coach, a_group, app_session, studio
):
    from app.models.people import Enrollment as E
    from tests.people.conftest import TODAY as T

    student = _api_student(client, as_manager)
    app_session.add(
        E(
            studio_id=studio.id,
            student_id=uuid.UUID(student),
            group_id=a_group,
            status="active",
            started_on=T,
        )
    )
    app_session.commit()
    assign_coach(as_lead_coach.person_id, a_group)

    response = client.get(
        f"/api/v1/students/{student}/status-history", headers=as_lead_coach.headers
    )
    assert response.status_code == 200
    assert response.json()["items"] == []
