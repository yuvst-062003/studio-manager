"""§5.4b -- the onboarding link (docs/onboarding-link-spec.md).

Service-level for the one-transaction registration (through the FakeSchedule seam, like
every schedule-adjacent people test), API-level for the token lifecycle and the doors'
auth stories. The invariant exception is pinned by construction: everything a submission
creates belongs to the submitting parent, and nothing here touches an existing family.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

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


def test_a_resubmitted_same_name_child_never_overwrites_a_different_familys_student(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """duplicate_student() matches by name studio-wide, with no concept of "this
    parent's own kids" -- so when Family A's submission happens to name-collide with
    Family B's real, unrelated child, `_apply_family_details` must not write Family A's
    grade, pickup contacts or other-parent details onto Family B's student just because
    the server correctly reported a duplicate.
    """
    from app.models.identity import AuthIdentity

    identity_b = AuthIdentity(
        provider="google",
        provider_subject=f"family-b-{uuid.uuid4().hex[:8]}",
        email="family-b@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_b)
    app_session.commit()
    yossi = {
        "first_name": "יוסי",
        "last_name": "כהן",
        "birthdate": date(2015, 5, 5),
        "group_ids": [a_group],
        "self": False,
        "grade": "ג",
        "national_id": "100000009",
    }
    parent_b, ids_b, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_b.id,
        first_name="דנה",
        last_name="לוי",
        phone=None,
        email="family-b@example.invalid",
        children=[yossi],
        signer={
            "national_id": "100000025",
            "address": "יפו 1",
            "city": "תל אביב",
            "relation": "mother",
        },
        other_parent=None,
        pickup_contacts=[],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    student_b_id = ids_b[0]

    identity_a = AuthIdentity(
        provider="google",
        provider_subject=f"family-a-{uuid.uuid4().hex[:8]}",
        email="family-a@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_a)
    app_session.commit()
    colliding_yossi = {
        "first_name": "יוסי",
        "last_name": "כהן",
        "birthdate": date(2015, 5, 5),
        "group_ids": [a_group],
        "self": False,
        "grade": "א",
        "national_id": "100000017",
    }
    parent_a, ids_a, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_a.id,
        first_name="מיכל",
        last_name="כהן",
        phone=None,
        email="family-a@example.invalid",
        children=[colliding_yossi],
        signer={
            "national_id": "100000033",
            "address": "הרצל 1",
            "city": "רעננה",
            "relation": "mother",
        },
        other_parent=None,
        pickup_contacts=[{"name": "סבתא", "phone": "0500000000"}],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert ids_a == [], "the server correctly reported a duplicate; nothing new was created"
    assert parent_a.id != parent_b.id

    student_b = tenant_session.get(Student, student_b_id)
    assert student_b.grade == "ג", "Family A's grade must not overwrite Family B's real child"
    guardians = (
        tenant_session.execute(select(Guardian).where(Guardian.student_id == student_b.id))
        .scalars()
        .all()
    )
    assert len(guardians) == 1
    assert guardians[0].person_id == parent_b.id


def test_a_same_family_resubmission_still_writes_its_own_childs_details(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """The original bug's actual scenario: registration hiccups, the parent resubmits
    the same family. The cross-family guard must not turn into a blanket refusal for
    the family's own child.
    """
    from app.models.identity import AuthIdentity

    identity = AuthIdentity(
        provider="google",
        provider_subject=f"same-family-{uuid.uuid4().hex[:8]}",
        email="same-family@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity)
    app_session.commit()

    common = dict(
        studio_id=studio.id,
        identity_id=identity.id,
        first_name="מיכל",
        last_name="כהן",
        phone=None,
        email="same-family@example.invalid",
        signer={
            "national_id": "100000017",
            "address": "הרצל 12",
            "city": "רעננה",
            "relation": "mother",
        },
        other_parent=None,
        pickup_contacts=[],
        at=T0,
        schedule=twice_weekly,
    )
    dana = {
        "first_name": "דנה",
        "last_name": "כהן",
        "birthdate": date(2016, 3, 14),
        "group_ids": [a_group],
        "self": False,
        "grade": "ג",
        "national_id": "100000009",
    }
    parent, first_ids, _ = OnboardingService.register(tenant_session, children=[dana], **common)
    tenant_session.commit()

    again_dana = {**dana, "grade": "ד"}
    again_parent, second_ids, _ = OnboardingService.register(
        tenant_session, children=[again_dana], **common
    )
    tenant_session.commit()

    assert again_parent.id == parent.id
    assert second_ids == [], "no new student -- this is the same child resubmitting"
    student = tenant_session.get(Student, first_ids[0])
    assert student.grade == "ד", "the resubmission must still write this family's own update"


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


# -- the public read carries the studio's own branding (B1 item 4) -------------
def test_the_public_read_carries_slug_and_logo_url(client, as_manager):
    """§6's addition to `OnboardingInfoOut` -- what lets the sign-in wall and the welcome
    screen show the club's own logo (decision 11) before anyone has signed in, reusing
    the existing unauthenticated `GET /public/studios/{slug}/logo` rather than a second
    logo route."""
    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    info = client.get(f"/api/v1/public/onboarding/{token}")
    assert info.status_code == 200, info.text
    body = info.json()
    assert body["slug"], "the studio's own slug, so the caller can be told which club this is"
    # No logo uploaded in this test's studio -- null, not a missing key or a 500.
    assert "logo_url" in body
    assert body["logo_url"] is None


# -- /me/onboarding-status -- §3's one answer to "what is left" (B1 item 5) ----
def test_onboarding_status_is_incomplete_for_consents_at_the_pre_bump_version(
    client, as_guardian, tenant_session
):
    """`POLICY_VERSION` and `CLUB_TERMS_VERSION` were both bumped to 2 today (decision
    24) -- a family who accepted the OLD text holds rows at version 1, and that reads as
    outstanding. Written directly, the way that acceptance actually looked:
    `ConsentService.record` itself refuses anything but the currently published version,
    so a real family in this state could only have gotten there before the bump."""
    from app.models.health import ConsentRecord
    from app.services.health.club_terms import CLUB_TERMS_CONSENT_TYPE

    pre_bump_version = 1
    for consent_type in ("terms", "privacy", CLUB_TERMS_CONSENT_TYPE):
        tenant_session.add(
            ConsentRecord(
                subject_type="person",
                subject_id=as_guardian.person_id,
                consent_type=consent_type,
                version=pre_bump_version,
                granted=True,
                granted_at=T0,
            )
        )
    tenant_session.commit()

    response = client.get("/api/v1/me/onboarding-status", headers=as_guardian.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    steps = {row["key"]: row["complete"] for row in body["steps"]}
    assert steps["agreements"] is False
    assert body["next"] == "agreements"


def test_onboarding_status_next_is_null_when_nothing_is_left(
    client, as_guardian, tenant_session, studio, a_group, twice_weekly
):
    """The other end of §3's rule: 'if nothing is needed it does not open at all.'"""
    from app.models.health import ConsentRecord, HealthDeclaration
    from app.services.health.club_terms import CLUB_TERMS_CONSENT_TYPE, CLUB_TERMS_VERSION
    from app.services.privacy.policy import POLICY_VERSION
    from app.services.structure.health_templates import ensure_full_template

    for consent_type, version in (
        ("terms", POLICY_VERSION),
        ("privacy", POLICY_VERSION),
        (CLUB_TERMS_CONSENT_TYPE, CLUB_TERMS_VERSION),
    ):
        tenant_session.add(
            ConsentRecord(
                subject_type="person",
                subject_id=as_guardian.person_id,
                consent_type=consent_type,
                version=version,
                granted=True,
                granted_at=T0,
            )
        )

    # A real student under this same guardian. No `PricePlan` exists in this studio, so
    # (mirroring `test_no_matching_plan_means_no_charge_and_no_guess` above) registering
    # creates no charge at all -- `payment` reads complete with no further plumbing.
    parent_person = tenant_session.get(Person, as_guardian.person_id)
    student_id = OnboardingService.add_child(
        tenant_session,
        studio_id=studio.id,
        parent=parent_person,
        child={
            "first_name": "ילד",
            "last_name": "בודק",
            "birthdate": None,
            "group_ids": [a_group],
            "self": False,
        },
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.flush()
    student = tenant_session.get(Student, student_id)

    template = ensure_full_template(tenant_session, studio.id, at=T0)
    tenant_session.add(
        HealthDeclaration(
            studio_id=studio.id,
            student_id=student.id,
            template_id=template.id,
            template_version=template.version,
            answers_encrypted={"asthma": False},
            derived_flags={},
            signed_by_person_id=as_guardian.person_id,
            signed_at=T0,
        )
    )
    student.health_status = "signed"
    tenant_session.commit()

    response = client.get("/api/v1/me/onboarding-status", headers=as_guardian.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert all(row["complete"] for row in body["steps"]), body["steps"]
    assert body["next"] is None


def test_onboarding_status_does_not_500_with_no_active_studio(client, fake_provider):
    """F9 -- signed in seconds after OAuth, before ever completing the join wizard's own
    family step: no membership anywhere yet, so the JWT carries no active studio and no
    `person_id` (same precondition `test_the_join_link_leaves_the_new_parent_with_an_active_studio`
    asserts above). The honest answer is 'nothing done yet,' never a crash."""
    subject = f"status-{uuid.uuid4()}"
    fake_provider.register(code="c-status", subject=subject, email=f"{subject}@example.invalid")
    signed = sign_in(client, code="c-status").json()
    assert signed["active_studio_id"] is None, "precondition: no membership yet, so no studio"
    headers = {"Authorization": f"Bearer {signed['access_token']}"}

    response = client.get("/api/v1/me/onboarding-status", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["next"] == "agreements"
    assert all(row["complete"] is False for row in body["steps"]), body["steps"]


# -- B2: one transaction (decision 2) -------------------------------------------
#: The smallest valid PNG -- a finger-drawn signature is a PNG data URL from a canvas,
#: and the sniffing in app/core/storage.py reads the first bytes rather than the header.
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


def test_the_register_endpoint_carries_health_and_club_terms_in_one_call(
    client, fake_provider, app_session, studio, a_group, twice_weekly, a_live_plan, as_manager
):
    """Decision 2: 'the single call carries: consent, club terms, the parent, the
    students, the enrolments, the plans, the first charge, and every health
    declaration.' Before this, a family signed the health form through a SECOND request
    (`POST /students/{id}/health-declaration`) after `register` had already created
    everything else -- this asserts the seam carries it all in the ONE call the wizard's
    step 4 button fires.
    """
    from app.models.health import ConsentRecord, HealthDeclaration
    from app.models.people import Student
    from app.services.health.club_terms import CLUB_TERMS_CONSENT_TYPE, CLUB_TERMS_VERSION
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=T0)
    app_session.commit()

    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    from app.routers import onboarding as onboarding_router

    monkeypatch_target = onboarding_router.ScheduleService
    try:
        onboarding_router.ScheduleService = lambda session: twice_weekly  # type: ignore[assignment]

        client.cookies.clear()
        subject = f"health-in-one-{uuid.uuid4()}"
        fake_provider.register(
            code="c-health-1", subject=subject, email=f"{subject}@example.invalid"
        )
        signed = sign_in(client, code="c-health-1").json()
        headers = {"Authorization": f"Bearer {signed['access_token']}"}

        response = client.post(
            f"/api/v1/onboarding/{token}/register",
            headers=headers,
            json={
                "first_name": "שירה",
                "last_name": "לוי",
                "phone": "050-1234567",
                "club_terms_accepted": True,
                "signer": {
                    "national_id": "100000017",
                    "address": "הרצל 12",
                    "city": "רעננה",
                    "relation": "mother",
                },
                "children": [
                    {
                        "first_name": "נועה",
                        "last_name": "לוי",
                        "birthdate": "2016-04-01",
                        "group_ids": [str(a_group)],
                        "national_id": "100000009",
                        "grade": "ד",
                        "health": {
                            "template_id": str(template.id),
                            "answers": _HEALTH_ANSWERS,
                            "signature_image_base64": _ONE_PIXEL_PNG_B64,
                        },
                    }
                ],
            },
        )
    finally:
        onboarding_router.ScheduleService = monkeypatch_target

    assert response.status_code == 201, response.text
    student_id = uuid.UUID(response.json()["student_ids"][0])

    student = app_session.get(Student, student_id)
    assert student.health_status == "signed", "the declaration carried in the same call must land"

    declaration = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == student_id)
    ).scalar_one()
    assert declaration.template_id == template.id

    parent_id = uuid.UUID(response.json()["person_id"])
    club_terms = app_session.execute(
        select(ConsentRecord).where(
            ConsentRecord.subject_id == parent_id,
            ConsentRecord.consent_type == CLUB_TERMS_CONSENT_TYPE,
        )
    ).scalar_one()
    assert club_terms.version == CLUB_TERMS_VERSION
    assert club_terms.granted is True


