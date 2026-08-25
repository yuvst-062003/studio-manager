"""Dashboard artboard 3d (צוות) — who works here, what they may do, and what is uncovered.

Two of 3d's six columns are honestly out of M1's reach, and are reported as absent rather
than invented:

  **שעות שבוע** — weekly load is `group_schedule_rule` × `session`, both W2 contract
  models. `weekly_hours` is `None`, and the screen says why. Returning 0 would report an
  idle coach, which is a measurement rather than a gap.

  **the banner** — 3d draws '2 שיעורים השבוע ללא מאמן', which needs materialised sessions.
  M1 answers the same question one level up: which GROUPS have no coach at all. That is
  the defect the banner exists for, and it is computable today. W2's SCHEDULE lane sharpens
  it to sessions.

Permissions are **derived from §3.2's matrix**, never stored. A per-person permission list
would be a second source of truth for a table SPEC already fixes, and the two would
disagree the first time the matrix changed.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.person import Invitation, Person, RoleAssignment
from app.models.structure import Group, GroupStaff

#: §3.1 — 'guardian' is not a role. It appears in `invitation.intended_role` and nowhere
#: on a staff screen.
STAFF_ROLES: tuple[str, ...] = ("owner", "manager", "lead_coach", "assistant_coach")

#: §3.2's matrix, as the capability names 3d's הרשאות chips render. Only the rows a
#: manager would check at a glance — the full matrix is SPEC's, not a UI list.
ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "owner": ("studio_settings", "staff", "students", "attendance", "money", "reports"),
    "manager": ("studio_settings", "staff", "students", "attendance", "money", "reports"),
    # §3.2's hard rule: 'coaches never see money. No charge, payment, debt or price is
    # reachable from any coach-scoped endpoint or screen.' `money` is absent here and
    # that absence is asserted by a test.
    "lead_coach": ("own_groups", "attendance", "sessions", "events"),
    "assistant_coach": ("own_groups", "attendance"),
}


def permissions_for(roles: list[str]) -> list[str]:
    granted: set[str] = set()
    for role in roles:
        granted.update(ROLE_PERMISSIONS.get(role, ()))
    return sorted(granted)


def list_staff(session: Session, *, at: datetime) -> dict[str, Any]:
    """One payload for one screen. 3d is a single view, so it makes a single request."""
    return {
        "items": [*_people(session), *_pending_invitations(session, at=at)],
        "groups_without_coach": _uncovered_groups(session),
    }


def _people(session: Session) -> list[dict[str, Any]]:
    # revoked_at IS NULL is the whole definition of 'currently staff' — §4.3 makes
    # role_assignment revocable rather than deletable, so filtering on it is not an
    # optimisation, it is the rule.
    rows = session.execute(
        select(Person, RoleAssignment.role)
        .join(RoleAssignment, RoleAssignment.person_id == Person.id)
        .where(RoleAssignment.revoked_at.is_(None), RoleAssignment.role.in_(STAFF_ROLES))
        .order_by(Person.last_name, Person.first_name)
    ).all()

    by_person: dict[uuid.UUID, dict[str, Any]] = {}
    for person, role in rows:
        entry = by_person.setdefault(
            person.id,
            {
                "person_id": str(person.id),
                "first_name": person.first_name,
                "last_name": person.last_name,
                "email": person.email,
                "roles": [],
                "groups": [],
                # W2's, and named as absent rather than guessed at.
                "weekly_hours": None,
                "permissions": [],
                "status": "active",
            },
        )
        if role not in entry["roles"]:
            entry["roles"].append(role)

    if by_person:
        assignments = session.execute(
            select(GroupStaff.person_id, Group.id, Group.name)
            .join(Group, Group.id == GroupStaff.group_id)
            .where(GroupStaff.person_id.in_(by_person), GroupStaff.to_date.is_(None))
            .order_by(Group.name)
        ).all()
        for person_id, group_id, group_name in assignments:
            by_person[person_id]["groups"].append({"id": str(group_id), "name": group_name})

    for entry in by_person.values():
        # §3.3 — 'A coach who is also a parent is one Person with two role assignments.'
        # Sorted so the row is stable between requests.
        entry["roles"].sort()
        entry["permissions"] = permissions_for(entry["roles"])
    return list(by_person.values())


def _pending_invitations(session: Session, *, at: datetime) -> list[dict[str, Any]]:
    """An invitation is not a coach yet, and a table that omitted it would make a manager
    invite the same person a second time."""
    rows = session.execute(
        select(Invitation)
        .where(
            Invitation.accepted_at.is_(None),
            Invitation.expires_at > at,
            Invitation.intended_role.in_(STAFF_ROLES),
        )
        .order_by(Invitation.created_at)
    ).scalars()
    return [
        {
            "person_id": None,
            "first_name": None,
            "last_name": None,
            "email": invitation.email,
            "roles": [invitation.intended_role],
            "groups": [],
            "weekly_hours": None,
            "permissions": permissions_for([invitation.intended_role]),
            "status": "invited",
        }
        for invitation in rows
    ]


def _uncovered_groups(session: Session) -> list[dict[str, Any]]:
    live_coaches = select(GroupStaff.group_id).where(GroupStaff.to_date.is_(None))
    rows = session.execute(
        select(Group.id, Group.name)
        # An archived group has no sessions to leave uncovered, so listing it would be a
        # standing red banner nobody can clear.
        .where(Group.is_active.is_(True), Group.id.not_in(live_coaches))
        .order_by(Group.name)
    ).all()
    return [{"id": str(group_id), "name": name} for group_id, name in rows]
