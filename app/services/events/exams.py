"""§5.9 step 3, and the one place three tables move together.

"A pass writes an `event_exam_result`, creates a `student_belt` row, and updates
`student.current_belt_id` — in one transaction."

**The batch is the transaction, not the row.** `9d`'s frame 2 saves a whole roster at once,
and a per-row commit would leave the first child promoted and the coach staring at a 409 on
the fourth. Nothing here commits: the router commits once, after `record` returns, so
anything raised inside leaves the session un-committed and the request handler rolls it
back.

**A fail is recorded.** §5.9's eligibility view has to distinguish "examined and did not
pass" from "never examined" -- they are different conversations with a parent -- so a fail
writes its result row and promotes nothing.

**Nothing here notifies.** §5.9 step 4 gives guardians a notification and
`NotificationService` is M8's, which does not exist until W5. `9d`'s footer caption claims
parents are told; `events.exam.passPromotesHint` is the string that ships and it says
nothing about notifying, which the artboard audit had already noticed.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank
from app.models.events import EventExamResult, EventRegistration
from app.schemas.belts import StudentBeltIn
from app.schemas.events import EventExamResultIn
from app.services.belts.awards import BeltAwardService
from app.services.events.errors import (
    AlreadyExaminedError,
    NotABeltExamError,
    NotRegisteredForEventError,
)
from app.services.events.events import EventService


class ExamService:
    @staticmethod
    def results_for(
        session: TenantSession, event_id: uuid.UUID
    ) -> list[tuple[EventExamResult, BeltRank]]:
        return [
            (result, rank)
            for result, rank in session.execute(
                select(EventExamResult, BeltRank)
                .join(BeltRank, BeltRank.id == EventExamResult.belt_rank_id)
                .where(EventExamResult.event_id == event_id)
                .order_by(EventExamResult.id)
            )
        ]

    @staticmethod
    def record(
        session: TenantSession,
        event_id: uuid.UUID,
        results: list[EventExamResultIn],
        *,
        examiner_person_id: uuid.UUID | None,
        at: datetime,
    ) -> list[tuple[EventExamResult, BeltRank]]:
        event = EventService.read(session, event_id)
        if event.type != "belt_exam":
            raise NotABeltExamError(event.type)

        registered = set(
            session.execute(
                select(EventRegistration.student_id).where(EventRegistration.event_id == event_id)
            ).scalars()
        )
        # Read once and extended as we go, so a batch naming the same child twice is caught
        # here rather than by `uq_event_exam_result` halfway through.
        already = set(
            session.execute(
                select(EventExamResult.student_id).where(EventExamResult.event_id == event_id)
            ).scalars()
        )

        out: list[tuple[EventExamResult, BeltRank]] = []
        for entry in results:
            if entry.student_id not in registered:
                raise NotRegisteredForEventError(str(entry.student_id))
            if entry.student_id in already:
                raise AlreadyExaminedError(str(entry.student_id))
            already.add(entry.student_id)

            rank = session.get(BeltRank, entry.belt_rank_id)
            if rank is None:
                raise NotRegisteredForEventError(str(entry.belt_rank_id))

            row = EventExamResult(
                event_id=event_id,
                student_id=entry.student_id,
                belt_rank_id=entry.belt_rank_id,
                result=entry.result,
                examiner_person_id=examiner_person_id,
                note=entry.note,
            )
            session.add(row)
            session.flush()

            if entry.result == "pass":
                # The second and third writes of §5.9 step 3, in this same unit of work.
                # `event_id` ties the award to the exam that produced it, which is what
                # `12d`'s "previous exams" list reads -- and it is why that list is not the
                # same list as the rank history (`belt.awardOutsideExam` proves they differ).
                BeltAwardService.award(
                    session,
                    entry.student_id,
                    StudentBeltIn(
                        belt_rank_id=entry.belt_rank_id,
                        awarded_on=at.date(),
                        event_id=event_id,
                        note=entry.note,
                    ),
                    by_person_id=examiner_person_id,
                    at=at,
                )
            out.append((row, rank))
        return out
