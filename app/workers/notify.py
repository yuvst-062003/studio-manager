"""§5.11's job — what goes out on a schedule, and what turns a queued push into a sent one.

Run as `python -m app.workers.notify`, declared once in `infra/railway/jobs.json` — because a
worker nothing invokes is a feature that ships dead, and nothing in the suite would notice.

**Two passes, one run**, for the reason `app/workers/health_reminders.py` gives for its two:
they key off the same tables and the same clock, and two cron entries would be two chances
for one to be forgotten.

  1. **Scheduled announcements.** §5.11 — "publishes a title and body, optionally scheduled."
     A `scheduled_for` in the past with `published_at` still null is a message the club meant
     to send and nothing has sent. `published_at` is the guard, so a cron that overlaps itself
     publishes once.
  2. **The push drain.** `NotificationService.enqueue` records `queued`; this pass is what
     makes it `sent` or `failed` and writes the `provider_message_id` a support conversation
     is traced through when a parent insists nothing arrived.

**It leaves `no_token` and `denied` alone.** Neither is queued and neither is something a
drain can act on — one has no device to send to and the other said no. A job that "retried"
them would rewrite §5.11's three reasons into `failed` and destroy the only signal telling
the office which of three conversations to have.

**There is no FCM behind the sender.** `app/services/comms/push.py` carries the whole
argument: no credential exists anywhere in this repo and `app/core/config.py` belongs to
`core`. `RecordingPushSender` is what this drains through until `HB-push-transport` closes.
The recording sets `sent` rather than `delivered`, because handing a message to a push service
is not the same as a phone lighting up and §5.11 keeps those apart.

**Cross-studio without the escape hatch**, exactly as `app/workers/followups.py` does it: a
plain unscoped `Session` lists the studios, then one `use_studio` scope per studio does the
work. Calling `with_all_tenants` would put this file in front of §19.7's demo-hygiene
detector, whose registry lives in `app/core/demo.py` and belongs to `core` — and the loop is
stricter rather than looser, since every read inside it runs through the tenant filter.

**§18.3.** Every log line here carries counts and ids. Never a title, never a body, never a
payload — and never through an f-string, which has no key for §11.7's scrubber to match.
"""

from __future__ import annotations

import logging
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.db import get_engine
from app.core.logging import configure_logging
from app.core.tenancy import TenantSession, use_studio
from app.models.comms import Announcement, Notification, NotificationDelivery, PushToken
from app.models.studio import Studio
from app.services.comms.announcements import AnnouncementService
from app.services.comms.errors import AnnouncementAlreadyPublishedError
from app.services.comms.push import PushSender, PushSendError, RecordingPushSender

logger = logging.getLogger(__name__)


@dataclass
class Tally:
    """What the run did, in numbers a log line can carry.

    Four counts rather than one "sent", because they fail independently: a scheduled
    announcement can publish while every push behind it errors, and a run reporting one
    number would make that look like a success.
    """

    studios: list[str] = field(default_factory=list)
    #: Announcements whose scheduled moment had arrived.
    published: int = 0
    #: Recipients those announcements reached — §5.11 counts families.
    fanned_out: int = 0
    #: Queued pushes the provider accepted.
    pushed: int = 0
    #: Queued pushes the provider refused. Counted rather than swallowed: a run that says
    #: "12 sent" when the provider took none is worse than one that says so.
    push_failed: int = 0


# -- pass 1: §5.11's scheduled announcements ----------------------------------
def publish_due(session: TenantSession, *, at: datetime, tally: Tally) -> None:
    """Publish every announcement whose moment has arrived, inside an already-scoped session.

    `scheduled_for IS NOT NULL` is load-bearing: a draft with no schedule is one somebody is
    still writing, and §5.11 makes scheduling opt-in. A job that swept every unpublished row
    would send half-finished messages to the whole club.
    """
    service = AnnouncementService(session)
    due = list(
        session.execute(
            select(Announcement).where(
                Announcement.published_at.is_(None),
                Announcement.deleted_at.is_(None),
                Announcement.scheduled_for.is_not(None),
                Announcement.scheduled_for <= at,
            )
        ).scalars()
    )
    for row in due:
        try:
            _published, reached = service.publish(row.id, at=at)
        except AnnouncementAlreadyPublishedError:
            # Two runs overlapping. The guard held; nothing to report.
            continue
        tally.published += 1
        tally.fanned_out += reached
        logger.info(
            "scheduled announcement published",
            # The id and the size. Never the title -- §18.3, and a cancellation's title names
            # a group, which names the children in it.
            extra={"announcement_id": str(row.id), "recipients": reached},
        )


