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

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tenancy import get_current_studio_id
from app.models.person import Invitation, Person, RoleAssignment
from app.models.structure import Group, GroupStaff
from app.services.audit import AuditService

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
    pending = _pending_invitations(session, at=at)
    # F5 pre-creates the Person and the role assignments at invite time (§5.3's
    # binding), so without this filter an invited coach would list twice — once
    # "active" through their pre-created roles and once "invited". The pending
    # invitation is the true state until someone accepts it.
    pending_emails = {row["email"] for row in pending if row["email"]}
    people = [row for row in _people(session) if row["email"] not in pending_emails]
    # F8 — the שעות שבוע column measures now that sessions exist. 0 IS the measurement
    # for a person staffing nothing this week.
    hours = weekly_hours_by_person(session, at=at)
    for entry in people:
        entry["weekly_hours"] = hours.get(uuid.UUID(entry["person_id"]), 0.0)
    return {
        "items": [*people, *pending],
        "groups_without_coach": _uncovered_groups(session),
        "sessions_without_coach": _uncovered_sessions_count(session, at=at),
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
            "invitation_id": str(invitation.id),
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


# -- F8: weekly hours, now that sessions exist ------------------------------------------


def weekly_hours_by_person(session: Session, *, at: datetime) -> dict[uuid.UUID, float]:
    """שעות שבוע, measured: the summed duration of this week's sessions per staffed
    person. The week is the Jerusalem week containing `at` (Sunday-first, §16), and a
    cancelled session does not count — a coach is not loaded by a lesson that is not
    happening."""
    from zoneinfo import ZoneInfo

    from app.models.schedule import Session as SessionRow
    from app.models.schedule import SessionStaff

    local = at.astimezone(ZoneInfo("Asia/Jerusalem"))
    week_start = (local - timedelta(days=(local.weekday() + 1) % 7)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_end = week_start + timedelta(days=7)
    rows = session.execute(
        select(SessionStaff.person_id, SessionRow.starts_at, SessionRow.ends_at)
        .join(SessionRow, SessionRow.id == SessionStaff.session_id)
        .where(
            SessionRow.starts_at >= week_start,
            SessionRow.starts_at < week_end,
            SessionRow.status != "cancelled",
        )
    ).all()
    totals: dict[uuid.UUID, float] = {}
    for person_id, starts_at, ends_at in rows:
        hours = (ends_at - starts_at).total_seconds() / 3600
        totals[person_id] = round(totals.get(person_id, 0.0) + hours, 2)
    return totals


# -- F5: the lifecycle ------------------------------------------------------------------

#: The roles a MANAGER may grant. `owner` is §3.1's exactly-one and moves only through
#: the platform's transfer path; `guardian` is not a role at all.
GRANTABLE_ROLES: tuple[str, ...] = ("manager", "lead_coach", "assistant_coach")

INVITATION_TTL_DAYS = 14


class StaffError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _require_studio() -> uuid.UUID:
    studio_id = get_current_studio_id()
    if studio_id is None:  # pragma: no cover — TenantSessionDep fails closed before this
        raise StaffError("no_studio")
    return studio_id


def invite_staff(
    session: Session,
    *,
    email: str,
    roles: list[str],
    first_name: str | None,
    last_name: str | None,
    actor_person_id: uuid.UUID | None,
    at: datetime,
) -> tuple[Invitation, str]:
    """F5, on `invite_owner`'s pattern: the Person and the role assignments are created
    NOW, unattached to any login, and accepting merely binds an identity to them (§5.3).
    The plaintext token is returned exactly once; only its hash is stored. There is no
    mailer anywhere in this product — the link is handed to the manager to share, the
    same way the platform's owner invite and §5.4b's onboarding link work."""
    if not roles or any(role not in GRANTABLE_ROLES for role in roles):
        raise StaffError("bad_roles")

    person = Person(
        studio_id=_require_studio(),
        auth_identity_id=None,
        first_name=first_name or "",
        last_name=last_name or "",
        email=email,
        created_at=at,
    )
    session.add(person)
    session.flush()
    for role in sorted(set(roles)):
        session.add(
            RoleAssignment(
                studio_id=person.studio_id,
                person_id=person.id,
                role=role,
                scope_type="studio",
                granted_at=at,
                created_at=at,
            )
        )
    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        studio_id=person.studio_id,
        email=email,
        intended_role=sorted(set(roles))[0],
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        expires_at=at + timedelta(days=INVITATION_TTL_DAYS),
        created_at=at,
    )
    session.add(invitation)
    session.flush()
    AuditService.record(
        session,
        action="staff.invited",
        entity_type="invitation",
        entity_id=invitation.id,
        actor_person_id=actor_person_id,
        # The email and the roles, never the token: an audit row holding a live
        # credential would be a credential store with an append-only grant on it.
        diff={"email": email, "roles": sorted(set(roles))},
    )
    return invitation, token


def _pending_invitation(session: Session, invitation_id: uuid.UUID) -> Invitation:
    invitation = session.get(Invitation, invitation_id)
    if invitation is None or invitation.accepted_at is not None:
        raise StaffError("not_found")
    return invitation


def resend_invitation(
    session: Session,
    invitation_id: uuid.UUID,
    *,
    actor_person_id: uuid.UUID | None,
    at: datetime,
) -> tuple[Invitation, str]:
    """A new token and a fresh expiry. The old token dies with its hash — a re-send that
    kept the old link alive would double the credential's surface for no one's benefit."""
    invitation = _pending_invitation(session, invitation_id)
    token = secrets.token_urlsafe(32)
    invitation.token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    invitation.expires_at = at + timedelta(days=INVITATION_TTL_DAYS)
    session.flush()
    AuditService.record(
        session,
        action="staff.invitation_resent",
        entity_type="invitation",
        entity_id=invitation.id,
        actor_person_id=actor_person_id,
        diff={"email": invitation.email},
    )
    return invitation, token


def revoke_invitation(
    session: Session,
    invitation_id: uuid.UUID,
    *,
    actor_person_id: uuid.UUID | None,
    at: datetime,
) -> None:
    """Expires the invitation NOW and revokes the pre-created role assignments, so the
    person row (which may hold nothing else) stops being staff-in-waiting."""
    invitation = _pending_invitation(session, invitation_id)
    invitation.expires_at = at
    if invitation.email:
        person = (
            session.execute(
                select(Person).where(
                    Person.email == invitation.email, Person.auth_identity_id.is_(None)
                )
            )
            .scalars()
            .first()
        )
        if person is not None:
            for assignment in session.execute(
                select(RoleAssignment).where(
                    RoleAssignment.person_id == person.id, RoleAssignment.revoked_at.is_(None)
                )
            ).scalars():
                assignment.revoked_at = at
    session.flush()
    AuditService.record(
        session,
        action="staff.invitation_revoked",
        entity_type="invitation",
        entity_id=invitation.id,
        actor_person_id=actor_person_id,
        diff={"email": invitation.email},
    )


def change_roles(
    session: Session,
    person_id: uuid.UUID,
    *,
    roles: list[str],
    actor_person_id: uuid.UUID | None,
    at: datetime,
) -> None:
    """Grants and revocations reconciled against the wanted set. `owner` is untouchable
    from here in both directions (§3.1: exactly one, cannot be removed)."""
    if not roles or any(role not in GRANTABLE_ROLES for role in roles):
        raise StaffError("bad_roles")
    person = session.get(Person, person_id)
    if person is None:
        raise StaffError("not_found")
    wanted = set(roles)
    current = list(
        session.execute(
            select(RoleAssignment).where(
                RoleAssignment.person_id == person_id,
                RoleAssignment.revoked_at.is_(None),
                RoleAssignment.role.in_(STAFF_ROLES),
            )
        ).scalars()
    )
    if any(assignment.role == "owner" for assignment in current) and "owner" not in wanted:
        # The owner keeps ownership through a role edit; §18's transfer path is the only
        # door. Everything else about them may still change.
        wanted.add("owner")
    for assignment in current:
        if assignment.role not in wanted:
            assignment.revoked_at = at
    have = {assignment.role for assignment in current if assignment.role in wanted}
    for role in sorted(wanted - have):
        if role == "owner":
            continue
        session.add(
            RoleAssignment(
                studio_id=person.studio_id,
                person_id=person_id,
                role=role,
                scope_type="studio",
                granted_at=at,
                created_at=at,
            )
        )
    session.flush()
    AuditService.record(
        session,
        action="staff.roles_changed",
        entity_type="person",
        entity_id=person_id,
        actor_person_id=actor_person_id,
        diff={"roles": sorted(wanted)},
    )


def deactivate(
    session: Session,
    person_id: uuid.UUID,
    *,
    actor_person_id: uuid.UUID | None,
    at: datetime,
) -> None:
    """Ends the membership. Never a delete — the person holds audit rows, session
    assignments and attendance marks; deactivation is revoking the role assignments and
    closing the live group assignments.

    **The only-lead-coach rule (F5's deferred decision): refuse.** A group whose only
    lead coach is being deactivated answers 409 with the group names; the manager
    reassigns first. Forcing a reassignment inside the deactivate call would bury a
    scheduling decision inside an HR action, and a silent orphaning is exactly the
    uncovered-groups banner's defect class. The owner cannot be deactivated at all
    (§3.1: cannot be removed).
    """
    assignments = list(
        session.execute(
            select(RoleAssignment).where(
                RoleAssignment.person_id == person_id,
                RoleAssignment.revoked_at.is_(None),
                RoleAssignment.role.in_(STAFF_ROLES),
            )
        ).scalars()
    )
    if not assignments:
        raise StaffError("not_found")
    if any(assignment.role == "owner" for assignment in assignments):
        raise StaffError("owner_immovable")

    sole_lead_groups = [
        name
        for (name,) in session.execute(
            select(Group.name)
            .join(GroupStaff, GroupStaff.group_id == Group.id)
            .where(
                GroupStaff.person_id == person_id,
                GroupStaff.role == "lead_coach",
                GroupStaff.to_date.is_(None),
                Group.is_active.is_(True),
            )
        ).all()
        if session.execute(
            select(GroupStaff.id)
            .join(Group, Group.id == GroupStaff.group_id)
            .where(
                Group.name == name,
                GroupStaff.role == "lead_coach",
                GroupStaff.to_date.is_(None),
                GroupStaff.person_id != person_id,
            )
            .limit(1)
        ).first()
        is None
    ]
    if sole_lead_groups:
        raise SoleLeadCoachError(sole_lead_groups)

    for assignment in assignments:
        assignment.revoked_at = at
    for group_assignment in session.execute(
        select(GroupStaff).where(GroupStaff.person_id == person_id, GroupStaff.to_date.is_(None))
    ).scalars():
        group_assignment.to_date = at.date()
    session.flush()
    AuditService.record(
        session,
        action="staff.deactivated",
        entity_type="person",
        entity_id=person_id,
        actor_person_id=actor_person_id,
        diff={"roles_revoked": sorted(a.role for a in assignments)},
    )


class SoleLeadCoachError(Exception):
    def __init__(self, groups: list[str]) -> None:
        super().__init__("sole_lead_coach")
        self.groups = groups


def _uncovered_sessions_count(session: Session, *, at: datetime) -> int:
    """F8 sharpened 3d's banner to the resolution it was drawn at: sessions THIS WEEK
    with nobody staffing them. The group-level banner stays — they answer different
    questions ("who owns this group" vs "who is on the mat on Tuesday")."""
    from zoneinfo import ZoneInfo

    from app.models.schedule import Session as SessionRow
    from app.models.schedule import SessionStaff

    local = at.astimezone(ZoneInfo("Asia/Jerusalem"))
    week_start = (local - timedelta(days=(local.weekday() + 1) % 7)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_end = week_start + timedelta(days=7)
    staffed = select(SessionStaff.session_id)
    return len(
        session.execute(
            select(SessionRow.id).where(
                SessionRow.starts_at >= week_start,
                SessionRow.starts_at < week_end,
                SessionRow.status == "scheduled",
                SessionRow.id.not_in(staffed),
            )
        ).all()
    )
