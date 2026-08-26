"""Publishing an event, which is the moment it becomes real to the club.

§5.8: "An event targets any mix of studio, classes, groups or individual students via
`event_target`. Every targeted student gets an `event_registration` row with
`rsvp = pending`." That sentence is this module.

**Targets compose, and the union is de-duplicated in Python before the INSERT.**
`uq_event_registration` would catch a child reached by both a class and a group, but as an
IntegrityError that aborts the whole publish -- and "both beginner groups plus three
seniors" is the normal case, not the edge one.

**Publishing is refused rather than repeated.** A second publish would re-materialise the
roster over answers already given, and an RSVP a parent has to give twice is an RSVP the
office cannot trust.

**Cancelling does not unmake the roster.** §5.8 notifies on a cancellation and the office
phones whoever answered; deleting the registrations would delete the list the call is made
from. `status='cancelled'` is the whole of it.

**Nothing here sends anything.** Four artboards (`9i`, `9d`, `7a`, `6b`) draw "published,
invitations not yet sent" as a state distinct from publishing. There is no `invited_at`
column to hold it and `NotificationService` is M8's, which does not exist until W5, so the
state is reported as a gap rather than faked with a second boolean.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.events import Event, EventRegistration, EventTarget
from app.models.people import Enrollment, Student
from app.models.structure import Group
from app.services.events.errors import EventNotEditableError
from app.services.events.events import EventService

#: Who a GROUP, CLASS or STUDIO target sweeps in. §5.4's `frozen` and `left` are real
#: statuses, and inviting a child who left three months ago is how a studio loses a family
#: twice. A student named individually is exempt -- see `resolve_targets`.
SWEEPABLE_STATUSES = ("active", "trial")


class EventPublishService:
    @staticmethod
    def resolve_targets(session: TenantSession, event_id: uuid.UUID) -> list[uuid.UUID]:
        """The union of every target row: de-duplicated, and order-stable.

        `studio` is everyone. `class` reaches every student enrolled in a group of that
        class -- §4.3 puts `class_id` on `group` and not on `student`, so the enrolment is
        the only edge between the two.

        **A student named directly is not status-filtered.** §5.9 step 1 nominates exam
        candidates by naming them, and a manager naming a child means that child. The
        filter is about who a *sweep* brings in, not about who a manager picked out.
        """
        targets = list(
            session.execute(select(EventTarget).where(EventTarget.event_id == event_id)).scalars()
        )
        if not targets:
            return []

        by_type: dict[str, list[uuid.UUID]] = {"class": [], "group": [], "student": []}
        whole_studio = False
        for row in targets:
            if row.target_type == "studio":
                whole_studio = True
            elif row.target_id is not None:
                by_type[row.target_type].append(row.target_id)

        found: list[uuid.UUID] = []
        seen: set[uuid.UUID] = set()

        def add(student_ids: Iterable[uuid.UUID]) -> None:
            for student_id in student_ids:
                if student_id not in seen:
                    seen.add(student_id)
                    found.append(student_id)

        if whole_studio:
            add(
                session.execute(
                    select(Student.id)
                    .where(Student.status.in_(SWEEPABLE_STATUSES))
                    .order_by(Student.id)
                ).scalars()
            )
        if by_type["class"]:
            add(
                session.execute(
                    select(Student.id)
                    .join(Enrollment, Enrollment.student_id == Student.id)
                    .join(Group, Group.id == Enrollment.group_id)
                    .where(
                        Group.class_id.in_(by_type["class"]),
                        Enrollment.status == "active",
                        Student.status.in_(SWEEPABLE_STATUSES),
                    )
                    .order_by(Student.id)
                ).scalars()
            )
        if by_type["group"]:
            add(
                session.execute(
                    select(Student.id)
                    .join(Enrollment, Enrollment.student_id == Student.id)
                    .where(
                        Enrollment.group_id.in_(by_type["group"]),
                        Enrollment.status == "active",
                        Student.status.in_(SWEEPABLE_STATUSES),
                    )
                    .order_by(Student.id)
                ).scalars()
            )
        if by_type["student"]:
            add(
                session.execute(
                    select(Student.id)
                    .where(Student.id.in_(by_type["student"]))
                    .order_by(Student.id)
                ).scalars()
            )
        return found

    @staticmethod
    def publish(session: TenantSession, event_id: uuid.UUID, *, at: datetime) -> tuple[Event, int]:
        """Draft to published, materialising the roster. Returns the event and how many
        registrations it created -- a publish that said nothing about what it reached looks
        identical to one that reached nobody, which is a real and confusing state."""
        event = EventService.read(session, event_id)
        if event.status != "draft":
            raise EventNotEditableError(event.status)

        # A draft cannot normally hold registrations, but reading the existing set rather
        # than assuming none keeps this correct if one ever arrives another way -- and it
        # costs one indexed query against a roster nobody has answered yet.
        already = set(
            session.execute(
                select(EventRegistration.student_id).where(EventRegistration.event_id == event_id)
            ).scalars()
        )
        created = 0
        for student_id in EventPublishService.resolve_targets(session, event_id):
            if student_id in already:
                continue
            session.add(
                EventRegistration(
                    event_id=event_id, student_id=student_id, rsvp="pending", attended=False
                )
            )
            created += 1
        event.status = "published"
        session.flush()
        return event, created

    @staticmethod
    def cancel(session: TenantSession, event_id: uuid.UUID, *, at: datetime) -> Event:
        """The roster survives, deliberately. See the module docstring."""
        event = EventService.read(session, event_id)
        if event.status != "published":
            raise EventNotEditableError(event.status)
        event.status = "cancelled"
        session.flush()
        return event
