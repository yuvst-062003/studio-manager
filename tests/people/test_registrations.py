"""§5.4(c) and §5.4a's queue. Three rules, all easy to get wrong in the friendly direction.

* L6 -- 'This creates a registration_request with source = parent_app and
  matched_person_id set -- **a request, not an enrollment.**'
* L10 -- the payload is a stranger's data about a minor. It never appears in a list
  response, never in a log, never in an audit diff.
* §5.4 -- approving is where the group is chosen, so `group_id` lives on the DECISION and
  not on the submission.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.models.audit import AuditLog
from app.models.people import Enrollment, RegistrationRequest, Student
from app.models.person import Guardian, Person
from sqlalchemy import select
from tests.people.conftest import FakeSchedule, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)


@pytest.fixture
def trains_sundays(monkeypatch, studio, a_group, a_second_group, a_training_year):
    """The approval creates an enrollment, which validates against the schedule seam."""
    import app.routers.trial_bookings as trial_router

    fake = FakeSchedule()
    for group in (a_group, a_second_group):
        fake.sessions[group] = [
            make_session(
                studio_id=studio.id,
                group_id=group,
                training_year_id=a_training_year,
                starts_at=SUNDAY,
            )
        ]

    monkeypatch.setattr(trial_router, "schedule_reader", lambda _session: fake)
    # The parent's own door enrols now, and it validates against the same seam.
    import app.routers.students as students_router

    monkeypatch.setattr(students_router, "schedule_reader", lambda _session: fake)
    return fake


def _submit(client, guardian_caller, group_id=None, *, first_name=None, last_name=None) -> dict:
    """Seed one pending request, through the SERVICE rather than a route.

    `POST /me/students` used to be this door and now enrols directly (owner decision,
    2026-08-30), so the queue tests below seed the way the remaining producer does. What
    they cover — the payload never leaving, the duplicate warning, approve and reject — is
    the MANAGER's half, and it is still reached by §5.4a's trial funnel.
    """
    from app.core.db import get_engine
    from app.core.tenancy import TenantSession, use_studio
    from app.services.people.registrations import RegistrationService

    tag = uuid.uuid4().hex[:6]
    with (
        use_studio(guardian_caller.studio_id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        row = RegistrationService.submit_from_parent(
            scoped,
            submitter_person_id=guardian_caller.person_id,
            first_name=first_name or f"נועה{tag}",
            last_name=last_name or f"כהן{tag}",
            birthdate=None,
            preferred_group_id=group_id,
            at=datetime(2026, 9, 1, 9, 0, tzinfo=UTC),
        )
        summary = RegistrationService.summarize(scoped, row)
        scoped.commit()
        return {
            "id": str(summary.id),
            "child_display_name": summary.child_display_name,
            "guardian_display_name": summary.guardian_display_name,
        }


# -- the parent's own door: it ENROLS now --------------------------------------
#
# Owner decision, 2026-08-30. `+ הוסף ילד` used to file a request a manager approved, on
# L6's "conversion is always a human decision". But §5.4b's onboarding link — one link sent
# to the whole club by WhatsApp — already let any parent create up to eight active, priced
# children with no manager at all. A gate on the second door while the first stood open
# protected nothing; it only made a parent who forgot a child at signup wait on the office.


def _add(client, guardian_caller, group_ids, **over) -> dict:
    tag = uuid.uuid4().hex[:6]
    payload = {
        "first_name": f"נועה{tag}",
        "last_name": f"כהן{tag}",
        "birthdate": "2020-03-04",
        "group_ids": [str(g) for g in group_ids],
        **over,
    }
    return client.post("/api/v1/me/students", json=payload, headers=guardian_caller.headers)


def test_a_parent_adding_a_child_enrols_them(
    client, app_session, as_guardian, a_group, trains_sundays
):
    """The same outcome the join link produces: an active student, enrolled, on this
    parent's account — no request, and nobody to wait for."""
    response = _add(client, as_guardian, [a_group])
    assert response.status_code == 201, response.text
    student_id = uuid.UUID(response.json()["id"])

    student = app_session.get(Student, student_id)
    assert student.status == "active"
    assert app_session.execute(
        select(Enrollment).where(
            Enrollment.student_id == student_id, Enrollment.group_id == a_group
        )
    ).scalar_one_or_none()
    # On THIS parent's account — L9, one account, more children.
    assert app_session.execute(
        select(Guardian).where(
            Guardian.student_id == student_id, Guardian.person_id == as_guardian.person_id
        )
    ).scalar_one_or_none()
    # And no request was filed for anyone to approve.
    assert (
        app_session.execute(
            select(RegistrationRequest).where(
                RegistrationRequest.matched_person_id == as_guardian.person_id
            )
        ).first()
        is None
    )


