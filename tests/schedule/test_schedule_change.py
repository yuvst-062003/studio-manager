"""**The invariant this lane exists to protect.**

§5.6, verbatim: "Changing a schedule rule rewrites only sessions with `starts_at > now()`.
Two categories are protected and never overwritten: sessions in the past — historical
attendance keeps its true times — and sessions with `is_manually_edited = true`." E2E-5 is
this file, driven through a browser.

Every test below is written against the API rather than the service, because the guarantee
a manager relies on is the one the endpoint makes. A service-level test would still pass if
the router forgot to pass `apply` through, and the default for `apply` is the entire
difference between a preview and a rewritten year.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.models.schedule import GroupScheduleRule, Session
from sqlalchemy import select
from tests.schedule.conftest import T0

API = "/api/v1"
SUNDAY, TUESDAY, WEDNESDAY = 0, 2, 3


def rule(weekday: int, start: str = "17:00:00", end: str = "19:00:00") -> dict:
    return {
        "weekday": weekday,
        "start_time": start,
        "end_time": end,
        "location_id": None,
        "effective_from": "2026-09-01",
    }


def put(client, caller, group_id, rules, *, apply: bool, effective_from="2026-09-01"):
    return client.put(
        f"{API}/groups/{group_id}/schedule",
        headers=caller.headers,
        json={"rules": rules, "effective_from": effective_from, "apply": apply},
    )


def starts(app_session, group_id) -> list:
    """Every session's start instant, straight from the table. Read here rather than
    through `GET /sessions` so this file tests the change and not Task 7's reader."""
    app_session.expire_all()
    return [
        row.starts_at
        for row in app_session.execute(
            select(Session).where(Session.group_id == group_id).order_by(Session.starts_at)
        )
        .scalars()
        .all()
    ]


def enrol(app_session, studio, group_id, *, attends, status="active", ended_on=None):
    """A student in the group. `Student` hangs off a `Person` — §3.3 makes a student a role
    a person holds, not a second kind of human — so both rows are created here."""
    person = Person(studio_id=studio.id, first_name="ילד", last_name=uuid.uuid4().hex[:6])
    app_session.add(person)
    app_session.flush()
    student = Student(studio_id=studio.id, person_id=person.id, status="active")
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=group_id,
            status=status,
            started_on=date(2026, 9, 1),
            ended_on=ended_on,
            attends_weekdays=attends,
        )
    )
    app_session.commit()
    return student.id


@pytest.fixture
def a_scheduled_group(client, as_manager, a_group, an_active_year):
    """A group with a Tuesday rule and a materialized year — the state every test below
    starts from. A change tested against a clean group proves nothing, because there is
    nothing to protect."""
    assert put(client, as_manager, a_group, [rule(TUESDAY)], apply=True).status_code == 200
    generated = client.post(
        f"{API}/training-years/{an_active_year}/generate-sessions", headers=as_manager.headers
    )
    assert generated.status_code == 200, generated.text
    return a_group


