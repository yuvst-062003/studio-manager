"""§5.7's roster: who is expected, who is merely enrolled, and the W3 seam.

Arranged with `app_session`, acted and asserted through `tenant_session` — the rule
tests/attendance/conftest.py states, and the reason it matters here is that the other lane
shares this Postgres container.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from app.models.attendance import AbsenceReport, Attendance
from app.models.health import HealthDeclaration, HealthFormTemplate
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.services.attendance.errors import NotFoundError
from app.services.attendance.roster import build_roster
from tests.attendance.conftest import T0, TODAY, YEAR_STARTS

#: T0 is Tuesday 2026-11-03. `group_schedule_rule.weekday` is Sunday-first (§4.3), so a
#: Tuesday is 2 and the two days either side are 1 and 3.
TUESDAY = 2
MONDAY = 1


@pytest.fixture
def encryption_keys(monkeypatch) -> None:
    """A keyring, for the ONE test in this lane that writes an encrypted column.

    This lane encrypts nothing of its own -- attendance is not sensitive data and §13's
    invariant about it is the money one. But the seam test below has to insert a
    `health_declaration` to prove the roster reads M4's stored `derived_flags`, and
    `answers_encrypted` is an `EncryptedJSON` column that `Keyring.from_settings()` refuses
    to write when `ENCRYPTION_KEYS` is empty -- which it is locally and on CI.

    Deliberately NOT autouse, unlike tests/people/conftest.py's: a lane that needs a
    keyring for exactly one insert should say so at that insert, not switch encryption on
    for every test in the directory.

    Thirty-two zero bytes, base64'd -- what the checked-in example ships. A test key,
    modelling nothing about production, where §11.1 puts these in Railway secrets.
    """
    import base64

    from app.core import encryption
    from pydantic import SecretStr

    monkeypatch.setattr(
        encryption.settings,
        "ENCRYPTION_KEYS",
        {1: SecretStr(base64.b64encode(b"\x00" * 32).decode())},
    )
    monkeypatch.setattr(encryption.settings, "ENCRYPTION_ACTIVE_KEY_VERSION", 1)


def _add_student(app_session, studio, group_id, *, name: str, attends: list[int] | None = None):
    person = Person(studio_id=studio.id, first_name=name, last_name="בודק")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=YEAR_STARTS
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=group_id,
            status="active",
            started_on=YEAR_STARTS,
            attends_weekdays=attends,
        )
    )
    app_session.commit()
    return student.id


def test_an_enrolled_student_is_on_the_roster(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student
):
    _, rows = build_roster(tenant_session, a_session)
    assert [row.student_id for row in rows] == [an_enrolled_student]
    assert rows[0].display_name == "ילד בודק"


def test_a_student_starts_unmarked_and_that_is_a_real_state(
    tenant_session, a_session, an_enrolled_student
):
    """§5.14 — `unmarked` is a real state, never an assumption. A roster with no marks
    reports four unmarked students, not four absences."""
    _, rows = build_roster(tenant_session, a_session)
    assert rows[0].status == "unmarked"
    assert rows[0].source is None


def test_a_student_not_expected_today_is_still_listed_but_flagged(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student
):
    """§5.7 / C12 — 'Students enrolled in the group but not expected today sit in a
    separate collapsed section beneath it, לא אמורים להגיע היום, and can still be marked —
    a child who turns up on an extra day is a real child.'

    Not a fifth attendance state: the four states record what somebody SAID, expectation
    records what was ASKED of them, and the two are independent axes.
    """
    monday_only = _add_student(app_session, studio, a_group, name="שני", attends=[MONDAY])
    _, rows = build_roster(tenant_session, a_session)
    by_id = {row.student_id: row for row in rows}
    assert by_id[an_enrolled_student].expected is True
    assert by_id[monday_only].expected is False


def test_attends_weekdays_naming_this_session_is_expected(
    tenant_session, app_session, studio, a_group, a_session
):
    student_id = _add_student(app_session, studio, a_group, name="שלישי", attends=[TUESDAY])
    _, rows = build_roster(tenant_session, a_session)
    assert next(r for r in rows if r.student_id == student_id).expected is True


def test_a_student_who_left_the_group_is_not_on_the_roster(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student
):
    enrollment = app_session.query(Enrollment).filter_by(student_id=an_enrolled_student).one()
    enrollment.status = "ended"
    enrollment.ended_on = TODAY - timedelta(days=1)
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows == []


def test_a_stored_mark_and_its_source_reach_the_roster(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_lead_coach
):
    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=a_session,
            student_id=an_enrolled_student,
            status="present",
            source="coach",
            marked_by_person_id=as_lead_coach.person_id,
            marked_at=T0,
            device_marked_at=T0,
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows[0].status == "present"
    assert rows[0].source == "coach"


def test_a_parents_advance_notice_is_carried_with_its_reason(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_guardian
):
    """§10.5 — a bulk action must not overwrite this, and the resolver can only know that
    if the roster says the pre-report is there."""
    app_session.add(
        AbsenceReport(
            studio_id=studio.id,
            student_id=an_enrolled_student,
            session_id=a_session,
            reported_by_person_id=as_guardian.person_id,
            reason="מחלה",
        )
    )
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows[0].has_absence_report is True
    assert rows[0].absence_reason == "מחלה"


def test_the_seam_fields_default_to_missing_and_no_flags(
    tenant_session, a_session, an_enrolled_student
):
    """Plan §1.3 seam 4 — M4 populates `health_status` and `derived_flags`, M5 renders
    them. Before M4 has written anything the roster carries `missing` and `{}`, which is
    what artboards `1c` and `9f` draw as `⚠ הצהרת בריאות חסרה`."""
    _, rows = build_roster(tenant_session, a_session)
    assert rows[0].health_status == "missing"
    assert rows[0].derived_flags == {}


def test_the_seam_reads_what_m4_stored_and_never_recomputes_it(
    tenant_session, app_session, studio, a_session, an_enrolled_student, as_manager, encryption_keys
):
    """The seam is DATA. M4 populates `health_declaration.derived_flags` and
    `student.health_status`; this lane reads the two columns and renders them. It never
    calls `HealthService`, which would make a coach's roster depend on M4's derivation
    running inside a GET."""
    template = app_session.query(HealthFormTemplate).filter_by(studio_id=studio.id).first()
    if template is None:
        template = HealthFormTemplate(
            studio_id=studio.id, kind="full", version=1, schema={"questions": []}
        )
        app_session.add(template)
        app_session.flush()
    student = app_session.get(Student, an_enrolled_student)
    student.health_status = "signed"
    app_session.add(
        HealthDeclaration(
            studio_id=studio.id,
            student_id=an_enrolled_student,
            template_id=template.id,
            template_version=template.version,
            answers_encrypted={"q1": "no"},
            derived_flags={"asthma": True, "allergy": False},
            signature_image_encrypted=None,
            signed_by_person_id=as_manager.person_id,
            signed_at=T0,
        )
    )
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows[0].health_status == "signed"
    assert rows[0].derived_flags == {"asthma": True, "allergy": False}


def test_a_missing_declaration_never_blocks_the_row(tenant_session, a_session, an_enrolled_student):
    """§5.5 — 'Nothing on the mat is ever blocked by a missing health declaration.' The
    row carries no field that could express a block, deliberately: there is no
    `block_attendance_without_health` setting and this shape gives nowhere to put one."""
    _, rows = build_roster(tenant_session, a_session)
    assert not hasattr(rows[0], "blocked")
    assert rows[0].health_status == "missing"


def test_another_studios_session_is_invisible_rather_than_forbidden(
    tenant_session, other_studio_session_id
):
    """The tenant filter fails closed, so this is a 404 at the router. A 403 would confirm
    another club's lesson is real."""
    with pytest.raises(NotFoundError):
        build_roster(tenant_session, other_studio_session_id)