def test_an_invite_only_group_is_not_joinable_and_does_not_admit_it(
    client, app_session, as_guardian, a_group, trains_sundays
):
    """**The check neither door had.**

    `is_invite_only` is the Girls Team's mechanism, and it exists so the product never has
    to store gender about a minor. The join FORM hides such groups, but the write validated
    only that a group had training days — so the rule was an unpublished id rather than a
    check. Not-found and never forbidden: a 403 would confirm the group exists, which is
    the one fact the flag is keeping.
    """
    from app.models.structure import Group

    app_session.get(Group, a_group).is_invite_only = True
    app_session.commit()

    response = _add(client, as_guardian, [a_group])
    assert response.status_code == 404, response.text
    assert response.json()["detail"]["code"] == "not_found"
    assert (
        app_session.execute(
            select(Student).where(
                Student.id.in_(
                    select(Guardian.student_id).where(Guardian.person_id == as_guardian.person_id)
                )
            )
        ).first()
        is None
    )


def test_a_child_needs_a_group_to_be_priced_by(client, as_guardian):
    """The price comes from weekly volume, so a child with no group has no price and no
    charge. Refused at the schema rather than created unpriced."""
    response = client.post(
        "/api/v1/me/students",
        json={"first_name": "נועה", "last_name": "כהן", "group_ids": []},
        headers=as_guardian.headers,
    )
    assert response.status_code == 422, response.text


def test_the_child_never_reaches_the_logs(client, as_guardian, a_group, caplog, trains_sundays):
    """G7, L10 and §11.1 — unchanged by the policy, and checked against the bytes that
    actually come out."""
    tag = uuid.uuid4().hex[:6]
    with caplog.at_level("DEBUG"):
        _add(client, as_guardian, [a_group], first_name=f"סודי{tag}")
    assert f"סודי{tag}" not in caplog.text


def test_the_managers_are_told_a_child_arrived(
    client, app_session, as_guardian, as_manager, a_group, trains_sundays
):
    """The signal the approval queue used to carry. Removing the manager from the PATH must
    not remove them from the KNOWING — otherwise a club learns about new children by
    noticing them on the mat."""
    from app.models.comms import Notification

    _add(client, as_guardian, [a_group])
    note = (
        app_session.execute(
            select(Notification).where(
                Notification.person_id == as_manager.person_id,
                Notification.kind == "people.child_added",
            )
        )
        .scalars()
        .first()
    )
    assert note is not None
    # Names only: §11 keeps health and money out of a notification body.
    assert "₪" not in note.body


# -- the queue -----------------------------------------------------------------


def test_the_queue_never_returns_the_encrypted_payload(client, as_guardian, as_manager, a_group):
    """L10 and `RegistrationRequestOut`'s docstring: 'A list endpoint that decrypted every
    row would defeat the encryption for the cost of one page load.'"""
    _submit(client, as_guardian, a_group)
    body = client.get("/api/v1/registration-requests", headers=as_manager.headers).json()
    assert body["items"]
    serialized = str(body)
    assert "payload" not in serialized
    assert "birthdate" not in serialized


def test_only_a_manager_sees_the_queue(client, as_lead_coach):
    """§3.2 -- 'Approve registration requests' is owner and manager only."""
    assert (
        client.get("/api/v1/registration-requests", headers=as_lead_coach.headers).status_code
        == 403
    )


def test_reading_one_request_in_full_is_audit_logged_as_sensitive(
    client, app_session, as_guardian, as_manager, a_group
):
    """§11.2 logs 'every note read on a student', and this is a stranger's submission about
    a minor. The summary is free; the full read is recorded."""
    body = _submit(client, as_guardian, a_group)
    read = client.get(f"/api/v1/registration-requests/{body['id']}", headers=as_manager.headers)
    assert read.status_code == 200

    entry = app_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == uuid.UUID(body["id"]),
            AuditLog.action == "registration_request.read",
        )
    ).scalar_one()
    assert entry.is_sensitive is True
    # G7 -- the diff names what was read, never what it said.
    assert "birthdate" not in str(entry.diff)


