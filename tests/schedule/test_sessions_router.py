"""§5.6's per-session overrides, ad-hoc sessions and §5.13's coach note.

The rule the whole file turns on: **any deliberate change to one session sets
`is_manually_edited`**, and that flag is what a later rule change reads to decide what it
may not touch. A PATCH that forgot to set it would leave a coach's careful change looking
machine-made, and the next schedule edit would quietly undo it.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.identity import AuthIdentity
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.schedule import Session
from app.models.structure import Class, Group
from sqlalchemy import select
from tests.conftest import sign_in
from tests.schedule.conftest import T0

API = "/api/v1"
TUESDAY = 2


@pytest.fixture
def a_session(client, as_manager, a_group, an_active_year, app_session):
    client.put(
        f"{API}/groups/{a_group}/schedule",
        headers=as_manager.headers,
        json={
            "rules": [
                {
                    "weekday": TUESDAY,
                    "start_time": "17:00:00",
                    "end_time": "19:00:00",
                    "location_id": None,
                    "effective_from": "2026-09-01",
                }
            ],
            "effective_from": "2026-09-01",
            "apply": True,
        },
    )
    client.post(
        f"{API}/training-years/{an_active_year}/generate-sessions", headers=as_manager.headers
    )
    return (
        app_session.execute(
            select(Session)
            .where(Session.group_id == a_group, Session.starts_at > T0)
            .order_by(Session.starts_at)
        )
        .scalars()
        .first()
    )


# -- reading ------------------------------------------------------------------
def test_a_coach_lists_sessions_in_a_date_range(client, as_lead_coach, a_session):
    response = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30", headers=as_lead_coach.headers
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items
    assert [i["starts_at"] for i in items] == sorted(i["starts_at"] for i in items)


def test_a_session_carries_the_group_and_location_names_it_needs_to_be_drawn(
    client, as_lead_coach, a_session
):
    """`SessionOut` is deliberately flat and complete: a caller that has one never needs a
    second request to decide what to draw, which is what makes it cacheable in IndexedDB
    (§10.6) rather than a join the client has to redo offline."""
    item = client.get(f"{API}/sessions/{a_session.id}", headers=as_lead_coach.headers).json()
    assert item["group_name"] == "מתחילים"
    assert item["location_name"] is None
    assert item["is_manually_edited"] is False
    assert item["is_ad_hoc"] is False
    assert item["attendance_taken"] is False


def test_a_session_carries_its_headcount_and_counts_only_live_enrollments(
    client, as_lead_coach, app_session, studio, a_group, a_session
):
    """1d's `14 חניכים` — the roster a coach should expect. An ENDED enrollment is a child
    who left; counting them would tell a covering coach to wait for someone who is not
    coming."""
    people = [
        Person(studio_id=studio.id, first_name=f"חניך {i}", last_name="בדיקה") for i in range(3)
    ]
    app_session.add_all(people)
    app_session.flush()
    students = [
        Student(studio_id=studio.id, person_id=person.id, status="active") for person in people
    ]
    app_session.add_all(students)
    app_session.flush()
    for index, student in enumerate(students):
        app_session.add(
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=a_group,
                status="ended" if index == 2 else "active",
                started_on=date(2026, 9, 1),
                ended_on=date(2026, 10, 1) if index == 2 else None,
            )
        )
    app_session.commit()

    item = client.get(f"{API}/sessions/{a_session.id}", headers=as_lead_coach.headers).json()
    assert item["headcount"] == 2


def test_the_coach_filter_replaces_a_split_screen(client, as_manager, as_lead_coach, a_session):
    """Artboard 9a — 'מסנן מאמן במקום פיצול מסכים'. Assigning the coach to this one session
    is `session_staff`, not `group_staff`: who actually coached THIS session."""
    assigned = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"staff": [{"person_id": str(as_lead_coach.person_id), "role": "lead_coach"}]},
    )
    assert assigned.status_code == 200, assigned.text

    mine = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30&coach_person_id={as_lead_coach.person_id}",
        headers=as_lead_coach.headers,
    ).json()["items"]
    assert [s["id"] for s in mine] == [str(a_session.id)]
    assert mine[0]["staff"][0]["display_name"] == "בודק lead_coach"


def test_a_guardian_sees_only_the_groups_their_children_are_enrolled_in(
    client, fake_provider, app_session, studio, a_group, a_session
):
    """Artboard 12b — the parent's calendar. A guardian holds no role_assignment (§3.1), so
    the staff dependency would refuse them outright; the reader admits them and narrows the
    query to groups reachable through `guardian -> student -> enrollment`."""
    subject = f"guardian-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code=code, app_name="parent")
    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()

    parent = Person(
        studio_id=studio.id, auth_identity_id=identity_id, first_name="הורה", last_name="א׳"
    )
    child_person = Person(studio_id=studio.id, first_name="ילד", last_name="א׳")
    app_session.add_all([parent, child_person])
    app_session.flush()
    child = Student(studio_id=studio.id, person_id=child_person.id, status="active")
    app_session.add(child)
    app_session.flush()
    app_session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=child.id,
                person_id=parent.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=child.id,
                group_id=a_group,
                status="active",
                started_on=date(2026, 9, 1),
            ),
        ]
    )
    # A group the child is NOT in.
    other_class = Class(studio_id=studio.id, name="קראטה")
    app_session.add(other_class)
    app_session.flush()
    stranger = Group(studio_id=studio.id, class_id=other_class.id, name="זרים")
    app_session.add(stranger)
    app_session.commit()

    token = sign_in(client, code=code, app_name="parent").json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Dev-Now": T0.isoformat()}

    mine = client.get(f"{API}/sessions?from=2026-11-01&to=2026-11-30", headers=headers)
    assert mine.status_code == 200, mine.text
    assert {s["group_id"] for s in mine.json()["items"]} == {str(a_group)}

    refused = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30&group_id={stranger.id}", headers=headers
    )
    assert refused.json()["items"] == []


def test_scope_mine_narrows_a_coach_who_is_also_a_parent_to_their_own_children(
    client, fake_provider, app_session, studio, a_group, a_session
):
    """§19.3's `dev+both` -- "the dual-role case: two apps, one identity".

    `_visible_groups` returns None (the whole studio) for anyone holding a staff role,
    whichever app asked, so a lead coach who is also a guardian received the club's entire
    timetable into the PARENT app. `web/apps/parent/src/features/schedule/client.ts` states
    the opposite in its own header -- "GET /sessions narrows a guardian to the groups their
    own children are enrolled in, server-side" -- and that contract silently did not hold
    for exactly this person.

    `scope=mine` is the parent app asking for the guardian narrowing explicitly. It can only
    ever REMOVE rows, so it is safe for any caller to send and needs no authorization of its
    own; a coach with no children gets an empty list, which is the honest answer to "my
    children's lessons" for someone who has none.
    """
    subject = f"both-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code=code, app_name="parent")
    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()

    person = Person(
        studio_id=studio.id, auth_identity_id=identity_id, first_name="אורי", last_name="כפול"
    )
    child_person = Person(studio_id=studio.id, first_name="אלון", last_name="כפול")
    app_session.add_all([person, child_person])
    app_session.flush()
    # A lead coach AND a guardian -- one identity, both hats.
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=person.id,
            role="lead_coach",
            scope_type="studio",
            granted_at=T0,
        )
    )
    child = Student(studio_id=studio.id, person_id=child_person.id, status="active")
    app_session.add(child)
    app_session.flush()

    # A group the coach teaches and no child of theirs attends.
    other_class = Class(studio_id=studio.id, name="קראטה")
    app_session.add(other_class)
    app_session.flush()
    theirs_to_teach = Group(studio_id=studio.id, class_id=other_class.id, name="זרים")
    app_session.add(theirs_to_teach)
    app_session.flush()
    app_session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=child.id,
                person_id=person.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=child.id,
                group_id=a_group,
                status="active",
                started_on=date(2026, 9, 1),
            ),
            Session(
                studio_id=studio.id,
                group_id=theirs_to_teach.id,
                training_year_id=app_session.execute(
                    select(Session.training_year_id).limit(1)
                ).scalar_one(),
                starts_at=T0,
                ends_at=T0.replace(hour=T0.hour + 1),
                status="scheduled",
            ),
        ]
    )
    app_session.commit()

    token = sign_in(client, code=code, app_name="parent").json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Dev-Now": T0.isoformat()}
    window = "from=2026-11-01&to=2026-11-30"

    # The staff view is unchanged: they teach there, so they may see it.
    everything = client.get(f"{API}/sessions?{window}", headers=headers)
    assert everything.status_code == 200, everything.text
    assert str(theirs_to_teach.id) in {s["group_id"] for s in everything.json()["items"]}

    # The parent view is their own children and nothing else.
    mine = client.get(f"{API}/sessions?{window}&scope=mine", headers=headers)
    assert mine.status_code == 200, mine.text
    assert {s["group_id"] for s in mine.json()["items"]} == {str(a_group)}


def test_scope_mine_gives_a_childless_coach_an_empty_list_not_the_club(
    client, as_lead_coach, a_session
):
    """The fail-closed half. A coach with no `guardian` row has no children, and "my
    children's lessons" for them is empty -- never a fallback to the whole studio, which is
    the shape the guardian path already guards against for a signed-in stranger."""
    headers = {**as_lead_coach.headers, "X-Dev-Now": T0.isoformat()}
    response = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30&scope=mine", headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["items"] == []


def test_a_signed_in_stranger_with_no_children_sees_nothing_rather_than_everything(
    client, signed_in, a_session
):
    """An **empty** visible-group set is a real answer, not a missing one. Treating it as
    falsy and falling back to "no filter" would show a stranger the whole club's calendar."""
    token = signed_in.json()["access_token"]
    response = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30",
        headers={"Authorization": f"Bearer {token}", "X-Dev-Now": T0.isoformat()},
    )
    assert response.status_code in (200, 401)
    if response.status_code == 200:
        assert response.json()["items"] == []