def test_a_roster_row_carries_no_financial_field(tenant_session, a_session, an_enrolled_student):
    """SPEC §13 invariant 3. The roster is the most coach-reachable payload in the
    product; a `balance_agorot` here fails that gate for every coach at once."""
    _, rows = build_roster(tenant_session, a_session)
    fields = set(vars(rows[0]))
    assert not any(
        token in name
        for name in fields
        for token in ("agorot", "amount", "price", "balance", "charge", "debt")
    )


def test_rows_are_ordered_by_display_name_so_a_coach_can_scan_thirty(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student
):
    _add_student(app_session, studio, a_group, name="אבי")
    _, rows = build_roster(tenant_session, a_session)
    assert [row.display_name for row in rows] == sorted(row.display_name for row in rows)


def test_a_pending_enrollment_is_not_yet_on_the_roster(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student
):
    """§5.4 — a `pending` enrollment is a registration request nobody approved. Putting it
    on a coach's roster would have the club marking a child it has not accepted."""
    enrollment = app_session.query(Enrollment).filter_by(student_id=an_enrolled_student).one()
    enrollment.status = "pending"
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows == []


def test_an_enrollment_that_starts_after_the_session_is_not_on_it(
    tenant_session, app_session, studio, a_group, a_session, an_enrolled_student
):
    enrollment = app_session.query(Enrollment).filter_by(student_id=an_enrolled_student).one()
    enrollment.started_on = TODAY + timedelta(days=7)
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows == []


