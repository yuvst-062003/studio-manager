"""§5.11's fan-out, and the inbox it fills.

    📱 PHONE LEVEL — push notification
                        ↓ tap
    📨 APP LEVEL — in-app inbox

"**Every message goes to both.** Push is the doorbell; the inbox is where the message lives.
They are not alternatives."

**One row per channel, and the push row's status is the product.** Push is opt-in on iOS and
on Android 13+ (§12), so some parents will never receive alerts -- and §5.11 permits no email
and no SMS fallback, which means the only remaining route to that family is a telephone.
§5.11's answer is a delivery report the publisher reads after a cancellation, and that report
is writable only because the status column separates `no_token` from `denied` from `failed`.
Three facts, three conversations: help them install, ask them to turn it on, retry.

**A preference silences the doorbell, never the letter.** §5.11 makes the inbox the place the
message lives -- no permission needed, never expires -- so a muted type still writes its
`notification` row and records the push as `denied`, with `error='preference'` so support can
tell it from an OS refusal. The alternative, dropping the message, is not available anyway:
the seam returns `Notification` and `tests/contracts/test_seams.py` asserts that return type,
because a caller needs the row's identity to ask for the delivery report on what it just
sent.
"""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import select, tuple_

from app.core.clock import now
from app.core.db import get_engine
from app.core.tenancy import TenantSession
from app.schemas.comms import DeliveryReportOut, MissedRecipientOut
from app.services.comms.preferences import NotificationPreferenceService
from app.services.comms.push import PushTokenService

if TYPE_CHECKING:
    from app.models.comms import Notification

logger = logging.getLogger(__name__)


class NotificationFanOut:
    """The implementation behind `NotificationService.enqueue`.

    Separate from the seam class so `app/services/comms/__init__.py` stays what W5's contract
    commit made it -- a signature with a docstring arguing for it -- rather than growing a
    body that hides the contract inside three hundred lines.
    """

    def __init__(self, session: TenantSession | None = None) -> None:
        #: None means "open one and commit it". The three workers that already call this seam
        #: construct `NotificationService()` with no arguments inside a `use_studio` scope,
        #: and the frozen signature leaves no room to pass a session to `enqueue` itself.
        self._session = session

    def enqueue(
        self,
        person_id: uuid.UUID,
        kind: str,
        title: str,
        body: str,
        payload: dict[str, Any],
    ) -> Notification:
        if self._session is not None:
            return self._enqueue(self._session, person_id, kind, title, body, payload)
        # No `use_studio` here: the three workers that construct this with no session are
        # already inside one, and opening a second scope would silently re-answer a question
        # the caller has already answered. A caller who is NOT inside one gets
        # `NoActiveStudioError` from the tenant filter, which is the fail-closed behaviour
        # app/core/tenancy.py exists to guarantee.
        with TenantSession(bind=get_engine(), expire_on_commit=False) as session:
            note = self._enqueue(session, person_id, kind, title, body, payload)
            session.commit()
            return note

    def _enqueue(
        self,
        session: TenantSession,
        person_id: uuid.UUID,
        kind: str,
        title: str,
        body: str,
        payload: dict[str, Any],
    ) -> Notification:
        from app.models.comms import Notification, NotificationDelivery

        at = now()
        note = Notification(
            person_id=person_id,
            kind=kind,
            title=title,
            body=body,
            # Non-null in the schema and indexed into by the client, so `{}` rather than
            # None: a nullable payload would make every inbox row's tap handler defensive
            # about a column that promised it never would be.
            payload=payload or {},
        )
        session.add(note)
        # Flushed before the deliveries, because nothing in `app/models/` declares an ORM
        # relationship -- `notification_delivery.notification_id` is a plain column with a
        # foreign key, so the id has to exist before a child can name it. That absence is
        # deliberate across the whole model layer, and it is what keeps a lazy load from
        # firing inside a fan-out that already knows every row it is about to write.
        session.flush()

        # The inbox cannot fail. There is no permission to grant and no transport to error,
        # which is exactly why §5.11 calls it "where the message lives" -- so it is recorded
        # as delivered at the moment it is written rather than left `queued` for a drain that
        # would have nothing to do.
        session.add(
            NotificationDelivery(
                notification_id=note.id, channel="inapp", status="delivered", sent_at=at
            )
        )
        session.add(
            NotificationDelivery(
                notification_id=note.id,
                channel="push",
                **self._push_outcome(session, person_id, kind),
            )
        )
        session.flush()

        # §18.3 -- a notification payload is in the "never logged" column, and §11.7's
        # scrubber matches keys in `extra=`, which an f-string does not have. The kind IS
        # logged: it is a category rather than content, and a run that cannot say what sort
        # of message it sent is a run nobody can debug.
        logger.info(
            "notification enqueued",
            extra={"notification_id": str(note.id), "kind": kind},
        )
        return note

    def _push_outcome(
        self, session: TenantSession, person_id: uuid.UUID, kind: str
    ) -> dict[str, Any]:
        """Which of §5.11's push states this send starts in.

        **Preference is checked before the device lookup**, and the order is the point.
        `denied` and `no_token` send the office to two different conversations, and telling
        them "never installed the app" about a parent who installed it and turned this type
        off is the wrong one. Somebody who has done both is more usefully described by the
        choice they made than by a device they do own.
        """
        if not NotificationPreferenceService(session).allows(person_id, kind):
            # `denied` is what §5.11's report already calls this -- `התראות כבויות` -- and it
            # is what happened. `error` separates a preference from an OS refusal without
            # inventing a seventh status the delivery CHECK would reject.
            return {"status": "denied", "error": "preference"}
        if not PushTokenService(session).devices_for(person_id):
            return {"status": "no_token"}
        return {"status": "queued"}


