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
from app.models.person import Guardian, Person
from app.schemas.belts import StudentBeltIn
from app.services.belts.errors import BeltAlreadyAwardedError, BeltRankNotFoundError
from app.services.comms import NotificationService


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
        # SPEC §5.9 step 4 -- "the guardians receive a notification." Not committed here:
        # both callers (this router and `app/services/events/exams.py`'s pass path) commit
        # once after `award` returns, so the belt row and the notifications land as one
        # transaction the same way the history row and the cache do.
        BeltAwardService._notify_guardians(session, student_id, rank)
        return row, rank

    @staticmethod
    def _notify_guardians(session: TenantSession, student_id: uuid.UUID, rank: BeltRank) -> None:
        """The producer §2.2 of the 2026-09-02 findings register found missing: `belt`
        (`app/services/comms/kinds.py`'s `"belt": "belt"` prefix map) was one of three
        preference switches governing nothing, because nothing ever called `enqueue` with
        a `belt.*` kind.

        Every guardian, not only the primary — the same §5.3 rule
        `app/workers/billing.py::_guardians_of` and `app/workers/followups.py::_guardians_of`
        already state for their own fan-outs.
        """
        student = session.get(Student, student_id)
        child_name = ""
        if student is not None:
            person = session.get(Person, student.person_id)
            if person is not None:
                child_name = f"{person.first_name} {person.last_name}".strip()
        guardian_ids = session.execute(
            select(Guardian.person_id).where(Guardian.student_id == student_id)
        ).scalars()
        notifier = NotificationService(session)
        body = (
            f"{child_name} קיבל/ה חגורה {rank.name}" if child_name else f"חגורה חדשה: {rank.name}"
        )
        for guardian_person_id in guardian_ids:
            notifier.enqueue(
                person_id=guardian_person_id,
                kind="belt.awarded",
                title="חגורה חדשה!",
                body=body,
                payload={"student_id": str(student_id), "belt_rank_id": str(rank.id)},
            )

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
