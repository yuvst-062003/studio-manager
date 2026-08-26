"""§5.8's event, created and listed. Artboards `7a` and `7b`.

Three things are asserted here that the contract schema cannot assert for itself.

The service supplies `ends_at` when a manager pencils in a date without one.
`EventCreateIn.ends_at` is nullable and `event.ends_at` is not, and
`app/schemas/events.py` says in as many words that closing the gap is the service's job --
§5.8 lets a manager fix a date before the schedule is settled.

A new event is a **draft**, because §4.3 sends nothing to a guardian until it is published,
which is what makes an event safe to build over several sittings.

And `fee_agorot` is a **price**, so a coach-only caller never sees one. §3.2's hard rule is
unqualified: "no charge, payment, debt or price is reachable from any coach-scoped endpoint
or screen."
"""

from __future__ import annotations

import uuid

from tests.events.conftest import EVENT_FEE_AGOROT, T0


def test_a_manager_creates_an_event_and_it_starts_as_a_draft(client, as_manager, a_group):
    response = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "competition",
            "title": "אליפות האביב",
            "starts_at": T0.isoformat(),
            "fee_agorot": EVENT_FEE_AGOROT,
            "requires_consent": True,
            "consent_text": "אני מאשר/ת השתתפות",
            "targets": [{"target_type": "group", "target_id": str(a_group)}],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "draft"
    assert body["fee_agorot"] == EVENT_FEE_AGOROT
    assert [t["target_type"] for t in body["targets"]] == ["group"]


def test_an_event_with_no_end_gets_one_rather_than_a_null_the_column_refuses(client, as_manager):
    """`EventCreateIn.ends_at` is nullable and `event.ends_at` is NOT NULL.

    The value the service supplies must also be strictly later than the start, or
    `event_time_range` rejects the row -- so "default to the start" is not an option.
    """
    response = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={"type": "seminar", "title": "סמינר", "starts_at": T0.isoformat()},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["ends_at"] is not None
    assert body["ends_at"] > body["starts_at"]


def test_a_coach_never_sees_a_price(client, as_assistant_coach, as_manager, an_event):
    """§3.2's hard rule. The row still lists -- a coach who cannot see the event cannot run
    it -- and the price on it is null."""
    seen = client.get("/api/v1/events", headers=as_assistant_coach.headers)
    assert seen.status_code == 200, seen.text
    rows = seen.json()["items"]
    assert rows, "the coach must still see the event itself"
    assert all(row["fee_agorot"] is None for row in rows)

    priced = client.get("/api/v1/events", headers=as_manager.headers).json()["items"]
    assert any(row["fee_agorot"] == EVENT_FEE_AGOROT for row in priced)


def test_an_assistant_coach_cannot_create_an_event(client, as_assistant_coach):
    """§3.2 -- "Create events" is owner, manager and lead_coach. The assistant coach is the
    role on the wrong side of that line, which is why the fixture exists."""
    response = client.post(
        "/api/v1/events",
        headers=as_assistant_coach.headers,
        json={"type": "other", "title": "אירוע", "starts_at": T0.isoformat()},
    )
    assert response.status_code == 403


def test_a_lead_coach_can_create_an_event(client, as_lead_coach):
    response = client.post(
        "/api/v1/events",
        headers=as_lead_coach.headers,
        json={"type": "other", "title": "אירוע", "starts_at": T0.isoformat()},
    )
    assert response.status_code == 201, response.text


def test_the_list_is_cursor_paginated(client, as_manager, an_event):
    response = client.get("/api/v1/events?limit=1", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items", "next_cursor", "has_more"}
    assert all(row["id"] for row in body["items"])


def test_an_event_that_ends_before_it_starts_is_a_field_error_not_a_500(client, as_manager):
    """`EventCreateIn` refuses it and `event_time_range` is the backstop. A CHECK violation
    reaches the manager as a 500 with no field attached, so the form cannot mark the input
    that caused it -- while the actual failure is an ordinary validation error."""
    response = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "seminar",
            "title": "סמינר",
            "starts_at": T0.isoformat(),
            "ends_at": T0.replace(hour=8).isoformat(),
        },
    )
    assert response.status_code == 422


def test_consent_without_its_text_is_a_field_error_too(client, as_manager):
    """§5.8, and `event_consent_has_text`. A parent must never be asked to agree to
    nothing, and the API is where that is said in a way the form can render."""
    response = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "trip",
            "title": "טיול",
            "starts_at": T0.isoformat(),
            "requires_consent": True,
        },
    )
    assert response.status_code == 422


def test_an_event_can_be_edited_while_it_is_a_draft(client, as_manager, a_group):
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={"type": "other", "title": "טיוטה", "starts_at": T0.isoformat()},
    ).json()
    response = client.patch(
        f"/api/v1/events/{created['id']}",
        headers=as_manager.headers,
        json={
            "title": "אירוע ששמו שונה",
            "targets": [{"target_type": "group", "target_id": str(a_group)}],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "אירוע ששמו שונה"
    assert [t["target_id"] for t in body["targets"]] == [str(a_group)]


def test_a_published_event_is_not_edited_in_place(client, as_manager, an_event):
    """`EventUpdateIn` carries no `status` and this route refuses a published row: §5.8
    notifies on publish and on cancel, so a PATCH that moved a published event's date would
    send the club a surprise. 409 rather than 403 -- the caller may edit events; this event
    is past the point where an edit is an edit."""
    response = client.patch(
        f"/api/v1/events/{an_event}",
        headers=as_manager.headers,
        json={"title": "שם אחר"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "event_is_not_a_draft"


def test_reading_an_event_that_is_not_there_is_a_404(client, as_manager):
    response = client.get(f"/api/v1/events/{uuid.uuid4()}", headers=as_manager.headers)
    assert response.status_code == 404