class NotificationReader:
    """§5.11's inbox: `🔔③ ... A permanent הודעות list. No permission needed, never expires.`"""

    def __init__(self, session: TenantSession) -> None:
        self._session = session

    def inbox(
        self,
        person_id: uuid.UUID,
        *,
        after: uuid.UUID | None = None,
        limit: int = 50,
        unread_only: bool = False,
    ) -> tuple[list[Notification], bool]:
        """One page, newest first. Returns the rows and whether more remain.

        Keyset on `(created_at DESC, id DESC)` rather than an offset (G16): a parent's inbox
        is written to while they are scrolling it -- a cancellation arrives mid-scroll -- and
        `LIMIT/OFFSET` silently repeats or skips a row when the set shifts underneath.
        """
        from app.models.comms import Notification

        stmt = select(Notification).where(Notification.person_id == person_id)
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))
        if after is not None:
            anchor = self._session.get(Notification, after)
            if anchor is not None:
                # A row-value comparison rather than `created_at < x OR (= x AND id < y)`:
                # one expression, and Postgres serves it straight from
                # `ix_notification_studio_id_person_id_created_at`. `tuple_()` wraps the
                # COLUMNS; the right-hand side is a plain tuple of values. The same shape
                # `app/services/events/events.py` uses, inverted because an inbox reads
                # newest first.
                stmt = stmt.where(
                    tuple_(Notification.created_at, Notification.id)
                    < (anchor.created_at, anchor.id)
                )
        stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
        rows = list(self._session.execute(stmt.limit(limit + 1)).scalars())
        return rows[:limit], len(rows) > limit

    def unread_count(self, person_id: uuid.UUID) -> int:
        """§5.11's `🔔③` badge. Served by the partial index, which exists because within a
        month of use the read rows are the overwhelming majority."""
        from app.models.comms import Notification

        return len(
            self._session.execute(
                select(Notification.id).where(
                    Notification.person_id == person_id, Notification.read_at.is_(None)
                )
            )
            .scalars()
            .all()
        )

    def mark_read(self, person_id: uuid.UUID, notification_id: uuid.UUID) -> Notification | None:
        """Idempotent: a second call keeps the first `read_at`.

        A moving timestamp would reorder an inbox under a parent's thumb, and the badge count
        would be right either way -- which is what makes this the kind of bug nobody notices
        until somebody complains that messages jump around.

        Returns None when the row is not this person's, so the router can answer 404. A 403
        would confirm that a notification with that id exists, and for a message addressed to
        another family that confirmation is itself the leak.
        """
        from app.models.comms import Notification

        note = self._session.get(Notification, notification_id)
        if note is None or note.person_id != person_id:
            return None
        if note.read_at is None:
            note.read_at = now()
            self._session.commit()
        return note

    def mark_all_read(self, person_id: uuid.UUID) -> int:
        """`inbox.markAllRead`. Returns how many were actually unread."""
        from app.models.comms import Notification

        rows = list(
            self._session.execute(
                select(Notification).where(
                    Notification.person_id == person_id, Notification.read_at.is_(None)
                )
            ).scalars()
        )
        at = now()
        for note in rows:
            note.read_at = at
        if rows:
            self._session.commit()
        return len(rows)


