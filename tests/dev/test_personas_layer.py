"""SPEC 19.3's nine personas. Holdback 3.

The list is asserted against 19.3's table because that table is a test plan: each persona
exists to walk one path, and a missing one is a path nobody can reach from the dev bar.
The two most likely to be dropped as uninteresting are the two that guard the most --
`dev+assistant` exists "to verify no financial data leaks" and `dev+none` is the only way
to reach 6.1's two refusal screens without deleting somebody's data.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from app.core.tenancy import with_all_tenants
from app.models.health import HealthFormTemplate
from app.models.identity import AuthIdentity
from app.models.person import Guardian, Person, RoleAssignment
from app.services.demo.fixtures import LATEST_VERSION, PLANNED_LAYERS, SEEDS
from app.services.demo.personas import DEVELOPER_IDENTITY_SUBJECT, PERSONAS, persona_student_id
from app.services.demo.service import DemoStudioService
from sqlalchemy import func, select
from sqlalchemy.orm import Session

_SCOPE = "test reads the demo studio's seeded rows directly"


@pytest.fixture
def reset_demo(app_session: Session) -> Iterator[uuid.UUID]:
    """A freshly reset demo studio. Every assertion below is about what a reset PRODUCES,
    so the reset is the fixture rather than something each test repeats."""
    DemoStudioService.reset(app_session)
    app_session.commit()
    yield DemoStudioService.studio_id(app_session)


def _person(session: Session, studio_id: uuid.UUID, key: str) -> Person:
    with with_all_tenants(reason=_SCOPE):
        return session.execute(
            select(Person)
            .join(AuthIdentity, Person.auth_identity_id == AuthIdentity.id)
            .where(
                Person.studio_id == studio_id,
                AuthIdentity.provider_subject == f"demo-persona-{key}",
            )
        ).scalar_one()


def _roles(session: Session, person: Person) -> list[str]:
    with with_all_tenants(reason=_SCOPE):
        return list(
            session.execute(
                select(RoleAssignment.role).where(
                    RoleAssignment.person_id == person.id, RoleAssignment.revoked_at.is_(None)
                )
            )
            .scalars()
            .all()
        )


def _children(session: Session, person: Person) -> int:
    with with_all_tenants(reason=_SCOPE):
        return session.execute(
            select(func.count()).select_from(Guardian).where(Guardian.person_id == person.id)
        ).scalar_one()


# -- the layer ----------------------------------------------------------------
def test_personas_is_no_longer_planned():
    """The half tests/dev/test_demo_fixtures.py enforces from the other side."""
    assert "personas" not in {layer.name for layer in PLANNED_LAYERS}


def test_personas_is_a_real_layer_in_the_latest_set():
    assert "personas" in {layer.name for layer in SEEDS[LATEST_VERSION].layers}


def test_the_version_was_bumped():
    """A layer added without a version bump means a reset restores the OLD fixture set and
    the new personas silently do not appear."""
    assert LATEST_VERSION != "2026-08-24.1"


# -- 19.3's table -------------------------------------------------------------
def test_all_nine_personas_are_present_in_order():
    assert [p.key for p in PERSONAS] == [
        "owner",
        "manager",
        "lead",
        "assistant",
        "parent3",
        "parent1",
        "trial",
        "both",
        "none",
    ]


def test_there_is_no_student_persona():
    """19.3 -- 'There is no student persona, because students have no login in v1. The
    switcher offers "guardian of דנה" instead and the dev bar says so explicitly, so the
    gap is visible rather than confusing.'"""
    assert "student" not in {p.key for p in PERSONAS}


def test_every_persona_says_what_it_exists_to_test():
    """19.3's right-hand column. A persona with no stated purpose is one nobody knows
    whether they may delete."""
    for persona in PERSONAS:
        assert persona.tests.strip(), persona.key


def test_no_persona_is_given_guardian_as_a_role():
    """3.1 -- 'Guardian is not a role.' A persona seeded with one would make 6.1's two
    access queries collapse into one, and the refusal screens would stop distinguishing
    the apps."""
    assert all(p.role != "guardian" for p in PERSONAS)


# -- what a reset actually produces -------------------------------------------
def test_dev_both_holds_a_role_and_children(app_session, reset_demo):
    """19.3 -- 'lead_coach AND guardian. The dual-role case -- two apps, one identity.'
    3.1's 'never two accounts' has no other test anywhere."""
    person = _person(app_session, reset_demo, "both")
    assert _roles(app_session, person) == ["lead_coach"]
    assert _children(app_session, person) == 2


def test_dev_none_holds_neither(app_session, reset_demo):
    """19.3 -- 'no roles, no children. The refusal screens in both apps.' This persona is
    the only way to reach either screen without deleting real data."""
    person = _person(app_session, reset_demo, "none")
    assert _roles(app_session, person) == []
    assert _children(app_session, person) == 0


def test_dev_assistant_is_an_assistant_coach_and_nothing_more(app_session, reset_demo):
    """19.3 -- 'Attendance only -- used to verify no financial data leaks.' A persona that
    quietly also held manager would make invariant 3 untestable by hand."""
    person = _person(app_session, reset_demo, "assistant")
    assert _roles(app_session, person) == ["assistant_coach"]


