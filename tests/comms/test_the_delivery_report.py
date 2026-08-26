"""§5.11's delivery report — the screen that turns a silent failure into a phone call.

    ביטול שיעור — ג'ודו/מתחילים, היום 17:00

    נשלח ל-24 משפחות
    ✓ 19 קיבלו
    ⚠ 5 לא קיבלו — התראות כבויות

      יעל כהן        054-123-4567
      דנה לוי        052-987-6543

    [ העתק מספרים ]        [ שלח שוב ]

"The manager pastes those numbers into the WhatsApp group the club already has. Same outcome
as automation, half a day of work, zero risk."

**The numbers are the point.** §5.11 permits no email, no SMS and no WhatsApp channel, so a
family whose push did not land and who is not reading the inbox is reachable only by
telephone. A report that said "5 didn't receive it" without saying which five, and without
their numbers, would tell a manager that five children may turn up to a cancelled class
without telling them which five.
"""

from __future__ import annotations

import uuid

from app.models.comms import Notification, NotificationDelivery
from app.models.person import Person
from sqlalchemy import select


def _publish_to(client, manager, **body):
    payload = {"title": "ביטול שיעור", "body": "השיעור היום מבוטל", "scope_type": "studio"}
    payload.update(body)
    created = client.post("/api/v1/announcements", json=payload, headers=manager.headers).json()
    client.post(f"/api/v1/announcements/{created['id']}/publish", headers=manager.headers)
    return created["id"]


def _report(client, caller, announcement_id):
    return client.get(f"/api/v1/announcements/{announcement_id}/delivery", headers=caller.headers)


def _push_row(session, announcement_id, person_id) -> NotificationDelivery:
    return session.execute(
        select(NotificationDelivery)
        .join(Notification, Notification.id == NotificationDelivery.notification_id)
        .where(
            Notification.payload["announcement_id"].astext == str(announcement_id),
            Notification.person_id == person_id,
            NotificationDelivery.channel == "push",
        )
    ).scalar_one()


def _set_push(session, announcement_id, person_id, status: str, error: str | None = None) -> None:
    """Move one family's push row to a state only the worker produces."""
    row = _push_row(session, announcement_id, person_id)
    row.status = status
    row.error = error
    session.commit()


