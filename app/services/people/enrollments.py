"""§5.4's enrollment. A link table, and the two things it must never grow.

**C11 -- no price.** §5.10 creates one tuition charge per *student*, at
`student.price_plan_id`'s amount. Two enrollments are still one charge. A `price_plan_id`
on this row is what billed a child in the competition group and the teenagers group twice
a month, at two different prices, silently and forever. There is no column for it and this
module never asks for one.

**C11 -- no one-group rule.** A child in two groups is two rows, which the club confirmed
is normal. `uq_enrollment_live` is per (student, group) and not per student, and nothing
here narrows it.

**C12 -- `attends_weekdays`, validated against the schedule.** The days on offer come
through `ScheduleService.materialize_sessions()` (L5) and a pattern naming a day the group
does not train is refused. `attendance_pattern.expected_weekdays` already intersects
defensively at read time, but refusing at write time is what lets the manager see the
mistake while they are making it rather than discovering it in a roster three weeks later.

**L1 -- expectation is read, never re-derived.** `weekly_volume_for_student` here is a thin
call into the contract module. W3's roster and W4's billing run call the same three
functions, and a second implementation is a second answer.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.people import Enrollment, Student
from app.models.structure import Group
from app.services.audit import AuditService
from app.services.people.attendance_pattern import weekly_volume
from app.services.people.errors import ConflictError, NotFoundError, RefusedError
from app.services.people.group_days import ScheduleReader, training_weekdays


@dataclass(frozen=True)
class WeekdayOptions:
    group_id: uuid.UUID
    group_name: str
    training_weekdays: list[int]


class EnrollmentService:
    @staticmethod
    def _group(session: Session, group_id: uuid.UUID) -> Group:
        group = session.get(Group, group_id)
        if group is None:
            # 404 and never 403 -- the tenant filter makes another studio's group
            # invisible, and a 403 would confirm it exists.
            raise NotFoundError(str(group_id))
        return group

    @staticmethod
    def self_service_weekdays(
        session: Session, *, group_id: uuid.UUID, since: date, schedule: ScheduleReader
    ) -> frozenset[int]:
        """The days a group a PARENT may choose trains on -- or `NotFoundError`.

        **One rule on every self-service door.** §5.4b's join link, `+ הוסף ילד` and a trial
        family joining from their own app all reach a group by an id the client sent, and
        `LandingService.public_groups` filtering the picker is presentation rather than
        enforcement -- the Girls Team, the group that exists precisely so the product never
        has to store gender about a minor, was protected by its id not being published.
        Obscurity is not enforcement.

        A group with no training days is refused for the same reason and with the same
        answer: it has no weekly volume, so a child enrolled in it has no price.

        **Not found, never forbidden.** A 403 would confirm the group exists, which is the
        one fact `is_invite_only` is keeping.
        """
        group = session.get(Group, group_id)
        if group is None or not group.is_active or group.is_invite_only:
            raise NotFoundError(f"no group {group_id}")
        weekdays = training_weekdays(group_id, since=since, schedule=schedule)
        if not weekdays:
            raise NotFoundError(f"no group {group_id}")
        return weekdays

    @staticmethod
    def weekday_options(
        session: Session, *, group_id: uuid.UUID, since: date, schedule: ScheduleReader
    ) -> WeekdayOptions:
        """C12's checkboxes, for one group.

        An empty list is a real answer -- a group whose schedule has not been built yet --
        and the form says so rather than rendering nothing with no explanation.
        """
        group = EnrollmentService._group(session, group_id)
        return WeekdayOptions(
            group_id=group.id,
            group_name=group.name,
            training_weekdays=sorted(training_weekdays(group.id, since=since, schedule=schedule)),
        )

    @staticmethod
    def _validate_pattern(
        attends_weekdays: list[int] | None, scheduled: frozenset[int], group_name: str
    ) -> None:
        if attends_weekdays is None:
            return
        if not attends_weekdays:
            # The table's CHECK rejects this too. Refusing here first turns a 500 from an
            # IntegrityError into a 422 that names the field -- and an enrollment
            # expecting nothing is a student who left, not a student who enrolled.
            raise RefusedError("attends_weekdays must name at least one day, or be omitted")
        stray = sorted(set(attends_weekdays) - scheduled)
        if stray:
            raise RefusedError(
                f"{group_name} does not train on weekday(s) {stray}; "
                f"it trains on {sorted(scheduled)}"
            )

    @staticmethod
    def create(
        session: Session,
        *,
        student_id: uuid.UUID,
        group_id: uuid.UUID,
        started_on: date,
        attends_weekdays: list[int] | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        schedule: ScheduleReader,
        status: str = "active",
    ) -> Enrollment:
        """L6 -- every caller of this is a manager decision. There is no self-service path
        into this method, and §5.4a's public trial endpoint deliberately does not call it:
        a trial student is a real student who simply has no enrollment."""
        student = session.get(Student, student_id)
        if student is None:
            raise NotFoundError(str(student_id))
        group = EnrollmentService._group(session, group_id)

        scheduled = training_weekdays(group.id, since=started_on, schedule=schedule)
        EnrollmentService._validate_pattern(attends_weekdays, scheduled, group.name)

        live = session.execute(
            select(Enrollment).where(
                Enrollment.student_id == student_id,
                Enrollment.group_id == group_id,
                Enrollment.ended_on.is_(None),
            )
        ).scalar_one_or_none()
        if live is not None:
            raise ConflictError(f"already enrolled in {group.name}")

        row = Enrollment(
            student_id=student_id,
            group_id=group_id,
            status=status,
            started_on=started_on,
            attends_weekdays=attends_weekdays,
            created_at=at,
        )
        session.add(row)
        session.flush()
        AuditService.record(
            session,
            action="enrollment.created",
            entity_type="enrollment",
            entity_id=row.id,
            studio_id=student.studio_id,
            actor_person_id=actor_person_id,
            # C12's pattern is a manager decision like the group is, so it belongs in the
            # trail. There is no price to record -- C11 put that on the student.
            diff={
                "student_id": str(student_id),
                "group_id": str(group_id),
                "attends_weekdays": attends_weekdays,
            },
        )
        session.flush()
        return row

    @staticmethod
    def update(
        session: Session,
        *,
        enrollment_id: uuid.UUID,
        status: str | None,
        ended_on: date | None,
        attends_weekdays: list[int] | None,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        schedule: ScheduleReader,
    ) -> Enrollment:
        """Staff `9c`'s מעבר כיתה ends one enrollment; the dashboard edits a pattern."""
        row = session.get(Enrollment, enrollment_id)
        if row is None:
            raise NotFoundError(str(enrollment_id))
        if attends_weekdays is not None:
            group = EnrollmentService._group(session, row.group_id)
            scheduled = training_weekdays(group.id, since=row.started_on, schedule=schedule)
            EnrollmentService._validate_pattern(attends_weekdays, scheduled, group.name)
            row.attends_weekdays = attends_weekdays
        if status is not None:
            row.status = status
        if ended_on is not None:
            row.ended_on = ended_on
        AuditService.record(
            session,
            action="enrollment.updated",
            entity_type="enrollment",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            diff={
                "status": status,
                "ended_on": ended_on.isoformat() if ended_on else None,
                "attends_weekdays": attends_weekdays,
            },
        )
        session.flush()
        return row

    @staticmethod
    def move(
        session: Session,
        *,
        enrollment_id: uuid.UUID,
        group_id: uuid.UUID,
        moved_on: date,
        at: datetime,
        actor_person_id: uuid.UUID | None,
        schedule: ScheduleReader,
    ) -> Enrollment:
        """Staff 9c's מעבר כיתה, as ONE decision (feature pass 2026-08-27).

        A move is end-plus-create in a single transaction: the old enrollment ends on the
        move date, a new active one starts the same day in the target group. Not an
        UPDATE of group_id -- §5.14's reports read history from enrollments, and a row
        whose group silently changed would rewrite where the student trained all year.

        `attends_weekdays` deliberately does NOT carry over: it names days of the OLD
        group's schedule, and C12's pattern is a per-group decision the manager refines
        after the move.
        """
        row = session.get(Enrollment, enrollment_id)
        if row is None:
            raise NotFoundError(str(enrollment_id))
        if row.status == "ended":
            raise RefusedError("this enrollment already ended; enrol the student instead")
        if row.group_id == group_id:
            raise RefusedError("the student is already in this group")
        row.status = "ended"
        row.ended_on = moved_on
        created = EnrollmentService.create(
            session,
            student_id=row.student_id,
            group_id=group_id,
            started_on=moved_on,
            attends_weekdays=None,
            at=at,
            actor_person_id=actor_person_id,
            schedule=schedule,
        )
        AuditService.record(
            session,
            action="enrollment.moved",
            entity_type="enrollment",
            entity_id=row.id,
            studio_id=row.studio_id,
            actor_person_id=actor_person_id,
            diff={"from_group": str(row.group_id), "to_group": str(group_id)},
        )
        session.flush()
        return created

    @staticmethod
    def list_for_student(
        session: Session, *, student_id: uuid.UUID, include_ended: bool = False
    ) -> list[tuple[Enrollment, Group]]:
        stmt = (
            select(Enrollment, Group)
            .join(Group, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == student_id)
        )
        if not include_ended:
            stmt = stmt.where(Enrollment.ended_on.is_(None))
        # `.all()` yields Row objects; unpack them so callers get real tuples and the
        # annotation is the truth rather than a cast.
        return [
            (enrollment, group) for enrollment, group in session.execute(stmt.order_by(Group.name))
        ]

    @staticmethod
    def weekly_volume_for_student(
        session: Session, *, student_id: uuid.UUID, since: date, schedule: ScheduleReader
    ) -> int:
        """C11's number, read through the contract module (L1).

        §5.10 shows it beside the plan picker so a mismatch between what a child attends
        and what they are billed for is visible at the moment the price is set. It is a
        **suggestion, not a computation** -- the manager picks the plan, because the club's
        own numbers are approximate ("about 300", "about 500").

        Note what this does NOT return: an amount. `price_plan` is W4's table, and
        invariant 3 forbids a coach-reachable endpoint returning a financial field.
        """
        patterns = [
            (
                enrollment.attends_weekdays,
                training_weekdays(group.id, since=since, schedule=schedule),
            )
            for enrollment, group in EnrollmentService.list_for_student(
                session, student_id=student_id
            )
        ]
        return weekly_volume(patterns)
