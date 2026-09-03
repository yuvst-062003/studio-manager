"""§5.14's headline manager alert, and register §2.3 — "nothing produces it."

**The rule, verbatim (SPEC §5.14):** "Students at risk — three or more consecutive
**expected** sessions missed." `unmarked` is a real status (§5.14's own "sessions held vs
planned" point) and never counted as a miss — a coach who has not gotten to the register
yet is not evidence a child is drifting away, and treating it as one is how an alert stops
being trusted (register §2.3's own words). A `not expected` session (C12) is invisible to
the streak entirely, the same as every other §5.14 denominator.

G7: every assertion here is on counts and ids, never a child's name.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from app.models.attendance import Attendance
from app.models.comms import Notification
from app.models.people import Enrollment, Student
from app.models.person import Guardian, Person
from app.services.comms.kinds import AT_RISK
from app.workers.at_risk import Tally, raise_at_risk
from sqlalchemy import select
from tests.attendance.conftest import T0, YEAR_STARTS, make_session


def _mark(app_session, *, session_id, student_id, status):
    app_session.add(
        Attendance(
            studio_id=app_session.get(Student, student_id).studio_id,
            session_id=session_id,
            student_id=student_id,
            status=status,
            source="coach",
            marked_at=T0,
            device_marked_at=T0,
            client_mark_id=str(uuid.uuid4()),
        )
    )
    app_session.commit()


@pytest.fixture
def a_family_of(app_session, studio, a_group, a_training_year):
    """A student enrolled in `a_group`, with a primary guardian who has a phone — and a
    helper to lay down N weekly sessions ending at T0, walking backward, each optionally
    marked. `weeks_ago=0` is T0 itself (this week's session)."""

    def _make(*, weeks_ago_and_status: list[tuple[int, str | None]]):
        person = Person(studio_id=studio.id, first_name="ילד", last_name="בסיכון")
        parent = Person(
            studio_id=studio.id, first_name="הורה", last_name="בסיכון", phone="050-1234567"
        )
        app_session.add_all([person, parent])
        app_session.flush()
        student = Student(
            studio_id=studio.id, person_id=person.id, status="active", joined_on=YEAR_STARTS
        )
        app_session.add(student)
        app_session.flush()
        app_session.add(
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=a_group,
                status="active",
                started_on=YEAR_STARTS,
            )
        )
        app_session.add(
            Guardian(
                studio_id=studio.id,
                student_id=student.id,
                person_id=parent.id,
                is_primary=True,
                relation="parent",
            )
        )
        app_session.commit()

        for weeks_ago, status in weeks_ago_and_status:
            starts_at = T0 - timedelta(weeks=weeks_ago)
            row = make_session(
                studio_id=studio.id,
                group_id=a_group,
                training_year_id=a_training_year,
                starts_at=starts_at,
                status="completed" if weeks_ago > 0 else "scheduled",
            )
            app_session.add(row)
            app_session.commit()
            if status is not None:
                _mark(app_session, session_id=row.id, student_id=student.id, status=status)

        return student.id, parent.id

    return _make


# `at` for every call below — well after every `weeks_ago >= 1` session's `ends_at`, so
# the worker treats them all as already completed.
AT = T0 + timedelta(days=1)


def test_three_consecutive_missed_expected_sessions_raises_the_alert(
    app_session, tenant_session, studio, a_family_of
):
    student_id, parent_id = a_family_of(
        weeks_ago_and_status=[
            (3, "absent_unexcused"),
            (2, "absent_excused"),
            (1, "absent_unexcused"),
        ]
    )
    tally = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=tally)
    tenant_session.commit()

    assert tally.raised == 1
    # `app_session` is a plain, unscoped session (§ tests/attendance/conftest.py) — filter
    # by studio explicitly, since other tests in this same run create their own AT_RISK
    # notifications in their own studios and an unfiltered query would see all of them.
    notification = app_session.execute(
        select(Notification).where(
            Notification.kind == AT_RISK, Notification.studio_id == studio.id
        )
    ).scalar_one()
    assert notification.payload["student_id"] == str(student_id)
    assert notification.payload["contact_person_id"] == str(parent_id)
    assert notification.payload["contact_phone"] == "050-1234567"
    assert notification.payload["missed_count"] == 3


@pytest.mark.parametrize(
    "weeks_ago_and_status",
    [
        pytest.param([(2, "absent_unexcused"), (1, "absent_unexcused")], id="only two missed"),
        pytest.param(
            [
                (4, "absent_unexcused"),
                (3, "absent_unexcused"),
                (2, "present"),
                (1, "absent_unexcused"),
            ],
            id="present breaks the streak",
        ),
    ],
)
def test_fewer_than_three_consecutive_does_not_raise(
    tenant_session, studio, a_family_of, weeks_ago_and_status
):
    a_family_of(weeks_ago_and_status=weeks_ago_and_status)
    tally = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=tally)
    assert tally.raised == 0


