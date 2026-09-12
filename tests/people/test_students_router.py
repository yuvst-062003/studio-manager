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
from datetime import UTC, date, datetime

import pytest
from app.main import app
from app.models.people import Enrollment
from sqlalchemy import select
from tests.people.conftest import Caller, FakeSchedule, make_session

SUNDAY = datetime(2026, 9, 6, 14, 0, tzinfo=UTC)
WEDNESDAY = datetime(2026, 9, 9, 14, 0, tzinfo=UTC)

#: `twice_weekly` anchors its fixture sessions to the FIXED calendar dates above, but
#: `training_weekdays` (app/services/people/group_days.py), which C12's
#: `attends_weekdays` validation reads through, observes the materialized calendar only
#: 4 weeks forward from "today" -- `app.core.clock.now()`, this repo's only clock
#: (app/core/clock.py). Once the real "today" walks past 2026-09-06 the Sunday session
#: falls outside that window, the group stops appearing to train on Sunday, and a
#: request narrowing attendance to Sunday is wrongly refused -- which is exactly what
#: happened when the real calendar reached 2026-09-07. Pinning the server's clock with
#: `X-Dev-Now` (app/core/clock.py's `DevClockMiddleware`, the same seam §19.5 built for
#: this) to a date safely before both fixture sessions keeps that request's outcome the
#: same on any real-world date. Do NOT delete this and let it fall back to the real clock.
DEV_NOW_HEADERS = {"X-Dev-Now": datetime(2026, 9, 1, 0, 0, tzinfo=UTC).isoformat()}


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


