"""Task 4a's manager review gate, the queue and the clearing.

`OnboardingService.register`/`add_child` (tested in `tests/people/test_onboarding.py`)
is what puts an `Enrollment` into `pending` and writes the audit row this queue reads
back. This file is the other half: `GET /enrollments/pending-review` and
`POST /enrollments/{id}/approve`, both manager-or-owner.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from app.models.billing import Charge, PricePlan
from app.models.people import Enrollment
from app.services.people.enrollments import EnrollmentService
from app.services.people.onboarding import OnboardingService
from app.services.people.students import StudentService
from sqlalchemy import func, select
from tests.people.conftest import T0, TODAY, make_session

#: The smallest valid PNG -- see tests/people/test_onboarding.py's identical constant.
_ONE_PIXEL_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

_HEALTH_ANSWERS = {
    "asthma": False,
    "allergy": False,
    "medication": False,
    "epilepsy": False,
    "heart": False,
    "diabetes": False,
    "injury": False,
    "other": False,
    "health_fund": "מכבי",
    "emergency_contact": "050-0000000",
    "clause_confirmed": "none",
}


@pytest.fixture
def twice_weekly(fake_schedule, studio, a_group, a_training_year):
    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=moment,
        )
        for moment in (T0, T0 + timedelta(days=3))
    ]
    return fake_schedule


@pytest.fixture
def a_live_plan(app_session, studio):
    row = PricePlan(
        studio_id=studio.id,
        name="חודשי",
        sessions_per_week=2,
        monthly_amount_agorot=30_000,
        active_from=T0.date().replace(day=1),
    )
    app_session.add(row)
    app_session.commit()
    return row


def _register_one_child(
    tenant_session,
    app_session,
    studio,
    group_id,
    schedule,
    *,
    flagged: bool,
    phone: str = "050-1234567",
    at: datetime = T0,
):
    """One family, one child, through the real production seam -- so a flagged child's
    `pending` `Enrollment` carries the exact same `PENDING_REVIEW_ACTION` audit row
    `add_child` writes for a real family, rather than one hand-crafted for the test."""
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=at)
    app_session.commit()

    answers = dict(_HEALTH_ANSWERS)
    if flagged:
        answers["asthma"] = True
        answers["clause_confirmed"] = "limited"

    tag = uuid.uuid4().hex[:8]
    result = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=None,
        first_name="שירה",
        last_name="לוי",
        phone=phone,
        email=None,
        children=[
            {
                "first_name": f"נועה{tag}",
                "last_name": "לוי",
                "birthdate": None,
                "group_ids": [group_id],
                "self": False,
                "health": {
                    "template_id": str(template.id),
                    "answers": answers,
                    "signature_image_base64": _ONE_PIXEL_PNG_B64,
                },
            }
        ],
        at=at,
        schedule=schedule,
    )
    tenant_session.commit()
    return result


def _clean_active_student(tenant_session, a_group, twice_weekly):
    """A plain, unflagged, unpriced-by-health student -- no `health` payload at all, so
    `EnrollmentService.create`'s default `status='active'` is exactly what §8.1 must
    leave alone."""
    tag = uuid.uuid4().hex[:8]
    student = StudentService.create(
        tenant_session,
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
    EnrollmentService.create(
        tenant_session,
        student_id=student.id,
        group_id=a_group,
        started_on=TODAY,
        attends_weekdays=None,
        at=T0,
        actor_person_id=None,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    return student.id


# -- the queue -------------------------------------------------------------------
def test_the_queue_lists_a_pending_enrollment_with_student_group_plan_and_count(
    client, tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, as_manager
):
    _, _, _, child_student_ids = _register_one_child(
        tenant_session, app_session, studio, a_group, twice_weekly, flagged=True
    )
    student_id = child_student_ids[0]

    response = client.get("/api/v1/enrollments/pending-review", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    rows = response.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["student_id"] == str(student_id)
    assert row["group_name"] == "מתחילים"
    assert row["plan_name"] == "חודשי"
    assert row["monthly_amount_agorot"] == 30_000
    assert row["answers_yes"] == 1
    assert row["guardian_name"] == "שירה לוי"
    assert row["guardian_phone"] == "050-1234567"
    assert row["started_on"] == T0.date().isoformat()

    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()
    assert row["enrollment_id"] == str(enrollment.id)


def test_the_queue_does_not_list_active_enrollments(
    client, tenant_session, a_group, twice_weekly, as_manager
):
    _clean_active_student(tenant_session, a_group, twice_weekly)
    response = client.get("/api/v1/enrollments/pending-review", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.json() == []


# -- approving ---------------------------------------------------------------------
def test_approving_activates_the_enrollment_and_creates_exactly_one_charge(
    client, tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, as_manager
):
    _, _, _, child_student_ids = _register_one_child(
        tenant_session, app_session, studio, a_group, twice_weekly, flagged=True
    )
    student_id = child_student_ids[0]
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()
    assert enrollment.status == "pending"

    response = client.post(
        f"/api/v1/enrollments/{enrollment.id}/approve", headers=as_manager.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "active"

    refreshed = tenant_session.get(Enrollment, enrollment.id)
    tenant_session.refresh(refreshed)
    assert refreshed.status == "active"

    charge_count = tenant_session.execute(
        select(func.count()).select_from(Charge).where(Charge.student_id == student_id)
    ).scalar_one()
    assert charge_count == 1


def test_the_charge_period_follows_started_on_not_the_approval_date(
    client, tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, as_manager
):
    """The whole point of the decision: prorating from the approval date would charge a
    family for days their child was not allowed to train. `started_on` is T0, in
    September 2026; the approval below happens with the clock shifted well into October,
    and the raised charge must still be September's."""
    _, _, _, child_student_ids = _register_one_child(
        tenant_session, app_session, studio, a_group, twice_weekly, flagged=True, at=T0
    )
    student_id = child_student_ids[0]
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()

    later = T0 + timedelta(days=40)
    assert later.month != T0.month
    response = client.post(
        f"/api/v1/enrollments/{enrollment.id}/approve",
        headers={**as_manager.headers, "X-Dev-Now": later.isoformat()},
    )
    assert response.status_code == 200, response.text

    charge = tenant_session.execute(
        select(Charge).where(Charge.student_id == student_id, Charge.kind == "tuition")
    ).scalar_one()
    assert charge.period_year == T0.year
    assert charge.period_month == T0.month


