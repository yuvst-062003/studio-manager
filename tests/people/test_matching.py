"""§5.4a's person and child matching. L7: **verified** email or phone, and nothing else.

The negative tests carry more weight than the positives here. A matcher that is slightly
too eager attaches a stranger's child to somebody else's account, and the person who finds
out is the parent who opens the app and sees a child who is not theirs.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.identity import AuthIdentity
from app.models.people import Student
from app.models.person import Person
from app.models.studio import Studio
from app.services.people.matching import (
    match_children,
    match_person,
    normalize_phone,
)

#: `app_session` is a plain, unscoped Session with no per-test rollback (see
#: tests/conftest.py) and it is the same database another lane's suite may be running
#: against concurrently. Every matching key below is generated fresh per test so a query
#: can only ever find the row THIS test just created -- reusing a literal like
#: "yael@example.invalid" across tests would let an earlier test's still-durable row
#: answer a later test's query, which is exactly the kind of false pass this module's
#: negative tests exist to rule out.


def _identity(app_session, *, email: str | None, verified: bool) -> uuid.UUID:
    row = AuthIdentity(
        provider="fake",
        provider_subject=f"s-{uuid.uuid4()}",
        email=email,
        email_verified=verified,
        is_private_relay=False,
    )
    app_session.add(row)
    app_session.flush()
    return row.id


def _person(app_session, studio, **fields) -> Person:
    row = Person(studio_id=studio.id, first_name="יעל", last_name="כהן", **fields)
    app_session.add(row)
    app_session.commit()
    return row


def test_a_verified_email_matches(app_session, studio):
    email = f"yael-{uuid.uuid4().hex[:8]}@example.invalid"
    identity = _identity(app_session, email=email, verified=True)
    existing = _person(app_session, studio, email=email, auth_identity_id=identity)

    match = match_person(app_session, email=email)
    assert match is not None
    assert match.person_id == existing.id
    assert match.matched_on == "email"


def test_an_unverified_email_never_matches(app_session, studio):
    """L7. An address nobody confirmed is a claim, not an identity -- and anyone can make
    a claim about anyone's address."""
    email = f"yael-{uuid.uuid4().hex[:8]}@example.invalid"
    identity = _identity(app_session, email=email, verified=False)
    _person(app_session, studio, email=email, auth_identity_id=identity)

    assert match_person(app_session, email=email) is None


def test_a_person_with_no_login_never_matches_on_email(app_session, studio):
    """A pre-created Person carries an email a manager typed. Nobody verified it, so it
    cannot be a matching key -- it is what the INVITATION is addressed to (§5.3), which
    is a different mechanism with a token in it."""
    email = f"yael-{uuid.uuid4().hex[:8]}@example.invalid"
    _person(app_session, studio, email=email, auth_identity_id=None)

    assert match_person(app_session, email=email) is None


def test_a_phone_matches_across_formatting(app_session, studio):
    # A fresh 9-digit local number each run, so this test's phone can never collide with
    # another run's still-durable row. Both variants below normalize to the same digits.
    local9 = f"5{uuid.uuid4().int % 10**8:08d}"
    raw = "0" + local9
    formatted = f"+972-{local9[0:2]}-{local9[2:5]}-{local9[5:9]}"

    identity = _identity(app_session, email=None, verified=False)
    existing = _person(app_session, studio, phone=raw, auth_identity_id=identity)

    match = match_person(app_session, phone=formatted)
    assert match is not None and match.person_id == existing.id
    assert match.matched_on == "phone"


def test_a_genuinely_new_family_matches_nobody(app_session, studio):
    """§5.4a: 'None is a genuinely new family, and that is the common case rather than an
    error.'"""
    assert match_person(app_session, email="nobody@example.invalid", phone="0500000000") is None