# -- preview is a preview -----------------------------------------------------
def test_apply_defaults_to_false_so_a_forgotten_field_previews_rather_than_rewrites(
    client, as_manager, a_scheduled_group, app_session
):
    before = starts(app_session, a_scheduled_group)
    assert before, "the fixture must have materialized a year"

    response = client.put(
        f"{API}/groups/{a_scheduled_group}/schedule",
        headers=as_manager.headers,
        json={"rules": [rule(WEDNESDAY)], "effective_from": "2026-09-01"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["sessions_to_cancel"] > 0

    assert starts(app_session, a_scheduled_group) == before


def test_the_preview_names_the_three_protections_separately(client, as_manager, a_scheduled_group):
    """'12 sessions will change' tells a manager nothing about whether last month survived."""
    body = put(
        client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=False
    ).json()
    assert {
        "sessions_to_create",
        "sessions_to_update",
        "sessions_to_cancel",
        "sessions_protected_past",
        "sessions_protected_manually_edited",
        "sessions_protected_ad_hoc",
        "first_affected_date",
        "protected_manually_edited_sessions",
        "students_left_unscheduled",
    } <= set(body)


# -- the invariant ------------------------------------------------------------
def test_a_past_session_keeps_its_time_after_the_change(
    client, as_manager, a_scheduled_group, app_session
):
    held = (
        app_session.execute(
            select(Session)
            .where(Session.group_id == a_scheduled_group, Session.starts_at < T0)
            .order_by(Session.starts_at)
        )
        .scalars()
        .first()
    )
    assert held is not None, "the fixture must produce sessions before T0"
    was = held.starts_at

    body = put(
        client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=True
    ).json()
    assert body["sessions_protected_past"] > 0

    app_session.expire_all()
    assert app_session.get(Session, held.id).starts_at == was


def test_a_manually_edited_future_session_keeps_its_time_and_is_listed(
    client, as_manager, a_scheduled_group, app_session
):
    """§5.6 prints them as bullets. A manager who cannot see WHICH two were protected
    cannot tell whether the one they care about is among them."""
    future = (
        app_session.execute(
            select(Session)
            .where(Session.group_id == a_scheduled_group, Session.starts_at > T0)
            .order_by(Session.starts_at)
        )
        .scalars()
        .first()
    )

    # Written directly rather than through PATCH /sessions/{id} (Task 7). This test is
    # about what a schedule change does to an edited session, not about how it came to be
    # edited, and routing it through a second endpoint would make it fail for two reasons.
    future.is_manually_edited = True
    future.starts_at = datetime(2026, 11, 17, 18, 30, tzinfo=UTC)
    future.ends_at = datetime(2026, 11, 17, 20, 30, tzinfo=UTC)
    app_session.commit()
    edited_id = future.id

    body = put(
        client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=True
    ).json()
    assert body["sessions_protected_manually_edited"] >= 1
    assert str(edited_id) in [p["id"] for p in body["protected_manually_edited_sessions"]]

    app_session.expire_all()
    kept = app_session.get(Session, edited_id)
    assert kept.starts_at == datetime(2026, 11, 17, 18, 30, tzinfo=UTC)
    assert kept.is_manually_edited is True


def test_the_protected_session_is_not_joined_by_a_duplicate_on_the_same_day(
    client, as_manager, a_scheduled_group, app_session
):
    """Protecting a moved class must not also create a fresh one beside it. "We kept your
    change" arriving as two lessons that afternoon is the same bug wearing a hat."""
    future = (
        app_session.execute(
            select(Session)
            .where(Session.group_id == a_scheduled_group, Session.starts_at > T0)
            .order_by(Session.starts_at)
        )
        .scalars()
        .first()
    )
    future.is_manually_edited = True
    app_session.commit()
    that_day = future.starts_at.date()

    put(client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=True)

    app_session.expire_all()
    on_that_day = [
        row
        for row in app_session.execute(
            select(Session).where(
                Session.group_id == a_scheduled_group, Session.status == "scheduled"
            )
        )
        .scalars()
        .all()
        if row.starts_at.date() == that_day
    ]
    assert len(on_that_day) == 1


def test_an_ad_hoc_session_survives_a_rule_that_no_longer_covers_its_day(
    client, as_manager, a_scheduled_group, an_active_year, app_session, studio
):
    # Inserted directly, for the same reason the manually-edited test does: POST /sessions
    # is Task 7's, and this test is about what a rule change does to an ad-hoc session.
    one_off = Session(
        studio_id=studio.id,
        group_id=a_scheduled_group,
        training_year_id=an_active_year,
        starts_at=datetime(2026, 12, 11, 10, 0, tzinfo=UTC),
        ends_at=datetime(2026, 12, 11, 12, 0, tzinfo=UTC),
        status="scheduled",
        is_ad_hoc=True,
    )
    app_session.add(one_off)
    app_session.commit()
    one_off_id = one_off.id

    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True).json()
    assert body["sessions_protected_ad_hoc"] >= 1

    app_session.expire_all()
    survivor = app_session.get(Session, one_off_id)
    assert survivor.starts_at == datetime(2026, 12, 11, 10, 0, tzinfo=UTC)
    assert survivor.status == "scheduled"


def test_a_future_session_actually_moves(client, as_manager, a_scheduled_group, app_session):
    put(client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=True)

    app_session.expire_all()
    moved = (
        app_session.execute(
            select(Session)
            .where(
                Session.group_id == a_scheduled_group,
                Session.starts_at > T0,
                Session.status == "scheduled",
            )
            .order_by(Session.starts_at)
        )
        .scalars()
        .first()
    )
    # 18:00 Jerusalem in November is 16:00Z.
    assert moved.starts_at.astimezone(UTC).hour == 16


def test_moving_the_rule_to_another_weekday_cancels_and_creates(
    client, as_manager, a_scheduled_group
):
    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True).json()
    assert body["sessions_to_cancel"] > 0
    assert body["sessions_to_create"] > 0
    assert body["first_affected_date"] is not None