def test_the_queue_shows_a_duplicate_child_warning(
    client, app_session, studio, as_guardian, as_manager, a_group
):
    """§5.4a -- 'If a submitted child's name and birthdate closely match an existing
    student, the manager sees a warning and can merge into the existing student rather than
    creating a second one.' A warning, never an automatic merge."""
    tag = uuid.uuid4().hex[:6]
    person = Person(
        studio_id=studio.id,
        first_name=f"נועה{tag}",
        last_name=f"כהן{tag}",
        birthdate=datetime(2020, 3, 4).date(),
    )
    app_session.add(person)
    app_session.flush()
    app_session.add(Student(studio_id=studio.id, person_id=person.id, status="active"))
    app_session.commit()

    submitted = _submit(
        client, as_guardian, a_group, first_name=f"נועה{tag}", last_name=f"כהן{tag}"
    )
    detail = client.get(
        f"/api/v1/registration-requests/{submitted['id']}", headers=as_manager.headers
    ).json()
    assert detail["possible_duplicate_students"]


def test_a_genuinely_new_child_raises_no_warning(client, as_guardian, as_manager, a_group):
    """The control. A detector that warned on everything would be a warning nobody reads."""
    body = _submit(client, as_guardian, a_group)
    detail = client.get(
        f"/api/v1/registration-requests/{body['id']}", headers=as_manager.headers
    ).json()
    assert detail["possible_duplicate_students"] == []


# -- the decision --------------------------------------------------------------


def test_approving_creates_the_student_the_guardian_and_the_enrollment(
    client, app_session, as_guardian, as_manager, a_group, trains_sundays
):
    """§5.4a's approval transaction, minus the two tables W2 does not have."""
    body = _submit(client, as_guardian, a_group)
    approved = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={"group_id": str(a_group)},
        headers=as_manager.headers,
    )
    assert approved.status_code == 200, approved.text
    student_id = uuid.UUID(approved.json()["student_ids"][0])

    student = app_session.get(Student, student_id)
    assert student.status == "active"
    # §5.4a -- HealthDeclaration and consent records are M4's (C3), so the app gate collects
    # the full form. `missing` is the honest state, not an oversight.
    assert student.health_status == "missing"

    guardian = app_session.execute(
        select(Guardian).where(Guardian.student_id == student_id)
    ).scalar_one()
    assert guardian.person_id == as_guardian.person_id
    assert guardian.is_primary is True

    enrollment = app_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()
    assert enrollment.group_id == a_group


def test_approving_uses_the_group_from_the_decision_and_not_from_the_submission(
    client, app_session, as_guardian, as_manager, a_group, a_second_group, trains_sundays
):
    """§5.4 -- 'Approving is where the group is chosen, which is why group_id lives on the
    decision and not on the submission.'"""
    body = _submit(client, as_guardian, a_group)  # the parent asked for a_group
    approved = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={"group_id": str(a_second_group)},  # the manager decided otherwise
        headers=as_manager.headers,
    )
    student_id = uuid.UUID(approved.json()["student_ids"][0])
    enrollment = app_session.execute(
        select(Enrollment).where(Enrollment.student_id == student_id)
    ).scalar_one()
    assert enrollment.group_id == a_second_group


def test_approving_attaches_to_the_matched_parent_and_issues_no_second_invitation(
    client, app_session, as_guardian, as_manager, a_group, trains_sundays
):
    """§5.4a -- 'A matched parent is never duplicated: approval attaches the new children to
    their existing Person... No second invitation, no second account, no second login.'"""
    from app.models.person import Invitation

    body = _submit(client, as_guardian, a_group)
    approved = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={"group_id": str(a_group)},
        headers=as_manager.headers,
    )
    student_id = uuid.UUID(approved.json()["student_ids"][0])
    assert (
        app_session.execute(select(Invitation).where(Invitation.student_id == student_id)).first()
        is None
    )


