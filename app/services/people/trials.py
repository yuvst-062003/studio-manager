"""§5.4a's trial funnel.

**The only self-service write in the product**, and the one place where every guarantee
`TenantSession` normally provides has to be established by hand. §6.1 states the exception
in as many words: "Parent-app access needs no provisioning at all, because booking a trial
creates the guardian row itself. That is the only self-service entry point in the system,
and it grants nothing beyond visibility of the children it just created."

**The studio comes from the group, not from the token.** The caller has just signed in and
belongs to nowhere; their access token carries no `sid`. The group id came from that
studio's own public group list, so it is the tenant the parent already chose. The router
resolves it on a plain `Session`, then opens a `TenantSession` scoped to it -- so every row
written here is stamped and guarded exactly as it would be on any other route.

**No enrollment is created, ever.** L6 and §5.4a: "a trial person is a real student who
simply has NO enrollment, which is what makes everything else work automatically." The
billing run walks active enrollments and generates nothing for them; they are excluded from
active-student counts; and attendance, rosters, notes and health declarations all work with
zero special-casing.

**The trial declaration lands in `registration_request.payload_encrypted`.** C3 seams health
across W2/W3: M1 seeded the `kind='trial'` template so this lane is not blocked, and
`health_declaration` is M4's table. The encrypted registration payload is the only column in
this wave built to hold a minor's answers (§11.1), so that is where they wait. The row is
written `approved` with `reviewed_at` set and `reviewed_by_person_id` NULL -- a trial needs
no approval (§5.4a), so it must not appear in the manager's pending queue, and no human
reviewed it. `student.health_status` becomes `trial_signed`, which §5.4a says is explicitly
**not** sufficient for enrollment.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.people import RegistrationRequest, Student, TrialBooking
from app.models.person import Guardian, Person
from app.models.schedule import Session as SessionRow
from app.models.structure import Group
from app.services.audit import AuditService
from app.services.people.errors import ConflictError, NotFoundError
from app.services.people.matching import match_person
from app.services.people.status import StudentStatusService


@dataclass
class BookedChild:
    """What §5.4a step 5 confirms, for ONE child.

    Siblings can be in different groups at different hours, so `group` and `session_row`
    hang off each child rather than off the booking. A single pair at the request level is
    exactly the shape that silently booked every sibling into the eldest's group.
    """

    student: Student
    booking: TrialBooking
    group: Group
    session_row: SessionRow | None


@dataclass
class BookedTrial:
    booked: list[BookedChild]
    guardian_person_id: uuid.UUID
    #: The studio every group in the request resolved to. All of them, or the booking was
    #: refused -- see `_group_in_studio`.
    studio_id: uuid.UUID

    @property
    def students(self) -> list[Student]:
        return [row.student for row in self.booked]

    @property
    def bookings(self) -> list[TrialBooking]:
        return [row.booking for row in self.booked]


class TrialService:
    @staticmethod
    def has_used_a_free_trial(session: Session, *, guardian_person_id: uuid.UUID) -> bool:
        """§5.4a -- 'One free lesson per student, full stop.'

        Asked of the GUARDIAN rather than of the child, because a child booking a second
        trial arrives as a brand-new Person with the same name -- there is nothing to match
        on yet. The parent is the stable identity, and `is_override` exists for the honest
        case where the same family genuinely needs a second look.

        A booking a manager already granted an override for does not count against them
        again: the override is the decision, and re-charging it would make one tap into a
        permanent block.
        """
        return (
            session.execute(
                select(TrialBooking.id)
                .join(Guardian, Guardian.student_id == TrialBooking.student_id)
                .where(
                    Guardian.person_id == guardian_person_id,
                    TrialBooking.is_override.is_(False),
                )
                .limit(1)
            ).first()
            is not None
        )

    @staticmethod
    def _resolve_parent(
        session: Session,
        *,
        identity_id: uuid.UUID | None,
        provider_email: str | None,
        provider_email_verified: bool,
        first_name: str,
        last_name: str,
        phone: str | None,
        at: datetime,
    ) -> Person:
        """The parent's Person **in this studio**, matched or created.

        L7 -- matched on the address the provider verified, never on a string the client
        supplied. A brand-new family is the common case and gets a fresh Person attached to
        the identity that just signed in, which is what makes their children appear in the
        parent app the moment this returns (§5.4a).

        **`identity_id` is None for a booking made without an account** (2026-08-31, owner's
        decision: a first lesson is booked the way every other club books one -- a form).
        The Person is then created with no identity, holding the address the parent TYPED.
        It is a lead and nothing more: an identity-less Person grants no app access, because
        access is `EXISTS(guardian WHERE person_id = :me)` resolved from the signed-in
        identity. §6.1 step 3 attaches them later -- 'verified email hit -> attach to the
        matched Person' -- so signing in afterwards with that same address finds the
        children already there, which is the whole point of collecting it.
        """
        if identity_id is not None:
            existing = (
                session.execute(
                    select(Person).where(
                        Person.auth_identity_id == identity_id, Person.anonymized_at.is_(None)
                    )
                )
                .scalars()
                .first()
            )
            if existing is not None:
                return existing

        # An anonymous booking matches NOTHING and always creates a fresh lead. Two reasons,
        # and the second is why there is no clever version of this:
        #
        # * A typed address is unverified. Matching it onto an existing Person would let
        #   anyone reach a stranger's family by typing their email, which is exactly the
        #   join below refusing to happen -- `match_person` keys on `AuthIdentity.email`,
        #   an address a provider vouched for, never on a string a client sent.
        # * `Person.email` is encrypted at rest (§11.1), so there is no `WHERE email = ?`
        #   to look one up by anyway. Deduplicating typed addresses would need a
        #   deterministic hash column and a migration to carry it.
        #
        # So the same parent booking twice makes two leads. That is the manager's queue
        # doing its job, and the price of not asking a stranger to open a Google account.

        if provider_email and provider_email_verified:
            matched = match_person(session, email=provider_email)
            if matched is not None:
                person = session.get(Person, matched.person_id)
                if person is not None:
                    return person

        person = Person(
            auth_identity_id=identity_id,
            first_name=first_name.strip() or "הורה",
            last_name=last_name.strip() or "",
            email=provider_email,
            phone=phone,
            created_at=at,
        )
        session.add(person)
        session.flush()
        return person

    @staticmethod
    def book_for_self(
        session: Session,
        *,
        identity_id: uuid.UUID | None,
        studio_id: uuid.UUID,
        children: list[dict[str, Any]],
        declarations: list[dict[str, Any]],
        provider_email: str | None,
        provider_email_verified: bool,
        parent_first_name: str = "הורה",
        parent_last_name: str = "",
        parent_phone: str | None = None,
        at: datetime,
        allow_override: bool = False,
    ) -> BookedTrial:
        """§5.4a steps 1-5, as one transaction. Does not commit -- the router does.

        Order matters: the parent first (everything hangs off them), then per child a
        Person -> Student(trial) -> Guardian(is_primary) -> TrialBooking -> status history,
        then one encrypted RegistrationRequest holding every child's trial declaration.
        """
        # Every child's group and session are resolved BEFORE anything is written, so a
        # request naming one bad group creates no half-booked family.
        choices = [
            TrialService._resolve_choice(
                session,
                studio_id=studio_id,
                group_id=child.get("group_id"),
                session_id=child.get("session_id"),
            )
            for child in children
        ]

        parent = TrialService._resolve_parent(
            session,
            identity_id=identity_id,
            provider_email=provider_email,
            provider_email_verified=provider_email_verified,
            first_name=parent_first_name,
            last_name=parent_last_name,
            phone=parent_phone,
            at=at,
        )

        if not allow_override and TrialService.has_used_a_free_trial(
            session, guardian_person_id=parent.id
        ):
            raise ConflictError(
                "this family has already used a free trial lesson; a manager can grant another"
            )

        booked: list[BookedChild] = []
        for child, (group, session_row) in zip(children, choices, strict=True):
            child_person = Person(
                first_name=str(child["first_name"]).strip(),
                last_name=str(child["last_name"]).strip(),
                birthdate=child.get("birthdate"),
                created_at=at,
            )
            session.add(child_person)
            session.flush()

            student = Student(
                person_id=child_person.id,
                status="lead",
                source="public_link",
                # §5.4a -- the SHORT trial form is signed at booking, and `trial_signed`
                # records that it is not the full one. Converting requires the full form.
                health_status="trial_signed" if declarations else "missing",
                created_at=at,
            )
            session.add(student)
            session.flush()
            StudentStatusService.transition(
                session,
                student=student,
                to_status="trial",
                at=at,
                reason="booked through the public link",
            )

            session.add(
                Guardian(
                    student_id=student.id,
                    person_id=parent.id,
                    is_primary=True,
                    relation="parent",
                    created_at=at,
                )
            )
            booking = TrialBooking(
                student_id=student.id,
                session_id=session_row.id if session_row else None,
                group_id=group.id,
                booked_at=at,
                # Three states, not two. NULL is "the lesson has not happened yet", which
                # the follow-up ladder treats completely differently from "did not turn up".
                attended=None,
                outcome="pending",
                is_override=allow_override,
            )
            session.add(booking)
            session.flush()
            booked.append(
                BookedChild(student=student, booking=booking, group=group, session_row=session_row)
            )

        students = [row.student for row in booked]
        bookings = [row.booking for row in booked]
        if declarations:
            TrialService._store_trial_declarations(
                session,
                parent=parent,
                students=students,
                children=children,
                declarations=declarations,
                at=at,
            )

        AuditService.record(
            session,
            action="trial.booked",
            entity_type="trial_booking",
            entity_id=bookings[0].id,
            studio_id=bookings[0].studio_id,
            actor_person_id=parent.id,
            # Counts and ids. No child name, no birthdate, and above all no health answer
            # -- §11.2 and G7: `audit_log` is append-only, so anything written here is
            # beyond anonymization's reach (§11.4).
            diff={
                # One entry per child. A single group_id here was accurate only while the
                # booking had one group, and would now hide exactly the thing that went
                # wrong if a sibling landed in the wrong place.
                "group_ids": [str(row.group.id) for row in booked],
                "session_ids": [
                    str(row.session_row.id) if row.session_row else None for row in booked
                ],
                "children": len(booked),
                "is_override": allow_override,
            },
        )
        session.flush()
        return BookedTrial(booked=booked, guardian_person_id=parent.id, studio_id=studio_id)

    @staticmethod
    def _resolve_choice(
        session: Session,
        *,
        studio_id: uuid.UUID,
        group_id: uuid.UUID | None,
        session_id: uuid.UUID | None,
    ) -> tuple[Group, SessionRow | None]:
        """One child's group and session, checked against each other and the studio.

        The studio check is not redundant with the tenant scope. The route resolves the
        studio from the FIRST group and scopes everything to it, so without this a second
        child could name a group in someone else's club and ride in on that resolution.
        Group and session are checked against each other for the same reason one level
        down: a session id from a different group would book the child into a lesson their
        group never holds.
        """
        if group_id is None:  # pragma: no cover - the schema rejects this first
            raise NotFoundError("group")
        group = session.get(Group, group_id)
        if group is None or group.studio_id != studio_id:
            raise NotFoundError(str(group_id))
        if session_id is None:
            return group, None
        session_row = session.get(SessionRow, session_id)
        if session_row is None or session_row.group_id != group.id:
            raise NotFoundError(str(session_id))
        return group, session_row

    @staticmethod
    def _store_trial_declarations(
        session: Session,
        *,
        parent: Person,
        students: list[Student],
        children: list[dict[str, Any]],
        declarations: list[dict[str, Any]],
        at: datetime,
    ) -> RegistrationRequest:
        """C3's holding pen for §5.4a step 3's answers.

        `health_declaration` is M4's table and does not exist in this wave, and
        `registration_request.payload_encrypted` is the only column W2 has that is built to
        hold a minor's data at rest (§11.1, AES-256-GCM envelope). So the trial answers wait
        here until W3 migrates them.

        Written `approved` with `reviewed_at` set and no reviewer, deliberately: §5.4a needs
        no approval for a trial -- the parent lands straight in the app -- so this row must
        never appear in the manager's pending queue, and claiming a human reviewed it would
        be a lie in an audit-relevant column.
        """
        row = RegistrationRequest(
            source="public_link",
            payload_encrypted={
                "guardian": {"person_id": str(parent.id)},
                "children": [
                    {
                        "student_id": str(student.id),
                        "first_name": child["first_name"],
                        "last_name": child["last_name"],
                        "trial_declaration": declaration,
                    }
                    for student, child, declaration in zip(
                        students, children, declarations, strict=False
                    )
                ],
            },
            matched_person_id=parent.id,
            status="approved",
            submitted_at=at,
            reviewed_at=at,
            reviewed_by_person_id=None,
            created_at=at,
        )
        session.add(row)
        session.flush()
        return row

    @staticmethod
    def grant_override(
        session: Session,
        *,
        booking_id: uuid.UUID,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> TrialBooking:
        """§5.4a -- 'A second free trial requires a manager to grant an override in one tap,
        so a child torn between judo and karate isn't lost to a rule nobody meant to be that
        strict -- but nobody trains free forever by rebooking.'

        A column rather than a convention because it has to be countable: §5.14's funnel
        report can show how often the rule is being bent, which is the only way anyone would
        notice it being bent too often.
        """
        booking = session.get(TrialBooking, booking_id)
        if booking is None:
            raise NotFoundError(str(booking_id))
        booking.is_override = True
        AuditService.record(
            session,
            action="trial.override.granted",
            entity_type="trial_booking",
            entity_id=booking.id,
            studio_id=booking.studio_id,
            actor_person_id=actor_person_id,
            diff={"student_id": str(booking.student_id)},
        )
        session.flush()
        return booking

    @staticmethod
    def record_outcome(
        session: Session,
        *,
        booking_id: uuid.UUID,
        attended: bool | None,
        coach_note: str | None,
        outcome: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> TrialBooking:
        """§5.4a ③ -- the coach marks attendance and may leave a note.

        `attended` keeps three states across the wire: the caller omits the field to leave
        it alone, sends `null` for "not yet", and `false` for "did not turn up". The ladder
        in `app/workers/followups.py` treats the last two completely differently.
        """
        booking = session.get(TrialBooking, booking_id)
        if booking is None:
            raise NotFoundError(str(booking_id))
        if attended is not None:
            booking.attended = attended
        if coach_note is not None:
            booking.coach_note = coach_note
        if outcome is not None:
            booking.outcome = outcome
        AuditService.record(
            session,
            action="trial.outcome.recorded",
            entity_type="trial_booking",
            entity_id=booking.id,
            studio_id=booking.studio_id,
            actor_person_id=actor_person_id,
            # The note is a coach's written opinion about a child (§5.13) and stays out of
            # the append-only trail; that it was written is enough.
            diff={"attended": attended, "outcome": outcome, "note_written": coach_note is not None},
        )
        session.flush()
        return booking

    @staticmethod
    def list_bookings(
        session: Session,
        *,
        outcome: str | None = None,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[tuple[TrialBooking, Student, Person, Group]], uuid.UUID | None]:
        """§5.4a ② -- 'Manager sees a שיעורי ניסיון queue on the dashboard.'"""
        stmt = (
            select(TrialBooking, Student, Person, Group)
            .join(Student, TrialBooking.student_id == Student.id)
            .join(Person, Student.person_id == Person.id)
            .join(Group, TrialBooking.group_id == Group.id)
        )
        if outcome:
            stmt = stmt.where(TrialBooking.outcome == outcome)
        if after is not None:
            stmt = stmt.where(TrialBooking.id > after)
        rows = [
            (booking, student, person, group)
            for booking, student, person, group in session.execute(
                stmt.order_by(TrialBooking.id).limit(limit + 1)
            )
        ]
        has_more = len(rows) > limit
        rows = rows[:limit]
        return rows, (rows[-1][0].id if has_more and rows else None)

    @staticmethod
    def bookings_for_guardian(
        session: Session, *, person_id: uuid.UUID
    ) -> list[tuple[TrialBooking, Group, SessionRow | None]]:
        """§6.3's reduced home needs a lesson to count down to. This is where it comes from.

        **No new column.** `trial_booking.session_id` has pointed at a real `session` since
        §5.4a's booking flow landed, and `session.starts_at` is the lesson -- what did not
        exist was a read a guardian could make. `_self_result` already returns the same
        instant, once, in the 201 that creates the booking; a parent who closes the tab has
        had no way back to it, and their token has no studio in it at that moment anyway.

        **A LEFT join.** `session_id` is nullable and stays nullable: §5.4a lets a manager
        log a phone enquiry before any slot is chosen. An inner join would make that family
        vanish from their own trial home rather than showing them the fallback copy written
        for exactly their case.

        Ordered soonest-first with the unscheduled last, because that is the order the one
        caller reads in: `TrialHome` shows the NEXT lesson, and a family whose second child
        is booked a week later must not see the later date first.
        """
        return [
            (booking, group, session_row)
            for booking, group, session_row in session.execute(
                select(TrialBooking, Group, SessionRow)
                .join(Group, TrialBooking.group_id == Group.id)
                .outerjoin(SessionRow, SessionRow.id == TrialBooking.session_id)
                .where(
                    TrialBooking.student_id.in_(
                        select(Guardian.student_id).where(Guardian.person_id == person_id)
                    )
                )
                .order_by(SessionRow.starts_at.asc().nulls_last(), TrialBooking.booked_at)
            )
        ]
