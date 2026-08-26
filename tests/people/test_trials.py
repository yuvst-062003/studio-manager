"""§5.4a's booking flow, end to end.

The self-booking tests matter most, because that route is the only place in the product
where somebody with no studio in their token writes rows. Every guarantee that normally
comes from `TenantSession` has to be re-established there by hand, and these tests are what
say it was.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa
from app.models.people import Enrollment, RegistrationRequest, Student, TrialBooking
from app.models.person import Guardian
from sqlalchemy import select
from tests.conftest import sign_in
from tests.people.conftest import FakeSchedule, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)


@pytest.fixture
def bookable(monkeypatch, studio, a_group, a_training_year, app_session):
    """One bookable session, with the reader patched into both routers that resolve one."""
    import app.routers.public as public_router

    fake = FakeSchedule()
    row = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=SUNDAY,
    )
    # The self-booking route looks the session up by id, so it has to really exist.
    app_session.add(row)
    app_session.commit()
    fake.sessions[a_group] = [row]
    monkeypatch.setattr(public_router, "schedule_reader", lambda _session: fake)
    return fake


@pytest.fixture
def bookable_second(bookable, studio, a_second_group, a_training_year, app_session):
    """A second group with a session at a DIFFERENT hour, so a test can tell the two
    apart by more than their group id. §5.4a step 2 filters groups by the child's age,
    which only matters when siblings of different ages pick differently."""
    row = make_session(
        studio_id=studio.id,
        group_id=a_second_group,
        training_year_id=a_training_year,
        starts_at=SUNDAY + timedelta(days=1),
    )
    app_session.add(row)
    app_session.commit()
    bookable.sessions[a_second_group] = [row]
    return bookable


@pytest.fixture
def a_stranger(client, fake_provider):
    """§5.4a step 1 -- somebody who has just signed in and belongs to no studio at all."""
    subject = f"stranger-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    response = sign_in(client, code=code, app_name="parent")
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(autouse=True)
def _fresh_limiters(monkeypatch):
    """Each test gets its own budget. The limiter is module-level on purpose (the budget is
    per process), which without this would make every test after the tenth in a file fail
    for a reason that has nothing to do with what it is testing."""
    import app.routers.trial_bookings as trial_router
    from app.services.people.rate_limit import (
        PER_IDENTITY_LIMIT,
        PUBLIC_BOOKING_LIMIT,
        PUBLIC_BOOKING_WINDOW,
        FixedWindowLimiter,
    )

    monkeypatch.setattr(
        trial_router,
        "ip_limiter",
        FixedWindowLimiter(limit=PUBLIC_BOOKING_LIMIT, window=PUBLIC_BOOKING_WINDOW),
    )
    monkeypatch.setattr(
        trial_router,
        "identity_limiter",
        FixedWindowLimiter(limit=PER_IDENTITY_LIMIT, window=PUBLIC_BOOKING_WINDOW),
    )


def _body(group_id, session_id, children=None, declarations=None):
    tag = uuid.uuid4().hex[:6]
    return {
        "group_id": str(group_id),
        "session_id": str(session_id),
        "children": children
        or [{"first_name": f"נועה{tag}", "last_name": f"לוי{tag}", "birthdate": "2019-04-01"}],
        "trial_health_declarations": (
            declarations if declarations is not None else [{"asthma": False, "consent": True}]
        ),
    }


def _book(client, headers, group_id, session_id, **kwargs):
    return client.post(
        "/api/v1/trial-bookings/self", json=_body(group_id, session_id, **kwargs), headers=headers
    )


# -- the sign-in-first booking -------------------------------------------------


def test_a_stranger_with_no_studio_can_book(client, a_stranger, bookable, a_group):
    """§6.1 -- 'Parent-app access needs no provisioning at all, because booking a trial
    creates the guardian row itself. That is the only self-service entry point in the
    system.' The caller's token carries no `sid`, which is why this route does not take
    TenantSessionDep."""
    session_id = bookable.sessions[a_group][0].id
    response = _book(client, a_stranger, a_group, session_id)
    assert response.status_code == 201, response.text


def test_booking_creates_a_student_a_guardian_and_a_booking(
    client, a_stranger, bookable, a_group, app_session, studio
):
    """§5.4a: '→ Student(status=trial) + guardian(is_primary) + trial_booking(session_id)
    + health_declaration(kind=trial) per child.'"""
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    student_id = uuid.UUID(body["students"][0]["id"])

    student = app_session.get(Student, student_id)
    assert student.status == "trial"
    assert student.studio_id == studio.id
    assert student.source == "public_link"
    # §5.4a -- the SHORT form is signed, and health_status records that it is not the full
    # one. Converting requires the full form.
    assert student.health_status == "trial_signed"

    guardian = app_session.execute(
        select(Guardian).where(Guardian.student_id == student_id)
    ).scalar_one()
    assert guardian.is_primary is True

    booking = app_session.execute(
        select(TrialBooking).where(TrialBooking.student_id == student_id)
    ).scalar_one()
    assert booking.session_id == session_id
    # Three states, not two. NULL is "the lesson has not happened yet".
    assert booking.attended is None


