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
    """Seed one row the way the ONLY remaining producer does — §5.4a's trial funnel.

    **The approval queue is gone** (2026-08-30). `RegistrationService.submit_from_parent`
    had no producer left once `POST /me/students` started enrolling directly, and the approve
    and reject routes went with it; the one useful thing the queue did — the duplicate check
    — moved to the doors parents actually use (`tests/people/test_onboarding.py`).

    **The TABLE stays**, and this is why. `registration_request.payload_encrypted` is the
    only column in the schema built to hold a minor's data at rest (§11.1), so the trial
    funnel writes the trial health answers there: `status="approved"`, `reviewed_at` set, no
    reviewer, so the row is a holding pen and never a pending decision. What the tests below
    cover is the MANAGER's read of it — the payload never leaving in a list, the full read
    being audit-logged, the duplicate warning — and all three are still reachable.
    """
    from datetime import date

    from app.core.db import get_engine
    from app.core.tenancy import TenantSession, use_studio
    from app.models.people import RegistrationRequest
    from app.services.people.registrations import RegistrationService

    tag = uuid.uuid4().hex[:6]
    at = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)
    with (
        use_studio(guardian_caller.studio_id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        parent = scoped.get(Person, guardian_caller.person_id)
        row = RegistrationRequest(
            source="public_link",
            payload_encrypted={
                "guardian": {
                    "person_id": str(parent.id),
                    "display_name": f"{parent.first_name} {parent.last_name}",
                },
                "children": [
                    {
                        "first_name": first_name or f"נועה{tag}",
                        "last_name": last_name or f"כהן{tag}",
                        "birthdate": date(2020, 3, 4).isoformat(),
                        "trial_declaration": {"answers": {"q1": "לא"}},
                    }
                ],
                "preferred_group_id": str(group_id) if group_id else None,
            },
            matched_person_id=parent.id,
            status="approved",
            submitted_at=at,
            reviewed_at=at,
            reviewed_by_person_id=None,
            created_at=at,
        )
        scoped.add(row)
        scoped.flush()
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
    # `?status=approved`: the funnel's holding-pen rows are written reviewed, so the
    # default pending view is correctly empty. The RULE under test is the same either way —
    # no list response ever decrypts a payload.
    body = client.get(
        "/api/v1/registration-requests?status=approved", headers=as_manager.headers
    ).json()
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
