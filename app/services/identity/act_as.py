"""SPEC §19.4's role switcher, as a service.

The route lives in app/routers/dev.py, which app/main.py's discovery loop does not even
register when `ENV == production` (§19.6 restriction 2). This module is the layer *below*
that, and it refuses independently: restriction 2 is the mechanism, and this is the belt.
A guardrail whose only enforcement is "the router is absent" is one accidental mount away
from being no guardrail at all.

`developer_may_act` is the same pure function tests/restrictions/test_01 asserts all eight
rows of. Calling it here rather than re-implementing the rule is the point -- one truth
table, two call sites (this and the studio resolver), and no way for them to drift.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dev_account import developer_may_act
from app.core.tenancy import with_all_tenants
from app.models.identity import AuthIdentity
from app.models.person import Guardian, Person, RoleAssignment
from app.models.studio import Studio
from app.services.demo.personas import PERSONAS

_SWITCHER_SCOPE = (
    "SPEC 19.4 -- the role switcher resolves a persona before any studio is active, and "
    "19.1 lets it reach any studio in a non-production environment"
)


class ActAsRefusedError(Exception):
    """§19.6 restriction 1, or a person who does not exist.

    One exception for both, deliberately: the caller's response is 403 either way, and
    distinguishing them would let a developer session enumerate person ids in a studio it
    is not allowed to act in.
    """


@dataclass(frozen=True)
class ResolvedPersona:
    #: §19.3's key (`owner`, `parent3`, ...), or None for a Person who is not one of the
    #: nine. Carried rather than re-derived from the label so the dev bar can order the
    #: dropdown by §19.3's table without matching on display text.
    key: str | None
    person_id: uuid.UUID
    studio_id: uuid.UUID
    studio_is_demo: bool
    label: str
    roles: tuple[str, ...]
    is_guardian: bool
    #: §19.3's right-hand column -- what this persona exists to test. Carried to the dev
    #: bar so the reason is visible where the switch happens.
    tests: str = ""


#: §19.3 -- 'There is no student persona, because students have no login in v1. The
#: switcher offers "guardian of דנה" instead and the dev bar says so explicitly, so the
#: gap is visible rather than confusing.' Served as data so the client states the gap in
#: the spec's own terms rather than hardcoding a sentence that can drift from it.
NO_STUDENT_PERSONA_NOTE = (
    "אין פרסונת תלמיד — לתלמידים אין התחברות בגרסה 1, ולכן המחליף מציע 'הורה של…' במקום"
)

_PERSONA_PURPOSE = {persona.key: persona.tests for persona in PERSONAS}


def _persona_key(subject: str | None) -> str | None:
    prefix = "demo-persona-"
    return subject[len(prefix) :] if subject and subject.startswith(prefix) else None


def _describe(session: Session, person: Person, studio: Studio) -> ResolvedPersona:
    roles = tuple(
        session.execute(
            select(RoleAssignment.role)
            .where(RoleAssignment.person_id == person.id, RoleAssignment.revoked_at.is_(None))
            .order_by(RoleAssignment.role)
        )
        .scalars()
        .all()
    )
    is_guardian = (
        session.execute(select(Guardian.id).where(Guardian.person_id == person.id).limit(1)).first()
        is not None
    )
    subject = (
        session.execute(
            select(AuthIdentity.provider_subject).where(AuthIdentity.id == person.auth_identity_id)
        ).scalar_one_or_none()
        if person.auth_identity_id
        else None
    )
    key = _persona_key(subject)
    return ResolvedPersona(
        key=key,
        person_id=person.id,
        studio_id=studio.id,
        studio_is_demo=studio.is_demo,
        label=f"{person.first_name} {person.last_name}",
        roles=roles,
        is_guardian=is_guardian,
        tests=_PERSONA_PURPOSE.get(key or "", ""),
    )


def resolve_persona(
    session: Session, *, person_id: uuid.UUID, env: str, studio_is_demo: bool | None = None
) -> ResolvedPersona:
    """Who am I about to become, and am I allowed to?

    `studio_is_demo` is an override for tests that need to drive the decision without a
    row; production always reads it from the studio.
    """
    with with_all_tenants(reason=_SWITCHER_SCOPE):
        person = session.get(Person, person_id)
        if person is None:
            raise ActAsRefusedError("no such person")
        studio = session.get(Studio, person.studio_id)
        if studio is None:
            raise ActAsRefusedError("no such studio")

        is_demo = studio.is_demo if studio_is_demo is None else studio_is_demo
        if not developer_may_act(is_developer=True, studio_is_demo=is_demo, env=env):
            raise ActAsRefusedError(
                "a developer session may only act inside a demo studio in production"
            )
        return _describe(session, person, studio)


def switchable_personas(session: Session, *, env: str) -> list[ResolvedPersona]:
    """What the dev bar's dropdown renders.

    Only personas the caller could actually switch INTO, filtered by the same rule the
    switch itself applies -- offering one that would be refused is a dropdown with a
    trapdoor in it.
    """
    with with_all_tenants(reason=_SWITCHER_SCOPE):
        rows = (
            session.execute(
                select(Person, Studio)
                .join(AuthIdentity, Person.auth_identity_id == AuthIdentity.id)
                .join(Studio, Person.studio_id == Studio.id)
                .where(AuthIdentity.provider_subject.like("demo-persona-%"))
                .order_by(Person.created_at, Person.id)
            )
            .tuples()
            .all()
        )
        resolved = [
            _describe(session, person, studio)
            for person, studio in rows
            if developer_may_act(is_developer=True, studio_is_demo=studio.is_demo, env=env)
        ]

    # §19.3's table order, which is the order the dev bar draws them in. The seed writes
    # them in that order today, but a persona added by a later milestone -- or a fixture
    # restored in a different order -- would otherwise reorder the dropdown under the
    # developer's fingers between one reset and the next.
    order = {persona.key: index for index, persona in enumerate(PERSONAS)}
    return sorted(resolved, key=lambda item: order.get(item.key or "", len(order)))
