"""SPEC 5.2's account linking and 6.1's two access queries.

The linking rules are asserted as a table because 5.2 states them as one, and because the
wrong branch here silently merges two people's accounts. The access queries are asserted
against real rows rather than mocks -- 3.1's whole point is that they ARE queries, and a
mock cannot be wrong in the way a query can.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from app.core.tenancy import with_all_tenants
from app.models.person import Guardian, Person, RoleAssignment
from app.models.studio import Studio
from app.services.identity.providers import ProviderIdentity
from app.services.identity.resolution import (
    app_access,
    effective_identity_id,
    persons_for_identity,
    studios_for_identity,
    upsert_identity,
)
from sqlalchemy.orm import Session

T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)
_SCOPE = "test drives the cross-studio login resolver directly"


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון בדיקה", slug=f"t-{uuid.uuid4().hex[:8]}")
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def _identity(session: Session, *, provider: str = "google", email: str | None = None):
    return upsert_identity(
        session,
        ProviderIdentity.from_claims(
            provider=provider,
            subject=f"{provider}-{uuid.uuid4()}",
            email=email or f"{uuid.uuid4().hex[:8]}@example.invalid",
            email_verified=True,
        ),
        at=T0,
    )


def _person(session: Session, studio: Studio, identity=None) -> Person:
    person = Person(
        studio_id=studio.id,
        auth_identity_id=identity.id if identity else None,
        first_name="דנה",
        last_name="כהן",
    )
    session.add(person)
    session.flush()
    return person


# -- upsert and linking -------------------------------------------------------
def test_a_first_sign_in_creates_the_identity(app_session):
    identity = _identity(app_session)
    app_session.commit()
    assert identity.provider == "google"
    assert identity.last_login_at == T0


def test_a_second_sign_in_reuses_the_same_row(app_session):
    provider = ProviderIdentity.from_claims(
        provider="google",
        subject=f"g-{uuid.uuid4()}",
        email="a@example.invalid",
        email_verified=True,
    )
    first = upsert_identity(app_session, provider, at=T0)
    app_session.commit()
    second = upsert_identity(app_session, provider, at=T0)
    app_session.commit()
    assert first.id == second.id


def test_apple_links_to_a_google_identity_on_a_verified_matching_email(app_session):
    """5.2 -- 'if a person signs in with Apple using a Google-verified email already on
    file, the identities are linked automatically only when Apple reports email_verified
    and the email is not a private relay address.'"""
    email = f"link-{uuid.uuid4().hex[:8]}@example.invalid"
    google = _identity(app_session, provider="google", email=email)
    app_session.commit()
    apple = _identity(app_session, provider="apple", email=email)
    app_session.commit()
    assert apple.id != google.id
    assert apple.linked_to_identity_id == google.id
    assert effective_identity_id(apple) == google.id
    assert effective_identity_id(google) == google.id


def test_apple_does_not_link_on_an_unverified_email(app_session):
    email = f"unv-{uuid.uuid4().hex[:8]}@example.invalid"
    _identity(app_session, provider="google", email=email)
    app_session.commit()
    apple = upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="apple", subject=f"a-{uuid.uuid4()}", email=email, email_verified=False
        ),
        at=T0,
    )
    app_session.commit()
    assert apple.linked_to_identity_id is None


def test_linking_requires_a_verified_address_on_the_target_too(app_session):
    """The half 5.2 implies rather than states. If an UNVERIFIED row on file were enough
    to link to, anyone could claim someone's Apple sign-in by first signing in with an
    unverified address of theirs."""
    email = f"tgt-{uuid.uuid4().hex[:8]}@example.invalid"
    upsert_identity(
        app_session,
        ProviderIdentity.from_claims(
            provider="google", subject=f"g-{uuid.uuid4()}", email=email, email_verified=False
        ),
        at=T0,
    )
    app_session.commit()
    apple = _identity(app_session, provider="apple", email=email)
    app_session.commit()
    assert apple.linked_to_identity_id is None


def test_a_private_relay_address_is_never_used_for_matching(app_session):
    """5.2's explicit sentence. A relay address is a per-app alias, so matching on one
    would link accounts that have no relationship at all."""
    relay = "abc123@privaterelay.appleid.com"
    _identity(app_session, provider="google", email=relay)
    app_session.commit()
    apple = _identity(app_session, provider="apple", email=relay)
    app_session.commit()
    assert apple.linked_to_identity_id is None
    assert apple.is_private_relay is True


def test_the_same_provider_never_links_to_itself(app_session):
    """Two Google accounts sharing an address is not a thing Google permits, so a match
    here means something is wrong -- and chaining them would make effective_identity_id
    a walk instead of a single hop."""
    email = f"same-{uuid.uuid4().hex[:8]}@example.invalid"
    _identity(app_session, provider="google", email=email)
    app_session.commit()
    second = _identity(app_session, provider="google", email=email)
    app_session.commit()
    assert second.linked_to_identity_id is None


def test_a_link_never_chains(app_session):
    """effective_identity_id follows the pointer exactly once, so upsert must never point
    at an identity that is itself linked. A chain would need a loop, and a loop over data
    is a hang waiting for a cycle."""
    email = f"chain-{uuid.uuid4().hex[:8]}@example.invalid"
    google = _identity(app_session, provider="google", email=email)
    apple = _identity(app_session, provider="apple", email=email)
    app_session.commit()
    assert apple.linked_to_identity_id == google.id
    third = _identity(app_session, provider="apple", email=email)
    app_session.commit()
    assert third.linked_to_identity_id in (None, google.id)
    assert third.linked_to_identity_id != apple.id


