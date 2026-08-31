"""§5.4b -- the member onboarding link (docs/onboarding-link-spec.md).

One studio-level URL a manager posts into the club's existing WhatsApp groups. The token
appears exactly once, in the share action; only its SHA-256 lands here -- the same
reasoning as ``invitation.token_hash`` and ``refresh_token.token_hash``, a database read
yields no usable link. Generating a new link revokes the previous one, expiry is seven
days, and revocation is a column write so the answer to a leaked link is a button.

``student.source = 'onboarding_link'`` reuses the existing source column; nothing here
touches the student schema.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encryption import EncryptedBytes
from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey


class OnboardingLink(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "onboarding_link"
    __tenant_table_args__ = (UniqueConstraint("token_hash", name="uq_onboarding_link_token_hash"),)

    #: SHA-256 hex of the 256-bit token. Still the LOOKUP key: an arriving token is
    #: hashed and matched here, so resolving a link never decrypts anything.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    #: The token itself, encrypted (2026-08-31). The card draws a permanent העתקה button
    #: and a hash-only row could never serve it — a manager who reloaded the page lost
    #: the link for good. "A database read yields no usable link" still holds: the
    #: keyring lives in Railway secrets, never in this table.
    #:
    #: Nullable for the rows written before this column existed. Their token is genuinely
    #: unrecoverable, and the card offers those a regenerate rather than a copy.
    token_encrypted: Mapped[bytes | None] = mapped_column(
        EncryptedBytes("onboarding_link.token_encrypted")
    )
    #: NULL means **never expires** — the owner's decision of 2026-08-31. The 7-day TTL
    #: cost a repost for every family joining mid-season, and each regeneration silently
    #: killed the link already sitting in the club's WhatsApp groups. Revocation, instant
    #: and unchanged, is what answers a leak. Kept nullable rather than dropped so a
    #: time-boxed link stays possible without another migration.
    expires_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
