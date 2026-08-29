"""§11.6's consent ledger, written for the first time.

`ConsentRecord` has existed since W3's contract commit and until now the product
constructed one in exactly ONE place -- `app/services/events/rsvp.py`, the per-event
competition consent. Of the five `CONSENT_TYPES` only `event` was ever written, so no
guardian had ever accepted terms or a privacy policy, and there was no record that they
had, in a product whose §5.5 and §11 are built around health data about minors.

**Every decision is an append.** `ConsentRecord`'s own docstring: "`granted` is a boolean
rather than a status because a withdrawal is a *new row*, not an edit -- §11.2's
append-only reasoning applied to consent." Nothing in this module UPDATEs a row. A
withdrawal writes a new row with `granted=False` and `revoked_at` set to the same instant:
the boolean is what `outstanding` reads, and the timestamp is what makes a withdrawal
findable without reasoning about the boolean.

G7 and §11.7: nothing here logs, and nothing here puts the policy text or the IP into an
audit `diff`. The IP has a column on `consent_record` and another on `audit_log`; a `diff`
is prose a person reads.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health import ConsentRecord
from app.services.audit import AuditService
from app.services.privacy.policy import (
    GRANTABLE_CONSENT_TYPES,
    POLICY_VERSION,
    REQUIRED_CONSENT_TYPES,
)


class UngrantableConsentError(ValueError):
    """A consent type this route may not write. See `GRANTABLE_CONSENT_TYPES`."""


class PolicyVersionMismatchError(RuntimeError):
    """The client accepted a version other than the one currently published.

    The client posts back the version it RENDERED. Recording the server's current version
    for a screen that showed the previous one is how a consent ledger comes to hold
    agreements nobody made.
    """

    def __init__(self, submitted: int, current: int) -> None:
        super().__init__(f"policy version {submitted} is not the current {current}")
        self.submitted = submitted
        self.current = current


class ConsentService:
    """Read and append `consent_record` rows for one person."""

    @staticmethod
    def history(session: Session, *, person_id: uuid.UUID) -> list[ConsentRecord]:
        """Every decision this person has made, oldest first.

        Ordered by `granted_at` and then `created_at`. The second key is not decoration:
        §19.5's `X-Dev-Now` pins `app.core.clock.now()` for a whole request, and a
        developer or a test that grants and then withdraws inside one pinned instant would
        otherwise have two rows with identical `granted_at` and no defined order --
        so "the latest decision" would be whichever the planner happened to return.
        `created_at` is `func.now()`, which is transaction time and therefore still moves.
        """
        return list(
            session.execute(
                select(ConsentRecord)
                .where(
                    ConsentRecord.subject_type == "person",
                    ConsentRecord.subject_id == person_id,
                )
                .order_by(ConsentRecord.granted_at, ConsentRecord.created_at)
            )
            .scalars()
            .all()
        )

    @staticmethod
    def latest_by_type(session: Session, *, person_id: uuid.UUID) -> dict[str, ConsentRecord]:
        """The standing decision per consent type. Later rows overwrite earlier ones here
        and nowhere else -- the table itself keeps all of them."""
        latest: dict[str, ConsentRecord] = {}
        for row in ConsentService.history(session, person_id=person_id):
            latest[row.consent_type] = row
        return latest

    @staticmethod
    def outstanding(session: Session, *, person_id: uuid.UUID) -> list[str]:
        """§6.1 step 5's gate condition: which required consents are not currently granted.

        **At the CURRENT version.** "Agreeing to v1 of a privacy policy is not agreeing to
        v2" (`ConsentRecord`'s docstring), so a grant against superseded wording leaves the
        consent outstanding and the gate stands again. That is the mechanism that will ask
        every family to re-accept the day the reviewed policy replaces this draft.
        """
        latest = ConsentService.latest_by_type(session, person_id=person_id)
        return [
            consent_type
            for consent_type in REQUIRED_CONSENT_TYPES
            if (row := latest.get(consent_type)) is None
            or not row.granted
            or row.version != POLICY_VERSION
        ]

    @staticmethod
    def record(
        session: Session,
        *,
        person_id: uuid.UUID,
        grants: dict[str, bool],
        version: int,
        at: datetime,
        ip: str | None,
        actor_identity_id: uuid.UUID | None,
        studio_id: uuid.UUID,
    ) -> list[ConsentRecord]:
        """Append one row per decision, and one audit entry per row.

        Raises `PolicyVersionMismatchError` if the client accepted wording that is no
        longer published, and `UngrantableConsentError` for a type this route may not
        write -- see `GRANTABLE_CONSENT_TYPES` for why `event` is among those.
        """
        if version != POLICY_VERSION:
            raise PolicyVersionMismatchError(version, POLICY_VERSION)
        unknown = sorted(set(grants) - set(GRANTABLE_CONSENT_TYPES))
        if unknown:
            raise UngrantableConsentError(", ".join(unknown))

        written: list[ConsentRecord] = []
        for consent_type, granted in grants.items():
            row = ConsentRecord(
                subject_type="person",
                subject_id=person_id,
                consent_type=consent_type,
                version=version,
                granted=granted,
                granted_at=at,
                # Set on a withdrawal so the row is findable as one without reading
                # `granted`. Never set on the row it withdraws -- that row is not touched.
                revoked_at=None if granted else at,
                ip=ip,
            )
            session.add(row)
            session.flush()
            AuditService.record(
                session,
                action="consent.grant" if granted else "consent.revoke",
                entity_type="consent_record",
                entity_id=row.id,
                studio_id=studio_id,
                actor_person_id=person_id,
                actor_identity_id=actor_identity_id,
                actor_ip=ip,
                # Three facts and no fourth. Never the policy body -- an audit row is not a
                # copy of the document -- and never the IP, which is already a column on
                # both tables.
                diff={
                    "consent_type": consent_type,
                    "version": version,
                    "granted": granted,
                },
            )
            written.append(row)
        session.flush()
        return written