# -- 6.1's two queries --------------------------------------------------------
def test_staff_access_is_a_role_assignment_query(app_session, studio):
    """6.1 -- staff app -> EXISTS(role_assignment WHERE person_id = :me AND revoked_at IS
    NULL)."""
    person = _person(app_session, studio)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=person.id,
            role="manager",
            scope_type="studio",
            granted_at=T0,
        )
    )
    app_session.commit()
    with with_all_tenants(reason=_SCOPE):
        access = app_access(app_session, [person.id])
    assert (access.staff, access.parent) == (True, False)


def test_a_revoked_role_does_not_grant_staff_access(app_session, studio):
    person = _person(app_session, studio)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=person.id,
            role="manager",
            scope_type="studio",
            granted_at=T0,
            revoked_at=T0,
        )
    )
    app_session.commit()
    with with_all_tenants(reason=_SCOPE):
        assert app_access(app_session, [person.id]).staff is False


def test_parent_access_is_a_guardian_query_and_not_a_role(app_session, studio):
    """3.1 -- 'Guardian is not a role. There is no role_assignment row.' This is the test
    that would catch someone adding one."""
    person = _person(app_session, studio)
    app_session.add(
        Guardian(
            studio_id=studio.id,
            student_id=uuid.uuid4(),
            person_id=person.id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()
    with with_all_tenants(reason=_SCOPE):
        access = app_access(app_session, [person.id])
    assert (access.staff, access.parent) == (False, True)


def test_a_person_with_neither_is_refused_by_both_apps(app_session, studio):
    """6.1's last row -- 'No role and no children: ✗ ✗'. dev+none exists to walk it."""
    person = _person(app_session, studio)
    app_session.commit()
    with with_all_tenants(reason=_SCOPE):
        access = app_access(app_session, [person.id])
    assert (access.staff, access.parent) == (False, False)


def test_a_person_who_is_both_gets_both(app_session, studio):
    """6.1 -- 'owner / manager: ✓ staff, ✓ parent if they are also a guardian.' §19.3's
    dev+both persona exists for exactly this, and 3.1 says it is never two accounts."""
    person = _person(app_session, studio)
    app_session.add_all(
        [
            RoleAssignment(
                studio_id=studio.id,
                person_id=person.id,
                role="lead_coach",
                scope_type="studio",
                granted_at=T0,
            ),
            Guardian(
                studio_id=studio.id,
                student_id=uuid.uuid4(),
                person_id=person.id,
                is_primary=True,
                relation="parent",
            ),
        ]
    )
    app_session.commit()
    with with_all_tenants(reason=_SCOPE):
        access = app_access(app_session, [person.id])
    assert (access.staff, access.parent) == (True, True)


def test_an_identity_with_no_persons_at_all_is_refused_without_a_query(app_session):
    """A brand-new Google account. Passing an empty list to an IN clause is a query that
    matches nothing but still costs a round trip, and 6.1 needs an answer before any
    studio exists."""
    access = app_access(app_session, [])
    assert (access.staff, access.parent) == (False, False)


# -- studios ------------------------------------------------------------------
def test_one_identity_reaches_persons_in_every_studio_it_belongs_to(app_session):
    """3.3's opening claim -- 'one Google account can be a parent at one studio and a
    coach at another'. The resolver runs before any studio is in context, so it is the
    one login path that legitimately spans tenants."""
    identity = _identity(app_session)
    a = Studio(name="א", slug=f"a-{uuid.uuid4().hex[:8]}")
    b = Studio(name="ב", slug=f"b-{uuid.uuid4().hex[:8]}")
    app_session.add_all([a, b])
    app_session.flush()
    _person(app_session, a, identity)
    _person(app_session, b, identity)
    app_session.commit()
    assert len(persons_for_identity(app_session, identity.id)) == 2


def test_a_linked_identity_reaches_the_same_people(app_session, studio):
    """The point of linking. Signing in with Apple must land on the same children as
    signing in with Google, or the link bought nothing."""
    email = f"reach-{uuid.uuid4().hex[:8]}@example.invalid"
    google = _identity(app_session, provider="google", email=email)
    _person(app_session, studio, google)
    apple = _identity(app_session, provider="apple", email=email)
    app_session.commit()
    assert len(persons_for_identity(app_session, effective_identity_id(apple))) == 1


def test_an_anonymized_person_is_not_resolved(app_session, studio):
    """11.4 -- anonymization wipes the Person and leaves financial rows intact. Resolving
    one would sign someone in as a profile that has been erased."""
    identity = _identity(app_session)
    person = _person(app_session, studio, identity)
    person.anonymized_at = T0
    app_session.commit()
    assert persons_for_identity(app_session, identity.id) == []


def test_a_studio_switcher_is_only_earned_by_belonging_to_two(app_session, studio):
    """5.2 -- 'A person belonging to more than one studio gets a studio switcher;
    otherwise it is hidden.' The list is what the client counts."""
    identity = _identity(app_session)
    person = _person(app_session, studio, identity)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=person.id,
            role="owner",
            scope_type="studio",
            granted_at=T0,
        )
    )
    app_session.commit()
    memberships = studios_for_identity(app_session, identity.id)
    assert len(memberships) == 1
    assert memberships[0].roles == ("owner",)
    assert memberships[0].studio_is_demo is False
    assert memberships[0].is_guardian is False


def test_a_suspended_studio_is_not_offered(app_session, studio):
    """18.3's suspend action. A suspended studio a person can still switch into is a
    suspension that suspended nothing."""
    identity = _identity(app_session)
    person = _person(app_session, studio, identity)
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=person.id,
            role="owner",
            scope_type="studio",
            granted_at=T0,
        )
    )
    studio.status = "suspended"
    app_session.commit()
    assert studios_for_identity(app_session, identity.id) == []
