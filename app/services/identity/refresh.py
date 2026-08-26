"""SPEC §5.2's refresh half.

Three mechanisms, and each answers a different attack:

* **Rotation** -- every use mints a successor and marks the presented row used. A
  long-lived bearer token that is never rotated is a 30-day credential; a rotated one is
  a credential whose theft becomes *detectable*.
* **Reuse detection** -- presenting a row already marked used means two parties hold the
  same secret. Exactly one of them is legitimate and this server cannot tell which, so
  the whole family dies. Logging the victim out is the correct outcome; a shared session
  nobody is told about is not.
* **The denylist** -- a per-identity watermark, not a list of tokens. Removing a coach
  writes one row and every device they hold dies on its next refresh, including devices
  this server has never issued a token to. A token issued *after* the watermark is
  unaffected, so re-granting the role later needs no database edit.

The secret is never stored. `token_hash` is SHA-256 of the presented string, so a
database read yields nothing usable (§11.7). SHA-256 and not a password hash: this is a
256-bit random secret with no guessable structure, so there is nothing for a slow KDF to
slow down.

**Time is a parameter here too**, for the same reason it is in `tokens.py`: §19.5's
`X-Dev-Now` has to be able to reach a 30-day expiry, or testing the far edge of a session
means waiting a month.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.identity import AuthRevocation, RefreshToken

#: 32 bytes, urlsafe-base64'd. The cookie carries this and nothing else.
_SECRET_BYTES = 32

#: §11.7's cookie. Named here rather than in the router because §19.4's role switcher
#: needs them too, and a router importing another router is a dependency neither wants.
#: The attributes are set by `set_refresh_cookie` below -- one place, beside the names it
#: has to stay consistent with -- so no route can weaken them.
REFRESH_COOKIE_NAME = "studio_refresh"
#: Scoped to the one endpoint that reads it. Sending it on every API call would widen the
#: CSRF surface for no benefit.
REFRESH_COOKIE_PATH = "/api/v1/auth"


def set_refresh_cookie(response: Response, secret: str) -> None:
    """§11.7 -- 'secure/httpOnly/SameSite cookies for the refresh token', plus
    infra/railway/README.md's fourth requirement: host-only.

    **There is no `domain=` here and there must never be one.** That is not an omission.
    A Domain attribute would make a staging session valid against production, and it is
    also the first thing someone reaches for when the cookie stops flowing on Railway's
    generated subdomains -- where it would not help anyway, because Domain cannot cross a
    public suffix. The fix for that is the domain (HB-domain), not this line.

    Lives here rather than in app/routers/identity.py, where it began, because §19.4's
    sign-in-as route establishes a session too. Two routes setting this cookie means two
    places these attributes could drift apart, and `secure`/`httponly` are exactly the
    pair that gets quietly dropped by whoever is debugging why a cookie will not stick.

    **`Secure` is dropped in development, and only there.** Safari refuses a `Secure`
    cookie over plain `http://` and grants no localhost exemption -- Chrome and Firefox
    do, which is why this survived until someone opened the local dashboard in Safari and
    got the language picker back: the cookie was set, silently discarded, and
    `/auth/refresh` answered 401. Local development is served over http, so there `Secure`
    does not protect a session, it prevents there being one -- in the browser that matters
    most for a product whose §6.5 install story is iPhone-first.

    The condition is the ENVIRONMENT and not the request's scheme, deliberately. Behind
    Railway's proxy the scheme a request appears to arrive on depends on
    `X-Forwarded-Proto` being trusted, so keying on it would let one proxy
    misconfiguration silently unset `Secure` in production -- the failure mode you cannot
    see. An explicit environment check fails loudly instead, in
    tests/identity/test_refresh_cookie.py, which pins both halves.
    """
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=secret,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.ENV != "development",
        samesite="lax",
    )


class RefreshRejectedError(Exception):
    """Every rejection the refresh endpoint can produce.

    ``reason`` exists for this server's own logs and for tests. The endpoint returns 401
    with no detail in every case: telling a caller *why* their token failed tells an
    attacker whether the token existed at all.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class IssuedRefresh:
    #: Returned to the caller once, put in the cookie, and never stored.
    secret: str
    row: RefreshToken