# -- F14: קופת חולים is now required, not merely offered -----------------------
def test_the_register_endpoint_refuses_a_declaration_missing_health_fund(
    client, fake_provider, app_session, studio, a_group, twice_weekly, a_live_plan, as_manager
):
    """§4 step 3: 'קופת חולים (now required) + טלפון חירום'. This is the layer that
    actually governs the flag -- `app/services/structure/health_templates.py`'s
    `required: True` only matters because `required_question_ids`
    (`app/services/health/declarations.py`) reads it off the template row `register`
    validates against, at the same seam as the round-trip test above. Fresh studio, so
    `ensure_full_template` seeds it from the live constant rather than a migration-frozen
    row -- see the C3 report for why that distinction matters for a studio that already
    existed before this change.
    """
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=T0)
    app_session.commit()

    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    from app.routers import onboarding as onboarding_router

    monkeypatch_target = onboarding_router.ScheduleService
    try:
        onboarding_router.ScheduleService = lambda session: twice_weekly  # type: ignore[assignment]

        client.cookies.clear()
        subject = f"health-fund-required-{uuid.uuid4()}"
        fake_provider.register(
            code="c-health-fund-1", subject=subject, email=f"{subject}@example.invalid"
        )
        signed = sign_in(client, code="c-health-fund-1").json()
        headers = {"Authorization": f"Bearer {signed['access_token']}"}

        answers_without_health_fund = {
            k: v for k, v in _HEALTH_ANSWERS.items() if k != "health_fund"
        }
        response = client.post(
            f"/api/v1/onboarding/{token}/register",
            headers=headers,
            json={
                "first_name": "שירה",
                "last_name": "לוי",
                "phone": "050-1234567",
                "club_terms_accepted": True,
                "signer": {
                    "national_id": "100000017",
                    "address": "הרצל 12",
                    "city": "רעננה",
                    "relation": "mother",
                },
                "children": [
                    {
                        "first_name": "נועה",
                        "last_name": "לוי",
                        "birthdate": "2016-04-01",
                        "group_ids": [str(a_group)],
                        "national_id": "100000009",
                        "grade": "ד",
                        "health": {
                            "template_id": str(template.id),
                            "answers": answers_without_health_fund,
                            "signature_image_base64": _ONE_PIXEL_PNG_B64,
                        },
                    }
                ],
            },
        )
    finally:
        onboarding_router.ScheduleService = monkeypatch_target

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "answers_incomplete"
    assert "health_fund" in detail["message"]


