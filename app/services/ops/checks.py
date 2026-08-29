"""What "is this deployment healthy" decomposes into, and how each part is measured.

Three classes of check, in the order they were asked for:

  a. the API erroring   -- unhandled exceptions, counted by app/main.py's handler
  b. a job failing OR SILENTLY NOT RUNNING -- the one with history behind it
  c. business signals   -- a billing run that created nothing, a payment provider that
                           stopped calling

(b) is the reason this module exists at all. Four workers were scheduled nowhere for a
whole milestone and nothing noticed, and no error hook could have noticed: a job that
never runs raises nothing. So the measurement is `last SUCCESSFUL run`, compared against
a tolerance the job itself declares -- not an error count.

**The business signals are derived, never stored.** "Zero charges" is read from
`billing_run` and "uPay went quiet" from `upay_ipn_record`, because a signal computed
from the real table cannot drift from it. The alternative -- a worker writing
`ops_event('billing.zero_charges')` -- adds a second place for the truth to live and a
new way for the monitor to be wrong while looking right.

**Everything returned is machine-readable.** Ids, counts and timestamps; not one
user-facing string. The dashboard renders Hebrew from `@studio/i18n` like every other
screen (G4), and the alert email renders English from `app/services/ops/alerts.py`. An
API that returned display copy would have to pick a language for a reader it cannot see.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.demo import exclude_demo_studios
from app.core.jobs import declared_jobs
from app.core.tenancy import with_all_tenants
from app.models.billing import BillingRun, UpayIpnRecord
from app.models.ops import JobRun, OpsEvent

#: Why this module reads across every studio. It is the platform operator's own view,
#: which §18.1 puts above every tenant -- the same reason app/routers/platform.py and
#: scripts/bootstrap-owner.py give for their own hatches. Every query below also applies
#: `exclude_demo_studios`: §19.7 keeps the demo studio out of cross-studio NUMBERS, and a
#: nightly-reset fixture club would otherwise drive both business signals on its own.
_SCOPE = "SPEC 18.1 -- the platform operator's health view, which sits above every studio"

#: An unhandled exception older than this is history, not an alert. A day, so that a
#: burst overnight is still on the screen when somebody opens it in the morning.
EXCEPTION_WINDOW = timedelta(hours=24)

#: How far back a zero-charge billing run still counts. §5.10 runs monthly per studio on
#: its own configured day, so a week is wide enough to catch the run that mattered and
#: narrow enough that last season's is not still red.
ZERO_CHARGE_WINDOW = timedelta(days=7)

#: Statuses a `job_run` row may hold, mirrored from app/models/ops.py.
SUCCEEDED = "succeeded"

#: The `environment` value meaning "wherever this app runs". See `job_health`.
ANY_ENVIRONMENT = "all"


@dataclass(frozen=True)
class JobHealth:
    """One declared job, and whether its silence has gone on too long."""

    name: str
    schedule: str
    environment: str
    max_silence_minutes: int
    last_run_at: datetime | None
    last_success_at: datetime | None
    last_status: str | None
    #: Only ever true for a job this environment actually schedules -- see
    #: `scheduled_here`. A production job read on staging is not overdue, it is somebody
    #: else's, and reporting seven permanent reds is how a screen teaches an operator to
    #: ignore it.
    overdue: bool
    failing: bool
    scheduled_here: bool


@dataclass(frozen=True)
class Signal:
    """A business or API signal. `status` is 'ok', 'red' or 'unknown'.

    'unknown' is a real answer and not a soft 'ok': a fresh environment that has never
    received a uPay callback has not lost the payment provider, and calling that red
    would train the reader to dismiss the one time it means something.
    """

    id: str
    status: str
    value: int | None
    since: datetime | None


def last_success_at(session: Session, job_name: str) -> datetime | None:
    """When this job last WORKED.

    Successes only. A job failing every hour is running perfectly well as far as a
    liveness check is concerned, and that reading is exactly what lets a broken job look
    healthy -- so the failure is reported separately (`JobHealth.failing`) rather than
    counted as a heartbeat.
    """
    return session.execute(
        select(func.max(JobRun.started_at)).where(
            JobRun.job_name == job_name, JobRun.status == SUCCEEDED
        )
    ).scalar_one_or_none()


def _latest_run(session: Session, job_name: str) -> JobRun | None:
    return (
        session.execute(
            select(JobRun)
            .where(JobRun.job_name == job_name)
            .order_by(JobRun.started_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )


def job_health(session: Session, *, at: datetime) -> list[JobHealth]:
    """Every declared job, measured against the tolerance it declares.

    A job with NO successful run ever is overdue from the moment it is declared, not
    exempt until its first success. That is deliberate and it is the whole feature: the
    four workers that shipped dead had never run once, and a check that waits for a
    baseline before it will complain is a check that never complains about them.
    """
    out: list[JobHealth] = []
    for job in declared_jobs():
        # `all` is the one environment value that is not an environment. Only `ops-check`
        # uses it, and its `why` in jobs.json carries the argument: a monitor that exists
        # in one environment and not another is the same defect it was built to catch.
        scheduled_here = job.environment in (settings.ENV, ANY_ENVIRONMENT)
        latest = _latest_run(session, job.name)
        success = last_success_at(session, job.name)
        silent_since = success or (at - timedelta(minutes=job.max_silence_minutes + 1))
        out.append(
            JobHealth(
                name=job.name,
                schedule=job.schedule,
                environment=job.environment,
                max_silence_minutes=job.max_silence_minutes,
                last_run_at=latest.started_at if latest else None,
                last_success_at=success,
                last_status=latest.status if latest else None,
                overdue=(
                    scheduled_here
                    and at - silent_since > timedelta(minutes=job.max_silence_minutes)
                ),
                failing=bool(latest is not None and latest.status == "failed"),
                scheduled_here=scheduled_here,
            )
        )
    return out


def _unhandled_exceptions(session: Session, *, at: datetime) -> Signal:
    since = at - EXCEPTION_WINDOW
    count = (
        session.execute(
            select(func.count())
            .select_from(OpsEvent)
            .where(OpsEvent.kind == "api.unhandled_exception", OpsEvent.at >= since)
        ).scalar_one()
        or 0
    )
    return Signal(
        id="api.unhandled_exceptions",
        status="red" if count else "ok",
        value=count,
        since=since,
    )


def _zero_charge_billing_run(session: Session, *, at: datetime) -> Signal:
    """§5.10's monthly run that produced nothing.

    A completed run with `charges_created = 0` is the failure this signal exists for: it
    finishes, reports success, writes its row, and bills nobody. Nothing else in the
    product treats that as an error, because arithmetically it is not one.
    """
    since = at - ZERO_CHARGE_WINDOW
    with with_all_tenants(reason=_SCOPE):
        stmt = (
            select(func.count())
            .select_from(BillingRun)
            .where(
                BillingRun.status == "completed",
                BillingRun.charges_created == 0,
                BillingRun.finished_at >= since,
            )
        )
        count = session.execute(exclude_demo_studios(stmt, BillingRun.studio_id)).scalar_one() or 0
    return Signal(
        id="billing.zero_charge_run",
        status="red" if count else "ok",
        value=count,
        since=since,
    )


def _upay_callback_silence(session: Session, *, at: datetime) -> Signal:
    """When uPay last called back.

    'unknown' rather than 'red' when there has never been one. A club that has taken no
    online payment yet has not lost its payment provider, and this product has exactly
    one live studio -- an alert that fires on an environment's first quiet week is an
    alert that gets muted before it is ever right.
    """
    with with_all_tenants(reason=_SCOPE):
        stmt = select(func.max(UpayIpnRecord.received_at))
        last = session.execute(
            exclude_demo_studios(stmt, UpayIpnRecord.studio_id)
        ).scalar_one_or_none()
    if last is None:
        return Signal(id="upay.callback_silence", status="unknown", value=None, since=None)
    silent_hours = int((at - last).total_seconds() // 3600)
    return Signal(
        id="upay.callback_silence",
        status="red" if silent_hours >= settings.UPAY_CALLBACK_SILENCE_HOURS else "ok",
        value=silent_hours,
        since=last,
    )


def signals(session: Session, *, at: datetime) -> list[Signal]:
    return [
        _unhandled_exceptions(session, at=at),
        _zero_charge_billing_run(session, at=at),
        _upay_callback_silence(session, at=at),
    ]


def red_check_ids(jobs: list[JobHealth], found: list[Signal]) -> list[str]:
    """Every check currently failing, as stable ids.

    The alert worker compares this set between passes: an alert fires when the set GROWS,
    not on every pass, so a job that stays broken over a weekend is one email rather than
    two hundred and eighty-eight. `unknown` is never red -- see `Signal`.
    """
    ids = [f"job.{job.name}" for job in jobs if job.overdue or job.failing]
    ids += [signal.id for signal in found if signal.status == "red"]
    return sorted(ids)


def record_unhandled_exception(
    session: Session, *, at: datetime, error_type: str, route: str | None
) -> None:
    """Called by app/main.py's handler. Records the CLASS and the route TEMPLATE only.

    A populated path is an id, and an id plus a timestamp is a person -- so
    `/api/v1/students/{student_id}` is recorded and the request's actual URL is not.
    """
    session.add(
        OpsEvent(
            kind="api.unhandled_exception",
            at=at,
            detail={"error_type": error_type, "route": route},
        )
    )


def last_alert_ids(session: Session) -> list[str]:
    """The red set as of the last alert that was actually sent."""
    row = (
        session.execute(
            select(OpsEvent)
            .where(OpsEvent.kind == "alert.sent")
            .order_by(OpsEvent.at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if row is None or not row.detail:
        return []
    return list(row.detail.get("red", []))


def record_alert_sent(session: Session, *, at: datetime, ids: list[str]) -> uuid.UUID:
    row = OpsEvent(kind="alert.sent", at=at, detail={"red": ids})
    session.add(row)
    session.flush()
    return row.id
