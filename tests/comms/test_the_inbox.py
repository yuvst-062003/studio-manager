"""§7's `GET /notifications` and `POST /notifications/{id}/read` — artboard `2b`'s list.

    📨 APP LEVEL — in-app inbox
       🔔③  unread badge on the app icon and the tab.
       A permanent הודעות list. No permission needed, never expires.

**D9.1 is enforced by what is absent.** §2.3 puts in-app two-way chat out of scope and §5.11
permits exactly two levels, so there is no send endpoint, no thread and no sender field in
anything below. The canvas showed `שיחה עם המשרד`; the decision cut it.
"""

from __future__ import annotations

import uuid

from app.core.tenancy import use_studio
from app.services.comms import NotificationService
from tests.comms.conftest import T0


def _seed(studio, person_id: uuid.UUID, *, kind: str = "belt.awarded", count: int = 1):
    """Messages arrive through the seam, never by writing rows.

    §5.11's rule is that every message reaches both levels, so a test that inserted
    `notification` directly would be asserting the inbox over a state the product cannot
    actually produce — one with no delivery records behind it.
    """
    notes = []
    with use_studio(studio.id):
        for index in range(count):
            notes.append(
                NotificationService().enqueue(
                    person_id, kind, f"כותרת {index}", f"תוכן {index}", {"index": index}
                )
            )
    return notes


def _inbox(client, caller, **params):
    return client.get("/api/v1/notifications", params=params, headers=caller.headers)


def test_the_inbox_returns_this_persons_messages(client, studio, as_guardian_of, a_student) -> None:
    parent = as_guardian_of(a_student)
    _seed(studio, parent.person_id, count=2)
    response = _inbox(client, parent)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["items"]) == 2
    assert {item["kind"] for item in body["items"]} == {"belt.awarded"}


def test_the_inbox_never_returns_another_familys_message(
    client, studio, as_guardian_of, as_manager, a_student
) -> None:
    """A notification is addressed to a person. Another family's row appearing here is a
    privacy incident rather than a bug."""
    parent = as_guardian_of(a_student)
    _seed(studio, as_manager.person_id, count=3)
    assert _inbox(client, parent).json()["items"] == []


def test_the_inbox_is_newest_first(client, studio, as_guardian_of, a_student) -> None:
    """A parent opens this to see what just happened. Oldest-first would put a cancellation
    from September above tonight's."""
    parent = as_guardian_of(a_student)
    _seed(studio, parent.person_id, count=3)
    titles = [item["title"] for item in _inbox(client, parent).json()["items"]]
    assert titles == sorted(titles, reverse=True)


def test_the_inbox_is_cursor_paginated(client, studio, as_guardian_of, a_student) -> None:
    """G16. A keyset cursor rather than an offset, because a parent's inbox is written to
    while they are scrolling it — a cancellation arriving mid-scroll makes LIMIT/OFFSET
    repeat or skip a row."""
    parent = as_guardian_of(a_student)
    _seed(studio, parent.person_id, count=5)

    first = _inbox(client, parent, limit=2).json()
    assert len(first["items"]) == 2
    assert first["has_more"] is True

    second = _inbox(client, parent, limit=2, after=first["next_cursor"]).json()
    assert len(second["items"]) == 2
    # No overlap: the cursor names a position, not a count.
    assert {i["id"] for i in first["items"]}.isdisjoint({i["id"] for i in second["items"]})

    third = _inbox(client, parent, limit=2, after=second["next_cursor"]).json()
    assert len(third["items"]) == 1
    assert third["has_more"] is False
    assert third["next_cursor"] is None


def test_a_message_arrives_unread(client, studio, as_guardian_of, a_student) -> None:
    parent = as_guardian_of(a_student)
    _seed(studio, parent.person_id)
    assert _inbox(client, parent).json()["items"][0]["read_at"] is None


