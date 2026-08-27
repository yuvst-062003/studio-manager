"""C11 and C12: what a student is expected at, and how much training that adds up to.

**One decision, read twice.** The club sets, per student, which of a group's weekly
sessions they come to. That single input answers two different questions:

* **C12 -- reporting.** §5.7's four attendance states cannot say "not expected today", so
  a student in a twice-weekly group who attends once was `absent_unexcused` every week
  forever and read as 50% attendance while attending everything they agreed to. §5.14's
  denominators and the at-risk rule count **expected** sessions, and this is what they ask.
* **C11 -- pricing.** §5.10 attached a `price_plan` to a *group* and billed one charge per
  active enrollment, so a child in the competition group and the teenagers group paid twice
  a month at two different prices. The club prices by **volume** -- about 300 for twice a
  week, about 500 for daily -- so `weekly_volume` is the number a manager sets
  `student.price_plan_id` against.

Designing either alone produces a model that contradicts the other, which is why they were
settled together in W2's contract commit rather than discovered in W4.

**Pure functions, no session, no I/O.** Everything here takes the enrollment's stored
pattern and the group's scheduled weekdays and returns an answer. That is what lets M5's
roster call it inside an offline bootstrap payload and M6's billing run call it inside a
transaction, without either lane owning the other's code.

Weekdays are `0-6`, Sunday-first, matching `group_schedule_rule.weekday` (§4.3) -- not
Python's `date.weekday()`, which starts on Monday. The club's week starts on Sunday and so
does every roster in the product.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

__all__ = ["expected_weekdays", "is_expected", "weekly_volume"]


def expected_weekdays(
    attends_weekdays: Sequence[int] | None,
    group_weekdays: Iterable[int],
) -> frozenset[int]:
    """The weekdays one enrollment is expected at.

    `attends_weekdays` is `enrollment.attends_weekdays`; `group_weekdays` is the weekdays
    that group's live `group_schedule_rule` rows cover.

    **`None` means every session of the group** -- the default, and the common case. A
    group that trains once a week never needs the column set.

    The result is **intersected with the group's schedule**, and that is deliberate rather
    than defensive. §5.6 rewrites future sessions when a rule changes, so a pattern set
    against last term's schedule can name a day the group no longer trains. Without the
    intersection that student is expected at a session which does not exist and is counted
    absent from it forever -- C12's bug, reintroduced through the back door. An enrollment
    left expecting nothing is a real state a manager needs to see, not an error to raise
    here: this function reports, the dashboard surfaces.
    """
    scheduled = frozenset(group_weekdays)
    if attends_weekdays is None:
        return scheduled
    return frozenset(attends_weekdays) & scheduled


def is_expected(
    attends_weekdays: Sequence[int] | None,
    group_weekdays: Iterable[int],
    session_weekday: int,
    *,
    group_kind: str = "base",
    has_booking: bool = False,
) -> bool:
    """Whether this enrollment puts the student on that session's roster.

    Not a fifth attendance state (§5.7). The four states record what somebody *said*;
    this records what was *asked of them*, and the axes are independent. A student who is
    not expected still appears beneath the roster in `לא אמורים להגיע היום` and can still
    be marked -- a child who turns up on an extra day is a real child -- but their row
    never counts toward `לא סומן`, is never touched by `סמן הכל נוכח`, and never enters a
    §5.14 denominator.

    **The branch on `group_kind` is the training-plans seam** (that design's §8), and it is
    a branch rather than a rewrite:

    ==========  ==============================================================
    `base`      from `enrollment` and `attends_weekdays`, exactly as before --
                no code path changes, and Tuesday and Friday stay automatic
    `extra`     the students holding a live `session_booking` for that session
    `private`   the same
    ==========  ==============================================================

    A student who marked and did not come is absent, and enters §5.14's denominators like
    any other expected student. A student who never marked is not on the roster and enters
    no denominator -- which is correct: nobody asked them to be there.

    **The pure-function, no-I/O contract is preserved.** `has_booking` is supplied by the
    caller exactly the way `group_weekdays` already is; this module never opens a session,
    which is what lets `weekly_volume` below and every §5.14 report share it.

    Weekdays are ignored entirely for a booked kind, deliberately: a booking names a
    SESSION, and a session is a row that exists whether or not it falls on a day the
    group's rules cover -- an ad-hoc extra on a Thursday is still a session somebody marked.
    """
    if group_kind in ("extra", "private"):
        return has_booking
    return session_weekday in expected_weekdays(attends_weekdays, group_weekdays)


def weekly_volume(
    patterns: Iterable[tuple[Sequence[int] | None, Iterable[int]]],
) -> int:
    """Sessions per week across all of a student's active enrollments.

    Takes one `(attends_weekdays, group_weekdays)` pair per enrollment. **Sums rather than
    unions**: volume is sessions per week, not distinct days, so a child attending two
    groups that both train on Sunday trains twice that week and is priced accordingly.

    This is C11's number -- what "twice a week" means when the sessions belong to different
    groups. §5.10 shows it beside the plan picker so a mismatch between what a child
    attends and what they are billed for is visible at the moment the price is set. It is a
    **suggestion, not a computation**: the manager picks the plan, because the club's own
    numbers are approximate ("about 300", "about 500") and a discount is a negative
    `manual` charge as it always was.

    A student with no enrollments returns 0. §5.4a's leads and trials have none, which is
    exactly what makes the billing run skip them with no special-casing.
    """
    return sum(len(expected_weekdays(attends, scheduled)) for attends, scheduled in patterns)
