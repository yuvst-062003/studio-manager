"""§5.11's job: what goes out on a schedule, and what turns a queued push into a sent one.

Two passes in one daily run, for the same reason `app/workers/health_reminders.py` has two:
they key off the same tables and the same clock, and two cron entries would be two chances
for one to be forgotten.

  1. **Scheduled announcements.** §5.11 -- "publishes a title and body, optionally scheduled."
     A `scheduled_for` in the past with `published_at` still null is a message the club meant
     to send and nothing has sent.
  2. **The push drain.** `enqueue` records `queued`; this is what makes it `sent` or `failed`
     and writes the `provider_message_id` a support conversation is traced through.

**A run that sent nothing must not look like a run that sent everything.** Every count is
reported, and a failure is a WARNING rather than a silent zero -- the same rule the other
three workers already follow.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.tenancy import use_studio
from app.models.comms import Announcement, NotificationDelivery
from app.services.comms import NotificationService
from app.services.comms.push import PushSendError
from app.workers import notify
from sqlalchemy import select
from tests.comms.conftest import T0


class _Refusing:
    """A provider that errors. §5.11's `failed` -- distinct from `no_token` and `denied`
    because a retry might work."""

    def send(self, *, token: str, title: str, body: str, payload: dict) -> str:
        raise PushSendError("UNAVAILABLE")


def _draft(session, studio, author, *, scheduled_for, title="ביטול שיעור"):
    """A studio-wide announcement waiting for its moment.

    `author_person_id` is non-null in the schema -- §5.11's announcements are published BY
    somebody, and a message from nobody is one no parent can ask about.
    """
    row = Announcement(
        studio_id=studio.id,
        author_person_id=author.person_id,
        title=title,
        body="השיעור היום מבוטל",
        scope_type="studio",
        scope_id=None,
        scheduled_for=scheduled_for,
    )
    session.add(row)
    session.commit()
    return row


# -- pass 1: scheduled announcements ------------------------------------------
def test_an_announcement_fires_once_its_moment_arrives(
    tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    a_guardian_for(an_enrolled_student)
    _draft(tenant_session, studio, as_manager, scheduled_for=T0 - timedelta(minutes=1))

    tally = notify.Tally()
    notify.publish_due(tenant_session, at=T0, tally=tally)
    tenant_session.expire_all()

    assert tally.published == 1
    assert tally.fanned_out == 1
    published = tenant_session.execute(select(Announcement)).scalars().all()
    assert [row.published_at is not None for row in published] == [True]


def test_an_announcement_scheduled_for_later_is_left_alone(
    tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """The control. A job that published everything with a `scheduled_for` would send
    tomorrow's message today, which is worse than not sending it at all."""
    a_guardian_for(an_enrolled_student)
    row = _draft(tenant_session, studio, as_manager, scheduled_for=T0 + timedelta(days=1))

    tally = notify.Tally()
    notify.publish_due(tenant_session, at=T0, tally=tally)
    tenant_session.expire_all()

    assert tally.published == 0
    assert tenant_session.get(Announcement, row.id).published_at is None


def test_a_draft_with_no_schedule_is_never_published_by_the_job(
    tenant_session, studio, as_manager
) -> None:
    """`scheduled_for IS NULL` is a draft somebody is still writing. §5.11 makes scheduling
    opt-in, so a job that swept every unpublished row would send half-finished messages."""
    row = _draft(tenant_session, studio, as_manager, scheduled_for=None)

    tally = notify.Tally()
    notify.publish_due(tenant_session, at=T0, tally=tally)
    tenant_session.expire_all()

    assert tally.published == 0
    assert tenant_session.get(Announcement, row.id).published_at is None


