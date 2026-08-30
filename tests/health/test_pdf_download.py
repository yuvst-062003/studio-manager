"""§5.5's rendered PDF, end to end: who may download it, and what the download leaves behind.

The golden fixture in `test_pdf.py` proves the *bytes*. This proves the *rule*: the file is the
full record — every answer, laid out and legible — so it reaches exactly the two audiences §5.5
names, "downloadable by the guardian and by managers", and a coach is refused.
"""

from __future__ import annotations

from app.models.health import HealthDeclaration
from app.services.health.declarations import build_pdf_sections, build_terms_sections
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
    # `clause_confirmed` moves with `asthma`: with every answer now negative the family is
    # entitled to the "no limitations" sentence and `verify_clause` refuses the other one. The
    # second submission is a 422 without this, and the test would pass for the wrong reason --
    # identical bytes because nothing was re-signed at all.
    _sign(
        client,
        as_manager,
        a_student,
        a_full_template,
        answers=dict(ANSWERS, asthma=False, clause_confirmed="none"),
    )
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


def test_the_club_terms_exist_in_all_three_locales():
    """What replaced D11's caveat. Same reasoning as the caveat had: a locale that fell back to
    Hebrew would put the terms a family is agreeing to in a language they may not read."""
    from app.services.health.club_terms import (
        CLAUSE_LIMITED_TEXT,
        CLAUSE_NONE_TEXT,
        PAYMENT_TERMS,
        SIGNATURE_LINE,
        TERMS_TITLE,
    )

    tables = (PAYMENT_TERMS, CLAUSE_NONE_TEXT, CLAUSE_LIMITED_TEXT, SIGNATURE_LINE, TERMS_TITLE)
    for table in tables:
        assert set(table) == {"he", "en", "ru"}
    assert all(all(clause.strip() for clause in clauses) for clauses in PAYMENT_TERMS.values())
    assert all(len(clauses) == 3 for clauses in PAYMENT_TERMS.values())


def test_the_payment_terms_reach_the_rendered_sections():
    """The three clauses the club supplied are on the document a family signs, not only on the
    screen where they ticked a box. Terms that exist in the app and not in the signed record
    are terms the club cannot show anyone afterwards."""
    sections = build_terms_sections({"clause_confirmed": "none"}, "he")
    prose = " ".join(p for section in sections for p in section.paragraphs)
    assert "עמותת מכבי נתניה סיף ואגרוף" in prose
    assert "27" in prose and "10" in prose


def test_the_confirmed_clause_is_the_one_rendered():
    """Not the one today's answers would imply. The document is re-rendered later, and a manager
    editing a question must not silently change which sentence an old signature sits above."""
    none_text = " ".join(
        p for s in build_terms_sections({"clause_confirmed": "none"}, "he") for p in s.paragraphs
    )
    limited_text = " ".join(
        p for s in build_terms_sections({"clause_confirmed": "limited"}, "he") for p in s.paragraphs
    )
    assert "אין מגבלות רפואיות" in none_text
    assert "למרות המגבלות הרפואיות" in limited_text
    assert none_text != limited_text


def test_no_disclaimer_string_survives_anywhere_in_the_pipeline():
    """The removal, asserted rather than assumed. D11's caveat was stamped onto every PDF; a
    stray copy left in a fallback would put "this is not a compliance document" back onto the
    club's own legal instrument."""
    sections = build_terms_sections({"clause_confirmed": "none"}, "he")
    prose = " ".join(p for section in sections for p in section.paragraphs)
    assert "נקודת פתיחה" not in prose
    assert "אינו מסמך עמידה ברגולציה" not in prose