def test_a_cancelled_session_carries_the_machine_reason_not_hebrew(
    client, as_manager, a_scheduled_group, app_session
):
    """D-M2-3 — a cancellation the SERVER generated writes a token the client translates.
    `app/` never grows a second Hebrew string table §9 cannot reach."""
    put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True)
    app_session.expire_all()
    cancelled = (
        app_session.execute(
            select(Session).where(
                Session.group_id == a_scheduled_group, Session.status == "cancelled"
            )
        )
        .scalars()
        .first()
    )
    assert cancelled.cancel_reason == "system:schedule_change"


def test_the_old_rule_is_closed_rather_than_edited_in_place(
    client, as_manager, a_scheduled_group, app_session
):
    """§4.3 — 'Versioned by date, never edited in place.' A rule rewritten in place has
    already destroyed the 'before' the impact preview exists to show."""
    put(
        client,
        as_manager,
        a_scheduled_group,
        [rule(WEDNESDAY)],
        apply=True,
        effective_from="2026-12-01",
    )
    app_session.expire_all()
    rows = (
        app_session.execute(
            select(GroupScheduleRule).where(GroupScheduleRule.group_id == a_scheduled_group)
        )
        .scalars()
        .all()
    )

    closed = [r for r in rows if r.effective_to is not None]
    live = [r for r in rows if r.effective_to is None]
    assert [r.weekday for r in closed] == [TUESDAY]
    assert closed[0].effective_to == date(2026, 11, 30)
    assert [r.weekday for r in live] == [WEDNESDAY]


def test_get_returns_only_the_rules_still_in_force(client, as_manager, a_scheduled_group):
    put(
        client,
        as_manager,
        a_scheduled_group,
        [rule(WEDNESDAY)],
        apply=True,
        effective_from="2026-12-01",
    )
    body = client.get(
        f"{API}/groups/{a_scheduled_group}/schedule", headers=as_manager.headers
    ).json()
    assert [r["weekday"] for r in body["rules"]] == [TUESDAY]


def test_get_shows_the_upcoming_schedule_when_none_is_live_yet(
    client, as_manager, a_group, an_active_year
):
    """A schedule set before it takes effect is still the group's schedule. A club that
    bootstraps in late August with rules effective 1/9 must not read 'no weekly schedule'
    on every group until the season starts (2026-08-30)."""
    put(client, as_manager, a_group, [rule(WEDNESDAY)], apply=True, effective_from="2026-12-01")
    body = client.get(f"{API}/groups/{a_group}/schedule", headers=as_manager.headers).json()
    assert [r["weekday"] for r in body["rules"]] == [WEDNESDAY]


# -- C12 ----------------------------------------------------------------------
def test_c12_counts_the_students_the_change_leaves_expecting_nothing(
    client, as_manager, a_scheduled_group, app_session, studio
):
    """C12. Moving the rule from Tuesday to Wednesday silently empties the pattern of every
    student who only came on Tuesdays. They drop off the roster and stop being counted
    absent, which looks exactly like the feature working."""
    for _ in range(3):
        enrol(app_session, studio, a_scheduled_group, attends=[TUESDAY])

    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=False).json()
    assert body["students_left_unscheduled"] == 3