def test_booking_creates_no_enrollment(client, a_stranger, bookable, a_group, app_session):
    """§5.4a -- 'a trial person is a real student who simply has NO enrollment, which is
    what makes everything else work automatically.' L6 -- an enrollment here would be
    somebody enrolling themselves."""
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    student_id = uuid.UUID(body["students"][0]["id"])
    assert (
        app_session.execute(select(Enrollment).where(Enrollment.student_id == student_id)).first()
        is None
    )


def test_several_children_book_in_one_request(client, a_stranger, bookable, a_group, app_session):
    """§5.4a step 2 -- '[ + הוסף ילד נוסף ] — several children in one booking.' L9 -- one
    parent, two children, and no household row anywhere."""
    tag = uuid.uuid4().hex[:6]
    session_id = bookable.sessions[a_group][0].id
    response = _book(
        client,
        a_stranger,
        a_group,
        session_id,
        children=[
            {"first_name": f"דנה{tag}", "last_name": f"כהן{tag}", "birthdate": "2018-05-01"},
            {"first_name": f"יוסי{tag}", "last_name": f"כהן{tag}", "birthdate": "2015-02-11"},
        ],
        declarations=[{"asthma": False}, {"asthma": False}],
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["students"]) == 2

    guardians = {
        row.person_id
        for row in app_session.execute(
            select(Guardian).where(
                Guardian.student_id.in_([uuid.UUID(s["id"]) for s in body["students"]])
            )
        ).scalars()
    }
    assert len(guardians) == 1


def test_two_siblings_book_into_their_own_groups_and_their_own_slots(
    client, a_stranger, bookable_second, a_group, a_second_group, app_session
):
    """§5.4a step 2 is per child -- 'class > group (groups filtered by the child's age)'
    with '[ + הוסף ילד נוסף ] — several children in one booking' -- and step 4 is 'the next
    N upcoming sessions of each chosen group, ONE PICK PER CHILD'.

    The age filter in step 2 exists precisely for siblings who do not belong in the same
    group, so a booking that applies child 0's group to everyone breaks the exact case the
    picker was built for: the younger child silently lands in the older one's group.
    """
    tag = uuid.uuid4().hex[:6]
    younger = bookable_second.sessions[a_group][0]
    older = bookable_second.sessions[a_second_group][0]
    assert younger.starts_at != older.starts_at

    response = client.post(
        "/api/v1/trial-bookings/self",
        json={
            "children": [
                {
                    "first_name": f"דנה{tag}",
                    "last_name": f"כהן{tag}",
                    "birthdate": "2019-04-01",
                    "group_id": str(a_group),
                    "session_id": str(younger.id),
                },
                {
                    "first_name": f"יוסי{tag}",
                    "last_name": f"כהן{tag}",
                    "birthdate": "2014-02-11",
                    "group_id": str(a_second_group),
                    "session_id": str(older.id),
                },
            ],
            "trial_health_declarations": [{"asthma": False}, {"asthma": False}],
        },
        headers=a_stranger,
    )
    assert response.status_code == 201, response.text
    body = response.json()

    by_name = {row["student_display_name"]: row for row in body["bookings"]}
    assert by_name[f"דנה{tag} כהן{tag}"]["group_name"] == "מתחילים"
    assert by_name[f"יוסי{tag} כהן{tag}"]["group_name"] == "נבחרת"
    assert (
        by_name[f"דנה{tag} כהן{tag}"]["session_starts_at"]
        != (by_name[f"יוסי{tag} כהן{tag}"]["session_starts_at"])
    )

    # And the rows themselves, not just what the response says about them.
    student_ids = [uuid.UUID(row["id"]) for row in body["students"]]
    rows = app_session.execute(
        select(TrialBooking).where(TrialBooking.student_id.in_(student_ids))
    ).scalars()
    landed = {(row.group_id, row.session_id) for row in rows}
    assert landed == {(a_group, younger.id), (a_second_group, older.id)}