# -- B2: an edited group/plan on resubmission (§8 open item 3) -----------------
def test_a_resubmission_applies_a_changed_group_rather_than_dropping_it(
    tenant_session, app_session, studio, a_group, a_second_group, twice_weekly, a_live_plan
):
    """§8's open item 3: 'whether a CHANGED name, group or plan is applied needs
    checking before it is promised.' Before this fix, `add_child`'s duplicate branch
    (`register`'s `except DuplicateStudentError`) only carried the household details
    (`_apply_family_details`) onto the existing student -- the submitted `group_ids`
    were read, matched against nothing, and thrown away. A parent going back from the
    done screen, adding a second group and resubmitting saw no group added at all.
    """
    from app.models.identity import AuthIdentity

    twice_weekly.sessions[a_second_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_second_group,
            training_year_id=uuid.uuid4(),
            starts_at=moment,
        )
        for moment in (SUNDAY, SUNDAY + timedelta(days=3))
    ]

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"re-edit-{uuid.uuid4().hex[:8]}",
        email="re-edit@example.invalid",
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
        email="re-edit@example.invalid",
        at=T0,
        schedule=twice_weekly,
    )
    child = {
        "first_name": "נועה",
        "last_name": "לוי",
        "birthdate": date(2016, 4, 1),
        "group_ids": [a_group],
        "self": False,
    }
    _, first_ids, _ = OnboardingService.register(tenant_session, children=[child], **common)
    tenant_session.commit()
    student_id = first_ids[0]

    before = (
        tenant_session.execute(
            select(Enrollment.group_id).where(Enrollment.student_id == student_id)
        )
        .scalars()
        .all()
    )
    assert before == [a_group], "precondition: enrolled in exactly the first group"

    # The same child, name and birthdate unchanged (so it matches as a duplicate), but
    # this time enrolled in BOTH groups -- the parent went back and added a group.
    edited_child = {**child, "group_ids": [a_group, a_second_group]}
    again_parent, second_ids, _ = OnboardingService.register(
        tenant_session, children=[edited_child], **common
    )
    tenant_session.commit()

    assert second_ids == [], "still the same child -- no second student"
    after = set(
        tenant_session.execute(
            select(Enrollment.group_id).where(
                Enrollment.student_id == student_id, Enrollment.status == "active"
            )
        ).scalars()
    )
    assert after == {a_group, a_second_group}, (
        "the resubmission's edited group list must be applied, not dropped"
    )


