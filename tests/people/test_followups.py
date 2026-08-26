"""§5.4a ④'s ladder, ⑤'s sweep, ②'s reminder, and §5.4's freeze expiry.

The negative tests are the interesting ones. Every message here goes to somebody deciding
whether to trust this club with their child, so the failure mode that matters is not "a
message did not go out" -- it is "a message went out that should not have".
"""

from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest
from app.models.people import StudentFreeze, TrialBooking
from app.services.people.status import StudentStatusService
from app.services.people.students import StudentService
from app.workers import followups
from tests.people.conftest import T0, TODAY, make_session


@pytest.fixture
def sent(monkeypatch):
    """Capture what the ladder would send, instead of letting W5's seam refuse.

    The seam raising `NotImplementedError` is the real state of the world until lane COMMS
    lands, and `test_the_worker_survives_the_comms_seam_refusing` asserts that path. Every
    other test needs to see WHICH messages the ladder chose, which is what this records.
    """
    calls: list[dict] = []

    def _fake(person_id, kind, title, body, payload):
        calls.append({"person_id": person_id, "kind": kind, "title": title, "payload": payload})
        return True

    monkeypatch.setattr(
        followups,
        "_notify",
        lambda person_id, kind, title, body, payload: _fake(person_id, kind, title, body, payload),
    )
    return calls


def _trial_student(session, *, status: str = "trial"):
    tag = uuid.uuid4().hex[:8]
    student = StudentService.create(
        session,
        first_name=f"נועה{tag}",
        last_name=f"לוי{tag}",
        birthdate=None,
        guardian_first_name=f"הורה{tag}",
        guardian_last_name=f"לוי{tag}",
        guardian_email=f"g-{tag}@example.invalid",
        guardian_phone=None,
        at=T0,
        actor_person_id=None,
    ).student
    if status != "lead":
        StudentStatusService.transition(session, student=student, to_status=status, at=T0)
    return student


def _booking(
    session, student, group_id, *, attended=None, booked_at=T0, outcome="pending", session_id=None
):
    row = TrialBooking(
        student_id=student.id,
        group_id=group_id,
        session_id=session_id,
        booked_at=booked_at,
        attended=attended,
        outcome=outcome,
        is_override=False,
    )
    session.add(row)
    session.flush()
    return row


# -- §5.4a ②: the reminder -----------------------------------------------------


def test_a_reminder_goes_out_twenty_four_hours_before(
    tenant_session, studio, a_group, a_training_year, sent
):
    """§5.4a ② -- 'Parent reminder 24h ahead.'"""
    lesson = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 + timedelta(hours=24),
    )
    tenant_session.add(lesson)
    tenant_session.flush()
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, session_id=lesson.id)
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert [call["kind"] for call in sent] == ["trial.reminder"]


def test_no_reminder_a_week_out(tenant_session, studio, a_group, a_training_year, sent):
    """The control. A reminder that fires every day until the lesson is not a reminder."""
    lesson = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 + timedelta(days=7),
    )
    tenant_session.add(lesson)
    tenant_session.flush()
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, session_id=lesson.id)
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert sent == []


def test_every_guardian_is_reminded_not_only_the_primary(
    tenant_session, studio, a_group, a_training_year, sent
):
    """§5.3 -- all guardians are equal. L8: `is_primary` decides bill addressing and הוראת
    קבע matching, and a reminder is neither of those."""
    lesson = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 + timedelta(hours=24),
    )
    tenant_session.add(lesson)
    tenant_session.flush()
    student = _trial_student(tenant_session)
    tag = uuid.uuid4().hex[:8]
    StudentService.add_guardian(
        tenant_session,
        student_id=student.id,
        first_name=f"אבא{tag}",
        last_name=f"לוי{tag}",
        email=f"d-{tag}@example.invalid",
        phone=None,
        relation="parent",
        is_primary=False,
        at=T0,
        actor_person_id=None,
    )
    _booking(tenant_session, student, a_group, session_id=lesson.id)
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert len(sent) == 2


# -- §5.4a ④: the ladder -------------------------------------------------------


def test_a_trial_that_has_not_happened_yet_gets_no_follow_up(tenant_session, a_group, sent):
    """`attended IS NULL` is 'the lesson has not happened yet', which is completely
    different from 'they did not turn up'. Asking 'איך היה?' before the lesson is the single
    most obvious way to look automated."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=None, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert [call for call in sent if call["kind"].startswith("trial.follow")] == []


@pytest.mark.parametrize(
    ("day", "expected"),
    [(1, True), (2, False), (3, True), (5, False), (7, True), (8, False)],
)
def test_the_ladder_fires_on_day_one_three_and_seven_and_not_in_between(
    tenant_session, a_group, sent, day, expected
):
    """Exactly the three days §5.4a names. A message on day two is one the club did not ask
    for, sent to somebody deciding whether to trust them."""
    student = _trial_student(tenant_session)
    _booking(
        tenant_session,
        student,
        a_group,
        attended=True,
        booked_at=T0 - timedelta(days=day),
    )
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    fired = [call for call in sent if call["kind"] == "trial.followup"]
    assert bool(fired) is expected


def test_a_converted_student_is_never_followed_up(tenant_session, a_group, sent):
    """Asking somebody who already joined how their trial went is the club telling them
    nobody is paying attention."""
    student = _trial_student(tenant_session)
    _booking(
        tenant_session,
        student,
        a_group,
        attended=True,
        booked_at=T0 - timedelta(days=1),
        outcome="converted",
    )
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert sent == []


def test_a_no_show_gets_a_different_message_from_an_attender(tenant_session, a_group, sent):
    """`attended = False`. 'איך היה?' to somebody who did not come is worse than silence."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=False, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert [call["kind"] for call in sent] == ["trial.no_show"]