def test_dev_parent3_has_three_children_and_parent1_has_one(app_session, reset_demo):
    """19.3's split is exactly 6.3's: parent3 walks the family home, parent1 walks 'the
    single-child path that skips the family layer'. Two personas because the two screens
    differ."""
    assert _children(app_session, _person(app_session, reset_demo, "parent3")) == 3
    assert _children(app_session, _person(app_session, reset_demo, "parent1")) == 1


def test_exactly_one_seeded_identity_carries_the_developer_flag(app_session, reset_demo):
    """19.2. The personas are who you ACT AS; the flag belongs to the one identity that
    may switch between them. Nine flagged identities would be nine accounts able to act
    inside a demo studio in production (19.6 restriction 1)."""
    flagged = (
        app_session.execute(
            select(AuthIdentity.provider_subject).where(AuthIdentity.is_developer.is_(True))
        )
        .scalars()
        .all()
    )
    assert list(flagged) == [DEVELOPER_IDENTITY_SUBJECT]


def test_the_demo_studio_has_its_trial_template_after_a_reset(app_session, reset_demo):
    """Conflict C3, in the studio `dev+trial` exists to walk."""
    with with_all_tenants(reason=_SCOPE):
        count = app_session.execute(
            select(func.count())
            .select_from(HealthFormTemplate)
            .where(HealthFormTemplate.studio_id == reset_demo, HealthFormTemplate.kind == "trial")
        ).scalar_one()
    assert count == 1


# -- 19.7's convergence -------------------------------------------------------
def test_a_reset_restores_the_personas_without_duplicating_them(app_session, reset_demo):
    """19.7 -- 'POST /dev/demo/reset restores the fixture set from a versioned seed.'
    Seeding twice must converge, not accumulate."""
    with with_all_tenants(reason=_SCOPE):
        before = app_session.execute(
            select(func.count()).select_from(Person).where(Person.studio_id == reset_demo)
        ).scalar_one()
    DemoStudioService.reset(app_session)
    app_session.commit()
    with with_all_tenants(reason=_SCOPE):
        after = app_session.execute(
            select(func.count()).select_from(Person).where(Person.studio_id == reset_demo)
        ).scalar_one()
    assert before == after == len(PERSONAS)


def test_a_reset_does_not_accumulate_auth_identities(app_session, reset_demo):
    """`auth_identity` has no studio_id, so it is NOT wiped -- which is correct, because a
    reset must not invalidate a developer's live session. That makes reattaching rather
    than recreating the layer's responsibility, and this is the test that would catch it
    creating a new set per reset."""

    def _count() -> int:
        return app_session.execute(
            select(func.count())
            .select_from(AuthIdentity)
            .where(AuthIdentity.provider_subject.like("demo-persona-%"))
        ).scalar_one()

    before = _count()
    DemoStudioService.reset(app_session)
    app_session.commit()
    assert _count() == before == len(PERSONAS)


def test_the_guardian_links_survive_a_reset_unchanged(app_session, reset_demo):
    """The student ids are derived, not random, so M3's layer can adopt exactly these when
    it lands -- D-M1-1 left guardian.student_id without a foreign key precisely so this
    seam works. Random ids per reset would make the two layers impossible to join."""
    person = _person(app_session, reset_demo, "parent3")
    with with_all_tenants(reason=_SCOPE):
        ids = set(
            app_session.execute(select(Guardian.student_id).where(Guardian.person_id == person.id))
            .scalars()
            .all()
        )
    assert ids == {persona_student_id("parent3", i) for i in range(3)}


def test_every_seeded_row_carries_the_demo_studio_id(app_session, reset_demo):
    """FixtureLayer's docstring: 'A layer's seed callable must set studio_id on every row
    it creates itself' -- DemoStudioService.seed passes a plain Session, so there is no
    stamping on this path. A NULL would fail the insert; the WRONG id would not, and the
    row would be invisible to the next wipe, so it would hide a bug rather than fail.

    Scoped to the rows THIS layer creates, reached through the persona identities. The
    database is shared with every other test in the suite, which creates persons in
    studios of its own -- a global "no Person outside the demo studio" assertion would be
    measuring the rest of the suite, not this seed.
    """
    with with_all_tenants(reason=_SCOPE):
        seeded_person_ids = (
            app_session.execute(
                select(Person.id)
                .join(AuthIdentity, Person.auth_identity_id == AuthIdentity.id)
                .where(AuthIdentity.provider_subject.like("demo-persona-%"))
            )
            .scalars()
            .all()
        )
        assert len(seeded_person_ids) == len(PERSONAS)

        for model, column in (
            (Person, Person.id),
            (RoleAssignment, RoleAssignment.person_id),
            (Guardian, Guardian.person_id),
        ):
            stray = app_session.execute(
                select(func.count())
                .select_from(model)
                .where(column.in_(seeded_person_ids), model.studio_id != reset_demo)
            ).scalar_one()
            assert stray == 0, model.__name__