# -- C2: per-child other_parent/pickup, and each student's own plan (F7, decision 14) --
def test_two_minors_in_one_submission_carry_different_second_parent_and_pickup_details(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """F7: second parent and pickup used to be ONE family-wide pair
    (`_apply_family_details`'s old `has_minor_children` gate), applied to every child in
    the batch. A family with two minors who name different pickup people for each --
    entirely ordinary, a grandmother collects one and an uncle the other -- had the
    second child's answer silently overwritten by the first's. Per-child `other_parent`/
    `pickup_contacts` on each `children` row is what fixes it; this asserts the two
    children actually end up with DIFFERENT records, not just that the request is
    accepted.
    """
    from app.models.people import StudentPickupContact

    dana = {
        "first_name": "דנה",
        "last_name": "כהן",
        "birthdate": date(2016, 3, 14),
        "group_ids": [a_group],
        "self": False,
        "grade": "ג",
        "national_id": "100000009",
        "other_parent": {
            "first_name": "דוד",
            "last_name": "כהן",
            "national_id": "100000041",
            "phone": "0501112222",
        },
        "pickup_contacts": [{"name": "סבתא רותי", "phone": "0503334444"}],
    }
    yossi = {
        "first_name": "יוסי",
        "last_name": "כהן",
        "birthdate": date(2017, 6, 1),
        "group_ids": [a_group],
        "self": False,
        "grade": "ב",
        "national_id": "100000058",
        "other_parent": {
            "first_name": "שרה",
            "last_name": "לוי",
            "national_id": "100000066",
            "phone": "0505556666",
        },
        "pickup_contacts": [{"name": "דוד אבי", "phone": "0507778888"}],
    }
    parent, student_ids, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=None,
        first_name="מיכל",
        last_name="כהן",
        phone=None,
        email=None,
        children=[dana, yossi],
        signer={
            "national_id": "100000017",
            "address": "הרצל 12",
            "city": "רעננה",
            "relation": "mother",
        },
        other_parent=None,
        pickup_contacts=[],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    dana_id, yossi_id = student_ids

    def other_parent_name(student_id: uuid.UUID) -> str | None:
        guardian_rows = (
            tenant_session.execute(
                select(Guardian).where(
                    Guardian.student_id == student_id, Guardian.person_id != parent.id
                )
            )
            .scalars()
            .all()
        )
        assert len(guardian_rows) == 1
        other = tenant_session.get(Person, guardian_rows[0].person_id)
        return other.first_name if other else None

    def pickup_names(student_id: uuid.UUID) -> list[str | None]:
        rows = (
            tenant_session.execute(
                select(StudentPickupContact).where(StudentPickupContact.student_id == student_id)
            )
            .scalars()
            .all()
        )
        return sorted((row.contact_encrypted or {}).get("name") for row in rows)

    assert other_parent_name(dana_id) == "דוד"
    assert other_parent_name(yossi_id) == "שרה"
    assert pickup_names(dana_id) == ["סבתא רותי"]
    assert pickup_names(yossi_id) == ["דוד אבי"]


def test_a_students_own_chosen_plan_is_applied_even_when_a_cheaper_one_also_covers(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """Decision 14 -- the parent picks a plan explicitly; `add_child` must apply THAT
    plan rather than silently falling back to `plan_for_volume`'s own cheapest-covering
    pick, or a parent's deliberate choice (the club's open/premium plan, say) would be
    overridden with no error and no visible reason.
    """
    cheap = PricePlan(
        studio_id=studio.id,
        name="זול",
        sessions_per_week=2,
        monthly_amount_agorot=20_000,
        active_from=T0.date().replace(day=1),
    )
    premium = PricePlan(
        studio_id=studio.id,
        name="פרימיום",
        sessions_per_week=None,
        monthly_amount_agorot=80_000,
        active_from=T0.date().replace(day=1),
    )
    app_session.add_all([cheap, premium])
    app_session.commit()

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
                "price_plan_id": premium.id,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert charged == 1
    student = tenant_session.get(Student, student_ids[0])
    assert student.price_plan_id == premium.id, (
        "the explicit pick must win over the cheaper plan that also covers this child"
    )


def test_a_price_plan_that_does_not_cover_the_chosen_groups_is_refused(
    client, fake_provider, app_session, studio, a_group, a_training_year, fake_schedule, as_manager
):
    """Decision 14 / §6: 'the server refuses a plan that does not cover the chosen
    groups.' The picker only ever OFFERS a covering plan, but that is client-side
    filtering -- CLAUDE.md's own rule is 'refuse rather than accept, when accepting
    creates a dead end', so a submitted `price_plan_id` too small for the groups just
    chosen must 422 through the REAL `/register` call, not merely be caught by a
    hand-built service call a client could route around.

    Scheduled from the REAL clock rather than `twice_weekly`'s `T0`-anchored fixture:
    the register route reads `at=now()`, not the fixed test clock the service-level
    tests pin, so `twice_weekly`'s two fixed dates can straddle "today" and read as one
    weekly session rather than two depending on which real day the suite runs. Three
    distinct, consecutive days from today sidesteps that -- always a volume of 3,
    comfortably above a plan claiming to cover one session a week regardless of when
    this test executes.
    """
    anchor = datetime.now(UTC)
    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=anchor + timedelta(days=offset),
        )
        for offset in (1, 2, 3)
    ]

    too_small = PricePlan(
        studio_id=studio.id,
        name="פעם בשבוע",
        sessions_per_week=1,
        monthly_amount_agorot=15_000,
        active_from=date(2020, 1, 1),
    )
    app_session.add(too_small)
    app_session.commit()

    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    from app.routers import onboarding as onboarding_router

    monkeypatch_target = onboarding_router.ScheduleService
    try:
        onboarding_router.ScheduleService = lambda session: fake_schedule  # type: ignore[assignment]

        client.cookies.clear()
        subject = f"plan-refuse-{uuid.uuid4()}"
        fake_provider.register(code="c-plan-1", subject=subject, email=f"{subject}@example.invalid")
        signed = sign_in(client, code="c-plan-1").json()
        headers = {"Authorization": f"Bearer {signed['access_token']}"}

        response = client.post(
            f"/api/v1/onboarding/{token}/register",
            headers=headers,
            json={
                "first_name": "שירה",
                "last_name": "לוי",
                "signer": {
                    "national_id": "100000017",
                    "address": "הרצל 12",
                    "city": "רעננה",
                    "relation": "mother",
                },
                "children": [
                    {
                        "first_name": "נועה",
                        "last_name": "לוי",
                        "birthdate": "2016-04-01",
                        "group_ids": [str(a_group)],
                        "national_id": "100000009",
                        "grade": "ד",
                        "price_plan_id": str(too_small.id),
                    }
                ],
            },
        )
    finally:
        onboarding_router.ScheduleService = monkeypatch_target

    assert response.status_code == 422, response.text


