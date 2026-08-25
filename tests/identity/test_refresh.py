"""SPEC 5.2 -- 'a rotating refresh token (30 days, one-time-use, reuse detection revokes
the family of tokens)' and 'Revocations (removing a coach) are written to a small denylist
checked on refresh.'

The reuse case is the one worth writing carefully. An attacker who steals a refresh token
and uses it wins exactly once: the legitimate client's next rotation presents a token
already marked used, and that is the signal. Killing the whole family logs the victim out
too, and that is the correct outcome -- a silently shared session is worse than an
interrupted one.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from app.models.identity import AuthIdentity, RefreshToken
from app.services.identity.refresh import (
    RefreshRejectedError,
    issue_refresh_token,
    revoke_sessions_for_identity,
    rotate_refresh_token,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


@pytest.fixture
def identity(app_session: Session) -> Iterator[AuthIdentity]:
    row = AuthIdentity(
        provider="google",
        provider_subject=f"sub-{uuid.uuid4()}",
        email=f"{uuid.uuid4().hex[:8]}@example.invalid",
    )
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def test_the_secret_is_never_stored(app_session, identity):
    """11.7. A database read must not yield a usable session."""
    issued = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    app_session.commit()
    assert issued.secret not in issued.row.token_hash
    assert len(issued.row.token_hash) == 64  # sha256 hex


def test_a_rotation_returns_a_new_secret_in_the_same_family(app_session, identity):
    first = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    app_session.commit()
    second = rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(days=1))
    app_session.commit()
    assert second.secret != first.secret
    assert second.row.family_id == first.row.family_id
    assert second.row.parent_id == first.row.id


def test_a_rotation_carries_the_session_shape_forward(app_session, identity):
    """The active studio and the acting-as persona live on the refresh row, so a
    rotation reissues the SAME session rather than a differently-scoped one. Losing them
    here would silently sign a manager back in with no studio."""
    studio_less = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    app_session.commit()
    persona = uuid.uuid4()
    studio_less.row.acting_as_person_id = persona
    app_session.commit()
    rotated = rotate_refresh_token(
        app_session, presented=studio_less.secret, at=T0 + timedelta(minutes=1)
    )
    assert rotated.row.acting_as_person_id == persona


def test_a_token_is_one_time_use(app_session, identity):
    first = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    app_session.commit()
    rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=1))
    app_session.commit()
    with pytest.raises(RefreshRejectedError) as caught:
        rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=2))
    assert caught.value.reason == "reuse"


def test_reuse_revokes_the_whole_family_including_the_live_token(app_session, identity):
    """The sentence 5.2 actually writes. Revoking only the presented token would leave
    the attacker's freshly-rotated successor alive, which is the opposite of the point."""
    first = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    app_session.commit()
    second = rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=1))
    app_session.commit()

    with pytest.raises(RefreshRejectedError):
        rotate_refresh_token(app_session, presented=first.secret, at=T0 + timedelta(minutes=2))
    app_session.commit()

    with pytest.raises(RefreshRejectedError) as caught:
        rotate_refresh_token(app_session, presented=second.secret, at=T0 + timedelta(minutes=3))
    assert caught.value.reason == "revoked"

    live = (
        app_session.execute(
            select(RefreshToken).where(
                RefreshToken.family_id == first.row.family_id,
                RefreshToken.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )
    assert live == []


def test_a_token_expires_after_thirty_days(app_session, identity):
    issued = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    app_session.commit()
    with pytest.raises(RefreshRejectedError) as caught:
        rotate_refresh_token(app_session, presented=issued.secret, at=T0 + timedelta(days=31))
    assert caught.value.reason == "expired"


def test_an_unknown_token_is_rejected(app_session, identity):
    with pytest.raises(RefreshRejectedError) as caught:
        rotate_refresh_token(app_session, presented="not-a-real-token", at=T0)
    assert caught.value.reason == "unknown"


def test_the_denylist_kills_every_session_issued_before_it(app_session, identity):
    """5.2 -- 'Revocations (removing a coach) are written to a small denylist checked on
    refresh.' A watermark and not a token list: one row kills every device the removed
    coach holds, including ones this server has never issued a token to."""
    issued = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    app_session.commit()
    revoke_sessions_for_identity(
        app_session, identity.id, at=T0 + timedelta(minutes=5), reason="role_revoked"
    )
    app_session.commit()
    with pytest.raises(RefreshRejectedError) as caught:
        rotate_refresh_token(app_session, presented=issued.secret, at=T0 + timedelta(minutes=6))
    assert caught.value.reason == "denylisted"


def test_a_session_started_after_the_denylist_entry_still_works(app_session, identity):
    """The coach is re-hired. A watermark that killed future sessions too would make
    re-granting a role impossible without a database edit."""
    revoke_sessions_for_identity(app_session, identity.id, at=T0, reason="role_revoked")
    app_session.commit()
    issued = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0 + timedelta(minutes=1),
    )
    app_session.commit()
    rotated = rotate_refresh_token(
        app_session, presented=issued.secret, at=T0 + timedelta(minutes=2)
    )
    assert rotated.secret


def test_a_denylist_entry_for_someone_else_does_not_touch_this_session(app_session, identity):
    """Per-identity. A watermark that applied globally would sign out every user in the
    product every time one coach was removed."""
    other = AuthIdentity(provider="google", provider_subject=f"sub-{uuid.uuid4()}")
    app_session.add(other)
    app_session.flush()
    issued = issue_refresh_token(
        app_session,
        identity_id=identity.id,
        active_studio_id=None,
        acting_as_person_id=None,
        at=T0,
    )
    revoke_sessions_for_identity(
        app_session, other.id, at=T0 + timedelta(minutes=5), reason="role_revoked"
    )
    app_session.commit()
    assert rotate_refresh_token(
        app_session, presented=issued.secret, at=T0 + timedelta(minutes=6)
    ).secret


def test_two_secrets_are_never_the_same(app_session, identity):
    secrets_seen = set()
    for index in range(25):
        issued = issue_refresh_token(
            app_session,
            identity_id=identity.id,
            active_studio_id=None,
            acting_as_person_id=None,
            at=T0 + timedelta(seconds=index),
        )
        secrets_seen.add(issued.secret)
    app_session.commit()
    assert len(secrets_seen) == 25
