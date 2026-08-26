"""See tests/billing/test_the_lane_fixtures_build.py for why this exists."""

from __future__ import annotations

import uuid

from app.models.events import Event, EventRegistration
from sqlalchemy.orm import Session
from tests.events.conftest import EVENT_FEE_AGOROT


def test_every_events_fixture_builds_against_the_real_schema(
    app_session: Session,
    as_owner,
    as_manager,
    as_lead_coach,
    as_assistant_coach,
    a_class: uuid.UUID,
    a_group: uuid.UUID,
    a_student: uuid.UUID,
    an_event: uuid.UUID,
    a_registered_student: uuid.UUID,
    tenant_session,
) -> None:
    event = app_session.get(Event, an_event)
    assert event is not None
    # event_consent_has_text: the CHECK that would reject this row if the fixture set the
    # flag without the text. Asserted rather than trusted, because the failure mode is a
    # fixture error that reads as a code error in every test in the lane.
    assert event.requires_consent is True
    assert event.consent_text
    assert event.ends_at > event.starts_at
    assert event.fee_agorot == EVENT_FEE_AGOROT
    assert event.status == "published"


def test_a_registration_starts_pending_and_owes_nothing_yet(
    app_session: Session, a_registered_student: uuid.UUID
) -> None:
    """`charge_id` is null because §5.12's fee is created by
    `BillingService.create_charge(kind='event')` and this lane never writes a billing
    table. A fixture that pre-filled it would hide the seam it must go through.

    `rsvp='pending'` is a real state, distinct from having declined, and `attended` is
    distinct from both -- saying yes and turning up are different facts."""
    registration = app_session.get(EventRegistration, a_registered_student)
    assert registration is not None
    assert registration.rsvp == "pending"
    assert registration.charge_id is None
    assert registration.attended is False