def test_a_child_with_no_group_of_their_own_inherits_the_one_at_the_root(
    client, a_stranger, bookable, a_group, app_session
):
    """A per-group QR pre-selects a group (§5.4a ①), and a single-child booking has one
    group by definition. The root stays a legal fallback so those two shapes keep working
    -- it is only wrong when it silently overrides a choice the parent made per child."""
    session_id = bookable.sessions[a_group][0].id
    response = _book(client, a_stranger, a_group, session_id)
    assert response.status_code == 201, response.text
    booking = app_session.execute(
        select(TrialBooking).where(
            TrialBooking.student_id == uuid.UUID(response.json()["students"][0]["id"])
        )
    ).scalar_one()
    assert (booking.group_id, booking.session_id) == (a_group, session_id)


def test_a_child_with_no_group_anywhere_is_refused(client, a_stranger, bookable):
    """422 rather than a booking with a null group. A trial booking nobody can hold a
    lesson for is worse than a rejected form."""
    response = client.post(
        "/api/v1/trial-bookings/self",
        json={
            "children": [{"first_name": "נועה", "last_name": "לוי", "birthdate": "2019-04-01"}],
            "trial_health_declarations": [{"asthma": False}],
        },
        headers=a_stranger,
    )
    assert response.status_code == 422, response.text


def test_a_sibling_may_not_be_booked_into_another_studio_s_group(
    client, a_stranger, bookable, a_group, other_studio_group_id, app_session
):
    """The studio is resolved from the FIRST group, and everything after runs inside a
    TenantSession scoped to it. A second child naming a group in a different studio must
    not slip through on the back of the first child's resolution."""
    session_id = bookable.sessions[a_group][0].id
    response = client.post(
        "/api/v1/trial-bookings/self",
        json={
            "children": [
                {
                    "first_name": "דנה",
                    "last_name": "כהן",
                    "group_id": str(a_group),
                    "session_id": str(session_id),
                },
                {"first_name": "יוסי", "last_name": "כהן", "group_id": str(other_studio_group_id)},
            ],
            "trial_health_declarations": [{"asthma": False}, {"asthma": False}],
        },
        headers=a_stranger,
    )
    assert response.status_code == 404, response.text
    assert (
        app_session.execute(
            select(TrialBooking).where(TrialBooking.group_id == other_studio_group_id)
        ).first()
        is None
    )


def test_the_parent_lands_in_the_app_already_signed_in(client, a_stranger, bookable, a_group):
    """§5.4a -- 'the parent lands DIRECTLY in the parent app, already signed in.' The
    response carries what `13b` renders, because the parent's token still has no studio in
    it and a second round trip could not be scoped."""
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    assert body["studio_slug"]
    assert body["studio_name"]
    # Per child, not per booking: with siblings in two groups any single name at the root
    # would be wrong for one of them.
    assert len(body["bookings"]) == 1
    assert body["bookings"][0]["group_name"]
    assert body["bookings"][0]["session_starts_at"]
    assert body["bookings"][0]["student_id"] == body["students"][0]["id"]


def test_an_anonymous_caller_cannot_book(client, bookable, a_group):
    """§5.4a is sign-in-FIRST. Rows created by an unauthenticated caller would be a lead
    funnel anyone can fill with anything."""
    session_id = bookable.sessions[a_group][0].id
    assert (
        client.post("/api/v1/trial-bookings/self", json=_body(a_group, session_id)).status_code
        == 401
    )


def test_a_group_in_no_active_studio_is_404(client, a_stranger, bookable):
    assert _book(client, a_stranger, uuid.uuid4(), uuid.uuid4()).status_code == 404


# -- the encrypted declaration -------------------------------------------------


def test_the_trial_declaration_is_stored_encrypted_and_never_in_the_clear(
    client, a_stranger, bookable, a_group, app_session
):
    """L10 and §11.1. `health_declaration` is W4's table and does not exist yet (C3), so
    W2's encrypted envelope for a minor's answers is `registration_request.
    payload_encrypted` -- the one column in this wave built to hold exactly this."""
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    student_id = body["students"][0]["id"]

    # Scoped to THIS booking's parent. `app_session` is unscoped with no per-test rollback,
    # so `source == "public_link"` alone matches every earlier test's row too -- and the
    # first one it returned belonged to somebody else's child.
    guardian_person_id = app_session.execute(
        select(Guardian.person_id).where(Guardian.student_id == uuid.UUID(student_id))
    ).scalar_one()
    row = app_session.execute(
        select(RegistrationRequest).where(
            RegistrationRequest.source == "public_link",
            RegistrationRequest.matched_person_id == guardian_person_id,
        )
    ).scalar_one()
    # The decrypted payload is readable through the ORM...
    assert any(child["student_id"] == student_id for child in row.payload_encrypted["children"])
    # ...and the bytes on disk are not.
    raw = app_session.execute(
        sa.text("SELECT payload_encrypted FROM registration_request WHERE id = :id"),
        {"id": row.id},
    ).scalar_one()
    assert raw[:4] == b"SMv1"
    assert b"asthma" not in raw


