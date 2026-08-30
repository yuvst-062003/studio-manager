"""The training-plan routes: the parent's screen, marking, and the manager's queue.

Two rules carry the weight here and neither is about a happy path.

**A parent reaches their own children and nobody else's**, and a foreign student id reads
as 404 rather than 403 — probing ids must not tell anyone which of them exist.

**§13's third invariant.** Every plan shape carries `monthly_amount_agorot`, so no route in
`app/routers/training_plans.py` may be coach-tagged. The one thing a coach needs — who has
marked tonight's session — lives on its own tagged router and returns names and no money.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.models.training_plan import SessionBooking
from tests.schedule.conftest import NOW, SUNDAY, make_session, make_student


def _headers(caller):
    return caller.headers


def test_a_parent_reads_their_own_childs_plan(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    parent = as_guardian_of(student_id, is_primary=True)
    response = client.get(f"/api/v1/students/{student_id}/training-plan", headers=parent.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current_plan"]["name"] == "400"
    # 400 ₪ buys one extra a week, and none has been spent.
    assert body["credits_remaining"] == 1
    # §5.1 — a Group 3 child reaches two extras, so all three plans raise the week.
    assert [plan["is_offered"] for plan in body["plans"]] == [True, True, True]


def test_another_familys_child_reads_as_not_found(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    mine = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    theirs = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    parent = as_guardian_of(mine, is_primary=True)
    response = client.get(f"/api/v1/students/{theirs}/training-plan", headers=parent.headers)
    assert response.status_code == 404


def test_a_plan_that_buys_nothing_is_shown_with_its_reason_rather_than_hidden(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    """§5.1 — a greyed plan is SHOWN. A parent who hears '550' from another parent in the
    hall and finds nothing in the app phones the manager."""
    student_id = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 2"]
    )
    parent = as_guardian_of(student_id, is_primary=True)
    body = client.get(f"/api/v1/students/{student_id}/training-plan", headers=parent.headers).json()
    by_name = {plan["name"]: plan for plan in body["plans"]}
    assert len(by_name) == 3, "all three are listed"
    # A Group 2 child reaches exactly one extra, so 550 resolves to the same week as 400.
    assert by_name["550"]["is_offered"] is False


def test_marking_and_releasing_through_the_routes(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    parent = as_guardian_of(student_id, is_primary=True)
    created = client.post(
        "/api/v1/session-bookings",
        json={"student_id": str(student_id), "session_id": str(session_id)},
        headers=parent.headers,
    )
    assert created.status_code == 201, created.text
    booking_id = created.json()["id"]

    released = client.delete(f"/api/v1/session-bookings/{booking_id}", headers=parent.headers)
    assert released.status_code == 200
    assert released.json()["cancelled_at"] is not None


def test_a_refusal_names_its_reason_rather_than_failing_generically(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    """§7 — every refusal names the reason, because 'you cannot mark this' with no
    explanation is a support call."""
    student_id = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    parent = as_guardian_of(student_id, is_primary=True)
    refused = client.post(
        "/api/v1/session-bookings",
        json={"student_id": str(student_id), "session_id": str(session_id)},
        headers=parent.headers,
    )
    assert refused.status_code == 422
    assert refused.json()["detail"]["code"] == "refused"
    assert refused.json()["detail"]["message"]


def test_a_parent_may_not_mark_for_another_familys_child(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    mine = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    theirs = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    parent = as_guardian_of(mine, is_primary=True)
    response = client.post(
        "/api/v1/session-bookings",
        json={"student_id": str(theirs), "session_id": str(session_id)},
        headers=parent.headers,
    )
    assert response.status_code == 404


def test_the_coachs_roster_is_the_live_bookings_and_carries_no_money(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of, as_lead_coach
):
    """§8 — an extra session's roster is exactly its live bookings. And invariant 3: this is
    the one route in the feature a coach may call, which is why it returns names only."""
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    parent = as_guardian_of(student_id, is_primary=True)
    client.post(
        "/api/v1/session-bookings",
        json={"student_id": str(student_id), "session_id": str(session_id)},
        headers=parent.headers,
    )
    roster = client.get(f"/api/v1/sessions/{session_id}/bookings", headers=as_lead_coach.headers)
    assert roster.status_code == 200, roster.text
    body = roster.json()
    assert body["marked_count"] == 1
    assert body["items"][0]["student_name"]
    assert "agorot" not in roster.text


def test_a_coach_cannot_read_a_training_plan(
    client, app_session, studio, plans, timetable, an_active_year, as_lead_coach
):
    """Invariant 3's refused side. The plan shape carries three monthly amounts."""
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    response = client.get(
        f"/api/v1/students/{student_id}/training-plan", headers=as_lead_coach.headers
    )
    assert response.status_code == 404


