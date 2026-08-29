"""`GET /attendance/report` — artboard `4c`'s two halves, over a range the manager chose.

**Why this endpoint exists at all.** The dashboard used to build `4c`'s unmarked list from
`GET /sync/bootstrap`, which is §6.1's *offline priming* payload and clamps every window to
§10.6's two days (`app/services/attendance/bootstrap.clamp_window`). So a screen asking for
"the last seven days" silently received the two OLDEST days of it, and a date picker wired
to that endpoint would have gone on lying with a wider face. §10.6's bound is right for a
phone's IndexedDB and wrong for a manager's report; they are different questions and this
is the second one.

**The rate is over marked registers only, and that is the honest denominator.** §5.14 makes
`unmarked` a real state precisely so a coach who forgot the register does not look like a
child who stopped coming. A rate that divided by every enrolled child would report a club
that had a bad week whenever a coach had a busy one. So the denominator is
present + absent_excused + absent_unexcused, `unmarked` is excluded, and a group with no
decided marks at all reports `null` rather than 0% — 0% is a claim, and "nobody said"
is not one.
"""

from __future__ import annotations

from datetime import timedelta

from app.models.attendance import Attendance
from tests.attendance.conftest import T0, make_session

REPORT = "/api/v1/attendance/report"

#: T0 is midday; a session an hour long two days earlier has ended by any clock the tests
#: use, which is what makes it eligible for the chase list.
TWO_DAYS_AGO = T0 - timedelta(days=2)


def _mark(app_session, *, studio_id, session_id, student_id, status, at=T0):
    import uuid

    app_session.add(
        Attendance(
            studio_id=studio_id,
            session_id=session_id,
            student_id=student_id,
            status=status,
            source="coach",
            marked_at=at,
            device_marked_at=at,
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()


def _range(days_back: int = 7) -> dict[str, str]:
    return {
        "from": (T0 - timedelta(days=days_back)).date().isoformat(),
        "to": T0.date().isoformat(),
    }


# ── the per-group rate, which had never had data in it ───────────────────────────────


def test_reports_a_per_group_rate_over_the_marks_in_the_range(
    client, as_manager, app_session, studio, a_group, a_training_year, an_enrolled_student
):
    """`4c`'s second card — name · bar · percentage. It has a number now."""
    ended = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO,
    )
    app_session.add(ended)
    app_session.commit()
    _mark(
        app_session,
        studio_id=studio.id,
        session_id=ended.id,
        student_id=an_enrolled_student,
        status="present",
    )

    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    rates = {row["group_id"]: row for row in body["groups"]}
    assert rates[str(a_group)]["rate_percent"] == 100
    assert rates[str(a_group)]["group_name"] == "מתחילים"


def test_unmarked_marks_are_excluded_from_the_denominator(
    client, as_manager, app_session, studio, a_group, a_training_year, an_enrolled_student
):
    """§5.14, as arithmetic. A register opened and left undecided for one child must not
    drag the group's rate down — the screen already SAYS unmarked is not absence, and a
    number that disagreed with the sentence beside it would be the worse of the two."""
    first = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO,
    )
    second = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO + timedelta(days=1),
    )
    app_session.add_all([first, second])
    app_session.commit()
    _mark(
        app_session,
        studio_id=studio.id,
        session_id=first.id,
        student_id=an_enrolled_student,
        status="present",
    )
    _mark(
        app_session,
        studio_id=studio.id,
        session_id=second.id,
        student_id=an_enrolled_student,
        status="unmarked",
    )

    row = client.get(REPORT, params=_range(), headers=as_manager.headers).json()["groups"][0]
    # One present, one unmarked. 100%, not 50%.
    assert row["rate_percent"] == 100
    assert row["unmarked"] == 1


def test_an_excused_absence_still_counts_against_the_rate(
    client, as_manager, app_session, studio, a_group, a_training_year, an_enrolled_student
):
    """A parent's advance notice makes an absence polite, not attended. §5.14's at-risk
    rule counts it and so does this — the manager is asking who is on the mat."""
    first = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO,
    )
    second = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO + timedelta(hours=2),
    )
    app_session.add_all([first, second])
    app_session.commit()
    _mark(
        app_session,
        studio_id=studio.id,
        session_id=first.id,
        student_id=an_enrolled_student,
        status="present",
    )
    _mark(
        app_session,
        studio_id=studio.id,
        session_id=second.id,
        student_id=an_enrolled_student,
        status="absent_excused",
    )

    row = client.get(REPORT, params=_range(), headers=as_manager.headers).json()["groups"][0]
    assert row["rate_percent"] == 50
    assert row["absent"] == 1


def test_a_group_nobody_marked_reports_null_rather_than_zero_percent(
    client, as_manager, app_session, studio, a_group, a_training_year
):
    """0% is a claim about children who did not come. "Nobody said" is not that claim, and
    a bar drawn at zero would put the club's best group at the bottom of the list."""
    app_session.add(
        make_session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=a_training_year,
            starts_at=TWO_DAYS_AGO,
        )
    )
    app_session.commit()

    row = client.get(REPORT, params=_range(), headers=as_manager.headers).json()["groups"][0]
    assert row["rate_percent"] is None
    assert row["sessions"] == 1
    assert row["marked_sessions"] == 0


