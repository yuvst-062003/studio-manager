"""The only writer of `session.status = 'completed'`.

Nothing else can set it: a session ends by the passage of time, not by anybody doing
something. Leaving it to the attendance screen would mean a class nobody marked stayed
`scheduled` forever, and §5.14's 'sessions held vs planned' would report the club as having
held nothing.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.schedule import Session
from app.workers.schedule import complete_ended_sessions
from tests.schedule.conftest import T0


@pytest.fixture
def tenant_session(migrated, studio):
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


def make(tenant_session, studio, an_active_year, a_group, *, start, end, status="scheduled", **kw):
    row = Session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=an_active_year,
        starts_at=start,
        ends_at=end,
        status=status,
        **kw,
    )
    tenant_session.add(row)
    tenant_session.flush()
    return row


def test_a_session_that_has_ended_becomes_completed(
    tenant_session, studio, an_active_year, a_group
):
    ended = make(
        tenant_session,
        studio,
        an_active_year,
        a_group,
        start=datetime(2026, 10, 6, 15, 0, tzinfo=UTC),
        end=datetime(2026, 10, 6, 17, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 1
    assert tenant_session.get(Session, ended.id).status == "completed"


def test_a_session_still_to_come_is_left_alone(tenant_session, studio, an_active_year, a_group):
    upcoming = make(
        tenant_session,
        studio,
        an_active_year,
        a_group,
        start=datetime(2026, 12, 1, 15, 0, tzinfo=UTC),
        end=datetime(2026, 12, 1, 17, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 0
    assert tenant_session.get(Session, upcoming.id).status == "scheduled"


def test_a_session_still_running_is_left_alone(tenant_session, studio, an_active_year, a_group):
    """The boundary is `ends_at <= now`. A class in progress has people on the mat and a
    coach who is about to mark attendance on it."""
    running = make(
        tenant_session,
        studio,
        an_active_year,
        a_group,
        start=datetime(2026, 11, 3, 11, 0, tzinfo=UTC),
        end=datetime(2026, 11, 3, 13, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 0
    assert tenant_session.get(Session, running.id).status == "scheduled"


def test_a_cancelled_session_is_never_quietly_completed(
    tenant_session, studio, an_active_year, a_group
):
    """A cancelled lesson did not happen. Completing it would put it into §5.14's
    'sessions held' count and tell the club it ran a class it cancelled."""
    cancelled = make(
        tenant_session,
        studio,
        an_active_year,
        a_group,
        start=datetime(2026, 10, 6, 15, 0, tzinfo=UTC),
        end=datetime(2026, 10, 6, 17, 0, tzinfo=UTC),
        status="cancelled",
        cancel_reason="system:closure",
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 0
    assert tenant_session.get(Session, cancelled.id).status == "cancelled"


def test_running_it_twice_completes_nothing_the_second_time(
    tenant_session, studio, an_active_year, a_group
):
    make(
        tenant_session,
        studio,
        an_active_year,
        a_group,
        start=datetime(2026, 10, 6, 15, 0, tzinfo=UTC),
        end=datetime(2026, 10, 6, 17, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 1
    assert complete_ended_sessions(tenant_session, at=T0) == 0
