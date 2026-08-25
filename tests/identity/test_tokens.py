"""SPEC 5.2 -- 'Backend issues its own short-lived access JWT (15 min) ... The JWT
carries identity_id, active_studio_id and a role snapshot.'

Time is driven explicitly rather than slept through. app.core.clock.now() is the only
clock in the application (19.5), and a token module that read the wall clock itself could
not be time-travelled by X-Dev-Now -- which is how a billing-run test would end up
debugging auth instead.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.services.identity.tokens import (
    AccessClaims,
    InvalidAccessTokenError,
    mint_access_token,
    verify_access_token,
)

#: 32 bytes. RFC 7518 §3.2 sets that as the floor for HS256, and PyJWT warns
#: below it -- a test key that models bad practice teaches it.
KEY = "test-signing-key-not-a-real-one!"
T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


def _claims(**overrides: object) -> AccessClaims:
    base: dict[str, object] = {
        "identity_id": uuid.uuid4(),
        "person_id": uuid.uuid4(),
        "active_studio_id": uuid.uuid4(),
        "acting_as_person_id": None,
        "roles": ("manager",),
        "is_developer": False,
        "studio_is_demo": False,
        "is_platform_admin": False,
        "issued_at": T0,
        "expires_at": T0 + timedelta(minutes=15),
    }
    return AccessClaims(**{**base, **overrides})  # type: ignore[arg-type]


def test_a_minted_token_round_trips_every_claim():
    claims = _claims(roles=("owner", "lead_coach"))
    assert verify_access_token(mint_access_token(claims, key=KEY), key=KEY, at=T0) == claims


def test_a_token_is_rejected_one_second_after_it_expires():
    """5.2's fifteen minutes are the whole reason 10.3 exists."""
    token = mint_access_token(_claims(), key=KEY)
    verify_access_token(token, key=KEY, at=T0 + timedelta(minutes=14, seconds=59))
    with pytest.raises(InvalidAccessTokenError):
        verify_access_token(token, key=KEY, at=T0 + timedelta(minutes=15, seconds=1))


def test_a_token_signed_with_another_key_is_rejected():
    token = mint_access_token(_claims(), key="a-different-key-also-32-bytes-long!!")
    with pytest.raises(InvalidAccessTokenError):
        verify_access_token(token, key=KEY, at=T0)


def test_an_unsigned_token_is_rejected():
    """alg=none is the oldest JWT attack there is. It works when a verifier trusts the
    header's own choice of algorithm, so this asserts we pass an explicit list."""
    import jwt

    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "dev": True, "iat": 0, "exp": 9999999999},
        key="",
        algorithm="none",
    )
    with pytest.raises(InvalidAccessTokenError):
        verify_access_token(forged, key=KEY, at=T0)


@pytest.mark.parametrize("junk", ["", "not-a-token", "a.b.c", "..", "Bearer x"])
def test_garbage_is_rejected_as_an_invalid_token_and_not_as_something_unrelated(junk):
    """The caller's only correct response to any of these is 401. A KeyError or a
    UnicodeDecodeError escaping from here would become a 500 instead."""
    with pytest.raises(InvalidAccessTokenError):
        verify_access_token(junk, key=KEY, at=T0)


def test_the_developer_flag_survives_the_round_trip():
    """Holdback 2's payload. 19.6's resolver reads this from request.state, and
    request.state reads it from here -- so it has to be a signed claim rather than
    something derived after verification, which could be derived wrongly."""
    claims = _claims(is_developer=True, studio_is_demo=True)
    verified = verify_access_token(mint_access_token(claims, key=KEY), key=KEY, at=T0)
    assert verified.is_developer is True
    assert verified.studio_is_demo is True


def test_acting_as_is_carried_so_the_api_resolves_permissions_from_that_person():
    """19.4 -- 'Switching sets acting_as_person_id on the session; the API resolves
    permissions from that Person exactly as it would for a real login.'"""
    person = uuid.uuid4()
    verified = verify_access_token(
        mint_access_token(_claims(acting_as_person_id=person), key=KEY), key=KEY, at=T0
    )
    assert verified.acting_as_person_id == person


def test_a_session_before_a_studio_is_resolved_still_mints():
    """6.1's refusal screens are reached by a SIGNED-IN user, not an anonymous one. An
    identity with no person and no studio anywhere must still get a token, or there is
    nobody to show 'אין לך גישה לאפליקציית הצוות' to."""
    claims = _claims(person_id=None, active_studio_id=None, roles=())
    verified = verify_access_token(mint_access_token(claims, key=KEY), key=KEY, at=T0)
    assert verified.person_id is None
    assert verified.active_studio_id is None
    assert verified.roles == ()


# There is deliberately no "this module never reads the wall clock" test here.
# tests/dev/test_clock.py::test_nothing_outside_the_clock_module_reads_the_wall_clock
# already scans every file in app/ for exactly that, and it reads the parse tree rather
# than the text -- a duplicate here would be a second, weaker copy of a gate that
# already covers this module, and the two would drift.
#
# The property this module DOES have to prove for itself is that it never lets a
# library read the wall clock on its behalf, which is what the expiry test above pins:
# PyJWT validates iat, nbf and exp against the real clock unless told not to, and the
# round-trip test caught that before it could reject a time-travelled session.
