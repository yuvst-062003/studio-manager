"""Which notices ask a parent for something, and whether the club is still waiting.

Screen 7 of the parent redesign (`docs/superpowers/specs/2026-08-31-parent-app-stitch-
redesign-design.md`) replaced the inbox's organising axis. The shipped screen had only
`read_at`, and `read_at` is wrong in both directions:

* Sign a declaration from §6.1's gate and the notice is never opened — it stays unread and
  the inbox goes on demanding something already done.
* Open the notice and press `אחר כך` and it is marked read — the demand disappears while
  the obligation stands.

**Five of the ten kinds a parent can receive ask for something, and for every one of them
the club's own records already know whether it was done.** That is the whole reason this
module can exist: nothing new is stored, and there is no `settled` column to keep in step
with reality. `read_at` survives, demoted to the `חדש` mark on notices that ask for nothing.

**Resolved on read, never written.** A column would be a second source of truth for a fact
`student.health_status` and the payer's balance already hold, and the two would drift the
first time a declaration was signed by a route that forgot to update it. The cost is a
handful of queries per inbox page, and `_Memo` below keeps it to one per subject rather
than one per row — a family chased on days 1, 3 and 7 has three notices about one child.

**The client is told the FACT, not the WORDS.** `kind` is an enum the parent app maps to a
label and a route; the server names no Hebrew and no `#/` path. §5.11's trigger list grows
every milestone and a server that shipped button text would need a deploy to fix a typo.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.comms import Notification
from app.models.events import EventRegistration
from app.models.health import HealthDeclaration
from app.models.people import Student, TrialBooking
from app.models.person import Guardian, Person

#: Notification kind -> what it asks for. A kind that is not here asks for nothing, which
#: is the default and the safe direction: a notice nobody can act on renders as an
#: announcement rather than growing a button that goes nowhere.
#:
#: `trial.no_show` is deliberately absent and `app/workers/followups.py` says why —
#: "offering a family who did not come a join button is the same mistake as asking them
#: how it was, with money attached". `health.injury` is absent because a report of
#: something that already happened asks for nothing.
ACTION_BY_KIND: dict[str, str] = {
    "health.declaration_missing": "health_declaration",
    "health.declaration_renewal": "health_renewal",
    "billing.reminder": "payment",
    "billing.prepay_ending": "payment",
    "billing.payment_failed": "payment",
    "event.rsvp_reminder": "event_rsvp",
    "trial.followup": "trial_join",
}


@dataclass(frozen=True)
class InboxAction:
    """What one notice asks for, and where the club's records say it stands."""

    kind: str
    outstanding: bool
    #: When it was settled, where a column says so honestly. `None` for a payment: a
    #: balance reaching zero is the sum of allocations across many charges and has no
    #: single moment, and inventing one would put a fabricated date on a parent's screen.
    settled_at: datetime | None = None
    #: The child this is about, for the kinds that name one. Two children owing the same
    #: thing produced two identical cards on the shipped screen.
    subject_name: str | None = None


def _uuid(payload: dict[str, Any], key: str) -> uuid.UUID | None:
    """A payload is JSONB written by a worker; a malformed id is a bad row, not a 500."""
    raw = payload.get(key)
    if not isinstance(raw, str):
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


