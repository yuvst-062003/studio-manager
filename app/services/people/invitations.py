"""§5.3's invitation, reaching the parent a second way -- and Task 9's two trial emails,
which reuse this module's transport rather than inventing a second one.

Decision 21: the copyable `?invite=` link (`app/routers/students.py`) is the channel that
always works, because it does not depend on a mailbox or a mail server anybody configured.
Email is a second channel, additive -- when it works it saves the manager from reading a
link off a screen out loud, and when it does not, `StudentCreateResult` says so and the
link is still the whole invitation.

**Deliberately parallel to `app/services/ops/alerts.py`, and deliberately a second copy
rather than a shared one.** That module's `send()` is `smtplib` behind `STARTTLS` on 587,
with the exact "unconfigured is a state, not a silent default" idea this module needs --
but its audience is the operator (English, no vendor, one recipient from Railway
variables) and this module's audience is a parent (Hebrew, per-guardian, an address that
came out of a form). Importing `alerts.send` and reshaping its message for a different
audience would couple two things that change for unrelated reasons; the duplication is
noted rather than resolved here because resolving it -- e.g. a shared `mailer` module --
is a change to `alerts.py`, which is outside this piece.

**Configured here means `SMTP_HOST` *and* `SMTP_PASSWORD`, not `alerts.email_configured`'s
`SMTP_HOST` and `ALERT_EMAIL_TO`.** `SMTP_PASSWORD` is the field unset on production today
(decision 21's whole reason for existing): a deployment with a host but no password cannot
authenticate, so calling that "configured" would tell the dashboard the email half works
when it cannot.

**Never logs the token or the URL.** The token is a bearer credential for a child's record
-- only its SHA-256 reaches `invitation.token_hash` -- and the URL carries the token in its
query string, so logging one is logging the other under a different name.

**`_send` is the one transport, shared by all three messages this module sends.** Task 9
pulled it out of what used to be `send_invitation_email`'s own body so the trial
confirmation and the trial follow-up do not each grow a second copy of the same
guard-compose-try-log shape. Behaviour is unchanged for the invitation email: same
`email_configured()` guard, same swallow-and-log on failure, same "no `extra`" rule below.
"""

from __future__ import annotations

import logging
import smtplib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from zoneinfo import ZoneInfo

from app.core.config import settings

logger = logging.getLogger(__name__)

#: G3 -- stored UTC, rendered Asia/Jerusalem. An email naming the wrong hour is worse than
#: no email at all, so every rendered time in this module goes through this zone.
JERUSALEM = ZoneInfo("Asia/Jerusalem")

#: Sunday-first, matching `app/services/people/group_days.py::studio_weekday`'s convention
#: (`(moment.astimezone(STUDIO_ZONE).weekday() + 1) % 7`) -- index 0 is Sunday.
_HEBREW_WEEKDAYS = ("ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת")


def _format_local(moment: datetime) -> str:
    """`יום ראשון, 06.09.2026 בשעה 17:00`, in Asia/Jerusalem."""
    local = moment.astimezone(JERUSALEM)
    weekday = _HEBREW_WEEKDAYS[(local.weekday() + 1) % 7]
    return f"יום {weekday}, {local.strftime('%d.%m.%Y')} בשעה {local.strftime('%H:%M')}"


def email_configured() -> bool:
    """Whether this deployment can actually deliver the invitation email.

    Both fields, because a host with no password cannot authenticate and a password with
    no host has nowhere to go -- either gap means nothing is delivered, and
    `StudentCreateResult.invitation_email_configured` exists so that state is visible on
    the dashboard rather than indistinguishable from "sent and nobody noticed".
    """
    return bool(settings.SMTP_HOST and settings.SMTP_PASSWORD)


def render(*, studio_name: str, invitation_url: str) -> tuple[str, str]:
    """Subject and plain-text body, in Hebrew.

    Deliberately parallel to `app/services/health/club_terms.py`'s reasoning for keeping
    text in Python: i18n is `web/packages/i18n`, a frontend package, and a server process
    sending mail cannot read a TypeScript module. Kept short on purpose -- the club's name,
    that a child was added for this guardian, and the link. Nothing else needs to be in an
    email a parent did not ask for.
    """
    subject = f"הזמנה מ{studio_name}"
    body = (
        f"שלום,\n"
        f"\n"
        f'נוסף/ה תלמיד/ה חדש/ה במועדון "{studio_name}", ואתם רשומים כהורה/אפוטרופוס.\n'
        f"להשלמת ההרשמה והצטרפות לאפליקציה, לחצו על הקישור:\n"
        f"{invitation_url}\n"
    )
    return subject, body


