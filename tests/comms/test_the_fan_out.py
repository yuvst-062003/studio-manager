"""§5.11's two levels, and the seam three lanes already call.

    📱 PHONE LEVEL — push notification
                        ↓ tap
    📨 APP LEVEL — in-app inbox

"**Every message goes to both.** Push is the doorbell; the inbox is where the message lives.
They are not alternatives."

That sentence is the whole design, and everything below is a consequence of it. One
`notification` row per recipient, one `notification_delivery` row per CHANNEL, and a push
that never landed leaves a record saying which of the three reasons applied -- because §5.11
permits no email and no SMS fallback, so the only remaining route to that family is a
telephone and somebody has to know to pick it up.

**The seam's signature is frozen.** `tests/contracts/test_seams.py` asserts
`enqueue(person_id, kind, title, body, payload) -> Notification` down to the annotations.
Lane REPORTS' at-risk and retention jobs are pure callers of it, and
`app/workers/{billing,followups,health_reminders}.py` already are.
"""

from __future__ import annotations

import logging
import uuid

import pytest
from app.core.tenancy import use_studio
from app.models.comms import Notification, NotificationDelivery
from app.services.comms import NotificationService
from app.services.comms.preferences import NotificationPreferenceService
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError


def _deliveries(session, notification_id: uuid.UUID) -> list[NotificationDelivery]:
    return list(
        session.execute(
            select(NotificationDelivery).where(
                NotificationDelivery.notification_id == notification_id
            )
        ).scalars()
    )


def _by_channel(session, notification_id: uuid.UUID) -> dict[str, NotificationDelivery]:
    return {row.channel: row for row in _deliveries(session, notification_id)}


# -- both levels, always ------------------------------------------------------
def test_every_message_reaches_both_levels(tenant_session, as_manager) -> None:
    """§5.11 -- "Every message goes to both. Push is the doorbell; the inbox is where the
    message lives. They are not alternatives.\""""
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "חגורה חדשה", "כל הכבוד", {}
    )
    assert set(_by_channel(tenant_session, note.id)) == {"inapp", "push"}


def test_the_message_is_stored_as_it_was_handed_over(tenant_session, as_manager) -> None:
    payload = {"student_id": str(uuid.uuid4())}
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "חגורה חדשה", "כל הכבוד", payload
    )
    stored = tenant_session.get(Notification, note.id)
    assert stored is not None
    assert stored.person_id == as_manager.person_id
    assert stored.kind == "belt.awarded"
    assert stored.title == "חגורה חדשה"
    assert stored.body == "כל הכבוד"
    assert stored.payload == payload
    assert stored.read_at is None


def test_the_inbox_row_lands_even_with_no_device(tenant_session, as_manager) -> None:
    """The inbox needs no permission and never expires (§5.11). A family with no registered
    device still has the message; what they do not have is the doorbell.

    `no_token` rather than `failed`: §6.5 makes this the main adoption risk on iOS, where
    Web Push exists only for a home-screen web app, and the action it calls for is "help
    them install" rather than "retry the send"."""
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    channels = _by_channel(tenant_session, note.id)
    assert channels["inapp"].status == "delivered"
    assert channels["inapp"].sent_at is not None
    assert channels["push"].status == "no_token"


def test_a_registered_device_queues_a_push(tenant_session, as_manager, a_push_token) -> None:
    """`queued`, not `sent`. The worker drains it (app/workers/notify.py), and §5.11's report
    counts a queued row as neither received nor missed -- a send still in flight must not
    send a manager chasing a family whose phone is about to buzz."""
    a_push_token(as_manager.person_id)
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    push = _by_channel(tenant_session, note.id)["push"]
    assert push.status == "queued"
    assert push.sent_at is None
    assert push.provider_message_id is None


def test_two_devices_are_one_delivery_row(tenant_session, as_manager, a_push_token) -> None:
    """`uq_notification_delivery_notification_id_channel` allows one row per channel, and
    §5.11's report counts FAMILIES. A parent with a phone and a tablet is one family who
    either heard it or did not."""
    a_push_token(as_manager.person_id, platform="android")
    a_push_token(as_manager.person_id, platform="ios")
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    assert len(_deliveries(tenant_session, note.id)) == 2  # inapp + push, not inapp + 2 push


def test_a_second_delivery_for_one_channel_is_impossible(tenant_session, as_manager) -> None:
    """Two rows would be two answers to "did this land", and §5.11's counts would double."""
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    tenant_session.add(
        NotificationDelivery(notification_id=note.id, channel="inapp", status="delivered")
    )
    with pytest.raises(IntegrityError):
        tenant_session.commit()
    tenant_session.rollback()


# -- preferences govern the doorbell, never the record ------------------------
def test_a_muted_kind_still_files_the_message_and_records_the_push_as_denied(
    tenant_session, as_manager, a_push_token
) -> None:
    """The distinction §5.11 draws: the inbox is where the message LIVES and needs no
    permission, so muting a type silences the doorbell rather than losing the letter.

    `denied` because that is what §5.11's report calls it -- `התראות כבויות` -- and it is
    what happened: this person turned these off. `error='preference'` keeps it separable
    from an OS denial for whoever is reading a support ticket, without inventing a seventh
    status the delivery CHECK would reject.
    """
    a_push_token(as_manager.person_id)
    NotificationPreferenceService(tenant_session).set(as_manager.person_id, "belt", enabled=False)
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    channels = _by_channel(tenant_session, note.id)
    assert channels["inapp"].status == "delivered"
    assert channels["push"].status == "denied"
    assert channels["push"].error == "preference"
    assert tenant_session.get(Notification, note.id) is not None


