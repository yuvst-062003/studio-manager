"""§5.1 — which plans to offer a student, from one rule.

    Offer a plan only if it raises the number of sessions this student could attend in a
    week.

Formally, for student *s* and plan *p*:

    reachable(s, p) = 2 (base)
                    + min(p.allowance, count of extras s is eligible for)
                    + 1 if p has an unlimited allowance and s can reach a private session

and *p* is offered when `reachable(s, p)` is greater than `reachable(s, next-cheaper plan)`.

**Nothing about the club's three tiers is hardcoded here**, and that is the point: the
§5 table — Group 1 offered only 300, a Group 2 boy offered 300 and 400, a Group 2 girl
offered all three — falls out of this function and the eligibility rows, and recomputes
itself the moment the manager opens CrossFit to another group. That is what makes §5's
conclusion ("this is a gap in the timetable, not a fault in the pricing") something a
manager can act on rather than a paragraph in a document.

A plan this returns is offered; a plan it omits is **greyed with its reason, never
hidden** — that half is the screen's, because a Group 1 parent who hears "400" from another
parent in the hall and finds nothing in the app phones the manager.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import PricePlan
from app.models.people import Student
from app.models.person import Person
from app.models.structure import Group
from app.services.schedule.booking import BookingService, whole_years

#: Tuesday and Friday. Every student has exactly one of each, decided entirely by which
#: numbered group the coach put them in — the base is never a choice, which is why it is a
#: constant here and not a query.
#:
#: It is a constant rather than a count of the student's own base sessions because the
#: rule is comparative: it appears on both sides of every `>` below and cancels. A club
#: whose base is three days a week gets the same offers from the same eligibility rows.
BASE_SESSIONS_PER_WEEK = 2


def reachable_sessions(
    bookings: BookingService,
    *,
    student_id: uuid.UUID,
    plan: PricePlan,
    extras: int,
    private: bool,
) -> int:
    """How many sessions a week this student could attend on this plan.

    `extras` and `private` are passed in rather than queried per plan: they depend on the
    student and the timetable, never on the plan, so computing them once per student is
    both faster and the only way the comparison below is guaranteed to be consistent.
    """
    allowance = plan.weekly_extra_allowance
    if allowance is None:
        return BASE_SESSIONS_PER_WEEK + extras + (1 if private else 0)
    return BASE_SESSIONS_PER_WEEK + min(allowance, extras)


def offered_plans(
    bookings: BookingService,
    *,
    student_id: uuid.UUID,
    plans: list[PricePlan],
) -> list[PricePlan]:
    """The plans worth offering this student, cheapest first.

    Ordered by price because "next-cheaper" is what the rule compares against, and an
    unordered input would make "does this raise the week" a question about whichever plan
    happened to come first.
    """
    session = bookings._session  # noqa: SLF001 -- one service reading another's session
    ordered = sorted(plans, key=lambda plan: plan.monthly_amount_agorot)
    extras, private = _reach(bookings, session, student_id)

    offered: list[PricePlan] = []
    best = 0
    for plan in ordered:
        count = reachable_sessions(
            bookings, student_id=student_id, plan=plan, extras=extras, private=private
        )
        # The cheapest plan is always offered: it is the floor, and "raises the week" has
        # nothing below it to be compared against.
        if not offered or count > best:
            offered.append(plan)
            best = max(best, count)
    return offered


def _reach(bookings: BookingService, session: Session, student_id: uuid.UUID) -> tuple[int, bool]:
    """(how many extra groups this student is eligible for, can they reach a private one).

    Counts GROUPS rather than sessions: "one extra session per week" is a choice among the
    things a student may attend, and a group that runs twice a week is still one thing they
    are eligible for. The club's extras each run once a week, so the two agree today; the
    group count is the one that keeps agreeing when they do not.
    """
    student = session.get(Student, student_id)
    if student is None:
        return (0, False)
    person = session.get(Person, student.person_id)
    groups = list(
        session.execute(select(Group).where(Group.kind.in_(("extra", "private")))).scalars()
    )
    extras = 0
    private = False
    for group in groups:
        if not bookings.is_eligible(student_id, group):
            continue
        if group.kind == "private":
            # The age half of §4's rule. A ten-year-old cannot reach the Saturday lesson,
            # so 550 buys them nothing the offer rule should pretend it does.
            if _old_enough(person, group):
                private = True
        else:
            extras += 1
    return (extras, private)


def _old_enough(person: Person | None, group: Group) -> bool:
    """`group.age_min`, against the person's birthdate. A student with no birthdate passes,
    the same way `BookingService` lets them mark: the club knows children it has no
    birthday for, and the offer list is not the place to enforce data quality."""
    if group.age_min is None:
        return True
    if person is None or person.birthdate is None:
        return True
    # `date.today()` is deliberately absent — this is a comparison against the student's
    # age NOW, and `whole_years` demands its reference date rather than reading a clock.
    from app.core.clock import now

    return whole_years(person.birthdate, on=now().date()) >= group.age_min