def _send(to_email: str, subject: str, body: str) -> bool:
    """The transport every sender in this module shares. Returns whether it actually
    went out.

    **A failure here must never fail whatever created the message.** By the time any
    caller reaches this function, everything email could touch is already committed --
    the student and the invitation token, or the trial booking -- so this is strictly
    additive, and an SMTP outage is caught and swallowed the same way
    `app/services/ops/alerts.py`'s `send()` swallows one, logged without the one thing
    that would let a reader of the log act on the message in flight (an invitation's
    token, live in its URL).

    **STARTTLS on 587 only** -- same reasoning as `alerts.py`: supporting implicit TLS on
    465 too means guessing which one a host wants from a port number, and a wrong guess
    sends the SMTP login in the clear.
    """
    if not email_configured():
        logger.info("email not sent: SMTP is not configured for this deployment")
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_USERNAME or settings.SMTP_HOST or ""
    message["To"] = to_email
    message.set_content(body)

    logger.info("email send attempted")
    try:
        with smtplib.SMTP(settings.SMTP_HOST or "", settings.SMTP_PORT, timeout=30) as smtp:
            smtp.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD.get_secret_value())
            smtp.send_message(message)
    except Exception:
        # `logger.exception` with no `extra`: the SMTP host is already in settings, and
        # the one thing that must not reach a log here -- a live token or URL -- is never
        # passed to the logger in the first place, so there is nothing an exception's
        # default repr could leak either.
        logger.exception("could not send an email")
        return False

    logger.info("email sent")
    return True


def send_invitation_email(*, to_email: str, studio_name: str, invitation_url: str) -> bool:
    """Deliver one invitation email. Returns whether it actually went out. See `_send`
    for the guard, the swallow-and-log and the STARTTLS reasoning -- all unchanged."""
    subject, body = render(studio_name=studio_name, invitation_url=invitation_url)
    return _send(to_email, subject, body)


@dataclass(frozen=True)
class TrialConfirmationLesson:
    """One booked child, for §2's confirmation email. A list of these rather than a
    single day/time: siblings in the same booking can land in different groups at
    different hours, and a single pair at the email level would be wrong for one of them
    -- the same reason `TrialBookingSelfResult.bookings` is a list, one per child."""

    student_display_name: str
    #: Aware, UTC or otherwise -- `_format_local` converts. Never naive: G3.
    starts_at: datetime
    #: `Location.address`, falling back to `Location.name`, `None` when the session
    #: carries no location at all. **Never invented** -- the line is omitted, never a
    #: placeholder, when this is `None`.
    address: str | None


def render_trial_confirmation(
    *, studio_name: str, lessons: Sequence[TrialConfirmationLesson]
) -> tuple[str, str]:
    """§2's booking-time confirmation: the day and time, where it is, what to bring.

    **Must not mention the app.** A stranger who has not yet had the lesson has no
    reason to install one -- the install prompt moves to `render_trial_followup`, once
    the lesson is behind them. Adding a link here "since it is useful" is exactly what
    §1.1 of the design argues against, so there is no URL parameter to this function at
    all -- nothing here can grow one by accident.
    """
    subject = f"אישור שיעור ניסיון ב{studio_name}"
    lines = [
        "שלום,",
        "",
        f'השיעור נקבע — מחכים לכם ב"{studio_name}":',
        "",
    ]
    for lesson in lessons:
        line = f"{lesson.student_display_name}: {_format_local(lesson.starts_at)}"
        if lesson.address:
            line += f" · {lesson.address}"
        lines.append(line)
    lines.extend(
        [
            "",
            "מה להביא: בגדי ספורט נוחים ובקבוק מים. אפשר להגיע כרבע שעה לפני תחילת השיעור.",
        ]
    )
    return subject, "\n".join(lines) + "\n"


def send_trial_confirmation_email(
    *, to_email: str, studio_name: str, lessons: Sequence[TrialConfirmationLesson]
) -> bool:
    """§2 -- sent from `book_trial_for_self` after the booking has committed. A failure
    here must not fail the booking; see `_send`."""
    subject, body = render_trial_confirmation(studio_name=studio_name, lessons=lessons)
    return _send(to_email, subject, body)


def render_trial_followup(
    *, studio_name: str, child_first_name: str, invitation_url: str
) -> tuple[str, str]:
    """§3's day-1 "איך היה?" email -- the one join link, for everybody, and the install
    prompt that moved here from the confirmation once the lesson was actually attended.

    **The same URL for a stranger and for a family who already has an account** (owner's
    decision, 2026-09-06) -- this function does not know or ask which one the recipient
    is, and it must not start branching on that here either.
    """
    subject = "איך היה השיעור?"
    body = (
        f"שלום,\n"
        f"\n"
        f'תודה שהגעתם לשיעור ניסיון ב"{studio_name}"! נשמח לשמוע איך היה ל{child_first_name}.\n'
        f"\n"
        f"אם בא לכם להמשיך, אפשר להצטרף ולעקוב אחרי הנוכחות, התשלומים והעדכונים דרך "
        f"האפליקציה של המועדון:\n"
        f"{invitation_url}\n"
    )
    return subject, body


def send_trial_followup_email(
    *, to_email: str, studio_name: str, child_first_name: str, invitation_url: str
) -> bool:
    """§3 -- sent once, on day 1, only when the child attended. See `_send` for the
    guard and the swallow-and-log; the worker never lets a failure here stop the pass."""
    subject, body = render_trial_followup(
        studio_name=studio_name, child_first_name=child_first_name, invitation_url=invitation_url
    )
    return _send(to_email, subject, body)
