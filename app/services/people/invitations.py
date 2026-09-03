"""§5.3's invitation, reaching the parent a second way.

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
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


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


def send_invitation_email(*, to_email: str, studio_name: str, invitation_url: str) -> bool:
    """Deliver one invitation email. Returns whether it actually went out.

    **A failure here must never fail student creation.** By the time a caller reaches this
    function the student, the guardian link and the invitation token are already
    committed, and the copyable link in `StudentCreateResult.invitation_url` already
    works -- this is strictly additive, so an SMTP outage is caught and swallowed the same
    way `app/services/ops/alerts.py`'s `send()` swallows one, and logged without the one
    thing that would let a reader of the log redeem the invitation.

    **STARTTLS on 587 only** -- same reasoning as `alerts.py`: supporting implicit TLS on
    465 too means guessing which one a host wants from a port number, and a wrong guess
    sends the SMTP login in the clear.
    """
    if not email_configured():
        logger.info("invitation email not sent: SMTP is not configured for this deployment")
        return False

    subject, body = render(studio_name=studio_name, invitation_url=invitation_url)
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_USERNAME or settings.SMTP_HOST or ""
    message["To"] = to_email
    message.set_content(body)

    logger.info("invitation email send attempted")
    try:
        with smtplib.SMTP(settings.SMTP_HOST or "", settings.SMTP_PORT, timeout=30) as smtp:
            smtp.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD.get_secret_value())
            smtp.send_message(message)
    except Exception:
        # `logger.exception` with no `extra`: the SMTP host is already in settings, and
        # the one thing that must not reach a log here -- the token, live in the URL this
        # message carries -- is never passed to the logger in the first place, so there is
        # nothing an exception's default repr could leak either.
        logger.exception("could not send the invitation email")
        return False

    logger.info("invitation email sent")
    return True
