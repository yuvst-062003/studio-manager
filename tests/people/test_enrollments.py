"""C11 and C12, and the contract module both are read through.

L1 -- expectation is read through `app/services/people/attendance_pattern.py`, never
re-derived. The last test in this file is what keeps a second implementation from
appearing: the roster (W3) and the billing run (W4) both call that module, and a second
answer here is how they start disagreeing about which children were expected.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.models.people import Enrollment
from app.services.people.enrollments import EnrollmentService
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.students import StudentService
from sqlalchemy import select
from tests.people.conftest import T0, TODAY, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)
WEDNESDAY = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)


def _student(session):
    tag = uuid.uuid4().hex[:8]
    return StudentService.create(
        session,
        first_name=f"דנה{tag}",
        last_name=f"כהן{tag}",
        birthdate=None,
        guardian_first_name=f"יעל{tag}",
        guardian_last_name=f"כהן{tag}",
        guardian_email=f"g-{tag}@example.invalid",
        guardian_phone=None,
        at=T0,
        actor_person_id=None,
    ).student


@pytest.fixture
def a_student_id(tenant_session):
    student = _student(tenant_session)
    tenant_session.commit()
    return student.id


@pytest.fixture
def twice_weekly(fake_schedule, studio, a_group, a_training_year):
    """A group that trains Sunday and Wednesday, observed through the seam."""
    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=moment,
        )
        for moment in (SUNDAY, WEDNESDAY)
    ]
    return fake_schedule


# -- C12: the pattern ----------------------------------------------------------


def test_an_enrollment_with_no_pattern_means_every_session(
    tenant_session, a_student_id, a_group, twice_weekly
):
    """C12 -- 'NULL means all of them, which is the default and the common case.'"""
    row = EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    assert row.attends_weekdays is None


def test_a_pattern_naming_a_day_the_group_does_not_train_is_refused(
    tenant_session, a_student_id, a_group, twice_weekly
):
    """The group trains Sunday and Wednesday. Tuesday is not on offer, and storing it
    would put a child on a roster for a session that does not exist -- C12's original bug
    coming back through the form."""
    with pytest.raises(RefusedError):
        EnrollmentService.create(
            tenant_session,
            student_id=a_student_id,
            group_id=a_group,
            started_on=TODAY,
            attends_weekdays=[2],
            at=T0,
            actor_person_id=None,
            schedule=twice_weekly,
        )


def test_a_subset_of_the_groups_days_is_stored(tenant_session, a_student_id, a_group, twice_weekly):
    row = EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=[0],
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    assert row.attends_weekdays == [0]


def test_an_empty_pattern_is_refused_before_it_reaches_the_check_constraint(
    tenant_session, a_student_id, a_group, twice_weekly
):
    """The table's CHECK rejects an empty array; the service rejects it first so the
    caller gets a 422 naming the field rather than a 500 from an IntegrityError. An
    enrollment expecting nothing is a student who left, not a student who enrolled."""
    with pytest.raises(RefusedError):
        EnrollmentService.create(
            tenant_session,
            student_id=a_student_id,
            group_id=a_group,
            started_on=TODAY,
            attends_weekdays=[],
            at=T0,
            actor_person_id=None,
            schedule=twice_weekly,
        )


# -- C11: several enrollments, one price ---------------------------------------


def test_a_student_may_hold_several_live_enrollments(
    tenant_session, a_student_id, a_group, a_second_group, studio, a_training_year, fake_schedule
):
    """C11 and L3 -- '§5.4's "each child is enrolled in one group" was wrong and is
    corrected. Do not add a one-group constraint anywhere.'"""
    for group in (a_group, a_second_group):
        fake_schedule.sessions[group] = [
            make_session(
                studio_id=studio.id,
                group_id=group,
                training_year_id=a_training_year,
                starts_at=SUNDAY,
            )
        ]
        EnrollmentService.create(
            tenant_session,
            student_id=a_student_id,
            group_id=group,
            started_on=TODAY,
            attends_weekdays=None,
            at=T0,
            actor_person_id=None,
            schedule=fake_schedule,
        )
    tenant_session.commit()

    live = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == a_student_id)
    ).scalars()
    assert len(list(live)) == 2


