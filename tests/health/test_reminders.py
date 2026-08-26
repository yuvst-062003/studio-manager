"""§5.5's ladder: days 1, 3 and 7, and renewal only when the studio asked for one.

**The two rules this file exists to hold.** §5.5 names exactly three days — a message on day two is
one the club did not ask for — and it makes `health_declaration_validity_months` default to `null`,
so a studio that never set it gets no renewal reminders at all and `valid_until` stays `NULL`
whatever happens.

G7: every assertion here is on counts and ids.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from app.models.health import HealthDeclaration
from app.models.people import Student
from app.models.person import Guardian, Person
from app.models.studio import Studio
from app.services.health.declarations import ACTION_REMINDER
from app.workers.health_reminders import (
    LADDER_DAYS,
    Tally,
    chase_missing,
    chase_renewals,
)
from tests.health.conftest import T0, TODAY


@pytest.fixture
def a_family(app_session, studio):
    """A student with a guardian, joined `days_ago` days back. The ladder needs both: a student
    with no guardian is a student there is nobody to chase."""

    def _make(*, days_ago: int, health_status: str = "missing", status: str = "active"):
        person = Person(studio_id=studio.id, first_name="ילד", last_name=f"{days_ago}")
        parent = Person(studio_id=studio.id, first_name="הורה", last_name=f"{days_ago}")
        app_session.add_all([person, parent])
        app_session.flush()
        student = Student(
            studio_id=studio.id,
            person_id=person.id,
            status=status,
            health_status=health_status,
            joined_on=TODAY - timedelta(days=days_ago),
        )
        app_session.add(student)
        app_session.flush()
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
        return student

    return _make


# -- the ladder ----------------------------------------------------------------
@pytest.mark.parametrize("day", LADDER_DAYS)
def test_a_missing_declaration_is_chased_on_days_one_three_and_seven(
    tenant_session, a_family, day, audit_entries
):
    student = a_family(days_ago=day)
    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    tenant_session.commit()

    # Sent or refused, the ladder counts it either way -- and since M8 filled the seam in,
    # `health.declaration_missing` is transactional (§5.11) so it goes out regardless of
    # what this parent has switched off.
    assert tally.reminders + tally.undeliverable == 1
    entries = [e for e in audit_entries("student", student.id) if e.action == ACTION_REMINDER]
    assert len(entries) == 1


@pytest.mark.parametrize("day", [0, 2, 4, 5, 6, 8, 30])
def test_no_other_day_is_chased(tenant_session, a_family, day, audit_entries):
    """§5.5 names three days. A message on day two is one the club did not ask for, sent to a
    family who has just handed over a child."""
    student = a_family(days_ago=day)
    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    tenant_session.commit()

    assert tally.reminders + tally.undeliverable == 0
    assert [e for e in audit_entries("student", student.id) if e.action == ACTION_REMINDER] == []


def test_a_signed_student_is_never_chased(tenant_session, a_family):
    student = a_family(days_ago=3, health_status="signed")
    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    assert tally.reminders + tally.undeliverable == 0
    assert student.health_status == "signed"


def test_a_trial_signed_student_is_still_chased(tenant_session, a_family):
    """§5.5's gate is about the FULL declaration. A family who signed the short trial form still
    owes one, and they are the likeliest to convert — a ladder that skipped them would go quiet on
    exactly the students the club is trying to keep."""
    a_family(days_ago=3, health_status="trial_signed")
    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    assert tally.reminders + tally.undeliverable == 1


def test_a_departed_student_is_not_chased(tenant_session, a_family):
    """A club does not ask a family that has gone for a medical form."""
    a_family(days_ago=3, status="left")
    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    assert tally.reminders + tally.undeliverable == 0


def test_a_lead_is_not_chased(tenant_session, a_family):
    """§5.4a's `lead` has not joined anything. Chasing them for a health declaration is the club
    asking a stranger for their child's medical history."""
    a_family(days_ago=3, status="lead")
    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    assert tally.reminders + tally.undeliverable == 0


def test_every_guardian_is_chased_not_only_the_primary(
    tenant_session, app_session, studio, a_family
):
    """§5.3 — all guardians are equal. `is_primary` decides bill addressing and הוראת קבע
    matching, and a health reminder is neither."""
    student = a_family(days_ago=1)
    second = Person(studio_id=studio.id, first_name="הורה", last_name="שני")
    app_session.add(second)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=student.id,
            person_id=second.id,
            is_primary=False,
            relation="parent",
        )
    )
    app_session.commit()

    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    assert tally.reminders + tally.undeliverable == 2


def test_the_reminder_is_sent_and_the_count_is_reported_honestly(tenant_session, a_family):
    """**Updated by lane COMMS (M8), which filled W5's seam in.**

    This asserted `reminders == 0, undeliverable == 1` while `NotificationService.enqueue`
    raised. The rule it protects is unchanged — a run reporting '1 reminder sent' when none
    were is worse than one that says so — and the seam now sends, so the honest numbers are
    the other way round.

    §5.5's ladder is the one place this matters most: `health.declaration_missing` is
    transactional (§5.11), so it goes out even to a parent who has muted everything else.
    """
    a_family(days_ago=1)
    tally = Tally()
    chase_missing(tenant_session, at=T0, tally=tally)
    assert tally.reminders == 1
    assert tally.undeliverable == 0


def test_chasing_never_changes_a_students_ability_to_be_marked_present(
    tenant_session, a_family, app_session
):
    """§5.5 — nothing on the mat is ever blocked. There is no field this worker could set to
    block anything, and this asserts it does not invent one."""
    student = a_family(days_ago=1)
    before = (student.status, student.health_status)
    chase_missing(tenant_session, at=T0, tally=Tally())
    tenant_session.commit()
    app_session.expire_all()
    refreshed = app_session.get(Student, student.id)
    assert (refreshed.status, refreshed.health_status) == before


