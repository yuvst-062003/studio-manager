"""SPEC §4.3's communications block — announcements, notifications, push and calendar.

**One-way, and structurally so.** §2.3 lists in-app two-way chat as explicitly out of
scope; §5.11 permits exactly two levels, "push, and a one-way inbox"; D9.1 cut
`שיחה עם המשרד` from parent artboard `2b` for the same reason. There is no `reply_to_id`,
no thread and no sender on a notification anywhere in this module, and
`tests/contracts/test_w5_models.py` asserts their absence — a scope cut that lives only in
a document is one small feature away from being reversed.

**Push is opt-in, so delivery fails silently unless the schema can say why.** On iOS Web
Push exists *only* for a home-screen web app (§6.5), and on Android 13+ the permission is a
prompt like any other. §12 records the consequence as a known limitation: some parents will
never receive alerts. §5.11's answer is a delivery report the publisher reads after a
cancellation — 24 families, 19 received, 5 did not, here are their phone numbers — and that
report is only writable because `notification_delivery.status` separates `no_token` and
`denied` from `failed`. Those three lead to three different actions: install the app, turn
the permission on, retry the send.

**Every message goes to both channels.** Push is the doorbell, the inbox is where the
message lives; they are not alternatives, so a `notification` fans out to one
`notification_delivery` per channel rather than choosing between them.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 -- `announcement  scope_type(studio|class|group)`. §5.11's publishers: a manager
#: anywhere in the studio, a lead coach in their own groups.
ANNOUNCEMENT_SCOPES = ("studio", "class", "group")

#: §4.3 -- `notification_delivery  channel(push|inapp)`. Both, always -- see the module
#: docstring.
DELIVERY_CHANNELS = ("push", "inapp")

#: §4.3 -- `notification_delivery  status(queued|sent|delivered|failed|no_token|denied)`.
#:
#: The last two are the ones that matter and the ones a smaller schema would have merged
#: into `failed`. `no_token`: this person has no registered device at all, which on iOS
#: usually means the app was never added to the home screen (§6.5). `denied`: the OS
#: permission was asked for and refused, which §5.11 answers with a persistent in-app
#: banner rather than a phone call. `failed`: the push service errored, and a retry may
#: work. Three different actions, so three different states.
DELIVERY_STATUSES = ("queued", "sent", "delivered", "failed", "no_token", "denied")

#: §4.3 -- `push_token  app(staff|parent)`. The dashboard is not here: §6.4 makes it the
#: manager's web surface, and a desktop browser tab is not a device we push to.
PUSH_APPS = ("staff", "parent")

#: §4.3 -- `push_token  platform(ios|android|web)`. `web` is Chromium in a normal tab,
#: which is a real delivery target everywhere except iOS -- §5.11.
PUSH_PLATFORMS = ("ios", "android", "web")

#: §4.3 -- `calendar_feed  subject_type(guardian|coach)`. §5.12: a guardian's feed carries
#: all their students' sessions and events, a coach's carries every session they staff.
FEED_SUBJECTS = ("guardian", "coach")

#: §5.11's eight switches, in the order `web/packages/i18n/he/comms.ts` renders them under
#: `preferences.kind.*`. A group and not a kind: §5.11's trigger table has fifteen rows and
#: grows every milestone, and a parent does not think in `billing.overdue.day7`.
#:
#: The two entries that are NOT freely switchable are still here, because the screen has to
#: render them to say why. §5.11: "except health-declaration and payment-failure notices,
#: which are transactional" -- `health` refuses to be turned off at all, and inside the
#: mutable `payment` group the single kind `billing.payment_failed` still delivers. Omitting
#: them from this tuple would leave a parent looking at six switches and wondering which
#: notifications the missing two are.
PREFERENCE_GROUPS = (
    "session_cancelled",
    "coach_substituted",
    "announcement",
    "event",
    "payment",
    "belt",
    "attendance",
    "health",
)


class Announcement(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `announcement  studio_id, author_person_id, title, body, scope_type,
    scope_id?, scheduled_for?, published_at?`.

    **Two nullable timestamps rather than a status column.** `published_at IS NULL` is the
    draft; `scheduled_for` is when it should fire. Keeping them separate means a scheduled
    announcement that never went out is visibly different from one that went out and was
    read, which is exactly the question a manager asks when a parent says they were not
    told.

    `scope_id` carries no foreign key: the referent depends on `scope_type`, and a
    polymorphic reference cannot have one. It is null for `scope_type='studio'`, which
    names no particular row.
    """

    __tablename__ = "announcement"
    __tenant_table_args__ = (
        CheckConstraint(
            "scope_type IN ('studio', 'class', 'group')", name="announcement_scope_type"
        ),
        # A studio-wide announcement names no row; anything narrower must name one, or the
        # audience is undefined and the fan-out silently reaches nobody.
        CheckConstraint(
            "(scope_type = 'studio') = (scope_id IS NULL)", name="announcement_scope_id_present"
        ),
        # The publisher's own list, and the worker's "what is due to go out" scan.
        Index("ix_announcement_studio_id_published_at", "studio_id", "published_at"),
        Index("ix_announcement_studio_id_scheduled_for", "studio_id", "scheduled_for"),
    )

    author_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    scope_type: Mapped[str] = mapped_column(String(10), nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: G15. A published announcement has already been read by parents, and their inbox
    #: rows reference it -- deleting the row would leave those pointing at nothing.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `notification  studio_id, person_id, kind, title, body, payload JSONB,
    read_at?, created_at`.

    One row per **recipient**, not per announcement: §5.11's table has fifteen triggers and
    most of them are per-person events (a charge, a belt, a missing declaration). An
    announcement fans out into many of these.

    `kind` is a plain string rather than a CHECK. §5.11's trigger list grows every
    milestone -- M5 adds at-risk, M6 adds five payment kinds, M7 adds belts -- and a
    constraint here would make each of those a migration in a lane that owns no migrations.
    Preferences are keyed off it (§5.11: "Every notification type is individually mutable
    per user"), which is a settings-shaped problem rather than a referential one.
    """

    __tablename__ = "notification"
    __tenant_table_args__ = (
        # The inbox itself: this person's notifications, newest first.
        Index(
            "ix_notification_studio_id_person_id_created_at",
            "studio_id",
            "person_id",
            "created_at",
        ),
        # The unread badge (§5.11's 🔔③). Partial, because the badge only ever counts
        # unread rows and the read ones are the overwhelming majority within a month.
        Index(
            "ix_notification_studio_id_person_id_unread",
            "studio_id",
            "person_id",
            postgresql_where=text("read_at IS NULL"),
        ),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: What the tap opens -- a session id, a charge id, an event id. §11.7's scrubber
    #: applies to logs, not to this column, but the rule it enforces does: a notification
    #: payload is listed in §18.3's "never" column, so nothing here is ever logged.
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationDelivery(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `notification_delivery  notification_id, channel, status,
    provider_message_id?, error?, sent_at?`.

    **This table is §5.11's delivery report.** Without it a push that never arrived is
    indistinguishable from one that did, and the club learns about it when a parent brings
    their child to a cancelled class.

    `studio_id` is not in §4.3's shorthand column list for this table. It is here because
    the row is a studio's data and `TenantSession` filters on the mixin -- a child table
    without it is a table the tenant filter cannot see. Invariant 2 states that as a closed
    rule, and this branch already made the same call for `event_target` and
    `payment_allocation`.
    """

    __tablename__ = "notification_delivery"
    __tenant_table_args__ = (
        CheckConstraint("channel IN ('push', 'inapp')", name="notification_delivery_channel"),
        CheckConstraint(
            "status IN ('queued', 'sent', 'delivered', 'failed', 'no_token', 'denied')",
            name="notification_delivery_status",
        ),
        # One row per (notification, channel): a second row for the same pair is a second
        # answer to "did this land", and §5.11's counts would double.
        Index(
            "uq_notification_delivery_notification_id_channel",
            "notification_id",
            "channel",
            unique=True,
        ),
        # The report: "who did not receive this", scanned by status.
        Index("ix_notification_delivery_studio_id_status", "studio_id", "status"),
    )

    notification_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("notification.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(6), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="queued")
    #: FCM's id for the send. What a support conversation is traced through when a parent
    #: insists nothing arrived.
    provider_message_id: Mapped[str | None] = mapped_column(String(255))
    #: The provider's error, kept as text. Never the message body -- §18.3.
    error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PushToken(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `push_token  person_id, app(staff|parent), platform(ios|android|web),
    token UNIQUE, last_seen_at`.

    **`token` is unique across the product, not per studio**, because that is what it is:
    FCM hands the same registration back to the same browser on the same device. Two rows
    for one token would double-send every push and count one family twice in §5.11's
    delivery report.

    The consequence is worth stating rather than discovering. `person` is tenant-scoped, so
    a guardian at two studios is two `person` rows -- and one device can therefore be
    registered to only one of them at a time. M8 re-points the row on sign-in rather than
    inserting a second. The alternative, keying the token to the global `auth_identity`,
    would mean the notification fan-out could not find a device from the `person_id` every
    trigger in §5.11 actually has.

    `last_seen_at` is how a dead token is retired: a registration nobody has refreshed in
    months is why a `delivered` status can still mean nobody read it.
    """

    __tablename__ = "push_token"
    __tenant_table_args__ = (
        CheckConstraint("app IN ('staff', 'parent')", name="push_token_app"),
        CheckConstraint("platform IN ('ios', 'android', 'web')", name="push_token_platform"),
        Index("uq_push_token_token", "token", unique=True),
        # The fan-out's own lookup: every device this person has, for this app.
        Index("ix_push_token_studio_id_person_id_app", "studio_id", "person_id", "app"),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="CASCADE"), nullable=False
    )
    app: Mapped[str] = mapped_column(String(6), nullable=False)
    platform: Mapped[str] = mapped_column(String(7), nullable=False)
    #: Long, and opaque. FCM registration tokens run past 160 characters and have no
    #: documented ceiling, so this is sized for headroom rather than for a spec figure.
    token: Mapped[str] = mapped_column(String(512), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CalendarFeed(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `calendar_feed  studio_id, subject_type(guardian|coach), person_id,
    token UNIQUE, rotated_at?`.

    §5.12: `GET /api/v1/calendar/{token}.ics` is unauthenticated by design -- a calendar
    client cannot hold a session -- so **the token is the entire credential**. It is unique
    across the product because the URL carries no studio to disambiguate it, and it is
    rotatable because the only remedy for a shared link is a new one.

    §5.12 also fixes what the feed may contain: "no medical and no financial data". That is
    a constraint on the ICS the lane renders, and it is written here because this row is
    what makes the endpoint reachable.
    """

    __tablename__ = "calendar_feed"
    __tenant_table_args__ = (
        CheckConstraint("subject_type IN ('guardian', 'coach')", name="calendar_feed_subject_type"),
        Index("uq_calendar_feed_token", "token", unique=True),
        # One feed per person per role: a parent who also coaches gets two, and §5.12's two
        # feeds carry different things.
        Index(
            "uq_calendar_feed_person_id_subject_type",
            "person_id",
            "subject_type",
            unique=True,
        ),
    )

    subject_type: Mapped[str] = mapped_column(String(8), nullable=False)
    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="CASCADE"), nullable=False
    )
    #: A long random secret, not a UUID -- a UUID in a URL invites being treated as an
    #: identifier and logged. 43 characters is 32 bytes of urlsafe base64, matching the
    #: refresh token M1 already issues.
    token: Mapped[str] = mapped_column(String(64), nullable=False)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationPreference(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.11 -- "Every notification type is individually mutable per user, except
    health-declaration and payment-failure notices, which are transactional."

    **§4.3 does not list this table and W5's contract commit did not create it.** It is added
    by revision 0010, inside lane COMMS rather than in the wave's contract commit, by
    agreement recorded in docs/superpowers/plans/2026-08-26-m8-comms.md. The alternative was
    a settings screen that could read a preference and not write one, which is a switch that
    lies to the person holding it.

    **Absence means on.** A row exists only once somebody has changed something. That way a
    new guardian receives everything without eight inserts at sign-up, and a preference group
    added in a later milestone defaults to on for people who never saw the screen -- rather
    than being silently off for every existing user because nobody backfilled them.

    **`enabled`, not `muted`.** The screen reads as a switch (`preferences.on` /
    `preferences.off`), and a column whose sense inverts between the database and the UI is a
    bug waiting for a hurried reader. The one place the two genuinely differ -- a disabled
    group still writing the inbox row, and recording the push as `denied` -- is stated in
    `app/services/comms/notifications.py`, where the decision is actually taken.

    **`kind_group` and not `kind`.** See PREFERENCE_GROUPS.
    """

    __tablename__ = "notification_preference"
    __tenant_table_args__ = (
        CheckConstraint(
            "kind_group IN ('session_cancelled', 'coach_substituted', 'announcement', "
            "'event', 'payment', 'belt', 'attendance', 'health')",
            name="notification_preference_kind_group",
        ),
        # One answer per person per group. A second row is a second answer, and the fan-out
        # would then depend on which one it happened to read first. Not per studio: a person
        # IS tenant-scoped, so the pair is already unique within one.
        Index(
            "uq_notification_preference_person_id_kind_group",
            "person_id",
            "kind_group",
            unique=True,
        ),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="CASCADE"), nullable=False
    )
    kind_group: Mapped[str] = mapped_column(String(20), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
