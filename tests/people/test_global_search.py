"""F9 -- the dashboard's global search.

The assertion that matters most is the negative: a second studio's rows never appear.
`TenantSession` fails closed and the search rides it; this test is what keeps that true
as the query grows arms.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.models.people import Student
from app.models.person import Guardian, Person, RoleAssignment
from app.models.structure import Class, Group
from app.models.studio import Studio

SEARCH = "/api/v1/search"


def _family(app_session, studio_id, *, child: str, parent: str, phone: str) -> uuid.UUID:
    child_person = Person(studio_id=studio_id, first_name=child, last_name="לוי")
    app_session.add(child_person)
    app_session.flush()
    student = Student(studio_id=studio_id, person_id=child_person.id, status="active")
    app_session.add(student)
    app_session.flush()
    parent_person = Person(studio_id=studio_id, first_name=parent, last_name="לוי", phone=phone)
    app_session.add(parent_person)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio_id,
            student_id=student.id,
            person_id=parent_person.id,
            is_primary=True,
            relation="parent",
        )
    )
    app_session.commit()
    return student.id


def test_search_finds_a_student_by_partial_hebrew_name(client, as_manager, app_session, studio):
    _family(app_session, studio.id, child="דניאלה", parent="משה", phone="0501111111")
    body = client.get(f"{SEARCH}?q=דניא", headers=as_manager.headers).json()
    assert any(row["name"].startswith("דניאלה") for row in body["students"])


def test_search_finds_a_student_by_guardian_name_and_by_phone(
    client, as_manager, app_session, studio
):
    student_id = _family(app_session, studio.id, child="יובל", parent="אביגיל", phone="0502222222")
    by_parent = client.get(f"{SEARCH}?q=אביגיל", headers=as_manager.headers).json()
    assert any(row["id"] == str(student_id) for row in by_parent["students"])
    assert any(row["student_id"] == str(student_id) for row in by_parent["guardians"])
    by_phone = client.get(f"{SEARCH}?q=0502222222", headers=as_manager.headers).json()
    assert any(row["id"] == str(student_id) for row in by_phone["students"])


def test_search_finds_groups_and_staff(client, as_manager, app_session, studio):
    klass = Class(studio_id=studio.id, name="ג'ודו")
    app_session.add(klass)
    app_session.flush()
    app_session.add(Group(studio_id=studio.id, class_id=klass.id, name="נבחרת על", is_active=True))
    coach = Person(studio_id=studio.id, first_name="אלון", last_name="מזרחי")
    app_session.add(coach)
    app_session.flush()
    app_session.add(
        RoleAssignment(
            studio_id=studio.id,
            person_id=coach.id,
            role="lead_coach",
            scope_type="studio",
            granted_at=datetime(2026, 8, 25, tzinfo=UTC),
        )
    )
    app_session.commit()

    body = client.get(f"{SEARCH}?q=נבחרת", headers=as_manager.headers).json()
    assert any(row["name"] == "נבחרת על" for row in body["groups"])
    staff_body = client.get(f"{SEARCH}?q=אלון", headers=as_manager.headers).json()
    assert any(row["name"].startswith("אלון") for row in staff_body["staff"])


def test_a_second_studios_rows_never_appear(client, as_manager, app_session):
    other = Studio(name="מועדון אחר", slug=f"other-{uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.commit()
    _family(app_session, other.id, child="זריהאחר", parent="הוריהאחר", phone="0503333333")

    body = client.get(f"{SEARCH}?q=זריהאחר", headers=as_manager.headers).json()
    assert body["students"] == []
    assert body["guardians"] == []


def test_search_is_manager_only(client, as_lead_coach):
    assert client.get(f"{SEARCH}?q=x", headers=as_lead_coach.headers).status_code == 403
