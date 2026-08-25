"""SPEC §5.2 -- the access token this service issues and verifies itself.

HS256 rather than an asymmetric pair: one service mints these and the same service
verifies them, so a public key would have no second reader and the extra moving part
would buy nothing. If a second service ever needs to verify one, that is the moment to
move to RS256 -- not before.

**Time is a parameter, never a wall-clock read.** `app.core.clock.now()` is the only
clock in the application (§19.5), and a token module calling `datetime.now()` directly
could not be time-travelled by `X-Dev-Now` -- so every billing-run test would have to
sign in under real time. The router passes `now()`; the tests pass a literal.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import jwt

ALGORITHM = "HS256"


class InvalidAccessTokenError(Exception):
    """Expired, forged, malformed, or signed with a key we do not hold.

    Deliberately one exception and not five. The caller's only correct response to any of
    them is 401, and a taxonomy here would leak which of the five it was to whoever
    presented the token.
    """


@dataclass(frozen=True)
class AccessClaims:
    """§5.2 -- 'The JWT carries identity_id, active_studio_id and a role snapshot.'

    A snapshot, not a live read. §5.2 accepts the latency in as many words -- "Role
    changes take effect on the next refresh, at most 15 minutes later" -- and pays for
    the case that cannot wait (removing a coach) with a denylist checked on refresh
    rather than with a database round trip on every request.
    """

    identity_id: uuid.UUID
    #: The Person this identity is inside the active studio. None before a studio is
    #: resolved: §6.1's refusal screens are reached by a SIGNED-IN user, so an identity
    #: with no person anywhere still gets a token -- otherwise there is nobody to show
    #: "אין לך גישה לאפליקציית הצוות" to.
    person_id: uuid.UUID | None
    active_studio_id: uuid.UUID | None
    #: §19.4. Set only by POST /dev/act-as; None for every real login.
    acting_as_person_id: uuid.UUID | None
    roles: tuple[str, ...]
    #: §19.2's flag, carried as a verified claim. §19.6's resolver reads it from
    #: request.state, and request.state reads it from here.
    is_developer: bool
    #: §19.6 restriction 1's other input, resolved when the studio was resolved rather
    #: than re-read on every request.
    studio_is_demo: bool
    is_platform_admin: bool
    issued_at: datetime
    expires_at: datetime


def _uuid_or_none(raw: Any) -> uuid.UUID | None:
    return uuid.UUID(str(raw)) if raw else None


def mint_access_token(claims: AccessClaims, *, key: str) -> str:
    payload: dict[str, Any] = {
        "sub": str(claims.identity_id),
        "pid": str(claims.person_id) if claims.person_id else None,
        "sid": str(claims.active_studio_id) if claims.active_studio_id else None,
        "aap": str(claims.acting_as_person_id) if claims.acting_as_person_id else None,
        "roles": list(claims.roles),
        "dev": claims.is_developer,
        "demo": claims.studio_is_demo,
        "padm": claims.is_platform_admin,
        "iat": int(claims.issued_at.timestamp()),
        "exp": int(claims.expires_at.timestamp()),
    }
    return jwt.encode(payload, key, algorithm=ALGORITHM)


def verify_access_token(token: str, *, key: str, at: datetime) -> AccessClaims:
    try:
        payload = jwt.decode(
            token,
            key,
            # A list, and never `algorithms=None`. Trusting the header's own `alg` is
            # what makes alg=none and the HS256/RS256 confusion attack work.
            algorithms=[ALGORITHM],
            # EVERY time-based check is disabled here and re-done against `at` below.
            # Not just `exp`: PyJWT also validates `iat` and `nbf`, and it validates all
            # three against the real wall clock, which is precisely what this module's
            # docstring says must not happen. Leaving `verify_iat` on meant a token
            # minted under a shifted clock was rejected as "not yet valid" by a library
            # that had never heard of X-Dev-Now -- found by the round-trip test, which
            # drives `at` explicitly for exactly this reason.
            options={"verify_exp": False, "verify_iat": False, "verify_nbf": False},
        )
        expires_at = datetime.fromtimestamp(payload["exp"], tz=UTC)
        issued_at = datetime.fromtimestamp(payload["iat"], tz=UTC)
        identity_id = uuid.UUID(payload["sub"])
        person_id = _uuid_or_none(payload.get("pid"))
        active_studio_id = _uuid_or_none(payload.get("sid"))
        acting_as_person_id = _uuid_or_none(payload.get("aap"))
    except jwt.PyJWTError as exc:
        raise InvalidAccessTokenError(str(exc)) from exc
    except (KeyError, TypeError, ValueError, OverflowError, OSError) as exc:
        # A token this service signed always carries these claims in these shapes, so
        # reaching here means the payload was not one -- which is the same answer as a
        # bad signature. Caught rather than allowed to escape, because a KeyError out of
        # a verifier becomes a 500 where a 401 belongs.
        raise InvalidAccessTokenError(f"malformed claims: {exc}") from exc

    if at >= expires_at:
        raise InvalidAccessTokenError("expired")

    return AccessClaims(
        identity_id=identity_id,
        person_id=person_id,
        active_studio_id=active_studio_id,
        acting_as_person_id=acting_as_person_id,
        roles=tuple(payload.get("roles") or ()),
        is_developer=bool(payload.get("dev", False)),
        studio_is_demo=bool(payload.get("demo", False)),
        is_platform_admin=bool(payload.get("padm", False)),
        issued_at=issued_at,
        expires_at=expires_at,
    )