def test_the_manager_sets_a_groups_kind_and_its_eligibility(
    client, app_session, studio, timetable, as_manager
):
    patched = client.patch(
        f"/api/v1/groups/{timetable['קרוספיט שני']}/training-kind",
        json={"kind": "extra", "is_invite_only": False},
        headers=as_manager.headers,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["kind"] == "extra"

    replaced = client.put(
        f"/api/v1/groups/{timetable['קרוספיט שני']}/eligibility",
        json={"base_group_ids": [str(timetable["קבוצה 2"]), str(timetable["קבוצה 3"])]},
        headers=as_manager.headers,
    )
    assert replaced.status_code == 200, replaced.text
    assert len(replaced.json()["base_group_ids"]) == 2

    # A full REPLACE, not an add: the manager's mental model is a checklist.
    narrowed = client.put(
        f"/api/v1/groups/{timetable['קרוספיט שני']}/eligibility",
        json={"base_group_ids": [str(timetable["קבוצה 3"])]},
        headers=as_manager.headers,
    )
    assert narrowed.json()["base_group_ids"] == [str(timetable["קבוצה 3"])]


def test_an_unknown_kind_is_refused(client, timetable, as_manager):
    response = client.patch(
        f"/api/v1/groups/{timetable['קרוספיט שני']}/training-kind",
        json={"kind": "team"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_the_settlement_queue_carries_the_difference_a_manager_must_collect(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of, as_manager
):
    """§11 — 'collect 100 ₪ × the remaining months' is the instruction, and a manager should
    not have to look two prices up to compute it."""
    student_id = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 3"]
    )
    parent = as_guardian_of(student_id, is_primary=True)
    created = client.post(
        f"/api/v1/students/{student_id}/plan-changes",
        json={"to_price_plan_id": str(plans["400"])},
        headers=parent.headers,
    )
    assert created.status_code == 201, created.text

    queue = client.get("/api/v1/plan-changes", headers=as_manager.headers).json()
    row = next(item for item in queue["items"] if item["student_id"] == str(student_id))
    assert row["monthly_difference_agorot"] == 10_000
    assert row["to_plan_name"] == "400"
    assert row["settlement_status"] == "pending"

    settled = client.post(f"/api/v1/plan-changes/{row['id']}/settle", headers=as_manager.headers)
    assert settled.status_code == 200
    assert settled.json()["settlement_status"] == "settled"


def test_a_parent_cancels_their_own_scheduled_change(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    parent = as_guardian_of(student_id, is_primary=True)
    created = client.post(
        f"/api/v1/students/{student_id}/plan-changes",
        json={"to_price_plan_id": str(plans["300"])},
        headers=parent.headers,
    ).json()
    assert created["status"] == "scheduled"
    cancelled = client.delete(
        f"/api/v1/students/{student_id}/plan-changes/{created['id']}",
        headers=parent.headers,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_marking_writes_a_row_the_service_can_see(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of, tenant_session
):
    """A route test that reaches the table, so a commit that never happened cannot pass."""
    student_id = make_student(
        app_session, studio, plan_id=plans["550"], base_group_id=timetable["קבוצה 3"]
    )
    session_id = make_session(app_session, studio, an_active_year, timetable["ג'ודו ראשון"], SUNDAY)
    parent = as_guardian_of(student_id, is_primary=True)
    created = client.post(
        "/api/v1/session-bookings",
        json={"student_id": str(student_id), "session_id": str(session_id)},
        headers=parent.headers,
    ).json()
    row = tenant_session.get(SessionBooking, uuid.UUID(created["id"]))
    assert row is not None and row.cancelled_at is None
    assert NOW  # the module's shared clock constant, kept in scope for the imports above


def test_each_sibling_reads_their_own_plan_and_spends_their_own_credit(
    client, app_session, studio, plans, timetable, an_active_year, as_guardian_of
):
    """One parent, two children, two plans — each child's screen is priced and gated by
    THEIR plan (owner verification, 2026-08-30). Marking a session for the 400-plan child
    spends that child's credit and leaves the sibling's untouched."""
    from app.models.person import Guardian

    older = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    younger = make_student(
        app_session, studio, plan_id=plans["300"], base_group_id=timetable["קבוצה 2"]
    )
    parent = as_guardian_of(older, is_primary=True)
    app_session.add(Guardian(studio_id=studio.id, person_id=parent.person_id, student_id=younger))
    app_session.commit()
    # Inside the caller's club week: `Caller.headers` pins X-Dev-Now to T0 (Tue 2026-11-03),
    # and credits_remaining counts THAT week's spend — so the booking must land in
    # Nov 1–7, after T0 itself. SUNDAY (the 15th) is two weeks out and would not count.
    this_thursday = datetime(2026, 11, 5, 14, 0, tzinfo=UTC)
    session_id = make_session(
        app_session, studio, an_active_year, timetable["ג'ודו ראשון"], this_thursday
    )

    older_view = client.get(
        f"/api/v1/students/{older}/training-plan", headers=parent.headers
    ).json()
    younger_view = client.get(
        f"/api/v1/students/{younger}/training-plan", headers=parent.headers
    ).json()
    assert older_view["current_plan"]["name"] == "400"
    assert younger_view["current_plan"]["name"] == "300"
    # 400 buys one weekly extra; 300 buys none — and the refusal names the plan, per child.
    assert older_view["credits_remaining"] == 1
    assert younger_view["credits_remaining"] == 0

    marked = client.post(
        "/api/v1/session-bookings",
        json={"student_id": str(older), "session_id": str(session_id)},
        headers=parent.headers,
    )
    assert marked.status_code == 201, marked.text
    after = client.get(f"/api/v1/students/{older}/training-plan", headers=parent.headers).json()
    sibling_after = client.get(
        f"/api/v1/students/{younger}/training-plan", headers=parent.headers
    ).json()
    assert after["credits_remaining"] == 0
    assert sibling_after["credits_remaining"] == 0  # still their own zero, not a shared pool