def hash_refresh_secret(secret: str) -> str:
    """SHA-256 of a presented secret, which is all `refresh_token.token_hash` ever holds.

    Public because §19.4's role switcher has to find the caller's refresh row to write the
    persona onto it. A second implementation of this one line elsewhere would be a second
    place for the hash to change.
    """
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _denylisted(session: Session, identity_id: uuid.UUID, issued_at: datetime) -> bool:
    watermark = session.execute(
        select(AuthRevocation.sessions_issued_before)
        .where(AuthRevocation.auth_identity_id == identity_id)
        .order_by(AuthRevocation.sessions_issued_before.desc())
        .limit(1)
    ).scalar_one_or_none()
    return watermark is not None and issued_at < watermark


def issue_refresh_token(
    session: Session,
    *,
    identity_id: uuid.UUID,
    active_studio_id: uuid.UUID | None,
    acting_as_person_id: uuid.UUID | None,
    at: datetime,
    family_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
) -> IssuedRefresh:
    """Mint a token. A new ``family_id`` starts a new session; passing one continues it.

    ``created_at`` is set explicitly rather than left to the column's server default,
    because the denylist compares against it -- a row stamped by the database clock could
    not be time-travelled and the watermark comparison would silently use real time.
    """
    secret = secrets.token_urlsafe(_SECRET_BYTES)
    row = RefreshToken(
        auth_identity_id=identity_id,
        family_id=family_id or uuid.uuid4(),
        token_hash=hash_refresh_secret(secret),
        parent_id=parent_id,
        active_studio_id=active_studio_id,
        acting_as_person_id=acting_as_person_id,
        expires_at=at + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        created_at=at,
    )
    session.add(row)
    session.flush()
    return IssuedRefresh(secret=secret, row=row)


def revoke_family(
    session: Session, family_id: uuid.UUID, *, at: datetime, reason: str
) -> list[uuid.UUID]:
    """Kill every live link in one chain. Returns the ids that were live.

    ``RETURNING`` rather than ``rowcount``: SQLAlchemy types ``Session.execute`` as
    ``Result[Any]``, which has no ``rowcount`` at the type level even though the runtime
    object does -- so a count would need a cast that asserts something mypy cannot check.
    The ids are also strictly more useful than a number when this ends up in an audit
    entry.

    ``reason`` is not stored on the row: there is nowhere on `refresh_token` to put it,
    and §11.2's audit log is where a decision like this belongs. It stays a required
    argument so the call site says which of the two callers this is without the reader
    having to look up the stack.
    """
    return list(
        session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=at)
            .returning(RefreshToken.id)
        )
        .scalars()
        .all()
    )


def revoke_sessions_for_identity(
    session: Session, identity_id: uuid.UUID, *, at: datetime, reason: str
) -> None:
    """§5.2's denylist. One row per revocation event, consulted on every refresh."""
    session.add(
        AuthRevocation(
            auth_identity_id=identity_id,
            sessions_issued_before=at,
            reason=reason,
            created_at=at,
        )
    )
    session.flush()


def rotate_refresh_token(session: Session, *, presented: str, at: datetime) -> IssuedRefresh:
    row = session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_secret(presented))
    ).scalar_one_or_none()

    if row is None:
        raise RefreshRejectedError("unknown")
    if row.revoked_at is not None:
        raise RefreshRejectedError("revoked")
    if row.used_at is not None:
        # Two parties hold this secret and we cannot tell which is legitimate, so both
        # lose it. Checked BEFORE expiry on purpose: a replayed token that has also aged
        # out is still evidence of theft, and reporting it as merely "expired" would
        # throw that evidence away and leave the family alive.
        revoke_family(session, row.family_id, at=at, reason="refresh_token_reuse")
        raise RefreshRejectedError("reuse")
    if at >= row.expires_at:
        raise RefreshRejectedError("expired")
    if _denylisted(session, row.auth_identity_id, row.created_at):
        revoke_family(session, row.family_id, at=at, reason="denylisted")
        raise RefreshRejectedError("denylisted")

    row.used_at = at
    return issue_refresh_token(
        session,
        identity_id=row.auth_identity_id,
        active_studio_id=row.active_studio_id,
        acting_as_person_id=row.acting_as_person_id,
        at=at,
        family_id=row.family_id,
        parent_id=row.id,
    )