def test_matching_never_reaches_another_studio(app_session, studio):
    """The reads run under TenantSession, so this is the tenant filter doing its job --
    asserted rather than assumed, because a cross-studio match would join two clubs'
    families together.

    The control is the point. `match_person` returning None proves nothing on its own --
    it also returns None for a typo, a dropped table, or tenant isolation deleted
    outright. Scoping the identical call to the studio the Person actually lives in and
    getting it back is what proves the first None was the tenant filter's doing.
    """
    other = Studio(name="מועדון אחר", slug=f"o-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()

    email = f"someone-elses-{uuid.uuid4().hex[:8]}@example.invalid"
    identity = _identity(app_session, email=email, verified=True)
    other_person = _person(app_session, other, email=email, auth_identity_id=identity)

    with TenantSession(bind=get_engine(), expire_on_commit=False) as scoped:
        with use_studio(studio.id):
            assert match_person(scoped, email=email) is None

        # The control: the same call, scoped to the studio this Person actually lives
        # in, must find it.
        with use_studio(other.id):
            match = match_person(scoped, email=email)

    assert match is not None
    assert match.person_id == other_person.id


def test_an_anonymized_person_never_matches(app_session, studio):
    """§11.4 wipes the Person and leaves financial rows. Matching one would attach a new
    child to a profile that has been erased."""
    from datetime import UTC, datetime

    email = f"gone-{uuid.uuid4().hex[:8]}@example.invalid"
    identity = _identity(app_session, email=email, verified=True)
    _person(
        app_session,
        studio,
        email=email,
        auth_identity_id=identity,
        anonymized_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    assert match_person(app_session, email=email) is None


def test_a_child_with_the_same_name_and_birthdate_is_flagged(app_session, studio):
    """§5.4a's duplicate-child detection: 'the manager sees a warning and can merge into
    the existing student rather than creating a second one.' A warning, never an automatic
    merge -- two siblings can share a birthday, and the club knows and we do not."""
    # A fresh last name per test: match_children has no studio filter of its own (it
    # relies on the caller's TenantSession in production), so a name shared with another
    # test in this unscoped, non-rolled-back database would return that test's rows too.
    last_name = f"כהן-{uuid.uuid4().hex[:6]}"
    person = Person(
        studio_id=studio.id, first_name="נועה", last_name=last_name, birthdate=date(2020, 3, 4)
    )
    app_session.add(person)
    app_session.flush()
    app_session.add(Student(studio_id=studio.id, person_id=person.id, status="active"))
    app_session.commit()

    found = match_children(
        app_session, first_name="נועה", last_name=last_name, birthdate=date(2020, 3, 4)
    )
    assert [m.display_name for m in found] == [f"נועה {last_name}"]


def test_a_different_birthdate_is_not_a_duplicate(app_session, studio):
    last_name = f"כהן-{uuid.uuid4().hex[:6]}"
    person = Person(
        studio_id=studio.id, first_name="נועה", last_name=last_name, birthdate=date(2020, 3, 4)
    )
    app_session.add(person)
    app_session.flush()
    app_session.add(Student(studio_id=studio.id, person_id=person.id, status="active"))
    app_session.commit()

    assert (
        match_children(
            app_session, first_name="נועה", last_name=last_name, birthdate=date(2019, 3, 4)
        )
        == []
    )


def test_a_child_with_no_birthdate_on_file_is_still_flagged_by_name(app_session, studio):
    """Birthdate is optional on `person`. Two students with the same name in one small
    club is worth a warning even without one -- the manager decides, which is the whole
    design."""
    last_name = f"כהן-{uuid.uuid4().hex[:6]}"
    person = Person(studio_id=studio.id, first_name="נועה", last_name=last_name)
    app_session.add(person)
    app_session.flush()
    app_session.add(Student(studio_id=studio.id, person_id=person.id, status="active"))
    app_session.commit()

    found = match_children(
        app_session, first_name="נועה", last_name=last_name, birthdate=date(2020, 3, 4)
    )
    assert len(found) == 1


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0521234567", "972521234567"),
        ("+972521234567", "972521234567"),
        ("052-123-4567", "972521234567"),
        ("+972 52 123 4567", "972521234567"),
        ("+1 415 555 0123", "14155550123"),
        (None, None),
        ("", None),
        ("not a phone", None),
    ],
)
def test_phone_normalization(raw, expected):
    """Israeli numbers are written five different ways by five different parents. A
    matcher that compares them literally matches nobody and creates a duplicate every
    time -- which is L7 broken by formatting."""
    assert normalize_phone(raw) == expected
