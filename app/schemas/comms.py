"""Request and response shapes for /announcements, /notifications, push and the ICS feed.

**Two spec rules are enforced by the shapes themselves rather than by a check somewhere.**

*The inbox is one-way.* §2.3 puts in-app two-way chat out of scope, §5.11 permits exactly
two levels — push and a one-way inbox — and D9.1 cut `שיחה עם המשרד` from parent artboard
`2b` for the same reason. Nothing here has a sender, a thread or a reply, so adding one is
a schema change somebody has to justify rather than a field somebody adds.

*The calendar feed carries no medical and no financial data* (§5.12). `CalendarFeedOut`
describes the subscription — its URL and when it was rotated — and structurally cannot
carry a balance or a health flag. That matters because the feed URL is unauthenticated by
design: a calendar client cannot hold a session, so the token is the whole credential, and
a parent who subscribes hands it to Google, which then fetches it indefinitely.

**The delivery report is the reason `notification_delivery` exists.** §5.11 draws it: 24
families, 19 received, 5 did not, and here are their names and phone numbers to paste into
the club's WhatsApp group. The counts without the names would tell a manager that five
children may turn up to a cancelled class without telling them which five.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas._pagination import CursorPage

#: §4.3 — `announcement  scope_type(studio|class|group)`. A `Literal` rather than a
#: pattern: the generated client turns it into a union, so a lane that types `"studios"`
#: gets a compile error instead of a silently empty audience.
AnnouncementScope = Literal["studio", "class", "group"]

#: §4.3 — `notification_delivery  channel(push|inapp)`.
DeliveryChannel = Literal["push", "inapp"]

#: §4.3 — `notification_delivery  status(...)`. See `app/models/comms.py` for why
#: `no_token` and `denied` are not `failed`.
DeliveryStatus = Literal["queued", "sent", "delivered", "failed", "no_token", "denied"]

#: The subset of `DeliveryStatus` that means the message did not land. What §5.11's ⚠ list
#: is filtered on.
MissedReason = Literal["no_token", "denied", "failed"]

#: §4.3 — `push_token  app(staff|parent)`. The dashboard is absent deliberately: §6.4 makes
#: it the manager's web surface and a desktop tab is not a device we register.
PushApp = Literal["staff", "parent"]

#: §4.3 — `push_token  platform(ios|android|web)`.
PushPlatform = Literal["ios", "android", "web"]

#: §4.3 — `calendar_feed  subject_type(guardian|coach)`.
FeedSubject = Literal["guardian", "coach"]


# -- announcements ------------------------------------------------------------
class AnnouncementIn(BaseModel):
    """§5.11's publish form. `scheduled_for` absent means send now."""

    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    scope_type: AnnouncementScope
    #: Null for `scope_type='studio'`, required for anything narrower — the model enforces
    #: the pairing, since an audience that names nothing reaches nobody.
    scope_id: uuid.UUID | None = None
    scheduled_for: datetime | None = None


class AnnouncementOut(BaseModel):
    """What the publisher's list renders.

    `scheduled_for` and `published_at` are both here because three states matter and they
    are three different next actions: a draft to finish, a send that is queued, and one
    that has already gone out and now has a delivery report.
    """

    id: uuid.UUID
    author_person_id: uuid.UUID
    title: str
    body: str
    scope_type: AnnouncementScope
    scope_id: uuid.UUID | None = None
    scheduled_for: datetime | None = None
    published_at: datetime | None = None
    created_at: datetime


AnnouncementPage = CursorPage[AnnouncementOut]


# -- the inbox ----------------------------------------------------------------
class NotificationOut(BaseModel):
    """One inbox row. §5.11: "the inbox is where the message lives" — no permission needed
    and it never expires.

    There is no sender. Every one of §5.11's fifteen triggers is the system telling a
    person something, and a `sender_person_id` here is the field a reply box would be
    built on.
    """

    id: uuid.UUID
    kind: str
    title: str
    body: str
    #: What the tap opens — a session id, a charge id, an event id. Never message content
    #: that belongs in `body`, and never logged (§18.3).
    payload: dict[str, Any] = Field(default_factory=dict)
    read_at: datetime | None = None
    created_at: datetime


NotificationPage = CursorPage[NotificationOut]


class NotificationDeliveryOut(BaseModel):
    """One channel's outcome for one notification."""

    channel: DeliveryChannel
    status: DeliveryStatus
    provider_message_id: str | None = None
    error: str | None = None
    sent_at: datetime | None = None


# -- §5.11's delivery report --------------------------------------------------
class MissedRecipientOut(BaseModel):
    """A family the message did not reach, and the number to phone.

    The phone number is the point. §5.11 chose this over a WhatsApp Business integration —
    "same outcome as automation, half a day of work, zero risk" — and it only works if the
    manager can copy the numbers.
    """

    person_id: uuid.UUID
    name: str
    phone: str | None = None
    #: Why, in the manager's terms: never installed, said no, or the send errored. Each is
    #: a different conversation.
    reason: MissedReason


class DeliveryReportOut(BaseModel):
    """§5.11's post-send screen, for a cancellation or an announcement.

    `sent_count` is families targeted; `received_count` is those a push actually reached.
    They are counted separately rather than derived from `len(missed)` because a send that
    is still in flight has neither — `queued` rows are not yet misses, and reporting them
    as such would send a manager chasing families whose phone is about to buzz.
    """

    notification_ids: list[uuid.UUID] = Field(default_factory=list)
    sent_count: int
    received_count: int
    missed_count: int
    missed: list[MissedRecipientOut] = Field(default_factory=list)


# -- push registration --------------------------------------------------------
class PushTokenIn(BaseModel):
    """What the client posts after the OS grants permission.

    `app` and `platform` are both required because the delivery report is only honest with
    them: §6.5 makes an iOS parent's registration depend on the app being on the home
    screen, so `ios` + `parent` registrations that never arrive are the install funnel
    failing rather than the push service.
    """

    token: str = Field(min_length=1, max_length=512)
    app: PushApp
    platform: PushPlatform


class PushTokenOut(BaseModel):
    id: uuid.UUID
    app: PushApp
    platform: PushPlatform
    last_seen_at: datetime | None = None


# -- §5.12's calendar feed ----------------------------------------------------
class CalendarFeedOut(BaseModel):
    """The subscription, not its contents.

    §5.12: "The feed contains no medical and no financial data." This shape holds a URL and
    a rotation timestamp and has nowhere to put either, which is the durable version of
    that sentence — the URL is unauthenticated and, once subscribed, is fetched by Google's
    servers on their schedule and outside our control.
    """

    id: uuid.UUID
    subject_type: FeedSubject
    #: The full `webcal://` or `https://` URL, assembled server-side. The bare token is not
    #: exposed separately: two representations of one secret is one more place to log it.
    url: str
    rotated_at: datetime | None = None
