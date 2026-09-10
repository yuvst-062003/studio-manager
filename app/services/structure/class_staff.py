"""Who coaches a class, and the rule that only they may be assigned to it.

Owner, 2026-09-09: "per class there is its own class main coach and assistance coaches.
They are not shareable between classes. If a coach is in both, the studio manager needs to
add his details in both classes. And only class coaches can be assigned to the class."

Two halves, and the second is the one with teeth:

  * THE ROSTER. `class_staff` holds one live row per (class, person), so a coach genuinely
    belongs to a class rather than being inferred from the groups they happen to be on. A
    person who teaches judo and karate is added twice and removed once.
  * THE RULE. `admit_to_group` refuses to put a coach on a group of a class somebody ELSE
    coaches, and admits a coach who belongs to no class yet. It lives here, next to the
    roster it reads, because a picker that merely HIDES an outsider is a picker an API call
    goes around.

**A studio manager and the owner are exempt**, on the owner's own instruction ("studio
managers are allowed"). They are studio-wide staff by definition -- scoping them to a class
would be the class-manager feature refusing the very people it exempts -- and they are also
who does the assigning. A CLASS-scoped manager is not exempt: their whole point is that one
class is the limit of their reach.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.models.person import Person, RoleAssignment
from app.models.structure import CLASS_STAFF_ROLES, ClassStaff, Group, GroupStaff
from app.models.structure import Class as StudioClass
from app.services.people.naming import format_person_name


class ClassStaffNotFoundError(LookupError):
    """A class, person or roster row this studio cannot see.

    Not distinguished from "does not exist anywhere", for the same reason the rest of this
    lane does not distinguish them: the tenant filter hides another studio's rows, and a 403
    would confirm one is real.
    """


class NotAClassCoachError(Exception):
    """Someone was about to be assigned to a class they do not coach.

    Carries the class NAME and not only its id, because the manager's next action is to add
    that coach to that class, and they cannot do it if the message will not say which one.
    """


class StillCoachingError(Exception):
    """A coach cannot leave a class's roster while they still hold one of its groups."""


class BadClassRoleError(Exception):
    """A role that is neither `lead_coach` nor `assistant_coach`."""


#: Roles that reach every class without being on any roster. Studio-scoped by definition:
#: an `owner` or a studio `manager` runs the whole studio, and the owner asked for them to
#: stay unrestricted. Checked against a role assignment's SCOPE as well as its name, so a
#: class-scoped manager never slips through on the word "manager" alone.
STUDIO_WIDE_ROLES = ("owner", "manager")


@dataclass(frozen=True, slots=True)
class ClassCoachRow:
    """One coach of one class, as a screen reads them."""

    person_id: uuid.UUID
    display_name: str
    role: str
    from_date: date


