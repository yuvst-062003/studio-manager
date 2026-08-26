"""§7's `/students` and `/me/students`, and §3.2's matrix enforced where
`.claude/rules/api.md` says it must be -- in a router dependency, never inside a service.

**The `coach` tag is per-route here, not per-router, and that is load-bearing.**
`tests/invariants/test_03`'s detector matches a response property against `^price`, so
`price_plan_id` reads as a financial field however the contract meant it. `StudentOut`
carries it, so it is returned only from manager-scoped routes; every coach-reachable route
returns a shape built without it. Tagging the whole router would have made invariant 3 red
for `GET /students/{id}` on day one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.main import app
from app.models.people import Enrollment
from sqlalchemy import select
from tests.people.conftest import Caller, FakeSchedule, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)
WEDNESDAY = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)


@pytest.fixture
def twice_weekly(monkeypatch, studio, a_group, a_training_year):
    """A group that trains Sunday and Wednesday, read through L5's seam."""
    import app.routers.students as students_router

    fake = FakeSchedule()
    fake.sessions[a_group] = [
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=moment,
        )
        for moment in (SUNDAY, WEDNESDAY)
    ]
    monkeypatch.setattr(students_router, "schedule_reader", lambda _session: fake)
    return fake


#: Coach-reachable, and therefore inside invariant 3's guard.
COACH_ROUTES = [
    ("/api/v1/students", "get"),
    ("/api/v1/students/{student_id}", "get"),
    ("/api/v1/students/{student_id}/status-history", "get"),
    ("/api/v1/students/{student_id}/guardians", "get"),
]

#: Manager-only, and deliberately NOT tagged `coach` -- these may return a price.
MANAGER_ROUTES = [
    ("/api/v1/students", "post"),
    ("/api/v1/students/{student_id}", "patch"),
]


def _payload() -> dict:
    tag = uuid.uuid4().hex[:8]
    return {
        "first_name": f"דנה{tag}",
        "last_name": f"כהן{tag}",
        "birthdate": "2018-05-01",
        "guardian": {
            "first_name": f"יעל{tag}",
            "last_name": f"כהן{tag}",
            "email": f"yael-{tag}@example.invalid",
            "relation": "parent",
        },
    }


def _create(client, caller: Caller, payload: dict | None = None) -> dict:
    response = client.post("/api/v1/students", json=payload or _payload(), headers=caller.headers)
    assert response.status_code == 201, response.text
    return response.json()


# -- §3.2's matrix -------------------------------------------------------------


def test_a_manager_creates_a_student(client, as_manager):
    body = _create(client, as_manager)
    assert body["student"]["status"] == "lead"
    assert body["student"]["health_status"] == "missing"
    assert body["invitation_token"]


def test_a_manager_who_names_a_group_gets_an_enrollment_immediately(
    client, as_manager, a_group, twice_weekly, app_session
):
    """§5.4(a) -- 'parent details -> child details AND GROUP -> save. Creates everything
    immediately.' The API accepted `group_id` and dropped it, so every manager-added
    student landed as a `lead` with no enrollment and the manager had to enrol them again
    on a second screen."""
    payload = _payload() | {"group_id": str(a_group)}
    body = _create(client, as_manager, payload)
    assert body["student"]["status"] == "active"

    enrollment = app_session.execute(
        select(Enrollment).where(Enrollment.student_id == uuid.UUID(body["student"]["id"]))
    ).scalar_one()
    assert enrollment.group_id == a_group
    assert enrollment.ended_on is None
    # C12 -- not asked for, so NULL, which means every session of that group.
    assert enrollment.attends_weekdays is None


def test_the_manager_may_narrow_which_days_the_child_comes(
    client, as_manager, a_group, twice_weekly, app_session
):
    """C12 -- 'EVERY enrolment form collects attends_weekdays.' A group training Sunday and
    Wednesday, a child who only comes on Sunday."""
    payload = _payload() | {"group_id": str(a_group), "attends_weekdays": [0]}
    body = _create(client, as_manager, payload)
    enrollment = app_session.execute(
        select(Enrollment).where(Enrollment.student_id == uuid.UUID(body["student"]["id"]))
    ).scalar_one()
    assert enrollment.attends_weekdays == [0]