# ── the range, which is the whole point ──────────────────────────────────────────────


def test_the_range_is_not_clamped_to_the_offline_cache_window(
    client, as_manager, app_session, studio, a_group, a_training_year, an_enrolled_student
):
    """The bug this endpoint exists for. `/sync/bootstrap` answers a seven-day question with
    §10.6's two days, so `4c` was rendering the two oldest days of the week it asked for."""
    six_days_back = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 - timedelta(days=6),
    )
    yesterday = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 - timedelta(days=1),
    )
    app_session.add_all([six_days_back, yesterday])
    app_session.commit()

    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    returned = {row["id"] for row in body["unmarked_sessions"]}
    assert returned == {str(six_days_back.id), str(yesterday.id)}


def test_the_range_bounds_are_honoured_on_both_sides(
    client, as_manager, app_session, studio, a_group, a_training_year
):
    outside = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 - timedelta(days=30),
    )
    inside = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 - timedelta(days=3),
    )
    app_session.add_all([outside, inside])
    app_session.commit()

    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    assert {row["id"] for row in body["unmarked_sessions"]} == {str(inside.id)}


def test_an_inverted_range_is_refused_rather_than_answered_empty(client, as_manager):
    response = client.get(
        REPORT,
        params={"from": T0.date().isoformat(), "to": (T0 - timedelta(days=7)).date().isoformat()},
        headers=as_manager.headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "bad_range"


def test_a_range_longer_than_the_export_allows_is_refused_the_same_way(client, as_manager):
    """The same 400 days `GET /exports/attendance` allows. One picker drives both buttons on
    `4c`, so a range that one accepts and the other rejects would be a screen whose export
    fails for a report that rendered."""
    response = client.get(
        REPORT,
        params={"from": "2020-01-01", "to": T0.date().isoformat()},
        headers=as_manager.headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "bad_range"


# ── which sessions belong on a chase list ────────────────────────────────────────────


def test_a_session_that_has_not_ended_yet_is_not_yet_late(
    client, as_manager, a_session, as_lead_coach
):
    """`a_session` starts at T0 and ends an hour later, and X-Dev-Now pins the clock to T0.
    A coach standing on the mat has not failed to mark anything, and a list that accused
    them would be a list nobody trusted by the second week.

    Read off `ends_at <= now` and NOT off `session.status == 'completed'`:
    `app/workers/schedule.py` is the only writer of that status and it went unscheduled for
    a wave and a half, so every session that ended before this month is still `scheduled` in
    any database that existed then. A report whose correctness depends on a job having run
    is a report that was wrong for as long as the job was not.
    """
    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    assert body["unmarked_sessions"] == []


def test_a_cancelled_session_is_not_unmarked_it_simply_did_not_happen(
    client, as_manager, app_session, studio, a_group, a_training_year
):
    cancelled = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO,
        status="cancelled",
    )
    # `ck_session_cancel_reason_required` — a cancellation the club cannot explain is not a
    # state the schema allows, which is §5.6 refusing to let one exist.
    cancelled.cancel_reason = "חג"
    app_session.add(cancelled)
    app_session.commit()

    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    assert body["unmarked_sessions"] == []
    assert body["groups"] == []


def test_a_session_with_a_decided_mark_leaves_the_chase_list(
    client, as_manager, app_session, studio, a_group, a_training_year, an_enrolled_student
):
    ended = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO,
    )
    app_session.add(ended)
    app_session.commit()
    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    assert [row["id"] for row in body["unmarked_sessions"]] == [str(ended.id)]

    _mark(
        app_session,
        studio_id=studio.id,
        session_id=ended.id,
        student_id=an_enrolled_student,
        status="present",
    )
    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    assert body["unmarked_sessions"] == []


def test_a_register_opened_and_left_undecided_is_still_unmarked(
    client, as_manager, app_session, studio, a_group, a_training_year, an_enrolled_student
):
    """§5.14's distinction, in the one place it changes what a manager chases: a stored
    `unmarked` row means somebody opened the register and said nothing, which is exactly as
    unmarked as never having opened it."""
    ended = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=TWO_DAYS_AGO,
    )
    app_session.add(ended)
    app_session.commit()
    _mark(
        app_session,
        studio_id=studio.id,
        session_id=ended.id,
        student_id=an_enrolled_student,
        status="unmarked",
    )

    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    assert [row["id"] for row in body["unmarked_sessions"]] == [str(ended.id)]


# ── who may read it ──────────────────────────────────────────────────────────────────


def test_a_coach_may_not_read_the_studio_wide_report(client, as_lead_coach):
    """§3.2 gives `View all students in studio` and `Export data` to owner and manager only,
    and this is a studio-wide number over every group. `4c` is the manager's dashboard and
    the CSV button beside this data is already `ManagerOrOwner` — a screen where half the
    controls 403 would be worse than one a coach cannot open."""
    assert client.get(REPORT, params=_range(), headers=as_lead_coach.headers).status_code == 403


def test_another_studio_s_sessions_are_invisible(
    client, as_manager, other_studio_session_id, app_session
):
    body = client.get(REPORT, params=_range(), headers=as_manager.headers).json()
    assert all(row["id"] != str(other_studio_session_id) for row in body["unmarked_sessions"])
    assert body["groups"] == []
