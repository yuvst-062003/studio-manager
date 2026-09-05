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
from app.models.person import Invitation
from app.services.people.status import StudentStatusService
from app.services.people.students import INVITATION_TTL_DAYS, StudentService
from app.workers import followups
from sqlalchemy import delete, select
from tests.people.conftest import T0, TODAY, make_session

#: Distinguishes "the caller did not pass a guardian email" from "the caller explicitly
#: wants no email" -- both would otherwise collapse onto the same `None`.
_UNSET = object()


@pytest.fixture
def sent(monkeypatch):
    """Capture what the ladder chose to send, without going through the real fan-out.

    Lane COMMS (M8) filled W5's seam in, so the unfaked path now writes rows rather than
    refusing -- `test_the_reminder_goes_out_and_the_state_changes_happen_regardless`
    exercises that end to end. Every other test here needs to see WHICH messages the ladder
    chose, and asserting that against the database would be testing M8's fan-out from M3's
    directory.
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


@pytest.fixture
def sent_emails(monkeypatch):
    """Task 9 -- what the day-1 join invitation chose to email, without touching SMTP.
    The transport itself (`_send`, `email_configured`, the SMTP swallow-and-log) is
    `app/services/people/invitations.py`'s own module, covered in
    `tests/people/test_trials.py`; this fixture is only about the WORKER's wiring --
    whether it calls the sender at all, and with what."""
    calls: list[dict] = []

    def _fake(*, to_email, studio_name, child_first_name, invitation_url):
        calls.append(
            {
                "to_email": to_email,
                "studio_name": studio_name,
                "child_first_name": child_first_name,
                "invitation_url": invitation_url,
            }
        )
        return True

    monkeypatch.setattr(followups, "send_trial_followup_email", _fake)
    return calls


def _trial_student(session, *, status: str = "trial", guardian_email=_UNSET, guardian_phone=None):
    tag = uuid.uuid4().hex[:8]
    email = f"g-{tag}@example.invalid" if guardian_email is _UNSET else guardian_email
    student = StudentService.create(
        session,
        first_name=f"נועה{tag}",
        last_name=f"לוי{tag}",
        birthdate=None,
        guardian_first_name=f"הורה{tag}",
        guardian_last_name=f"לוי{tag}",
        guardian_email=email,
        guardian_phone=guardian_phone,
        at=T0,
        actor_person_id=None,
    ).student
    # `StudentService.create` mints a manager-facing invitation the moment it creates a
    # new, unmatched guardian -- a side effect this fixture's callers never asked for,
    # and one a REAL trial booking (`TrialService.book_for_self`) never produces at all.
    # Cleared here so Task 9's own tests can assert on the invitation THEY mint, rather
    # than tripping over this helper's setup noise.
    session.execute(delete(Invitation).where(Invitation.student_id == student.id))
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


def test_the_follow_up_carries_a_route_to_the_join_screen(tenant_session, a_group, sent):
    """'איך היה?' has been sent on days 1, 3 and 7 since M3 with no link and no action --
    the product asking a family whether they enjoyed themselves, three times, and offering
    them no way to answer. The payload is what makes the inbox row pressable."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert [call["kind"] for call in sent] == ["trial.followup"]
    assert sent[0]["payload"]["route"] == followups.JOIN_ROUTE


def test_a_no_show_is_offered_no_join_action(tenant_session, a_group, sent):
    """`trial.no_show` is untouched, and deliberately: the worker already sends that family
    a different message on the stated ground that 'איך היה?' to somebody who did not come is
    worse than silence. Offering them a join button is the same mistake with money attached.
    """
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=False, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    assert [call["kind"] for call in sent] == ["trial.no_show"]
    assert "route" not in sent[0]["payload"]


# -- Task 9: the day-1 join invitation and its once-only email -----------------


def test_day_one_attended_mints_one_invitation_and_attempts_one_email(
    tenant_session, a_group, sent, sent_emails
):
    """Task 9 §3 -- attended, day 1: one `Invitation` bound to the student, and one email
    carrying `/?invite=`."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    tenant_session.commit()

    invitation = tenant_session.execute(
        select(Invitation).where(Invitation.student_id == student.id)
    ).scalar_one()
    assert invitation.intended_role == "guardian"

    assert len(sent_emails) == 1
    assert "/?invite=" in sent_emails[0]["invitation_url"]
    # The in-app ladder is unchanged alongside it.
    assert [call["kind"] for call in sent] == ["trial.followup"]


def test_day_one_no_show_mints_no_invitation_and_sends_no_email(
    tenant_session, a_group, sent, sent_emails
):
    """Task 9 §3 -- 'The gentler message that already exists, with no join link and no
    token.' The in-app notification still goes -- only the email and the mint are
    withheld."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=False, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    tenant_session.commit()

    assert (
        tenant_session.execute(
            select(Invitation).where(Invitation.student_id == student.id)
        ).first()
        is None
    )
    assert sent_emails == []
    assert [call["kind"] for call in sent] == ["trial.no_show"]