def test_approving_an_already_active_enrollment_is_refused_with_409(
    client, tenant_session, a_group, twice_weekly, as_manager
):
    student_id = _clean_active_student(tenant_session, a_group, twice_weekly)
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()
    assert enrollment.status == "active"

    response = client.post(
        f"/api/v1/enrollments/{enrollment.id}/approve", headers=as_manager.headers
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "not_pending"


def test_approving_twice_answers_409_the_second_time(
    client, tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, as_manager
):
    _, _, _, child_student_ids = _register_one_child(
        tenant_session, app_session, studio, a_group, twice_weekly, flagged=True
    )
    student_id = child_student_ids[0]
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()

    first = client.post(f"/api/v1/enrollments/{enrollment.id}/approve", headers=as_manager.headers)
    assert first.status_code == 200, first.text
    second = client.post(f"/api/v1/enrollments/{enrollment.id}/approve", headers=as_manager.headers)
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["code"] == "not_pending"


def test_approving_an_unknown_enrollment_is_404(client, as_manager):
    response = client.post(
        f"/api/v1/enrollments/{uuid.uuid4()}/approve", headers=as_manager.headers
    )
    assert response.status_code == 404, response.text


# -- roles ---------------------------------------------------------------------
def test_a_coach_may_not_call_either_route(
    client, tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, as_lead_coach
):
    assert (
        client.get("/api/v1/enrollments/pending-review", headers=as_lead_coach.headers).status_code
        == 403
    )
    _, _, _, child_student_ids = _register_one_child(
        tenant_session, app_session, studio, a_group, twice_weekly, flagged=True
    )
    student_id = child_student_ids[0]
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()
    response = client.post(
        f"/api/v1/enrollments/{enrollment.id}/approve", headers=as_lead_coach.headers
    )
    assert response.status_code == 403


def test_neither_route_is_tagged_coach(client):
    """Invariant 3 checks the field names a coach-tagged route returns, and this shape
    carries money -- `monthly_amount_agorot` on the queue, a raised charge on approve."""
    from app.main import app

    schema = app.openapi()["paths"]
    assert "coach" not in (schema["/api/v1/enrollments/pending-review"]["get"]["tags"] or [])
    assert "coach" not in (
        schema["/api/v1/enrollments/{enrollment_id}/approve"]["post"]["tags"] or []
    )
