"""SPEC §7's `GET /events/{id}.ics`, and §5.8's הוסף ליומן button.

RFC 5545 by hand and not by dependency: `.venv` is a symlink to `main`'s, so installing an
ICS library changes it for the other lane and for `main` -- a stop-and-tell rather than a
lane decision. A VEVENT with seven properties is shorter than the case for the dependency.

**Every timestamp is UTC with a trailing Z.** G3 stores UTC and renders Asia/Jerusalem at
the edge; a calendar file is not the edge -- the subscriber's own client localises it, and
a floating local time lands an event an hour out twice a year.

**A draft has no calendar file.** §4.3 makes a draft invisible to guardians, and a link
that resolved would be that invisibility leaking through a file extension.
"""

from __future__ import annotations


def test_the_file_is_a_single_well_formed_vevent(client, as_manager, an_event):
    response = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/calendar")
    body = response.text
    assert body.startswith("BEGIN:VCALENDAR\r\n")
    assert body.rstrip().endswith("END:VCALENDAR")
    assert body.count("BEGIN:VEVENT") == 1
    assert "VERSION:2.0" in body
    assert f"UID:{an_event}" in body
    assert "SUMMARY:אליפות החורף" in body


def test_every_line_ends_crlf(client, as_manager, an_event):
    """RFC 5545 §3.1. A bare LF is the single most common reason a calendar client rejects
    a file outright rather than showing a parse error."""
    body = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers).text
    assert "\n" in body
    assert body.replace("\r\n", "").count("\n") == 0


def test_every_timestamp_is_utc_with_a_z(client, as_manager, an_event):
    body = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers).text
    stamps = [
        line for line in body.splitlines() if line.startswith(("DTSTART", "DTEND", "DTSTAMP"))
    ]
    assert len(stamps) == 3
    assert all(line.split(":", 1)[1].endswith("Z") for line in stamps), stamps


def test_commas_and_newlines_in_the_description_are_escaped(
    client, app_session, as_manager, an_event
):
    """RFC 5545 §3.3.11. An unescaped comma splits a TEXT value into a list, so a
    description a manager typed normally silently truncates in the subscriber's calendar --
    and a raw newline ends the property early, which is worse."""
    from app.models.events import Event

    event = app_session.get(Event, an_event)
    event.description = "להביא: מים, חגורה\nיציאה 07:00"
    app_session.commit()

    body = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers).text
    line = next(line for line in body.splitlines() if line.startswith("DESCRIPTION"))
    assert "\\," in line
    assert "\\n" in line
    # One DESCRIPTION property, not two -- which is what a raw newline would have produced.
    assert body.count("DESCRIPTION") == 1


def test_a_backslash_is_escaped_before_everything_else(client, app_session, as_manager, an_event):
    """The order matters: replacing the comma first and the backslash second would escape
    the escape and turn `\\,` into `\\\\,` -- a literal backslash followed by a separator."""
    from app.models.events import Event

    event = app_session.get(Event, an_event)
    event.description = "נתיב C:\\מסמכים, וגם"
    app_session.commit()

    body = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers).text
    line = next(line for line in body.splitlines() if line.startswith("DESCRIPTION"))

    # The author's backslash, doubled.
    assert "\\\\מסמכים" in line
    # The separator, escaped ONCE. Getting the order wrong produces `\\,` here -- a literal
    # backslash followed by a live comma, which splits the value into a list. That is the
    # assertion that discriminates: `\\` alone appears under either order, so checking only
    # for it would pass on the bug.
    assert "\\," in line
    assert "\\\\," not in line


def test_a_cancelled_event_says_so_rather_than_disappearing(client, as_manager, an_event):
    """A subscriber who already added the event keeps the row. STATUS:CANCELLED strikes it
    through in their calendar; deleting the file would leave them with a competition that
    is no longer happening and no way to learn that."""
    client.post(f"/api/v1/events/{an_event}/cancel", headers=as_manager.headers)
    body = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers).text
    assert "STATUS:CANCELLED" in body


def test_a_draft_has_no_calendar_file(client, as_manager):
    """§4.3 -- a draft is invisible to guardians, and a resolvable link is that invisibility
    leaking through a file extension."""
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "other",
            "title": "טיוטה",
            "starts_at": "2026-11-26T09:00:00+00:00",
        },
    ).json()
    response = client.get(f"/api/v1/events/{created['id']}.ics", headers=as_manager.headers)
    assert response.status_code == 404


def test_the_ics_route_does_not_shadow_the_event_route(client, as_manager, an_event):
    """FastAPI matches `.ics` as a literal suffix on the path parameter, so the two routes
    are distinguished by declaration order. Asserted because getting it wrong makes
    `GET /events/{id}` fail to parse `<uuid>.ics` as a UUID -- a 422 on a route that looks
    unrelated."""
    plain = client.get(f"/api/v1/events/{an_event}", headers=as_manager.headers)
    assert plain.status_code == 200
    assert plain.headers["content-type"].startswith("application/json")