def test_the_session_row_comes_back_with_the_roster(tenant_session, a_session, a_group):
    """One call, one round trip. §6.1 makes first launch block on the bootstrap payload,
    so a roster that needed a second query for its own session header would be a header
    that is blank in a basement."""
    session_row, _ = build_roster(tenant_session, a_session)
    assert session_row.id == a_session
    assert session_row.group_id == a_group


def test_a_date_only_enrollment_end_on_the_session_day_still_counts(
    tenant_session, app_session, studio, a_session, an_enrolled_student
):
    """`ended_on` is inclusive — a student whose last day is today trains today."""
    enrollment = app_session.query(Enrollment).filter_by(student_id=an_enrolled_student).one()
    enrollment.ended_on = TODAY
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert [row.student_id for row in rows] == [an_enrolled_student]


def test_an_ended_enrollment_is_dropped_by_date_even_when_its_status_lags(
    tenant_session, app_session, studio, a_session, an_enrolled_student
):
    """A nightly job flips `status`; `ended_on` is what the manager typed. The date is the
    fact, so the roster reads it rather than waiting for the job."""
    enrollment = app_session.query(Enrollment).filter_by(student_id=an_enrolled_student).one()
    enrollment.ended_on = date(2026, 10, 1)
    app_session.commit()
    _, rows = build_roster(tenant_session, a_session)
    assert rows == []


# -- 2a: the family read (feature pass 2026-08-27) -----------------------------
def test_a_guardian_reads_their_own_childs_attendance_and_nobody_elses(
    client, app_session, studio, as_guardian, a_session, an_enrolled_student
):
    """The day strip's data: statuses per child per session, behind the same
    EXISTS-on-guardian every /me route stands on. Another family's child in the same
    session never appears."""
    from app.models.attendance import Attendance
    from app.models.person import Guardian

    app_session.add(
        Guardian(
            studio_id=studio.id,
            person_id=as_guardian.person_id,
            student_id=an_enrolled_student,
            relation="parent",
            is_primary=False,
        )
    )
    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=a_session,
            student_id=an_enrolled_student,
            status="present",
            marked_at=T0,
            device_marked_at=T0,
            client_mark_id=uuid.uuid4(),
        )
    )
    # Another family's mark in the same session -- must not leak.
    from app.models.people import Student
    from app.models.person import Person

    stranger_person = Person(studio_id=studio.id, first_name="אחר", last_name="לגמרי")
    app_session.add(stranger_person)
    app_session.flush()
    stranger = Student(
        studio_id=studio.id, person_id=stranger_person.id, status="active", health_status="missing"
    )
    app_session.add(stranger)
    app_session.flush()
    app_session.add(
        Attendance(
            studio_id=studio.id,
            session_id=a_session,
            student_id=stranger.id,
            status="present",
            marked_at=T0,
            device_marked_at=T0,
            client_mark_id=uuid.uuid4(),
        )
    )
    app_session.commit()

    day = T0.date().isoformat()
    body = client.get(
        f"/api/v1/me/attendance?from={day}&to={day}", headers=as_guardian.headers
    ).json()
    students = {row["student_id"] for row in body["items"]}
    assert students == {str(an_enrolled_student)}
    assert body["items"][0]["status"] == "present"


def test_the_family_read_refuses_an_unbounded_range(client, as_guardian):
    response = client.get(
        "/api/v1/me/attendance?from=2026-01-01&to=2026-12-31", headers=as_guardian.headers
    )
    assert response.status_code == 422
