"""§5.15's training year and §5.6's closures, through the API.

The one rule that shapes both: **a preset is a proposal**. `GET /holiday-presets` never
writes a row, and the only thing that creates a `studio_closure` is a manager POSTing one.
"""

from __future__ import annotations

import uuid as _uuid

from app.models.schedule import TrainingYear
from app.models.studio import Studio
from tests.schedule.conftest import YEAR_ENDS, YEAR_STARTS

API = "/api/v1"


def test_a_manager_creates_a_training_year_and_it_starts_as_a_draft(client, as_manager):
    """§5.15 — the wizard is resumable and 'nothing is visible to guardians until it is
    activated', which is why `draft` is a persisted state rather than wizard memory."""
    response = client.post(
        f"{API}/training-years",
        headers=as_manager.headers,
        json={"name": "תשפ״ח", "starts_on": "2027-09-01", "ends_on": "2028-06-30"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "draft"
    assert response.json()["name"] == "תשפ״ח"


def test_a_year_that_ends_before_it_starts_is_refused_by_the_schema(client, as_manager):
    response = client.post(
        f"{API}/training-years",
        headers=as_manager.headers,
        json={"name": "הפוך", "starts_on": "2027-09-01", "ends_on": "2027-08-01"},
    )
    assert response.status_code == 422


def test_a_coach_may_read_the_years_but_never_create_one(client, as_lead_coach):
    """§3.2 — 'Create/edit classes, groups, schedules' is owner and manager. A coach reads
    the schedule because a roster is unreadable without it."""
    assert client.get(f"{API}/training-years", headers=as_lead_coach.headers).status_code == 200
    refused = client.post(
        f"{API}/training-years",
        headers=as_lead_coach.headers,
        json={"name": "לא", "starts_on": "2027-09-01", "ends_on": "2028-06-30"},
    )
    assert refused.status_code == 403


def test_an_anonymous_caller_gets_401_not_403(client):
    assert client.get(f"{API}/training-years").status_code == 401


def test_the_year_list_is_cursor_paginated(client, as_manager, an_active_year):
    body = client.get(f"{API}/training-years?limit=1", headers=as_manager.headers).json()
    assert set(body) == {"items", "next_cursor", "has_more"}


def test_holiday_presets_are_offered_for_a_gregorian_year(client, as_manager):
    """§7 — `GET /holiday-presets?year=2026`."""
    response = client.get(f"{API}/holiday-presets?year=2026", headers=as_manager.headers)
    assert response.status_code == 200
    by_key = {p["key"]: p for p in response.json()}
    assert by_key["yom_kippur"]["date_from"] == "2026-09-21"
    assert by_key["summer_break"]["date_from"] == "2026-07-01"


def test_asking_for_presets_creates_no_closure(client, as_manager, an_active_year):
    """§5.6, the whole rule: 'Nothing is closed automatically — studios differ, and a wrong
    guess deletes real lessons.'"""
    client.get(f"{API}/holiday-presets?year=2026", headers=as_manager.headers)
    listed = client.get(
        f"{API}/closures?training_year_id={an_active_year}", headers=as_manager.headers
    )
    assert listed.json()["items"] == []


def test_a_preset_becomes_a_closure_only_when_the_manager_posts_it(
    client, as_manager, an_active_year
):
    response = client.post(
        f"{API}/closures",
        headers=as_manager.headers,
        json={
            "training_year_id": str(an_active_year),
            "date_from": "2026-09-21",
            "date_to": "2026-09-21",
            "reason": "יום כיפור",
            "source": "holiday_preset",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["source"] == "holiday_preset"
    assert response.json()["sessions_cancelled"] == 0


def test_a_closure_source_outside_the_two_the_column_allows_is_refused(
    client, as_manager, an_active_year
):
    response = client.post(
        f"{API}/closures",
        headers=as_manager.headers,
        json={
            "training_year_id": str(an_active_year),
            "date_from": "2026-09-21",
            "date_to": "2026-09-21",
            "reason": "משהו",
            "source": "guessed",
        },
    )
    assert response.status_code == 422


def test_a_closure_for_another_studios_year_is_invisible_rather_than_forbidden(
    client, as_manager, app_session
):
    """The tenant filter makes the row invisible; a 403 would confirm it exists."""
    other = Studio(name="מועדון אחר", slug=f"o-{_uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    year = TrainingYear(
        studio_id=other.id,
        name="שלהם",
        starts_on=YEAR_STARTS,
        ends_on=YEAR_ENDS,
        status="active",
    )
    app_session.add(year)
    app_session.commit()

    response = client.post(
        f"{API}/closures",
        headers=as_manager.headers,
        json={
            "training_year_id": str(year.id),
            "date_from": "2026-09-21",
            "date_to": "2026-09-21",
            "reason": "לא שלנו",
            "source": "manual",
        },
    )
    assert response.status_code == 404
