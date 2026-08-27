"""F9 -- the dashboard's global search.

One query, four kinds: students (by their own name, by a guardian's name, or by a
guardian's phone -- a manager on the telephone knows the parent, not always the child),
guardians, groups and staff. Everything rides the tenant filter -- `TenantSession` fails
closed, so a missing studio raises rather than returning every studio's rows, and the
test asserts a second studio's rows never appear.

Nothing here touches a health declaration: names, phones, groups, roles, and ids only.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.structure import Group

#: Enough to recognise the record; the full list screens are one click away.
LIMIT_PER_KIND = 8

STAFF_ROLES = ("owner", "manager", "lead_coach", "assistant_coach")


def global_search(session: Session, q: str) -> dict[str, list[dict[str, Any]]]:
    like = f"%{q.strip()}%"

    guardian_person = Person.__table__.alias("guardian_person")
    matched_guardian_students = (
        select(Guardian.student_id)
        .join(guardian_person, guardian_person.c.id == Guardian.person_id)
        .where(
            or_(
                guardian_person.c.first_name.ilike(like),
                guardian_person.c.last_name.ilike(like),
                guardian_person.c.phone.ilike(like),
            )
        )
    )
    students = session.execute(
        select(Student.id, Person.first_name, Person.last_name, Student.status)
        .join(Person, Person.id == Student.person_id)
        .where(
            or_(
                Person.first_name.ilike(like),
                Person.last_name.ilike(like),
                Student.id.in_(matched_guardian_students),
            )
        )
        .order_by(Person.last_name, Person.first_name)
        .limit(LIMIT_PER_KIND)
    ).all()

    guardians = session.execute(
        select(Guardian.person_id, Person.first_name, Person.last_name, Guardian.student_id)
        .join(Person, Person.id == Guardian.person_id)
        .where(
            or_(
                Person.first_name.ilike(like),
                Person.last_name.ilike(like),
                Person.phone.ilike(like),
            )
        )
        .order_by(Person.last_name, Person.first_name)
        .limit(LIMIT_PER_KIND)
    ).all()

    groups = session.execute(
        select(Group.id, Group.name)
        .where(Group.name.ilike(like), Group.is_active.is_(True))
        .order_by(Group.name)
        .limit(LIMIT_PER_KIND)
    ).all()

    staff = session.execute(
        select(RoleAssignment.person_id, Person.first_name, Person.last_name)
        .join(Person, Person.id == RoleAssignment.person_id)
        .where(
            RoleAssignment.revoked_at.is_(None),
            RoleAssignment.role.in_(STAFF_ROLES),
            or_(Person.first_name.ilike(like), Person.last_name.ilike(like)),
        )
        .distinct()
        .order_by(Person.last_name, Person.first_name)
        .limit(LIMIT_PER_KIND)
    ).all()

    def _name(first: str | None, last: str | None) -> str:
        return f"{first or ''} {last or ''}".strip()

    return {
        "students": [
            {"id": str(student_id), "name": _name(first, last), "status": student_status}
            for student_id, first, last, student_status in students
        ],
        "guardians": [
            {
                "person_id": str(person_id),
                "name": _name(first, last),
                "student_id": str(student_id),
            }
            for person_id, first, last, student_id in guardians
        ],
        "groups": [{"id": str(group_id), "name": name} for group_id, name in groups],
        "staff": [
            {"person_id": str(person_id), "name": _name(first, last)}
            for person_id, first, last in staff
        ],
    }
