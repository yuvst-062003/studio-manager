"""§5.9's eligibility, computed from the two things §5.9 actually names.

`events.exam.eligibleHint` reads הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה -- the current
rank and the time held in it. Five artboards (`5d`, `5b`, `12d`, `4d`, `2d`) add a minimum
attendance percentage; `4d` and `6b` add a block on outstanding debt or a missing health
declaration.

**None of the three ships, and the reason is not squeamishness.** `belt_rank` carries no
`min_tenure_months` and no `min_attendance_pct` column, so a threshold has nowhere to live;
`6b`'s own audit says the decision "belongs in the W4 contract commit, not in whichever
lane builds first", and W4's contract commit did not make it. A debt gate would also put
M6's balance on a screen §3.2 lets a lead coach open, which is the hard rule, not a
preference.

**So this reports evidence and does not judge.** `eligible` means exactly *there is a rank
above the one this student holds*: a child at the top of the ladder, or one in a class with
no ladder configured, has nothing to be examined for. `months_at_rank` is `4d`'s ותק
column and `12d`'s "4 חודשים בחגורה", reported for a manager to read and act on -- which is
what `4d`'s checkbox column and promote button actually do anyway.

**A child with no belt is eligible for the first rung.** That is where every child starts,
and it is the common case at a club's first exam of the year.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank, StudentBelt
from app.models.events import EventRegistration
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.models.structure import Group
from app.services.belts.ranks import BeltRankService


@dataclass(frozen=True)
class Candidate:
    student_id: uuid.UUID
    student_display_name: str
    current_rank: BeltRank | None
    next_rank: BeltRank | None
    #: Whole months since the current rank was awarded. `None` when there is no current
    #: rank -- which is not zero: zero months reads as "awarded today", a different fact.
    months_at_rank: int | None
    #: There is a rank above the one held. Nothing else. See the module docstring.
    eligible: bool


def whole_months_between(earlier: date, later: date) -> int:
    """Calendar months, not days divided by thirty.

    A parent counting "four months at this rank" counts the way a calendar does, and
    thirty-day months drift by five days a year -- which is enough to move a child across
    a threshold a manager is reading off the screen.
    """
    months = (later.year - earlier.year) * 12 + (later.month - earlier.month)
    if later.day < earlier.day:
        months -= 1
    return max(months, 0)


class EligibilityService:
    @staticmethod
    def for_event(session: TenantSession, event_id: uuid.UUID, *, at: datetime) -> list[Candidate]:
        """Every registered student, with the evidence §5.9 names."""
        rows = list(
            session.execute(
                select(EventRegistration.student_id, Person.first_name, Person.last_name)
                .join(Student, Student.id == EventRegistration.student_id)
                .join(Person, Person.id == Student.person_id)
                .where(EventRegistration.event_id == event_id)
                .order_by(Person.last_name, Person.first_name)
            )
        )
        return [
            EligibilityService._candidate(session, student_id, f"{first} {last}".strip(), at=at)
            for student_id, first, last in rows
        ]

    @staticmethod
    def _candidate(
        session: TenantSession,
        student_id: uuid.UUID,
        display_name: str,
        *,
        at: datetime,
    ) -> Candidate:
        current = session.execute(
            select(StudentBelt, BeltRank)
            .join(BeltRank, BeltRank.id == StudentBelt.belt_rank_id)
            .where(StudentBelt.student_id == student_id)
            .order_by(BeltRank.order_index.desc())
            .limit(1)
        ).first()

        if current is None:
            first_rung = EligibilityService._first_rung(session, student_id)
            return Candidate(
                student_id=student_id,
                student_display_name=display_name,
                current_rank=None,
                next_rank=first_rung,
                months_at_rank=None,
                eligible=first_rung is not None,
            )

        award, rank = current
        next_rank = BeltRankService.next_after(session, rank.id)
        return Candidate(
            student_id=student_id,
            student_display_name=display_name,
            current_rank=rank,
            next_rank=next_rank,
            months_at_rank=whole_months_between(award.awarded_on, at.date()),
            eligible=next_rank is not None,
        )

    @staticmethod
    def _first_rung(session: TenantSession, student_id: uuid.UUID) -> BeltRank | None:
        """The bottom of the ladder of the class this student trains in.

        §4.3 puts `class_id` on `group`, so the edge from a student to a class is the
        enrolment. A child enrolled in two classes gets the ladder of the lowest class id
        -- a stable answer rather than a random one, and a real ambiguity: §5.9 gives a
        student one `current_belt_id` and says nothing about a child who grades in two
        disciplines. Reported rather than resolved by guess.
        """
        class_id = session.execute(
            select(Group.class_id)
            .join(Enrollment, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == student_id, Enrollment.status == "active")
            .order_by(Group.class_id)
            .limit(1)
        ).scalar_one_or_none()
        if class_id is None:
            return None
        return session.execute(
            select(BeltRank)
            .where(BeltRank.class_id == class_id)
            .order_by(BeltRank.order_index)
            .limit(1)
        ).scalar_one_or_none()