# -- pass 2: the push drain ---------------------------------------------------
def drain_queued(
    session: TenantSession,
    *,
    at: datetime,
    tally: Tally,
    sender: PushSender | None = None,
) -> None:
    """Hand every queued push to the provider and record what it said.

    Filtered on `channel = 'push'` as well as on `queued`. The inbox row was delivered the
    moment it was written — no permission, no transport — so a drain that swept every channel
    would move a delivered row back into flight.

    One delivery row can have several devices behind it (§5.11 counts families, not handsets).
    Any accepted send makes the row `sent`; only an all-devices failure makes it `failed`,
    because a parent whose phone buzzed does not care that their tablet's token was stale.
    """
    push = sender if sender is not None else RecordingPushSender()
    rows = list(
        session.execute(
            select(NotificationDelivery, Notification)
            .join(Notification, Notification.id == NotificationDelivery.notification_id)
            .where(
                NotificationDelivery.channel == "push",
                NotificationDelivery.status == "queued",
            )
        )
    )
    for delivery, note in rows:
        tokens = list(
            session.execute(
                select(PushToken.token).where(PushToken.person_id == note.person_id)
            ).scalars()
        )
        message_id, error = _send_to_any(push, tokens, note)
        if message_id is not None:
            delivery.status = "sent"
            delivery.provider_message_id = message_id
            delivery.error = None
            delivery.sent_at = at
            tally.pushed += 1
        else:
            delivery.status = "failed"
            delivery.error = error
            tally.push_failed += 1
    if rows:
        session.commit()


def _send_to_any(
    sender: PushSender, tokens: list[str], note: Notification
) -> tuple[str | None, str | None]:
    """First accepted send wins. Returns (provider_message_id, error).

    The error is the PROVIDER's string and never the message. §18.3 puts notification payloads
    in the "never logged" column, and a body copied into `error` would be the same content in
    a column nobody thinks of as content.
    """
    last_error: str | None = None
    for token in tokens:
        try:
            return sender.send(
                token=token, title=note.title, body=note.body, payload=note.payload
            ), None
        except PushSendError as exc:
            last_error = str(exc)
    # No tokens at all should not reach here -- `enqueue` records `no_token` instead -- but a
    # device deleted between the enqueue and the drain would, and "the message did not go" is
    # the honest answer either way.
    return None, last_error or "no device at send time"


# -- the run ------------------------------------------------------------------
def run_for_studio(session: TenantSession, *, at: datetime, tally: Tally) -> None:
    publish_due(session, at=at, tally=tally)
    drain_queued(session, at=at, tally=tally)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    at = now()
    tally = Tally()

    with Session(bind=get_engine()) as unscoped:
        studios = list(
            unscoped.execute(
                select(Studio.id, Studio.slug).where(
                    Studio.status == "active", Studio.is_demo.is_(False)
                )
            ).all()
        )

    for studio_id, slug in studios:
        tally.studios.append(slug)
        _run_one(studio_id, at=at, tally=tally)

    logger.info(
        "notify complete",
        extra={
            "studios": len(tally.studios),
            "published": tally.published,
            "fanned_out": tally.fanned_out,
            "pushed": tally.pushed,
            "push_failed": tally.push_failed,
        },
    )
    if tally.push_failed:
        # Not a failure of the run: the announcements still published and the inbox rows are
        # still there. WARNING so it is visible rather than inferred from a gap between two
        # counts -- and so §5.11's delivery report is not the first place anybody notices.
        logger.warning(
            "some pushes were refused by the provider",
            extra={"push_failed": tally.push_failed},
        )
    return 0


def _run_one(studio_id: uuid.UUID, *, at: datetime, tally: Tally) -> None:
    with (
        use_studio(studio_id),
        TenantSession(bind=get_engine(), expire_on_commit=False) as scoped,
    ):
        run_for_studio(scoped, at=at, tally=tally)
        scoped.commit()


if __name__ == "__main__":
    sys.exit(main())