def test_a_day_the_group_does_not_train_is_refused(client, as_manager, a_group, twice_weekly):
    """C12 -- the pattern is validated against the group's REAL schedule, read through the
    seam. Monday is not one of this group's days."""
    payload = _payload() | {"group_id": str(a_group), "attends_weekdays": [2]}
    response = client.post("/api/v1/students", json=payload, headers=as_manager.headers)
    assert response.status_code == 422, response.text


def test_a_student_created_with_no_group_is_still_a_lead(client, as_manager, app_session):
    """§5.4a -- 'a lead is just a student in an early status ... a trial person is a real
    student who simply has no enrollment.' Naming no group is the phone-enquiry case, and
    it must not invent one."""
    body = _create(client, as_manager)
    assert body["student"]["status"] == "lead"
    assert (
        app_session.execute(
            select(Enrollment).where(Enrollment.student_id == uuid.UUID(body["student"]["id"]))
        ).first()
        is None
    )


def test_a_group_in_another_studio_is_refused(client, as_manager, other_studio_group_id):
    """TenantSession fails closed, and a manager naming a group they cannot see gets a 404
    rather than an enrollment pointing across a tenant boundary."""
    payload = _payload() | {"group_id": str(other_studio_group_id)}
    response = client.post("/api/v1/students", json=payload, headers=as_manager.headers)
    assert response.status_code == 404, response.text


def test_a_coach_may_not_create_a_student(client, as_lead_coach):
    """§3.2 gives a coach 'View students in own groups' and nothing about creating one.
    A coach who can create a student can create a guardian row pointing at themselves."""
    response = client.post("/api/v1/students", json=_payload(), headers=as_lead_coach.headers)
    assert response.status_code == 403


def test_an_anonymous_caller_gets_401_not_403(client):
    """The split is decided in `require_roles`, not by dependency ordering: an anonymous
    caller is told to authenticate, an authenticated one without the role is told no."""
    assert client.post("/api/v1/students", json=_payload()).status_code == 401


def test_a_guardian_may_not_list_students(client, as_guardian):
    """A guardian reaches their own children through /me/students. The studio-wide list
    is not theirs, and §6.1 refuses them the staff app outright."""
    assert client.get("/api/v1/students", headers=as_guardian.headers).status_code == 403


def test_a_student_with_no_guardian_is_refused(client, as_manager):
    """§5.3 makes at least one guardian structural. A child with none is a child nobody
    can be contacted about, and the schema cannot express the rule."""
    payload = _payload()
    del payload["guardian"]
    response = client.post("/api/v1/students", json=payload, headers=as_manager.headers)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "guardian_required"


def test_a_coach_lists_only_their_own_groups(
    client, app_session, studio, a_group, a_second_group, as_manager, as_lead_coach, assign_coach
):
    from app.models.people import Enrollment
    from tests.people.conftest import TODAY

    mine = _create(client, as_manager)["student"]
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=uuid.UUID(mine["id"]),
            group_id=a_group,
            status="active",
            started_on=TODAY,
        )
    )
    app_session.commit()

    assign_coach(as_lead_coach.person_id, a_second_group)
    listed = client.get("/api/v1/students", headers=as_lead_coach.headers).json()
    assert mine["id"] not in [row["id"] for row in listed["items"]]

    assign_coach(as_lead_coach.person_id, a_group)
    listed = client.get("/api/v1/students", headers=as_lead_coach.headers).json()
    assert mine["id"] in [row["id"] for row in listed["items"]]