class ClassStaffService:
    """The roster, and the rule that reads it."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- the roster -----------------------------------------------------------
    def coaches(self, class_id: uuid.UUID) -> list[ClassCoachRow]:
        """This class's live coaches, main coach first.

        Ordered by role then name: `lead_coach` sorts before `assistant_coach`
        alphabetically, which happens to be the order a screen wants -- so it is stated
        with an explicit CASE rather than relying on that coincidence, because renaming
        either role would silently reorder every roster in the product.
        """
        rows = self._session.execute(
            select(ClassStaff, Person)
            .join(Person, Person.id == ClassStaff.person_id)
            .where(ClassStaff.class_id == class_id, ClassStaff.to_date.is_(None))
            .order_by(
                # 0 for the main coach, 1 for everyone else.
                (ClassStaff.role != "lead_coach"),
                Person.first_name,
                Person.last_name,
            )
        ).all()
        return [
            ClassCoachRow(
                person_id=staff.person_id,
                display_name=format_person_name(person.first_name, person.last_name),
                role=staff.role,
                from_date=staff.from_date,
            )
            for staff, person in rows
        ]

    def add_coach(
        self,
        studio_id: uuid.UUID,
        class_id: uuid.UUID,
        person_id: uuid.UUID,
        *,
        role: str,
        from_date: date,
    ) -> tuple[ClassStaff, bool]:
        """Put a person on this class's roster.

        Returns `(row, created)` so the router can answer 201 or 200 honestly -- adding a
        coach who is already on the roster creates nothing, and a 409 would make a correct
        retry look like a failure. Changing an existing coach's role is a real edit and IS
        applied, because "make this person the main coach" is the same sentence a manager
        would say to add them.
        """
        if role not in CLASS_STAFF_ROLES:
            raise BadClassRoleError(f"role must be one of {', '.join(CLASS_STAFF_ROLES)}")
        if self._session.get(StudioClass, class_id) is None:
            raise ClassStaffNotFoundError(f"no class {class_id}")
        if self._session.get(Person, person_id) is None:
            raise ClassStaffNotFoundError(f"no person {person_id}")

        existing = self._session.execute(
            select(ClassStaff).where(
                ClassStaff.class_id == class_id,
                ClassStaff.person_id == person_id,
                ClassStaff.to_date.is_(None),
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.role = role
            self._session.flush()
            return existing, False

        row = ClassStaff(
            studio_id=studio_id,
            class_id=class_id,
            person_id=person_id,
            role=role,
            from_date=from_date,
        )
        self._session.add(row)
        self._session.flush()
        return row, True

    def remove_coach(self, class_id: uuid.UUID, person_id: uuid.UUID, *, on: date) -> None:
        """Close the row rather than delete it -- who taught a class last year is history
        the attendance rows already point at.

        **Refused while that person still coaches one of this class's groups.** Removing
        them from the class while leaving them on its Tuesday group would leave an
        assignment the rule below says is illegal, created by the very act meant to tidy
        up -- and the next person to read it could not tell whether it was a bug or an
        exception somebody meant.
        """
        row = self._session.execute(
            select(ClassStaff).where(
                ClassStaff.class_id == class_id,
                ClassStaff.person_id == person_id,
                ClassStaff.to_date.is_(None),
            )
        ).scalar_one_or_none()
        if row is None:
            raise ClassStaffNotFoundError(f"{person_id} does not coach {class_id}")

        still_on = self._session.execute(
            select(Group.name)
            .join(GroupStaff, GroupStaff.group_id == Group.id)
            .where(
                Group.class_id == class_id,
                GroupStaff.person_id == person_id,
                GroupStaff.to_date.is_(None),
            )
            .limit(1)
        ).scalar_one_or_none()
        if still_on is not None:
            raise StillCoachingError(f"remove them from the group '{still_on}' first")

        row.to_date = on
        self._session.flush()

    def classes_coached_by(self, person_id: uuid.UUID) -> set[uuid.UUID]:
        """Every class this person is a live coach of."""
        return set(
            self._session.execute(
                select(ClassStaff.class_id).where(
                    ClassStaff.person_id == person_id, ClassStaff.to_date.is_(None)
                )
            )
            .scalars()
            .all()
        )

    # -- the rule -------------------------------------------------------------
    def is_studio_wide(self, person_id: uuid.UUID) -> bool:
        """True for the owner and for a STUDIO-scoped manager.

        `scope_type` is checked, not just the role name. A class-scoped manager holds a row
        whose role is literally `'manager'`, and reading the name alone would hand them the
        exemption that exists precisely to be wider than they are.
        """
        return (
            self._session.execute(
                select(RoleAssignment.id)
                .where(
                    RoleAssignment.person_id == person_id,
                    RoleAssignment.role.in_(STUDIO_WIDE_ROLES),
                    RoleAssignment.scope_type == "studio",
                    RoleAssignment.revoked_at.is_(None),
                )
                .limit(1)
            ).first()
            is not None
        )

    def may_coach_class(self, person_id: uuid.UUID, class_id: uuid.UUID) -> bool:
        if self.is_studio_wide(person_id):
            return True
        return class_id in self.classes_coached_by(person_id)

    def admit_to_group(
        self, studio_id: uuid.UUID, person_id: uuid.UUID, group_id: uuid.UUID, *, role: str
    ) -> None:
        """The rule, at the point a coach is put on a group.

        Three cases, and the middle one is the whole design:

          * **Already coaches this class, or is studio-wide** -- allowed, nothing to do.
          * **Coaches a DIFFERENT class and not this one** -- REFUSED, with the class named.
            This is the mistake the owner asked to catch: karate's coach landing on a judo
            group. "This action is not yours" would be true and useless, because the
            manager's next move is to add them to judo and they cannot do it if the refusal
            will not say which class it means.
          * **Coaches no class at all** -- this assignment ADMITS them to the class, at the
            same role. A manager putting a new coach on a judo group is saying "this person
            coaches judo"; refusing that would leave no way to place a coach for the first
            time at all -- it would break every staff INVITATION that names a group, which
            is how coaches actually arrive. The guarantee the rule exists for still holds
            afterwards: anyone on a judo group is on judo's roster.

        So the rule is not "the roster must already say so", it is "the roster and the
        groups can never disagree" -- which is the property the pickers, the reads and the
        removal guard all depend on.
        """
        group = self._session.get(Group, group_id)
        if group is None:
            raise ClassStaffNotFoundError(f"no group {group_id}")
        if self.may_coach_class(person_id, group.class_id):
            return
        if self.classes_coached_by(person_id):
            self.require_may_coach_class(person_id, group.class_id)
            return
        self.add_coach(
            studio_id,
            group.class_id,
            person_id,
            role=role if role in CLASS_STAFF_ROLES else "assistant_coach",
            # `app.core.clock.now()` is the ONLY clock in `app/` -- a bare
            # `date.today()` is unshiftable by `X-Dev-Now` and fails the restriction
            # test that keeps every date in the product on one timeline.
            from_date=now().date(),
        )

    def require_may_coach_class(self, person_id: uuid.UUID, class_id: uuid.UUID) -> None:
        if self.may_coach_class(person_id, class_id):
            return
        klass = self._session.get(StudioClass, class_id)
        name = klass.name if klass is not None else str(class_id)
        raise NotAClassCoachError(
            f"this coach is not on the staff of '{name}' — add them to that class first"
        )