class DeliveryReporter:
    """§5.11's post-send screen, for a cancellation or an announcement.

        נשלח ל-24 משפחות · ✓ 19 קיבלו · ⚠ 5 לא קיבלו — התראות כבויות

    **Three counts, and `queued` is in none of them.** A send still in flight is neither
    received nor missed: reporting one as a miss sends a manager chasing a family whose phone
    is about to buzz. `delivery.inFlight` is rendered from the difference, which is why there
    is no fourth count -- it would be derivable from the other three and free to disagree
    with them.

    **The names and numbers are the feature.** §5.11 permits no email, no SMS and no WhatsApp
    channel, so a family whose push did not land and who is not reading the inbox is reachable
    only by telephone. "5 didn't receive it" tells a manager that five children may turn up to
    a cancelled class without telling them which five.
    """

    #: A push that landed, as far as anything on our side can know. `sent` is "the provider
    #: accepted it" and `delivered` is "the device acknowledged"; §5.11's report counts both
    #: as received, because the action a manager would take is the same for either.
    RECEIVED = ("sent", "delivered")
    #: `MissedReason`, and the order §5.11's ⚠ list reads in.
    MISSED = ("no_token", "denied", "failed")

    def __init__(self, session: TenantSession) -> None:
        self._session = session

    def for_announcement(self, announcement_id: uuid.UUID) -> DeliveryReportOut:
        from app.models.comms import Notification, NotificationDelivery
        from app.models.person import Person

        rows = list(
            self._session.execute(
                select(Notification, NotificationDelivery, Person)
                .join(
                    NotificationDelivery,
                    NotificationDelivery.notification_id == Notification.id,
                )
                .join(Person, Person.id == Notification.person_id)
                .where(
                    # The stamp `AnnouncementService.publish` writes. A JSONB `->>` rather
                    # than a foreign key: `notification` serves fifteen triggers and most of
                    # them have nothing to do with an announcement, so a nullable column for
                    # this one would be null on almost every row.
                    Notification.payload["announcement_id"].astext == str(announcement_id),
                    NotificationDelivery.channel == "push",
                )
                .order_by(Person.last_name, Person.first_name)
            )
        )

        missed = [
            MissedRecipientOut(
                person_id=person.id,
                name=f"{person.first_name} {person.last_name}".strip(),
                phone=person.phone,
                # `error='preference'` deliberately does NOT reach the manager. A parent who
                # switched this type off and one whose OS refused are the same conversation
                # -- `התראות כבויות` -- and a distinction they cannot act on is noise on a
                # screen they are reading in a hurry.
                reason=delivery.status,
            )
            for _note, delivery, person in rows
            if delivery.status in self.MISSED
        ]
        return DeliveryReportOut(
            notification_ids=[note.id for note, _d, _p in rows],
            sent_count=len(rows),
            received_count=sum(1 for _n, d, _p in rows if d.status in self.RECEIVED),
            missed_count=len(missed),
            missed=missed,
        )

    def retry_failed(self, announcement_id: uuid.UUID) -> int:
        """§5.11's `[ שלח שוב ]`. Returns how many sends were actually re-queued.

        **Only `failed`.** It is the one of the three reasons a retry can fix. `no_token`
        means there is no device to send to and `denied` means the person said no -- pressing
        the button again for either would do nothing at all while looking like it did
        something, which is worse than a button that reports "0". §5.11 puts
        `[ העתק מספרים ]` beside it precisely because the telephone is the remedy for those
        two.

        Re-queues the EXISTING delivery row rather than enqueuing a second notification. A
        family with two identical rows in their inbox is how a manager learns not to press
        the button.
        """
        from app.models.comms import Notification, NotificationDelivery

        rows = list(
            self._session.execute(
                select(NotificationDelivery)
                .join(Notification, Notification.id == NotificationDelivery.notification_id)
                .where(
                    Notification.payload["announcement_id"].astext == str(announcement_id),
                    NotificationDelivery.channel == "push",
                    NotificationDelivery.status == "failed",
                )
            ).scalars()
        )
        for row in rows:
            row.status = "queued"
            # Both cleared: a stale `error` beside a `queued` status describes an attempt that
            # is no longer the current one, and `provider_message_id` would point support at a
            # send that already failed.
            row.error = None
            row.provider_message_id = None
            row.sent_at = None
        if rows:
            self._session.commit()
        return len(rows)