def test_c12_is_zero_when_the_change_keeps_everyones_day(
    client, as_manager, a_scheduled_group, app_session, studio
):
    enrol(app_session, studio, a_scheduled_group, attends=[TUESDAY])
    body = put(
        client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=False
    ).json()
    assert body["students_left_unscheduled"] == 0


def test_c12_ignores_a_student_who_has_left_the_group(
    client, as_manager, a_scheduled_group, app_session, studio
):
    """An ended enrollment is not a person the change strands."""
    enrol(
        app_session,
        studio,
        a_scheduled_group,
        attends=[TUESDAY],
        status="ended",
        ended_on=date(2026, 10, 1),
    )
    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=False).json()
    assert body["students_left_unscheduled"] == 0


def test_c12_warns_about_everyone_when_the_last_rule_is_removed(
    client, as_manager, a_scheduled_group, app_session, studio
):
    """`attends_weekdays IS NULL` means every session of the group, so such a student is
    fine until the group stops training — and that is the case most worth warning about."""
    enrol(app_session, studio, a_scheduled_group, attends=None)
    enrol(app_session, studio, a_scheduled_group, attends=[TUESDAY])
    body = put(client, as_manager, a_scheduled_group, [], apply=False).json()
    assert body["students_left_unscheduled"] == 2


# -- permissions --------------------------------------------------------------
def test_a_coach_may_read_the_schedule_but_never_change_it(
    client, as_lead_coach, a_scheduled_group
):
    assert (
        client.get(
            f"{API}/groups/{a_scheduled_group}/schedule", headers=as_lead_coach.headers
        ).status_code
        == 200
    )
    assert (
        put(client, as_lead_coach, a_scheduled_group, [rule(WEDNESDAY)], apply=False).status_code
        == 403
    )


# -- the retroactive edit, which is the commonest one -------------------------
def test_a_schedule_set_in_november_still_fills_september(
    client, as_manager, a_scheduled_group, app_session
):
    """§5.6 says both things, and they are different operations sharing an endpoint:
    "when a group's schedule is set, sessions are generated for the **entire training
    year**", and "changing a rule rewrites only sessions with `starts_at > now()`".

    The fixture sets a schedule dated from 1 September while the clock says 3 November. The
    year must materialize back to September — a club with a two-month hole in its register
    cannot report on the term it just taught — and only the sessions after today may be
    rewritten by a later change.
    """
    before_today = [start for start in starts(app_session, a_scheduled_group) if start < T0]
    assert len(before_today) >= 8


def test_replacing_a_rule_from_its_own_start_date_does_not_end_it_before_it_began(
    client, as_manager, a_scheduled_group, app_session
):
    """The check constraint `effective_to >= effective_from` refuses a rule closed the day
    before it started, and a manager correcting a schedule they set this morning types
    exactly that date. The superseded row is removed rather than mangled."""
    response = put(
        client,
        as_manager,
        a_scheduled_group,
        [rule(TUESDAY, "18:00:00", "20:00:00")],
        apply=True,
        effective_from="2026-09-01",
    )
    assert response.status_code == 200, response.text

    app_session.expire_all()
    rows = (
        app_session.execute(
            select(GroupScheduleRule).where(GroupScheduleRule.group_id == a_scheduled_group)
        )
        .scalars()
        .all()
    )
    assert [(r.weekday, str(r.start_time), r.effective_to) for r in rows] == [
        (TUESDAY, "18:00:00", None)
    ]


def test_a_second_change_does_not_leave_two_live_rules_on_one_weekday(
    client, as_manager, a_scheduled_group, app_session
):
    """Two live rules for the same weekday means the next full materialize generates two
    sessions a week — a duplicate register nobody asked for. Asserted after two changes,
    because one is not enough to catch an overlap."""
    put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True)
    put(client, as_manager, a_scheduled_group, [rule(SUNDAY)], apply=True)

    app_session.expire_all()
    live = [
        r
        for r in app_session.execute(
            select(GroupScheduleRule).where(GroupScheduleRule.group_id == a_scheduled_group)
        )
        .scalars()
        .all()
        if r.effective_to is None
    ]
    assert [r.weekday for r in live] == [SUNDAY]