def test_running_twice_publishes_once(
    tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """A cron that overlaps itself is the ordinary case, not an edge one. `published_at` is
    the guard -- the same guard the manual publish path uses."""
    a_guardian_for(an_enrolled_student)
    _draft(tenant_session, studio, as_manager, scheduled_for=T0 - timedelta(minutes=1))

    notify.publish_due(tenant_session, at=T0, tally=notify.Tally())
    second = notify.Tally()
    notify.publish_due(tenant_session, at=T0, tally=second)
    assert second.published == 0


def test_a_deleted_announcement_is_never_published(
    tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student
) -> None:
    """G15's soft delete has to mean something to the job as well as to the list. A manager
    who scheduled a message and then deleted it has decided not to send it."""
    a_guardian_for(an_enrolled_student)
    row = _draft(tenant_session, studio, as_manager, scheduled_for=T0 - timedelta(minutes=1))
    row.deleted_at = T0
    tenant_session.commit()

    tally = notify.Tally()
    notify.publish_due(tenant_session, at=T0, tally=tally)
    assert tally.published == 0


def test_a_run_with_nothing_due_reports_zero_rather_than_failing(tenant_session) -> None:
    tally = notify.Tally()
    notify.publish_due(tenant_session, at=T0, tally=tally)
    assert (tally.published, tally.fanned_out) == (0, 0)


# -- pass 2: the push drain ---------------------------------------------------
def test_the_drain_flips_queued_to_sent_and_records_the_provider_id(
    tenant_session, studio, as_manager, a_push_token
) -> None:
    """`provider_message_id` is what a support conversation is traced through when a parent
    insists nothing arrived."""
    a_push_token(as_manager.person_id)
    with use_studio(studio.id):
        note = NotificationService(tenant_session).enqueue(
            as_manager.person_id, "belt.awarded", "t", "b", {}
        )
    tenant_session.commit()

    tally = notify.Tally()
    notify.drain_queued(tenant_session, at=T0, tally=tally)
    tenant_session.expire_all()

    row = _push(tenant_session, note.id)
    assert tally.pushed == 1
    assert row.status == "sent"
    assert row.provider_message_id
    assert row.sent_at == T0


def test_a_provider_error_becomes_failed_with_its_reason(
    tenant_session, studio, as_manager, a_push_token
) -> None:
    """`error` is the provider's, never the message. §18.3 puts notification payloads in the
    "never" column and the body belongs there with them."""
    a_push_token(as_manager.person_id)
    with use_studio(studio.id):
        note = NotificationService(tenant_session).enqueue(
            as_manager.person_id, "belt.awarded", "כותרת סודית", "גוף סודי", {}
        )
    tenant_session.commit()

    tally = notify.Tally()
    notify.drain_queued(tenant_session, at=T0, tally=tally, sender=_Refusing())
    tenant_session.expire_all()

    row = _push(tenant_session, note.id)
    assert tally.push_failed == 1
    assert row.status == "failed"
    assert "UNAVAILABLE" in (row.error or "")
    assert "סודי" not in (row.error or "")


def test_the_drain_refuses_during_quiet_hours(
    tenant_session, studio, as_manager, a_push_token
) -> None:
    """§13.11 -- quiet hours protected only 4 of 17 paths, because they were checked inside
    `ReminderService._send` rather than at the seam every push actually passes through. This
    is that seam: the debt ladder, health chases, cancellations and scheduled announcements
    all drain here, so gating it once is what makes every kind inherit the same window,
    without changing what `enqueue` writes -- the inbox row already exists; only whether a
    phone buzzes moves."""
    a_push_token(as_manager.person_id)
    with use_studio(studio.id):
        note = NotificationService(tenant_session).enqueue(
            as_manager.person_id, "belt.awarded", "t", "b", {}
        )
    tenant_session.commit()

    quiet = datetime(2026, 11, 12, 19, 30, tzinfo=UTC)  # 21:30 Jerusalem
    tally = notify.Tally()
    notify.drain_queued(tenant_session, at=quiet, tally=tally)
    tenant_session.expire_all()

    assert tally.pushed == 0
    assert _push(tenant_session, note.id).status == "queued"


def test_the_drain_sends_once_quiet_hours_end(
    tenant_session, studio, as_manager, a_push_token
) -> None:
    """The control: the same queued row, drained the next time the job runs after 08:00,
    goes out normally. Quiet hours delay a push -- they do not lose it."""
    a_push_token(as_manager.person_id)
    with use_studio(studio.id):
        note = NotificationService(tenant_session).enqueue(
            as_manager.person_id, "belt.awarded", "t", "b", {}
        )
    tenant_session.commit()

    quiet = datetime(2026, 11, 12, 19, 30, tzinfo=UTC)  # 21:30 Jerusalem
    notify.drain_queued(tenant_session, at=quiet, tally=notify.Tally())
    tenant_session.expire_all()
    assert _push(tenant_session, note.id).status == "queued"

    morning = datetime(2026, 11, 12, 6, 30, tzinfo=UTC)  # 08:30 Jerusalem
    tally = notify.Tally()
    notify.drain_queued(tenant_session, at=morning, tally=tally)
    tenant_session.expire_all()

    assert tally.pushed == 1
    assert _push(tenant_session, note.id).status == "sent"


def test_an_announcement_still_publishes_during_quiet_hours_only_its_push_waits(
    tenant_session, studio, as_manager, a_guardian_for, an_enrolled_student, a_push_token
) -> None:
    """§13.11's sharpest example: a manager can schedule an announcement for 03:00 and
    nothing gated it. Publishing on the scheduled moment is what the manager asked for and
    still happens; only the doorbell -- the push -- waits for morning."""
    parent = a_guardian_for(an_enrolled_student)
    a_push_token(parent)
    night = datetime(2026, 11, 12, 1, 0, tzinfo=UTC)  # 03:00 Jerusalem
    _draft(tenant_session, studio, as_manager, scheduled_for=night - timedelta(minutes=1))

    tally = notify.Tally()
    notify.publish_due(tenant_session, at=night, tally=tally)
    notify.drain_queued(tenant_session, at=night, tally=tally)
    tenant_session.expire_all()

    assert tally.published == 1
    assert tally.pushed == 0
    rows = list(
        tenant_session.execute(
            select(NotificationDelivery).where(NotificationDelivery.channel == "push")
        ).scalars()
    )
    assert [row.status for row in rows] == ["queued"]


def test_the_drain_leaves_no_token_and_denied_alone(tenant_session, studio, as_manager) -> None:
    """Neither is queued, and neither is something a drain can act on. A job that "retried"
    them would rewrite the delivery report's reasons into `failed` and destroy the only
    signal telling the office which conversation to have."""
    with use_studio(studio.id):
        note = NotificationService(tenant_session).enqueue(
            as_manager.person_id, "belt.awarded", "t", "b", {}
        )
    tenant_session.commit()
    assert _push(tenant_session, note.id).status == "no_token"

    notify.drain_queued(tenant_session, at=T0, tally=notify.Tally())
    tenant_session.expire_all()
    assert _push(tenant_session, note.id).status == "no_token"


def test_the_inbox_delivery_is_never_touched_by_the_push_drain(
    tenant_session, studio, as_manager, a_push_token
) -> None:
    """The inbox was delivered the moment it was written -- no permission, no transport. A
    drain that swept every channel would move a delivered row back into flight."""
    a_push_token(as_manager.person_id)
    with use_studio(studio.id):
        note = NotificationService(tenant_session).enqueue(
            as_manager.person_id, "belt.awarded", "t", "b", {}
        )
    tenant_session.commit()

    notify.drain_queued(tenant_session, at=T0, tally=notify.Tally())
    tenant_session.expire_all()
    inapp = tenant_session.execute(
        select(NotificationDelivery).where(
            NotificationDelivery.notification_id == note.id,
            NotificationDelivery.channel == "inapp",
        )
    ).scalar_one()
    assert inapp.status == "delivered"


def _push(session, notification_id):
    return session.execute(
        select(NotificationDelivery).where(
            NotificationDelivery.notification_id == notification_id,
            NotificationDelivery.channel == "push",
        )
    ).scalar_one()


# -- the shape every worker in this repo shares -------------------------------
def test_the_worker_walks_studios_without_the_escape_hatch() -> None:
    """A plain unscoped `Session` lists the studios, then one `use_studio` scope per studio
    does the work -- the shape `followups.py`, `health_reminders.py` and `billing.py` all
    use. `with_all_tenants` would put this file in front of §19.7's demo-hygiene detector,
    whose registry lives in `app/core/demo.py` and belongs to `core`; and the loop is
    stricter rather than looser, since every read inside it runs through the tenant filter.
    """
    import ast
    import inspect

    source = inspect.getsource(notify)
    names = {node.attr for node in ast.walk(ast.parse(source)) if isinstance(node, ast.Attribute)}
    names |= {node.id for node in ast.walk(ast.parse(source)) if isinstance(node, ast.Name)}
    assert "with_all_tenants" not in names
    assert "use_studio" in names


def test_the_job_is_declared_so_it_actually_runs() -> None:
    """A worker nothing invokes is a feature that ships dead. `tests/config` checks that
    declared jobs point at real modules; this checks the other direction for the one job this
    lane adds."""
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    jobs = json.loads((root / "infra/railway/jobs.json").read_text(encoding="utf-8"))["jobs"]
    job = next(j for j in jobs if j["name"] == "comms-notify")
    assert job["command"] == "python -m app.workers.notify"


def test_the_tally_reports_every_pass() -> None:
    """A run that sent nothing must not read like a run that sent everything. Same rule the
    other three workers follow, and the reason each of them counts refusals."""
    tally = notify.Tally()
    assert (tally.published, tally.fanned_out, tally.pushed, tally.push_failed) == (0, 0, 0, 0)


def test_the_job_names_the_push_transport_it_used() -> None:
    """§2.8/§13.2 -- a notify run that "sends" pushes to nobody must not read as a green
    heartbeat. `app/services/ops/checks.py` tells a real send apart from
    `RecordingPushSender` by reading this off the job's own detail, so a run that omits it
    is a run the check cannot watch."""
    from app.services.comms.push import RecordingPushSender, WebPushSender

    recording_counts = notify._tally_counts(notify.Tally(), RecordingPushSender())
    assert recording_counts["push_transport"] == "recording"

    webpush_counts = notify._tally_counts(
        notify.Tally(), WebPushSender(private_key="x", subject="mailto:ops@example.invalid")
    )
    assert webpush_counts["push_transport"] == "webpush"