def test_approving_a_matched_parent_who_carries_no_address_of_their_own(
    client, app_session, as_guardian, as_manager, a_group, trains_sundays
):
    """The matched parent is known by ID, so approval must not go looking for them by email.

    §5.4a's matching rule is that an address is a key only when a signed-in identity
    carries it and the provider verified it — `matching.py`: "person.email alone is
    therefore never a key". A `Person` row's own email is a manager's typing, and it is
    perfectly normal for it to be empty: every §19.3 persona is exactly this shape, with
    the verified address on `auth_identity` and nothing on `person`.

    `approve()` resolved the parent by id and then handed `parent.email` down to
    `StudentService.create`, which matched on it again. With nothing there the second
    lookup found nobody, invented a duplicate parent, and issued them an invitation with
    no recipient — violating `ck_invitation_invitation_has_a_recipient`, so the whole
    approval 500'd. In the demo studio that was every parent-app registration there is.
    """
    from app.models.person import Invitation

    guardian = app_session.get(Person, as_guardian.person_id)
    assert guardian is not None
    # The identity keeps its verified address; the Person row has none. This is the shape
    # `seed_personas` produces, and the one the fixtures happened never to produce.
    guardian.email = None
    guardian.phone = None
    app_session.commit()

    body = _submit(client, as_guardian, a_group)
    approved = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={"group_id": str(a_group)},
        headers=as_manager.headers,
    )

    assert approved.status_code == 200, approved.text
    student_id = uuid.UUID(approved.json()["student_ids"][0])

    # Attached to the parent who asked, not to a copy of them.
    guardians = (
        app_session.execute(select(Guardian).where(Guardian.student_id == student_id))
        .scalars()
        .all()
    )
    assert [row.person_id for row in guardians] == [as_guardian.person_id]

    # §5.4a — 'No second invitation, no second account, no second login.'
    assert (
        app_session.execute(select(Invitation).where(Invitation.student_id == student_id)).first()
        is None
    )


def test_approving_with_no_group_is_refused(client, as_guardian, as_manager, a_group):
    """§5.4 -- the group is the decision. An approval without one would create a student in
    no group, which is a `lead` with extra steps."""
    body = _submit(client, as_guardian, a_group)
    response = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={},
        headers=as_manager.headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "group_required"


def test_a_failed_approval_rolls_the_whole_thing_back(
    client, app_session, as_guardian, as_manager, a_group, trains_sundays
):
    """Atomic means atomic. An approval that created a Student and then failed on the
    enrollment would leave a child in the club with no group and no way to notice."""
    body = _submit(client, as_guardian, a_group)
    before = len(list(app_session.execute(select(Student)).scalars()))

    response = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={"group_id": str(uuid.uuid4())},  # a group that does not exist
        headers=as_manager.headers,
    )
    assert response.status_code == 404
    assert len(list(app_session.execute(select(Student)).scalars())) == before
    assert app_session.get(RegistrationRequest, uuid.UUID(body["id"])).status == "pending"


def test_approving_twice_is_refused(client, as_guardian, as_manager, a_group, trains_sundays):
    """A second approval would create a second Student for the same submission -- the
    duplicate §5.4a's whole matching section exists to prevent."""
    body = _submit(client, as_guardian, a_group)
    first = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={"group_id": str(a_group)},
        headers=as_manager.headers,
    )
    assert first.status_code == 200
    second = client.post(
        f"/api/v1/registration-requests/{body['id']}/approve",
        json={"group_id": str(a_group)},
        headers=as_manager.headers,
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_reviewed"


def test_a_coach_may_not_approve(client, as_guardian, as_lead_coach, a_group):
    """§3.2 -- 'Approve registration requests' is owner and manager only."""
    body = _submit(client, as_guardian, a_group)
    assert (
        client.post(
            f"/api/v1/registration-requests/{body['id']}/approve",
            json={"group_id": str(a_group)},
            headers=as_lead_coach.headers,
        ).status_code
        == 403
    )


def test_rejecting_records_the_reviewer_and_the_reason(
    client, app_session, as_guardian, as_manager, a_group
):
    """`ck_registration_request_review_recorded` -- a non-pending row must carry
    `reviewed_at`. The service sets it, so the constraint is satisfied rather than worked
    around."""
    body = _submit(client, as_guardian, a_group)
    rejected = client.post(
        f"/api/v1/registration-requests/{body['id']}/reject",
        json={"reason": "מלא"},
        headers=as_manager.headers,
    )
    assert rejected.status_code == 200

    row = app_session.get(RegistrationRequest, uuid.UUID(body["id"]))
    app_session.refresh(row)
    assert row.status == "rejected"
    assert row.reviewed_at is not None
    assert row.reviewed_by_person_id == as_manager.person_id


def test_rejecting_creates_no_student(client, app_session, as_guardian, as_manager, a_group):
    body = _submit(client, as_guardian, a_group)
    before = len(list(app_session.execute(select(Student)).scalars()))
    client.post(
        f"/api/v1/registration-requests/{body['id']}/reject",
        json={"reason": "מלא"},
        headers=as_manager.headers,
    )
    assert len(list(app_session.execute(select(Student)).scalars())) == before