def test_the_report_counts_families_received_and_missed(
    client, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """§5.11's three numbers: נשלח ל-N משפחות, N קיבלו, N לא קיבלו."""
    received = a_guardian_for(an_enrolled_student, name="קיבלה")
    missed = a_guardian_for(an_enrolled_student, name="פספסה")
    a_push_token(received)

    announcement_id = _publish_to(client, as_manager)
    _set_push(tenant_session, announcement_id, received, "delivered")

    body = _report(client, as_manager, announcement_id).json()
    assert body["sent_count"] == 2
    assert body["received_count"] == 1
    assert body["missed_count"] == 1
    # And it is the right one. Counts that add up while naming the wrong family would send
    # the office to phone somebody who already knows.
    assert [row["person_id"] for row in body["missed"]] == [str(missed)]


def test_every_missed_family_carries_a_name_and_a_number(
    client, app_session, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """This is the whole feature. §5.11 chose the phone number over a WhatsApp Business
    integration -- "same outcome as automation, half a day of work, zero risk" -- and it only
    works if the manager can read the numbers off the screen."""
    parent = a_guardian_for(an_enrolled_student, name="יעל")
    announcement_id = _publish_to(client, as_manager)

    missed = _report(client, as_manager, announcement_id).json()["missed"]
    assert len(missed) == 1
    row = missed[0]
    assert row["person_id"] == str(parent)
    stored = app_session.get(Person, parent)
    assert row["name"] == f"{stored.first_name} {stored.last_name}"
    assert row["phone"] == stored.phone


def test_a_send_still_in_flight_is_neither_received_nor_missed(
    client, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """`queued` is not a miss. The schema's own docstring says why: reporting one would send a
    manager chasing families whose phone is about to buzz."""
    parent = a_guardian_for(an_enrolled_student, name="ממתינה")
    a_push_token(parent)
    announcement_id = _publish_to(client, as_manager)

    body = _report(client, as_manager, announcement_id).json()
    assert body["sent_count"] == 1
    assert body["received_count"] == 0
    assert body["missed_count"] == 0
    assert body["missed"] == []
    # `delivery.inFlight` -- ההודעה עדיין נשלחת -- is the DIFFERENCE, and there is no fourth
    # count on the contract shape because it would be derivable from the other three and free
    # to disagree with them. This asserts the arithmetic the screen renders.
    assert body["sent_count"] - body["received_count"] - body["missed_count"] == 1


def test_the_three_reasons_are_never_merged(
    client, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """`no_token`, `denied` and `failed` are three conversations: help them install, ask them
    to turn the permission on, retry the send. "5 didn't get it" is a number nobody can act
    on; "האפליקציה לא הותקנה" is a phone call with a purpose."""
    never_installed = a_guardian_for(an_enrolled_student, name="לא התקין")
    switched_off = a_guardian_for(an_enrolled_student, name="כיבה")
    errored = a_guardian_for(an_enrolled_student, name="נכשל")
    a_push_token(switched_off)
    a_push_token(errored)

    announcement_id = _publish_to(client, as_manager)
    _set_push(tenant_session, announcement_id, switched_off, "denied")
    _set_push(tenant_session, announcement_id, errored, "failed", "UNREGISTERED")

    missed = {
        row["person_id"]: row["reason"]
        for row in _report(client, as_manager, announcement_id).json()["missed"]
    }
    assert missed[str(never_installed)] == "no_token"
    assert missed[str(switched_off)] == "denied"
    assert missed[str(errored)] == "failed"


def test_a_preference_denial_reads_as_denied_to_the_office(
    client, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """A parent who switched club announcements off is `התראות כבויות` on this screen, which
    is exactly the conversation to have with them. The `error='preference'` marker separates
    it from an OS refusal for support, and never reaches the manager -- it is not a difference
    they can act on."""
    from app.services.comms.preferences import NotificationPreferenceService

    muted = a_guardian_for(an_enrolled_student, name="השתיקה")
    a_push_token(muted)
    NotificationPreferenceService(tenant_session).set(muted, "announcement", enabled=False)

    announcement_id = _publish_to(client, as_manager)
    missed = _report(client, as_manager, announcement_id).json()["missed"]
    assert [row["reason"] for row in missed] == ["denied"]
    assert "preference" not in str(missed)


def test_a_family_who_got_it_is_not_on_the_list_to_phone(
    client, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    parent = a_guardian_for(an_enrolled_student, name="קיבלה")
    a_push_token(parent)
    announcement_id = _publish_to(client, as_manager)
    _set_push(tenant_session, announcement_id, parent, "sent")

    body = _report(client, as_manager, announcement_id).json()
    assert body["received_count"] == 1
    assert body["missed"] == []


def test_the_report_names_the_notifications_it_counted(
    client, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """`notification_ids` is on the contract shape. It is what makes the report auditable --
    a count with no rows behind it cannot be checked against the inbox."""
    a_guardian_for(an_enrolled_student)
    announcement_id = _publish_to(client, as_manager)
    body = _report(client, as_manager, announcement_id).json()
    assert len(body["notification_ids"]) == 1


def test_an_unpublished_announcement_has_an_empty_report(client, as_manager) -> None:
    """Not a 404 and not an error. A draft has reached nobody, and zeroes are the honest
    answer to "how did it go" for something that has not gone."""
    created = client.post(
        "/api/v1/announcements",
        json={"title": "טיוטה", "body": "עוד לא נשלח", "scope_type": "studio"},
        headers=as_manager.headers,
    ).json()
    body = _report(client, as_manager, created["id"]).json()
    assert body["sent_count"] == 0
    assert body["missed"] == []


# -- [ שלח שוב ] --------------------------------------------------------------
def test_a_resend_retries_only_the_sends_that_errored(
    client, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """`failed` is the only one of the three a retry can fix.

    `no_token` means there is no device to send to and `denied` means the person said no --
    for both, pressing `[ שלח שוב ]` again would do nothing at all while looking like it did
    something. §5.11 puts `[ העתק מספרים ]` beside it precisely because the telephone is the
    remedy for those two.
    """
    errored = a_guardian_for(an_enrolled_student, name="נכשל")
    switched_off = a_guardian_for(an_enrolled_student, name="כיבה")
    never_installed = a_guardian_for(an_enrolled_student, name="לא התקין")
    a_push_token(errored)
    a_push_token(switched_off)

    announcement_id = _publish_to(client, as_manager)
    _set_push(tenant_session, announcement_id, errored, "failed", "INTERNAL")
    _set_push(tenant_session, announcement_id, switched_off, "denied")

    response = client.post(
        f"/api/v1/announcements/{announcement_id}/resend", headers=as_manager.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["retried_count"] == 1

    tenant_session.expire_all()
    assert _push_row(tenant_session, announcement_id, errored).status == "queued"
    assert _push_row(tenant_session, announcement_id, switched_off).status == "denied"
    assert _push_row(tenant_session, announcement_id, never_installed).status == "no_token"


def test_a_resend_sends_no_second_message_to_anybody(
    client, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """A resend re-queues the existing delivery; it does not create a second notification.
    Twenty-four families with two identical rows in their inbox is how a manager learns not
    to press the button."""
    parent = a_guardian_for(an_enrolled_student, name="נכשל")
    a_push_token(parent)
    announcement_id = _publish_to(client, as_manager)
    _set_push(tenant_session, announcement_id, parent, "failed", "INTERNAL")

    client.post(f"/api/v1/announcements/{announcement_id}/resend", headers=as_manager.headers)
    rows = list(
        tenant_session.execute(
            select(Notification).where(
                Notification.payload["announcement_id"].astext == str(announcement_id)
            )
        ).scalars()
    )
    assert len(rows) == 1


def test_a_resend_clears_the_error_it_is_retrying(
    client, tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """A stale `error` beside a `queued` status would describe an attempt that is no longer
    the current one, and `provider_message_id` would point at a send that already failed."""
    parent = a_guardian_for(an_enrolled_student, name="נכשל")
    a_push_token(parent)
    announcement_id = _publish_to(client, as_manager)
    _set_push(tenant_session, announcement_id, parent, "failed", "INTERNAL")

    client.post(f"/api/v1/announcements/{announcement_id}/resend", headers=as_manager.headers)
    tenant_session.expire_all()
    row = _push_row(tenant_session, announcement_id, parent)
    assert row.status == "queued"
    assert row.error is None


# -- who may read it ----------------------------------------------------------
def test_a_coach_cannot_read_the_delivery_report(
    client, as_lead_coach, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """It is a list of families' names and phone numbers. §3.2 gives a coach the roster, not
    the household directory."""
    a_guardian_for(an_enrolled_student)
    announcement_id = _publish_to(client, as_manager)
    assert _report(client, as_lead_coach, announcement_id).status_code == 403


def test_the_report_is_404_for_an_announcement_that_does_not_exist(client, as_manager) -> None:
    assert _report(client, as_manager, uuid.uuid4()).status_code == 404
