"""The half of the monitor that reaches somebody who is not looking at a screen.

**No monitoring vendor.** No Sentry, no Better Stack, no SDK, and nothing about this
product's data leaving for a third party to index. What it does need is something that can
put a message in a mailbox, and since 2026-09-13 that is an HTTPS call rather than
`smtplib` -- Railway blocks every outbound SMTP port, so the original "point it at Gmail
with an app password" was advice that could not work from production. The measurement and
the argument are in `app/services/comms/mail_transport.py`; the only vendor this now
implies is a mail relay, which handles subject lines and nothing else.

**Unconfigured is a state, not a silent default.** Without a transport or an
`ALERT_EMAIL_TO` nothing is sent and `email_configured()` answers False, which the platform
console renders as an explicit "email delivery is off". An alerting system nobody has
configured is worse than none, because it is believed.

**The message carries no person.** Job names, check ids, counts, timestamps and exception
CLASS names -- the same rule `app/models/ops.py` states for the rows this reads, and it
binds harder here because an email leaves the building and lands in an inbox that is
backed up, indexed and searched. §11.7 forbids health data and card details in a log; a
child's name in an alert email is the same failure with wider distribution.

**English, not Hebrew.** Every other string in this product is a parent's or a coach's and
goes through `@studio/i18n`. This one is the operator's, it is read in a mail client with
no locale to consult, and it is the only text in the codebase whose audience is one
person.
"""

from __future__ import annotations

import logging
from datetime import datetime

from app.core.config import settings
from app.services.comms.mail_transport import deliver, mail_configured
from app.services.ops.checks import JobHealth, Signal

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    """Whether an alert could actually be delivered.

    Both, because either one missing means nothing arrives: a transport with nowhere to
    send to is as silent as a recipient with no transport. Reported to the ops screen so
    "no alerts" can be distinguished from "no delivery" -- two states that look identical
    from an empty inbox and mean opposite things.
    """
    return bool(mail_configured() and settings.ALERT_EMAIL_TO)


def render(
    *, jobs: list[JobHealth], found: list[Signal], red_ids: list[str], at: datetime
) -> tuple[str, str]:
    """Subject and plain-text body. Deterministic, so it can be asserted on."""
    subject = f"[studio-manager/{settings.ENV}] {len(red_ids)} check(s) failing"

    lines = [
        f"{len(red_ids)} check(s) failing as of {at.isoformat()} in {settings.ENV}.",
        "",
    ]

    overdue = [job for job in jobs if job.overdue]
    failing = [job for job in jobs if job.failing]

    if overdue:
        lines.append("JOBS THAT HAVE NOT RUN (no successful run inside their tolerance):")
        for job in overdue:
            last = job.last_success_at.isoformat() if job.last_success_at else "never"
            lines.append(
                f"  - {job.name}: last success {last}; "
                f"schedule {job.schedule}; tolerance {job.max_silence_minutes}m"
            )
        lines.append("")

    if failing:
        lines.append("JOBS WHOSE LAST RUN FAILED:")
        for job in failing:
            lines.append(f"  - {job.name}: last run {job.last_run_at}")
        lines.append("")

    red_signals = [signal for signal in found if signal.status == "red"]
    if red_signals:
        lines.append("SIGNALS:")
        for signal in red_signals:
            lines.append(f"  - {signal.id}: {signal.value} (since {signal.since})")
        lines.append("")

    lines.append(
        "This message is generated from job_run and ops_event. It deliberately carries "
        "no names, no ids and no request paths -- open the platform console for detail."
    )
    return subject, "\n".join(lines)


def send(subject: str, body: str) -> bool:
    """Deliver one alert. Returns whether it went.

    **Over HTTPS, not SMTP** since 2026-09-13: Railway blocks every outbound SMTP port, so
    `smtplib` could never have delivered this from production whatever was configured.
    `app/services/comms/mail_transport.py` carries the measurement and the argument.

    A failure to send is logged and swallowed there. The caller is a scheduled job whose
    real work -- evaluating the checks -- has already succeeded, and a provider outage must
    not turn into a failed job that then alerts about itself.
    """
    if not email_configured():
        logger.info("alert not sent: email delivery is not configured")
        return False

    if not deliver(to=settings.ALERT_EMAIL_TO or "", subject=subject, body=body):
        return False

    logger.info("alert email sent", extra={"subject": subject})
    return True
