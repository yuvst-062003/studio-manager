"""Revision 0025 — an assistant coach names somebody to call.

Three things this has to get right, and the third is the one worth the file: the assistant
can record it, a manager can read it, and **a coach cannot read anyone else's**. These are a
third party's name and phone number, and the whole design rests on the read living on
`GET /staff` (`ManagerOrOwner`) and nowhere a coach can reach.
"""

from __future__ import annotations

API = "/api/v1"

CONTACT = {
    "emergency_contact_name": "רונית גולן",
    "emergency_contact_phone": "0521234567",
    "emergency_contact_relation": "אמא",
}


def test_an_assistant_coach_records_their_own_emergency_contact(client, as_assistant_coach):
    response = client.patch(f"{API}/me/profile", json=CONTACT, headers=as_assistant_coach.headers)
    assert response.status_code == 200, response.text
    for field, value in CONTACT.items():
        assert response.json()[field] == value

    # And reads back what they wrote, which is what lets the first-run step know not to ask
    # again.
    mine = client.get(f"{API}/me/profile", headers=as_assistant_coach.headers).json()
    assert mine["emergency_contact_name"] == "רונית גולן"


def test_it_starts_empty_rather_than_invented(client, as_assistant_coach):
    """No backfill, ever. An assistant who has not filled it in is the ordinary state on
    the day this ships, and a column claiming otherwise would be inventing a contact."""
    mine = client.get(f"{API}/me/profile", headers=as_assistant_coach.headers).json()
    assert mine["emergency_contact_name"] is None
    assert mine["emergency_contact_phone"] is None
    assert mine["emergency_contact_relation"] is None


def test_a_manager_can_read_an_assistants_contact(client, as_assistant_coach, as_manager):
    """The point of collecting it. Write-only data is data nobody can act on in the moment
    it exists for."""
    client.patch(f"{API}/me/profile", json=CONTACT, headers=as_assistant_coach.headers)

    rows = client.get(f"{API}/staff", headers=as_manager.headers).json()["items"]
    row = next(r for r in rows if r["person_id"] == str(as_assistant_coach.person_id))
    assert row["emergency_contact_name"] == "רונית גולן"
    assert row["emergency_contact_phone"] == "0521234567"
    assert row["emergency_contact_relation"] == "אמא"


def test_a_coach_cannot_read_the_staff_list_at_all(client, as_assistant_coach, as_lead_coach):
    """The boundary the whole design rests on.

    `GET /staff` is `ManagerOrOwner`, so a colleague's next-of-kin is not reachable by
    anyone on the mat. If this test ever goes green for a coach, the fields have to move
    off that response rather than the test being changed.
    """
    assert client.get(f"{API}/staff", headers=as_assistant_coach.headers).status_code == 403
    assert client.get(f"{API}/staff", headers=as_lead_coach.headers).status_code == 403


def test_a_lead_coach_may_still_record_one_for_themselves(client, as_lead_coach):
    """Who is ASKED is a product decision (assistants only, see revision 0025); who is
    ALLOWED is the service's own list. Refusing a lead coach who wants to record one would
    be a refusal with nothing behind it."""
    response = client.patch(f"{API}/me/profile", json=CONTACT, headers=as_lead_coach.headers)
    assert response.status_code == 200, response.text
    assert response.json()["emergency_contact_phone"] == "0521234567"


def test_an_explicit_null_clears_it(client, as_assistant_coach):
    """The contact moved away. `null` clears, an absent key leaves alone — the distinction
    `ProfileService.update_own` exists to preserve."""
    client.patch(f"{API}/me/profile", json=CONTACT, headers=as_assistant_coach.headers)

    cleared = client.patch(
        f"{API}/me/profile",
        json={"emergency_contact_phone": None},
        headers=as_assistant_coach.headers,
    ).json()
    assert cleared["emergency_contact_phone"] is None
    # Untouched, because the key was absent rather than null.
    assert cleared["emergency_contact_name"] == "רונית גולן"


def test_the_audit_record_names_the_fields_and_not_the_number(
    client, app_session, as_assistant_coach
):
    """G7. An emergency contact is a third party's phone number, and an audit diff is read
    by more people than the record itself."""
    from app.models.audit import AuditLog
    from sqlalchemy import select

    client.patch(f"{API}/me/profile", json=CONTACT, headers=as_assistant_coach.headers)

    # Every `person.self_updated` row, not "the last one": the id is a UUID, so ordering by
    # it is not ordering by time, and the fixtures write their own rows through this same
    # action. The assertion is about what the field names say and what the values never do.
    rows = list(
        app_session.execute(
            select(AuditLog).where(AuditLog.action == "person.self_updated")
        ).scalars()
    )
    assert any("emergency_contact_phone" in row.diff["fields"] for row in rows)
    for row in rows:
        assert "0521234567" not in str(row.diff)
