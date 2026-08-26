"""§5.8 -- "Every targeted student gets an `event_registration` row with rsvp = pending."

Publishing is the moment an event becomes real to the club, and three things follow from
that sentence.

Targets **compose**: "both beginner groups plus three seniors" is several rows, and a
student reached by two of them is registered once. `uq_event_registration` would catch the
duplicate, but as an IntegrityError that aborts the whole publish -- and composing is the
normal case, not the edge one.

Publishing is **refused rather than repeated**. A second publish would re-materialise the
roster over answers already given, and an RSVP a parent has to give twice is an RSVP the
office cannot trust.

Cancelling **keeps the roster**. §5.8 notifies on a cancellation and the office phones
whoever answered; deleting the registrations would delete the list the call is made from.
"""

from __future__ import annotations

from app.models.events import EventRegistration
from app.models.people import Enrollment, Student
from app.models.person import Person
from sqlalchemy import select
from tests.events.conftest import T0, YEAR_STARTS


def _student_in(app_session, studio, group_id, name):
    """A child enrolled in `group_id`. §4.3 puts `class_id` on `group`, so an enrolment is
    the only edge between a student and a class -- which is what makes a `class` target
    resolvable at all."""
    person = Person(studio_id=studio.id, first_name=name, last_name="בודק")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=YEAR_STARTS
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=group_id,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    return student.id


