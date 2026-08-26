"""§5.11's announcements — one-way, scoped, optionally scheduled. Dashboard artboard `4f`.

"A manager (studio-wide, any class, any group) or a lead coach (their own groups) publishes a
title and body, optionally scheduled. There are no replies and no chat."

**The audience is the risky part, and it fails in both directions.** Too wide and the club
messages families who left; too narrow and a cancellation misses the children who will turn
up to it. Both failures are silent — the publisher sees "sent" either way — which is why
`4f` shows `יגיע ל-{{count}} משפחות` before the button and why the delivery report exists
after it.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from app.models.comms import Announcement
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.models.structure import Group
from sqlalchemy import select
from tests.comms.conftest import T0, YEAR_STARTS


def _post(client, caller, **body):
    payload = {"title": "ביטול שיעור", "body": "השיעור היום מבוטל", "scope_type": "studio"}
    payload.update(body)
    return client.post("/api/v1/announcements", json=payload, headers=caller.headers)


def _publish(client, caller, announcement_id):
    return client.post(f"/api/v1/announcements/{announcement_id}/publish", headers=caller.headers)


def _inbox_person_ids(session, announcement_id) -> set[uuid.UUID]:
    from app.models.comms import Notification

    return {
        row.person_id
        for row in session.execute(
            select(Notification).where(
                Notification.payload["announcement_id"].astext == str(announcement_id)
            )
        ).scalars()
    }


def _another_student(session, studio, group_id, *, status: str = "active"):
    person = Person(studio_id=studio.id, first_name="ילד", last_name=uuid.uuid4().hex[:6])
    session.add(person)
    session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status=status, joined_on=YEAR_STARTS
    )
    session.add(student)
    session.flush()
    session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=group_id,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    session.commit()
    return student.id


# -- who it reaches -----------------------------------------------------------
def test_a_studio_announcement_reaches_every_active_familys_guardians(
    client, app_session, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    mum = a_guardian_for(an_enrolled_student, name="יעל")
    dad = a_guardian_for(an_enrolled_student, name="דני")
    created = _post(client, as_manager).json()
    assert _publish(client, as_manager, created["id"]).status_code == 200

    assert _inbox_person_ids(tenant_session, created["id"]) == {mum, dad}


def test_a_guardian_of_two_children_in_one_group_is_told_once(
    client,
    app_session,
    tenant_session,
    studio,
    as_manager,
    a_guardian_for,
    an_enrolled_student,
    a_group,
) -> None:
    """§5.11's report counts FAMILIES -- "נשלח ל-24 משפחות". A parent buzzed twice for one
    message reads as a bug both to them and to the manager reading the count, so the fan-out
    deduplicates on the person and not on the child."""
    sibling = _another_student(app_session, studio, a_group)
    parent = a_guardian_for(an_enrolled_student, name="יעל")
    app_session.add(
        Guardian(studio_id=studio.id, student_id=sibling, person_id=parent, is_primary=False)
    )
    app_session.commit()

    created = _post(client, as_manager, scope_type="group", scope_id=str(a_group)).json()
    _publish(client, as_manager, created["id"])

    from app.models.comms import Notification

    rows = list(
        tenant_session.execute(
            select(Notification).where(
                Notification.payload["announcement_id"].astext == str(created["id"])
            )
        ).scalars()
    )
    assert [row.person_id for row in rows] == [parent]


def test_a_group_announcement_reaches_only_that_groups_guardians(
    client,
    app_session,
    tenant_session,
    studio,
    as_manager,
    a_guardian_for,
    an_enrolled_student,
    a_class,
    a_group,
) -> None:
    other_group = Group(studio_id=studio.id, class_id=a_class, name="מתקדמים")
    app_session.add(other_group)
    app_session.commit()
    outsider_student = _another_student(app_session, studio, other_group.id)
    outsider = a_guardian_for(outsider_student, name="זר")
    insider = a_guardian_for(an_enrolled_student, name="פנים")

    created = _post(client, as_manager, scope_type="group", scope_id=str(a_group)).json()
    _publish(client, as_manager, created["id"])

    reached = _inbox_person_ids(tenant_session, created["id"])
    assert insider in reached
    assert outsider not in reached


def test_a_class_announcement_reaches_every_group_under_it(
    client,
    app_session,
    tenant_session,
    studio,
    as_manager,
    a_guardian_for,
    an_enrolled_student,
    a_class,
    a_group,
) -> None:
    sibling_group = Group(studio_id=studio.id, class_id=a_class, name="מתקדמים")
    app_session.add(sibling_group)
    app_session.commit()
    other_student = _another_student(app_session, studio, sibling_group.id)

    here = a_guardian_for(an_enrolled_student, name="כאן")
    there = a_guardian_for(other_student, name="שם")

    created = _post(client, as_manager, scope_type="class", scope_id=str(a_class)).json()
    _publish(client, as_manager, created["id"])

    assert _inbox_person_ids(tenant_session, created["id"]) == {here, there}


def test_a_family_who_left_is_not_messaged(
    client, app_session, tenant_session, studio, as_manager, a_guardian_for, a_group
) -> None:
    """§5.4's `left` is a real status. M7 settled the same question for event targeting --
    "inviting a child who left three months ago is how a studio loses a family twice" -- and
    an announcement is the same sweep, so it uses the same answer rather than a second one."""
    gone = _another_student(app_session, studio, a_group, status="left")
    ex_parent = a_guardian_for(gone, name="עזב")

    created = _post(client, as_manager).json()
    _publish(client, as_manager, created["id"])
    assert ex_parent not in _inbox_person_ids(tenant_session, created["id"])


def test_a_pending_enrolment_is_not_in_the_group_yet(
    client, app_session, tenant_session, studio, as_manager, a_guardian_for, a_student, a_group
) -> None:
    """§5.4 -- a `pending` enrolment is a decision the manager has not taken. The club's
    internal notices are not for a family it has not accepted, and
    `app/services/attendance/roster.py` draws the same line for the same reason."""
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=a_student,
            group_id=a_group,
            status="pending",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    hopeful = a_guardian_for(a_student, name="ממתין")

    created = _post(client, as_manager, scope_type="group", scope_id=str(a_group)).json()
    _publish(client, as_manager, created["id"])
    assert hopeful not in _inbox_person_ids(tenant_session, created["id"])


def test_the_composer_is_told_the_audience_size_before_the_button(
    client, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """`4f` is `קהל יעד ותצוגה מקדימה`, and `audience.recipients` reads
    `יגיע ל-{{count}} משפחות`. A manager who cannot see the size before pressing send is
    guessing at twenty-four families -- and both ways of being wrong are silent."""
    a_guardian_for(an_enrolled_student, name="יעל")
    response = client.post(
        "/api/v1/announcements/audience-preview",
        json={"scope_type": "studio", "scope_id": None},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["recipient_count"] == 1


# -- who may publish ----------------------------------------------------------
def test_a_lead_coach_may_publish_to_their_own_group(
    client, as_lead_coach, a_coached_group, a_group
) -> None:
    """§5.11 -- "or a lead coach (their own groups)"."""
    a_coached_group(as_lead_coach.person_id)
    response = _post(client, as_lead_coach, scope_type="group", scope_id=str(a_group))
    assert response.status_code == 201, response.text


def test_a_lead_coach_may_not_publish_to_a_group_they_do_not_coach(
    client, app_session, studio, as_lead_coach, a_class
) -> None:
    from app.models.structure import Group

    other = Group(studio_id=studio.id, class_id=a_class, name="לא שלהם")
    app_session.add(other)
    app_session.commit()
    response = _post(client, as_lead_coach, scope_type="group", scope_id=str(other.id))
    assert response.status_code == 403, response.text


def test_a_lead_coach_may_not_publish_studio_wide(client, as_lead_coach, a_coached_group) -> None:
    """ "Their own groups" is the whole grant. A studio-wide send from a coach is the club
    speaking in the club's voice to families they do not teach."""
    a_coached_group(as_lead_coach.person_id)
    assert _post(client, as_lead_coach, scope_type="studio").status_code == 403


