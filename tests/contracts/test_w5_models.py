"""W5's contract commit: §4.3's communications block, and `data_export_request`.

**The wave's defining fact is that delivery can fail silently.** §5.11: push is opt-in, on
iOS and on Android 13+, so *some parents will never receive alerts* — and §12 lists that as
a known limitation rather than a bug to fix. The mitigation §5.11 specifies is a delivery
report the publisher reads after a cancellation: "נשלח ל-24 משפחות · ✓ 19 קיבלו · ⚠ 5 לא
קיבלו — התראות כבויות", with the five phone numbers to paste into the club's WhatsApp group.

That report is only possible if `notification_delivery.status` can distinguish *why* a
message did not land. `failed` alone would collapse "the push service errored" together
with "this family has no token" and "this family said no" — and the office would have no
list to phone. The tests below are mostly that one requirement, examined from several sides.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery populates the metadata
import pytest
import sqlalchemy as sa
from app.core.tenancy import TenantMixin
from app.models.base import Base
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

W5_COMMS_TABLES = (
    "announcement",
    "notification",
    "notification_delivery",
    "push_token",
    "calendar_feed",
)
W5_REPORTS_TABLES = ("data_export_request",)
W5_TABLES = W5_COMMS_TABLES + W5_REPORTS_TABLES


def _table(name: str) -> sa.Table:
    return Base.metadata.tables[name]


def _enumeration(table: str, column: str) -> str:
    """The rendered SQL of the CHECK constraint that enumerates `column`'s allowed values.

    Matched on the SQL *starting* with `<column> IN (`, not on containing it. Several of
    these tables carry a second CHECK over the same column for a different reason -- an
    announcement's scope_id presence rule names `scope_type`, and the export request has
    two rules that both name `status` and one of which contains a whole `IN` list. Those
    are all parenthesised comparisons, so they start with `(`; only the enumeration starts
    with the bare column name.
    """
    wanted = f"{column} IN ("
    for constraint in _table(table).constraints:
        if isinstance(constraint, sa.CheckConstraint) and str(constraint.sqltext).startswith(
            wanted
        ):
            return str(constraint.sqltext)
    raise AssertionError(f"{table} has no CHECK enumerating {column!r}")


@pytest.mark.parametrize("table", W5_TABLES)
def test_the_table_exists(table):
    assert table in Base.metadata.tables


@pytest.mark.parametrize("table", W5_TABLES)
def test_every_w5_table_is_tenant_scoped(table):
    """G9. Every one of these is a studio's data — including the two §4.3 writes without a
    `studio_id` in its shorthand column list, `notification_delivery` and `push_token`.

    Both are children of tenant-scoped rows (`notification`, `person`), and this branch has
    already made that call for `event_target` and `payment_allocation`: the mixin is what
    `TenantSession` filters on, so a child without it is a table the tenant filter cannot
    see. Invariant 2 states the rule as a closed one — a table is scoped or it is named in
    `CROSS_TENANT_TABLES` with a reason — and neither of these has a reason to be global.
    """
    mapper = next(m for m in Base.registry.mappers if m.local_table is _table(table))
    assert issubclass(mapper.class_, TenantMixin)


# -- §5.11's delivery report is the whole point -------------------------------
def test_a_delivery_can_say_why_it_did_not_land():
    """`no_token` and `denied` are separate states, and neither is `failed`.

    They are different facts about a family and they lead to different actions. `no_token`
    means nobody ever installed the app or granted permission on this device — §6.5 makes
    that the product's main adoption risk on iOS, where Web Push exists *only* for a
    home-screen web app. `denied` means the OS permission was asked for and refused, which
    §5.11 answers with a persistent in-app banner rather than a phone call. `failed` means
    the push service errored and a retry might work.

    Collapse them and the manager's ⚠ list becomes "5 didn't get it, reason unknown".
    """
    text = _enumeration("notification_delivery", "status")
    for status in ("queued", "sent", "delivered", "failed", "no_token", "denied"):
        assert f"'{status}'" in text, f"{status} is not an allowed delivery status"


def test_delivery_is_recorded_per_channel():
    """§5.11: "Every message goes to both. Push is the doorbell; the inbox is where the
    message lives. They are not alternatives." One row per channel is what lets the report
    say a family has the message but never heard it ring."""
    text = _enumeration("notification_delivery", "channel")
    assert "'push'" in text and "'inapp'" in text


def test_a_delivery_belongs_to_a_notification():
    columns = _table("notification_delivery").columns
    assert "notification_id" in columns
    assert not columns["notification_id"].nullable


def test_a_delivery_carries_the_provider_message_id_and_the_error():
    """Both nullable, and both needed. Without `provider_message_id` a delivery cannot be
    traced back to FCM when a parent insists nothing arrived; without `error` the reason a
    send failed is lost the moment the worker exits."""
    columns = _table("notification_delivery").columns
    assert {"provider_message_id", "error", "sent_at"} <= set(columns.keys())
    for name in ("provider_message_id", "error", "sent_at"):
        assert columns[name].nullable, f"{name} must be nullable — it is unknown until sent"


# -- the two secrets, and why they are globally unique ------------------------
def test_a_calendar_feed_token_is_unique():
    """§5.12: the feed lives at `GET /api/v1/calendar/{token}.ics` and the token "is a long
    random secret", the *only* credential on an endpoint with no session. The URL carries no
    studio, so the token has to identify the feed across the whole product — a per-studio
    uniqueness constraint would let two studios issue the same URL."""
    assert _unique_index_on("calendar_feed", "token")


def test_a_push_token_is_unique():
    """§4.3 writes `token UNIQUE`. One device registration is one row: FCM hands the same
    token back to the same browser, and two rows for it would double-send every push and
    make the delivery report count one family twice."""
    assert _unique_index_on("push_token", "token")


def _unique_index_on(table: str, column: str) -> bool:
    single = [
        index
        for index in _table(table).indexes
        if index.unique and tuple(index.columns.keys()) == (column,)
    ]
    unique_constraints = [
        constraint
        for constraint in _table(table).constraints
        if isinstance(constraint, sa.UniqueConstraint)
        and tuple(constraint.columns.keys()) == (column,)
    ]
    return bool(single or unique_constraints)


def test_a_feed_is_rotatable():
    """§5.12: "rotatable from settings — rotating invalidates the old URL immediately."
    `rotated_at` is how a parent who shared the link by accident gets a new one."""
    assert "rotated_at" in _table("calendar_feed").columns


def test_a_feed_belongs_to_a_guardian_or_a_coach():
    text = _enumeration("calendar_feed", "subject_type")
    assert "'guardian'" in text and "'coach'" in text


# -- announcements are one-way, and D9.1 is structural ------------------------
def test_an_announcement_is_scoped_to_the_studio_a_class_or_a_group():
    text = _enumeration("announcement", "scope_type")
    for scope in ("studio", "class", "group"):
        assert f"'{scope}'" in text


def test_an_announcement_can_be_scheduled_and_is_not_published_until_it_is():
    """§5.11: "publishes a title and body, optionally scheduled." Two nullable timestamps
    rather than a status: `published_at IS NULL` is the draft, and a scheduled announcement
    that never fired is visibly distinguishable from one that fired and was read."""
    columns = _table("announcement").columns
    assert columns["scheduled_for"].nullable
    assert columns["published_at"].nullable


def test_an_announcement_is_soft_deleted():
    """G15 — soft delete on user-generated content. A published announcement has been read
    by parents; removing the row would leave their inbox referring to nothing."""
    assert "deleted_at" in _table("announcement").columns


def test_there_is_no_reply_anywhere_in_the_comms_schema():
    """D9.1 and §2.3, as structure rather than as a note in a document.

    §2.3 lists in-app two-way chat as explicitly out of scope and §5.11 permits exactly two
    levels — push, and a **one-way** inbox. The canvas cut `שיחה עם המשרד` from artboard
    `2b` for that reason. A `reply_to_id`, a `thread_id` or a `sender_person_id` on a
    notification is how that decision gets quietly reversed by a lane that thought it was
    adding a small feature.
    """
    forbidden = {"reply_to_id", "thread_id", "in_reply_to", "conversation_id", "sender_person_id"}
    for table in W5_COMMS_TABLES:
        leaked = forbidden & set(_table(table).columns.keys())
        assert not leaked, f"{table} carries {leaked} — §2.3 has no two-way messaging"


# -- notifications ------------------------------------------------------------
def test_a_notification_carries_a_json_payload_and_a_read_marker():
    """§4.3. `payload` is what the tap opens — a session id, a charge id — so the inbox row
    can route without the client re-deriving it from the title."""
    columns = _table("notification").columns
    assert isinstance(columns["payload"].type, JSONB)
    assert columns["read_at"].nullable


def test_a_notification_names_the_person_it_is_for():
    columns = _table("notification").columns
    assert isinstance(columns["person_id"].type, PGUUID)
    assert not columns["person_id"].nullable


# -- §11.3's export request ---------------------------------------------------
def test_an_export_request_records_who_asked_and_who_it_is_about():
    """§11.3: "A guardian requests everything held about their students... Managers can
    trigger the same for any student." Two different people, so two columns — and the audit
    trail is meaningless if a manager-triggered export is indistinguishable from the
    guardian's own."""
    columns = _table("data_export_request").columns
    assert not columns["subject_person_id"].nullable
    assert not columns["requested_by_person_id"].nullable


def test_an_export_request_has_no_bundle_until_it_has_one():
    """`object_key` is null until the worker finishes. §11.3 delivers "a time-limited
    download link", so `completed_at` is also what an expiry is measured from."""
    columns = _table("data_export_request").columns
    assert columns["object_key"].nullable
    assert columns["completed_at"].nullable


def test_an_export_request_can_expire():
    """The state §11.3 implies and §4.3 does not enumerate. A bundle of a child's complete
    record cannot sit behind a live link forever, so `expired` is a real terminal state and
    not the same as `failed`."""
    text = _enumeration("data_export_request", "status")
    for status in ("pending", "running", "completed", "failed", "expired"):
        assert f"'{status}'" in text


def test_the_export_bundle_is_a_pointer_not_a_blob():
    """§8.1: "Signed health PDFs, student photos, studio logos, data-export bundles" live in
    object storage, not in Postgres. A bundle inlined here would put a child's entire record
    — health declarations included — into every database backup and every replica."""
    columns = _table("data_export_request").columns
    assert isinstance(columns["object_key"].type, sa.String)
    assert "payload" not in columns and "bundle" not in columns
