"""The one way mail leaves this product, and why it is not SMTP.

**Railway blocks outbound SMTP.** Measured from inside the production api container on
2026-09-13, not inferred: ports 25, 465, 587 and 2525 all time out, against
`smtp.gmail.com`, `smtp.sendgrid.net` and `smtp.fastmail.com` alike, while HTTPS to
`api.resend.com:443` connects immediately. Hosts block those ports to stop spam and this
one is no exception. So `smtplib` cannot work here at any price -- no credential, no
provider and no port changes that.

That is worth stating plainly because the previous shape looked like a configuration
problem for months. `SMTP_HOST`, `SMTP_PORT` and `SMTP_USERNAME` were all set on
production and only `SMTP_PASSWORD` was missing, so every reading of the ops screen said
"one secret away". It was not one secret away; it was on the wrong transport.

**And filling that secret in made things worse, which is the shape of the trap.** Both
`app/services/people/invitations.py` and `app/routers/trial_bookings.py` send INSIDE the
request that creates a student or books a trial, with a 30-second socket timeout. The
moment `email_configured()` went true, adding a student and the public trial-booking form
each hung for thirty seconds before silently giving up. A transport that cannot connect is
not a slow transport; it is a broken one, and the guard below is what keeps the product
honest about that.

**HTTPS to a provider's API instead.** One POST, no ports anybody blocks, no `smtplib`.
`httpx` rather than a new dependency -- `app/services/identity/providers.py` already
speaks it for the OAuth exchanges.

**Unconfigured is a state, not a silent default.** `mail_configured()` is false until both
the key and the sender exist, and every caller checks it first and skips rather than
attempting. That is what `StudentCreateResult.invitation_email_configured` reports to the
dashboard, so "nobody was emailed" never looks like "emailed and ignored".

**§18.3.** Nothing here logs a recipient, a subject, a body, or an invitation URL. An
invitation token lives in the URL it is sent in, so logging one is logging the other under
a different name.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

#: Resend's send endpoint. A constant rather than a setting: swapping providers is a code
#: change with a different payload shape, not a URL somebody can repoint at runtime.
_ENDPOINT = "https://api.resend.com/emails"

#: Long enough for an ordinary API call, short enough that the two callers which send
#: inside a request (a student creation, a trial booking) never hang a person's browser on
#: it. The thirty-second `smtplib` default is exactly what made a blocked transport feel
#: like a broken app.
_TIMEOUT = httpx.Timeout(10.0)


def mail_configured() -> bool:
    """Whether this deployment can actually deliver mail.

    Both halves, because either one missing means nothing arrives: the key authenticates,
    and `MAIL_FROM` must be an address the provider has verified -- a provider refuses an
    unverified sender at send time, which is a failure nobody sees until a real message is
    dropped.
    """
    return bool(settings.RESEND_API_KEY and settings.MAIL_FROM)


def deliver(*, to: str, subject: str, body: str) -> bool:
    """Send one plain-text message. Returns whether the provider accepted it.

    **Accepted, not delivered.** A 200 here means the provider took responsibility for the
    message, exactly as `RecordingPushSender`'s distinction in `app/services/comms/push.py`
    -- what happens between the provider and the recipient's mailbox is not visible from
    this process and must not be reported as if it were.

    Never raises. Every caller is either a scheduled job whose real work already succeeded
    or a request whose real work is already committed, and neither should fail because a
    third party had a bad minute.
    """
    if not mail_configured():
        logger.info("email not sent: no mail transport is configured for this deployment")
        return False

    try:
        response = httpx.post(
            _ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY.get_secret_value()}"
                if settings.RESEND_API_KEY
                else "",
                "Content-Type": "application/json",
            },
            json={"from": settings.MAIL_FROM, "to": [to], "subject": subject, "text": body},
            timeout=_TIMEOUT,
        )
    except Exception:
        # `logger.exception` with no `extra`: the recipient, the subject and the body are
        # all in the "never logged" column, and none of them is passed to the logger, so
        # an exception's default repr has nothing of them to leak either.
        logger.exception("the mail provider could not be reached")
        return False

    if response.status_code >= 400:
        # The STATUS only. A provider's error body echoes the request it refused, which
        # for an invitation is a live token in a URL.
        logger.warning(
            "the mail provider refused a message", extra={"status": response.status_code}
        )
        return False

    logger.info("email accepted by the provider")
    return True
