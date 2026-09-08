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
from app.core.clock import now
from app.models.billing import Charge, PricePlan
from app.models.people import Enrollment, Student, TrialBooking
from app.models.person import Guardian, Person
from app.services.people.errors import DuplicateStudentError, NotFoundError, RefusedError
from app.services.people.onboarding import OnboardingService
from sqlalchemy import func, select
from tests.conftest import sign_in
from tests.people.conftest import T0, make_session

SUNDAY = T0.replace(hour=14)

#: How far past the calendar's own present the fake weeks run. `training_weekdays` looks
#: four weeks ahead (`OBSERVATION_WEEKS`); eight leaves room for a test that starts its
#: window a little later without this becoming load-bearing arithmetic.
_FAKE_WEEKS_AHEAD = 8


@pytest.fixture
def twice_weekly(fake_schedule, studio, a_group, a_training_year):
    """A group that really does train twice a week -- every week, from before T0 until well
    past today.

    **The range is the fix for a test that failed on a date rather than on a change.** This
    used to be exactly two sessions, on T0 and T0+3. Every test that drives the service
    directly passes `at=T0`, so those looked at a four-week window starting 2026-09-02 and
    found them forever. The three tests that go through HTTP do not: the router passes
    `at=now()`, so their window starts on the day the suite runs, and the moment the wall
    clock walked past 2026-09-05 all three began failing with `no group <id>` -- which
    reads like a tenancy or a fixture-scoping bug and is a calendar. They were green on
    2026-09-05 and red on 2026-09-06 with nothing between them.

    So the fixture now means what its name says. A weekly group is generated across a span
    that contains both clocks, and no test has to know which one its code path uses.
    `app.core.clock.now()` and not `datetime.now()`, so a suite run under a shifted clock
    generates the weeks that clock will ask for.
    """
    first = SUNDAY - timedelta(weeks=1)
    last = max(SUNDAY, now().astimezone(UTC).replace(hour=14, minute=0, second=0, microsecond=0))
    last += timedelta(weeks=_FAKE_WEEKS_AHEAD)
    moments = []
    week = first
    while week <= last:
        moments.extend((week, week + timedelta(days=3)))
        week += timedelta(weeks=1)
    fake_schedule.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=moment,
        )
        for moment in moments
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
    parent, student_ids, charged, _ = OnboardingService.register(
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
    _, student_ids, charged, _ = OnboardingService.register(
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
    parent, student_ids, _, _ = OnboardingService.register(
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

    parent, student_ids, charged, _ = OnboardingService.register(
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
    parent, first_ids, _, _ = OnboardingService.register(tenant_session, children=[noa], **common)
    tenant_session.flush()

    again_parent, second_ids, _, _ = OnboardingService.register(
        tenant_session, children=[noa, itay], **common
    )
    assert again_parent.id == parent.id
    assert len(second_ids) == 1, "the child already on the account was created a second time"
    assert second_ids[0] not in first_ids


def test_child_student_ids_names_every_submitted_child_including_duplicates(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """`student_ids` alone cannot answer "which student did submitted child #2 become"
    once any child in the batch is a duplicate -- it only carries what THIS submission
    created. `child_student_ids` carries one id per submitted child, in submission order,
    whether created here or already on the roster, which is what a caller needs to attach
    a payment choice to a child it did not create.
    """
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"child-ids-{uuid.uuid4().hex[:8]}",
        email="child-ids@example.invalid",
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
        email="child-ids@example.invalid",
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
    dor = {
        "first_name": "דור",
        "last_name": "לוי",
        "birthdate": date(2020, 6, 6),
        "group_ids": [a_group],
        "self": False,
    }
    _, first_ids, _, first_child_ids = OnboardingService.register(
        tenant_session, children=[noa, itay], **common
    )
    tenant_session.flush()

    _, second_ids, _, second_child_ids = OnboardingService.register(
        tenant_session, children=[noa, itay, dor], **common
    )

    assert len(second_ids) == 1, "only the third child (Dor) is new"
    assert len(second_child_ids) == 3
    assert second_child_ids[:2] == first_child_ids, (
        "the two duplicate children must still be named, and in submission order"
    )
    assert second_child_ids[2] == second_ids[0], "the new child's id is the same in both lists"


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
    parent_b, ids_b, _, _ = OnboardingService.register(
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
    parent_a, ids_a, _, _ = OnboardingService.register(
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
    parent, first_ids, _, _ = OnboardingService.register(tenant_session, children=[dana], **common)
    tenant_session.commit()

    again_dana = {**dana, "grade": "ד"}
    again_parent, second_ids, _, _ = OnboardingService.register(
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


def test_the_public_read_carries_club_terms_version(client, as_manager):
    """The welcome screen's club-terms card used to show a hand-mirrored frontend
    constant, `CLUB_TERMS_DISPLAY_VERSION`, kept in step with this module's
    `CLUB_TERMS_VERSION` only by whoever remembered to edit both. `OnboardingInfoOut` now
    carries the live number, the same way `logo_url` already does (previous test)."""
    from app.services.health.club_terms import CLUB_TERMS_VERSION

    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    info = client.get(f"/api/v1/public/onboarding/{token}")
    assert info.status_code == 200, info.text
    assert info.json()["club_terms_version"] == CLUB_TERMS_VERSION


# -- task 2: the wizard's group card gets the three facts it was missing ------
def test_the_public_read_carries_the_group_cards_wizard_facts_and_a_real_class_name(
    client, as_manager, a_group, a_class
):
    """Regression test for a hardcoded `class_name=None`: `onboarding_info` has always
    called `LandingService.public_groups`, which has always had the real class name in
    hand, and threw it away at the last line building `OnboardingGroupOut`. The other
    three fields are new -- this group has no coach assigned and no materialized
    schedule, so the honest answer for all three is empty, not absent."""
    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    info = client.get(f"/api/v1/public/onboarding/{token}")
    assert info.status_code == 200, info.text
    group = next(g for g in info.json()["groups"] if g["id"] == str(a_group))
    assert group["class_name"] == "ג'ודו"
    assert group["training_durations_min"] == []
    assert group["coaches"] == []
    assert group["locations"] == []


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
    _, first_ids, _, _ = OnboardingService.register(tenant_session, children=[child], **common)
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
    again_parent, second_ids, _, _ = OnboardingService.register(
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


# -- task 9b §5: a converting trial child is actually billed ------------------
def test_a_converting_trial_child_is_billed_their_first_month(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """The trial booking already created this student -- a trial is never billed, so
    `add_child` (the only caller of `charge_first_month` until now) never runs for them:
    it raises `DuplicateStudentError` before creating anything, and `register` catches
    that and routes the submission through `_sync_enrollments` instead. Before this fix
    that function applied the groups and the plan and raised no charge at all, so every
    family converting through the club's own funnel ended up enrolled, priced, and owing
    nothing -- the payment step had a plan to show and no charge behind it.
    """
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"trial-convert-{uuid.uuid4().hex[:8]}",
        email="trialfamily@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()

    # The family's own Person, already signed in -- exactly what task 9b §1's
    # `accept_invitation` branch hands back for a returning family, and what
    # `existing_registration` adopts here rather than duplicating.
    parent = Person(
        studio_id=studio.id, auth_identity_id=identity_row.id, first_name="שירה", last_name="לוי"
    )
    tenant_session.add(parent)
    tenant_session.flush()

    # The trial child: a Person + a `trial` Student + the guardian link the booking
    # itself would have written (`app/services/people/trials.py`), built directly here
    # rather than through `TrialService` so this test pins ONLY the onboarding half.
    trial_child = Person(studio_id=studio.id, first_name="נועה", last_name="כהן")
    tenant_session.add(trial_child)
    tenant_session.flush()
    trial_student = Student(
        studio_id=studio.id,
        person_id=trial_child.id,
        status="trial",
        source="public_link",
        health_status="trial_signed",
    )
    tenant_session.add(trial_student)
    tenant_session.flush()
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=trial_student.id,
            person_id=parent.id,
            is_primary=True,
            relation="parent",
        )
    )
    tenant_session.commit()

    _, student_ids, charged, child_ids = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
        phone=None,
        email="trialfamily@example.invalid",
        children=[
            {
                "first_name": "נועה",
                "last_name": "כהן",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert student_ids == [], "the trial child already existed -- not a second student"
    assert child_ids == [trial_student.id]
    assert charged == 1, "register()'s own charges_created must count the converting child"

    charge = tenant_session.execute(
        select(Charge).where(Charge.student_id == trial_student.id, Charge.kind == "tuition")
    ).scalar_one()
    assert charge.payer_person_id == parent.id
    assert charge.status == "open", "a real charge, not merely a plan assignment"
    assert tenant_session.get(Student, trial_student.id).price_plan_id == a_live_plan.id


def test_a_converting_trial_child_is_active_and_reaches_the_next_monthly_run(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """A finding beyond the brief that first shipped this fix (commit 34bc278): a
    converting trial child was billed their first month while STAYING at
    `status='trial'`. `BillingRunService`'s monthly run
    (`app/services/billing/run.py::_billable_students`) selects `Student.status ==
    'active' AND Enrollment.status == 'active'`; `charge_first_month` has no such
    filter, which is exactly why the first charge worked at all. Left at `trial`, this
    student would take that one charge and then silently drop out of every run after
    it -- a visible gap (nobody ever billed) turned into an invisible one (billed once,
    looks fine, quietly skipped forever after). Asserted through the RUN itself, not by
    reading the column: the column is a means, the second month's charge is the end.
    """
    from app.models.identity import AuthIdentity
    from app.services.billing.run import BillingRunService

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"trial-convert-run-{uuid.uuid4().hex[:8]}",
        email="trialrun@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()

    parent = Person(
        studio_id=studio.id, auth_identity_id=identity_row.id, first_name="שירה", last_name="לוי"
    )
    tenant_session.add(parent)
    tenant_session.flush()

    trial_child = Person(studio_id=studio.id, first_name="נועה", last_name="כהן")
    tenant_session.add(trial_child)
    tenant_session.flush()
    trial_student = Student(
        studio_id=studio.id,
        person_id=trial_child.id,
        status="trial",
        source="public_link",
        health_status="trial_signed",
    )
    tenant_session.add(trial_student)
    tenant_session.flush()
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=trial_student.id,
            person_id=parent.id,
            is_primary=True,
            relation="parent",
        )
    )
    tenant_session.commit()

    OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
        phone=None,
        email="trialrun@example.invalid",
        children=[
            {
                "first_name": "נועה",
                "last_name": "כהן",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert tenant_session.get(Student, trial_student.id).status == "active"

    # The following period's own run -- the one thing `charge_first_month` alone cannot
    # prove. If the promotion above had not happened, `_billable_students`'s status
    # filter would silently exclude this student and the run would raise nothing.
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=2026, period_month=10, at=datetime(2026, 10, 12, 9, 0, tzinfo=UTC)
    )
    assert run.status == "completed"
    second_charge = tenant_session.execute(
        select(Charge).where(
            Charge.student_id == trial_student.id,
            Charge.kind == "tuition",
            Charge.period_year == 2026,
            Charge.period_month == 10,
        )
    ).scalar_one()
    assert second_charge.status == "open"


def test_a_converting_trial_childs_health_status_is_not_promoted(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """`StudentService.convert`'s own precedent (`app/services/people/students.py`):
    'the trial declaration is not sufficient for enrollment... converting requires the
    full form.' Promoting `health_status` here would switch off the health gate for a
    student who has signed nothing."""
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"trial-health-{uuid.uuid4().hex[:8]}",
        email="trialhealth@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()

    parent = Person(
        studio_id=studio.id, auth_identity_id=identity_row.id, first_name="שירה", last_name="לוי"
    )
    tenant_session.add(parent)
    tenant_session.flush()

    trial_child = Person(studio_id=studio.id, first_name="נועה", last_name="כהן")
    tenant_session.add(trial_child)
    tenant_session.flush()
    trial_student = Student(
        studio_id=studio.id,
        person_id=trial_child.id,
        status="trial",
        source="public_link",
        health_status="trial_signed",
    )
    tenant_session.add(trial_student)
    tenant_session.flush()
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=trial_student.id,
            person_id=parent.id,
            is_primary=True,
            relation="parent",
        )
    )
    tenant_session.commit()

    OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
        phone=None,
        email="trialhealth@example.invalid",
        children=[
            {
                "first_name": "נועה",
                "last_name": "כהן",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert tenant_session.get(Student, trial_student.id).status == "active"
    assert tenant_session.get(Student, trial_student.id).health_status == "trial_signed", (
        "converting must not silently satisfy the health gate"
    )


def _trial_student_with_booking(
    tenant_session, app_session, studio, a_group, *, email: str
) -> tuple[Student, TrialBooking]:
    """A `trial` student plus the open (`outcome='pending'`) booking the trial itself
    would have left -- shared setup for the follow-up-worker tests below, which all
    need the SAME two rows and differ only in what happens to them afterward."""
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"trial-followup-{uuid.uuid4().hex[:8]}",
        email=email,
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()

    parent = Person(
        studio_id=studio.id, auth_identity_id=identity_row.id, first_name="שירה", last_name="לוי"
    )
    tenant_session.add(parent)
    tenant_session.flush()

    trial_child = Person(studio_id=studio.id, first_name="נועה", last_name="כהן")
    tenant_session.add(trial_child)
    tenant_session.flush()
    trial_student = Student(
        studio_id=studio.id,
        person_id=trial_child.id,
        status="trial",
        source="public_link",
        health_status="trial_signed",
    )
    tenant_session.add(trial_student)
    tenant_session.flush()
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=trial_student.id,
            person_id=parent.id,
            is_primary=True,
            relation="parent",
        )
    )
    booking = TrialBooking(
        studio_id=studio.id,
        student_id=trial_student.id,
        group_id=a_group,
        session_id=None,
        booked_at=T0,
        attended=True,
        outcome="pending",
        is_override=False,
    )
    tenant_session.add(booking)
    tenant_session.commit()
    return identity_row, trial_student, booking


def _convert(tenant_session, studio, a_group, twice_weekly, identity_row, email):
    """`register()`'s own conversion call, on the exact child `_trial_student_with_booking`
    just created -- name matched, no student id passed, exactly the shape the real join
    wizard submits."""
    OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
        phone=None,
        email=email,
        children=[
            {
                "first_name": "נועה",
                "last_name": "כהן",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()


def test_a_converting_trial_bookings_outcome_becomes_converted(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """`_sync_enrollments` reuses `StudentService.convert`'s own `_close_open_trials`
    rather than a second copy of it -- `outcome='converted'` is the exact value
    `convert` itself sets, matched rather than invented."""
    email = "trial-outcome@example.invalid"
    identity_row, trial_student, booking = _trial_student_with_booking(
        tenant_session, app_session, studio, a_group, email=email
    )
    _convert(tenant_session, studio, a_group, twice_weekly, identity_row, email)

    assert tenant_session.get(TrialBooking, booking.id).outcome == "converted"


def test_a_converted_trial_gets_no_further_follow_up_from_the_ladder(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, monkeypatch
):
    """The symptom the coordinator named first: a family who has already joined kept
    getting 'איך היה?' on days 1/3/7, because the ladder's own query
    (`TrialBooking.outcome == 'pending'`) never learned the family had converted.
    Asserted through the WORKER, not by reading the column -- the worker is the thing
    that was misbehaving, and a column check alone would not prove it stopped."""
    from app.workers import followups

    email = "trial-ladder@example.invalid"
    identity_row, trial_student, booking = _trial_student_with_booking(
        tenant_session, app_session, studio, a_group, email=email
    )
    _convert(tenant_session, studio, a_group, twice_weekly, identity_row, email)

    sent: list[str] = []
    monkeypatch.setattr(
        followups,
        "_notify",
        lambda person_id, kind, title, body, payload: sent.append(kind) or True,
    )
    # Day 1 is squarely inside the ladder's own window (`FOLLOW_UP_DAYS = (1, 3, 7)`) --
    # the day this exact family used to be asked how their (completed) trial went.
    followups.run_for_studio(tenant_session, at=T0 + timedelta(days=1), tally=followups.Tally())
    assert sent == []


def test_a_converted_trial_is_not_swept_into_lost(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, monkeypatch
):
    """The worse symptom: `_sweep_the_lost` writes off any booking still `pending`
    after `LOST_AFTER_DAYS` -- so a family who registered, paid and is training would
    have been recorded `lost`, with a reason, by a job nobody is watching. §5.4a's own
    funnel report is computed from this column; this is the assertion that matters
    most, and it means nothing without moving the clock past the cutoff."""
    from app.workers import followups

    email = "trial-lost@example.invalid"
    identity_row, trial_student, booking = _trial_student_with_booking(
        tenant_session, app_session, studio, a_group, email=email
    )
    _convert(tenant_session, studio, a_group, twice_weekly, identity_row, email)

    sent: list[str] = []
    monkeypatch.setattr(
        followups,
        "_notify",
        lambda person_id, kind, title, body, payload: sent.append(kind) or True,
    )
    well_past_the_window = T0 + timedelta(days=followups.LOST_AFTER_DAYS + 5)
    followups.run_for_studio(tenant_session, at=well_past_the_window, tally=followups.Tally())
    tenant_session.commit()

    assert tenant_session.get(Student, trial_student.id).status == "active", (
        "a real conversion must never be swept into lost"
    )
    assert tenant_session.get(TrialBooking, booking.id).outcome == "converted"
    assert sent == []


def test_a_converting_lead_with_no_trial_booking_at_all_is_unaffected(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """§5.4a's own graph note: 'lead -> active is legal and deliberate -- the
    manager-added student never books a trial.' `_close_open_trials`'s query matches
    zero rows for a student who never had a booking, and must do nothing rather than
    raise -- this is a stranger's own fresh conversion path, not the trial funnel's."""
    parent = Person(studio_id=studio.id, first_name="שירה", last_name="לוי")
    tenant_session.add(parent)
    tenant_session.flush()
    lead_child = Person(studio_id=studio.id, first_name="איתן", last_name="מזרחי")
    tenant_session.add(lead_child)
    tenant_session.flush()
    lead_student = Student(
        studio_id=studio.id,
        person_id=lead_child.id,
        status="lead",
        source="manager",
        health_status="missing",
    )
    tenant_session.add(lead_student)
    tenant_session.flush()
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=lead_student.id,
            person_id=parent.id,
            is_primary=True,
            relation="parent",
        )
    )
    tenant_session.commit()

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
                "first_name": "איתן",
                "last_name": "מזרחי",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert tenant_session.get(Student, lead_student.id).status == "active"


def test_a_frozen_student_is_not_reactivated_by_a_resubmitted_link(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """A resubmission matches an existing student by name and birthdate alone --
    `frozen -> active` is a LEGAL move in `StudentStatusService`'s own graph, but
    reactivating a frozen student is a manager's decision, never a side effect of a
    link that happens to share a name."""
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"frozen-resubmit-{uuid.uuid4().hex[:8]}",
        email="frozenresubmit@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity_row)
    app_session.commit()

    parent = Person(
        studio_id=studio.id, auth_identity_id=identity_row.id, first_name="שירה", last_name="לוי"
    )
    tenant_session.add(parent)
    tenant_session.flush()

    frozen_child = Person(studio_id=studio.id, first_name="נועה", last_name="כהן")
    tenant_session.add(frozen_child)
    tenant_session.flush()
    frozen_student = Student(
        studio_id=studio.id,
        person_id=frozen_child.id,
        status="frozen",
        source="public_link",
        health_status="missing",
    )
    tenant_session.add(frozen_student)
    tenant_session.flush()
    tenant_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=frozen_student.id,
            person_id=parent.id,
            is_primary=True,
            relation="parent",
        )
    )
    # A trial booking from before the freeze, still open -- must be left exactly as it
    # is, the same reason the status itself must not move: `_close_open_trials` is
    # scoped to a student actually promoted, and this one deliberately is not.
    booking = TrialBooking(
        studio_id=studio.id,
        student_id=frozen_student.id,
        group_id=a_group,
        session_id=None,
        booked_at=T0,
        attended=True,
        outcome="pending",
        is_override=False,
    )
    tenant_session.add(booking)
    tenant_session.commit()

    OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity_row.id,
        first_name="שירה",
        last_name="לוי",
        phone=None,
        email="frozenresubmit@example.invalid",
        children=[
            {
                "first_name": "נועה",
                "last_name": "כהן",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert tenant_session.get(Student, frozen_student.id).status == "frozen"
    assert tenant_session.get(TrialBooking, booking.id).outcome == "pending"


def test_an_already_active_student_is_left_alone_by_the_promotion(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """The promotion is for a genuinely CONVERTING child. A student already `active`
    (this door's own ordinary resubmission case) is left exactly as they are --
    `active -> active` is not even a legal move in `StudentStatusService`'s own graph,
    so the guard here is what keeps a plain resubmission from ever reaching a refused
    transition call."""
    from app.models.identity import AuthIdentity

    identity_row = AuthIdentity(
        provider="google",
        provider_subject=f"already-active-{uuid.uuid4().hex[:8]}",
        email="alreadyactive@example.invalid",
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
        email="alreadyactive@example.invalid",
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
    _, first_ids, _, _ = OnboardingService.register(tenant_session, children=[child], **common)
    tenant_session.commit()
    student_id = first_ids[0]
    assert tenant_session.get(Student, student_id).status == "active"

    # An unrelated, still-open trial booking on this same student (a sibling's trial
    # session logged against the wrong child, or simply a stale row) -- a plain
    # resubmission of an already-active student must not touch it either.
    booking = TrialBooking(
        studio_id=studio.id,
        student_id=student_id,
        group_id=a_group,
        session_id=None,
        booked_at=T0,
        attended=True,
        outcome="pending",
        is_override=False,
    )
    tenant_session.add(booking)
    tenant_session.commit()

    # The same submission again, verbatim -- an ordinary resubmission, not a conversion.
    OnboardingService.register(tenant_session, children=[child], **common)
    tenant_session.commit()

    assert tenant_session.get(Student, student_id).status == "active"
    assert tenant_session.get(TrialBooking, booking.id).outcome == "pending"


def test_a_genuine_resubmission_still_charges_nothing_extra(
    tenant_session, app_session, studio, a_group, a_second_group, twice_weekly, a_live_plan
):
    """The regression the old comment protected against, protected the same way now:
    `charge_first_month`'s own per-period idempotency key -- not `_sync_enrollments`
    skipping the call outright -- is what keeps a resubmission that ADDS a group from
    raising a second bill for a student already charged this period."""
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
        provider_subject=f"resubmit-bill-{uuid.uuid4().hex[:8]}",
        email="resubmit-bill@example.invalid",
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
        email="resubmit-bill@example.invalid",
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
    _, first_ids, first_charged, _ = OnboardingService.register(
        tenant_session, children=[child], **common
    )
    tenant_session.commit()
    assert first_charged == 1
    student_id = first_ids[0]

    # The parent went back and added a second group -- §8 open item 3's own scenario --
    # for the SAME child, in the SAME billing period.
    edited_child = {**child, "group_ids": [a_group, a_second_group]}
    _, second_ids, second_charged, _ = OnboardingService.register(
        tenant_session, children=[edited_child], **common
    )
    tenant_session.commit()

    assert second_ids == [], "still the same child -- no second student"
    assert second_charged == 0, "a resubmission must not raise a second charge"
    tuition_charges = tenant_session.execute(
        select(func.count(Charge.id)).where(
            Charge.student_id == student_id, Charge.kind == "tuition"
        )
    ).scalar_one()
    assert tuition_charges == 1, "exactly the one charge the first submission raised"


def test_an_unpriced_resubmission_still_charges_nothing_and_still_shows_up(
    tenant_session, app_session, studio, a_group, a_second_group, twice_weekly
):
    """No `PricePlan` exists at all in this studio -- `plan_for_volume` returns `None` on
    both submissions, so `_sync_enrollments` must skip the charge exactly as `add_child`
    already skips it, and the student stays on the manager's own unpriced list
    (`GET /billing/unpriced-students`) rather than silently dropping off it because a
    resubmission happened to touch the row."""
    from app.models.identity import AuthIdentity
    from app.services.billing.catalogue import unpriced_students

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
        provider_subject=f"unpriced-resubmit-{uuid.uuid4().hex[:8]}",
        email="unpriced-resubmit@example.invalid",
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
        email="unpriced-resubmit@example.invalid",
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
    _, first_ids, first_charged, _ = OnboardingService.register(
        tenant_session, children=[child], **common
    )
    tenant_session.commit()
    assert first_charged == 0
    student_id = first_ids[0]
    assert tenant_session.get(Student, student_id).price_plan_id is None

    edited_child = {**child, "group_ids": [a_group, a_second_group]}
    _, second_ids, second_charged, _ = OnboardingService.register(
        tenant_session, children=[edited_child], **common
    )
    tenant_session.commit()

    assert second_ids == []
    assert second_charged == 0, "no plan exists anywhere in the studio -- nothing to charge"
    assert tenant_session.get(Student, student_id).price_plan_id is None
    unpriced_ids = {row.student_id for row in unpriced_students(tenant_session, today=T0.date())}
    assert student_id in unpriced_ids, "still visible on the manager's own checklist"


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
    parent, student_ids, _, _ = OnboardingService.register(
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

    _, student_ids, charged, _ = OnboardingService.register(
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


# -- task 4a: the manager review gate, backend half ----------------------------
#
# The wizard's step 2/3/4 already draw an amber badge, a struck-through ₪0 and a promise
# of manager contact for a child whose declaration answers `true` to anything. These
# tests are the backend half: `register`/`add_child` must actually withhold the charge
# and hold the enrollment, per child, in the same one-transaction submission that also
# writes a clean sibling active and charged.
def test_a_flagged_child_is_pending_and_uncharged_while_a_clean_sibling_is_charged(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """One family, one `register` call, two children -- the case that breaks if
    `needs_review` were computed once for the whole submission instead of per child
    (§8.1's own wording via the brief: 'this is the case that breaks if the flag is
    computed once for the whole submission instead of per child')."""
    from app.models.audit import AuditLog
    from app.services.people.enrollments import PENDING_REVIEW_ACTION
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=T0)
    app_session.commit()

    # A `true` boolean answer implies clause 2 (`limited`), not clause 1 -- `verify_clause`
    # refuses a submission that answers yes to a medical question and still confirms "no
    # limitations of any kind". That check is orthogonal to §8.1's review gate; it is just
    # a fact the answers here must also satisfy to reach `add_child` at all.
    flagged_answers = {**_HEALTH_ANSWERS, "asthma": True, "clause_confirmed": "limited"}
    _, _student_ids, charged, child_student_ids = OnboardingService.register(
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
                "health": {
                    "template_id": str(template.id),
                    "answers": flagged_answers,
                    "signature_image_base64": _ONE_PIXEL_PNG_B64,
                },
            },
            {
                "first_name": "איתן",
                "last_name": "לוי",
                "birthdate": None,
                "group_ids": [a_group],
                "self": False,
                "health": {
                    "template_id": str(template.id),
                    "answers": _HEALTH_ANSWERS,
                    "signature_image_base64": _ONE_PIXEL_PNG_B64,
                },
            },
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    flagged_student_id, clean_student_id = child_student_ids
    assert charged == 1  # only the clean sibling

    flagged_enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == flagged_student_id)
    ).scalar_one()
    assert flagged_enrollment.status == "pending"
    flagged_student = tenant_session.get(Student, flagged_student_id)
    # Still priced -- the plan is what the manager's approval will charge.
    assert flagged_student.price_plan_id == a_live_plan.id
    assert (
        tenant_session.execute(
            select(func.count()).select_from(Charge).where(Charge.student_id == flagged_student_id)
        ).scalar_one()
        == 0
    )

    clean_enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == clean_student_id)
    ).scalar_one()
    assert clean_enrollment.status == "active"
    assert (
        tenant_session.execute(
            select(func.count()).select_from(Charge).where(Charge.student_id == clean_student_id)
        ).scalar_one()
        == 1
    )

    # G7 -- a reason CODE and a COUNT, never a question id and never an answer.
    audit_row = tenant_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "enrollment",
            AuditLog.entity_id == flagged_enrollment.id,
            AuditLog.action == PENDING_REVIEW_ACTION,
        )
    ).scalar_one()
    assert audit_row.diff == {"reason": "health_answered_yes", "answers_yes": 1}
    assert set(audit_row.diff) == {"reason", "answers_yes"}


def test_a_yes_to_a_question_the_schema_does_not_mark_flag_still_triggers_the_gate(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """§1's whole reason to exist: `chronic_illness` is a real boolean question in the
    bundled full schema and is NOT one of `FULL_FLAG_QUESTIONS` -- `derive_flags` never
    counts it. A gate built on `derive_flags` would let this child through active and
    charged after the wizard already showed the family ₪0."""
    from app.services.health.flags import derive_flags
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=T0)
    app_session.commit()

    answers = {**_HEALTH_ANSWERS, "chronic_illness": True, "clause_confirmed": "limited"}
    assert "chronic_illness" not in derive_flags(answers, template.schema)

    _, student_ids, charged, _ = OnboardingService.register(
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
                "health": {
                    "template_id": str(template.id),
                    "answers": answers,
                    "signature_image_base64": _ONE_PIXEL_PNG_B64,
                },
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert charged == 0
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_ids[0])
    ).scalar_one()
    assert enrollment.status == "pending"


# -- task 4c: the hold pushes, rather than waiting to be noticed ---------------
#
# Task 4a holds a flagged child pending, uncharged, until a manager decides. Task 4b
# puts the hold in the manager's alert centre. Neither makes anybody look -- these tests
# are the push that does: fired from inside `add_child`'s own `if needs_review:` block,
# same transaction as the pending enrollment and its audit row above.
def _manager(app_session, studio, *, role: str = "manager") -> Person:
    """An owner or a manager, queried directly rather than signed in -- these tests call
    `OnboardingService.register` as a service, never through a router, so there is no
    request for `RoleAssignment` to gate."""
    from app.models.person import RoleAssignment

    person = Person(studio_id=studio.id, first_name="מנהל", last_name=role)
    app_session.add(person)
    app_session.flush()
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=person.id,
            role=role,
            scope_type="studio",
            granted_at=T0,
        )
    )
    app_session.commit()
    return person


def test_a_flagged_child_pushes_exactly_one_notice_per_manager(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """One flagged child, two managers (an owner and a manager) -- one notification each,
    of the new kind, and none for a coach: this is an enrolment and billing state, not a
    medical disclosure. The payload is pinned to exactly the enrollment and student ids
    the alert centre needs to route a tap, for a child with a single group -- so
    `created_enrollments[0]` and "the" enrollment are the same row."""
    from app.models.comms import Notification
    from app.services.comms.kinds import HEALTH_REVIEW_PENDING
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=T0)
    app_session.commit()
    owner = _manager(app_session, studio, role="owner")
    manager = _manager(app_session, studio, role="manager")
    coach = _manager(app_session, studio, role="lead_coach")

    flagged_answers = {**_HEALTH_ANSWERS, "asthma": True, "clause_confirmed": "limited"}
    _parent, _student_ids, charged, child_student_ids = OnboardingService.register(
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
                "health": {
                    "template_id": str(template.id),
                    "answers": flagged_answers,
                    "signature_image_base64": _ONE_PIXEL_PNG_B64,
                },
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert charged == 0
    flagged_student_id = child_student_ids[0]
    flagged_enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == flagged_student_id)
    ).scalar_one()

    rows = (
        tenant_session.execute(
            select(Notification).where(Notification.kind == HEALTH_REVIEW_PENDING)
        )
        .scalars()
        .all()
    )
    assert {row.person_id for row in rows} == {owner.id, manager.id}
    assert coach.id not in {row.person_id for row in rows}
    assert len(rows) == 2

    for row in rows:
        assert row.title == "נדרש אישור מנהל"
        assert row.body == "נועה לוי — הרישום ממתין לאישור מנהל"
        assert row.payload == {
            "enrollment_id": str(flagged_enrollment.id),
            "student_id": str(flagged_student_id),
        }


def test_a_clean_family_pushes_no_review_hold_notice(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """No flagged child, no notice: the push is conditioned on `needs_review` exactly
    like the hold itself is."""
    from app.models.comms import Notification
    from app.services.comms.kinds import HEALTH_REVIEW_PENDING

    _manager(app_session, studio, role="manager")

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
                "first_name": "איתן",
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

    rows = (
        tenant_session.execute(
            select(Notification).where(Notification.kind == HEALTH_REVIEW_PENDING)
        )
        .scalars()
        .all()
    )
    assert rows == []


def test_the_review_hold_notice_carries_no_question_answer_or_flag_name(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan
):
    """G7, tested rather than trusted: the actual title, body and payload keys, not just
    the intent. `answers_yes` -- the one count the audit row above is allowed to carry --
    does not travel here either; the payload contract is exactly two ids."""
    from app.models.comms import Notification
    from app.services.comms.kinds import HEALTH_REVIEW_PENDING
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=T0)
    app_session.commit()
    _manager(app_session, studio, role="manager")

    flagged_answers = {
        **_HEALTH_ANSWERS,
        "asthma": True,
        "chronic_illness": True,
        "clause_confirmed": "limited",
    }
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
                "group_ids": [a_group],
                "self": False,
                "health": {
                    "template_id": str(template.id),
                    "answers": flagged_answers,
                    "signature_image_base64": _ONE_PIXEL_PNG_B64,
                },
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    row = tenant_session.execute(
        select(Notification).where(Notification.kind == HEALTH_REVIEW_PENDING)
    ).scalar_one()

    # Every flag-question id in the bundled schema, every free-text answer, the clause
    # value, and the count itself -- none of it may appear, dressed up as a "helpful"
    # sentence or not.
    banned = {
        "asthma",
        "chronic_illness",
        "allergy",
        "medication",
        "epilepsy",
        "heart",
        "diabetes",
        "injury",
        "clause_confirmed",
        "limited",
        "health_fund",
        "מכבי",
        "answers_yes",
        "בריאות",
    }
    assert set(row.payload) == {"enrollment_id", "student_id"}
    haystack = f"{row.title} {row.body}"
    for term in banned:
        assert term not in haystack


def test_an_enqueue_that_raises_does_not_fail_the_registration(
    tenant_session, app_session, studio, a_group, twice_weekly, a_live_plan, monkeypatch
):
    """A push that cannot be written is a worse-off manager, never a lost registration.
    The family, the student and the pending enrollment this call created must all survive
    the commit that follows -- `NotificationService.enqueue` is monkeypatched to raise
    unconditionally, standing in for a push transport or a database hiccup."""
    from app.services.comms import NotificationService
    from app.services.structure.health_templates import ensure_full_template

    template = ensure_full_template(app_session, studio.id, at=T0)
    app_session.commit()
    _manager(app_session, studio, role="manager")

    def _boom(self, *args, **kwargs):
        raise RuntimeError("push transport exploded")

    monkeypatch.setattr(NotificationService, "enqueue", _boom)

    flagged_answers = {**_HEALTH_ANSWERS, "asthma": True, "clause_confirmed": "limited"}
    parent, _student_ids, charged, child_student_ids = OnboardingService.register(
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
                "health": {
                    "template_id": str(template.id),
                    "answers": flagged_answers,
                    "signature_image_base64": _ONE_PIXEL_PNG_B64,
                },
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    assert charged == 0
    flagged_student_id = child_student_ids[0]
    student = tenant_session.get(Student, flagged_student_id)
    assert student is not None
    enrollment = tenant_session.execute(
        select(Enrollment).where(Enrollment.student_id == flagged_student_id)
    ).scalar_one()
    assert enrollment.status == "pending"
    guardian = tenant_session.execute(
        select(Guardian).where(Guardian.student_id == flagged_student_id)
    ).scalar_one()
    assert guardian.person_id == parent.id


# -- שנת עליה, per PERSON rather than per family ---------------------------------------
def test_the_child_and_the_signer_each_keep_their_own_aliyah_year(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """Owner decision 2026-09-06: aliyah year is asked of the student AND of the guardian,
    optional for both.

    `שנת עליה` used to be the SIGNER's alone -- block 4 of the paper form -- so a child who
    made aliyah in a different year to their parent had that fact recorded against the
    parent and nowhere else. Both rows are asserted here, with different values, because a
    single implementation that wrote one field twice would pass an assertion on either one
    alone.
    """
    from app.models.identity import AuthIdentity

    identity = AuthIdentity(
        provider="google",
        provider_subject=f"aliyah-{uuid.uuid4().hex[:8]}",
        email="aliyah@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity)
    app_session.commit()

    parent, student_ids, _, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity.id,
        first_name="מרינה",
        last_name="לוי",
        phone="050-1234567",
        email="aliyah@example.invalid",
        children=[
            {
                "first_name": "אנה",
                "last_name": "לוי",
                "birthdate": date(2015, 5, 5),
                "group_ids": [a_group],
                "self": False,
                "grade": "ג",
                "national_id": "100000009",
                "aliyah_year": "2014",
            }
        ],
        signer={
            "national_id": "100000025",
            "address": "יפו 1",
            "city": "תל אביב",
            "relation": "mother",
            "aliyah_year": "1998",
        },
        other_parent=None,
        pickup_contacts=[],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    student = tenant_session.get(Student, student_ids[0])
    child_person = tenant_session.get(Person, student.person_id)
    assert child_person.aliyah_year_encrypted == "2014"
    assert tenant_session.get(Person, parent.id).aliyah_year_encrypted == "1998"


def test_an_adult_member_keeps_one_aliyah_year_on_the_one_row_they_are(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """§5.3's adult member is ONE `Person` in both roles, so the student and the signer are
    the same row and the year is asked once. The risk this pins is the opposite of the test
    above: two writes to one row, where whichever ran last silently wins."""
    from app.models.identity import AuthIdentity

    identity = AuthIdentity(
        provider="google",
        provider_subject=f"aliyah-self-{uuid.uuid4().hex[:8]}",
        email="adult@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(identity)
    app_session.commit()

    parent, student_ids, _, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity.id,
        first_name="איגור",
        last_name="פטרוב",
        phone="050-7654321",
        email="adult@example.invalid",
        children=[
            {
                "first_name": "איגור",
                "last_name": "פטרוב",
                "birthdate": date(1996, 2, 2),
                "group_ids": [a_group],
                "self": True,
            }
        ],
        signer={
            "national_id": "100000025",
            "address": "יפו 1",
            "city": "תל אביב",
            "relation": "other",
            "aliyah_year": "1999",
        },
        other_parent=None,
        pickup_contacts=[],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()

    student = tenant_session.get(Student, student_ids[0])
    assert student.person_id == parent.id, "the adult member is one person in both roles"
    assert tenant_session.get(Person, parent.id).aliyah_year_encrypted == "1999"


def _identity(app_session) -> uuid.UUID:
    """An `auth_identity` for a family about to register. Written through `app_session`
    because `register` takes the id, not the row."""
    from app.models.identity import AuthIdentity

    row = AuthIdentity(
        provider="google",
        provider_subject=f"onboarding-{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@example.invalid",
        email_verified=True,
        is_private_relay=False,
        is_developer=False,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


# -- the belt a family declares at registration (owner review, 2026-09-08) ------------
#
# Bug #10 gave the wizard the CLUB's own belt ladder so a family would not register
# against belts the club does not award. The picker shipped, the review card showed the
# answer back -- and `toRegisterPayload` carried no belt field and `OnboardingChildIn` had
# none to receive it, so every child registered through the wizard landed with
# `current_belt_id` NULL. The question was asked, answered, displayed, and dropped.


@pytest.fixture
def a_belt_rank(app_session: Session, studio: Studio, a_class: uuid.UUID) -> uuid.UUID:
    from app.models.belts import BeltRank

    rank = BeltRank(
        studio_id=studio.id,
        class_id=a_class,
        name="חגורה כחולה",
        kyu=None,
        order_index=3,
        color_hex="#0056c5",
    )
    app_session.add(rank)
    app_session.commit()
    return rank.id


def test_a_declared_belt_lands_on_the_student(
    tenant_session, app_session, studio, a_group, twice_weekly, a_belt_rank
):
    identity = _identity(app_session)
    _, student_ids, _, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity,
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
                "belt_rank_id": a_belt_rank,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    assert tenant_session.get(Student, student_ids[0]).current_belt_id == a_belt_rank


def test_a_declared_belt_writes_no_grading_history(
    tenant_session, app_session, studio, a_group, twice_weekly, a_belt_rank
):
    """`student_belt` is THIS club's grading record -- who awarded it, on what date, at
    which exam. A parent saying "she already has a blue belt" is not this club awarding
    one, and a history row would put a grading the club never held on `12d`'s progress
    screen, signed by nobody."""
    from app.models.belts import StudentBelt

    identity = _identity(app_session)
    _, student_ids, _, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity,
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
                "belt_rank_id": a_belt_rank,
            }
        ],
        at=T0,
        schedule=twice_weekly,
    )
    tenant_session.commit()
    assert (
        tenant_session.execute(
            select(StudentBelt).where(StudentBelt.student_id == student_ids[0])
        ).first()
        is None
    )


def test_a_belt_from_another_studio_is_refused(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """The same authority `price_plan_id` gets, and for the same reason: the picker only
    ever offers this club's ladder, but a stale or crafted id must not silently record a
    rank that belongs to somebody else's wall."""
    from app.models.belts import BeltRank
    from app.models.structure import Class
    from app.models.studio import Studio as StudioModel

    other = StudioModel(name="מועדון אחר", slug=f"other-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    other_class = Class(studio_id=other.id, name="ג'ודו", discipline="judo")
    app_session.add(other_class)
    app_session.flush()
    stray = BeltRank(
        studio_id=other.id,
        class_id=other_class.id,
        name="חגורה זרה",
        kyu=None,
        order_index=0,
        color_hex="#000000",
    )
    app_session.add(stray)
    app_session.commit()

    identity = _identity(app_session)
    with pytest.raises(RefusedError):
        OnboardingService.register(
            tenant_session,
            studio_id=studio.id,
            identity_id=identity,
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
                    "belt_rank_id": stray.id,
                }
            ],
            at=T0,
            schedule=twice_weekly,
        )


def test_no_belt_declared_leaves_it_unrecorded(
    tenant_session, app_session, studio, a_group, twice_weekly
):
    """The field is optional and stays optional. 'No belt recorded' is a real answer for a
    beginner, and it must not become a guess."""
    identity = _identity(app_session)
    _, student_ids, _, _ = OnboardingService.register(
        tenant_session,
        studio_id=studio.id,
        identity_id=identity,
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
    tenant_session.commit()
    assert tenant_session.get(Student, student_ids[0]).current_belt_id is None


def _stub_schedule(monkeypatch, studio):
    """A group with a real weekly rhythm.

    `EnrollmentService` refuses a group with no materialized sessions -- it has no weekly
    volume, so a child enrolled in it has no price -- and the fixtures create groups
    without a timetable. Same stub the join-link session test above installs.
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


def test_the_belt_survives_the_router_and_not_only_the_service(
    client, app_session, studio, a_group, a_belt_rank, as_manager, fake_provider, monkeypatch
):
    """The seam, per CLAUDE.md: a field added to an API is not proven by a test that calls
    the service with a hand-built dict. The defect this closes was EXACTLY a missing wire
    -- the wizard collected the belt, the review card showed it, and the payload dropped
    it -- so the thing worth asserting is the whole path, `POST` to column.
    """
    _stub_schedule(monkeypatch, studio)
    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]

    client.cookies.clear()
    subject = f"joiner-{uuid.uuid4()}"
    fake_provider.register(code="c-belt", subject=subject, email=f"{subject}@example.invalid")
    signed = sign_in(client, code="c-belt").json()
    headers = {"Authorization": f"Bearer {signed['access_token']}"}

    registered = client.post(
        f"/api/v1/onboarding/{token}/register",
        headers=headers,
        json={
            "first_name": "שירה",
            "last_name": "לוי",
            "children": [
                {
                    "first_name": "נועה",
                    "last_name": "לוי",
                    "group_ids": [str(a_group)],
                    "belt_rank_id": str(a_belt_rank),
                }
            ],
        },
    )
    assert registered.status_code == 201, registered.text
    student_id = registered.json()["student_ids"][0]
    assert app_session.get(Student, uuid.UUID(student_id)).current_belt_id == a_belt_rank


def test_the_router_refuses_another_studios_belt(
    client, app_session, studio, a_group, as_manager, fake_provider, monkeypatch
):
    """422 and not a silent drop. A stale or crafted id must not quietly leave the child
    with no belt when the family believes they declared one."""
    from app.models.belts import BeltRank
    from app.models.structure import Class
    from app.models.studio import Studio as StudioModel

    other = StudioModel(name="מועדון אחר", slug=f"other-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    other_class = Class(studio_id=other.id, name="ג\'ודו", discipline="judo")
    app_session.add(other_class)
    app_session.flush()
    stray = BeltRank(
        studio_id=other.id,
        class_id=other_class.id,
        name="חגורה זרה",
        kyu=None,
        order_index=0,
        color_hex="#000000",
    )
    app_session.add(stray)
    app_session.commit()

    _stub_schedule(monkeypatch, studio)
    created = client.post("/api/v1/onboarding-link", headers=as_manager.headers)
    token = created.json()["url"].rsplit("/join/", 1)[1]
    client.cookies.clear()
    subject = f"joiner-{uuid.uuid4()}"
    fake_provider.register(code="c-stray", subject=subject, email=f"{subject}@example.invalid")
    signed = sign_in(client, code="c-stray").json()

    refused = client.post(
        f"/api/v1/onboarding/{token}/register",
        headers={"Authorization": f"Bearer {signed['access_token']}"},
        json={
            "first_name": "שירה",
            "last_name": "לוי",
            "children": [
                {
                    "first_name": "נועה",
                    "last_name": "לוי",
                    "group_ids": [str(a_group)],
                    "belt_rank_id": str(stray.id),
                }
            ],
        },
    )
    assert refused.status_code == 422, refused.text