def _create(
    client, caller: Caller, payload: dict | None = None, *, extra_headers: dict | None = None
) -> dict:
    headers = {**caller.headers, **(extra_headers or {})}
    response = client.post("/api/v1/students", json=payload or _payload(), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


# -- §3.2's matrix -------------------------------------------------------------


def test_two_children_with_one_parent_email_share_one_parent(client, as_manager):
    """**The sibling case, and it was broken.**

    `match_person` only matches a guardian who already HAS a login with a
    provider-verified address — an unverified address is not a key, deliberately. A parent
    the manager created minutes ago has no login at all, so that lookup could never find
    them, and the second child minted a SECOND Person and a SECOND invitation against the
    same email. The parent then signed in, bound one of the two, and saw ONE of their
    children (2026-09-12).
    """
    tag = uuid.uuid4().hex[:8]
    email = f"siblings-{tag}@example.invalid"

    def add(name: str) -> dict:
        return _create(
            client,
            as_manager,
            {
                "first_name": name,
                "last_name": f"אחים{tag}",
                "guardian": {"email": email, "relation": "parent"},
            },
        )

    first = add(f"אלף{tag}")
    second = add(f"בית{tag}")

    assert (
        first["student"]["guardians"][0]["person_id"]
        == second["student"]["guardians"][0]["person_id"]
    )


def test_the_second_child_still_mints_a_usable_invitation(client, as_manager):
    """Reusing the parent record must not mean the manager is left with nothing to send for
    the second child. Both tokens resolve to the same Person; once the first is bound the
    second lands on `accept_invitation`'s `already_owned` branch, which is a non-event
    rather than a refusal."""
    tag = uuid.uuid4().hex[:8]
    email = f"siblings2-{tag}@example.invalid"
    payload = {
        "first_name": f"גימל{tag}",
        "last_name": f"אחים{tag}",
        "guardian": {"email": email, "relation": "parent"},
    }
    _create(client, as_manager, payload)
    second = _create(
        client, as_manager, {**payload, "first_name": f"דלת{tag}"}
    )
    assert second["invitation_token"]


def test_a_guardian_with_no_email_and_no_phone_is_refused(client, as_manager):
    """An invitation is the ONLY route onto a child a manager creates — there is no
    self-service door — so a student saved without one is a child nobody can be contacted
    about. The dashboard used to allow the submission and render the generic error."""
    response = client.post(
        "/api/v1/students",
        json={"first_name": "א", "last_name": "ב", "guardian": {"relation": "parent"}},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_a_phone_alone_is_enough_to_invite_on(client, as_manager):
    """The dashboard offered email only until 2026-09-12; the API has always accepted a
    phone, and a club that reaches its families by WhatsApp needs it."""
    tag = uuid.uuid4().hex[:8]
    body = _create(
        client,
        as_manager,
        {
            "first_name": f"טלפון{tag}",
            "last_name": f"בלבד{tag}",
            "guardian": {"phone": f"05012{tag[:5]}", "relation": "parent"},
        },
    )
    assert body["invitation_token"]


def _already_paid_promises_for(app_session, student_id: uuid.UUID) -> list[uuid.UUID]:
    """The `already_paid` promises naming one student's charges.

    Scoped, because the test database is migrated once per session and never truncated: a
    query across every studio answers about every test that has ever run.
    """
    from app.models.billing import Charge
    from app.models.payment_promise import PaymentPromise, PaymentPromiseCharge

    return list(
        app_session.execute(
            select(PaymentPromise.id)
            .join(PaymentPromiseCharge, PaymentPromiseCharge.payment_promise_id == PaymentPromise.id)
            .join(Charge, Charge.id == PaymentPromiseCharge.charge_id)
            .where(PaymentPromise.already_paid.is_(True), Charge.student_id == student_id)
            .distinct()
        ).scalars()
    )


def test_a_manager_can_convert_a_student_as_already_paid(
    client, app_session, as_manager, a_group
):
    """**The family paid the manager in person, and the manager says so.**

    Asserted on an UNPRICED student on purpose: the payment method must be recorded either
    way, and the promise half must stay silent rather than fail when there is no charge to
    name yet.

    Until 2026-09-12 there was no way to record it: the parent then walked step 3 of the
    join wizard and was asked how they intended to pay money they had already handed over.
    `already_paid` is the promise's own word and is a TENSE, not a method — it tells the
    manager whether to go looking for this money now or wait for it.
    """
    from app.models.people import Student

    created = _create(client, as_manager)
    student_id = created["student"]["id"]
    response = client.post(
        f"/api/v1/students/{student_id}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-09-01",
            "payment_settled": True,
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    student = app_session.get(Student, uuid.UUID(student_id))
    # **This is the half the parent app reads** to decide whether it still has to ask, and
    # it is set whether or not there was anything to promise over.
    assert student.payment_method == "cash"

    # The promise is the MANAGER's half — a row saying this money is accounted for rather
    # than owed. It needs an open charge to name, and this student is unpriced (the fixture
    # sets no plan), so `charge_first_month` raised none and there is nothing to promise.
    # Silent rather than failing is deliberate: a conversion the manager asked for must not
    # fall over because the price has not been agreed yet.
    #
    #: Scoped to THIS student's charges. The test database is migrated once per session and
    #: never truncated, so an unscoped `filter_by(already_paid=True).all() == []` asserts
    #: something about every studio any other test has ever written — which is how it began
    #: failing the moment a second test recorded a settled payment.
    assert _already_paid_promises_for(app_session, uuid.UUID(student_id)) == []


def test_an_unpromisable_charge_never_fails_the_managers_conversion(
    client, app_session, as_manager, a_group, a_price_plan
):
    """A credit on the family's balance must not stop the manager recording a payment.

    `_settle_with_the_manager` used to hand `PaymentPromiseService` **every** open charge on
    the student, and that service refuses a charge with nothing outstanding -- correctly, it
    is not money anyone can promise. §5.10's manual charge is signed, so a credit is an
    ordinary open charge with a negative amount, and one on the account turned the manager's
    conversion into a 500 with nothing recorded at all.

    The conversion is the thing the manager asked for; the promise is a note beside it.
    """
    from app.models.billing import Charge
    from app.models.payment_promise import PaymentPromiseCharge
    from app.models.people import Student
    from app.models.person import Guardian

    created = _create(client, as_manager)
    student_id = uuid.UUID(created["student"]["id"])
    payer = app_session.execute(
        select(Guardian.person_id).where(
            Guardian.student_id == student_id, Guardian.is_primary.is_(True)
        )
    ).scalar_one()
    student = app_session.get(Student, student_id)
    credit = Charge(
        studio_id=student.studio_id,
        payer_person_id=payer,
        student_id=student_id,
        kind="manual",
        amount_agorot=-5_000,
        due_date=date(2026, 9, 28),
        status="open",
        created_by="manual",
    )
    app_session.add(credit)
    app_session.commit()

    response = client.post(
        f"/api/v1/students/{student_id}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-09-01",
            "price_plan_id": str(a_price_plan),
            "payment_settled": True,
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    assert app_session.get(Student, student_id).payment_method == "cash"
    promises = _already_paid_promises_for(app_session, student_id)
    assert len(promises) == 1
    named = [
        row.charge_id
        for row in app_session.query(PaymentPromiseCharge).filter_by(
            payment_promise_id=promises[0]
        )
    ]
    # The tuition charge the conversion itself raised, and not the credit.
    assert credit.id not in named
    assert named


@pytest.mark.parametrize("method", ["cash", "cheque", "standing_order"])
def test_the_manager_records_WHICH_way_the_family_already_paid(
    client, app_session, as_manager, a_group, a_price_plan, method
):
    """**"The manager has to set what option the parent already paid for"** (owner,
    2026-09-12).

    The first cut of this took a boolean and wrote `cash` for everyone, on the theory that a
    manager who took a cheque would correct it on the payments screen. That is a second
    screen and a second memory for a fact the manager had in front of them — and it made the
    club's own three arrangements indistinguishable in the ledger: twelve post-dated cheques
    and a wad of notes both arrived as `cash`.

    Card is deliberately absent. It is the one method that settles itself: uPay's IPN closes
    the charge, so there is nothing for a human to mark, and offering it here would invite a
    payment the club cannot reconcile against its own merchant account.
    """
    from app.models.people import Student

    created = _create(client, as_manager)
    student_id = created["student"]["id"]
    response = client.post(
        f"/api/v1/students/{student_id}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-09-01",
            "price_plan_id": str(a_price_plan),
            "payment_received": method,
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    from app.models.payment_promise import PaymentPromise

    # Both halves carry the SAME method — the student's column, which is what the parent
    # app reads, and the promise, which is what the manager's payments screen shows.
    assert app_session.get(Student, uuid.UUID(student_id)).payment_method == method
    promise_ids = _already_paid_promises_for(app_session, uuid.UUID(student_id))
    assert len(promise_ids) == 1
    assert app_session.get(PaymentPromise, promise_ids[0]).method == method


def test_the_card_is_refused_as_an_already_paid_method(
    client, as_manager, a_group, a_price_plan
):
    """A 422 that names the problem, not a silent fallback to cash. Card money arrives
    through uPay and closes its own charge; a manager marking it here would be recording a
    payment twice."""
    created = _create(client, as_manager)
    response = client.post(
        f"/api/v1/students/{created['student']['id']}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-09-01",
            "price_plan_id": str(a_price_plan),
            "payment_received": "upay_card",
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_the_retired_boolean_still_means_cash(
    client, app_session, as_manager, a_group, a_price_plan
):
    """One deploy cycle of tolerance, and no more. This app registers a service worker, so a
    manager whose browser still holds yesterday's bundle posts `payment_settled: true` for a
    day after the API ships — and refusing it would lose a real conversion over a field
    name."""
    from app.models.people import Student

    created = _create(client, as_manager)
    student_id = created["student"]["id"]
    response = client.post(
        f"/api/v1/students/{student_id}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-09-01",
            "price_plan_id": str(a_price_plan),
            "payment_settled": True,
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    app_session.expire_all()
    assert app_session.get(Student, uuid.UUID(student_id)).payment_method == "cash"


def test_converting_without_the_flag_leaves_the_payment_open(
    client, app_session, as_manager, a_group
):
    """The default, and it must stay the default: a conversion says nothing about money
    unless the manager said something about money."""
    from app.models.people import Student

    created = _create(client, as_manager)
    student_id = created["student"]["id"]
    response = client.post(
        f"/api/v1/students/{student_id}/convert",
        json={"group_id": str(a_group), "started_on": "2026-09-01"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    assert app_session.get(Student, uuid.UUID(student_id)).payment_method is None


def test_a_manager_creates_a_student(client, as_manager):
    body = _create(client, as_manager)
    assert body["student"]["status"] == "lead"
    assert body["student"]["health_status"] == "missing"
    assert body["invitation_token"]
    # 2026-08-30 — the schema promised 'a copyable link for a parent standing at the
    # desk' and returned only the raw token. The URL is the parent app's own origin
    # with the token as `?invite=`, which Resolve redeems after sign-in.
    assert body["invitation_url"].endswith(f"/?invite={body['invitation_token']}")


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
    body = _create(client, as_manager, payload, extra_headers=DEV_NOW_HEADERS)
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


def test_search_finds_a_child_by_partial_name_and_by_parent_name(client, as_manager):
    """9h -- `חיפוש לפי שם חניך או הורה`. A coach is more often told a parent's name than
    a child's; the guardian's first name must find the child, and the alias in the service
    keeps the guardian match from colliding with the student's own Person row."""
    payload = _payload()
    payload["first_name"] = "עמית-חיפוש"
    payload["guardian"]["first_name"] = "שירה-חיפוש"
    created = _create(client, as_manager, payload)
    student_id = created["student"]["id"]

    by_child = client.get("/api/v1/students?q=עמית-חי", headers=as_manager.headers).json()
    assert student_id in [row["id"] for row in by_child["items"]]

    by_parent = client.get("/api/v1/students?q=שירה-חיפוש", headers=as_manager.headers).json()
    assert student_id in [row["id"] for row in by_parent["items"]]

    by_nobody = client.get("/api/v1/students?q=לא-קיים-כזה", headers=as_manager.headers).json()
    assert by_nobody["items"] == []


def test_the_list_is_a_cursor_page(client, as_manager):
    _create(client, as_manager)
    body = client.get("/api/v1/students?limit=1", headers=as_manager.headers).json()
    assert set(body) == {"items", "next_cursor", "has_more"}


def test_a_student_in_another_studio_is_404_and_never_403(client, as_manager):
    response = client.get(f"/api/v1/students/{uuid.uuid4()}", headers=as_manager.headers)
    assert response.status_code == 404


def test_a_nameless_guardian_shows_an_empty_display_name_not_a_bare_space(client, as_manager):
    """Decision 20's 3-field add-student form sends a guardian email and no guardian name
    at all (`test_guardian_create_nameless.py`). `f"{first} {last}"` on two empty strings
    is `" "` -- a single space, not an empty string -- which renders as a blank row on the
    manager's screens rather than an obviously-still-pending name."""
    tag = uuid.uuid4().hex[:8]
    payload = {
        "first_name": f"דנה{tag}",
        "last_name": f"כהן{tag}",
        "birthdate": "2018-05-01",
        "guardian": {
            "email": f"nameless-{tag}@example.invalid",
            "relation": "parent",
        },
    }
    student = _create(client, as_manager, payload)["student"]

    card = client.get(f"/api/v1/students/{student['id']}", headers=as_manager.headers)

    assert card.status_code == 200
    guardian = card.json()["guardians"][0]
    assert guardian["display_name"] == ""
    assert guardian["email"] == payload["guardian"]["email"]


def test_a_named_guardian_still_shows_their_full_name(client, as_manager):
    payload = _payload()
    student = _create(client, as_manager, payload)["student"]

    card = client.get(f"/api/v1/students/{student['id']}", headers=as_manager.headers)

    guardian = card.json()["guardians"][0]
    expected = f"{payload['guardian']['first_name']} {payload['guardian']['last_name']}"
    assert guardian["display_name"] == expected


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


def test_wizard_prefill_returns_the_callers_own_children_with_what_the_wizard_needs(
    client, app_session, as_manager, as_guardian
):
    """§5.5's gate opens the one join wizard now, and this is what stops it opening blank.

    Until 2026-09-12 the gate rendered a second, five-step onboarding flow of its own. There
    is one wizard; it BUILDS children rather than loading them, so without this read a
    family blocked for a missing declaration would be asked to re-type a child the club has
    had for weeks.
    """
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    payload = _payload()
    payload["guardian"]["email"] = parent.email
    created = _create(client, as_manager, payload)

    got = client.get("/api/v1/me/wizard-prefill", headers=as_guardian.headers)
    assert got.status_code == 200
    items = got.json()["items"]
    assert [row["id"] for row in items] == [created["student"]["id"]]
    # The fields the wizard's step 2 pre-fills from. `group_ids`, not names: the form binds
    # a group by id, and a name would have to be matched back.
    assert set(items[0]) >= {
        "first_name",
        "last_name",
        "birthdate",
        "grade",
        "group_ids",
        "price_plan_id",
        "health_status",
    }


def test_wizard_prefill_says_which_children_the_club_has_already_been_paid_for(
    client, app_session, as_manager, as_guardian, a_group, a_price_plan
):
    """The field that decides whether the parent walks three steps or two.

    **Keyed on the promise, not on `payment_method`.** A non-null method only says the club
    knows HOW this child pays — every family who has ever completed the wizard has one — and
    reading it as "already paid" would tell a returning family that money they still owe was
    already arranged, while quietly skipping the step that collects it. The `already_paid`
    promise is the manager's own statement that this money reached them in person, and it is
    the only thing here that means what the parent is told it means.
    """
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    payload = _payload()
    payload["guardian"]["email"] = parent.email
    created = _create(client, as_manager, payload)
    student_id = created["student"]["id"]

    before = client.get("/api/v1/me/wizard-prefill", headers=as_guardian.headers).json()
    assert [row["payment_settled"] for row in before["items"]] == [False]

    # Priced, so the conversion raises a first charge for the promise to name.
    response = client.post(
        f"/api/v1/students/{student_id}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-09-01",
            "price_plan_id": str(a_price_plan),
            "payment_settled": True,
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text

    after = client.get("/api/v1/me/wizard-prefill", headers=as_guardian.headers).json()
    assert [row["payment_settled"] for row in after["items"]] == [True]


def test_wizard_prefill_does_not_call_a_known_method_a_settled_payment(
    client, app_session, as_manager, as_guardian, a_group, a_price_plan
):
    """The case the promise-based rule exists for: converted the ORDINARY way, with a
    payment method later recorded. The club knows how they pay; nobody has been paid."""
    from app.models.people import Student
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    payload = _payload()
    payload["guardian"]["email"] = parent.email
    created = _create(client, as_manager, payload)
    student_id = created["student"]["id"]
    client.post(
        f"/api/v1/students/{student_id}/convert",
        json={
            "group_id": str(a_group),
            "started_on": "2026-09-01",
            "price_plan_id": str(a_price_plan),
        },
        headers=as_manager.headers,
    )
    student = app_session.get(Student, uuid.UUID(student_id))
    student.payment_method = "upay_card"
    app_session.commit()

    body = client.get("/api/v1/me/wizard-prefill", headers=as_guardian.headers).json()
    assert body["items"][0]["payment_method"] == "upay_card"
    assert body["items"][0]["payment_settled"] is False


def test_wizard_prefill_never_returns_a_minors_national_id(
    client, app_session, as_manager, as_guardian
):
    """`person.national_id_encrypted` is encrypted at rest so a minor's id is not casually
    in flight, and this read does not undo that. The wizard asks for it again -- one field,
    against widening where that number travels."""
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    payload = _payload()
    payload["guardian"]["email"] = parent.email
    _create(client, as_manager, payload)

    body = client.get("/api/v1/me/wizard-prefill", headers=as_guardian.headers).json()
    assert body["items"]
    for row in body["items"]:
        assert "national_id" not in row


def test_wizard_prefill_never_leaks_another_familys_child(client, as_manager, as_guardian):
    """The same guardian scoping `/me/students` has. Knowing an id is not the check; being
    that child's guardian is."""
    _create(client, as_manager)
    got = client.get("/api/v1/me/wizard-prefill", headers=as_guardian.headers)
    assert got.json()["items"] == []


def test_a_guardian_never_sees_another_familys_child(client, as_manager, as_guardian):
    _create(client, as_manager)
    mine = client.get("/api/v1/me/students", headers=as_guardian.headers)
    assert mine.json()["items"] == []


def test_me_students_needs_no_role(client, as_guardian):
    """§3.1 -- 'guardian is not a role.' §6.1 makes parent access
    `EXISTS(guardian WHERE person_id = :me)`. A `require_roles` here would refuse every
    guardian in the product and admit every coach with no children."""
    assert client.get("/api/v1/me/students", headers=as_guardian.headers).status_code == 200


def test_me_guardians_lists_the_family_once_per_person(
    client, app_session, as_manager, as_guardian
):
    """Ship-audit B4 -- 12i's payer-side read. `ProfileAndLeave` was built against the
    staff route a parent gets 403 from; this is the read it needed. Two children share
    their parents, so the list dedupes by person -- each guardian once, not once per
    child."""
    from app.models.person import Person

    parent = app_session.get(Person, as_guardian.person_id)
    for _ in range(2):
        payload = _payload()
        payload["guardian"]["email"] = parent.email
        _create(client, as_manager, payload)

    mine = client.get("/api/v1/me/guardians", headers=as_guardian.headers)
    assert mine.status_code == 200
    assert [row["person_id"] for row in mine.json()["items"]] == [str(as_guardian.person_id)]


def test_me_guardians_never_leaks_another_family(client, as_manager, as_guardian):
    _create(client, as_manager)
    mine = client.get("/api/v1/me/guardians", headers=as_guardian.headers)
    assert mine.status_code == 200
    assert mine.json()["items"] == []


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


# -- §6.1's profile tab: a guardian edits their OWN contact details -------------
#
# Screen 8 of the parent redesign. `GET /me/guardians` shipped read-only, so the tab the
# design calls "the only screen about the parent rather than their children" had nothing
# on it a parent could actually change. The write is deliberately scoped to the CALLER's
# own person: §5.3 says all guardians are equal, which grants no one the right to rewrite
# the other parent's phone number.


def test_a_guardian_edits_their_own_contact_details(client, as_guardian, app_session):
    from app.models.person import Person

    response = client.patch(
        "/api/v1/me/profile",
        json={"first_name": "שירה", "last_name": "הורה", "phone": "050-1234567"},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["first_name"] == "שירה"
    assert body["phone"] == "050-1234567"

    app_session.expire_all()
    row = app_session.get(Person, as_guardian.person_id)
    assert row is not None
    assert (row.first_name, row.last_name, row.phone) == ("שירה", "הורה", "050-1234567")


def test_a_guardian_may_not_edit_the_other_parent(client, as_manager, as_guardian, app_session):
    """L8/§5.3 -- one guardian view, and no permission branching inside it. That equality
    is about what each parent may do to their OWN record; it is not a licence to rewrite
    the co-parent's. The route takes no person id at all, which is what makes that true."""
    from app.models.person import Person

    payload = _payload()
    created = _create(client, as_manager, payload)
    other_id = uuid.UUID(created["student"]["id"])
    assert other_id  # the family exists; its guardian is a different Person

    before = {
        row.id: (row.first_name, row.phone)
        for row in app_session.scalars(select(Person)).all()
        if row.id != as_guardian.person_id
    }

    response = client.patch(
        "/api/v1/me/profile",
        json={"first_name": "מישהו", "phone": "050-0000000"},
        headers=as_guardian.headers,
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    after = {
        row.id: (row.first_name, row.phone)
        for row in app_session.scalars(select(Person)).all()
        if row.id != as_guardian.person_id
    }
    assert after == before


def test_me_profile_refuses_an_anonymous_caller(client):
    response = client.patch("/api/v1/me/profile", json={"first_name": "x"})
    assert response.status_code in (401, 403)
