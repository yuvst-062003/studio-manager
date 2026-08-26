"""§4.3 and §11.2 — who may read a full declaration, and the audit row every read leaves.

**This is the file the lane is judged on.** §5.5 gives a coach `derived_flags` and nothing else,
§3.2 gives "Read full health declaration" to manager and owner and to nobody else, and §11.2 logs
every read. A lane that only tested the allowed caller would prove the happy path and nothing about
the rule.

G7: no assertion here prints an answer, and the audit `diff` is checked for the *absence* of one.
"""

from __future__ import annotations

from app.models.health import HealthDeclaration
from sqlalchemy import select
from tests.health.test_declarations import ANSWERS, SIGNATURE_B64


def _sign(client, caller, student_id, template_id):
    return client.post(
        f"/api/v1/students/{student_id}/health-declaration",
        json={
            "template_id": str(template_id),
            "answers": ANSWERS,
            "signature_image_base64": SIGNATURE_B64,
        },
        headers=caller.headers,
    )


def _full_url(student_id: object) -> str:
    return f"/api/v1/students/{student_id}/health-declaration/full"


# -- the coach-safe projection -------------------------------------------------
def test_a_coach_reads_flags_and_nothing_else(
    client, as_manager, as_lead_coach, a_student, a_full_template
):
    """§5.5 — 'Coaches see only derived_flags'. The shape is the enforcement:
    `HealthDeclarationOut` has no `answers` field, so no `exclude=` can be forgotten."""
    _sign(client, as_manager, a_student, a_full_template)

    response = client.get(
        f"/api/v1/students/{a_student}/health-declaration", headers=as_lead_coach.headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["derived_flags"]["asthma"] is True
    assert "answers" not in body
    assert "signed_ip" not in body
    assert "signed_user_agent" not in body


def test_every_value_a_coach_receives_is_a_boolean(
    client, as_manager, as_assistant_coach, a_student, a_full_template
):
    """A free-text flag is a medical description on a coach's screen, which is exactly what the
    flag mechanism replaced (§4.3)."""
    _sign(client, as_manager, a_student, a_full_template)
    body = client.get(
        f"/api/v1/students/{a_student}/health-declaration", headers=as_assistant_coach.headers
    ).json()
    assert all(isinstance(v, bool) for v in body["derived_flags"].values())


def test_a_coach_reading_the_safe_shape_writes_no_sensitive_audit_row(
    client, as_manager, as_lead_coach, a_student, a_full_template, audit_entries, app_session
):
    """§11.2 logs every read *of a health declaration* — the full record. A ⚠ chip on a roster is
    not that, and logging it would put one audit row per roster render per coach into an
    append-only table, drowning the reads that matter."""
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()

    before = len(audit_entries("health_declaration", row.id))
    client.get(f"/api/v1/students/{a_student}/health-declaration", headers=as_lead_coach.headers)
    entries = audit_entries("health_declaration", row.id)
    assert len(entries) == before
    assert not any(e.action == "health_declaration.read_full" for e in entries)


# -- the full record -----------------------------------------------------------
def test_a_manager_may_read_the_full_declaration(client, as_manager, a_student, a_full_template):
    _sign(client, as_manager, a_student, a_full_template)
    response = client.get(_full_url(a_student), headers=as_manager.headers)
    assert response.status_code == 200
    body = response.json()
    assert body["answers"]["emergency_contact"] == "050-0000000"
    assert body["derived_flags"]["asthma"] is True


def test_an_owner_may_read_the_full_declaration(
    client, as_owner, as_manager, a_student, a_full_template
):
    _sign(client, as_manager, a_student, a_full_template)
    assert client.get(_full_url(a_student), headers=as_owner.headers).status_code == 200


def test_a_lead_coach_may_not(client, as_manager, as_lead_coach, a_student, a_full_template):
    _sign(client, as_manager, a_student, a_full_template)
    assert client.get(_full_url(a_student), headers=as_lead_coach.headers).status_code == 403


def test_an_assistant_coach_may_not(
    client, as_manager, as_assistant_coach, a_student, a_full_template
):
    _sign(client, as_manager, a_student, a_full_template)
    assert client.get(_full_url(a_student), headers=as_assistant_coach.headers).status_code == 403


def test_a_guardian_may_not_read_the_full_shape_through_this_route(
    client, as_manager, as_guardian_of, a_student, a_full_template
):
    """A parent reads their own child's declaration through the PDF (§5.5 — 'downloadable by the
    guardian and by managers'). This route is §3.2's manager-only row, and widening it for the
    parent case would widen it for every case."""
    _sign(client, as_manager, a_student, a_full_template)
    parent = as_guardian_of(a_student)
    assert client.get(_full_url(a_student), headers=parent.headers).status_code == 403


def test_a_stranger_gets_401_not_403(client, a_student):
    assert client.get(_full_url(a_student)).status_code == 401


# -- §11.2, the point of the whole file ----------------------------------------
def test_every_full_read_writes_exactly_one_audit_row(
    client, as_manager, a_student, a_full_template, audit_entries, app_session
):
    """'Who has seen my child's medical information?' is the question §11.2 exists to answer."""
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()

    client.get(_full_url(a_student), headers=as_manager.headers)
    reads = [
        e for e in audit_entries("health_declaration", row.id) if e.action.endswith("read_full")
    ]
    assert len(reads) == 1
    assert reads[0].is_sensitive is True
    assert reads[0].actor_person_id == as_manager.person_id


def test_two_reads_write_two_rows(
    client, as_manager, a_student, a_full_template, audit_entries, app_session
):
    """A cached or deduplicated audit row is an audit row that answers the question wrongly."""
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()

    client.get(_full_url(a_student), headers=as_manager.headers)
    client.get(_full_url(a_student), headers=as_manager.headers)
    reads = [
        e for e in audit_entries("health_declaration", row.id) if e.action.endswith("read_full")
    ]
    assert len(reads) == 2


def test_a_refused_read_writes_no_audit_row(
    client, as_manager, as_lead_coach, a_student, a_full_template, audit_entries, app_session
):
    """A 403 is not a read. Logging it would make the trail answer 'who tried' when it is asked
    'who saw', and the two are different questions."""
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()

    client.get(_full_url(a_student), headers=as_lead_coach.headers)
    reads = [
        e for e in audit_entries("health_declaration", row.id) if e.action.endswith("read_full")
    ]
    assert reads == []


def test_no_audit_diff_ever_carries_an_answer(
    client, as_manager, a_student, a_full_template, audit_entries, app_session
):
    """G7, and CLAUDE.md's rule verbatim: never put health contents in `diff`."""
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    client.get(_full_url(a_student), headers=as_manager.headers)

    for entry in audit_entries("health_declaration", row.id):
        serialised = repr(entry.diff)
        assert "050-0000000" not in serialised
        assert SIGNATURE_B64[:24] not in serialised
        assert "answers" not in serialised


def test_the_create_is_audit_logged_and_says_nothing_about_the_answers(
    client, as_manager, a_student, a_full_template, audit_entries, app_session
):
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    creates = [
        e for e in audit_entries("health_declaration", row.id) if e.action.endswith("create")
    ]
    assert len(creates) == 1
    assert creates[0].is_sensitive is True
    assert creates[0].diff == {"template_version": 1, "flags_raised": 1}