class InboxActionResolver:
    """One per request. Memoises per subject, so a day-1/3/7 ladder costs one lookup."""

    def __init__(self, session: TenantSession) -> None:
        self._session = session
        self._students: dict[uuid.UUID, Student | None] = {}
        self._names: dict[uuid.UUID, str | None] = {}
        self._signed: dict[uuid.UUID, list[datetime]] = {}
        self._balances: dict[uuid.UUID, int] = {}
        self._my_students: dict[uuid.UUID, set[uuid.UUID]] = {}

    # -- memoised lookups ------------------------------------------------------

    def _student(self, student_id: uuid.UUID) -> Student | None:
        if student_id not in self._students:
            self._students[student_id] = self._session.get(Student, student_id)
        return self._students[student_id]

    def _name(self, student_id: uuid.UUID) -> str | None:
        """The child's first name. Enough to tell two cards apart, and no more than the
        parent already reads on every other screen."""
        if student_id not in self._names:
            student = self._student(student_id)
            person = self._session.get(Person, student.person_id) if student is not None else None
            self._names[student_id] = person.first_name if person is not None else None
        return self._names[student_id]

    def _signatures(self, student_id: uuid.UUID) -> list[datetime]:
        """This child's signature date, as a list because `uq_health_declaration_student_id`
        allows exactly one row and a renewal REPLACES it rather than adding a second.

        That constraint is why `_health_renewal` compares dates rather than counting rows:
        there is never more than one to count."""
        if student_id not in self._signed:
            self._signed[student_id] = sorted(
                self._session.execute(
                    select(HealthDeclaration.signed_at).where(
                        HealthDeclaration.student_id == student_id
                    )
                )
                .scalars()
                .all(),
                reverse=True,
            )
        return self._signed[student_id]

    def _balance(self, person_id: uuid.UUID) -> int:
        """`charged - paid`, the same subtraction `/me/balance` renders.

        Read through `BillingService` rather than re-summing here: it already excludes
        voided and written-off charges, and a second copy of that rule would let a debt a
        manager decided not to pursue go on demanding payment from the inbox.
        """
        if person_id not in self._balances:
            from app.services.billing.service import BillingService

            charged, paid, _open = BillingService(self._session).payer_balance(person_id)
            self._balances[person_id] = charged - paid
        return self._balances[person_id]

    def _children_of(self, person_id: uuid.UUID) -> set[uuid.UUID]:
        if person_id not in self._my_students:
            self._my_students[person_id] = set(
                self._session.execute(
                    select(Guardian.student_id).where(Guardian.person_id == person_id)
                )
                .scalars()
                .all()
            )
        return self._my_students[person_id]

    # -- the five resolvers ----------------------------------------------------

    def _health_declaration(self, note: Notification) -> InboxAction | None:
        student_id = _uuid(note.payload, "student_id")
        if student_id is None:
            return None
        student = self._student(student_id)
        if student is None:
            return None
        signatures = self._signatures(student_id)
        return InboxAction(
            kind="health_declaration",
            # §5.5's own condition, and the same one `HealthGate` gates on. `trial_signed`
            # is still outstanding: the short form covers a trial, and the club is waiting
            # for the full one.
            outstanding=student.health_status != "signed",
            settled_at=signatures[0] if signatures else None,
            subject_name=self._name(student_id),
        )

    def _health_renewal(self, note: Notification) -> InboxAction | None:
        """A renewal cannot be settled by the signature it is chasing a replacement for.

        `health_status` stays `signed` for the whole life of a renewal notice, so the only
        honest question is whether a signature arrived AFTER the club asked.
        """
        student_id = _uuid(note.payload, "student_id")
        if student_id is None or self._student(student_id) is None:
            return None
        newer = [at for at in self._signatures(student_id) if at > note.created_at]
        return InboxAction(
            kind="health_renewal",
            outstanding=not newer,
            settled_at=newer[0] if newer else None,
            subject_name=self._name(student_id),
        )

    def _payment(self, note: Notification) -> InboxAction:
        """No child's name and no amount.

        A debt is the household's, not one child's — §5.11 sends one message per payer,
        never one per child. And §11.7 keeps money out of a notification payload, so the
        row has no amount to show and must not invent one; the number lives on the
        payments screen the button opens.
        """
        return InboxAction(kind="payment", outstanding=self._balance(note.person_id) > 0)

    def _event_rsvp(self, note: Notification) -> InboxAction | None:
        event_id = _uuid(note.payload, "event_id")
        if event_id is None:
            return None
        mine = self._children_of(note.person_id)
        if not mine:
            return None
        rows = list(
            self._session.execute(
                select(EventRegistration).where(
                    EventRegistration.event_id == event_id,
                    EventRegistration.student_id.in_(mine),
                )
            ).scalars()
        )
        if not rows:
            return None
        pending = [row for row in rows if row.rsvp == "pending"]
        answered = sorted(
            (row.responded_at for row in rows if row.responded_at is not None), reverse=True
        )
        # One sibling still unanswered keeps the whole notice waiting: the reminder went to
        # the guardian once for the household, and clearing it while a child is still
        # unanswered is how a family stops being asked.
        return InboxAction(
            kind="event_rsvp",
            outstanding=bool(pending),
            settled_at=None if pending else (answered[0] if answered else None),
            subject_name=self._name(rows[0].student_id) if len(rows) == 1 else None,
        )

    def _trial_join(self, note: Notification) -> InboxAction | None:
        booking_id = _uuid(note.payload, "trial_booking_id")
        if booking_id is None:
            return None
        booking = self._session.get(TrialBooking, booking_id)
        if booking is None:
            return None
        return InboxAction(
            kind="trial_join",
            # `pending` is nobody having decided yet. `converted` and `lost` are both
            # decisions, and neither leaves anything for the parent to press.
            outstanding=(booking.outcome or "pending") == "pending",
            subject_name=self._name(booking.student_id),
        )

    # -- the entry point -------------------------------------------------------

    def resolve(self, note: Notification) -> InboxAction | None:
        """`None` when this notice asks for nothing, which is most of them."""
        action = ACTION_BY_KIND.get(note.kind)
        if action is None:
            return None
        if action == "health_declaration":
            return self._health_declaration(note)
        if action == "health_renewal":
            return self._health_renewal(note)
        if action == "payment":
            return self._payment(note)
        if action == "event_rsvp":
            return self._event_rsvp(note)
        return self._trial_join(note)

    def resolve_many(self, rows: list[Notification]) -> list[InboxAction | None]:
        return [self.resolve(row) for row in rows]

    def outstanding_count(self, rows: list[Notification]) -> int:
        """What the queue counts, and what the tab badge counts alongside unread news."""
        return sum(
            1 for action in self.resolve_many(rows) if action is not None and action.outstanding
        )