def test_unmarked_breaks_the_streak_rather_than_extending_it(tenant_session, studio, a_family_of):
    """SPEC §5.14 and the roster's own rule: unmarked is a real status, never absent. A
    coach who has not reached three older sessions must not read as three absences."""
    a_family_of(
        weeks_ago_and_status=[
            (5, "absent_unexcused"),
            (4, "absent_unexcused"),
            (3, "absent_unexcused"),
            (2, None),  # unmarked — breaks the streak
            (1, "absent_unexcused"),
        ]
    )
    tally = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=tally)
    # Walking back from the newest session: week 1 is a single miss, week 2 is unmarked and
    # stops the count there. The older three-in-a-row never reaches the newest session.
    assert tally.raised == 0


def test_not_expected_sessions_are_invisible_to_the_streak(
    app_session, tenant_session, studio, a_group, a_training_year
):
    """C12 — a student enrolled for only one weekday of a twice-weekly group is not
    `absent_unexcused` on the day nobody asked them to come."""
    person = Person(studio_id=studio.id, first_name="ילד", last_name="חלקי")
    parent = Person(studio_id=studio.id, first_name="הורה", last_name="חלקי", phone="050-0000000")
    app_session.add_all([person, parent])
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=YEAR_STARTS
    )
    app_session.add(student)
    app_session.flush()
    # Expected only on T0's weekday (Tuesday, studio_weekday 2) — every session below is a
    # different day of the same week, so none of them is ever expected.
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=a_group,
            status="active",
            started_on=YEAR_STARTS,
            attends_weekdays=[2],
        )
    )
    app_session.add(
        Guardian(studio_id=studio.id, student_id=student.id, person_id=parent.id, is_primary=True)
    )
    app_session.commit()
    for weeks_ago in (3, 2, 1):
        row = make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            # Shift off Tuesday, onto a day this enrollment never attends.
            starts_at=T0 - timedelta(weeks=weeks_ago) + timedelta(days=1),
            status="completed",
        )
        app_session.add(row)
        app_session.commit()
        _mark(app_session, session_id=row.id, student_id=student.id, status="absent_unexcused")

    tally = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=tally)
    assert tally.raised == 0


def test_does_not_re_raise_for_the_same_streak_on_the_next_run(tenant_session, studio, a_family_of):
    """The idempotency rule: a job that runs again before anything changes must not send a
    second alert for the same three absences — the manager would stop trusting a card that
    pages them every fifteen minutes for a fact they already acted on."""
    a_family_of(
        weeks_ago_and_status=[
            (3, "absent_unexcused"),
            (2, "absent_excused"),
            (1, "absent_unexcused"),
        ]
    )
    first = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=first)
    tenant_session.commit()
    assert first.raised == 1

    second = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=second)
    assert second.raised == 0


def test_a_fresh_streak_after_the_alerted_one_raises_again(
    app_session, tenant_session, studio, a_group, a_training_year, a_family_of
):
    """A student who came back and later drifted away again is a new episode, not a
    continuation — SPEC §5.14 gives the manager one alert per streak, not zero after the
    first ever."""
    student_id, _ = a_family_of(
        weeks_ago_and_status=[
            (3, "absent_unexcused"),
            (2, "absent_excused"),
            (1, "absent_unexcused"),
        ]
    )
    first = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=first)
    tenant_session.commit()
    assert first.raised == 1

    def _add(weeks_ago: int, status: str) -> None:
        row = make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=T0 - timedelta(weeks=weeks_ago),
            status="completed",
        )
        app_session.add(row)
        app_session.commit()
        _mark(app_session, session_id=row.id, student_id=student_id, status=status)

    # Comes back this week (0 weeks ago, before AT) — breaks the alerted streak...
    _add(0, "present")
    unchanged = Tally()
    raise_at_risk(tenant_session, studio, at=AT, tally=unchanged)
    assert unchanged.raised == 0

    # ...then drifts away again, a week later: a genuinely new three-in-a-row.
    later = AT + timedelta(weeks=4)
    for weeks_ago in (3, 2, 1):
        _add(weeks_ago - 4, "absent_unexcused")  # relative to `later`, not `AT`
    second = Tally()
    raise_at_risk(tenant_session, studio, at=later, tally=second)
    assert second.raised == 1
