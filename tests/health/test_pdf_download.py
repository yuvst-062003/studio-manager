"""§5.5's rendered PDF, end to end: who may download it, and what the download leaves behind.

The golden fixture in `test_pdf.py` proves the *bytes*. This proves the *rule*: the file is the
full record — every answer, laid out and legible — so it reaches exactly the two audiences §5.5
names, "downloadable by the guardian and by managers", and a coach is refused.
"""

from __future__ import annotations

from app.models.health import HealthDeclaration
from app.services.health.declarations import _DISCLAIMER, build_pdf_sections
from sqlalchemy import select
from tests.health.test_declarations import ANSWERS, SIGNATURE_B64


def _sign(client, caller, student_id, template_id, answers=None):
    return client.post(
        f"/api/v1/students/{student_id}/health-declaration",
        json={
            "template_id": str(template_id),
            "answers": ANSWERS if answers is None else answers,
            "signature_image_base64": SIGNATURE_B64,
        },
        headers=caller.headers,
    )


def _url(student_id: object) -> str:
    return f"/api/v1/students/{student_id}/health-declaration/pdf"


def test_submitting_renders_and_files_a_pdf(
    client, as_manager, a_student, a_full_template, app_session
):
    """§5.5 — 'on submit the backend stores … and renders a filled, signed PDF'. On submit, not on
    a job: a parent who signs and is then told to come back later has not finished the flow."""
    response = _sign(client, as_manager, a_student, a_full_template)
    assert response.status_code == 201
    assert response.json()["pdf_object_key"].endswith(".pdf")

    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert row.pdf_object_key is not None


def test_a_guardian_downloads_their_own_childs_declaration(
    client, as_manager, as_guardian_of, a_student, a_full_template
):
    _sign(client, as_manager, a_student, a_full_template)
    parent = as_guardian_of(a_student)
    response = client.get(_url(a_student), headers=parent.headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF")


def test_a_manager_downloads_it(client, as_manager, a_student, a_full_template):
    _sign(client, as_manager, a_student, a_full_template)
    assert client.get(_url(a_student), headers=as_manager.headers).status_code == 200


def test_a_coach_may_not_download_it(client, as_manager, as_lead_coach, a_student, a_full_template):
    """The PDF is every answer on one page. A coach who could open it would have the full medical
    record by a route §5.5 gives them `derived_flags` precisely to avoid."""
    _sign(client, as_manager, a_student, a_full_template)
    assert client.get(_url(a_student), headers=as_lead_coach.headers).status_code == 403


def test_a_guardian_of_another_child_may_not_download_it(
    client, as_manager, as_guardian_of, a_student, a_full_template, app_session, studio
):
    from app.models.people import Student
    from app.models.person import Person

    other_person = Person(studio_id=studio.id, first_name="ילד", last_name="אחר")
    app_session.add(other_person)
    app_session.flush()
    other = Student(studio_id=studio.id, person_id=other_person.id, status="active")
    app_session.add(other)
    app_session.commit()

    _sign(client, as_manager, a_student, a_full_template)
    parent_of_other = as_guardian_of(other.id)
    assert client.get(_url(a_student), headers=parent_of_other.headers).status_code == 403


def test_a_managers_download_is_audit_logged_as_a_full_read(
    client, as_manager, a_student, a_full_template, audit_entries, app_session
):
    """§11.2. The same answers by a different route; a trail that missed it would answer 'who has
    seen my child's medical information' wrongly."""
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    before = len(
        [e for e in audit_entries("health_declaration", row.id) if "read_full" in e.action]
    )

    client.get(_url(a_student), headers=as_manager.headers)
    after = [e for e in audit_entries("health_declaration", row.id) if "read_full" in e.action]
    assert len(after) == before + 1
    assert after[0].is_sensitive is True


def test_a_guardians_download_is_not_audit_logged(
    client, as_manager, as_guardian_of, a_student, a_full_template, audit_entries, app_session
):
    """§11.2 lists the reads it wants, and a parent reading about their own child is not among
    them. Logging it would fill the trail with the one reader nobody is asking about."""
    _sign(client, as_manager, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    before = len(
        [e for e in audit_entries("health_declaration", row.id) if "read_full" in e.action]
    )

    parent = as_guardian_of(a_student)
    client.get(_url(a_student), headers=parent.headers)
    after = [e for e in audit_entries("health_declaration", row.id) if "read_full" in e.action]
    assert len(after) == before


def test_the_pdf_is_never_cached_by_a_shared_cache(client, as_manager, a_student, a_full_template):
    """§11.7 — the bytes are personal data about a minor and object storage is not an encrypted
    column. `private, no-store` is the smallest thing that keeps a proxy out of them."""
    _sign(client, as_manager, a_student, a_full_template)
    response = client.get(_url(a_student), headers=as_manager.headers)
    assert "no-store" in response.headers["cache-control"]


def test_a_re_submission_re_renders_rather_than_serving_the_old_document(
    client, as_manager, a_student, a_full_template
):
    """A stale PDF is the one artefact here that could be shown to a regulator. `submit` clears
    `pdf_object_key`; this proves the new bytes actually differ."""
    _sign(client, as_manager, a_student, a_full_template)
    first = client.get(_url(a_student), headers=as_manager.headers).content
    _sign(client, as_manager, a_student, a_full_template, answers=dict(ANSWERS, asthma=False))
    second = client.get(_url(a_student), headers=as_manager.headers).content
    assert first != second


def test_downloading_before_a_declaration_exists_is_404(client, as_manager, a_student):
    assert client.get(_url(a_student), headers=as_manager.headers).status_code == 404


# -- what goes on the page -----------------------------------------------------
def test_a_hidden_conditional_question_is_not_on_the_page(a_full_template, app_session):
    """A `visible_if` question whose condition did not hold was never asked, and printing it with
    a dash reads as a refusal to answer. §5.5's document is a record of what happened."""
    from app.models.health import HealthFormTemplate

    schema = app_session.get(HealthFormTemplate, a_full_template).schema
    sections = build_pdf_sections(schema, {"allergy": False}, "he")
    labels = [question for section in sections for question, _ in section.rows]
    assert "פירוט האלרגיה" not in labels


def test_a_revealed_conditional_question_is_on_the_page(a_full_template, app_session):
    from app.models.health import HealthFormTemplate

    schema = app_session.get(HealthFormTemplate, a_full_template).schema
    sections = build_pdf_sections(schema, {"allergy": True, "allergy_details": "בוטנים"}, "he")
    rows = {question: answer for section in sections for question, answer in section.rows}
    assert rows["פירוט האלרגיה"] == "בוטנים"


def test_booleans_are_rendered_in_the_studios_locale(a_full_template, app_session):
    """12c finding 4, answered: the *questions* are manager-editable data and are rendered as
    typed; the *answers* are not data — `True` is not a string anybody typed — so they take the
    studio's locale."""
    from app.models.health import HealthFormTemplate

    schema = app_session.get(HealthFormTemplate, a_full_template).schema
    hebrew = build_pdf_sections(schema, {"asthma": True}, "he")
    english = build_pdf_sections(schema, {"asthma": True}, "en")
    assert dict(hebrew[0].rows)["האם יש אסתמה?"] == "כן"
    assert dict(english[0].rows)["האם יש אסתמה?"] == "Yes"


def test_the_disclaimer_exists_in_all_three_locales():
    """D11's caveat, on the artefact a club is most likely to hand to an insurer. A locale that
    fell back to Hebrew would put the caveat in a language the reader may not have."""
    assert set(_DISCLAIMER) == {"he", "en", "ru"}
    assert all(text.strip() for text in _DISCLAIMER.values())