def test_a_second_live_enrollment_in_the_same_group_is_a_conflict(
    tenant_session, a_student_id, a_group, twice_weekly
):
    """`uq_enrollment_live`. A duplicate here bills them twice -- caught in the service so
    the manager reads a message rather than a database error."""
    EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    with pytest.raises(ConflictError):
        EnrollmentService.create(
            tenant_session,
            student_id=a_student_id,
            group_id=a_group,
            started_on=TODAY,
            attends_weekdays=None,
            at=T0,
            actor_person_id=None,
            schedule=twice_weekly,
        )


def test_re_enrolling_after_leaving_a_group_is_allowed(
    tenant_session, a_student_id, a_group, twice_weekly
):
    """The unique index is partial on `ended_on IS NULL`. A child who left the beginners
    group in October and came back in March is two rows, and that history is the point."""
    first = EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=date(2026, 9, 1),
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    EnrollmentService.update(
        tenant_session,
        enrollment_id=first.id,
        status="ended",
        ended_on=date(2026, 10, 31),
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    again = EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=date(2027, 3, 1),
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    assert again.id != first.id


def test_the_enrollment_model_has_no_price_column_and_this_test_says_why():
    """C11 and L2. A `price_plan_id` here is what billed a child in two groups twice a
    month, at two different prices, silently and forever. The price is on the STUDENT."""
    forbidden = {"price_plan_id", "price", "amount_agorot", "monthly_amount_agorot"}
    assert forbidden.isdisjoint(Enrollment.__table__.columns.keys())


def test_the_out_schema_has_no_price_either():
    from app.schemas.people import EnrollmentOut

    forbidden = {"price_plan_id", "price", "amount_agorot"}
    assert forbidden.isdisjoint(EnrollmentOut.model_fields)


# -- the seam ------------------------------------------------------------------


def test_weekday_options_come_from_the_schedule_seam(tenant_session, a_group, twice_weekly):
    """L5 -- the checkboxes are the days the group actually trains, observed through
    `materialize_sessions`."""
    options = EnrollmentService.weekday_options(
        tenant_session, group_id=a_group, since=TODAY, schedule=twice_weekly
    )
    assert options.training_weekdays == [0, 3]


def test_weekday_options_for_a_group_with_no_schedule_is_empty_not_an_error(
    tenant_session, a_group, fake_schedule
):
    """An empty list is the honest answer, and the form renders 'this group has no
    schedule yet' rather than an unexplained empty row."""
    options = EnrollmentService.weekday_options(
        tenant_session, group_id=a_group, since=TODAY, schedule=fake_schedule
    )
    assert options.training_weekdays == []


def test_weekday_options_for_an_unknown_group_is_not_found(tenant_session, fake_schedule):
    with pytest.raises(NotFoundError):
        EnrollmentService.weekday_options(
            tenant_session, group_id=uuid.uuid4(), since=TODAY, schedule=fake_schedule
        )


def test_weekly_volume_is_read_through_the_contract_module(
    tenant_session, a_student_id, a_group, a_second_group, studio, a_training_year, fake_schedule
):
    """C11's number -- 'about 300 for twice a week, about 500 for daily' -- and L1: read
    through `attendance_pattern.weekly_volume`, never counted here.

    The C11 case exactly: one day in each of two groups is twice a week, because volume is
    sessions per week and not distinct days.
    """
    for group in (a_group, a_second_group):
        fake_schedule.sessions[group] = [
            make_session(
                studio_id=studio.id,
                group_id=group,
                training_year_id=a_training_year,
                starts_at=SUNDAY,
            )
        ]
        EnrollmentService.create(
            tenant_session,
            student_id=a_student_id,
            group_id=group,
            started_on=TODAY,
            attends_weekdays=None,
            at=T0,
            actor_person_id=None,
            schedule=fake_schedule,
        )
    tenant_session.commit()

    assert (
        EnrollmentService.weekly_volume_for_student(
            tenant_session, student_id=a_student_id, since=TODAY, schedule=fake_schedule
        )
        == 2
    )


def test_a_student_with_no_enrollments_trains_nothing(tenant_session, a_student_id, fake_schedule):
    """§5.4a's leads and trials have none, which is exactly what makes the billing run
    skip them with no special-casing."""
    assert (
        EnrollmentService.weekly_volume_for_student(
            tenant_session, student_id=a_student_id, since=TODAY, schedule=fake_schedule
        )
        == 0
    )


def test_there_is_exactly_one_implementation_of_expectation_in_the_lane():
    """L1, mechanically. `expected_weekdays` is the contract module's, and a second
    definition anywhere under app/services/people/ is a second answer -- which is how the
    roster and the bill start disagreeing about which children were expected."""
    import ast
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "app/services/people"
    definitions = []
    for path in sorted(root.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name in {
                "expected_weekdays",
                "is_expected",
                "weekly_volume",
            }:
                definitions.append(f"{path.name}:{node.name}")
    assert sorted(definitions) == [
        "attendance_pattern.py:expected_weekdays",
        "attendance_pattern.py:is_expected",
        "attendance_pattern.py:weekly_volume",
    ]


def test_the_contract_module_is_untouched_by_this_lane():
    """L1 -- `attendance_pattern.py` is CONTRACT code W3's roster and W4's billing run both
    read. This lane extends the package around it and never edits it."""
    import subprocess
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    changed = subprocess.run(
        ["git", "diff", "--name-only", "f499a8f", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
    ).stdout
    assert "app/services/people/attendance_pattern.py" not in changed


# -- the router ----------------------------------------------------------------


def test_a_coach_may_not_create_an_enrollment(client, as_lead_coach, a_group):
    """§3.2 -- enrolment is a manager decision (L6)."""
    response = client.post(
        "/api/v1/enrollments",
        json={
            "student_id": str(uuid.uuid4()),
            "group_id": str(a_group),
            "started_on": "2026-09-01",
        },
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 403


def test_a_coach_may_read_the_weekday_options():
    """Staff `9c`'s מעבר כיתה is drawn as a lead-coach action, so the read is
    coach-reachable and therefore tagged -- and `EnrollmentWeekdayOptionsOut` carries no
    financial field, which is what makes the tag safe to give."""
    from app.main import app

    tags = app.openapi()["paths"]["/api/v1/enrollments/weekday-options"]["get"]["tags"]
    assert "coach" in tags


def test_the_price_plan_route_is_manager_only(client, as_manager, as_lead_coach):
    """C11 -- the price is on the STUDENT, and `weekly_volume` is §5.10's suggestion
    beside the plan. Never coach-reachable: invariant 3's detector reads `price_plan_id`
    as a financial field."""
    from app.main import app

    tag_list = app.openapi()["paths"]["/api/v1/students/{student_id}/price-plan"]["get"]["tags"]
    assert "coach" not in tag_list

    student = _student_via_api(client, as_manager)
    assert (
        client.get(
            f"/api/v1/students/{student}/price-plan", headers=as_lead_coach.headers
        ).status_code
        == 403
    )
    body = client.get(f"/api/v1/students/{student}/price-plan", headers=as_manager.headers).json()
    assert body["price_plan_id"] is None
    assert body["weekly_volume"] == 0


def _student_via_api(client, caller) -> str:
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


# -- 9c: the group move (feature pass 2026-08-27) ------------------------------
def test_a_move_ends_the_old_enrollment_and_opens_one_in_the_target_group(
    tenant_session, a_student_id, a_group, a_second_group, twice_weekly
):
    """End-plus-create in one decision, never an UPDATE of group_id: §5.14's reports read
    where the student trained from enrollment history, and a silently regrouped row would
    rewrite the year."""
    old = EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=[0],
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    moved = EnrollmentService.move(
        tenant_session,
        enrollment_id=old.id,
        group_id=a_second_group,
        moved_on=TODAY,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert old.status == "ended"
    assert old.ended_on == TODAY
    assert moved.group_id == a_second_group
    assert moved.status == "active"
    assert moved.started_on == TODAY
    # C12: the pattern names the OLD group's days and does not carry over.
    assert moved.attends_weekdays is None


def test_a_move_into_the_same_group_is_refused(tenant_session, a_student_id, a_group, twice_weekly):
    row = EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    with pytest.raises(RefusedError):
        EnrollmentService.move(
            tenant_session,
            enrollment_id=row.id,
            group_id=a_group,
            moved_on=TODAY,
            at=T0,
            actor_person_id=None,
            schedule=twice_weekly,
        )


def test_a_move_of_an_ended_enrollment_is_refused(
    tenant_session, a_student_id, a_group, a_second_group, twice_weekly
):
    row = EnrollmentService.create(
        tenant_session,
        student_id=a_student_id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    EnrollmentService.update(
        tenant_session,
        enrollment_id=row.id,
        status="ended",
        ended_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    with pytest.raises(RefusedError):
        EnrollmentService.move(
            tenant_session,
            enrollment_id=row.id,
            group_id=a_second_group,
            moved_on=TODAY,
            at=T0,
            actor_person_id=None,
            schedule=twice_weekly,
        )
