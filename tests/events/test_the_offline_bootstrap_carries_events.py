"""§6.5 of the staff app redesign (decision 14) — "does event attendance work offline? Yes."

Two seams, each tested here rather than only in `packages/core`: `GET /sync/bootstrap` has
to hand a staff caller an event and its roster in the SAME two-day window sessions already
get, and `POST /events/{id}/attendance` has to say what the event's status was at write
time, because nothing else on that response tells the offline flusher whether it just wrote
against a cancelled one.

Neither of these existed before this wave: the bootstrap payload carried only sessions, and
`EventAttendanceOut` carried only `marked`.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from tests.events.conftest import T0

BOOTSTRAP = "/api/v1/sync/bootstrap"


def _window(days: int) -> dict[str, str]:
    start = (T0 + timedelta(days=days)).date()
    return {"from": start.isoformat(), "to": (start + timedelta(days=1)).isoformat()}


def test_a_published_event_and_its_roster_ride_in_the_staff_bootstrap(
    client, as_lead_coach, an_event, a_registered_student, a_student
):
    """§6.5 item 2 — "GET /sync/bootstrap returns events and their registrations alongside
    sessions, in the same two-day window and the same shapes." `an_event` is fourteen days
    out, well past the default today/tomorrow window, so this also proves the event is
    windowed exactly like a session rather than always included."""
    response = client.get(BOOTSTRAP, params=_window(14), headers=as_lead_coach.headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert [event["id"] for event in body["events"]] == [str(an_event)]
    assert body["events"][0]["title"] == "אליפות החורף"
    assert body["events"][0]["status"] == "published"
    assert body["events"][0]["location_name"] == "היכל הספורט, תל אביב"

    roster = body["event_rosters"][str(an_event)]
    assert [row["student_id"] for row in roster] == [str(a_student)]
    # §6.5's "same shapes", literally: this is `RosterEntry`, the identical model a
    # session's roster uses — not a parallel event-specific shape.
    assert roster[0]["status"] == "absent_unexcused"
    assert "has_absence_report" in roster[0]


def test_an_event_outside_the_window_does_not_ride_along(client, as_lead_coach, an_event):
    """The window bound applies to events exactly as it does to sessions — an event a coach
    is not about to run is not offline-cached content for them yet."""
    response = client.get(BOOTSTRAP, params=_window(0), headers=as_lead_coach.headers)
    assert response.status_code == 200, response.text
    assert response.json()["events"] == []


def test_a_draft_event_does_not_ride_in_the_bootstrap(client, app_session, as_lead_coach, an_event):
    """A draft has no registrations yet — publishing is what materialises them — so caching
    one would cache an empty roster for nothing. `CACHED_EVENT_STATUSES` excludes it."""
    from app.models.events import Event

    row = app_session.get(Event, an_event)
    row.status = "draft"
    app_session.commit()

    response = client.get(BOOTSTRAP, params=_window(14), headers=as_lead_coach.headers)
    assert response.json()["events"] == []


def test_a_guardian_gets_no_events_from_the_same_endpoint(
    client, as_guardian_of, an_event, a_registered_student, a_student
):
    """§10.2's narrower, read-only cache is a session's guardian scope; events are staff
    content for this checkpoint (decision 14 is about a COACH's offline attendance), so a
    guardian's own read of this endpoint carries none, the same way it never carries a
    session's briefing (§6.2)."""
    guardian = as_guardian_of(a_student)
    response = client.get(BOOTSTRAP, params=_window(14), headers=guardian.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["events"] == []
    assert body["event_rosters"] == {}


def test_recording_attendance_reports_the_events_status_at_write_time(
    client, as_assistant_coach, a_student, an_event, a_registered_student
):
    """§6.5's `event_status` field. `mark_attendance` never refuses to write against a
    cancelled event, so this is the one thing on the response that lets the offline flusher
    (`packages/core/src/offline/sync.ts::sendEventBatch`) tell a clean write from one that
    just landed on a cancelled event."""
    response = client.post(
        f"/api/v1/events/{an_event}/attendance",
        headers=as_assistant_coach.headers,
        json={"marks": [{"student_id": str(a_student), "attended": True}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["event_status"] == "published"


def test_a_cancelled_events_status_still_reaches_the_attendance_response(
    client, as_lead_coach, as_assistant_coach, a_student, an_event, a_registered_student
):
    """§5.8 — "the roster survives" a cancellation, so a coach can still correct attendance
    afterwards. The write succeeds AND says the event is cancelled, which is what lets the
    offline flusher raise §6.5's conflict card without the server refusing the write."""
    cancel = client.post(f"/api/v1/events/{an_event}/cancel", headers=as_lead_coach.headers)
    assert cancel.status_code == 200, cancel.text

    response = client.post(
        f"/api/v1/events/{an_event}/attendance",
        headers=as_assistant_coach.headers,
        json={"marks": [{"student_id": str(a_student), "attended": True}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["marked"] == 1
    assert response.json()["event_status"] == "cancelled"


def test_a_mark_for_an_unregistered_student_is_not_counted(
    client, as_assistant_coach, an_event, a_registered_student
):
    """`RsvpService.mark_attendance` silently skips a `student_id` with no matching
    registration. `marked` coming back lower than the number of marks sent is the only
    signal the offline flusher has for §6.5's "a child no longer registered" conflict."""
    response = client.post(
        f"/api/v1/events/{an_event}/attendance",
        headers=as_assistant_coach.headers,
        json={"marks": [{"student_id": str(uuid.uuid4()), "attended": True}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["marked"] == 0