def test_a_trial_needs_no_approval_so_it_never_enters_the_pending_queue(
    client, a_stranger, bookable, a_group, app_session
):
    """§5.4a -- the parent lands straight in the app; nobody approves a trial. The row is
    an encrypted holding pen for W3, not a request, so it is written already reviewed --
    and with no reviewer, because claiming a human looked at it would be a lie in an
    audit-relevant column."""
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    guardian_person_id = app_session.execute(
        select(Guardian.person_id).where(
            Guardian.student_id == uuid.UUID(body["students"][0]["id"])
        )
    ).scalar_one()

    row = app_session.execute(
        select(RegistrationRequest).where(
            RegistrationRequest.matched_person_id == guardian_person_id
        )
    ).scalar_one()
    assert row.status == "approved"
    assert row.reviewed_at is not None
    assert row.reviewed_by_person_id is None


def test_the_payload_never_reaches_the_logs(client, a_stranger, bookable, a_group, caplog):
    """G7, L10 and §11.1. The scrubber already redacts any key ending `_encrypted`; this
    asserts nothing writes the decrypted form under a different name."""
    tag = uuid.uuid4().hex[:6]
    session_id = bookable.sessions[a_group][0].id
    with caplog.at_level("DEBUG"):
        _book(
            client,
            a_stranger,
            a_group,
            session_id,
            children=[{"first_name": f"סודי{tag}", "last_name": "לוי", "birthdate": "2019-04-01"}],
            declarations=[{"chronic_illness": "אסתמה"}],
        )
    assert "אסתמה" not in caplog.text
    assert f"סודי{tag}" not in caplog.text


# -- one free lesson, and the override -----------------------------------------


def test_a_second_free_trial_is_refused(client, a_stranger, bookable, a_group):
    """§5.4a -- 'One free lesson per student, full stop.'"""
    session_id = bookable.sessions[a_group][0].id
    assert _book(client, a_stranger, a_group, session_id).status_code == 201
    second = _book(client, a_stranger, a_group, session_id)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "trial_already_used"


def test_a_different_family_is_unaffected(client, fake_provider, a_stranger, bookable, a_group):
    """The control. A rule that refused the second family too would look identical in the
    test above and would close the funnel."""
    session_id = bookable.sessions[a_group][0].id
    _book(client, a_stranger, a_group, session_id)

    subject = f"other-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    other = sign_in(client, code=code, app_name="parent").json()["access_token"]
    assert (
        _book(client, {"Authorization": f"Bearer {other}"}, a_group, session_id).status_code == 201
    )


def test_a_manager_may_grant_a_second_trial_and_it_is_recorded(
    client, a_stranger, bookable, a_group, as_manager, app_session
):
    """§5.4a -- 'A second free trial requires a manager to grant an override in one tap, so
    a child torn between judo and karate isn't lost to a rule nobody meant to be that
    strict — but nobody trains free forever by rebooking.' A column, not a convention,
    because it has to be countable."""
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    student_id = uuid.UUID(body["students"][0]["id"])
    booking = app_session.execute(
        select(TrialBooking).where(TrialBooking.student_id == student_id)
    ).scalar_one()

    granted = client.post(
        f"/api/v1/trial-bookings/{booking.id}/grant-override", headers=as_manager.headers
    )
    assert granted.status_code == 200
    app_session.refresh(booking)
    assert booking.is_override is True


def test_only_a_manager_may_grant_an_override(
    client, a_stranger, bookable, a_group, as_lead_coach, app_session
):
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    booking = app_session.execute(
        select(TrialBooking).where(TrialBooking.student_id == uuid.UUID(body["students"][0]["id"]))
    ).scalar_one()
    assert (
        client.post(
            f"/api/v1/trial-bookings/{booking.id}/grant-override", headers=as_lead_coach.headers
        ).status_code
        == 403
    )


# -- §11.7's rate limit --------------------------------------------------------


def test_booking_is_rate_limited_per_identity(client, a_stranger, bookable, a_group, monkeypatch):
    """§11.7. Per identity as well as per IP: §5.4a takes several children in ONE booking,
    so a signed-in person needing a fourth request in ten minutes is not a family."""
    import app.routers.trial_bookings as trial_router
    from app.services.people.rate_limit import FixedWindowLimiter

    monkeypatch.setattr(
        trial_router, "identity_limiter", FixedWindowLimiter(limit=1, window=timedelta(minutes=10))
    )
    session_id = bookable.sessions[a_group][0].id
    _book(client, a_stranger, a_group, session_id)
    again = _book(client, a_stranger, a_group, session_id)
    assert again.status_code == 429
    assert again.json()["detail"]["code"] == "too_many_bookings"


