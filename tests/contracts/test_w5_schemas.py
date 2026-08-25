"""W5's Pydantic shapes: the comms surface and the export request.

Two rules from §5.11 and §5.12 are enforced here as *types*, because both are the kind of
rule that a screen quietly breaks by adding one convenient field:

- **The inbox is one-way** (§2.3, §5.11, D9.1). A notification has no sender and no reply.
- **The calendar feed carries no medical and no financial data** (§5.12). It is an
  unauthenticated URL a parent may hand to Google, and Google keeps it for as long as it
  likes.
"""

from __future__ import annotations

import pytest
from app.schemas._pagination import CursorPage
from app.schemas.comms import (
    AnnouncementIn,
    AnnouncementOut,
    CalendarFeedOut,
    DeliveryReportOut,
    NotificationOut,
    PushTokenIn,
)
from app.schemas.reports import DataExportRequestOut
from pydantic import ValidationError


def _origin(model):
    return getattr(model, "__pydantic_generic_metadata__", {}).get("origin")


# -- G16 ----------------------------------------------------------------------
def test_both_verticals_expose_a_cursor_page():
    """The alias `tests/contracts/test_w2_schemas.py` asks every vertical for. Without it
    a lane writes its own envelope and the generated client grows a thirtieth shape."""
    from app.schemas import comms, reports

    for module in (comms, reports):
        assert [name for name, obj in vars(module).items() if _origin(obj) is CursorPage]


# -- §5.11's one-way rule, as a type ------------------------------------------
def test_a_notification_has_no_sender_and_no_reply():
    """§2.3 lists in-app two-way chat as out of scope and §5.11 permits push plus a
    one-way inbox. A `sender_person_id` on the shape is how a parent-facing reply box
    becomes a two-line change."""
    fields = set(NotificationOut.model_fields)
    for forbidden in ("sender_person_id", "reply_to_id", "thread_id", "can_reply"):
        assert forbidden not in fields


def test_an_announcement_names_its_audience_before_it_can_be_published():
    """§5.11: a manager publishes studio-wide, to a class, or to a group; a lead coach to
    their own groups. The scope is what the permission check reads, so it cannot be
    optional on the way in."""
    assert AnnouncementIn.model_fields["scope_type"].is_required()

    with pytest.raises(ValidationError):
        AnnouncementIn(title="x", body="y", scope_type="everyone")


def test_an_announcement_out_carries_its_publication_state():
    """A manager looking at the list has to be able to tell a draft from a scheduled send
    from one that has already gone out — those are three different next actions."""
    fields = set(AnnouncementOut.model_fields)
    assert {"scheduled_for", "published_at"} <= fields


# -- §5.11's delivery report --------------------------------------------------
def test_the_delivery_report_carries_the_numbers_to_phone():
    """§5.11 draws this screen exactly: "נשלח ל-24 משפחות · ✓ 19 קיבלו · ⚠ 5 לא קיבלו —
    התראות כבויות", then the five names and phone numbers, then [ העתק מספרים ].

    The counts alone would tell a manager that five families missed a cancellation without
    telling them *which*. The whole mechanism — half a day of work, per §5.11, instead of a
    WhatsApp Business integration — is that the manager can paste those numbers into the
    group chat the club already has.
    """
    fields = set(DeliveryReportOut.model_fields)
    assert {"sent_count", "received_count", "missed_count", "missed"} <= fields

    missed = DeliveryReportOut.model_fields["missed"].annotation
    row = missed.__args__[0]  # list[MissedRecipientOut]
    assert {"person_id", "name", "phone", "reason"} <= set(row.model_fields)


def test_a_missed_recipient_says_why_in_a_way_the_manager_can_act_on():
    """`no_token` and `denied` reach the screen as themselves. "Didn't receive it" is not
    actionable; "never installed the app" and "turned notifications off" are different
    conversations."""
    row = DeliveryReportOut.model_fields["missed"].annotation.__args__[0]
    reason = row.model_fields["reason"].annotation
    assert {"no_token", "denied", "failed"} <= set(reason.__args__)


# -- §5.12's feed -------------------------------------------------------------
def test_the_calendar_feed_shape_carries_no_medical_or_financial_field():
    """§5.12, verbatim: "The feed contains no medical and no financial data."

    This is an unauthenticated URL whose only credential is a token a parent may paste
    into Google Calendar, which then fetches it forever from Google's own servers. A
    balance or a health flag reaching this shape leaves the product's control entirely.
    """
    fields = set(CalendarFeedOut.model_fields)
    for forbidden in ("balance_agorot", "derived_flags", "health_status", "charges", "amount"):
        assert forbidden not in fields


def test_the_feed_out_carries_the_url_and_when_it_was_last_rotated():
    """§5.12: rotatable from settings, and rotating invalidates the old URL immediately.
    A settings screen that cannot say when the link was last rotated cannot tell a worried
    parent whether the old one still works."""
    assert {"url", "rotated_at", "subject_type"} <= set(CalendarFeedOut.model_fields)


# -- push registration --------------------------------------------------------
def test_registering_a_device_states_the_app_and_the_platform():
    """Both are needed to read the delivery report honestly. §6.5: on iOS Web Push exists
    only for a home-screen web app, so an `ios` + `parent` registration that never appears
    is the install funnel failing, not the push service."""
    assert {"token", "app", "platform"} <= set(PushTokenIn.model_fields)

    with pytest.raises(ValidationError):
        PushTokenIn(token="t", app="dashboard", platform="web")


# -- §11.3's export -----------------------------------------------------------
def test_the_export_response_never_hands_out_the_storage_key():
    """`object_key` is an internal pointer into object storage (§8.1). Returning it to a
    caller turns a bundle of a child's complete record into a direct object reference, and
    §11.3 promises a *time-limited* link — which a raw key is not."""
    fields = set(DataExportRequestOut.model_fields)
    assert "object_key" not in fields
    assert "download_url" in fields


def test_the_export_response_distinguishes_expired_from_failed():
    """A guardian whose link expired should be told to ask again. One whose export failed
    should be told someone is looking at it. Collapsing them gives the wrong answer to one
    of the two."""
    status = DataExportRequestOut.model_fields["status"].annotation
    assert {"pending", "running", "completed", "failed", "expired"} <= set(status.__args__)