def test_marking_one_read_leaves_the_rest_alone(client, studio, as_guardian_of, a_student) -> None:
    parent = as_guardian_of(a_student)
    notes = _seed(studio, parent.person_id, count=3)
    response = client.post(f"/api/v1/notifications/{notes[0].id}/read", headers=parent.headers)
    assert response.status_code == 200, response.text
    assert response.json()["read_at"] is not None

    unread = _inbox(client, parent, unread=True).json()["items"]
    assert len(unread) == 2


def test_marking_read_is_idempotent(client, studio, as_guardian_of, a_student) -> None:
    """A second call keeps the first `read_at`. A moving timestamp would reorder an inbox
    under a parent's thumb — and since the badge count is right either way, it is the kind of
    bug nobody finds until somebody complains that messages jump around."""
    parent = as_guardian_of(a_student)
    note = _seed(studio, parent.person_id)[0]
    first = client.post(f"/api/v1/notifications/{note.id}/read", headers=parent.headers).json()
    second = client.post(
        f"/api/v1/notifications/{note.id}/read",
        headers={**parent.headers, "X-Dev-Now": T0.replace(hour=20).isoformat()},
    ).json()
    assert first["read_at"] == second["read_at"]


def test_a_message_i_do_not_own_is_a_404_and_not_a_403(
    client, studio, as_guardian_of, as_manager, a_student
) -> None:
    """403 confirms the row exists. For a message addressed to another family, that
    confirmation is itself the leak."""
    parent = as_guardian_of(a_student)
    other = _seed(studio, as_manager.person_id)[0]
    response = client.post(f"/api/v1/notifications/{other.id}/read", headers=parent.headers)
    assert response.status_code == 404, response.text


def test_marking_all_read_reports_how_many_were_unread(
    client, studio, as_guardian_of, a_student
) -> None:
    """`inbox.markAllRead`. The count is what the screen shows, and counting rows it did not
    change would tell a parent it cleared messages it never touched."""
    parent = as_guardian_of(a_student)
    notes = _seed(studio, parent.person_id, count=3)
    client.post(f"/api/v1/notifications/{notes[0].id}/read", headers=parent.headers)

    response = client.post("/api/v1/notifications/read-all", headers=parent.headers)
    assert response.status_code == 200, response.text
    assert response.json()["marked"] == 2
    assert _inbox(client, parent, unread=True).json()["items"] == []


def test_the_unread_filter_returns_only_unread(client, studio, as_guardian_of, a_student) -> None:
    """§5.11's `🔔③` badge reads this. Served by the partial index, which exists because
    within a month of use the read rows are the overwhelming majority."""
    parent = as_guardian_of(a_student)
    notes = _seed(studio, parent.person_id, count=2)
    client.post(f"/api/v1/notifications/{notes[0].id}/read", headers=parent.headers)
    unread = _inbox(client, parent, unread=True).json()["items"]
    assert [item["id"] for item in unread] == [str(notes[1].id)]


def test_the_inbox_carries_the_payload_the_tap_opens(
    client, studio, as_guardian_of, a_student
) -> None:
    """§4.3 — `payload` is what the tap opens, so the row can route without the client
    re-deriving a destination from the title."""
    parent = as_guardian_of(a_student)
    _seed(studio, parent.person_id)
    assert _inbox(client, parent).json()["items"][0]["payload"] == {"index": 0}


def test_there_is_no_way_to_send_a_message_from_the_inbox(
    client, as_guardian_of, a_student
) -> None:
    """D9.1 and §2.3, as a route that does not exist. §5.11 permits exactly two levels — a
    push notification and a ONE-WAY inbox — and a conversation thread with the office is a
    third thing. The canvas showed it; the decision cut it."""
    parent = as_guardian_of(a_student)
    for path in ("/api/v1/notifications", "/api/v1/notifications/reply"):
        response = client.post(path, json={"body": "שלום"}, headers=parent.headers)
        assert response.status_code in (404, 405), f"{path} accepted a message: {response.text}"


def test_the_inbox_requires_a_signed_in_person(client) -> None:
    assert client.get("/api/v1/notifications").status_code == 401
