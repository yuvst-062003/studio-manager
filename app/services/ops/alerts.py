"""The half of the monitor that reaches somebody who is not looking at a screen.

**stdlib `smtplib`, and no vendor.** No Sentry, no Better Stack, no SDK, no account, no
bill, and nothing about this product's data leaving for a third party to index. The cost
is that this speaks SMTP and nothing else: point it at Gmail with an app password, at
Fastmail, at whatever host already sends your mail.

**Unconfigured is a state, not a silent default.** With no `SMTP_HOST` or `ALERT_EMAIL_TO`
nothing is sent and `email_configured()` answers False, which the platform console
renders as an explicit "email delivery is off". An alerting system nobody has configured
is worse than none, because it is believed.

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
import smtplib
from datetime import datetime
from email.message import EmailMessage

from app.core.config import settings
from app.services.ops.checks import JobHealth, Signal

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    """Whether an alert could actually be delivered.

    All three, because any one missing means nothing arrives. Reported to the ops screen
    so "no alerts" can be distinguished from "no delivery" -- two states that look
    identical from an empty inbox and mean opposite things.
    """
    return bool(settings.SMTP_HOST and settings.ALERT_EMAIL_TO)


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

    **STARTTLS on 587 only.** Implicit TLS on 465 is not supported and the omission is
    deliberate rather than an oversight: supporting both means choosing between them from
    a port number, and a wrong guess sends credentials in the clear. If a host needs 465,
    that is a change to make on purpose.

    A failure to send is logged and swallowed. The caller is a scheduled job whose real
    work -- evaluating the checks -- has already succeeded, and an SMTP outage must not
    turn into a failed job that then alerts about itself.
    """
    if not email_configured():
        logger.info("alert not sent: email delivery is not configured")
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.ALERT_EMAIL_FROM or settings.ALERT_EMAIL_TO or ""
    message["To"] = settings.ALERT_EMAIL_TO or ""
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST or "", settings.SMTP_PORT, timeout=30) as smtp:
            smtp.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD.get_secret_value())
            smtp.send_message(message)
    except Exception:
        # `logger.exception` and no `extra`: the SMTP host is in settings, and the one
        # thing that must not reach a log here is the password, which is a SecretStr and
        # would repr as `**********` anyway -- belt and braces.
        logger.exception("could not send the alert email")
        return False

    logger.info("alert email sent", extra={"subject": subject})
    return True
