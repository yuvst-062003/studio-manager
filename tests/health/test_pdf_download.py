"""§5.5's rendered PDF, end to end: who may download it, and what the download leaves behind.

The golden fixture in `test_pdf.py` proves the *bytes*. This proves the *rule*: the file is the
full record — every answer, laid out and legible — so it reaches exactly the two audiences §5.5
names, "downloadable by the guardian and by managers", and a coach is refused.
"""

from __future__ import annotations

from app.models.health import HealthDeclaration
from app.services.health import club_terms
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
    sections = build_pdf_sections(schema, {"allergy": False})
    labels = [question for section in sections for question, _ in section.rows]
    assert "פירוט האלרגיה" not in labels


def test_a_revealed_conditional_question_is_on_the_page(a_full_template, app_session):
    from app.models.health import HealthFormTemplate

    schema = app_session.get(HealthFormTemplate, a_full_template).schema
    sections = build_pdf_sections(schema, {"allergy": True, "allergy_details": "בוטנים"})
    rows = {question: answer for section in sections for question, answer in section.rows}
    assert rows["פירוט האלרגיה"] == "בוטנים"


def test_booleans_are_rendered_in_hebrew_whatever_the_studio_is_set_to(
    a_full_template, app_session
):
    """12c finding 4 said the *questions* are manager-editable data rendered as typed, while the
    *answers* are not data — `True` is not a string anybody typed — so they took the studio's
    locale.

    **Owner decision, 2026-09-07: the signed document is Hebrew, always.** The answers no longer
    take a locale because there is no locale to take. See
    `test_the_signed_document_offers_no_language_to_choose` for why that is a guarantee rather
    than a default, and where the family's own language still lives.
    """
    from app.models.health import HealthFormTemplate

    schema = app_session.get(HealthFormTemplate, a_full_template).schema
    sections = build_pdf_sections(schema, {"asthma": True})
    assert dict(sections[0].rows)["האם יש אסתמה?"] == "כן"


def test_the_signed_document_offers_no_language_to_choose():
    """Owner decision, 2026-09-07: the signed declaration is Hebrew, always.

    **This does not mean a family agrees to terms it cannot read.** The screen renders
    `clubTerms.*` and `declaration.clause.*` from `web/packages/i18n/{he,en,ru}/health.ts`, so a
    Russian-speaking parent reads the terms in Russian and ticks the box in Russian;
    `tests/structure/test_full_template.py` guards all three locales there and must keep doing
    so. What changes is only the archived legal record, which is now Hebrew by construction
    rather than by a `studio.default_locale` nobody has changed.

    Asserted at the signatures, not at the output: a table that still held `en`/`ru` but was
    never read would pass a text check and leave the door open.
    """
    import inspect

    from app.services.health import club_terms, declarations

    for function in (
        declarations.build_pdf_sections,
        declarations.build_terms_sections,
        declarations.build_registration_sections,
        declarations.render_and_store_pdf,
        club_terms.terms_title,
        club_terms.clause_text,
        club_terms.payment_terms,
        club_terms.signature_line,
    ):
        assert "locale" not in inspect.signature(function).parameters, (
            f"{function.__name__} can still be asked for a language other than Hebrew"
        )


def test_the_documents_own_text_is_hebrew_and_not_a_table_of_languages():
    from app.services.health.club_terms import (
        CLAUSE_LIMITED_TEXT,
        CLAUSE_NONE_TEXT,
        PAYMENT_TERMS,
        SIGNATURE_LINE,
        TERMS_TITLE,
    )

    for text in (CLAUSE_NONE_TEXT, CLAUSE_LIMITED_TEXT, SIGNATURE_LINE, TERMS_TITLE):
        assert isinstance(text, str) and text.strip()
    assert isinstance(PAYMENT_TERMS, tuple)
    assert len(PAYMENT_TERMS) == 3
    assert all(clause.strip() for clause in PAYMENT_TERMS)


def test_the_health_clause_is_not_filed_under_the_payment_terms_heading():
    """Seen on a render: `תקנון ותנאי תשלום` appeared twice in a row, and the FIRST one sat over
    the sentence where a parent declares their child has no medical limitations.

    That sentence is a health declaration, not a payment term. Filing it under a payment heading
    mislabels the one clause the document exists to record — on a page a family signs and a club
    might hand an insurer — and printing the same heading twice makes the second one look like a
    duplicate of the first.
    """
    sections = build_terms_sections({"clause_confirmed": "none"})
    titles = [section.title for section in sections]
    assert len(titles) == len(set(titles)), f"the same heading twice: {titles}"

    clause_section = next(
        section
        for section in sections
        if any("אין מגבלות רפואיות" in paragraph for paragraph in section.paragraphs)
    )
    assert clause_section.title != club_terms.terms_title()


def test_the_payment_terms_reach_the_rendered_sections():
    """The three clauses the club supplied are on the document a family signs, not only on the
    screen where they ticked a box. Terms that exist in the app and not in the signed record
    are terms the club cannot show anyone afterwards."""
    sections = build_terms_sections({"clause_confirmed": "none"})
    prose = " ".join(p for section in sections for p in section.paragraphs)
    assert "בריין בילדינג (ע״ר)" in prose
    assert "27" in prose and "10" in prose


def test_the_confirmed_clause_is_the_one_rendered():
    """Not the one today's answers would imply. The document is re-rendered later, and a manager
    editing a question must not silently change which sentence an old signature sits above."""
    none_text = " ".join(
        p for s in build_terms_sections({"clause_confirmed": "none"}) for p in s.paragraphs
    )
    limited_text = " ".join(
        p for s in build_terms_sections({"clause_confirmed": "limited"}) for p in s.paragraphs
    )
    assert "אין מגבלות רפואיות" in none_text
    assert "למרות המגבלות הרפואיות" in limited_text
    assert none_text != limited_text


def test_no_disclaimer_string_survives_anywhere_in_the_pipeline():
    """The removal, asserted rather than assumed. D11's caveat was stamped onto every PDF; a
    stray copy left in a fallback would put "this is not a compliance document" back onto the
    club's own legal instrument."""
    sections = build_terms_sections({"clause_confirmed": "none"})
    prose = " ".join(p for section in sections for p in section.paragraphs)
    assert "נקודת פתיחה" not in prose
    assert "אינו מסמך עמידה ברגולציה" not in prose


def test_the_clause_id_never_appears_as_an_answer_on_the_document():
    """Reported from staging: the signed form read "אני מאשר/ת את ההצהרה שלמעלה  none".

    `clause_confirmed` stores an ID, not a word. Rendered through the answer table it printed
    the internal value beside its label, on the page a family signs — while the sentence they
    actually confirmed was already set out in full further down. The row was a duplicate that
    said less than nothing.
    """
    from app.services.structure.health_templates import FULL_TEMPLATE_SCHEMA

    sections = build_pdf_sections(
        FULL_TEMPLATE_SCHEMA, {"asthma": False, "clause_confirmed": "none"}
    )
    rows = [row for section in sections for row in section.rows]
    assert not any(answer == "none" for _, answer in rows)
    assert not any("clause" in question for question, _ in rows)

    # And the sentence itself is still on the document, in words.
    prose = " ".join(
        p for s in build_terms_sections({"clause_confirmed": "none"}) for p in s.paragraphs
    )
    assert "אין מגבלות רפואיות" in prose