def test_a_muted_kind_with_no_device_still_reads_as_denied(tenant_session, as_manager) -> None:
    """Preference is checked BEFORE the device lookup, because it is the more actionable
    fact. Telling the office "never installed the app" about a parent who installed it and
    turned this type off sends them to the wrong conversation."""
    NotificationPreferenceService(tenant_session).set(as_manager.person_id, "belt", enabled=False)
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    assert _by_channel(tenant_session, note.id)["push"].status == "denied"


def test_a_transactional_notice_is_pushed_through_a_muted_group(
    tenant_session, as_manager, a_push_token
) -> None:
    """§5.11 -- "except health-declaration and payment-failure notices, which are
    transactional." The `payment` switch is real and this one kind ignores it."""
    a_push_token(as_manager.person_id)
    NotificationPreferenceService(tenant_session).set(
        as_manager.person_id, "payment", enabled=False
    )
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "billing.payment_failed", "t", "b", {}
    )
    assert _by_channel(tenant_session, note.id)["push"].status == "queued"


def test_an_ungoverned_kind_is_pushed(tenant_session, as_manager, a_push_token) -> None:
    """§5.4a's trial ladder has no switch, so nothing turned it off."""
    a_push_token(as_manager.person_id)
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "trial.reminder", "t", "b", {}
    )
    assert _by_channel(tenant_session, note.id)["push"].status == "queued"


def test_a_device_registered_for_the_other_app_is_not_this_persons_doorbell(
    tenant_session, as_manager, a_push_token
) -> None:
    """`push_token.app` is (staff|parent) and a person can hold both. A coach who is also a
    parent has two apps, and the fan-out reaching either one is correct -- what would not be
    correct is reporting `no_token` for somebody who has a device. This pins that any
    registered app counts, which is the honest reading of "can this person be reached"."""
    a_push_token(as_manager.person_id, app="staff", platform="ios")
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    assert _by_channel(tenant_session, note.id)["push"].status == "queued"


# -- the shape three workers already depend on --------------------------------
def test_the_seam_works_with_no_session_handed_to_it(studio, as_manager) -> None:
    """app/workers/billing.py, followups.py and health_reminders.py all write
    `NotificationService().enqueue(...)` inside a `use_studio` scope. A constructor that
    required a session would break three lanes' jobs at once, and the seam's frozen
    signature leaves no room to pass one to `enqueue` itself."""
    with use_studio(studio.id):
        note = NotificationService().enqueue(as_manager.person_id, "belt.awarded", "t", "b", {})
    assert note.id is not None
    assert note.studio_id == studio.id


def test_a_handed_over_session_is_not_committed_by_the_seam(tenant_session, as_manager) -> None:
    """The caller owns its transaction boundary. §5.11's announcement fan-out writes
    `published_at` and N notifications in one unit of work, and a seam that committed after
    each recipient would leave an announcement half-sent if the twelfth row failed."""
    NotificationService(tenant_session).enqueue(as_manager.person_id, "belt.awarded", "t", "b", {})
    tenant_session.rollback()
    assert tenant_session.execute(select(Notification)).scalars().all() == []


def test_the_row_is_stamped_with_the_active_studio(tenant_session, as_manager) -> None:
    """G9. Nothing in the service mentions `studio_id`; `TenantSession`'s before_flush
    handler puts it there, which is what makes a cross-studio write impossible rather than
    merely unlikely."""
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    assert note.studio_id == as_manager.studio_id
    assert _by_channel(tenant_session, note.id)["push"].studio_id == as_manager.studio_id


def test_an_empty_payload_is_stored_as_an_object_not_as_null(tenant_session, as_manager) -> None:
    """`payload` is non-null in the schema, and the client indexes into it. A null would make
    every inbox row's tap handler defensive about a column that promised it never would be."""
    note = NotificationService(tenant_session).enqueue(
        as_manager.person_id, "belt.awarded", "t", "b", {}
    )
    assert tenant_session.get(Notification, note.id).payload == {}


# -- §18.3: a notification payload is in the "never logged" column ------------
def test_nothing_here_logs_a_title_a_body_or_a_payload(caplog, tenant_session, as_manager) -> None:
    """§18.3 puts notification payloads in the "never" column and G7 puts a child's health
    answers there permanently. §11.7's scrubber matches on keys in `extra=`, and an f-string
    has no keys -- so the rule is that content never reaches a log line at all, in any form.

    The kind IS logged, deliberately: it is a category, not content, and a run that cannot
    say what sort of message it sent is a run nobody can debug.
    """
    student_id = str(uuid.uuid4())
    with caplog.at_level(logging.DEBUG):
        NotificationService(tenant_session).enqueue(
            as_manager.person_id,
            "health.declaration_missing",
            "נדרשת הצהרת בריאות",
            "כדי להמשיך, מלאו את הצהרת הבריאות של הילד",
            {"student_id": student_id},
        )
    assert "נדרשת הצהרת בריאות" not in caplog.text
    assert "כדי להמשיך" not in caplog.text
    assert student_id not in caplog.text
