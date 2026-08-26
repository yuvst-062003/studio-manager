"""SPEC §5.1's chain of authority, and §18.3's M1 subset.

Conflict C4: §14 lists the platform console in both M1 and M9. M1 builds the two things
§5.1 makes load-bearing -- provisioning a studio and inviting its owner -- plus suspend,
because a studio that cannot be switched off has no off switch. M9 builds the operations
board, the per-studio health chip and break-glass.

**There is no function here that grants platform_admin.** §3.1: "Seeded manually." A
console able to mint its own operators would make the top of the chain of authority
self-issuing, which is the same defect §19.2 forbids for `is_developer`.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.tenancy import with_all_tenants
from app.models.person import Invitation, Person, RoleAssignment
from app.models.studio import Studio
from app.services.audit import AuditService
from app.services.structure.health_templates import (
    ensure_full_template,
    ensure_trial_template,
)

_PLATFORM_SCOPE = (
    "SPEC 18.1 -- the platform console operates above every studio; 5.1 makes it the "
    "only thing that can create one, so it cannot itself be scoped to one"
)

#: §5.3's invitation window. Long enough to survive a weekend, short enough that a
#: forwarded email is not a permanent credential.
INVITATION_TTL_DAYS = 14


class StudioNotFoundError(LookupError):
    """The console addressed a studio that does not exist."""


def provision_studio(
    session: Session,
    *,
    name: str,
    slug: str,
    timezone: str,
    default_locale: str,
    created_by_identity_id: uuid.UUID,
    at: datetime,
) -> Studio:
    """§5.1 -- 'The platform console creates a studio with its name, timezone and default
    language.'

    `is_demo` is not a parameter and never will be. §19.1 makes it the flag deciding
    whether a studio contains real people, and §19.7 excludes flagged studios from every
    cross-studio total -- so a console that could set it could make a real club invisible
    to the numbers used to judge real clubs. Revision 0003 creates the one demo studio;
    nothing else ever does.

    The trial health template is seeded here rather than left to the wizard (conflict C3):
    §5.4a's funnel puts a declaration at step 3 of five, and a studio that reaches M3
    without one is a funnel that stops there.
    """
    with with_all_tenants(reason=_PLATFORM_SCOPE):
        studio = Studio(
            name=name,
            slug=slug,
            timezone=timezone,
            default_locale=default_locale,
            status="active",
            is_demo=False,
            created_by_identity_id=created_by_identity_id,
            created_at=at,
        )
        session.add(studio)
        session.flush()
        ensure_trial_template(session, studio.id, at=at)
        # D11 -- every studio ships with the default `full` question set, editable in the
        # app. Revision 0007 seeded the studios that existed when it ran; this is the same
        # guarantee for every studio provisioned after it, which is all of them from here.
        ensure_full_template(session, studio.id, at=at)
        AuditService.record(
            session,
            action="platform.studio.provisioned",
            entity_type="studio",
            entity_id=studio.id,
            studio_id=studio.id,
            actor_identity_id=created_by_identity_id,
            diff={"name": name, "slug": slug},
        )
        session.flush()
        return studio


def invite_owner(
    session: Session,
    *,
    studio_id: uuid.UUID,
    email: str,
    first_name: str,
    last_name: str,
    granted_by_identity_id: uuid.UUID,
    at: datetime,
) -> tuple[Invitation, str]:
    """§5.1 -- 'sends an invitation to the person who will be its owner.'

    Creates the Person **and** the owner role assignment up front, both unattached to any
    login. §5.3: "the invitation carries a token binding the accepting auth identity to
    the pre-created Person" -- so accepting attaches a login to a profile that already
    holds its role, rather than granting anything at accept time. §3.3 point 2 calls that
    zero-migration, and it is also what keeps the accept path free of privilege decisions.

    Returns the row and the plaintext token. The token is returned **once**: only its
    SHA-256 is stored, so a later GET cannot reproduce it and a database read yields no
    usable credential.
    """
    token = secrets.token_urlsafe(32)
    with with_all_tenants(reason=_PLATFORM_SCOPE):
        if session.get(Studio, studio_id) is None:
            raise StudioNotFoundError(str(studio_id))

        person = Person(
            studio_id=studio_id,
            auth_identity_id=None,
            first_name=first_name,
            last_name=last_name,
            email=email,
            created_at=at,
        )
        session.add(person)
        session.flush()
        session.add(
            RoleAssignment(
                studio_id=studio_id,
                person_id=person.id,
                role="owner",
                scope_type="studio",
                granted_at=at,
                created_at=at,
            )
        )

        invitation = Invitation(
            studio_id=studio_id,
            email=email,
            intended_role="owner",
            token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            expires_at=at + timedelta(days=INVITATION_TTL_DAYS),
            created_at=at,
        )
        session.add(invitation)
        session.flush()
        AuditService.record(
            session,
            action="platform.owner.invited",
            entity_type="invitation",
            entity_id=invitation.id,
            studio_id=studio_id,
            actor_identity_id=granted_by_identity_id,
            # The email, never the token. An audit row holding a live credential would be
            # a credential store with an append-only grant on it.
            diff={"email": email, "intended_role": "owner"},
        )
        session.flush()
        return invitation, token


def suspend_studio(
    session: Session, *, studio_id: uuid.UUID, actor_identity_id: uuid.UUID, at: datetime
) -> Studio:
    """§18.3's suspend action.

    Sets the status and nothing else. `studios_for_identity` already skips a non-active
    studio, so a suspended club disappears from every switcher without any session having
    to be hunted down -- and un-suspending restores them just as quietly.
    """
    with with_all_tenants(reason=_PLATFORM_SCOPE):
        studio = session.get(Studio, studio_id)
        if studio is None:
            raise StudioNotFoundError(str(studio_id))
        studio.status = "suspended"
        AuditService.record(
            session,
            action="platform.studio.suspended",
            entity_type="studio",
            entity_id=studio_id,
            studio_id=studio_id,
            actor_identity_id=actor_identity_id,
        )
        session.flush()
        return studio


def list_studios(session: Session) -> list[Studio]:
    """§18.3's studio list, M1's subset: the rows, not the health chips.

    The demo studio is **included** here on purpose. §19.7 excludes it from
    `platform_studio_stats` and from every cross-studio total -- numbers used to judge
    real studios -- and this is neither: it is the operator's own inventory, and hiding
    the demo studio from the one screen that lists studios would make it unmanageable.
    """
    from sqlalchemy import select

    with with_all_tenants(reason=_PLATFORM_SCOPE):
        return list(session.execute(select(Studio).order_by(Studio.created_at)).scalars().all())
