"""§6.1's profile tab -- the guardian's own record, written by the guardian.

Screen 8 of the parent redesign. `GET /me/guardians` shipped read-only, so the tab the
design calls *"the only screen in the app that is about the parent rather than their
children"* carried nothing a parent could actually change: their own name, email and phone
were readable and frozen.

**The person id is never a parameter a caller chooses.** The router reads it from the
verified session and hands it here. §5.3's *"all guardians are equal ... there is one
guardian view in the app and no permission branching inside it"* is about what each parent
may do to their OWN record; it is not a licence to rewrite the co-parent's phone number.
The absence of any route shape that could address another person is what makes that true,
rather than a check someone could later forget.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.person import Person
from app.services.audit import AuditService
from app.services.people.errors import NotFoundError

#: What the profile tab may write. Everything else on `person` -- the national id, the
#: aliyah year, the address, the birthdate -- is registration's, collected once under a
#: signature, and is deliberately not editable from a settings screen.
EDITABLE = ("first_name", "last_name", "phone", "email")


class ProfileService:
    """The caller's own contact details. One purpose, one person: themselves."""

    @staticmethod
    def get(session: Session, *, person_id: uuid.UUID) -> Person:
        """Read through a `select`, never `Session.get`.

        `TenantSession` filters queries by the active studio; a primary-key fetch can be
        served straight from the identity map and skip that filter, which is exactly the
        fail-open this codebase's tenancy is built to refuse.
        """
        person = session.scalars(select(Person).where(Person.id == person_id)).first()
        if person is None:
            raise NotFoundError("person")
        return person

    @staticmethod
    def update_own(
        session: Session,
        *,
        person_id: uuid.UUID,
        fields: dict[str, Any],
    ) -> Person:
        """Apply only the fields the request actually carried.

        `fields` is the set the caller SENT, so clearing a phone number (an explicit
        `null`) stays distinguishable from leaving it alone (absent). That distinction is
        the reason this does not call `StudentService.update`, whose `value is not None`
        guard collapses the two and would make a phone number unclearable.
        """
        person = ProfileService.get(session, person_id=person_id)
        changed: list[str] = []
        for field in EDITABLE:
            if field not in fields:
                continue
            value = fields[field]
            if getattr(person, field) == value:
                continue
            setattr(person, field, value)
            changed.append(field)
        if changed:
            AuditService.record(
                session,
                action="person.self_updated",
                entity_type="person",
                entity_id=person.id,
                studio_id=person.studio_id,
                actor_person_id=person_id,
                # The FIELD NAMES that changed, never the values -- the same rule
                # `StudentService.update` follows. Here the subject is the actor, which
                # makes the record a history the parent themselves may be shown.
                diff={"fields": sorted(changed)},
            )
        session.flush()
        return person
