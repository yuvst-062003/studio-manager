"""F12 -- bulk student actions OUTSIDE the once-a-year rollover wizard.

Reuses the rollover's bulk shape -- `BulkOutcome`, per-row machine-readable refusals,
the end-plus-start move that never rewrites `group_id` in place -- but NOT its date
boundary: the rollover anchors both verbs to the new year's start, which is correct in
September and wrong in February. A mid-season move ends yesterday and starts today, so
"which group was this child in on date D" keeps exactly one answer.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.people import Enrollment
from app.models.structure import Group
from app.services.audit import AuditService
from app.services.schedule.rollover import BulkOutcome

STUDIO_TZ = ZoneInfo("Asia/Jerusalem")


def _boundaries(enrollment: Enrollment, at: datetime) -> tuple[date, date]:
    today = at.astimezone(STUDIO_TZ).date()
    # An enrollment that started today ends today -- `ended_on >= started_on` holds and
    # the record still says the child was briefly there.
    ends_on = max(enrollment.started_on, today - timedelta(days=1))
    return ends_on, today


def bulk_students(
    session: Session,
    *,
    moves: list[tuple[uuid.UUID, uuid.UUID]],
    not_returning: list[uuid.UUID],
    at: datetime,
    actor_person_id: uuid.UUID | None,
    studio_id: uuid.UUID,
    student_moves: list[tuple[uuid.UUID, uuid.UUID]] | None = None,
) -> BulkOutcome:
    outcome = BulkOutcome()

    # The students screen knows student ids, not enrollment ids. A student with exactly
    # one live enrollment moves it; zero or several refuse BY ROW — C11 makes several
    # live enrollments normal, and a bulk gesture must not guess which one was meant.
    for student_id, group_id in student_moves or []:
        live = list(
            session.execute(
                select(Enrollment).where(
                    Enrollment.student_id == student_id, Enrollment.ended_on.is_(None)
                )
            ).scalars()
        )
        if len(live) == 0:
            outcome.refuse(student_id, "no_enrollment")
            continue
        if len(live) > 1:
            outcome.refuse(student_id, "multiple_enrollments")
            continue
        moves = [*moves, (live[0].id, group_id)]

    for enrollment_id in not_returning:
        enrollment = session.get(Enrollment, enrollment_id)
        if enrollment is None:
            outcome.refuse(enrollment_id, "not_found")
            continue
        if enrollment.ended_on is not None:
            continue
        ends_on, _ = _boundaries(enrollment, at)
        enrollment.ended_on = ends_on
        enrollment.status = "ended"
        AuditService.record(
            session,
            action="enrollment.ended",
            entity_type="enrollment",
            entity_id=enrollment.id,
            studio_id=studio_id,
            actor_person_id=actor_person_id,
            diff={"ended_on": str(ends_on), "reason": "bulk_not_returning"},
        )
        outcome.applied += 1

    for enrollment_id, destination_group_id in moves:
        enrollment = session.get(Enrollment, enrollment_id)
        if enrollment is None:
            outcome.refuse(enrollment_id, "not_found")
            continue
        if enrollment.ended_on is not None:
            outcome.refuse(enrollment_id, "already_ended")
            continue
        if enrollment.group_id == destination_group_id:
            continue
        destination = session.get(Group, destination_group_id)
        if destination is None:
            outcome.refuse(enrollment_id, "destination_not_found")
            continue
        if not destination.is_active:
            outcome.refuse(enrollment_id, "destination_retired")
            continue
        already_there = session.execute(
            select(Enrollment.id).where(
                Enrollment.student_id == enrollment.student_id,
                Enrollment.group_id == destination_group_id,
                Enrollment.ended_on.is_(None),
            )
        ).first()
        if already_there is not None:
            # uq_enrollment_live would refuse anyway — refusing HERE keeps the batch's
            # per-row answer instead of a 500 on row N.
            outcome.refuse(enrollment_id, "already_in_destination")
            continue

        ends_on, starts_on = _boundaries(enrollment, at)
        enrollment.ended_on = ends_on
        enrollment.status = "ended"
        session.add(
            Enrollment(
                studio_id=studio_id,
                student_id=enrollment.student_id,
                group_id=destination_group_id,
                status="active",
                started_on=starts_on,
            )
        )
        AuditService.record(
            session,
            action="enrollment.moved",
            entity_type="enrollment",
            entity_id=enrollment.id,
            studio_id=studio_id,
            actor_person_id=actor_person_id,
            diff={"to_group_id": str(destination_group_id), "effective": str(starts_on)},
        )
        outcome.applied += 1

    session.flush()
    return outcome
