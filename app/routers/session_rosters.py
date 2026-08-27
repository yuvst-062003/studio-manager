"""`GET /sessions/{id}/bookings` — who has marked tonight's extra session.

**Its own module because it is the one coach-reachable route in this feature.**
`app/main.py` mounts exactly one `router` per module in `app/routers/`, and
`.claude/rules/api.md` is explicit that a router serving coaches is tagged `coach` — "an
untagged coach router is an unguarded one", because §13's third invariant is enforced
against the tag. `app/routers/training_plans.py` cannot carry the tag: its plan shapes
return `monthly_amount_agorot`, which is precisely what that invariant forbids here.

So the split is not tidiness. It is the one shape in this feature a coach may see: names,
a count, and no money at all.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.core.auth_context import AnyStaff
from app.core.tenancy import TenantSessionDep
from app.models.people import Student
from app.models.person import Person
from app.models.training_plan import SessionBooking
from app.schemas.training_plan import SessionRosterEntryOut, SessionRosterOut

router = APIRouter(tags=["coach"])


@router.get("/sessions/{session_id}/bookings", response_model=SessionRosterOut)
def session_bookings(
    _: AnyStaff, session_id: uuid.UUID, session: TenantSessionDep
) -> SessionRosterOut:
    """Who has marked, with a live count.

    An `extra` session's roster IS its live bookings (§8): a student who marked and did not
    come is absent and enters §5.14's denominators like any other expected student, and a
    student who never marked is not on the roster and enters no denominator -- which is
    correct, because nobody asked them to be there.
    """
    rows = list(
        session.execute(
            select(SessionBooking, Person)
            .join(Student, Student.id == SessionBooking.student_id)
            .join(Person, Person.id == Student.person_id)
            .where(
                SessionBooking.session_id == session_id,
                SessionBooking.cancelled_at.is_(None),
            )
            .order_by(Person.first_name)
        ).all()
    )
    return SessionRosterOut(
        session_id=session_id,
        marked_count=len(rows),
        items=[
            SessionRosterEntryOut(
                booking_id=booking.id,
                student_id=booking.student_id,
                student_name=f"{person.first_name} {person.last_name}",
            )
            for booking, person in rows
        ],
    )
