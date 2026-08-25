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

    monkeypatch.setattr(trial_router, "schedule_reader", lambda: fake)
    return fake


def _submit(client, guardian_caller, group_id=None) -> dict:
    tag = uuid.uuid4().hex[:6]
    payload = {"first_name": f"נועה{tag}", "last_name": f"כהן{tag}", "birthdate": "2020-03-04"}
    if group_id is not None:
        payload["preferred_group_id"] = str(group_id)
    response = client.post("/api/v1/me/students", json=payload, headers=guardian_caller.headers)
    assert response.status_code == 201, response.text
    return response.json()


# -- §5.4(c): the parent's request ---------------------------------------------


def test_a_parent_adding_a_sibling_creates_a_request_and_not_an_enrollment(
    client, app_session, as_guardian, a_group
):
    """L6. If this created an enrollment, a parent would have enrolled themselves."""
    body = _submit(client, as_guardian, a_group)

    row = app_session.get(RegistrationRequest, uuid.UUID(body["id"]))
    assert row.source == "parent_app"
    assert row.status == "pending"
    # §5.4a -- 'matched_person_id set'. The submitter IS the match; nothing is guessed.
    assert row.matched_person_id == as_guardian.person_id
    # No student, and therefore no enrollment.
    assert (
        app_session.execute(
            select(Enrollment).where(
                Enrollment.student_id.in_(
                    select(Guardian.student_id).where(Guardian.person_id == as_guardian.person_id)
                )
            )
        ).first()
        is None
    )


def test_the_group_a_parent_picks_is_a_preference_not_a_decision(
    client, app_session, as_guardian, a_group
):
    """§5.4 -- 'the public link's only job is a first lesson'. The form's group is rendered
    in the queue and the manager may override it."""
    body = _submit(client, as_guardian, a_group)
    row = app_session.get(RegistrationRequest, uuid.UUID(body["id"]))
    assert row.payload_encrypted["preferred_group_id"] == str(a_group)


def test_the_request_response_carries_two_names_and_no_payload(client, as_guardian, a_group):
    """L10 at the wire, on the parent's own submission too."""
    body = _submit(client, as_guardian, a_group)
    assert body["child_display_name"]
    assert body["guardian_display_name"]
    assert "payload" not in body
    assert "birthdate" not in body


def test_the_payload_never_reaches_the_logs(client, as_guardian, a_group, caplog):
    """G7, L10 and §11.1, checked against the bytes that actually come out."""
    tag = uuid.uuid4().hex[:6]
    with caplog.at_level("DEBUG"):
        client.post(
            "/api/v1/me/students",
            json={"first_name": f"סודי{tag}", "last_name": "כהן", "birthdate": "2020-03-04"},
            headers=as_guardian.headers,
        )
    assert f"סודי{tag}" not in caplog.text


def test_the_submission_audit_diff_names_no_child(client, app_session, as_guardian, a_group):
    """§11.2 and §11.4 -- `audit_log` is append-only, so a child's name written into a diff
    is a name anonymization can never reach."""
    body = _submit(client, as_guardian, a_group)
    entry = app_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == uuid.UUID(body["id"]),
            AuditLog.action == "registration_request.submitted",
        )
    ).scalar_one()
    assert body["child_display_name"].split(" ")[0] not in str(entry.diff)


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

    submitted = client.post(
        "/api/v1/me/students",
        json={"first_name": f"נועה{tag}", "last_name": f"כהן{tag}", "birthdate": "2020-03-04"},
        headers=as_guardian.headers,
    ).json()
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