# -- the override -------------------------------------------------------------
def test_moving_one_session_sets_is_manually_edited(client, as_manager, a_session):
    response = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"starts_at": "2026-11-17T16:30:00Z", "ends_at": "2026-11-17T18:30:00Z"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_manually_edited"] is True
    assert response.json()["starts_at"].startswith("2026-11-17T16:30")


def test_a_start_without_an_end_is_refused(client, as_manager, a_session):
    """Moving one and not the other silently redefines the duration, and 'the class is an
    hour shorter now' is not something anyone typed."""
    response = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"starts_at": "2026-11-17T16:30:00Z"},
    )
    assert response.status_code == 422


def test_omitting_the_location_leaves_it_alone_and_null_clears_it(
    client, as_manager, a_session, a_location
):
    client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"location_id": str(a_location)},
    )
    after_staff_only = client.patch(
        f"{API}/sessions/{a_session.id}", headers=as_manager.headers, json={"staff": []}
    ).json()
    assert after_staff_only["location_id"] == str(a_location)

    cleared = client.patch(
        f"{API}/sessions/{a_session.id}", headers=as_manager.headers, json={"location_id": None}
    ).json()
    assert cleared["location_id"] is None


def test_cancelling_one_session_needs_a_reason_and_marks_it_edited(client, as_manager, a_session):
    blank = client.post(
        f"{API}/sessions/{a_session.id}/cancel", headers=as_manager.headers, json={"reason": ""}
    )
    assert blank.status_code == 422

    response = client.post(
        f"{API}/sessions/{a_session.id}/cancel",
        headers=as_manager.headers,
        json={"reason": "אין חשמל באולם"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert response.json()["cancel_reason"] == "אין חשמל באולם"
    # §5.6 — cancelling is a deliberate act, so a later rule change must not undo it.
    assert response.json()["is_manually_edited"] is True


def test_cancelling_a_session_notifies_the_enrolled_guardians(
    client, app_session, studio, as_manager, a_group, a_session
):
    """§2.2 of the 2026-09-02 findings register: `cancel_session` never notified anyone --
    the single case §5.11's own worked example argues the */15 comms-notify cron exists
    for, 'ביטול שיעור, היום 17:00'."""
    from app.models.comms import Notification

    student_person = Person(studio_id=studio.id, first_name="דנה", last_name="כהן")
    app_session.add(student_person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=student_person.id,
        status="active",
        health_status="signed",
        joined_on=date(2026, 9, 1),
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=a_group,
            status="active",
            started_on=date(2026, 9, 1),
        )
    )
    guardian_person = Person(studio_id=studio.id, first_name="הורה", last_name="כהן")
    app_session.add(guardian_person)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=student.id,
            person_id=guardian_person.id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()

    response = client.post(
        f"{API}/sessions/{a_session.id}/cancel",
        headers=as_manager.headers,
        json={"reason": "אין חשמל באולם"},
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    notes = list(
        app_session.execute(
            select(Notification).where(
                Notification.person_id == guardian_person.id,
                Notification.kind == "session.cancelled",
            )
        ).scalars()
    )
    assert len(notes) == 1
    assert notes[0].payload["session_id"] == str(a_session.id)


def test_an_assistant_coach_may_read_a_session_but_not_move_it(
    client, as_assistant_coach, a_session
):
    """§5.6 — 'A manager or lead coach can change any single session'."""
    assert (
        client.get(f"{API}/sessions/{a_session.id}", headers=as_assistant_coach.headers).status_code
        == 200
    )
    refused = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_assistant_coach.headers,
        json={"starts_at": "2026-11-17T16:30:00Z", "ends_at": "2026-11-17T18:30:00Z"},
    )
    assert refused.status_code == 403


# -- ad hoc -------------------------------------------------------------------
def test_an_ad_hoc_session_belongs_to_no_rule(client, as_manager, a_group, an_active_year):
    response = client.post(
        f"{API}/sessions",
        headers=as_manager.headers,
        json={
            "group_id": str(a_group),
            "training_year_id": str(an_active_year),
            "starts_at": "2026-12-11T08:00:00Z",
            "ends_at": "2026-12-11T10:00:00Z",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["is_ad_hoc"] is True
    assert response.json()["is_manually_edited"] is True


def test_an_ad_hoc_session_that_ends_before_it_starts_is_refused(
    client, as_manager, a_group, an_active_year
):
    response = client.post(
        f"{API}/sessions",
        headers=as_manager.headers,
        json={
            "group_id": str(a_group),
            "training_year_id": str(an_active_year),
            "starts_at": "2026-12-11T10:00:00Z",
            "ends_at": "2026-12-11T08:00:00Z",
        },
    )
    assert response.status_code == 422


# -- notes --------------------------------------------------------------------
def test_a_coach_writes_a_session_summary_and_reads_it_back(client, as_lead_coach, a_session):
    """§5.13 / artboard 9g סיכום מפגש."""
    created = client.post(
        f"{API}/sessions/{a_session.id}/notes",
        headers=as_lead_coach.headers,
        json={"body": "עבדנו על או-סוטו-גארי"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["author_person_id"] == str(as_lead_coach.person_id)

    listed = client.get(
        f"{API}/sessions/{a_session.id}/notes", headers=as_lead_coach.headers
    ).json()
    assert [n["body"] for n in listed["items"]] == ["עבדנו על או-סוטו-גארי"]


def test_a_session_in_another_studio_is_invisible(client, as_manager):
    assert (
        client.get(f"{API}/sessions/{uuid.uuid4()}", headers=as_manager.headers).status_code == 404
    )


# -- delete (F3) --------------------------------------------------------------
def test_deleting_a_generated_session_answers_409_with_cancel_as_the_answer(
    client, as_manager, a_session
):
    """The refusal lives on the server, not only in the UI that hides the button: the
    next expansion would recreate the row, and attendance may already point at it."""
    response = client.delete(f"{API}/sessions/{a_session.id}", headers=as_manager.headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "generated"


def test_deleting_an_ad_hoc_session_succeeds(client, as_manager, a_group, an_active_year):
    created = client.post(
        f"{API}/sessions",
        headers=as_manager.headers,
        json={
            "group_id": str(a_group),
            "training_year_id": str(an_active_year),
            "starts_at": "2026-12-11T08:00:00Z",
            "ends_at": "2026-12-11T10:00:00Z",
        },
    ).json()
    response = client.delete(f"{API}/sessions/{created['id']}", headers=as_manager.headers)
    assert response.status_code == 204
    assert (
        client.get(f"{API}/sessions/{created['id']}", headers=as_manager.headers).status_code == 404
    )


def test_deleting_an_ad_hoc_session_with_marks_is_refused(
    client, as_manager, a_group, an_active_year, app_session
):
    """A register happened in it. No session is worth more than a child's recorded
    presence, so the delete answers 409 rather than taking the marks with it."""
    from app.models.attendance import Attendance

    created = client.post(
        f"{API}/sessions",
        headers=as_manager.headers,
        json={
            "group_id": str(a_group),
            "training_year_id": str(an_active_year),
            "starts_at": "2026-12-12T08:00:00Z",
            "ends_at": "2026-12-12T10:00:00Z",
        },
    ).json()
    studio_id = as_manager.studio_id
    person = Person(studio_id=studio_id, first_name="ילד", last_name="נמחק")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio_id, person_id=person.id, status="active", joined_on=date(2026, 9, 1)
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio_id,
            student_id=student.id,
            group_id=a_group,
            status="active",
            started_on=date(2026, 9, 1),
        )
    )
    app_session.add(
        Attendance(
            studio_id=studio_id,
            session_id=uuid.UUID(created["id"]),
            student_id=student.id,
            status="present",
            source="coach",
            marked_at=T0,
            device_marked_at=T0,
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()

    response = client.delete(f"{API}/sessions/{created['id']}", headers=as_manager.headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "has_attendance"
