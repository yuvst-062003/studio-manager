"""The two reads a parent needs and did not have: their own child's status history, and
the trial lesson that was booked for them.

Everything asserted here is about **shape and scope**, not about rendering. The rows have
existed since M3 -- `student_status_history` is written by the single writer in
`app/services/people/status.py`, and `trial_booking.session_id` has pointed at a real
session since §5.4a's booking flow landed. What did not exist was a way for the family the
rows are about to read them.

Two rules decide the shapes, and both are asserted rather than described:

  * **No financial field.** Invariant 3 guards the `coach` tag; nothing guards a `/me`
    route, so the same detector is pointed at these two by hand. A parent-facing history
    that grew a `balance_agorot` would be caught by nothing otherwise.
  * **No other family's data.** Every `/me` route stands on §3.3's
    `EXISTS(guardian WHERE person_id = :me)`. A guardian asking for a student id that is
    not theirs gets 404 and not 403: under `/me/`, the collection *is* "my children", so an
    id outside it does not exist rather than being forbidden -- and a 403 would confirm the
    child exists in this studio, which is the leak in miniature.

The manager's `reason` is excluded from the parent's shape deliberately, and there is a
test for it. "עזב בגלל חובות" is a note a manager writes for the club's own record; the
same row read by the family is a status and a date.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.main import app
from app.models.people import Student, TrialBooking
from app.services.people.status import StudentStatusService
from tests.invariants.test_03_coach_endpoints_expose_no_money import (
    FINANCIAL,
    _financial_properties,
)
from tests.people.conftest import Caller, make_session

#: The sequence the task describes verbatim: joined 2 August, frozen 1 October, returned
#: 1 November -- "exactly the record a parent phones the club about".
JOINED = datetime(2026, 8, 2, 9, 0, tzinfo=UTC)
FROZEN = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
RETURNED = datetime(2026, 11, 1, 9, 0, tzinfo=UTC)

TRIAL_STARTS = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)


def _payload(email: str | None = None) -> dict:
    tag = uuid.uuid4().hex[:8]
    return {
        "first_name": f"נועה{tag}",
        "last_name": f"לוי{tag}",
        "birthdate": "2018-05-01",
        "guardian": {
            "first_name": f"יעל{tag}",
            "last_name": f"לוי{tag}",
            "email": email or f"yael-{tag}@example.invalid",
            "relation": "parent",
        },
    }


def _create(client, caller: Caller, payload: dict | None = None) -> dict:
    response = client.post("/api/v1/students", json=payload or _payload(), headers=caller.headers)
    assert response.status_code == 201, response.text
    return response.json()["student"]


@pytest.fixture
def my_child(client, app_session, as_manager, as_guardian) -> dict:
    """A student the guardian fixture is actually a guardian of.

    Matched by email, which is how `StudentService.create` links a new child to an existing
    person -- the same path a manager adding a sibling walks.
    """
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    return _create(client, as_manager, _payload(email=parent.email))


def _walk_the_funnel(tenant_session, student_id: uuid.UUID) -> None:
    """lead -> active -> frozen -> active, through the ONE writer.

    Not through the freeze route, deliberately: `POST /students/{id}/freeze` is manager
    scoped and this file is about what the PARENT can read afterwards. Driving the graph
    through `StudentStatusService` writes exactly the rows the product writes, which is
    what the read under test has to reproduce.
    """
    student = tenant_session.get(Student, student_id)
    assert student is not None
    for to_status, at, reason in (
        ("active", JOINED, "joined"),
        ("frozen", FROZEN, "משפחה נסעה לחו״ל"),
        ("active", RETURNED, None),
    ):
        StudentStatusService.transition(
            tenant_session, student=student, to_status=to_status, at=at, reason=reason
        )
    tenant_session.commit()


# -- 1. the parent's own status history ----------------------------------------


def test_a_parent_reads_their_own_childs_status_history(
    client, tenant_session, as_guardian, my_child
):
    """The gap this closes: joined 2 August, frozen 1 October, returned 1 November was a
    dashboard-only record, and it is the one a parent telephones about.

    **Three rows, not four.** `StudentService.create` sets `status='lead'` on the row it
    inserts and writes no history row for it -- the funnel's first state is the student
    existing, and there is no move to record. So a timeline starts at the first *move*, and
    the client must not assume its first row is the child's creation. Asserted rather than
    assumed, because the opposite assumption is the one a UI naturally makes.
    """
    _walk_the_funnel(tenant_session, uuid.UUID(my_child["id"]))

    response = client.get(
        f"/api/v1/me/students/{my_child['id']}/status-history", headers=as_guardian.headers
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    # Oldest first -- the order a timeline reads in, and the order the funnel is computed in.
    assert [row["to_status"] for row in items] == ["active", "frozen", "active"]
    assert [row["from_status"] for row in items] == ["lead", "active", "frozen"]
    assert items[0]["changed_at"].startswith("2026-08-02")
    assert items[1]["changed_at"].startswith("2026-10-01")
    assert items[2]["changed_at"].startswith("2026-11-01")


def test_the_parents_history_carries_no_financial_field(client, as_guardian, my_child):
    """Invariant 3's detector, pointed at a `/me` route by hand.

    The tag-based gate cannot see this route -- it is not coach-scoped and never will be --
    so the same walk is run over its response schema here. Asserted at the wire as well,
    because a schema is a promise and the JSON is the thing the parent's browser receives.
    """
    schema = app.openapi()
    operation = schema["paths"]["/api/v1/me/students/{student_id}/status-history"]["get"]
    body = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert _financial_properties(body, schema["components"]["schemas"]) == []

    response = client.get(
        f"/api/v1/me/students/{my_child['id']}/status-history", headers=as_guardian.headers
    )
    for row in response.json()["items"]:
        assert [key for key in row if FINANCIAL.search(key)] == []


def test_the_parents_history_omits_the_managers_reason(
    client, tenant_session, as_guardian, my_child
):
    """`reason` is the club's own note about a family, written for the club.

    The freeze above carries "משפחה נסעה לחו״ל", which is innocuous; "stopped paying" and
    "parent was abusive to the coach" are the same column. A shape that cannot carry it is
    cheaper to guarantee than a filter that has to remember to -- the same argument
    `StudentDetailOut` makes for `price_plan_id`.
    """
    _walk_the_funnel(tenant_session, uuid.UUID(my_child["id"]))

    body = client.get(
        f"/api/v1/me/students/{my_child['id']}/status-history", headers=as_guardian.headers
    ).json()
    assert body["items"], "the fixture wrote rows; an empty list would pass this vacuously"
    for row in body["items"]:
        assert "reason" not in row
        assert "changed_by_person_id" not in row
    assert "משפחה נסעה לחו״ל" not in str(body)


def test_a_parent_cannot_read_another_familys_status_history(
    client, as_manager, as_guardian, my_child
):
    """Tenancy, at the level §3.3 actually operates on: the same studio, a different
    family. 404 and never 403 -- under `/me/` the collection is "my children", so an id
    outside it does not exist, and a 403 would confirm that it does."""
    someone_elses = _create(client, as_manager)

    response = client.get(
        f"/api/v1/me/students/{someone_elses['id']}/status-history", headers=as_guardian.headers
    )
    assert response.status_code == 404, response.text


def test_the_status_history_route_needs_no_role(client, as_guardian, my_child):
    """§3.1 -- 'guardian is not a role'. A `require_roles` here would refuse every guardian
    in the product and admit every coach with no children."""
    assert (
        client.get(
            f"/api/v1/me/students/{my_child['id']}/status-history", headers=as_guardian.headers
        ).status_code
        == 200
    )


def test_an_anonymous_caller_gets_401(client, my_child):
    assert client.get(f"/api/v1/me/students/{my_child['id']}/status-history").status_code == 401


def test_the_parent_history_route_is_not_tagged_coach():
    """The tag is a promise about who reaches a shape. This route serves a guardian, and a
    `coach` tag on it would put a non-coach route inside invariant 3's gate -- which would
    make the gate mean slightly less everywhere else it is used."""
    operation = app.openapi()["paths"]["/api/v1/me/students/{student_id}/status-history"]["get"]
    assert "coach" not in (operation.get("tags") or [])


# -- 3a. the trial lesson, read by the family it was booked for ------------------


@pytest.fixture
def a_trial_booking(app_session, studio, a_group, a_training_year, my_child) -> TrialBooking:
    session_row = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TRIAL_STARTS,
    )
    app_session.add(session_row)
    app_session.flush()
    booking = TrialBooking(
        studio_id=studio.id,
        student_id=uuid.UUID(my_child["id"]),
        session_id=session_row.id,
        group_id=a_group,
        booked_at=datetime(2026, 9, 1, 9, 0, tzinfo=UTC),
        attended=None,
        outcome="pending",
        coach_note="ילדה ביישנית, לשים לב",
        is_override=False,
    )
    app_session.add(booking)
    app_session.commit()
    return booking


def test_a_parent_reads_the_lesson_that_was_booked_for_their_child(
    client, as_guardian, my_child, a_trial_booking
):
    """`TrialHome` renders a countdown and had no time to count down to.

    The time is not a new column -- `trial_booking.session_id` has pointed at a real
    `session` since §5.4a's booking flow, and `session.starts_at` is the lesson. This route
    is the join nobody had exposed.
    """
    response = client.get("/api/v1/me/trial-bookings", headers=as_guardian.headers)
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["student_id"] == my_child["id"]
    assert items[0]["session_starts_at"].startswith("2026-09-06T14:00")
    assert items[0]["group_name"] == "מתחילים"


def test_the_trial_read_carries_no_coach_note_and_no_outcome(
    client, as_guardian, my_child, a_trial_booking
):
    """§5.4a ③ -- 'Coach can leave a note.' That note is written for the club, about a
    child, by somebody who has met them once. `outcome` is the club's funnel decision:
    §5.4a makes conversion a manager decision, and a family reading 'lost' before anyone
    has phoned them is the app telling them so first.
    """
    body = client.get("/api/v1/me/trial-bookings", headers=as_guardian.headers).json()
    assert body["items"], "the fixture wrote a booking; an empty list passes this vacuously"
    for row in body["items"]:
        assert "coach_note" not in row
        assert "outcome" not in row
    assert "ילדה ביישנית" not in str(body)


def test_the_trial_read_carries_no_financial_field(client, as_guardian, a_trial_booking):
    schema = app.openapi()
    operation = schema["paths"]["/api/v1/me/trial-bookings"]["get"]
    body = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert _financial_properties(body, schema["components"]["schemas"]) == []


def test_a_parent_never_sees_another_familys_trial_booking(
    client, app_session, studio, a_group, as_manager, as_guardian, a_trial_booking
):
    """The same §3.3 filter as `/me/students`, asserted with a real second family in the
    same studio rather than with an empty database."""
    someone_elses = _create(client, as_manager)
    app_session.add(
        TrialBooking(
            studio_id=studio.id,
            student_id=uuid.UUID(someone_elses["id"]),
            session_id=None,
            group_id=a_group,
            booked_at=datetime(2026, 9, 1, 9, 0, tzinfo=UTC),
            attended=None,
            outcome="pending",
            is_override=False,
        )
    )
    app_session.commit()

    body = client.get("/api/v1/me/trial-bookings", headers=as_guardian.headers).json()
    assert [row["student_id"] for row in body["items"]] == [
        row["student_id"] for row in body["items"] if row["student_id"] != someone_elses["id"]
    ]
    assert someone_elses["id"] not in {row["student_id"] for row in body["items"]}


def test_a_booking_with_no_session_answers_null_rather_than_guessing(
    client, app_session, studio, a_group, as_guardian, my_child
):
    """`trial_booking.session_id` is nullable -- §5.4a lets a manager log a phone enquiry
    with no slot chosen yet. That is exactly the family `TrialHome`'s fallback copy is
    for, so the route has to be able to say "no lesson" rather than inventing one."""
    app_session.add(
        TrialBooking(
            studio_id=studio.id,
            student_id=uuid.UUID(my_child["id"]),
            session_id=None,
            group_id=a_group,
            booked_at=datetime(2026, 9, 1, 9, 0, tzinfo=UTC),
            attended=None,
            outcome="pending",
            is_override=False,
        )
    )
    app_session.commit()

    body = client.get("/api/v1/me/trial-bookings", headers=as_guardian.headers).json()
    assert [row["session_starts_at"] for row in body["items"]] == [None]


def test_the_trial_read_reports_whether_the_lesson_happened(
    client, app_session, as_guardian, a_trial_booking
):
    """§5.4a ④ -- 'After the lesson the home shows איך היה?'. `TrialHome` has accepted an
    `attended` prop since W3 and nothing has ever supplied it. `attended` is deliberately
    three-state: NULL is "the lesson has not happened yet", which is not `false`."""
    assert (
        client.get("/api/v1/me/trial-bookings", headers=as_guardian.headers).json()["items"][0][
            "attended"
        ]
        is None
    )

    a_trial_booking.attended = True
    app_session.merge(a_trial_booking)
    app_session.commit()

    assert (
        client.get("/api/v1/me/trial-bookings", headers=as_guardian.headers).json()["items"][0][
            "attended"
        ]
        is True
    )


def test_the_trial_read_needs_no_role_and_refuses_anonymously(client, as_guardian):
    assert client.get("/api/v1/me/trial-bookings", headers=as_guardian.headers).status_code == 200
    assert client.get("/api/v1/me/trial-bookings").status_code == 401


def test_todays_date_is_not_part_of_the_contract():
    """Guards the fixtures above from drifting into the past and silently changing what
    they exercise: every instant here is fixed, and none of them is `now()`."""
    assert JOINED.date() == date(2026, 8, 2)
    assert TRIAL_STARTS.date() == date(2026, 9, 6)
