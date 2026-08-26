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
