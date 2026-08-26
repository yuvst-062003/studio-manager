"""W3's cross-lane seam, exercised rather than asserted as a signature.

`tests/contracts/test_seams.py` proves the shape. This file proves the behaviour M5 depends on:
`recompute_derived_flags` re-derives from the template a declaration was signed against and writes
the result back, and `roster_health` produces exactly the two fields `RosterEntry` carries.

**Neither lane opens the other's file.** M5 renders `row.health_status` and `row.derived_flags`;
this lane fills them. The assertion below constructs a real `RosterEntry` from this service's
output, which is the closest a health-lane test can legitimately get to M5's roster.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.health import HealthDeclaration, HealthFormTemplate
from app.models.people import Student
from app.schemas.attendance import RosterEntry
from app.services.health import HealthService
from app.services.structure.health_templates import FULL_FLAG_QUESTIONS
from sqlalchemy import select
from tests.health.conftest import T0


def _declare(app_session, student_id, template_id, answers, flags):
    """Arrange a declaration directly, then commit.

    Arranged through `app_session` and asserted through `tenant_session`, which is what
    tests/health/conftest.py asks for. The commit is load-bearing: the two are separate
    sessions on separate connections, so an arrangement that only flushes is invisible to the
    session under test. The submit path is `test_declarations.py`'s subject, not this file's.
    """
    template = app_session.get(HealthFormTemplate, template_id)
    row = HealthDeclaration(
        studio_id=template.studio_id,
        student_id=student_id,
        template_id=template_id,
        template_version=template.version,
        answers_encrypted=answers,
        derived_flags=flags,
        signed_by_person_id=app_session.execute(
            select(Student.person_id).where(Student.id == student_id)
        ).scalar_one(),
        signed_at=T0,
    )
    app_session.add(row)
    app_session.commit()
    return row


def test_no_declaration_yields_no_flags(tenant_session, a_student):
    """§5.5 — not an error. `student.health_status` is `missing`, the roster renders
    `⚠ הצהרת בריאות חסרה`, and nothing on the mat is blocked."""
    assert HealthService(tenant_session).recompute_derived_flags(a_student) == {}


def test_stale_flags_are_re_derived_and_written_back(
    app_session, tenant_session, a_student, a_full_template
):
    """The whole reason the seam is one named entry point. A manager rewords a question and every
    declaration's flags are stale; this is how a studio's whole roster is re-derived without M5
    ever knowing it happened."""
    _declare(
        app_session,
        a_student,
        a_full_template,
        {"asthma": True, "allergy": False},
        {"asthma": False, "nonsense": True},
    )

    flags = HealthService(tenant_session).recompute_derived_flags(a_student)

    assert flags["asthma"] is True
    assert flags["allergy"] is False
    assert "nonsense" not in flags
    assert set(flags) == set(FULL_FLAG_QUESTIONS)

    stored = tenant_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert stored.derived_flags == flags


def test_the_returned_flags_are_booleans_and_only_booleans(
    app_session, tenant_session, a_student, a_full_template
):
    """§4.3. The annotation says `dict[str, bool]`; this says the values really are."""
    _declare(
        app_session,
        a_student,
        a_full_template,
        {"asthma": True, "allergy_details": "פירוט", "emergency_contact": "050-0000000"},
        {},
    )
    flags = HealthService(tenant_session).recompute_derived_flags(a_student)
    assert all(isinstance(value, bool) for value in flags.values())
    assert "allergy_details" not in flags
    assert "emergency_contact" not in flags


def test_roster_health_returns_the_two_fields_m5_renders(
    app_session, tenant_session, a_student, a_full_template
):
    """The data half of the seam. `RosterEntry` validates it, so a shape drift fails here rather
    than as a blank badge in a basement."""
    _declare(app_session, a_student, a_full_template, {"asthma": True}, {"asthma": True})
    app_session.get(Student, a_student).health_status = "signed"
    app_session.commit()

    health = HealthService(tenant_session).roster_health([a_student])
    status, flags = health[a_student]

    entry = RosterEntry(
        student_id=a_student, display_name="ילדה בודקת", health_status=status, derived_flags=flags
    )
    assert entry.health_status == "signed"
    assert entry.derived_flags["asthma"] is True


def test_roster_health_gives_a_student_with_no_declaration_the_missing_badge(
    tenant_session, a_student
):
    status, flags = HealthService(tenant_session).roster_health([a_student])[a_student]
    assert status == "missing"
    assert flags == {}


def test_roster_health_of_nothing_asks_the_database_nothing(tenant_session):
    assert HealthService(tenant_session).roster_health([]) == {}


def test_a_session_less_service_refuses_rather_than_reaching_for_a_global(tenant_session):
    """`HealthService()` is constructible so `tests/contracts/test_seams.py` can inspect the
    signature without a database. Calling it is the bug: a service that opened its own session
    would escape `TenantSession`'s fail-closed guarantee, which is the one thing §4.2 will not
    trade away."""
    with pytest.raises(RuntimeError, match="TenantSession"):
        HealthService().recompute_derived_flags(uuid.uuid4())