def test_the_price_plan_list_is_parent_readable_and_narrow(client, as_manager, app_session, studio):
    """§6: 'parent-readable live plan list ... returning only name, price,
    sessions-per-week and nothing else.' Asserts both halves: reachable with no manager
    session at all (just the join token), and the response carries none of
    `PricePlanOut`'s manager-only fields (registration fee, standing-order link) -- and
    excludes a closed plan, which is not one a new family can join.
    """
    live = PricePlan(
        studio_id=studio.id,
        name="חודשי",
        sessions_per_week=2,
        monthly_amount_agorot=30_000,
        registration_fee_agorot=5_000,
        active_from=T0.date().replace(day=1),
        standing_order_link_url="https://pay.upay.co.il/x",
    )
    closed = PricePlan(
        studio_id=studio.id,
        name="ישן",
        sessions_per_week=2,
        monthly_amount_agorot=25_000,
        active_from=T0.date().replace(day=1) - timedelta(days=400),
        active_to=T0.date().replace(day=1) - timedelta(days=1),
    )
    app_session.add_all([live, closed])
    app_session.commit()

    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    response = client.get(f"/api/v1/public/onboarding/{token}/price-plans")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["id"] for item in body["items"]] == [str(live.id)], "a closed plan is excluded"
    assert body["items"][0] == {
        "id": str(live.id),
        "name": "חודשי",
        "monthly_amount_agorot": 30_000,
        "sessions_per_week": 2,
    }


