"""SPEC §3.3 -- the identity half of the four deliberately separated entities.

Everything in this module is **global**. §3.3: "auth_identity -- a Google or Apple login.
**Global, not studio-scoped**, so one Google account can be a parent at one studio and a
coach at another." A studio_id on any of these tables would make that sentence false, so
invariant 2 carries an exemption for each with the reason written out rather than letting
them pass by omission.

`person` and `role_assignment` are the tenant-scoped half and live in
app/models/person.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §5.2 -- 'Providers: Google and Apple only. No passwords, no phone OTP, no email
#: magic links.'
PROVIDERS = ("google", "apple")


class AuthIdentity(UUIDPrimaryKey, TimestampColumns, Base):
    __tablename__ = "auth_identity"
    __table_args__ = (
        # §4.3 writes `provider_subject UNIQUE`. Scoped to the provider: Google and
        # Apple mint subjects in separate namespaces, so a bare unique on the subject
        # would forbid a collision that is not one.
        UniqueConstraint("provider", "provider_subject"),
        # §5.2's account linking looks an identity up by email. Deliberately NOT unique:
        # Apple's private-relay addresses are stored as-is and never used for matching,
        # and two identities may legitimately carry the same address.
        Index("ix_auth_identity_email", "email"),
    )

    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    # §5.2 -- linking happens 'only when Apple reports email_verified and the email is
    # not a private relay address'. Both halves are stored, because a later re-link must
    # re-derive the decision rather than trust that it was once made correctly.
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_private_relay: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # §5.2 -- 'the identities are linked automatically'. A self-reference rather than a
    # link table: linking is always many-to-one onto the identity that was there first,
    # and resolution follows this pointer exactly once (resolution.effective_identity_id).
    linked_to_identity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT")
    )

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # §19.2 -- 'set ONLY by a database seed or migration. There is no API, no UI and no
    # admin screen that can grant it.' tests/restrictions/test_04 asserts that two
    # independent ways: no request schema FastAPI publishes exposes the field, and no
    # code outside alembic/versions/ or app/services/demo/ assigns it.
    #
    # The server_default is the half that matters. A model-level default is applied by
    # Python, so a seed or a migration inserting a row without naming the column gets
    # what the DATABASE says -- which is what §19.2's wording is actually about.
    is_developer: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class PlatformAdmin(UUIDPrimaryKey, TimestampColumns, Base):
    """§4.3 -- `platform_admin  auth_identity_id`. §3.1: 'Seeded manually.'

    Global by definition: §18.1 puts the platform operator above every studio, and §5.1's
    chain of authority starts here -- so it cannot itself live inside a tenant.

    There is deliberately no route anywhere that creates one of these. A console able to
    mint its own operators would make the top of the chain self-issuing, which is the
    same defect §19.2 forbids for is_developer.
    """

    __tablename__ = "platform_admin"
    __table_args__ = (UniqueConstraint("auth_identity_id"),)

    auth_identity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT"), nullable=False
    )


class RefreshToken(UUIDPrimaryKey, TimestampColumns, Base):
    """§5.2 -- 'a rotating refresh token (30 days, one-time-use, reuse detection revokes
    the family of tokens)'.

    The secret is never stored. `token_hash` is SHA-256 of the presented string, so a
    database read yields no usable session (§11.7). SHA-256 rather than a password hash:
    this is a 256-bit random secret with no guessable structure, so there is nothing for
    a slow KDF to slow down.

    A row is one link in a chain. `family_id` names the chain, `parent_id` names the link
    it replaced, and presenting a link whose `used_at` is already set means two parties
    hold the same secret -- the reuse §5.2 requires be detected.
    """

    __tablename__ = "refresh_token"
    __table_args__ = (
        UniqueConstraint("token_hash"),
        Index("ix_refresh_token_family_id", "family_id"),
        Index("ix_refresh_token_auth_identity_id", "auth_identity_id"),
    )

    auth_identity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT"), nullable=False
    )
    family_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    # The session's shape, carried on the refresh row so a rotation reissues the same
    # session rather than a differently-scoped one. §5.2's switch-studio rewrites the
    # first; §19.4's role switcher rewrites the second.
    active_studio_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("studio.id", ondelete="RESTRICT")
    )
    acting_as_person_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthRevocation(UUIDPrimaryKey, TimestampColumns, Base):
    """§5.2 -- 'Revocations (removing a coach) are written to a small denylist checked on
    refresh.'

    Small on purpose, and it is not a list of tokens -- it is a per-identity watermark:
    every session issued before `sessions_issued_before` is dead. One row kills every
    device a removed coach holds, including ones this server has never seen, which a
    token-by-token list cannot do. It also leaves sessions started *after* the watermark
    alone, so re-granting the role later works without a database edit.
    """

    __tablename__ = "auth_revocation"
    __table_args__ = (Index("ix_auth_revocation_auth_identity_id", "auth_identity_id"),)

    auth_identity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("auth_identity.id", ondelete="RESTRICT"), nullable=False
    )
    sessions_issued_before: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(120), nullable=False)


class OAuthTransaction(UUIDPrimaryKey, TimestampColumns, Base):
    """§5.2 -- 'a standard top-level redirect, then PKCE code exchange server-side'.

    Server-side PKCE means the verifier never leaves this process, so it needs somewhere
    to live between the redirect out and the callback back. A table rather than a cache:
    this repo has no Redis, the rows are tiny, short-lived and single-use, and a verifier
    that does not survive a deploy is the difference between a working sign-in and a
    mysterious one.
    """

    __tablename__ = "oauth_transaction"
    __table_args__ = (UniqueConstraint("state"),)

    state: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    code_verifier: Mapped[str] = mapped_column(Text, nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    # Which of the three PWAs started the flow, so the callback returns to its own origin
    # rather than to whichever one is configured first.
    app: Mapped[str] = mapped_column(String(16), nullable=False)
    # Where to send the browser inside that app once the exchange succeeds. Stored here
    # rather than passed through the provider, so an open-redirect parameter never
    # crosses the boundary and comes back attacker-controlled.
    return_path: Mapped[str] = mapped_column(String(200), nullable=False, default="/")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
