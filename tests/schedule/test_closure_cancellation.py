"""§5.6 — 'adding one cancels the affected sessions and notifies the affected guardians.'

**A different code path from the closures in `test_rules.py`.** There, `expand_rules` skips
a closed date at *generation* time, so no session is ever created. Here the sessions already
exist and a closure arrives afterwards, which is the retroactive case: rows that families
already have in their calendars are marked cancelled rather than deleted.

The whole file exists because `create_closure`'s `Session.starts_at > at` was the one
implementation of "only the future is touched" with nothing behind it. Deleting that line
left the rest of the suite green while past lessons were retroactively cancelled — which
would rewrite a register a coach had already signed, and change §5.14's
sessions-held number for a term the club may already have reported on.
"""

from __future__ import annotations

from datetime import UTC, date

import pytest
from app.models.schedule import Session
from sqlalchemy import select
from tests.schedule.conftest import T0

API = "/api/v1"
TUESDAY = 2

#: Two Tuesdays either side of `T0` (Tuesday 3 November 2026, 12:00 UTC), and one well
#: clear of both. Every class is 17:00–19:00 local; October is UTC+3 and November is UTC+2,
#: so 27 October is 14:00Z and the November ones are 15:00Z.
PAST_LESSON = date(2026, 10, 27)
FUTURE_LESSON = date(2026, 11, 3)
UNTOUCHED_LESSON = date(2026, 11, 10)


@pytest.fixture
def a_year_of_sessions(client, as_manager, a_group, an_active_year):
    """A group training every Tuesday, with the whole year materialized.

    A closure tested against a year with no sessions in it proves nothing: `affected` comes
    back empty and the loop under test never runs, which is exactly how this went
    unexercised in the first place.
    """
    put = client.put(
        f"{API}/groups/{a_group}/schedule",
        headers=as_manager.headers,
        json={
            "rules": [
                {
                    "weekday": TUESDAY,
                    "start_time": "17:00:00",
                    "end_time": "19:00:00",
                    "location_id": None,
                    "effective_from": "2026-09-01",
                }
            ],
            "effective_from": "2026-09-01",
            "apply": True,
        },
    )
    assert put.status_code == 200, put.text
    generated = client.post(
        f"{API}/training-years/{an_active_year}/generate-sessions", headers=as_manager.headers
    )
    assert generated.status_code == 200, generated.text
    return a_group


def session_on(app_session, group_id, day: date) -> Session:
    app_session.expire_all()
    rows = (
        app_session.execute(
            select(Session).where(Session.group_id == group_id).order_by(Session.starts_at)
        )
        .scalars()
        .all()
    )
    found = [row for row in rows if row.starts_at.astimezone(UTC).date() == day]
    assert len(found) == 1, f"expected exactly one session on {day}, found {len(found)}"
    return found[0]


def close(client, caller, training_year_id, date_from: date, date_to: date):
    return client.post(
        f"{API}/closures",
        headers=caller.headers,
        json={
            "training_year_id": str(training_year_id),
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "reason": "שיפוץ האולם",
            "source": "manual",
        },
    )


def test_the_fixture_really_straddles_now(client, as_manager, a_year_of_sessions, app_session):
    """Guards the guard. If the two lessons ever stopped falling either side of `T0` this
    file would keep passing while asserting nothing about the future/past split."""
    assert session_on(app_session, a_year_of_sessions, PAST_LESSON).starts_at < T0
    assert session_on(app_session, a_year_of_sessions, FUTURE_LESSON).starts_at > T0


def test_a_closure_cancels_the_future_lesson_inside_its_range(
    client, as_manager, a_year_of_sessions, an_active_year, app_session
):
    future_id = session_on(app_session, a_year_of_sessions, FUTURE_LESSON).id

    response = close(client, as_manager, an_active_year, PAST_LESSON, FUTURE_LESSON)
    assert response.status_code == 201, response.text

    app_session.expire_all()
    cancelled = app_session.get(Session, future_id)
    assert cancelled.status == "cancelled"
    # D-M2-3 — a cancellation the server generated writes a token the client translates,
    # never Hebrew. §9 cannot reach a string table that lives in app/.
    assert cancelled.cancel_reason == "system:closure"


def test_a_past_lesson_in_the_same_range_is_never_touched(
    client, as_manager, a_year_of_sessions, an_active_year, app_session
):
    """§5.6's first protection, on the closure path. A lesson that already happened has
    attendance against it; cancelling it retroactively rewrites a register a coach signed
    and changes a number the club may already have reported."""
    past = session_on(app_session, a_year_of_sessions, PAST_LESSON)
    past_id, was = past.id, past.starts_at

    assert close(client, as_manager, an_active_year, PAST_LESSON, FUTURE_LESSON).status_code == 201

    app_session.expire_all()
    untouched = app_session.get(Session, past_id)
    assert untouched.status == "scheduled"
    assert untouched.starts_at == was
    assert untouched.cancel_reason is None


def test_a_future_lesson_outside_the_range_is_never_touched(
    client, as_manager, a_year_of_sessions, an_active_year, app_session
):
    """The other half of the predicate: the Jerusalem-date range check. Without it a closure
    would cancel every future lesson in the training year, not the ones it names."""
    outside_id = session_on(app_session, a_year_of_sessions, UNTOUCHED_LESSON).id

    assert close(client, as_manager, an_active_year, PAST_LESSON, FUTURE_LESSON).status_code == 201

    app_session.expire_all()
    assert app_session.get(Session, outside_id).status == "scheduled"


def test_the_count_reports_only_the_lessons_actually_cancelled(
    client, as_manager, a_year_of_sessions, an_active_year
):
    """One future lesson in range, one past lesson in range, the rest of the year outside
    it. §5.6 makes this number the manager's to see: they have just closed a fortnight and
    need to know what it cost before they navigate away."""
    response = close(client, as_manager, an_active_year, PAST_LESSON, FUTURE_LESSON)
    assert response.json()["sessions_cancelled"] == 1


def test_a_closure_range_is_inclusive_at_both_ends(
    client, as_manager, a_year_of_sessions, an_active_year, app_session
):
    """A single-day closure on the day of a lesson closes that lesson. An exclusive end
    would leave the club open on the last day of every holiday it declared."""
    lesson_id = session_on(app_session, a_year_of_sessions, FUTURE_LESSON).id

    response = close(client, as_manager, an_active_year, FUTURE_LESSON, FUTURE_LESSON)
    assert response.json()["sessions_cancelled"] == 1

    app_session.expire_all()
    assert app_session.get(Session, lesson_id).status == "cancelled"


def test_a_lesson_already_cancelled_is_not_counted_twice(
    client, as_manager, a_year_of_sessions, an_active_year
):
    """Two overlapping closures — a holiday and a repair, say. The second reports nothing
    to cancel rather than re-cancelling the same lesson and telling the manager it cost
    them another one."""
    assert (
        close(client, as_manager, an_active_year, FUTURE_LESSON, FUTURE_LESSON).json()[
            "sessions_cancelled"
        ]
        == 1
    )
    assert (
        close(client, as_manager, an_active_year, FUTURE_LESSON, FUTURE_LESSON).json()[
            "sessions_cancelled"
        ]
        == 0
    )
