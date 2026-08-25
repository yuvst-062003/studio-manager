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

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.identity import AuthRevocation, RefreshToken

#: 32 bytes, urlsafe-base64'd. The cookie carries this and nothing else.
_SECRET_BYTES = 32

#: §11.7's cookie. Named here rather than in the router because §19.4's role switcher
#: needs them too, and a router importing another router is a dependency neither wants.
#: The attributes themselves are set in one place -- app/routers/identity.py's
#: `_set_refresh_cookie` -- so no route can weaken them.
REFRESH_COOKIE_NAME = "studio_refresh"
#: Scoped to the one endpoint that reads it. Sending it on every API call would widen the
#: CSRF surface for no benefit.
REFRESH_COOKIE_PATH = "/api/v1/auth"


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
