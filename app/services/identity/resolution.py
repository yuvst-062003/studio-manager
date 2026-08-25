"""SPEC §5.2's account linking and §6.1's identity resolution.

**This is the one request-scoped path that legitimately spans tenants.** §3.3's opening
claim is that "one Google account can be a parent at one studio and a coach at another",
so the resolver has to see every studio to answer "which ones are yours?" -- and it runs
*before* a studio is resolved, so there is no tenant to be in. Every query here is
therefore wrapped in `with_all_tenants(reason=...)` with the reason written out, which is
exactly the case §4.2 sanctions the hatch for.

Note what that does **not** license. Once a studio is chosen, every other route takes
`TenantSessionDep` and fails closed. The hatch is open here and nowhere else in the
request path.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tenancy import with_all_tenants
from app.models.identity import AuthIdentity, PlatformAdmin
from app.models.person import Guardian, Invitation, Person, RoleAssignment
from app.models.studio import Studio
from app.services.identity.providers import ProviderIdentity

_LOGIN_SCOPE = (
    "SPEC 3.3 -- the login resolver answers 'which studios are yours?' before any "
    "studio is in context, and one identity must be able to reach several"
)


class InvitationRejectedError(Exception):
    """Unknown, expired, or already accepted.

    One exception, for the same reason `RefreshRejectedError` is one: the caller's
    response is identical in every case, and the distinction is information an attacker
    holding a guessed token does not need.
    """


@dataclass(frozen=True)
class AppAccess:
    """§6.1 -- 'Access to each app is a query, not a role check.'"""

    staff: bool
    parent: bool


@dataclass(frozen=True)
class StudioMembership:
    studio_id: uuid.UUID
    studio_name: str
    studio_is_demo: bool
    person_id: uuid.UUID
    roles: tuple[str, ...]
    is_guardian: bool


def effective_identity_id(identity: AuthIdentity) -> uuid.UUID:
    """§5.2's linking, resolved.

    Followed exactly once and deliberately not in a loop. `upsert_identity` only ever
    points a new identity at one that is itself unlinked, so a chain longer than one hop
    cannot be created -- and a `while` here would be defending against a state this
    module does not produce, at the price of turning a data bug into a hang.
    """
    return identity.linked_to_identity_id or identity.id


def upsert_identity(
    session: Session, provider_identity: ProviderIdentity, *, at: datetime
) -> AuthIdentity:
    with with_all_tenants(reason=_LOGIN_SCOPE):
        existing = session.execute(
            select(AuthIdentity).where(
                AuthIdentity.provider == provider_identity.provider,
                AuthIdentity.provider_subject == provider_identity.subject,
            )
        ).scalar_one_or_none()

        if existing is not None:
            existing.last_login_at = at
            existing.email = provider_identity.email
            existing.email_verified = provider_identity.email_verified
            session.flush()
            return existing

        row = AuthIdentity(
            provider=provider_identity.provider,
            provider_subject=provider_identity.subject,
            email=provider_identity.email,
            email_verified=provider_identity.email_verified,
            is_private_relay=provider_identity.is_private_relay,
            last_login_at=at,
        )

        # §5.2 -- 'the identities are linked automatically ONLY when Apple reports
        # email_verified and the email is not a private relay address. Apple's
        # private-relay addresses are stored as-is and never used for matching.'
        #
        # Four conditions, and only two of them are stated in that sentence:
        #
        #  * the INCOMING address is verified and is not a relay -- §5.2's two;
        #  * the TARGET's address is verified and is not a relay. §5.2 implies this and
        #    does not say it, and it is the one that matters: if an unverified row on
        #    file were enough to link TO, anyone could claim someone else's Apple
        #    sign-in by first registering an unverified address of theirs;
        #  * a different provider, because two accounts at one provider sharing an
        #    address means something is wrong rather than that they are the same person;
        #  * a target that is not itself linked, which is what keeps
        #    `effective_identity_id` a single hop rather than a walk.
        if (
            provider_identity.email
            and provider_identity.email_verified
            and not provider_identity.is_private_relay
        ):
            target = (
                session.execute(
                    select(AuthIdentity)
                    .where(
                        AuthIdentity.email == provider_identity.email,
                        AuthIdentity.email_verified.is_(True),
                        AuthIdentity.is_private_relay.is_(False),
                        AuthIdentity.provider != provider_identity.provider,
                        AuthIdentity.linked_to_identity_id.is_(None),
                    )
                    .order_by(AuthIdentity.created_at)
                )
                .scalars()
                .first()
            )
            if target is not None:
                row.linked_to_identity_id = target.id

        session.add(row)
        session.flush()
        return row


def is_platform_admin(session: Session, identity_id: uuid.UUID) -> bool:
    """§3.1 -- `platform_admin` is 'Seeded manually'.

    Lives here rather than in `platform.py` because it is an identity question, asked on
    every sign-in and every refresh, long before anything touches the console. §18.1 puts
    the platform operator above every studio, which is why the read is unscoped.
    """
    with with_all_tenants(reason=_LOGIN_SCOPE):
        return (
            session.execute(
                select(PlatformAdmin.id)
                .where(PlatformAdmin.auth_identity_id == identity_id)
                .limit(1)
            ).first()
            is not None
        )


def persons_for_identity(session: Session, identity_id: uuid.UUID) -> list[Person]:
    """Every Person this identity is, in every studio.

    Includes persons attached to an identity that links *to* this one, so an Apple
    sign-in lands on the same children as the Google one it was linked to -- which is the
    only thing linking buys.

    Anonymized persons are excluded: §11.4 wipes the Person and leaves financial rows
    intact, and resolving one would sign somebody in as a profile that has been erased.
    """
    with with_all_tenants(reason=_LOGIN_SCOPE):
        linked = (
            session.execute(
                select(AuthIdentity.id).where(AuthIdentity.linked_to_identity_id == identity_id)
            )
            .scalars()
            .all()
        )
        return list(
            session.execute(
                select(Person)
                .where(Person.auth_identity_id.in_([identity_id, *linked]))
                .where(Person.anonymized_at.is_(None))
            )
            .scalars()
            .all()
        )


def app_access(session: Session, person_ids: list[uuid.UUID]) -> AppAccess:
    """§6.1's two queries, verbatim::

        staff app   -> EXISTS(role_assignment WHERE person_id = :me AND revoked_at IS NULL)
        parent app  -> EXISTS(guardian        WHERE person_id = :me)

    §3.1: "This makes app access a query, not a role check." Writing it any other way --
    a cached boolean on the person, a claim in the token that is never re-derived -- is
    how a revoked coach keeps their app for as long as the cache lives.
    """
    if not person_ids:
        # A brand-new account with no Person anywhere. Short-circuited rather than run as
        # an empty IN clause: the answer is knowable without a round trip, and §6.1 needs
        # it before any studio exists.
        return AppAccess(staff=False, parent=False)
    staff = (
        session.execute(
            select(RoleAssignment.id)
            .where(RoleAssignment.person_id.in_(person_ids), RoleAssignment.revoked_at.is_(None))
            .limit(1)
        ).first()
        is not None
    )
    parent = (
        session.execute(
            select(Guardian.id).where(Guardian.person_id.in_(person_ids)).limit(1)
        ).first()
        is not None
    )
    return AppAccess(staff=staff, parent=parent)


def studios_for_identity(session: Session, identity_id: uuid.UUID) -> list[StudioMembership]:
    """What the studio switcher renders, and what §6.1's resolve step branches on.

    §5.2: "A person belonging to more than one studio gets a studio switcher; otherwise it
    is hidden." The client hides it by counting this list. The server sends no
    `show_switcher` boolean, because that would be the same fact stated twice and the two
    statements could disagree.
    """
    with with_all_tenants(reason=_LOGIN_SCOPE):
        memberships: list[StudioMembership] = []
        for person in persons_for_identity(session, identity_id):
            studio = session.get(Studio, person.studio_id)
            if studio is None or studio.status != "active":
                # §18.3's suspend action. A suspended studio someone can still switch
                # into is a suspension that suspended nothing.
                continue
            roles = tuple(
                session.execute(
                    select(RoleAssignment.role)
                    .where(
                        RoleAssignment.person_id == person.id,
                        RoleAssignment.revoked_at.is_(None),
                    )
                    .order_by(RoleAssignment.role)
                )
                .scalars()
                .all()
            )
            is_guardian = (
                session.execute(
                    select(Guardian.id).where(Guardian.person_id == person.id).limit(1)
                ).first()
                is not None
            )
            memberships.append(
                StudioMembership(
                    studio_id=studio.id,
                    studio_name=studio.name,
                    studio_is_demo=studio.is_demo,
                    person_id=person.id,
                    roles=roles,
                    is_guardian=is_guardian,
                )
            )
        return memberships


def accept_invitation(
    session: Session, *, token: str, identity_id: uuid.UUID, at: datetime
) -> Person:
    """§5.3 -- 'the invitation carries a token binding the accepting auth identity to the
    pre-created Person.'

    The binding is the point. A manager already created the Person, so accepting attaches
    a login to a profile that exists rather than creating a second one -- §3.3 point 2:
    "Attaching an auth identity to an existing student Person later gives them a login
    with zero migration."
    """
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with with_all_tenants(reason=_LOGIN_SCOPE):
        invitation = session.execute(
            select(Invitation).where(Invitation.token_hash == token_hash)
        ).scalar_one_or_none()
        if invitation is None or invitation.accepted_at is not None:
            raise InvitationRejectedError("unknown or already accepted")
        if at >= invitation.expires_at:
            raise InvitationRejectedError("expired")

        match = (
            (Person.email == invitation.email)
            if invitation.email
            else (Person.phone == invitation.phone)
        )
        person = (
            session.execute(
                select(Person).where(
                    Person.studio_id == invitation.studio_id,
                    Person.auth_identity_id.is_(None),
                    Person.anonymized_at.is_(None),
                    match,
                )
            )
            .scalars()
            .first()
        )
        if person is None:
            raise InvitationRejectedError("no pre-created person matches this invitation")

        person.auth_identity_id = identity_id
        invitation.accepted_at = at
        invitation.accepted_by_person_id = person.id
        session.flush()
        return person