def test_the_price_plan_list_404s_on_an_invalid_token(client):
    response = client.get("/api/v1/public/onboarding/never-existed/price-plans")
    assert response.status_code == 404


# -- wave E, Door D: the panel-level duplicate check (CLAUDE.md's "refuse rather than
# accept, when accepting creates a dead end") ----------------------------------------
def test_duplicate_check_says_yes_for_the_callers_own_child(
    client, as_guardian, tenant_session, studio, a_group, twice_weekly
):
    """The check must fire BEFORE the health declaration and the payment step are ever
    shown, so it has to be its own read -- reusing `add_child`'s refusal would mean
    writing the child first."""
    parent_person = tenant_session.get(Person, as_guardian.person_id)
    OnboardingService.add_child(
        tenant_session,
        studio_id=studio.id,
        parent=parent_person,
        child={
            "first_name": "נועה",
            "last_name": "לוי",
            "birthdate": date(2016, 4, 1),
            "group_ids": [a_group],
        },
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    response = client.get(
        "/api/v1/me/students/duplicate-check",
        params={"first_name": "נועה", "last_name": "לוי", "birthdate": "2016-04-01"},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"duplicate": True}


def test_duplicate_check_says_no_for_a_new_name(client, as_guardian):
    response = client.get(
        "/api/v1/me/students/duplicate-check",
        params={"first_name": "אורי", "last_name": "כהן", "birthdate": "2018-01-01"},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"duplicate": False}


def test_duplicate_check_never_discloses_another_familys_child(
    client, as_guardian, tenant_session, studio, a_group, twice_weekly
):
    """§11.1, the same rule `POST /me/students` already follows for its own duplicate
    refusal: a same-named child belonging to a stranger must read as 'no duplicate of
    YOURS', never leak that a child of that name trains here."""
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
        },
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    response = client.get(
        "/api/v1/me/students/duplicate-check",
        params={"first_name": "יעל", "last_name": "כהן", "birthdate": "2015-03-03"},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"duplicate": False}