def test_an_assistant_coach_cannot_publish_at_all(client, as_assistant_coach) -> None:
    assert _post(client, as_assistant_coach).status_code == 403


def test_a_guardian_cannot_publish(client, as_guardian_of, a_student) -> None:
    assert _post(client, as_guardian_of(a_student)).status_code == 403


# -- the scope pairing --------------------------------------------------------
def test_a_studio_scope_carrying_a_scope_id_is_refused(client, as_manager, a_group) -> None:
    """`announcement_scope_id_present` is a CHECK. The API refuses first so the caller gets a
    422 naming the field rather than a 500 from the database."""
    response = _post(client, as_manager, scope_type="studio", scope_id=str(a_group))
    assert response.status_code == 422, response.text


def test_a_group_scope_with_no_scope_id_is_refused(client, as_manager) -> None:
    assert _post(client, as_manager, scope_type="group", scope_id=None).status_code == 422


def test_a_group_scope_naming_a_class_is_refused(client, as_manager, a_class) -> None:
    """The CHECK cannot catch this: `scope_id` has no foreign key, because the referent
    depends on `scope_type` and a polymorphic reference cannot have one. So a group scope
    naming a class id is an audience that resolves to nobody -- a send that reports success
    and reaches no one."""
    response = _post(client, as_manager, scope_type="group", scope_id=str(a_class))
    assert response.status_code == 422, response.text


