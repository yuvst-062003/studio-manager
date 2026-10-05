"""`scripts/bootstrap-owner.py`'s owner step — the only thing that writes `platform_admin`,
and the only way a fresh deployed environment gets a reachable operator at all.

Written because the typecheck never ran on it. `accept_invitation` returns an
`AcceptedInvitation` (a `person` and a `student_id`) and the script assigned it straight
into the variable it then printed `.id`, `.first_name` and `.last_name` off — so the FRESH
branch, the one a brand-new club is the whole point of, raised `AttributeError` after the
invitation had been accepted and before `session.commit()`. Everything rolled back and the
operator got a traceback instead of a studio. Nothing caught it: there was no test here,
`ruff` does not type, and `mypy app scripts` has been failing on four other scripts since
before this one was written, so its four errors about exactly this were in the noise.

The assertions are on the attributes `main` actually reads, not on the type alone — that is
what makes this test fail for the real reason rather than for a changed annotation.
"""

from __future__ import annotations

import importlib.util
import pathlib
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from app.core.tenancy import with_all_tenants
from app.models.identity import AuthIdentity
from app.models.person import Person, RoleAssignment
from app.models.studio import Studio
from sqlalchemy import select
from sqlalchemy.orm import Session

T0 = datetime(2026, 10, 5, 9, 0, tzinfo=UTC)
_SCOPE = "test drives the platform operator's own bootstrap directly"


def _script() -> Any:
    """The script, loaded as a module. It is a hyphenated file run by path, so there is no
    importable name for it — the same shape `tests/comms/test_the_push_transport.py` uses
    for `generate-vapid-keys.py`."""
    path = pathlib.Path(__file__).resolve().parents[2] / "scripts/bootstrap-owner.py"
    spec = importlib.util.spec_from_file_location("bootstrap_owner", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון בדיקה", slug=f"b-{uuid.uuid4().hex[:8]}")
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def _identity(session: Session) -> AuthIdentity:
    row = AuthIdentity(
        provider="google",
        provider_subject=f"g-{uuid.uuid4()}",
        email=f"{uuid.uuid4().hex[:8]}@example.invalid",
        email_verified=True,
    )
    session.add(row)
    session.commit()
    return row


def test_a_fresh_studio_gets_a_person_as_its_owner(app_session, studio):
    """The branch a new club takes. It must hand back the owner's `Person` — `main` prints
    `.id`, `.first_name` and `.last_name` off it, and `accept_invitation` does not return
    something carrying those."""
    script = _script()
    identity = _identity(app_session)

    owner, wrote = script.ensure_owner(
        app_session,
        studio_id=studio.id,
        identity_id=identity.id,
        email="owner@example.invalid",
        first_name="יובל",
        last_name="סטולין",
        at=T0,
    )

    assert wrote == "owner"
    # The three `main` reads. Each one is an AttributeError on an `AcceptedInvitation`.
    assert owner.first_name == "יובל"
    assert owner.last_name == "סטולין"
    assert isinstance(owner.id, uuid.UUID)
    assert isinstance(owner, Person)
    # And it is a real owner of THIS studio, with the login bound — not a detached object.
    assert owner.auth_identity_id == identity.id
    with with_all_tenants(reason=_SCOPE):
        role = app_session.execute(
            select(RoleAssignment).where(
                RoleAssignment.studio_id == studio.id,
                RoleAssignment.person_id == owner.id,
                RoleAssignment.role == "owner",
                RoleAssignment.revoked_at.is_(None),
            )
        ).scalar_one()
    assert role is not None


def test_running_it_again_writes_nothing_and_names_the_same_person(app_session, studio):
    """ "Idempotent. Re-running against a bootstrapped environment reports what is already
    there and writes nothing" — the script's own docstring, asserted."""
    script = _script()
    identity = _identity(app_session)
    first, _ = script.ensure_owner(
        app_session,
        studio_id=studio.id,
        identity_id=identity.id,
        email="owner@example.invalid",
        first_name="יובל",
        last_name="סטולין",
        at=T0,
    )
    app_session.commit()

    again, wrote = script.ensure_owner(
        app_session,
        studio_id=studio.id,
        identity_id=identity.id,
        email="owner@example.invalid",
        first_name="יובל",
        last_name="סטולין",
        at=T0,
    )

    assert wrote is None
    assert again.id == first.id


def test_a_second_persons_login_is_refused_rather_than_attached(app_session, studio):
    """§3.1 allows exactly one owner. The script reports and rolls back; the step itself
    refuses, so there is no path on which a studio quietly changes hands."""
    script = _script()
    identity = _identity(app_session)
    script.ensure_owner(
        app_session,
        studio_id=studio.id,
        identity_id=identity.id,
        email="owner@example.invalid",
        first_name="יובל",
        last_name="סטולין",
        at=T0,
    )
    app_session.commit()
    stranger = _identity(app_session)

    with pytest.raises(script.OwnerConflictError):
        script.ensure_owner(
            app_session,
            studio_id=studio.id,
            identity_id=stranger.id,
            email="someone@example.invalid",
            first_name="מישהו",
            last_name="אחר",
            at=T0,
        )
