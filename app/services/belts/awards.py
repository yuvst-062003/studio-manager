"""§5.9's award. The history row and the cache, written together.

§5.9 step 3: "A pass writes an `event_exam_result`, creates a `student_belt` row, and
updates `student.current_belt_id` — in one transaction." `award` is the second and third of
those three, and `app/services/events/exams.py` calls it inside the same unit of work,
which is what makes that sentence true rather than aspirational.

**The cache moves to the highest rank held, not to the most recently awarded one.**
Back-filling a grade a studio forgot to record is ordinary data entry, and a cache that
followed write order would demote the child on the day somebody tidied the records.

**`color_hex` on a read is the rank's colour today.** `student_belt` has no colour column,
so a studio recolouring its ladder does rewrite what a child was given three years ago --
`tests/belts/test_awarding_a_belt.py` pins that as the current behaviour rather than
leaving it to be discovered. Closing it needs `student_belt.color_hex`, which is a
migration and therefore `main`'s.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank, StudentBelt
from app.models.people import Student
from app.schemas.belts import StudentBeltIn
from app.services.belts.errors import BeltAlreadyAwardedError, BeltRankNotFoundError


class BeltAwardService:
    @staticmethod
    def history(
        session: TenantSession, student_id: uuid.UUID
    ) -> list[tuple[StudentBelt, BeltRank]]:
        """Oldest first -- `12d` is a timeline, and a progression reads forward."""
        return [
            (award, rank)
            for award, rank in session.execute(
                select(StudentBelt, BeltRank)
                .join(BeltRank, BeltRank.id == StudentBelt.belt_rank_id)
                .where(StudentBelt.student_id == student_id)
                .order_by(StudentBelt.awarded_on, BeltRank.order_index)
            )
        ]

    @staticmethod
    def current(session: TenantSession, student_id: uuid.UUID) -> BeltRank | None:
        student = session.get(Student, student_id)
        if student is None or student.current_belt_id is None:
            return None
        return session.get(BeltRank, student.current_belt_id)

    @staticmethod
    def award(
        session: TenantSession,
        student_id: uuid.UUID,
        data: StudentBeltIn,
        *,
        by_person_id: uuid.UUID | None,
        at: datetime,
    ) -> tuple[StudentBelt, BeltRank]:
        rank = session.get(BeltRank, data.belt_rank_id)
        if rank is None:
            raise BeltRankNotFoundError(str(data.belt_rank_id))

        already = session.execute(
            select(StudentBelt.id).where(
                StudentBelt.student_id == student_id,
                StudentBelt.belt_rank_id == data.belt_rank_id,
            )
        ).first()
        if already is not None:
            raise BeltAlreadyAwardedError(str(data.belt_rank_id))

        row = StudentBelt(
            student_id=student_id,
            belt_rank_id=data.belt_rank_id,
            awarded_on=data.awarded_on,
            awarded_by_person_id=by_person_id,
            event_id=data.event_id,
            note=data.note,
        )
        session.add(row)
        # Flushed before the cache is re-derived, so `_refresh_cache` sees the new row and
        # there is exactly one place that decides what "current" means.
        session.flush()
        BeltAwardService._refresh_cache(session, student_id)
        session.flush()
        return row, rank

    @staticmethod
    def _refresh_cache(session: TenantSession, student_id: uuid.UUID) -> None:
        """The highest rank held, by `order_index` within its ladder.

        Derived from the rows rather than assigned from the award, so a correction that
        deletes a grade fixes the cache too rather than leaving it pointing at a rank the
        child no longer holds.
        """
        student = session.get(Student, student_id)
        if student is None:
            return
        student.current_belt_id = session.execute(
            select(BeltRank.id)
            .join(StudentBelt, StudentBelt.belt_rank_id == BeltRank.id)
            .where(StudentBelt.student_id == student_id)
            .order_by(BeltRank.order_index.desc())
            .limit(1)
        ).scalar_one_or_none()
