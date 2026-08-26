"""§5.6's impact preview, and C12's warning. Pure: no database, no clock, no studio.

**This module is the invariant.** "Changing a rule rewrites only future sessions. Past
sessions and any session with `is_manually_edited = true` are never overwritten." Every
caller goes through `plan_change`, and `plan_change` enforces the rule against `now`
itself rather than trusting the range its caller expanded — so a service that asks for too
wide a window cannot turn a preview into a rewrite of last term.

**Why the protections are counted apart rather than summed.** The manager's question is not
"how many are safe", it is "what am I about to lose". A single number cannot say whether
last month survived, and a manager who cannot see that the past is safe will not press the
button.

**C12 arrives from the other direction.** A change can be perfectly correct about sessions
and still empty the pattern of every student who only came on the day it moved. They drop
off the roster and stop being counted absent, which looks exactly like the feature working.
`students_left_unscheduled` is that count, and it reads through
`app/services/people/attendance_pattern.py` — the seam W2's contract commit landed for it —
rather than reimplementing the intersection here, because two copies of that rule would
eventually disagree and the roster would be the thing that broke.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from itertools import zip_longest

from app.services.people.attendance_pattern import expected_weekdays
from app.services.schedule.rules import Occurrence, jerusalem_date

#: D-M2-3 — a cancellation the *server* generated. A manager's `cancel_reason` is free text
#: they typed; these are tokens the client maps to an i18n key, so `app/` never holds a
#: second Hebrew string table that §9 cannot reach.
SYSTEM_CANCEL_SCHEDULE_CHANGE = "system:schedule_change"
SYSTEM_CANCEL_CLOSURE = "system:closure"


@dataclass(frozen=True)
class ExistingSession:
    """The seven fields the diff needs. Deliberately not the ORM row: a pure function that
    took a `Session` would be one lazy-load away from needing a database."""

    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    location_id: uuid.UUID | None
    status: str
    is_manually_edited: bool
    is_ad_hoc: bool


@dataclass(frozen=True)
class ProtectedSession:
    """One row the dialog lists by name. §5.6 prints the manually-edited ones as bullets,
    because a count of two tells a manager nothing about which two."""

    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True)
class ChangePlan:
    to_create: tuple[Occurrence, ...]
    to_update: tuple[tuple[uuid.UUID, Occurrence], ...]
    to_cancel: tuple[uuid.UUID, ...]
    protected_past: tuple[uuid.UUID, ...]
    protected_manually_edited: tuple[ProtectedSession, ...]
    protected_ad_hoc: tuple[uuid.UUID, ...]
    first_affected_date: date | None


def _matches(session: ExistingSession, wanted: Occurrence) -> bool:
    return (
        session.starts_at == wanted.starts_at
        and session.ends_at == wanted.ends_at
        and session.location_id == wanted.location_id
    )


def plan_change(
    existing: Sequence[ExistingSession],
    desired: Sequence[Occurrence],
    *,
    now: datetime,
    effective_from: date,
) -> ChangePlan:
    """What a schedule change would do, without doing any of it.

    `existing` is every session the group already has inside the training year — past ones
    included, because the dialog has to be able to say the past is safe. `desired` is what
    the new rules call for; occurrences at or before `now`, and occurrences before
    `effective_from`, are discarded here rather than by the caller.

    Matching is by **Jerusalem calendar day, then by start time within the day** (D-M2-5).
    A rule-identity join would look tidier and would dangle the moment a rewrite replaces
    the rules, which is precisely the operation being previewed.
    """
    protected_past: list[uuid.UUID] = []
    protected_manual: list[ProtectedSession] = []
    protected_ad_hoc: list[uuid.UUID] = []
    regeneratable: list[ExistingSession] = []

    for session in existing:
        if session.starts_at <= now:
            # §5.6's first protection, and the boundary is `>` verbatim: a class starting
            # this second has people on the mat.
            protected_past.append(session.id)
            continue
        # **Ad-hoc is tested before manually-edited, and the order is load-bearing.**
        # `create_ad_hoc_session` sets BOTH flags — the session is a human's decision AND
        # belongs to no rule — so testing `is_manually_edited` first would file every
        # ad-hoc session under the wrong protection. The two behave differently below: a
        # manually-edited session consumes the rule slot it was moved out of, an ad-hoc one
        # is an extra class and consumes nothing.
        if session.is_ad_hoc:
            protected_ad_hoc.append(session.id)
            continue
        if session.is_manually_edited:
            protected_manual.append(
                ProtectedSession(
                    id=session.id, starts_at=session.starts_at, ends_at=session.ends_at
                )
            )
            continue
        if session.status != "scheduled":
            # Already cancelled — by a closure, almost always. A rule change must not
            # resurrect a lesson the club has told families is not happening.
            continue
        if jerusalem_date(session.starts_at) < effective_from:
            # Future, but before the date the manager dated the change from. Neither
            # protected nor changing: outside the window entirely.
            continue
        regeneratable.append(session)

    wanted = [
        occurrence
        for occurrence in desired
        if occurrence.starts_at > now and occurrence.on_date >= effective_from
    ]

    by_day_existing: dict[date, list[ExistingSession]] = {}
    for session in regeneratable:
        by_day_existing.setdefault(jerusalem_date(session.starts_at), []).append(session)
    by_day_wanted: dict[date, list[Occurrence]] = {}
    for occurrence in wanted:
        by_day_wanted.setdefault(occurrence.on_date, []).append(occurrence)

    # **A manually-edited session consumes the slot it was moved out of.** Without this the
    # 17 November class a manager deliberately pushed to 20:00 keeps its protection AND the
    # new rule creates a second class at 18:00 the same afternoon — so "we protected your
    # change" would arrive as a duplicated lesson. Nearest start time rather than
    # first-come, because a group that trains twice a day must pair the moved morning class
    # with the morning slot.
    for protected in protected_manual:
        day = jerusalem_date(protected.starts_at)
        candidates = by_day_wanted.get(day)
        if not candidates:
            continue
        nearest = min(candidates, key=lambda o: abs(o.starts_at - protected.starts_at))
        candidates.remove(nearest)

    to_create: list[Occurrence] = []
    to_update: list[tuple[uuid.UUID, Occurrence]] = []
    to_cancel: list[uuid.UUID] = []

    for day in sorted(by_day_existing.keys() | by_day_wanted.keys()):
        have = sorted(by_day_existing.get(day, ()), key=lambda s: s.starts_at)
        want = sorted(by_day_wanted.get(day, ()), key=lambda o: o.starts_at)
        for session, occurrence in zip_longest(have, want):
            if session is None and occurrence is not None:
                to_create.append(occurrence)
            elif occurrence is None and session is not None:
                to_cancel.append(session.id)
            elif (
                session is not None and occurrence is not None and not _matches(session, occurrence)
            ):
                to_update.append((session.id, occurrence))

    cancelled = set(to_cancel)
    affected = [o.on_date for o in to_create]
    affected += [jerusalem_date(o.starts_at) for _, o in to_update]
    affected += [jerusalem_date(s.starts_at) for s in regeneratable if s.id in cancelled]

    return ChangePlan(
        to_create=tuple(to_create),
        to_update=tuple(to_update),
        to_cancel=tuple(to_cancel),
        protected_past=tuple(protected_past),
        protected_manually_edited=tuple(protected_manual),
        protected_ad_hoc=tuple(protected_ad_hoc),
        first_affected_date=min(affected) if affected else None,
    )


def students_left_unscheduled(
    patterns: Iterable[tuple[uuid.UUID, Sequence[int] | None]],
    new_weekdays: Iterable[int],
) -> int:
    """**C12.** How many students this group would leave expecting nothing.

    Takes one `(student_id, enrollment.attends_weekdays)` pair per active enrollment in the
    group, and the weekdays the group would still train on afterwards.

    `attends_weekdays IS NULL` means "all of this group's sessions", so such a student is
    counted only when the group stops training altogether — which is the case most worth
    warning about, and the one a naive "skip the NULLs" implementation misses.

    Distinct students, not enrollments (D-M2-6): `uq_enrollment_live` makes those the same
    number inside one group today, and the copy says תלמידים.
    """
    scheduled = frozenset(new_weekdays)
    stranded = {
        student_id for student_id, attends in patterns if not expected_weekdays(attends, scheduled)
    }
    return len(stranded)