def test_a_scope_id_naming_nothing_is_refused(client, as_manager) -> None:
    response = _post(client, as_manager, scope_type="group", scope_id=str(uuid.uuid4()))
    assert response.status_code == 422, response.text


# -- draft, scheduled, published ----------------------------------------------
def test_a_new_announcement_is_not_published(client, app_session, as_manager) -> None:
    created = _post(client, as_manager).json()
    assert created["published_at"] is None
    assert app_session.get(Announcement, uuid.UUID(created["id"])).published_at is None


def test_a_scheduled_announcement_is_not_sent_on_creation(
    client, tenant_session, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """Two nullable timestamps, three states: a draft to finish, a send that is queued, and
    one that has gone out and now has a delivery report. That is the question a manager asks
    when a parent says they were never told."""
    a_guardian_for(an_enrolled_student)
    created = _post(client, as_manager, scheduled_for=(T0 + timedelta(days=1)).isoformat()).json()
    assert created["scheduled_for"] is not None
    assert created["published_at"] is None
    assert _inbox_person_ids(tenant_session, created["id"]) == set()


def test_publishing_records_when(client, as_manager, a_guardian_for, an_enrolled_student) -> None:
    a_guardian_for(an_enrolled_student)
    created = _post(client, as_manager).json()
    published = _publish(client, as_manager, created["id"]).json()
    assert published["published_at"] is not None


def test_publishing_twice_does_not_send_twice(
    client, tenant_session, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """`published_at` is the guard. `[ שליחה ]` is a button on a phone and a double tap is the
    ordinary accident -- twenty-four households buzzed twice is the most visible bug this
    screen can have."""
    a_guardian_for(an_enrolled_student)
    created = _post(client, as_manager).json()
    assert _publish(client, as_manager, created["id"]).status_code == 200
    assert _publish(client, as_manager, created["id"]).status_code == 409

    from app.models.comms import Notification

    rows = list(
        tenant_session.execute(
            select(Notification).where(
                Notification.payload["announcement_id"].astext == str(created["id"])
            )
        ).scalars()
    )
    assert len(rows) == 1


def test_a_published_announcement_cannot_be_edited(
    client, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """Parents already have it in their inbox. Editing the source would make their copy and
    the manager's list disagree about what the club said."""
    a_guardian_for(an_enrolled_student)
    created = _post(client, as_manager).json()
    _publish(client, as_manager, created["id"])
    response = client.patch(
        f"/api/v1/announcements/{created['id']}",
        json={"title": "אחרת"},
        headers=as_manager.headers,
    )
    assert response.status_code == 409, response.text


def test_deleting_soft_deletes_and_leaves_the_inbox_alone(
    client, app_session, tenant_session, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """G15. A published announcement has been read by parents and their inbox rows reference
    it; removing the row would leave those pointing at nothing."""
    a_guardian_for(an_enrolled_student)
    created = _post(client, as_manager).json()
    _publish(client, as_manager, created["id"])
    assert (
        client.delete(
            f"/api/v1/announcements/{created['id']}", headers=as_manager.headers
        ).status_code
        == 204
    )

    row = app_session.get(Announcement, uuid.UUID(created["id"]))
    app_session.refresh(row)
    assert row.deleted_at is not None
    assert len(_inbox_person_ids(tenant_session, created["id"])) == 1


def test_a_deleted_announcement_is_gone_from_the_list(client, as_manager) -> None:
    created = _post(client, as_manager).json()
    client.delete(f"/api/v1/announcements/{created['id']}", headers=as_manager.headers)
    listed = client.get("/api/v1/announcements", headers=as_manager.headers).json()
    assert created["id"] not in [item["id"] for item in listed["items"]]


def test_the_list_is_cursor_paginated(client, as_manager) -> None:
    for index in range(3):
        _post(client, as_manager, title=f"הודעה {index}")
    first = client.get(
        "/api/v1/announcements", params={"limit": 2}, headers=as_manager.headers
    ).json()
    assert len(first["items"]) == 2
    assert first["has_more"] is True


# -- the fan-out goes through the seam ----------------------------------------
def test_publishing_fans_out_through_the_seam_and_never_writes_a_row() -> None:
    """§5.11's rule is that every message reaches BOTH levels. A service that inserted the
    `notification` row itself would produce an inbox entry with no push and no delivery
    record -- no report, and the silent-failure gap reopens.

    Asserted on the source, the way `tests/people/test_followups.py` asserts it for §5.4a's
    ladder: the module may name `NotificationService` and must not name `Notification`.
    """
    import ast
    import inspect

    from app.services.comms import announcements

    tree = ast.parse(inspect.getsource(announcements))
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)} | {
        node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)
    }
    assert "NotificationService" in names
    assert "Notification" not in names
    assert "NotificationDelivery" not in names
