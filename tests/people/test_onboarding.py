"""§5.4b -- the onboarding link (docs/onboarding-link-spec.md).

Service-level for the one-transaction registration (through the FakeSchedule seam, like
every schedule-adjacent people test), API-level for the token lifecycle and the doors'
auth stories. The invariant exception is pinned by construction: everything a submission
creates belongs to the submitting parent, and nothing here touches an existing family.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from app.models.billing import Charge, PricePlan
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.services.people.errors import DuplicateStudentError, NotFoundError, RefusedError
from app.services.people.onboarding import OnboardingService
from sqlalchemy import func, select
from tests.conftest import sign_in
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


def test_revoked_and_unknown_tokens_are_indistinguishable(tenant_session, studio):
    """No oracle: 'never existed' and 'revoked' answer identically.

    Expiry left this list on 2026-08-31 — a link that no longer expires cannot be the
    third case. Revocation is the whole answer to a leaked link now, which is what the
    spec always said it was ("the answer to a leaked link is a button").
    """
    _, token = OnboardingService.regenerate(tenant_session, studio.id, actor_person_id=None, at=T0)
    OnboardingService.revoke(tenant_session, actor_person_id=None, at=T0)
    with pytest.raises(NotFoundError):
        OnboardingService.resolve(tenant_session, token=token, at=T0)
    with pytest.raises(NotFoundError):
        OnboardingService.resolve(tenant_session, token="never-existed", at=T0)


def test_a_link_does_not_expire(tenant_session, studio):
    """Owner decision 2026-08-31: one permanent link the club posts once.

    The 7-day TTL cost a repost for every family joining mid-season, and each
    regeneration silently killed the link already sitting in the club's WhatsApp groups.
    Revocation — instant, and unchanged — is what answers a leak.
    """
    row, token = OnboardingService.regenerate(
        tenant_session, studio.id, actor_person_id=None, at=T0
    )
    assert row.expires_at is None
    assert OnboardingService.resolve(tenant_session, token=token, at=T0 + timedelta(days=400))


def test_the_live_token_is_readable_so_the_card_can_always_offer_copy(tenant_session, studio):
    """The card draws a permanent העתקה button (onboarding-link-spec, "Where the button
    lives"), which a hash-only row could never serve — the manager who reloaded the page
    lost the link for good (owner report, 2026-08-31). The token is stored encrypted, so
    a database read still yields nothing: the key lives in Railway secrets, not here.
    """
    _, token = OnboardingService.regenerate(tenant_session, studio.id, actor_person_id=None, at=T0)
    current = OnboardingService.current(tenant_session, at=T0)
    assert current is not None
    assert OnboardingService.token_of(current) == token


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


def test_the_card_reads_the_live_url_back_on_every_load(client, as_manager):
    """The manager who reloads the page must still be able to copy the link (owner
    report, 2026-08-31). Before this, GET returned status only, so the card rendered a
    live link with no way to copy it and no way to recover it."""
    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    assert created.status_code == 201, created.text

    status = client.get("/api/v1/onboarding-link", headers=as_manager.headers).json()
    assert status["active"] is True
    assert status["url"] == created.json()["url"]
    assert status["expires_at"] is None

    # Revoked, and the card has nothing left to offer.
    client.delete("/api/v1/onboarding-link", headers=as_manager.headers)
    after = client.get("/api/v1/onboarding-link", headers=as_manager.headers).json()
    assert after["active"] is False
    assert after["url"] is None


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


# -- the two defects the self-enrolment change created -------------------------
def test_a_trial_parent_using_the_join_link_gets_their_children_created(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """Defect 1. `existing_registration` answers "does this identity already have a Person
    here", and `register` treated that as "this family is already registered". Those are
    different questions, and the difference is exactly a trial family: booking a trial
    creates a Person for the parent, so the club's most natural funnel — try it, like it,
    get sent the link — returned `already_registered: true` and created nothing.
    """
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"trial-{uuid.uuid4().hex[:8]}",
        email="trialparent@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()

    # The Person a trial booking left behind: signed in, no children on the account yet.
    existing = Person(
        studio_id=studio.id,
        auth_identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
    )
    tenant_session.add(existing)
    tenant_session.flush()

    parent, student_ids, charged = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
        phone="050-7654321",
        email="trialparent@example.invalid",
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

    assert parent.id == existing.id, "the parent was duplicated instead of adopted"
    assert len(student_ids) == 1
    assert charged == 1
    assert tenant_session.get(Student, student_ids[0]).status == "active"


def test_a_child_who_matches_an_existing_student_is_refused_and_creates_nothing(
    tenant_session, studio, a_group, twice_weekly, a_live_plan
):
    """Defect 2. The duplicate check ran only on the registration-request detail view,
    whose sole producer was removed — so `+ הוסף ילד` created a SECOND student for a child
    already on the roster: one `trial`, one `active`, both on the register.
    """
    parent = Person(studio_id=studio.id, first_name="שירה", last_name="לוי")
    tenant_session.add(parent)
    tenant_session.flush()
    child = {
        "first_name": "נועה",
        "last_name": "לוי",
        "birthdate": date(2016, 4, 1),
        "group_ids": [a_group],
        "self": False,
    }
    first = OnboardingService.add_child(
        tenant_session,
        studio_id=studio.id,
        parent=parent,
        child=child,
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.flush()
    before = tenant_session.execute(select(func.count(Student.id))).scalar_one()

    with pytest.raises(DuplicateStudentError) as raised:
        OnboardingService.add_child(
            tenant_session,
            studio_id=studio.id,
            parent=parent,
            child=child,
            at=T0,
            schedule=twice_weekly,
        )
    assert raised.value.student_id == first
    assert tenant_session.execute(select(func.count(Student.id))).scalar_one() == before


def test_a_different_birthdate_is_a_different_child(
    tenant_session, studio, a_group, twice_weekly, a_live_plan
):
    """Two children with the same name and different birthdays are two children — §5.4a's
    own rule, and the reason a refusal keyed on the name alone would be wrong."""
    parent = Person(studio_id=studio.id, first_name="שירה", last_name="לוי")
    tenant_session.add(parent)
    tenant_session.flush()
    base = {"first_name": "נועה", "last_name": "לוי", "group_ids": [a_group], "self": False}
    OnboardingService.add_child(
        tenant_session,
        studio_id=studio.id,
        parent=parent,
        child={**base, "birthdate": date(2016, 4, 1)},
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.flush()
    second = OnboardingService.add_child(
        tenant_session,
        studio_id=studio.id,
        parent=parent,
        child={**base, "birthdate": date(2018, 9, 9)},
        at=T0,
        schedule=twice_weekly,
    )
    assert tenant_session.get(Student, second).status == "active"


def test_resubmitting_the_link_adds_the_missing_child_and_skips_the_existing_one(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """'A resubmission of children who are already on the account remains a no-op' — and
    the child who is NOT on it is still created. Refusing the whole submission would make
    the second half of a family unreachable through the club's own link."""
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"resubmit-{uuid.uuid4().hex[:8]}",
        email="resubmit@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()

    common = dict(
        studio_id=studio.id,
        identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
        phone=None,
        email="resubmit@example.invalid",
        at=T0,
        schedule=twice_weekly,
    )
    noa = {
        "first_name": "נועה",
        "last_name": "לוי",
        "birthdate": date(2016, 4, 1),
        "group_ids": [a_group],
        "self": False,
    }
    itay = {
        "first_name": "איתי",
        "last_name": "לוי",
        "birthdate": date(2019, 2, 2),
        "group_ids": [a_group],
        "self": False,
    }
    parent, first_ids, _ = OnboardingService.register(tenant_session, children=[noa], **common)
    tenant_session.flush()

    again_parent, second_ids, _ = OnboardingService.register(
        tenant_session, children=[noa, itay], **common
    )
    assert again_parent.id == parent.id
    assert len(second_ids) == 1, "the child already on the account was created a second time"
    assert second_ids[0] not in first_ids


def test_the_add_a_child_route_names_the_existing_child_for_its_own_guardian(
    client, as_guardian, tenant_session, studio, a_group, monkeypatch
):
    """'offering the parent the existing child instead of a second copy' — a machine-readable
    code, and the id only because this caller is already that child's guardian."""
    from app.routers import students as students_router

    class _TwiceWeekly:
        def materialize_sessions(self, group_id, from_date, to_date):
            return [
                make_session(
                    studio_id=studio.id,
                    group_id=group_id,
                    training_year_id=uuid.uuid4(),
                    starts_at=SUNDAY,
                )
            ]

    monkeypatch.setattr(students_router, "schedule_reader", lambda session: _TwiceWeekly())
    body = {
        "first_name": "נועה",
        "last_name": "לוי",
        "birthdate": "2016-04-01",
        "group_ids": [str(a_group)],
    }
    first = client.post("/api/v1/me/students", headers=as_guardian.headers, json=body)
    assert first.status_code == 201, first.text

    again = client.post("/api/v1/me/students", headers=as_guardian.headers, json=body)
    assert again.status_code == 422, again.text
    detail = again.json()["detail"]
    assert detail["code"] == "duplicate_student"
    assert detail["student_id"] == first.json()["id"]


def test_the_route_does_not_disclose_another_familys_child(
    client, as_guardian, tenant_session, studio, a_group, monkeypatch
):
    """§11.1. The refusal is the same code either way, but naming a student this caller has
    no relationship with would tell them a child of that name trains here."""
    from app.routers import students as students_router

    class _TwiceWeekly:
        def materialize_sessions(self, group_id, from_date, to_date):
            return [
                make_session(
                    studio_id=studio.id,
                    group_id=group_id,
                    training_year_id=uuid.uuid4(),
                    starts_at=SUNDAY,
                )
            ]

    monkeypatch.setattr(students_router, "schedule_reader", lambda session: _TwiceWeekly())
    stranger = Person(studio_id=studio.id, first_name="הורה", last_name="אחר")
    tenant_session.add(stranger)
    tenant_session.flush()
    OnboardingService.add_child(
        tenant_session,
        studio_id=studio.id,
        parent=stranger,
        child={
            "first_name": "יעל",
            "last_name": "כהן",
            "birthdate": date(2015, 3, 3),
            "group_ids": [a_group],
            "self": False,
        },
        at=T0,
        schedule=_TwiceWeekly(),
    )
    tenant_session.commit()

    response = client.post(
        "/api/v1/me/students",
        headers=as_guardian.headers,
        json={
            "first_name": "יעל",
            "last_name": "כהן",
            "birthdate": "2015-03-03",
            "group_ids": [str(a_group)],
        },
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "duplicate_student"
    assert "student_id" not in detail or detail["student_id"] is None


# -- the join link's own session ----------------------------------------------
def test_the_join_link_leaves_the_new_parent_with_an_active_studio(
    client, fake_provider, app_session, studio, a_group, a_live_plan, as_manager, monkeypatch
):
    """The reported defect (2026-08-31): a parent who followed the club's join link
    filled the form, saw "נרשמתם!", and then could reach nothing at all.

    The identity signs in from `/join/<token>` BEFORE it belongs to any studio, so
    `callback`'s "a single membership is activated here" rule activates nothing — null
    on the access token and null on the refresh row. The registration then creates the
    family's first membership and nothing re-mints the session: `refresh` carries the
    row's null forward for ever, so `studio_id_from_request` answers 401 "no active
    studio" on every tenant-scoped route. That is why the done screen's `/me/students`
    read came back empty, and why the app behind כניסה לאפליקציה was dead.
    """
    from app.routers import onboarding as onboarding_router

    class _TwiceWeekly:
        def materialize_sessions(self, group_id, from_date, to_date):
            return [
                make_session(
                    studio_id=studio.id,
                    group_id=group_id,
                    training_year_id=uuid.uuid4(),
                    starts_at=moment,
                )
                for moment in (SUNDAY, SUNDAY + timedelta(days=3))
            ]

    monkeypatch.setattr(onboarding_router, "ScheduleService", lambda session: _TwiceWeekly())

    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    # A stranger, on their own device: the manager's cookie is not theirs.
    client.cookies.clear()
    subject = f"joiner-{uuid.uuid4()}"
    fake_provider.register(code="c-join", subject=subject, email=f"{subject}@example.invalid")
    signed = sign_in(client, code="c-join").json()
    assert signed["active_studio_id"] is None, "precondition: no membership yet, so no studio"
    headers = {"Authorization": f"Bearer {signed['access_token']}"}

    registered = client.post(
        f"/api/v1/onboarding/{token}/register",
        headers=headers,
        json={
            "first_name": "שירה",
            "last_name": "לוי",
            "phone": "050-7654321",
            "children": [{"first_name": "נועה", "last_name": "לוי", "group_ids": [str(a_group)]}],
        },
    )
    assert registered.status_code == 201, registered.text
    assert len(registered.json()["student_ids"]) == 1

    # The app's very next act, on `location.assign('/')` and on any 401 replay.
    rotated = client.post("/api/v1/auth/refresh")
    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["active_studio_id"] == str(studio.id), (
        "the family's only studio must be active, or every screen 401s"
    )

    mine = client.get(
        "/api/v1/me/students",
        headers={"Authorization": f"Bearer {rotated.json()['access_token']}"},
    )
    assert mine.status_code == 200, mine.text
    assert [row["first_name"] for row in mine.json()["items"]] == ["נועה"]
