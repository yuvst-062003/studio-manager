"""§5.4b -- the onboarding link (docs/onboarding-link-spec.md).

Service-level for the one-transaction registration (through the FakeSchedule seam, like
every schedule-adjacent people test), API-level for the token lifecycle and the doors'
auth stories. The invariant exception is pinned by construction: everything a submission
creates belongs to the submitting parent, and nothing here touches an existing family.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from app.models.billing import Charge, PricePlan
from app.models.people import Enrollment, Student
from app.models.person import Guardian
from app.services.people.errors import NotFoundError, RefusedError
from app.services.people.onboarding import OnboardingService
from sqlalchemy import select
from tests.people.conftest import T0, make_session

SUNDAY = T0.replace(hour=14)


@pytest.fixture
def twice_weekly(fake_schedule, studio, a_group, a_training_year):
    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=moment,
        )
        for moment in (SUNDAY, SUNDAY + timedelta(days=3))
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


# -- the link lifecycle --------------------------------------------------------
def test_regenerate_returns_the_token_once_and_stores_only_its_hash(tenant_session, studio):
    row, token = OnboardingService.regenerate(
        tenant_session, studio.id, actor_person_id=None, at=T0
    )
    assert token not in row.token_hash
    assert len(row.token_hash) == 64
    assert OnboardingService.resolve(tenant_session, token=token, at=T0).id == row.id


def test_regenerating_revokes_the_previous_link(tenant_session, studio):
    old, old_token = OnboardingService.regenerate(
        tenant_session, studio.id, actor_person_id=None, at=T0
    )
    OnboardingService.regenerate(tenant_session, studio.id, actor_person_id=None, at=T0)
    assert old.revoked_at is not None
    with pytest.raises(NotFoundError):
        OnboardingService.resolve(tenant_session, token=old_token, at=T0)


def test_expired_revoked_and_unknown_tokens_are_indistinguishable(tenant_session, studio):
    """No oracle: 'never existed', 'expired' and 'revoked' all answer identically."""
    _, token = OnboardingService.regenerate(tenant_session, studio.id, actor_person_id=None, at=T0)
    with pytest.raises(NotFoundError):
        OnboardingService.resolve(tenant_session, token=token, at=T0 + timedelta(days=8))
    with pytest.raises(NotFoundError):
        OnboardingService.resolve(tenant_session, token="never-existed", at=T0)


# -- the registration ----------------------------------------------------------
def test_one_submission_creates_the_whole_family_priced_and_charged(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"onboarding-{uuid.uuid4().hex[:8]}",
        email="parent@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()
    identity = identity_row.id
    parent, student_ids, charged = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity,
        first_name="שירה",
        last_name="לוי",
        phone="050-1234567",
        email="parent@example.invalid",
        children=[
            {
                "first_name": "נועה",
                "last_name": "לוי",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    student = tenant_session.get(Student, student_ids[0])
    assert student.status == "active"
    assert student.source == "onboarding_link"
    assert student.health_status == "missing"
    assert student.price_plan_id == a_live_plan.id

    guardian = tenant_session.execute(
        select(Guardian).where(Guardian.student_id == student.id)
    ).scalar_one()
    assert guardian.person_id == parent.id
    assert guardian.is_primary is True

    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student.id)
    ).scalar_one()
    assert enrollment.group_id == a_group
    assert enrollment.status == "active"
    assert enrollment.attends_weekdays is None

    assert charged == 1
    charge = tenant_session.execute(
        select(Charge).where(Charge.student_id == student.id, Charge.kind == "tuition")
    ).scalar_one()
    assert charge.payer_person_id == parent.id
    assert charge.status == "open"


def test_no_matching_plan_means_no_charge_and_no_guess(
    tenant_session, studio, a_group, twice_weekly
):
    """Spec: 'an invented price is worse than a visible gap.' The student lands unpriced
    on the manager's checklist."""
    _, student_ids, charged = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=None,
        first_name="שירה",
        last_name="לוי",
        phone=None,
        email=None,
        children=[
            {
                "first_name": "נועה",
                "last_name": "לוי",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    assert charged == 0
    assert tenant_session.get(Student, student_ids[0]).price_plan_id is None


def test_an_adult_member_is_one_person_in_both_roles(tenant_session, studio, a_group, twice_weekly):
    """§5.3's 'אני התלמיד' -- the parent Person doubles as the student's person."""
    parent, student_ids, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=None,
        first_name="עידו",
        last_name="בוגר",
        phone=None,
        email=None,
        children=[
            {
                "first_name": "עידו",
                "last_name": "בוגר",
                "birthdate": None,
                "group_ids": [a_group],
                "self": True,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    student = tenant_session.get(Student, student_ids[0])
    assert student.person_id == parent.id
    guardian = tenant_session.execute(
        select(Guardian).where(Guardian.student_id == student.id)
    ).scalar_one()
    assert guardian.person_id == parent.id
    assert guardian.relation == "self"


def test_a_child_with_no_group_is_refused(tenant_session, studio, twice_weekly):
    with pytest.raises(RefusedError):
        OnboardingService.register(
            tenant_session,
            studio_id=studio.id,
            identity_id=None,
            first_name="שירה",
            last_name="לוי",
            phone=None,
            email=None,
            children=[
                {
                    "first_name": "נועה",
                    "last_name": "לוי",
                    "birthdate": None,
                    "group_ids": [],
                    "self": False,
                }
            ],
            at=T0,
            schedule=twice_weekly,
        )


# -- the API doors -------------------------------------------------------------
def test_the_manager_card_regenerates_and_the_public_read_validates(client, as_manager):
    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    assert created.status_code == 201, created.text
    url = created.json()["url"]
    assert "/join/" in url
    token = url.rsplit("/join/", 1)[1]

    info = client.get(f"/api/v1/public/onboarding/{token}")
    assert info.status_code == 200, info.text
    assert info.json()["studio_name"]

    revoked = client.delete("/api/v1/onboarding-link", headers=as_manager.headers)
    assert revoked.status_code == 200
    assert client.get(f"/api/v1/public/onboarding/{token}").status_code == 404


def test_a_coach_sees_no_card_and_a_stranger_no_oracle(client, as_lead_coach):
    assert client.get("/api/v1/onboarding-link", headers=as_lead_coach.headers).status_code == 403
    assert client.get(f"/api/v1/public/onboarding/{uuid.uuid4().hex}").status_code == 404


def test_registration_requires_a_signed_in_identity(client, as_manager):
    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]
    response = client.post(
        f"/api/v1/onboarding/{token}/register",
        json={
            "first_name": "א",
            "last_name": "ב",
            "children": [{"first_name": "ג", "last_name": "ד", "group_ids": [str(uuid.uuid4())]}],
        },
    )
    assert response.status_code == 401
