"""§5.8's RSVP, its consent gate, and event attendance.

**Confirmation is derived, never stored.** §5.8: "If `requires_consent`, the guardian must
sign the event's consent text before the RSVP counts as confirmed." So `rsvp='yes'` is
always recorded -- refusing the answer would lose the fact that the parent said yes -- and
`is_confirmed` is the pair. Artboard `7d` finding 1 is that the design does not express the
gate at all: the confirm button and the consent card are independent, simultaneously usable
controls with nothing tying them. `events.consent.blocksConfirmation` is the string that
does say it, and this module is it in code.

**The fee fires from whichever act completes the pair.** A parent may sign first and answer
second, or the reverse. Both paths end in `EventFeeService.charge_if_confirmed`, which is
idempotent on `registration.charge_id`.

**A consent signature writes two rows.** `event_registration.consent_signed_at` is
authoritative, because it is the only column that names *which event* was consented to --
`consent_record` carries `subject_id` and `consent_type='event'` but no `event_id`. §11.6's
ledger gets its row anyway, because a consent ledger with holes is not a ledger.

**Nothing here logs a consent's contents.** §14 makes parental consent for a minor's
competition a health-adjacent record; what a list needs is whether it was signed.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.events import Event, EventRegistration
from app.models.health import ConsentRecord
from app.models.person import Guardian
from app.services.events.errors import (
    ConsentNotRequiredError,
    EventNotPublishedError,
    NotRegisteredForEventError,
    NotThisGuardiansStudentError,
    RsvpDeadlinePassedError,
)
from app.services.events.events import EventService
from app.services.events.fees import EventFeeService

#: The statuses a parent may answer against. A cancelled event has nothing to answer, and
#: a draft is invisible to them (§4.3).
ANSWERABLE_STATUSES = ("published",)


class RsvpService:
    @staticmethod
    def students_of_guardian(session: TenantSession, person_id: uuid.UUID) -> set[uuid.UUID]:
        """§3.2's guardian column: "own" always means only for my own children."""
        return set(
            session.execute(
                select(Guardian.student_id).where(Guardian.person_id == person_id)
            ).scalars()
        )

    @staticmethod
    def assert_guardian_of(
        session: TenantSession, person_id: uuid.UUID, student_id: uuid.UUID
    ) -> None:
        if student_id not in RsvpService.students_of_guardian(session, person_id):
            raise NotThisGuardiansStudentError(str(student_id))

    @staticmethod
    def is_confirmed(event: Event, registration: EventRegistration) -> bool:
        """§5.8's gate, in one expression, and the only definition of it in the product.

        A second implementation -- in a client, in a report -- is how "confirmed" starts
        meaning two things, and the one that decides whether a family is billed is this one.
        """
        if registration.rsvp != "yes":
            return False
        return not event.requires_consent or registration.consent_signed_at is not None

    @staticmethod
    def _registration(
        session: TenantSession, event_id: uuid.UUID, student_id: uuid.UUID
    ) -> EventRegistration:
        row = session.execute(
            select(EventRegistration).where(
                EventRegistration.event_id == event_id,
                EventRegistration.student_id == student_id,
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotRegisteredForEventError(str(student_id))
        return row

    @staticmethod
    def answer(
        session: TenantSession,
        event_id: uuid.UUID,
        student_id: uuid.UUID,
        *,
        rsvp: str,
        by_person_id: uuid.UUID,
        at: datetime,
    ) -> tuple[Event, EventRegistration]:
        event = EventService.read(session, event_id)
        if event.status not in ANSWERABLE_STATUSES:
            raise EventNotPublishedError(event.status)
        if event.rsvp_deadline is not None and at > event.rsvp_deadline:
            raise RsvpDeadlinePassedError(str(event.rsvp_deadline))

        registration = RsvpService._registration(session, event_id, student_id)
        registration.rsvp = rsvp
        registration.responded_by_person_id = by_person_id
        registration.responded_at = at
        session.flush()
        EventFeeService.charge_if_confirmed(
            session,
            event,
            registration,
            at=at,
            confirmed=RsvpService.is_confirmed(event, registration),
        )
        return event, registration

    @staticmethod
    def sign_consent(
        session: TenantSession,
        event_id: uuid.UUID,
        student_id: uuid.UUID,
        *,
        by_person_id: uuid.UUID,
        at: datetime,
        ip: str | None,
    ) -> tuple[Event, EventRegistration]:
        event = EventService.read(session, event_id)
        if event.status not in ANSWERABLE_STATUSES:
            raise EventNotPublishedError(event.status)
        if not event.requires_consent:
            raise ConsentNotRequiredError(str(event_id))

        registration = RsvpService._registration(session, event_id, student_id)
        if registration.consent_signed_at is None:
            registration.consent_signed_at = at
            # §11.6's ledger, once. Re-signing is not a second grant: a withdrawal there is
            # a NEW row, so a duplicate grant would be indistinguishable from a genuine
            # re-grant after a revocation.
            session.add(
                ConsentRecord(
                    subject_type="student",
                    subject_id=student_id,
                    consent_type="event",
                    version=1,
                    granted=True,
                    granted_at=at,
                    ip=ip,
                )
            )
            session.flush()
        EventFeeService.charge_if_confirmed(
            session,
            event,
            registration,
            at=at,
            confirmed=RsvpService.is_confirmed(event, registration),
        )
        return event, registration

    @staticmethod
    def mark_attendance(
        session: TenantSession, event_id: uuid.UUID, marks: dict[uuid.UUID, bool]
    ) -> int:
        """§5.8 -- "attendance is taken on an event with the same UI as a session".

        `attended` is distinct from `rsvp`: a family that said yes and did not come is
        exactly the row the office wants to see. Nothing here touches `charge_id` -- a
        no-show still owes the fee, and a refund is a credit M6 writes.
        """
        if not marks:
            return 0
        rows = list(
            session.execute(
                select(EventRegistration).where(
                    EventRegistration.event_id == event_id,
                    EventRegistration.student_id.in_(list(marks)),
                )
            ).scalars()
        )
        for row in rows:
            row.attended = marks[row.student_id]
        session.flush()
        return len(rows)
