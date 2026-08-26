"""SPEC §19.3's nine personas. Holdback 3.

§19.3's table is a test plan, not a cast list: each persona exists to walk one path that
is otherwise awkward to reach. Two are worth naming because they look least interesting
and guard the most -- `dev+assistant` is there "to verify no financial data leaks"
(invariant 3, by hand), and `dev+none` is the only way to reach §6.1's two refusal screens
without deleting somebody's data.

**There is no student persona** (§19.3): students have no login in v1, the switcher offers
"guardian of דנה" instead, and the dev bar says so explicitly so the gap is visible rather
than confusing.

**This module may write `is_developer`.** `app/services/demo/` is one of exactly two
ALLOWED_WRITERS in tests/restrictions/test_04, and §19.2 is why: "set ONLY by a database
seed or migration". Exactly one identity is flagged -- the developer, who switches between
the nine. Flagging the personas themselves would mean nine accounts that may act inside a
demo studio in production (§19.6 restriction 1).

**No stamping on this path.** `DemoStudioService.seed` passes a plain `Session`, so
`TenantMixin`'s `before_flush` never runs and every row below sets its own `studio_id` --
the contract `FixtureLayer`'s docstring states.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.identity import AuthIdentity, PlatformAdmin
from app.models.person import Guardian, Person, RoleAssignment

#: The one flagged identity. A stable subject so a reset does not orphan a session.
DEVELOPER_IDENTITY_SUBJECT = "demo-developer"
DEVELOPER_IDENTITY_EMAIL = "dev@studio.invalid"

#: Fixture rows are stamped at a fixed instant rather than at now(). A reset that wrote
#: the wall clock would make two resets produce different data, and §19.7 exists precisely
#: so the demo studio never drifts into a state that hides a bug.
SEEDED_AT = datetime(2026, 8, 1, 6, 0, tzinfo=UTC)


@dataclass(frozen=True)
class Persona:
    """One row of §19.3's table."""

    key: str
    first_name: str
    last_name: str
    #: A studio-scoped role_assignment, or None. `guardian` is NOT a role (§3.1) and never
    #: appears here -- children are expressed by `children` below, which is what §6.1's
    #: parent-app query actually reads.
    role: str | None
    #: How many students this person is a guardian of. §19.3's parent3 / parent1 split is
    #: exactly §6.3's family-home vs single-child-path split.
    children: int = 0
    #: What §19.3 says this persona exists to test. Carried into the switcher so the
    #: reason is visible where the switch happens rather than only in the spec.
    tests: str = ""


PERSONAS: tuple[Persona, ...] = (
    Persona(
        "owner",
        "עידו",
        "בעלים",
        "owner",
        0,
        "setup wizard, training-year rollover, staff management, studio settings",
    ),
    Persona(
        "manager",
        "מיכל",
        "מנהלת",
        "manager",
        0,
        "enrollment approval, trial conversion, payments, reconciliation queue, reports",
    ),
    Persona(
        "lead",
        "רון",
        "מאמן",
        "lead_coach",
        0,
        "attendance, session edits, events, belt exams, notes",
    ),
    Persona(
        "assistant",
        "נועם",
        "עוזר",
        "assistant_coach",
        0,
        "attendance only -- used to verify no financial data leaks",
    ),
    Persona(
        "parent3",
        "שירה",
        "הורה",
        None,
        3,
        "family home, the three payment options, health gate, RSVP, calendar feed",
    ),
    Persona(
        "parent1",
        "דוד",
        "הורה",
        None,
        1,
        "the single-child path that skips the family layer",
    ),
    Persona(
        "trial",
        "יעל",
        "ניסיון",
        None,
        1,
        "landing page -> booking -> parent app in trial state",
    ),
    Persona(
        "both",
        "אורי",
        "כפול",
        "lead_coach",
        2,
        "the dual-role case -- two apps, one identity",
    ),
    Persona("none", "תמר", "ללא", None, 0, "the refusal screens in both apps"),
)