# -- wave E, Door D/C: the shared self-service register (F18, F19) -------------------
def test_self_register_writes_the_new_child_with_no_token(
    client, as_guardian, tenant_session, studio, a_group, twice_weekly, a_live_plan, monkeypatch
):
    """§3 Door D -- 'It opens straight into the wizard, at the students step.' Reuses
    `OnboardingService.register` exactly like the join-link door, but resolves the studio
    from the caller's own ACTIVE membership rather than a token -- there is no token on
    this door at all."""
    import app.routers.onboarding as onboarding_router

    monkeypatch.setattr(onboarding_router, "ScheduleService", lambda session: twice_weekly)
    # The parent must already have signer details on file, same as the club's own
    # register() would have written on an earlier door -- this is what lets Door D skip
    # asking for them again (§3: "there is nothing to copy them from" applies only to the
    # CHILD's own ת.ז./birthdate).
    parent_person = tenant_session.get(Person, as_guardian.person_id)
    parent_person.address = "הרצל 1"
    parent_person.city = "רעננה"
    parent_person.national_id_encrypted = b"100000033"
    tenant_session.commit()

    response = client.post(
        "/api/v1/me/students/register",
        headers=as_guardian.headers,
        json={
            "children": [
                {
                    "first_name": "דנה",
                    "last_name": "כהן",
                    "birthdate": "2016-03-14",
                    "group_ids": [str(a_group)],
                    "national_id": "100000058",
                    "grade": "ג",
                }
            ]
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["student_ids"]) == 1
    student = tenant_session.get(Student, uuid.UUID(body["student_ids"][0]))
    assert student.status == "active"
    assert student.price_plan_id == a_live_plan.id
    guardian = tenant_session.execute(
        select(Guardian).where(Guardian.student_id == student.id)
    ).scalar_one()
    assert guardian.person_id == as_guardian.person_id


def test_self_register_requires_an_active_studio(client, fake_provider):
    """No token, no membership -- 401, the same shape every other `/me/*` route answers,
    never a 500 from a missing tenant scope."""
    subject = f"noone-{uuid.uuid4()}"
    fake_provider.register(code="c-noone", subject=subject, email=f"{subject}@example.invalid")
    signed = sign_in(client, code="c-noone").json()
    headers = {"Authorization": f"Bearer {signed['access_token']}"}
    response = client.post(
        "/api/v1/me/students/register",
        headers=headers,
        json={
            "children": [{"first_name": "א", "last_name": "ב", "group_ids": [str(uuid.uuid4())]}]
        },
    )
    assert response.status_code == 401, response.text
