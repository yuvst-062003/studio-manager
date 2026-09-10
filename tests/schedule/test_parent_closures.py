"""Bug #20 — a day with no sessions must be able to say *why*.

`materialize_sessions` skips a closed date (§5.6), so a holiday produces no session row
at all. That is correct, and it is also the reason every calendar in the product renders a
closed day as an ordinary empty one: there is nothing on the day to read a reason off.

The reason has to come from the closure itself, and until this route existed the parent
app could not reach one — `GET /closures` is `AnyStaff`. `GET /me/closures` is the
guardian-readable read, on `/me/studio`'s pattern: no role dependency, a `person_id` check,
and a shape that is the club's shop window (holiday names and dates) rather than a
settings read.
"""

from __future__ import annotations

from tests.schedule.conftest import make_student

API = "/api/v1"


def _a_closure(client, as_manager, an_active_year, *, date_from, date_to, reason):
    created = client.post(
        f"{API}/closures",
        headers=as_manager.headers,
        json={
            "training_year_id": str(an_active_year),
            "date_from": date_from,
            "date_to": date_to,
            "reason": reason,
            "source": "holiday_preset",
        },
    )
    assert created.status_code == 201, created.text
    return created


def test_a_parent_reads_the_clubs_closures(
    client, app_session, studio, plans, timetable, an_active_year, as_manager, as_guardian_of
):
    """The whole of #20: the parent app must be able to name the holiday."""
    _a_closure(
        client,
        as_manager,
        an_active_year,
        date_from="2026-09-21",
        date_to="2026-09-21",
        reason="יום כיפור",
    )
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    parent = as_guardian_of(student_id, is_primary=True)

    response = client.get(f"{API}/me/closures", headers=parent.headers)

    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [(c["date_from"], c["date_to"], c["reason"]) for c in items] == [
        ("2026-09-21", "2026-09-21", "יום כיפור")
    ]


def test_the_parent_read_is_windowed_by_date(
    client, app_session, studio, plans, timetable, an_active_year, as_manager, as_guardian_of
):
    """A calendar asks about the month it is showing, not about the whole year. The window
    overlaps rather than contains — a סוכות range that starts in September and ends in
    October belongs to both months' screens."""
    _a_closure(
        client,
        as_manager,
        an_active_year,
        date_from="2026-09-21",
        date_to="2026-09-21",
        reason="יום כיפור",
    )
    _a_closure(
        client,
        as_manager,
        an_active_year,
        date_from="2026-09-26",
        date_to="2026-10-03",
        reason="סוכות",
    )
    student_id = make_student(
        app_session, studio, plan_id=plans["400"], base_group_id=timetable["קבוצה 3"]
    )
    parent = as_guardian_of(student_id, is_primary=True)

    october = client.get(f"{API}/me/closures?from=2026-10-01&to=2026-10-31", headers=parent.headers)
    assert october.status_code == 200, october.text
    assert [c["reason"] for c in october.json()["items"]] == ["סוכות"]


def test_an_anonymous_caller_gets_401_not_the_closures(client):
    assert client.get(f"{API}/me/closures").status_code == 401