@pytest.mark.parametrize("day", [3, 7])
def test_days_three_and_seven_send_no_second_email(tenant_session, a_group, sent, sent_emails, day):
    """Task 9 §3 -- 'The email goes ONCE, on day 1 only.' Days 3 and 7 keep sending the
    in-app message the ladder always has; neither attempts a second email."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=day))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())

    assert sent_emails == []
    assert [call["kind"] for call in sent] == ["trial.followup"]


def test_running_the_worker_twice_on_day_one_mints_exactly_one_invitation(
    tenant_session, a_group, sent, sent_emails
):
    """Task 9 §3 -- 'The worker runs daily and must not mint a second token on a re-run,
    or after an operator replays a day.' A bearer credential for a child's record is not
    something to hand out twice."""
    student = _trial_student(tenant_session)
    _booking(tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    tenant_session.commit()
    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    tenant_session.commit()

    invitations = list(
        tenant_session.execute(
            select(Invitation).where(Invitation.student_id == student.id)
        ).scalars()
    )
    assert len(invitations) == 1
    assert len(sent_emails) == 1


def test_the_minted_token_outlives_the_write_off_window(tenant_session, a_group, sent, sent_emails):
    """Task 9 §3 -- 'the token already outlives the write-off... assert that relationship
    in a test rather than trusting two constants in two files to stay in order.' Computed
    from the actual constants and the actual rows, not hard-coded 30 and 21."""
    student = _trial_student(tenant_session)
    booking = _booking(
        tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=1)
    )
    tenant_session.commit()

    followups.run_for_studio(tenant_session, at=T0, tally=followups.Tally())
    tenant_session.commit()

    invitation = tenant_session.execute(
        select(Invitation).where(Invitation.student_id == student.id)
    ).scalar_one()
    # A family returning on day LOST_AFTER_DAYS must still land on a live link.
    assert invitation.expires_at > booking.booked_at + timedelta(days=followups.LOST_AFTER_DAYS)
    # And the relationship the docstring names, spelled out: minted on day 1, so the
    # token's own TTL alone already clears the write-off window with room to spare.
    assert INVITATION_TTL_DAYS > followups.LOST_AFTER_DAYS - 1


def test_a_guardian_with_no_email_skips_the_email_but_completes_the_pass(
    tenant_session, a_group, sent, sent_emails
):
    """Task 9 §3 -- 'Skip the email, count it, and carry on... Do not fail the pass.' The
    in-app notification still goes."""
    student = _trial_student(tenant_session, guardian_email=None, guardian_phone="0501112222")
    _booking(tenant_session, student, a_group, attended=True, booked_at=T0 - timedelta(days=1))
    tenant_session.commit()

    tally = followups.Tally()
    followups.run_for_studio(tenant_session, at=T0, tally=tally)
    tenant_session.commit()

    assert sent_emails == []
    assert tally.followup_emails_skipped == 1
    assert tally.followup_emails_sent == 0
    assert [call["kind"] for call in sent] == ["trial.followup"]


# -- §5.4a ⑤: the sweep --------------------------------------------------------


def test_after_the_window_the_lead_is_marked_lost_with_a_reason(tenant_session, a_group, sent):
    """§5.4a ⑤ -- 'No conversion after N days -> status=lost, with a reason.' `lost` is a
    real outcome, and it is what makes the funnel's denominator honest."""
    from app.models.people import StudentStatusHistory

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


def test_the_reminder_goes_out_and_the_state_changes_happen_regardless(
    tenant_session, studio, a_group, a_training_year
):
    """**Updated by lane COMMS (M8), which filled W5's seam in.**

    This asserted `tally.undeliverable >= 1` and `tally.reminders == 0` while
    `NotificationService.enqueue` raised. The property being protected was never the refusal
    -- it was that the state changes which do NOT depend on comms happen either way, and that
    the counters do not lie about what was sent. Both still hold, with the numbers the other
    way round.
    """
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

    assert tally.undeliverable == 0
    assert tally.reminders >= 1
    # The part that does not depend on comms still happened -- which is what this test was
    # really about, both before the seam landed and now.
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