# -- renewal, only when asked for ---------------------------------------------
def _declare(app_session, studio, student, template_id, *, signed_days_ago: int):
    from datetime import datetime, time

    from app.core.clock import now as _now  # noqa: F401 -- documents the one-clock rule

    signed_on = TODAY - timedelta(days=signed_days_ago)
    row = HealthDeclaration(
        studio_id=studio.id,
        student_id=student.id,
        template_id=template_id,
        template_version=1,
        answers_encrypted={"asthma": False},
        derived_flags={"asthma": False},
        signed_by_person_id=student.person_id,
        signed_at=datetime.combine(signed_on, time(12, 0), tzinfo=T0.tzinfo),
    )
    app_session.add(row)
    app_session.commit()
    return row


def test_no_renewal_reminder_when_the_studio_never_set_a_validity(
    tenant_session, app_session, studio, a_family, a_full_template
):
    """§5.5 — `health_declaration_validity_months` defaults to null and declarations do not
    expire. A studio that never opted in gets nothing, on any day."""
    student = a_family(days_ago=400, health_status="signed")
    _declare(app_session, studio, student, a_full_template, signed_days_ago=400)

    tally = Tally()
    chase_renewals(tenant_session, tenant_session.get(Studio, studio.id), at=T0, tally=tally)
    assert tally.renewals + tally.undeliverable == 0


def test_a_renewal_reminder_when_the_studio_did_set_one(
    tenant_session, app_session, studio, a_family, a_full_template
):
    """12 months' validity, notice 30 days ahead: a declaration signed 12*30-30 = 330 days ago is
    the one due."""
    student = a_family(days_ago=400, health_status="signed")
    _declare(app_session, studio, student, a_full_template, signed_days_ago=330)
    row = app_session.get(Studio, studio.id)
    row.settings = dict(row.settings or {}, health_declaration_validity_months=12)
    app_session.commit()

    tally = Tally()
    tenant_session.expire_all()
    chase_renewals(tenant_session, tenant_session.get(Studio, studio.id), at=T0, tally=tally)
    assert tally.renewals + tally.undeliverable == 1


def test_valid_until_is_still_null_after_a_renewal_pass(
    tenant_session, app_session, studio, a_family, a_full_template
):
    """The rule the whole feature turns on. §5.5 makes the setting a reminder switch, not an
    expiry the row records — so even the code that acts on it writes nothing to `valid_until`."""
    student = a_family(days_ago=400, health_status="signed")
    declaration = _declare(app_session, studio, student, a_full_template, signed_days_ago=330)
    row = app_session.get(Studio, studio.id)
    row.settings = dict(row.settings or {}, health_declaration_validity_months=12)
    app_session.commit()

    tenant_session.expire_all()
    chase_renewals(tenant_session, tenant_session.get(Studio, studio.id), at=T0, tally=Tally())
    tenant_session.commit()
    app_session.expire_all()
    assert app_session.get(HealthDeclaration, declaration.id).valid_until is None


def test_a_nonsense_validity_setting_is_ignored_rather_than_crashing(
    tenant_session, app_session, studio, a_family, a_full_template
):
    """`settings` is JSONB, so anything can be in it. A daily job that raised on a typo would take
    every other studio's reminders down with it."""
    student = a_family(days_ago=400, health_status="signed")
    _declare(app_session, studio, student, a_full_template, signed_days_ago=330)
    row = app_session.get(Studio, studio.id)
    row.settings = dict(row.settings or {}, health_declaration_validity_months="twelve")
    app_session.commit()

    tally = Tally()
    tenant_session.expire_all()
    chase_renewals(tenant_session, tenant_session.get(Studio, studio.id), at=T0, tally=tally)
    assert tally.renewals + tally.undeliverable == 0


def test_the_worker_is_runnable_as_a_module():
    """A worker nothing can invoke is a feature that ships dead, and nothing in the suite would
    notice. `infra/railway/jobs.json` runs it exactly this way."""
    import app.workers.health_reminders as worker

    assert callable(worker.main)


def test_the_ladder_days_are_exactly_the_three_the_spec_names():
    assert LADDER_DAYS == (1, 3, 7)


def test_no_student_id_reaches_a_log_line(tenant_session, a_family, caplog):
    """G7 — §5.5's ladder is about children, and a log line naming one is a name in an aggregator
    the scrubber cannot un-see."""
    import logging

    student = a_family(days_ago=1)
    with caplog.at_level(logging.DEBUG):
        chase_missing(tenant_session, at=T0, tally=Tally())
    for record in caplog.records:
        assert str(student.id) not in record.getMessage()


def test_a_student_with_no_joining_date_falls_back_to_when_the_record_appeared(
    tenant_session, app_session, studio
):
    """§4.3 makes `joined_on` nullable, and §5.4a's funnel is full of students who have not joined
    yet. Counting from `created_at` is what stops the ladder going silent for exactly them."""
    from app.workers.health_reminders import _days_since_joining

    person = Person(studio_id=studio.id, first_name="ילד", last_name="ללא")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status="trial", health_status="missing"
    )
    app_session.add(student)
    app_session.commit()

    assert student.joined_on is None
    assert _days_since_joining(student, student.created_at.date() + timedelta(days=3)) == 3


def test_a_student_with_neither_date_is_skipped_rather_than_crashing(tenant_session):
    from app.workers.health_reminders import _days_since_joining

    class _Bare:
        joined_on: date | None = None
        created_at = None
        id = uuid.uuid4()

    assert _days_since_joining(_Bare(), TODAY) is None