def persona_student_id(persona_key: str, index: int) -> uuid.UUID:
    """The student id a persona's guardian row points at.

    Deterministic, so a reset does not re-point the links and so M3's `students` layer can
    adopt exactly these ids when it lands (D-M1-1: `guardian.student_id` carries no foreign
    key until then). A random id per reset would make the two layers impossible to join.
    """
    return uuid.uuid5(uuid.NAMESPACE_URL, f"studio-manager/demo-student/{persona_key}/{index}")


def _identity(session: Session, *, subject: str, email: str, is_developer: bool) -> AuthIdentity:
    row = AuthIdentity(
        provider="google",
        provider_subject=subject,
        email=email,
        email_verified=True,
        is_private_relay=False,
        is_developer=is_developer,
        created_at=SEEDED_AT,
    )
    session.add(row)
    session.flush()
    return row


def _identity_for(
    session: Session, *, subject: str, email: str, is_developer: bool
) -> AuthIdentity:
    """Find or create. `auth_identity` has no `studio_id`, so it is not in
    `DemoStudioService.wipe_plan()` and survives a reset -- which is correct (a developer's
    live session must not be invalidated by pressing "reset demo data") and means this
    layer must reattach the existing rows rather than accumulate a new set per reset."""
    existing = session.execute(
        select(AuthIdentity).where(AuthIdentity.provider_subject == subject)
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    return _identity(session, subject=subject, email=email, is_developer=is_developer)


def seed_personas(session: Session, studio_id: uuid.UUID) -> None:
    """§19.3, seeded into the demo studio.

    Every row sets `studio_id` explicitly -- see the module docstring. The wipe removes
    them by `studio_id` on the next reset, which is why a row carrying the wrong one would
    survive and hide a bug rather than fail loudly.
    """
    # §19.2's one legal write of the flag, in one of its two legal places.
    developer = _identity_for(
        session,
        subject=DEVELOPER_IDENTITY_SUBJECT,
        email=DEVELOPER_IDENTITY_EMAIL,
        is_developer=True,
    )

    # Ship-audit D3 -- §16's console was unreachable in development: every §19.3 persona
    # lives inside the demo studio, so nothing could ever exercise studio creation
    # locally. §3.1 says platform_admin is 'seeded manually', and a seed is exactly what
    # this is -- there is still no route anywhere that creates one. Outside production
    # only: the developer identity's subject is not a real OAuth subject, so this row
    # would be inert in production, but a platform-admin row nobody can use is a row
    # nobody should hold.
    if settings.ENV != "production":
        holds_it = session.execute(
            select(PlatformAdmin).where(PlatformAdmin.auth_identity_id == developer.id)
        ).scalar_one_or_none()
        if holds_it is None:
            session.add(PlatformAdmin(auth_identity_id=developer.id, created_at=SEEDED_AT))
            session.flush()

    for persona in PERSONAS:
        identity = _identity_for(
            session,
            subject=f"demo-persona-{persona.key}",
            email=f"dev+{persona.key}@studio.invalid",
            # Not flagged. The personas are who you act AS; only the developer identity
            # above may switch between them.
            is_developer=False,
        )

        person = Person(
            studio_id=studio_id,
            auth_identity_id=identity.id,
            first_name=persona.first_name,
            last_name=persona.last_name,
            locale="he",
            created_at=SEEDED_AT,
        )
        session.add(person)
        session.flush()

        if persona.role is not None:
            session.add(
                RoleAssignment(
                    studio_id=studio_id,
                    person_id=person.id,
                    role=persona.role,
                    scope_type="studio",
                    granted_at=SEEDED_AT,
                    created_at=SEEDED_AT,
                )
            )

        # §3.3 -- 'My children is simply SELECT student_id FROM guardian WHERE
        # person_id = me.' M3 seeds the students these ids point at; until then the link
        # rows are what §6.1's parent-app query and §6.3's family home both read.
        for index in range(persona.children):
            session.add(
                Guardian(
                    studio_id=studio_id,
                    student_id=persona_student_id(persona.key, index),
                    # §5.3 -- 'Exactly one guardian per student carries is_primary.' Each
                    # fixture student has exactly one guardian, so each link is primary;
                    # a second guardian on the same child would have to be added with
                    # is_primary=False or the partial unique index would refuse it.
                    person_id=person.id,
                    is_primary=True,
                    relation="parent",
                    created_at=SEEDED_AT,
                )
            )
        session.flush()