def _draft(client, headers, **over):
    body = {
        "type": "competition",
        "title": "אליפות",
        "starts_at": (T0.replace(day=26)).isoformat(),
        **over,
    }
    response = client.post("/api/v1/events", headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_publishing_registers_every_targeted_student_as_pending(
    client, app_session, as_manager, studio, a_group
):
    first = _student_in(app_session, studio, a_group, "דנה")
    second = _student_in(app_session, studio, a_group, "יוסי")
    event_id = _draft(
        client,
        as_manager.headers,
        targets=[{"target_type": "group", "target_id": str(a_group)}],
    )

    response = client.post(f"/api/v1/events/{event_id}/publish", headers=as_manager.headers)
    assert response.status_code == 201, response.text
    assert response.json()["registrations_created"] == 2
    assert response.json()["event"]["status"] == "published"

    rows = list(
        app_session.execute(
            select(EventRegistration).where(EventRegistration.event_id == event_id)
        ).scalars()
    )
    assert {row.student_id for row in rows} == {first, second}
    assert {row.rsvp for row in rows} == {"pending"}
    # §5.8's fee becomes a charge on CONFIRMATION, not on publication. A roster that
    # arrived pre-charged would bill every family the office invited.
    assert all(row.charge_id is None for row in rows)


def test_a_student_in_two_targets_is_registered_once(
    client, app_session, as_manager, studio, a_class, a_group
):
    """`uq_event_registration` is UNIQUE on (event_id, student_id). The duplicate has to be
    collapsed before the INSERT, not caught after it -- an IntegrityError here aborts the
    publish for every other child too."""
    student = _student_in(app_session, studio, a_group, "רותם")
    event_id = _draft(
        client,
        as_manager.headers,
        type="seminar",
        title="סמינר",
        targets=[
            {"target_type": "class", "target_id": str(a_class)},
            {"target_type": "group", "target_id": str(a_group)},
            {"target_type": "student", "target_id": str(student)},
        ],
    )
    response = client.post(f"/api/v1/events/{event_id}/publish", headers=as_manager.headers)
    assert response.status_code == 201, response.text
    assert response.json()["registrations_created"] == 1


def test_a_studio_target_reaches_everyone(client, app_session, as_manager, studio, a_group):
    """`studio` is everyone -- the one target type that names no particular row, which is
    why `event_target_has_an_id` allows its `target_id` to be null."""
    _student_in(app_session, studio, a_group, "אורי")
    _student_in(app_session, studio, a_group, "מאיה")
    event_id = _draft(
        client, as_manager.headers, targets=[{"target_type": "studio", "target_id": None}]
    )
    response = client.post(f"/api/v1/events/{event_id}/publish", headers=as_manager.headers)
    assert response.status_code == 201, response.text
    assert response.json()["registrations_created"] == 2


def test_an_event_with_no_targets_publishes_and_says_it_reached_nobody(client, as_manager):
    """A publish that said nothing about what it materialised would look identical to one
    that materialised nothing -- which is exactly the state a manager needs to see before
    wondering why no parent replied. Same reasoning as `HealthTemplatePublishedOut`."""
    event_id = _draft(client, as_manager.headers, type="other", title="ללא קהל")
    response = client.post(f"/api/v1/events/{event_id}/publish", headers=as_manager.headers)
    assert response.status_code == 201, response.text
    assert response.json()["registrations_created"] == 0
    assert response.json()["event"]["status"] == "published"


def test_publishing_twice_is_refused_rather_than_repeated(client, as_manager, an_event):
    """`an_event` is already published. 409 and not 403: the caller may publish, and this
    event is past the point where publishing means anything."""
    response = client.post(f"/api/v1/events/{an_event}/publish", headers=as_manager.headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "event_is_not_a_draft"


def test_a_left_student_is_not_invited(client, app_session, as_manager, studio, a_group):
    """§5.4's `left` is a real status. Inviting a child who left three months ago is how a
    studio loses a family twice."""
    staying = _student_in(app_session, studio, a_group, "נועה")
    gone = _student_in(app_session, studio, a_group, "עידן")
    app_session.get(Student, gone).status = "left"
    app_session.commit()

    event_id = _draft(
        client,
        as_manager.headers,
        targets=[{"target_type": "group", "target_id": str(a_group)}],
    )
    client.post(f"/api/v1/events/{event_id}/publish", headers=as_manager.headers)
    rows = list(
        app_session.execute(
            select(EventRegistration.student_id).where(EventRegistration.event_id == event_id)
        ).scalars()
    )
    assert rows == [staying]


def test_a_student_named_directly_is_invited_whatever_their_status(
    client, app_session, as_manager, studio, a_group
):
    """§5.9 step 1 nominates candidates by naming them. A manager naming a child means that
    child -- the status filter is about who a GROUP sweeps in, not about who a manager
    picked out."""
    student = _student_in(app_session, studio, a_group, "טל")
    app_session.get(Student, student).status = "frozen"
    app_session.commit()

    event_id = _draft(
        client,
        as_manager.headers,
        type="belt_exam",
        title="מבחן",
        targets=[{"target_type": "student", "target_id": str(student)}],
    )
    response = client.post(f"/api/v1/events/{event_id}/publish", headers=as_manager.headers)
    assert response.json()["registrations_created"] == 1


def test_cancelling_keeps_the_roster(
    client, app_session, as_manager, an_event, a_registered_student
):
    """§5.8 notifies on a cancellation and the office phones the families who answered.
    Deleting the roster would delete the list the notification is addressed to."""
    response = client.post(f"/api/v1/events/{an_event}/cancel", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert app_session.get(EventRegistration, a_registered_student) is not None


def test_a_draft_cannot_be_cancelled(client, as_manager):
    """Nothing has reached a guardian, so there is nothing to withdraw. A manager abandons
    a draft by leaving it -- `events.status.draftHint` is why that is safe."""
    event_id = _draft(client, as_manager.headers, type="other", title="טיוטה")
    response = client.post(f"/api/v1/events/{event_id}/cancel", headers=as_manager.headers)
    assert response.status_code == 409


def test_an_assistant_coach_publishes_nothing(client, as_assistant_coach, as_manager):
    """§3.2 -- "Create events" is owner, manager and lead_coach, and publishing is the half
    of creating that reaches every parent in the club."""
    event_id = _draft(client, as_manager.headers, type="other", title="טיוטה")
    response = client.post(f"/api/v1/events/{event_id}/publish", headers=as_assistant_coach.headers)
    assert response.status_code == 403
