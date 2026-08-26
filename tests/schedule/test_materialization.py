"""§5.6's materialization: 'When a group's schedule is set, sessions are generated as real
rows for the **entire training year**, skipping dates covered by `studio_closure`.'

**Materialized, not projected**, and the seam's docstring says why: a caller may hold the
ids. M3's trial booking attaches a `trial_booking.session_id` to one of these rows, so a
computed slot that vanished on the next request would be a booking pointing at nothing.

Generation covers the whole requested range, past dates included. §5.6's "only the future"
rule is about **rewriting** a schedule, not about generating one — a club activating a year
in November still wants September in the calendar.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.schedule import GroupScheduleRule, Session, StudioClosure, TrainingYear
from app.models.structure import Group
from app.services.schedule import ScheduleService
from app.services.schedule.service import NotFoundError
from sqlalchemy import select
from tests.schedule.conftest import T0, YEAR_ENDS, YEAR_STARTS

SUNDAY = 0
TUESDAY = 2


@pytest.fixture
def tenant_session(migrated, studio):
    """A `TenantSession` scoped to the fixture studio. The service is written against one,
    so a plain `Session` would bypass the filter the service is relying on."""
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


def add_rule(session, studio, group_id, *, weekday, start=time(17, 0), end=time(19, 0)):
    row = GroupScheduleRule(
        studio_id=studio.id,
        group_id=group_id,
        weekday=weekday,
        start_time=start,
        end_time=end,
        location_id=None,
        effective_from=YEAR_STARTS,
    )
    session.add(row)
    session.flush()
    return row


def test_a_whole_training_year_is_materialized_as_real_rows(
    tenant_session, studio, a_group, an_active_year
):
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    created = ScheduleService(tenant_session).materialize_sessions(a_group, YEAR_STARTS, YEAR_ENDS)
    tenant_session.flush()

    persisted = (
        tenant_session.execute(select(Session).where(Session.group_id == a_group)).scalars().all()
    )
    assert len(persisted) == len(created) > 40
    assert all(s.id is not None for s in created)
    assert all(s.training_year_id == an_active_year for s in created)


def test_every_session_lands_on_the_rules_weekday_at_the_rules_wall_clock_time(
    tenant_session, studio, a_group, an_active_year
):
    add_rule(tenant_session, studio, a_group, weekday=TUESDAY, start=time(17, 0), end=time(19, 0))
    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 10, 19), date(2026, 11, 4)
    )
    moments = {s.starts_at for s in created}
    # Either side of the 25 October DST switch: 17:00 local both times, an hour apart in UTC.
    assert datetime(2026, 10, 20, 14, 0, tzinfo=UTC) in moments
    assert datetime(2026, 11, 3, 15, 0, tzinfo=UTC) in moments


def test_a_closure_produces_no_session_at_all(tenant_session, studio, a_group, an_active_year):
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    tenant_session.add(
        StudioClosure(
            studio_id=studio.id,
            training_year_id=an_active_year,
            date_from=date(2026, 9, 13),
            date_to=date(2026, 9, 20),
            reason="סוכות",
            source="holiday_preset",
        )
    )
    tenant_session.flush()

    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 9, 6), date(2026, 9, 27)
    )
    assert [s.starts_at.date() for s in created] == [date(2026, 9, 6), date(2026, 9, 27)]
    assert all(s.status == "scheduled" for s in created)


def test_running_it_twice_creates_nothing_the_second_time(
    tenant_session, studio, a_group, an_active_year
):
    """`POST /training-years/{id}/generate-sessions` is a button a manager can press
    twice, and G16 makes every mutating endpoint safe to replay."""
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    service = ScheduleService(tenant_session)
    first = service.materialize_sessions(a_group, YEAR_STARTS, YEAR_ENDS)
    tenant_session.flush()
    second = service.materialize_sessions(a_group, YEAR_STARTS, YEAR_ENDS)

    assert [s.id for s in first] == [s.id for s in second]


def test_the_result_is_ordered_by_start_and_scoped_to_the_range(
    tenant_session, studio, a_group, an_active_year
):
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    add_rule(tenant_session, studio, a_group, weekday=TUESDAY, start=time(18, 0), end=time(20, 0))
    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 9, 6), date(2026, 9, 15)
    )
    assert [s.starts_at for s in created] == sorted(s.starts_at for s in created)
    assert all(date(2026, 9, 6) <= s.starts_at.date() <= date(2026, 9, 16) for s in created)


def test_it_returns_ad_hoc_and_cancelled_sessions_in_the_range_too(
    tenant_session, studio, a_group, an_active_year
):
    """The seam's contract is 'every session for `group_id` in the range', not 'every
    session a rule produced'. M3's picker filters on `is_bookable` itself; a reader that
    could not see a cancelled lesson would offer a trial slot on a closed day."""
    tenant_session.add(
        Session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=an_active_year,
            starts_at=datetime(2026, 9, 9, 14, 0, tzinfo=UTC),
            ends_at=datetime(2026, 9, 9, 16, 0, tzinfo=UTC),
            status="scheduled",
            is_ad_hoc=True,
        )
    )
    tenant_session.flush()
    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 9, 6), date(2026, 9, 13)
    )
    assert any(s.is_ad_hoc for s in created)


def test_a_group_in_another_studio_is_invisible_rather_than_forbidden(
    tenant_session, studio, an_active_year
):
    with pytest.raises(NotFoundError):
        ScheduleService(tenant_session).materialize_sessions(uuid.uuid4(), YEAR_STARTS, YEAR_ENDS)


def test_a_group_with_no_rules_materializes_nothing_rather_than_raising(
    tenant_session, studio, a_group, an_active_year
):
    assert (
        ScheduleService(tenant_session).materialize_sessions(a_group, YEAR_STARTS, YEAR_ENDS) == []
    )


def test_activating_a_year_closes_the_one_that_was_active(tenant_session, studio, an_active_year):
    """`uq_training_year_one_active` is a partial unique index, so 'activate' has to close
    the incumbent in the same transaction or the insert fails at the database."""
    draft = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ח",
        starts_on=date(2027, 9, 1),
        ends_on=date(2028, 6, 30),
        status="draft",
    )
    tenant_session.add(draft)
    tenant_session.flush()

    ScheduleService(tenant_session).activate_training_year(draft.id, at=T0)
    tenant_session.flush()

    assert tenant_session.get(TrainingYear, draft.id).status == "active"
    assert tenant_session.get(TrainingYear, an_active_year).status == "closed"


def test_generate_for_a_year_covers_every_active_group(
    tenant_session, studio, a_group, an_active_year
):
    second = Group(
        studio_id=studio.id,
        class_id=tenant_session.get(Group, a_group).class_id,
        name="מתקדמים",
    )
    tenant_session.add(second)
    tenant_session.flush()
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    add_rule(tenant_session, studio, second.id, weekday=TUESDAY)

    groups, created = ScheduleService(tenant_session).generate_sessions_for_year(
        an_active_year, at=T0
    )
    assert groups == 2
    assert created > 80
