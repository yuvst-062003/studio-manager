"""F7a — the four reminders whose buttons shipped dead.

One service over the existing comms layer, because a second delivery path is how one
product grows two answers about what was sent. Three rules every reminder obeys:

- **Quiet hours.** `לא נשלחות הודעות אחרי 21:00` — the audit's note on the composer,
  implemented here as a refusal between 21:00 and 08:00 Jerusalem. A refusal, not a
  queue: a debt reminder scheduled overnight would land at 08:00 looking like the
  manager got up early to dun a family.
- **Rate limit.** A person is not reminded about the same subject twice within 24
  hours. The notifications table is the record — "reminded 2 days ago" is a query, not
  a second table.
- **One message per household.** Debt is per payer (§6.3), so the reminder addresses
  the payer person, never each child.

Every call writes one audit row with counts, never names.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.comms import Notification
from app.models.events import Event, EventRegistration
from app.models.person import Guardian, Person
from app.models.schedule import Session as SessionRow
from app.models.schedule import SessionStaff
from app.services.audit import AuditService
from app.services.comms import NotificationService

STUDIO_TZ = ZoneInfo("Asia/Jerusalem")
QUIET_START = time(21, 0)
QUIET_END = time(8, 0)
RATE_LIMIT = timedelta(hours=24)

DEBT_KIND = "billing.reminder"
COACH_KIND = "attendance.reminder_unmarked"
EVENT_KIND = "event.rsvp_reminder"


class QuietHoursError(Exception):
    """No messages after 21:00. The refusal is the feature."""


class NotFoundError(LookupError):
    pass


def in_quiet_hours(at: datetime) -> bool:
    local = at.astimezone(STUDIO_TZ).time()
    return local >= QUIET_START or local < QUIET_END


class ReminderService:
    def __init__(self, session: TenantSession) -> None:
        self.session = session

    # -- shared machinery ---------------------------------------------------------

    def _recently_reminded(self, kind: str, subject: str | None, at: datetime) -> set[uuid.UUID]:
        # The cutoff reads `reminded_at` from the payload, not the row's `created_at`:
        # the send is stamped with app.core.clock.now(), and §19's dev clock can put that
        # anywhere while the database column keeps wall time. Comparing the two would
        # make the rate limit a function of which clock a test froze.
        stmt = select(Notification.person_id, Notification.payload).where(
            Notification.kind == kind
        )
        rows = self.session.execute(stmt).all()
        cutoff = (at - RATE_LIMIT).isoformat()
        return {
            person_id
            for person_id, payload in rows
            if (payload or {}).get("reminded_at", "") >= cutoff
            and (subject is None or (payload or {}).get("subject") == subject)
        }

    def _send(
        self,
        *,
        kind: str,
        recipients: set[uuid.UUID],
        subject: str | None,
        title: str,
        body: str,
        payload: dict[str, object],
        actor_person_id: uuid.UUID | None,
        at: datetime,
        audit_action: str,
        audit_entity: tuple[str, uuid.UUID],
    ) -> dict[str, int]:
        if in_quiet_hours(at):
            raise QuietHoursError
        recent = self._recently_reminded(kind, subject, at)
        to_send = sorted(recipients - recent, key=str)
        notifier = NotificationService(self.session)
        for person_id in to_send:
            stamped: dict[str, object] = {**payload, "reminded_at": at.isoformat()}
            if subject:
                stamped["subject"] = subject
            notifier.enqueue(
                person_id=person_id, kind=kind, title=title, body=body, payload=stamped
            )
        entity_type, entity_id = audit_entity
        AuditService.record(
            self.session,
            action=audit_action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_person_id=actor_person_id,
            # Counts, never a name: an audit entry has a wider audience than the message.
            diff={"sent": len(to_send), "skipped_recent": len(recipients & recent)},
        )
        return {"sent": len(to_send), "skipped_recent": len(recipients & recent)}

    # -- the four reminders -------------------------------------------------------

    def remind_debt(
        self,
        payer_person_ids: list[uuid.UUID],
        *,
        actor_person_id: uuid.UUID | None,
        at: datetime,
    ) -> dict[str, int]:
        """One household or many — the bulk button is this same call with more ids."""
        recipients = set(
            self.session.execute(select(Person.id).where(Person.id.in_(payer_person_ids))).scalars()
        )
        first = payer_person_ids[0] if payer_person_ids else uuid.uuid4()
        return self._send(
            kind=DEBT_KIND,
            recipients=recipients,
            subject=None,
            title="תזכורת תשלום",
            body="יש חוב פתוח במועדון. אפשר לשלם דרך מסך התשלומים.",
            payload={},
            actor_person_id=actor_person_id,
            at=at,
            audit_action="billing.reminder_sent",
            audit_entity=("payer", first),
        )

    def remind_coach(
        self, session_id: uuid.UUID, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> dict[str, int]:
        """§5.14 — an unmarked register is a forgotten register, not absent children."""
        session_row = self.session.get(SessionRow, session_id)
        if session_row is None:
            raise NotFoundError(f"no session {session_id}")
        coaches = set(
            self.session.execute(
                select(SessionStaff.person_id).where(SessionStaff.session_id == session_id)
            ).scalars()
        )
        if not coaches:
            raise NotFoundError("the session has no coach to remind")
        return self._send(
            kind=COACH_KIND,
            recipients=coaches,
            subject=str(session_id),
            title="נוכחות טרם נרשמה",
            body="יש שיעור שממתין לסימון נוכחות.",
            payload={"session_id": str(session_id)},
            actor_person_id=actor_person_id,
            at=at,
            audit_action="attendance.coach_reminded",
            audit_entity=("session", session_id),
        )

    def remind_event_non_responders(
        self, event_id: uuid.UUID, *, actor_person_id: uuid.UUID | None, at: datetime
    ) -> dict[str, int]:
        """Every guardian of every student whose RSVP is still pending — once per
        person even when two siblings are both invited."""
        event = self.session.get(Event, event_id)
        if event is None:
            raise NotFoundError(f"no event {event_id}")
        pending_students = self.session.execute(
            select(EventRegistration.student_id).where(
                EventRegistration.event_id == event_id, EventRegistration.rsvp == "pending"
            )
        ).scalars()
        guardians = set(
            self.session.execute(
                select(Guardian.person_id).where(Guardian.student_id.in_(set(pending_students)))
            ).scalars()
        )
        return self._send(
            kind=EVENT_KIND,
            recipients=guardians,
            subject=str(event_id),
            title=event.title,
            body="טרם עניתם להזמנה לאירוע. נשמח לתשובה.",
            payload={"event_id": str(event_id)},
            actor_person_id=actor_person_id,
            at=at,
            audit_action="event.non_responders_reminded",
            audit_entity=("event", event_id),
        )