# -- the manager's own paths ---------------------------------------------------


def test_staff_log_a_phone_enquiry_and_get_the_same_rows(
    client, as_manager, bookable, a_group, app_session
):
    """§5.4a -- 'A manager can also log a phone enquiry, producing the same rows.'"""
    tag = uuid.uuid4().hex[:6]
    session_id = bookable.sessions[a_group][0].id
    response = client.post(
        "/api/v1/trial-bookings",
        json={
            "group_id": str(a_group),
            "session_id": str(session_id),
            "child": {
                "first_name": f"אורי{tag}",
                "last_name": f"מזרחי{tag}",
                "birthdate": "2017-08-08",
            },
            "guardian": {
                "first_name": f"רותי{tag}",
                "last_name": f"מזרחי{tag}",
                "phone": f"05{uuid.uuid4().int % 10**8:08d}",
                "relation": "parent",
            },
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 201, response.text
    student = app_session.get(Student, uuid.UUID(response.json()["student_id"]))
    assert student.status == "trial"
    assert student.source == "manager"


def test_a_coach_may_log_a_trial_during_a_lesson(client, as_lead_coach, bookable, a_group):
    """Staff `11b` -- 'שיעור ניסיון — הוספת חניך חדש תוך כדי שיעור'. It records an enquiry;
    it enrols nobody, so L6 is untouched."""
    tag = uuid.uuid4().hex[:6]
    session_id = bookable.sessions[a_group][0].id
    response = client.post(
        "/api/v1/trial-bookings",
        json={
            "group_id": str(a_group),
            "session_id": str(session_id),
            "child": {"first_name": f"ילד{tag}", "last_name": f"חדש{tag}"},
            "guardian": {
                "first_name": f"הורה{tag}",
                "last_name": f"חדש{tag}",
                "phone": f"05{uuid.uuid4().int % 10**8:08d}",
            },
        },
        headers=as_lead_coach.headers,
    )
    assert response.status_code == 201, response.text


def test_the_trials_queue_lists_bookings(client, as_manager, a_stranger, bookable, a_group):
    """§5.4a ② -- 'Manager sees a שיעורי ניסיון queue on the dashboard.'"""
    session_id = bookable.sessions[a_group][0].id
    _book(client, a_stranger, a_group, session_id)
    listed = client.get("/api/v1/trial-bookings", headers=as_manager.headers)
    assert listed.status_code == 200
    assert listed.json()["items"]
    assert listed.json()["items"][0]["student_display_name"]


def test_recording_attendance_on_a_trial_is_three_valued(
    client, as_manager, a_stranger, bookable, a_group, app_session
):
    """`attended` is nullable on purpose. NULL is 'the lesson has not happened yet', which
    the follow-up automation treats completely differently from 'they did not turn up'."""
    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    booking = app_session.execute(
        select(TrialBooking).where(TrialBooking.student_id == uuid.UUID(body["students"][0]["id"]))
    ).scalar_one()
    assert booking.attended is None

    client.patch(
        f"/api/v1/trial-bookings/{booking.id}",
        json={"attended": True, "coach_note": "מתאימה למתחילים"},
        headers=as_manager.headers,
    )
    app_session.refresh(booking)
    assert booking.attended is True
    assert booking.coach_note == "מתאימה למתחילים"


def test_the_coach_note_never_reaches_the_audit_trail(
    client, as_manager, a_stranger, bookable, a_group, app_session
):
    """§5.13 -- a note is a written opinion about a child, and `audit_log` is append-only,
    so anything recorded there is beyond anonymization's reach (§11.4). That a note was
    written is enough."""
    from app.models.audit import AuditLog

    session_id = bookable.sessions[a_group][0].id
    body = _book(client, a_stranger, a_group, session_id).json()
    booking = app_session.execute(
        select(TrialBooking).where(TrialBooking.student_id == uuid.UUID(body["students"][0]["id"]))
    ).scalar_one()
    client.patch(
        f"/api/v1/trial-bookings/{booking.id}",
        json={"attended": True, "coach_note": "צעירה מדי לקבוצה הזו"},
        headers=as_manager.headers,
    )
    entry = app_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == booking.id, AuditLog.action == "trial.outcome.recorded"
        )
    ).scalar_one()
    assert "צעירה מדי" not in str(entry.diff)
    assert entry.diff["note_written"] is True