def test_updating_a_student_is_manager_only(client, as_manager, as_lead_coach):
    student = _create(client, as_manager)["student"]
    refused = client.patch(
        f"/api/v1/students/{student['id']}",
        json={"first_name": "דניאלה"},
        headers=as_lead_coach.headers,
    )
    assert refused.status_code == 403
    allowed = client.patch(
        f"/api/v1/students/{student['id']}",
        json={"first_name": "דניאלה"},
        headers=as_manager.headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["first_name"] == "דניאלה"


# -- shapes and paging ---------------------------------------------------------


def test_the_list_is_a_cursor_page(client, as_manager):
    _create(client, as_manager)
    body = client.get("/api/v1/students?limit=1", headers=as_manager.headers).json()
    assert set(body) == {"items", "next_cursor", "has_more"}


def test_a_student_in_another_studio_is_404_and_never_403(client, as_manager):
    response = client.get(f"/api/v1/students/{uuid.uuid4()}", headers=as_manager.headers)
    assert response.status_code == 404


def test_a_coach_may_read_one_students_card(
    client, as_manager, as_lead_coach, assign_coach, app_session, studio, a_group
):
    """Staff `9c` is a coach opening a student card. §3.2 allows it for students in their
    own groups."""
    from app.models.people import Enrollment
    from tests.people.conftest import TODAY

    student = _create(client, as_manager)["student"]
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=uuid.UUID(student["id"]),
            group_id=a_group,
            status="active",
            started_on=TODAY,
        )
    )
    app_session.commit()
    assign_coach(as_lead_coach.person_id, a_group)

    card = client.get(f"/api/v1/students/{student['id']}", headers=as_lead_coach.headers)
    assert card.status_code == 200
    assert card.json()["guardians"]


def test_the_coach_reachable_card_carries_no_price(client, as_manager):
    """Invariant 3, at the wire. `StudentDetailOut` has no `price_plan_id` -- a coach has
    no use for it and a shape that cannot carry it is cheaper to guarantee than a filter
    that has to remember to."""
    student = _create(client, as_manager)["student"]
    card = client.get(f"/api/v1/students/{student['id']}", headers=as_manager.headers).json()
    assert "price_plan_id" not in card


# -- /me/students --------------------------------------------------------------


def test_me_students_is_the_guardian_table(client, app_session, as_manager, as_guardian):
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    payload = _payload()
    payload["guardian"]["email"] = parent.email
    created = _create(client, as_manager, payload)

    mine = client.get("/api/v1/me/students", headers=as_guardian.headers)
    assert mine.status_code == 200
    assert [row["id"] for row in mine.json()["items"]] == [created["student"]["id"]]


def test_a_guardian_never_sees_another_familys_child(client, as_manager, as_guardian):
    _create(client, as_manager)
    mine = client.get("/api/v1/me/students", headers=as_guardian.headers)
    assert mine.json()["items"] == []


def test_me_students_needs_no_role(client, as_guardian):
    """§3.1 -- 'guardian is not a role.' §6.1 makes parent access
    `EXISTS(guardian WHERE person_id = :me)`. A `require_roles` here would refuse every
    guardian in the product and admit every coach with no children."""
    assert client.get("/api/v1/me/students", headers=as_guardian.headers).status_code == 200


# -- the tag, and the invariant it guards --------------------------------------


def test_every_coach_reachable_route_is_tagged_coach():
    """`.claude/rules/api.md` -- 'A router serving coaches is tagged coach. SPEC §13's
    third invariant is enforced against that tag, so an untagged coach router is an
    unguarded one.'"""
    paths = app.openapi()["paths"]
    for path, method in COACH_ROUTES:
        assert "coach" in paths[path][method]["tags"], f"{method.upper()} {path}"


def test_no_manager_only_route_is_tagged_coach():
    """The other half. The tag is a promise about who can reach a shape; putting it on a
    route a coach cannot reach would make invariant 3's guard mean less everywhere it is
    used, and `POST /students` legitimately returns a price."""
    paths = app.openapi()["paths"]
    for path, method in MANAGER_ROUTES:
        assert "coach" not in paths[path][method]["tags"], f"{method.upper()} {path}"


def test_no_coach_scoped_endpoint_returns_a_financial_field():
    """Invariant 3, asserted here as well as in tests/invariants, because this lane is
    what made that gate non-vacuous."""
    from tests.invariants.test_03_coach_endpoints_expose_no_money import leaks

    assert leaks(app) == []
