"""The one place this lane touches money, and it touches it by asking.

Plan W4: "Event fees call `BillingService.create_charge(kind='event')`. The events lane
never writes to a billing table directly." Everything below exists to make that one call
correctly and exactly once.

**Why every argument is passed by name.** `create_charge`'s `student_id` and `event_id`
are keyword-only in the contract, deliberately: both are `UUID | None` in adjacent
positions, so positionally an event id binds happily to `student_id` and no type checker
can see it. M7 is the lane most likely to make that mistake, being the only one that
passes `event_id` at all. Naming every argument -- including the ones that are not
keyword-only -- means the mistake cannot be made in the other four either.

**`BillingService` is instantiated here rather than held as a module singleton**, so a
test substitutes the class at this module's name and the seam is exercised through the
same call production makes. Its body is `NotImplementedError` until lane MONEY lands;
that is the seam working, not a gap.

**A charge is raised once, on confirmation.** `event_registration.charge_id` is the record
that it has been, and it is what makes a repeated answer safe: `events.rsvp.change` exists
precisely because changing an answer is expected, and a family must not be billed twice
for changing their mind back.

**NULL is free and zero is not.** `app/schemas/events.py`: "a zero-fee event would create
a zero charge and a receipt for nothing."
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.tenancy import TenantSession, require_current_studio_id
from app.models.events import Event, EventRegistration
from app.models.person import Guardian
from app.services.billing import BillingService

logger = logging.getLogger(__name__)

#: §5.8 puts no due date on an event fee, so it falls due before the event happens -- a
#: family paying afterwards has already been to the competition. A week is the shortest
#: window that is not "today" for an event published a fortnight out; an event created
#: closer than that yields a due date in the past, which is correct rather than a bug: the
#: money is owed now.
DUE_BEFORE_EVENT = timedelta(days=7)


class EventFeeService:
    @staticmethod
    def primary_payer(session: TenantSession, student_id: uuid.UUID) -> uuid.UUID | None:
        """§5.10 -- a charge's payer is the student's primary guardian.

        `is_primary` first, then any guardian, then nothing. A child with no guardian at
        all is a real row mid-intake, and the right behaviour there is to raise no charge
        rather than to invent a payer: an unpayable charge on a stranger's balance is worse
        than a fee the office chases by hand.
        """
        row = session.execute(
            select(Guardian.person_id)
            .where(Guardian.student_id == student_id)
            .order_by(Guardian.is_primary.desc(), Guardian.person_id)
            .limit(1)
        ).scalar_one_or_none()
        return row

    @staticmethod
    def charge_if_confirmed(
        session: TenantSession,
        event: Event,
        registration: EventRegistration,
        *,
        at: datetime,
        confirmed: bool,
    ) -> uuid.UUID | None:
        """Raise the event fee, or do nothing, and say which by returning the charge id.

        Every reason to do nothing is a legitimate state rather than an error: the pair is
        not complete, the event is free, or the fee has already been raised.
        """
        if not confirmed or event.fee_agorot is None or registration.charge_id is not None:
            return None

        payer_person_id = EventFeeService.primary_payer(session, registration.student_id)
        if payer_person_id is None:
            # `extra=`, never an f-string: the scrubber matches keys, and an interpolated
            # message has none for it to match (CLAUDE.md, §Core mechanisms).
            logger.warning(
                "event fee not raised: the student has no guardian to bill",
                extra={
                    "event_id": str(event.id),
                    "student_id": str(registration.student_id),
                },
            )
            return None

        charge = BillingService().create_charge(
            studio_id=require_current_studio_id(),
            payer_person_id=payer_person_id,
            kind="event",
            amount_agorot=event.fee_agorot,
            due_date=(event.starts_at - DUE_BEFORE_EVENT).date(),
            # Keyword-only in the contract, and named here for the reason in the module
            # docstring. Never reorder these two, and never make either positional.
            student_id=registration.student_id,
            event_id=event.id,
        )
        registration.charge_id = charge.id
        session.flush()
        return charge.id