# -- §5.4a ⑤: the sweep --------------------------------------------------------


def test_after_the_window_the_lead_is_marked_lost_with_a_reason(tenant_session, a_group, sent):
    """§5.4a ⑤ -- 'No conversion after N days -> status=lost, with a reason.' `lost` is a
    real outcome, and it is what makes the funnel's denominator honest."""
    from app.models.people import StudentStatusHistory
    from sqlalchemy import select

    student = _trial_student(tenant_session)
    booking = _booking(
        tenant_session,
        student,
        a_group,
        attended=True,
        booked_at=T0 - timedelta(days=followups.LOST_AFTER_DAYS + 1),
    )
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    tenant_session.commit()

    assert student.status == "lost"
    assert booking.outcome == "lost"
    row = tenant_session.execute(
        select(StudentStatusHistory).where(
            StudentStatusHistory.student_id == student.id,
            StudentStatusHistory.to_status == "lost",
        )
    ).scalar_one()
    assert str(followups.LOST_AFTER_DAYS) in (row.reason or "")
    # Nobody decided; time passed. Attributing this to whoever configured the cron would
    # make the audit trail lie about who decided.
    assert row.changed_by_person_id is None


def test_a_lead_inside_the_window_is_left_alone(tenant_session, a_group, sent):
    """The control. §5.4a calls 7-14 days the decisive window, so writing somebody off on
    day eight is the club giving up during the exact period it is meant to be trying."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=8))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert student.status == "trial"


# -- §5.4's freeze expiry ------------------------------------------------------


def test_a_freeze_that_ran_out_is_expired_by_the_same_run(tenant_session, a_group, sent):
    """§7 has no unfreeze endpoint and §5.4 gives the freeze a return date. Without this the
    student is frozen forever and the parent reads 'מוקפא' in April."""
    student = _trial_student(tenant_session, status="active")
    tenant_session.add(
        StudentFreeze(
            student_id=student.id,
            from_date=date(2026, 8, 1),
            to_date=TODAY - timedelta(days=1),
        )
    )
    StudentStatusService.transition(tenant_session, student=student, to_status="frozen", at=T0)
    tenant_session.commit()

    tally = followups.Tally()
    followups.run_for_studio(tenant_session, at=T0, tally=tally)
    tenant_session.commit()

    assert student.status == "active"
    assert tally.freezes_expired == 1


# -- the seams and the wiring --------------------------------------------------


def test_the_worker_survives_the_comms_seam_refusing(
    tenant_session, studio, a_group, a_training_year
):
    """W5's seam raises until lane COMMS lands. The state changes -- the lost sweep and the
    freeze expiry -- must still run, and the refusals must be counted rather than swallowed:
    a run reporting "3 reminders sent" when none were is worse than one that says so."""
    lesson = make_session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=a_training_year,
        starts_at=T0 + timedelta(hours=24),
    )
    tenant_session.add(lesson)
    tenant_session.flush()
    reminded = _trial_student(tenant_session)
    _booking(tenant_session, reminded, a_group, session_id=lesson.id)

    stale = _trial_student(tenant_session)
    _booking(
        tenant_session,
        stale,
        a_group,
        attended=True,
        booked_at=T0 - timedelta(days=followups.LOST_AFTER_DAYS + 1),
    )
    tenant_session.commit()

    tally = followups.Tally()
    followups.run_for_studio(tenant_session, at=T0, tally=tally)
    tenant_session.commit()

    assert tally.undeliverable >= 1
    assert tally.reminders == 0
    # The part that does not depend on comms still happened.
    assert tally.marked_lost == 1
    assert stale.status == "lost"


def test_the_worker_notifies_through_the_comms_seam_and_never_writes_a_notification_row():
    """W5's seam. §5.11's rule is that every message goes to BOTH levels -- push is the
    doorbell, the inbox is where it lives -- so a caller that inserted a `notification` row
    itself would produce an inbox entry with no push and no delivery report, reopening the
    silent-failure gap §5.11 exists to close."""
    import ast
    import inspect

    source = inspect.getsource(followups)
    tree = ast.parse(source)
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)} | {
        node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)
    }
    assert "Notification" not in names
    assert "NotificationService" in names


def test_the_job_is_declared_so_it_actually_runs():
    """A worker nothing invokes is a feature that ships dead. `tests/config` checks that
    declared jobs point at real modules; this checks the other direction for the one job
    this lane adds."""
    root = Path(__file__).resolve().parents[2]
    jobs = json.loads((root / "infra/railway/jobs.json").read_text(encoding="utf-8"))["jobs"]
    job = next(j for j in jobs if j["name"] == "people-followups")
    assert job["command"] == "python -m app.workers.followups"
    assert job["spec"].startswith("SPEC §5.4a")
    assert job["environment"] == "production"


def test_the_worker_reads_the_only_clock():
    """§19.5 -- `app.core.clock.now()` is the only clock, and a test fails the build on any
    other `datetime.now()` in app/. `run_for_studio` takes `at` so `X-Dev-Now` and the tests
    can both drive the ladder without waiting a fortnight."""
    import inspect

    assert "at" in inspect.signature(followups.run_for_studio).parameters


def test_the_worker_never_names_a_child_in_its_logs(tenant_session, a_group, sent, caplog):
    """§11.7 and G7. The ladder is about children, and a log line naming one is a name in an
    aggregator the scrubber cannot un-see."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    with caplog.at_level("DEBUG"):
        followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    # The fixture names every child נועה<tag>; the worker's own log line reports counts.
    assert "נועה" not in caplog.text
