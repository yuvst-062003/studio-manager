"""§5.3 and §5.4's students and guardians.

**A student is a person.** `student.person_id` is UNIQUE (§4.3), so every name, birthdate,
phone and email on this page belongs to `person` and is read through a join. A second copy
on `student` would let an adult student -- who is their own guardian (§5.3) -- carry two
names that disagree.

**There is no household.** L9: "my children" is `SELECT student_id FROM guardian WHERE
person_id = me`, which `for_guardian` is, verbatim. Nothing here groups students by family,
because the product has no good answer to which household a child belongs to after a
separation and inventing one would force it to.

**§3.2's viewer split lives in `viewer_group_ids`.** `None` means "every student in the
studio" (owner, manager) and a list means "students enrolled in these groups" (coach). The
empty list is a third case and is load-bearing: a coach with no groups sees nobody, and an
implementation that treated `[]` as falsy would hand them the whole club.

**Every method here expects a `TenantSession`.** The tenant filter is what makes "every
student in the studio" mean one studio; on a plain `Session` these queries are unscoped.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.models.people import (
    Enrollment,
    Student,
    StudentFreeze,
    StudentStatusHistory,
    TrialBooking,
)
from app.models.person import Guardian, Invitation, Person
from app.models.structure import Group, GroupStaff
from app.services.audit import AuditService
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader
from app.services.people.matching import match_person
from app.services.people.status import StudentStatusService

#: §5.3's invitation. Thirty days matches the refresh-token window and is long enough that
#: a parent who is away for a fortnight is not locked out of their own children.
INVITATION_TTL_DAYS = 30


@dataclass
class CreatedStudent:
    student: Student
    #: Returned once, to the manager who just created the student. `None` when the
    #: guardian was matched to an existing login -- §5.4a: "No second invitation, no
    #: second account, no second login."
    invitation_token: str | None


@dataclass
class StudentRow:
    """One row of the list, already joined.

    A dataclass rather than a tuple because dashboard `3b` renders eight columns, and
    positional unpacking at that width is a bug waiting for its first reorder.
    """

    id: uuid.UUID
    person_id: uuid.UUID
    first_name: str
    last_name: str
    birthdate: date | None
    status: str
    health_status: str
    joined_on: date | None
    left_on: date | None
    current_belt_id: uuid.UUID | None
    group_names: list[str]
    frozen_until: date | None
    guardian_display_names: list[str]


class StudentService:
    # -- creation --------------------------------------------------------------
    @staticmethod
    def create(
        session: Session,
        *,
        first_name: str,
        last_name: str,
        birthdate: date | None,
        guardian_first_name: str,
        guardian_last_name: str,
        guardian_email: str | None,
        guardian_phone: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        relation: str = "parent",
        status: str = "lead",
        source: str | None = "manager",
    ) -> CreatedStudent:
        """§5.4(a) -- the manager-added student, created immediately.

        `health_status` stays `missing`: §5.4 is explicit that "the manager never types a
        health form", and the parent completes it through the app gate (§5.5).

        The guardian is matched before being created (L7). A match means an existing
        Person with a verified address, so no invitation is issued -- they already have a
        login and the child simply appears in the app they are already using.
        """
        child = Person(
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            birthdate=birthdate,
            created_at=at,
        )
        session.add(child)
        session.flush()

        student = Student(
            person_id=child.id,
            status=status,
            source=source,
            health_status="missing",
            created_at=at,
        )
        session.add(student)
        session.flush()

        matched = match_person(session, email=guardian_email, phone=guardian_phone)
        token: str | None = None
        if matched is not None:
            guardian_person_id = matched.person_id
        else:
            parent = Person(
                first_name=guardian_first_name.strip(),
                last_name=guardian_last_name.strip(),
                email=guardian_email,
                phone=guardian_phone,
                created_at=at,
            )
            session.add(parent)
            session.flush()
            guardian_person_id = parent.id
            token = StudentService._issue_invitation(
                session,
                student_id=student.id,
                email=guardian_email,
                phone=guardian_phone,
                at=at,
                actor_person_id=actor_person_id,
            )

        session.add(
            Guardian(
                student_id=student.id,
                person_id=guardian_person_id,
                # §5.3 -- exactly one guardian per student carries it, and the first one
                # created is that one. A partial unique index enforces the rest.
                is_primary=True,
                relation=relation,
                created_at=at,
            )
        )
        AuditService.record(
            session,
            action="student.created",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            # Ids and the source. No name and no birthdate: §11.2 keeps a diff to what
            # changed, and a child's name in an append-only table is a name that
            # anonymization (§11.4) can never reach.
            diff={"source": source, "status": status, "guardian_matched": matched is not None},
        )
        session.flush()
        return CreatedStudent(student=student, invitation_token=token)

    @staticmethod
    def _issue_invitation(
        session: Session,
        *,
        student_id: uuid.UUID,
        email: str | None,
        phone: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> str:
        """§5.3 -- 'the invitation carries a token binding the accepting auth identity to
        the pre-created Person.'

        The plaintext is returned to the caller and never stored: only the SHA-256 hash
        reaches `invitation.token_hash`, which is what M1's `accept-invitation` compares
        against. `secrets.token_urlsafe(32)` is 256 bits -- an invitation is a bearer
        credential for a child's record, so it is sized like one.
        """
        token = secrets.token_urlsafe(32)
        invitation = Invitation(
            email=email,
            phone=phone,
            intended_role="guardian",
            student_id=student_id,
            token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            expires_at=at + timedelta(days=INVITATION_TTL_DAYS),
            created_at=at,
        )
        session.add(invitation)
        session.flush()
        AuditService.record(
            session,
            action="guardian.invited",
            entity_type="invitation",
            entity_id=invitation.id,
            studio_id=invitation.studio_id,
            actor_person_id=actor_person_id,
            # The recipient, never the token. An audit row holding a live credential
            # would be a credential store with an append-only grant on it.
            diff={"email": email, "phone": phone, "intended_role": "guardian"},
        )
        return token

    # -- reads -----------------------------------------------------------------
    @staticmethod
    def _base_query(viewer_group_ids: list[uuid.UUID] | None) -> Select[tuple[Student, Person]]:
        stmt = select(Student, Person).join(Person, Student.person_id == Person.id)
        if viewer_group_ids is None:
            return stmt
        # §3.2 -- 'View students in own groups'. `[]` is a real answer and must produce an
        # empty result: `if viewer_group_ids:` here would hand a coach with no groups the
        # entire club, and it would look like the feature working.
        return stmt.where(
            Student.id.in_(
                select(Enrollment.student_id).where(Enrollment.group_id.in_(viewer_group_ids))
            )
        )

    @staticmethod
    def list_students(
        session: Session,
        *,
        viewer_group_ids: list[uuid.UUID] | None,
        status: str | None = None,
        group_id: uuid.UUID | None = None,
        health_status: str | None = None,
        q: str | None = None,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[StudentRow], uuid.UUID | None]:
        """Dashboard `3b` and staff `9h`. Cursor-paginated on `student.id` (G16).

        Ordered by id and not by name: a keyset cursor names a position, and a name is not
        unique in a club with two children called נועה כהן.
        """
        stmt = StudentService._base_query(viewer_group_ids)
        if status:
            stmt = stmt.where(Student.status == status)
        if health_status:
            stmt = stmt.where(Student.health_status == health_status)
        if group_id:
            stmt = stmt.where(
                Student.id.in_(
                    select(Enrollment.student_id).where(
                        Enrollment.group_id == group_id, Enrollment.ended_on.is_(None)
                    )
                )
            )
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(or_(Person.first_name.ilike(like), Person.last_name.ilike(like)))
        if after is not None:
            stmt = stmt.where(Student.id > after)

        pairs = session.execute(stmt.order_by(Student.id).limit(limit + 1)).all()
        has_more = len(pairs) > limit
        pairs = pairs[:limit]
        rows = [StudentService._project(session, student, person) for student, person in pairs]
        next_cursor = rows[-1].id if has_more and rows else None
        return rows, next_cursor

    @staticmethod
    def _project(session: Session, student: Student, person: Person) -> StudentRow:
        group_names = list(
            session.execute(
                select(Group.name)
                .join(Enrollment, Enrollment.group_id == Group.id)
                .where(Enrollment.student_id == student.id, Enrollment.ended_on.is_(None))
                .order_by(Group.name)
            ).scalars()
        )
        guardians = list(
            session.execute(
                select(Person.first_name, Person.last_name)
                .join(Guardian, Guardian.person_id == Person.id)
                .where(Guardian.student_id == student.id)
                .order_by(Guardian.is_primary.desc(), Person.first_name)
            ).all()
        )
        frozen_until: date | None = None
        if student.status == "frozen":
            frozen_until = session.execute(
                select(StudentFreeze.to_date)
                .where(StudentFreeze.student_id == student.id)
                .order_by(StudentFreeze.from_date.desc())
                .limit(1)
            ).scalar_one_or_none()
        return StudentRow(
            id=student.id,
            person_id=person.id,
            first_name=person.first_name,
            last_name=person.last_name,
            birthdate=person.birthdate,
            status=student.status,
            health_status=student.health_status,
            joined_on=student.joined_on,
            left_on=student.left_on,
            current_belt_id=student.current_belt_id,
            group_names=group_names,
            frozen_until=frozen_until,
            guardian_display_names=[f"{first} {last}" for first, last in guardians],
        )

    @staticmethod
    def get(
        session: Session,
        *,
        student_id: uuid.UUID,
        viewer_group_ids: list[uuid.UUID] | None = None,
    ) -> tuple[Student, Person]:
        """404 and never 403 for a student outside the caller's reach. A 403 confirms the
        row exists, which is a cross-tenant read with a polite error message."""
        row = session.execute(
            StudentService._base_query(viewer_group_ids).where(Student.id == student_id)
        ).first()
        if row is None:
            raise NotFoundError(str(student_id))
        return row[0], row[1]

    @staticmethod
    def detail(
        session: Session,
        *,
        student_id: uuid.UUID,
        viewer_group_ids: list[uuid.UUID] | None = None,
    ) -> StudentRow:
        """The projected form of `get`, for the routes that render a card."""
        student, person = StudentService.get(
            session, student_id=student_id, viewer_group_ids=viewer_group_ids
        )
        return StudentService._project(session, student, person)

    @staticmethod
    def for_guardian(session: Session, *, person_id: uuid.UUID) -> list[StudentRow]:
        """L9, verbatim: `SELECT student_id FROM guardian WHERE person_id = me`.

        L8 -- no `is_primary` branch anywhere in here. Every guardian on a student sees
        the same list, because §5.3 says they see the same things.
        """
        pairs = session.execute(
            select(Student, Person)
            .join(Person, Student.person_id == Person.id)
            .join(Guardian, Guardian.student_id == Student.id)
            .where(Guardian.person_id == person_id)
            .order_by(Person.first_name)
        ).all()
        return [StudentService._project(session, student, person) for student, person in pairs]

    @staticmethod
    def viewer_group_ids(
        session: Session, *, person_id: uuid.UUID, roles: set[str]
    ) -> list[uuid.UUID] | None:
        """§3.2's split, resolved once per request.

        `None` for owner and manager -- 'View all students in studio'. A list for a coach,
        from `group_staff`, which is the table that says which mat they stand on.
        """
        if roles & {"owner", "manager"}:
            return None
        return list(
            session.execute(
                select(GroupStaff.group_id).where(
                    GroupStaff.person_id == person_id, GroupStaff.to_date.is_(None)
                )
            ).scalars()
        )

    @staticmethod
    def status_history(session: Session, *, student_id: uuid.UUID) -> list[StudentStatusHistory]:
        """§7 -- `GET /students/{id}/status-history`.

        Dashboard `4a` renders it as a timeline, and §5.4a computes the funnel report from
        the same rows -- which is why there is no `deleted_at` on that table and nothing
        here filters one out.
        """
        return list(
            session.execute(
                select(StudentStatusHistory)
                .where(StudentStatusHistory.student_id == student_id)
                .order_by(StudentStatusHistory.changed_at, StudentStatusHistory.created_at)
            ).scalars()
        )

    # -- writes ----------------------------------------------------------------
    @staticmethod
    def list_guardians(session: Session, *, student_id: uuid.UUID) -> list[tuple[Guardian, Person]]:
        """L8 -- ordered primary-first because that is the order `2c` and `4a` render them
        in, not because the primary is privileged. Nothing downstream branches."""
        StudentService.get(session, student_id=student_id)
        return [
            (guardian, person)
            for guardian, person in session.execute(
                select(Guardian, Person)
                .join(Person, Guardian.person_id == Person.id)
                .where(Guardian.student_id == student_id)
                .order_by(Guardian.is_primary.desc(), Person.first_name)
            )
        ]

    @staticmethod
    def add_guardian(
        session: Session,
        *,
        student_id: uuid.UUID,
        first_name: str,
        last_name: str,
        email: str | None,
        phone: str | None,
        relation: str,
        is_primary: bool,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Guardian:
        """§5.3 -- 'Guardians are invited by email or phone.'

        L7 first: a verified match is linked, never recreated. §5.4a is emphatic that a
        matched parent is never duplicated, and duplicating one here would produce two
        accounts holding the same child and two bills addressed to the same person.
        """
        student, _person = StudentService.get(session, student_id=student_id)
        matched = match_person(session, email=email, phone=phone)
        if matched is not None:
            person_id = matched.person_id
        else:
            person = Person(
                first_name=first_name.strip(),
                last_name=last_name.strip(),
                email=email,
                phone=phone,
                created_at=at,
            )
            session.add(person)
            session.flush()
            person_id = person.id

        already = session.execute(
            select(Guardian).where(
                Guardian.student_id == student.id, Guardian.person_id == person_id
            )
        ).scalar_one_or_none()
        if already is not None:
            raise ConflictError("this person is already a guardian of this student")

        if matched is None:
            StudentService._issue_invitation(
                session,
                student_id=student.id,
                email=email,
                phone=phone,
                at=at,
                actor_person_id=actor_person_id,
            )

        row = Guardian(
            student_id=student.id,
            person_id=person_id,
            is_primary=False,
            relation=relation,
            created_at=at,
        )
        session.add(row)
        session.flush()
        if is_primary:
            StudentService.set_primary_guardian(
                session,
                student_id=student.id,
                person_id=person_id,
                at=at,
                actor_person_id=actor_person_id,
            )
        AuditService.record(
            session,
            action="guardian.linked",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            diff={
                "person_id": str(person_id),
                "relation": relation,
                "matched": matched is not None,
            },
        )
        session.flush()
        return row

    @staticmethod
    def set_primary_guardian(
        session: Session,
        *,
        student_id: uuid.UUID,
        person_id: uuid.UUID,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Guardian:
        """§5.3 -- exactly one primary. L8 -- and it means exactly two things.

        The old primary is cleared and the new one set **before the flush**, because
        `uq_guardian_one_primary_per_student` is a partial unique index: two primaries
        existing even momentarily inside one flush is an IntegrityError.
        """
        rows = list(
            session.execute(select(Guardian).where(Guardian.student_id == student_id)).scalars()
        )
        target = next((r for r in rows if r.person_id == person_id), None)
        if target is None:
            raise NotFoundError(f"{person_id} is not a guardian of {student_id}")
        # Two statements, two flushes, and the order is load-bearing. The index is partial
        # on `is_primary`, so it is checked per UPDATE: momentarily having ZERO primaries is
        # legal, having two never is. Assigning both in one flush lets SQLAlchemy batch them
        # in whichever order it likes -- and it picks the one that violates the index.
        for row in rows:
            if row.person_id != person_id:
                row.is_primary = False
        session.flush()
        target.is_primary = True
        session.flush()
        AuditService.record(
            session,
            action="guardian.primary.set",
            entity_type="student",
            entity_id=student_id,
            actor_person_id=actor_person_id,
            # §5.3's two consequences, named so an audit reader knows what changed and what
            # did not: no permission moved, because there is none attached to this flag.
            diff={"person_id": str(person_id), "affects": ["bill_addressing", "standing_order"]},
        )
        session.flush()
        return target

    @staticmethod
    def remove_guardian(
        session: Session,
        *,
        student_id: uuid.UUID,
        person_id: uuid.UUID,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> None:
        """The last guardian cannot be removed, and removing the primary promotes another.

        Neither rule is expressible in the schema -- `UNIQUE(student_id, person_id)` says
        nothing about a minimum, and the partial index says nothing about what happens when
        the primary row disappears. A student with no primary is a bill addressed to nobody
        (§5.10); a student with no guardian is a child nobody can be contacted about (§5.3).
        """
        student, _person = StudentService.get(session, student_id=student_id)
        rows = list(
            session.execute(select(Guardian).where(Guardian.student_id == student.id)).scalars()
        )
        target = next((r for r in rows if r.person_id == person_id), None)
        if target is None:
            raise NotFoundError(f"{person_id} is not a guardian of {student_id}")
        if len(rows) == 1:
            raise RefusedError("a student must keep at least one guardian")

        was_primary = target.is_primary
        successor = next(r for r in rows if r.person_id != person_id)
        # Same partial-index dance as `set_primary_guardian`: vacate first, flush, then
        # promote. Doing both in one flush lets the batch order decide whether the index
        # sees two primaries at once.
        target.is_primary = False
        session.flush()
        if was_primary:
            successor.is_primary = True
            session.flush()
        session.delete(target)
        AuditService.record(
            session,
            action="guardian.unlinked",
            entity_type="student",
            entity_id=student.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            diff={"person_id": str(person_id), "was_primary": was_primary},
        )
        session.flush()

    @staticmethod
    def freeze(
        session: Session,
        *,
        student_id: uuid.UUID,
        from_date: date,
        to_date: date | None,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> StudentFreeze:
        """§5.4's freeze. A **date range**, not a boolean.

        §5.10 step 4's billing run reads `student_freeze` rather than `student.status`,
        because it asks about a *period*: a student frozen for March and back in April is
        `frozen` today and still owes April. That is why the row is the artefact and the
        status is the consequence.

        The enrollments are deliberately left alone -- §5.4: "the enrollment and the spot
        are retained". Ending them would give away the one thing the parent was promised
        would be kept.
        """
        student, _person = StudentService.get(session, student_id=student_id)
        row = StudentFreeze(
            student_id=student.id,
            from_date=from_date,
            to_date=to_date,
            reason=reason,
            created_by_person_id=actor_person_id,
            created_at=at,
        )
        session.add(row)
        StudentStatusService.transition(
            session,
            student=student,
            to_status="frozen",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        session.flush()
        return row

    @staticmethod
    def expire_freezes(session: Session, *, on: date, at: datetime) -> list[Student]:
        """Every student whose freeze has run out, reactivated.

        §7 offers no unfreeze endpoint and §5.4 gives the freeze a return date, so the date
        is what ends it. Without this a student stays `frozen` forever: the roster never
        shows them again and the guardian is still reading "מוקפא" in April. Called daily
        by `app/workers/followups.py`.

        An open-ended freeze (`to_date IS NULL`) is never expired here. §5.4's army case has
        no return date, and inventing one would put a child back on a roster they are not at.
        """
        frozen = list(session.execute(select(Student).where(Student.status == "frozen")).scalars())
        reactivated: list[Student] = []
        for student in frozen:
            latest = session.execute(
                select(StudentFreeze)
                .where(StudentFreeze.student_id == student.id)
                .order_by(StudentFreeze.from_date.desc())
                .limit(1)
            ).scalar_one_or_none()
            if latest is None or latest.to_date is None or latest.to_date >= on:
                continue
            StudentStatusService.transition(
                session, student=student, to_status="active", at=at, reason="freeze ended"
            )
            reactivated.append(student)
        session.flush()
        return reactivated

    @staticmethod
    def leave(
        session: Session,
        *,
        student_id: uuid.UUID,
        left_on: date,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Student:
        """§5.4's leaving, and parent `12i`'s promise kept in the negative.

        **Nothing here touches money.** §5.4: "ending an enrollment mid-month does not void
        that month's charge and produces no refund", and `12i` states it to the parent's
        face. A manager who wants to write a charge off does it in the billing screen,
        deliberately, where it is audit-logged as a write-off.

        Every live enrollment ends, not one. C11 makes several normal, and a student who
        left while still enrolled in the second group would keep appearing on that roster.
        """
        student, _person = StudentService.get(session, student_id=student_id)
        live = list(
            session.execute(
                select(Enrollment).where(
                    Enrollment.student_id == student.id, Enrollment.ended_on.is_(None)
                )
            ).scalars()
        )
        for enrollment in live:
            enrollment.ended_on = left_on
            enrollment.status = "ended"
        student.left_on = left_on
        StudentStatusService.transition(
            session,
            student=student,
            to_status="left",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        session.flush()
        return student

    @staticmethod
    def convert(
        session: Session,
        *,
        student_id: uuid.UUID,
        group_id: uuid.UUID,
        started_on: date,
        price_plan_id: uuid.UUID | None,
        attends_weekdays: list[int] | None,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        schedule: ScheduleReader,
    ) -> Student:
        """§5.4a step 5 -- 'Manager converts → picks group, sets price, status=active,
        enrollment created.'

        **C11 puts the price on the student**, here, in one place, however many groups they
        end up in. `EnrollmentService.create` writes no price because `enrollment` has no
        column for one, and that absence is the fix for a child in two groups being billed
        twice a month at two different prices.

        **`health_status` is not promoted.** §5.4a: "The trial declaration is not sufficient
        for enrollment... converting requires the full form." Moving it to `signed` here
        would switch off the app's health gate for exactly the students who have signed
        nothing.

        The transition runs first: an illegal move must refuse before an enrollment is
        written, or a refused conversion leaves the student in a group they were never
        put in.
        """
        from app.services.people.enrollments import EnrollmentService

        student, _person = StudentService.get(session, student_id=student_id)
        StudentStatusService.transition(
            session,
            student=student,
            to_status="active",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        student.joined_on = student.joined_on or started_on
        student.price_plan_id = price_plan_id

        EnrollmentService.create(
            session,
            student_id=student.id,
            group_id=group_id,
            started_on=started_on,
            attends_weekdays=attends_weekdays,
            at=at,
            actor_person_id=actor_person_id,
            schedule=schedule,
            status="active",
        )
        StudentService._close_open_trials(session, student_id=student.id, outcome="converted")
        session.flush()
        return student

    @staticmethod
    def mark_lost(
        session: Session,
        *,
        student_id: uuid.UUID,
        reason: str | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
    ) -> Student:
        """§5.4a -- 'No conversion after N days → status=lost, with a reason.'

        `lost` is a real outcome and not an absence of one, which is what makes the funnel
        report's denominator honest.
        """
        student, _person = StudentService.get(session, student_id=student_id)
        StudentStatusService.transition(
            session,
            student=student,
            to_status="lost",
            at=at,
            actor_person_id=actor_person_id,
            reason=reason,
        )
        StudentService._close_open_trials(session, student_id=student.id, outcome="lost")
        session.flush()
        return student

    @staticmethod
    def _close_open_trials(session: Session, *, student_id: uuid.UUID, outcome: str) -> None:
        """§5.4a -- a trial booking left `pending` after the decision was made shows in the
        funnel as a trial nobody ever decided about."""
        for booking in session.execute(
            select(TrialBooking).where(
                TrialBooking.student_id == student_id, TrialBooking.outcome == "pending"
            )
        ).scalars():
            booking.outcome = outcome

    @staticmethod
    def update(
        session: Session,
        *,
        student_id: uuid.UUID,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        first_name: str | None = None,
        last_name: str | None = None,
        birthdate: date | None = None,
        phone: str | None = None,
        email: str | None = None,
    ) -> tuple[Student, Person]:
        """Writes to `person`, because that is where the fields live (§4.3)."""
        student, person = StudentService.get(session, student_id=student_id)
        changed: list[str] = []
        for field, value in (
            ("first_name", first_name),
            ("last_name", last_name),
            ("birthdate", birthdate),
            ("phone", phone),
            ("email", email),
        ):
            if value is not None and getattr(person, field) != value:
                setattr(person, field, value)
                changed.append(field)
        if changed:
            AuditService.record(
                session,
                action="student.updated",
                entity_type="student",
                entity_id=student.id,
                studio_id=student.studio_id,
                actor_person_id=actor_person_id,
                # The FIELD NAMES that changed, never the values (§11.2, §11.4).
                diff={"fields": sorted(changed)},
            )
        session.flush()
        return student, person
