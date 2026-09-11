"""Filtering the weekly calendar by CLASS.

Owner, 2026-09-09: "Calendar — filter by class."

`group_id` has always been there, and a group is one timetable slot. A studio running judo
and karate on the same evenings gets one grid with both in it, and the only way to see just
judo was to ask five times -- once per judo group -- and merge the answers by eye.

Deliberately NOT a client-side filter over the fetched page: the list is cursor-paginated,
so filtering after the fact would drop rows that live on a later page and quietly show a
manager an incomplete week.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta

import pytest
from app.core.clock import now
from app.models.schedule import Session as SessionRow
from app.models.schedule import TrainingYear
from app.models.structure import Class as StudioClass
from app.models.structure import Group


@pytest.fixture
def two_classes_with_lessons(app_session, studio):
    """A judo lesson and a karate lesson on the same day."""
    today = now().date()
    year = TrainingYear(
        studio_id=studio.id,
        name="שנה",
        starts_on=today - timedelta(days=200),
        ends_on=today + timedelta(days=200),
        status="active",
    )
    judo = StudioClass(studio_id=studio.id, name="ג'ודו", discipline="judo")
    karate = StudioClass(studio_id=studio.id, name="קראטה", discipline="karate")
    app_session.add_all([year, judo, karate])
    app_session.flush()
    judo_group = Group(studio_id=studio.id, class_id=judo.id, name="ג'ודו א")
    karate_group = Group(studio_id=studio.id, class_id=karate.id, name="קראטה א")
    app_session.add_all([judo_group, karate_group])
    app_session.flush()
    lessons = {}
    for key, group in (("judo", judo_group), ("karate", karate_group)):
        row = SessionRow(
            studio_id=studio.id,
            group_id=group.id,
            training_year_id=year.id,
            starts_at=datetime.combine(today, time(17, 0), tzinfo=UTC),
            ends_at=datetime.combine(today, time(18, 0), tzinfo=UTC),
        )
        app_session.add(row)
        lessons[key] = row
    app_session.commit()
    return {
        "judo_class": judo.id,
        "karate_class": karate.id,
        "judo_session": lessons["judo"].id,
        "karate_session": lessons["karate"].id,
    }


def _window() -> tuple[str, str]:
    today = now().date()
    return (today - timedelta(days=1)).isoformat(), (today + timedelta(days=1)).isoformat()


def test_the_calendar_can_be_asked_for_one_class(client, two_classes_with_lessons, as_manager):
    ids = two_classes_with_lessons
    start, end = _window()

    response = client.get(
        f"/api/v1/sessions?from={start}&to={end}&class_id={ids['judo_class']}",
        headers=as_manager.headers,
    )
    assert response.status_code == 200, response.text
    got = [row["id"] for row in response.json()["items"]]
    assert str(ids["judo_session"]) in got
    assert str(ids["karate_session"]) not in got


def test_without_a_class_the_calendar_still_shows_the_whole_studio(
    client, two_classes_with_lessons, as_manager
):
    """The filter is an extra question, never a new default. A manager who asks nothing
    must still get the week they had before this existed."""
    ids = two_classes_with_lessons
    start, end = _window()
    got = [
        row["id"]
        for row in client.get(
            f"/api/v1/sessions?from={start}&to={end}", headers=as_manager.headers
        ).json()["items"]
    ]
    assert str(ids["judo_session"]) in got
    assert str(ids["karate_session"]) in got


def test_an_unknown_class_shows_an_empty_week_rather_than_every_lesson(
    client, two_classes_with_lessons, as_manager
):
    """A filter that falls back to "everything" when it cannot resolve is a filter that
    stops filtering without anyone noticing."""
    start, end = _window()
    rows = client.get(
        f"/api/v1/sessions?from={start}&to={end}&class_id={uuid.uuid4()}",
        headers=as_manager.headers,
    ).json()["items"]
    assert rows == []


def test_a_lesson_names_the_class_it_belongs_to(client, two_classes_with_lessons, as_manager):
    """The row describes itself.

    A lesson has always named its GROUP -- one timetable slot -- so any screen wanting to
    say or filter by "judo" had to fetch every group and join them client-side, and the
    week board could not do it at all because it never loaded the group list.
    """
    ids = two_classes_with_lessons
    start, end = _window()
    rows = {
        row["id"]: row
        for row in client.get(
            f"/api/v1/sessions?from={start}&to={end}", headers=as_manager.headers
        ).json()["items"]
    }
    judo = rows[str(ids["judo_session"])]
    assert judo["class_id"] == str(ids["judo_class"])
    assert judo["class_name"] == "ג'ודו"
    karate = rows[str(ids["karate_session"])]
    assert karate["class_name"] == "קראטה"
