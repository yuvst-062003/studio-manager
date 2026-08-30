"""D11's editable question set: `PUT /health-templates/{id}`, publish, and the studio's own PDF.

**The lane owns the `full` template and not the `trial` one.** Conflict C3: M1 created
`health_form_template` in revision 0005 and seeded the trial form so M3's trial bookings had
something to write against. Editing it here would rewrite the questions a funnel is mid-way
through asking, so it is refused — and asserted refused, because "we did not build it" and "it is
refused" look identical from outside until somebody tries.

**A published version is immutable; editing writes a draft.** §4.3 puts `template_version` on the
declaration precisely so a signature records which questions were actually asked. Editing a
published row in place would silently rewrite the meaning of every signature already collected,
which is the failure D11's caveat is least able to survive. So a `PUT` returns the *draft* — a row
with `published_at IS NULL` at the next version — and nothing a parent signs or a coach sees moves
until it is published.

G7: a template holds questions and never answers, so nothing in this file is personal data. The
`test_no_column_here_could_hold_an_answer` property in tests/structure keeps it that way.
"""

from __future__ import annotations

import uuid

from app.models.health import HealthDeclaration, HealthFormTemplate
from app.services.structure.health_templates import FULL_TEMPLATE_SCHEMA
from sqlalchemy import select
from tests.health.conftest import T0

MINIMAL_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def _reworded(schema: dict, question_id: str, label: str) -> dict:
    """A copy of `schema` with one question's wording changed. D11's core right, in one helper."""
    import copy

    out = copy.deepcopy(schema)
    for section in out["sections"]:
        for question in section["questions"]:
            if question["id"] == question_id:
                question["label"] = label
    return out


def _with_extra_flag_question(schema: dict, question_id: str) -> dict:
    import copy

    out = copy.deepcopy(schema)
    out["sections"][0]["questions"].append(
        {"id": question_id, "type": "boolean", "label": "שאלה חדשה", "flag": True}
    )
    return out


# -- reading -------------------------------------------------------------------
def test_the_m1_list_route_still_answers_and_still_carries_no_questions(
    client, as_manager, a_full_template
):
    """Conflict C3's read side is M1's, in app/routers/structure.py, and this lane leaves it
    alone. `HealthTemplateOut` there is id/kind/version deliberately — M1 owned a file that must
    never be able to hold an answer. Asserted so this lane notices the day it changes: the
    generated client is committed."""
    response = client.get("/api/v1/health-templates?kind=full", headers=as_manager.headers)
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["kind"] == "full"
    assert "schema" not in items[0]


def test_the_editor_reads_one_template_with_its_questions(client, as_manager, a_full_template):
    """The detail route this lane adds, because an editor cannot edit questions it cannot see."""
    response = client.get(f"/api/v1/health-templates/{a_full_template}", headers=as_manager.headers)
    assert response.status_code == 200
    schema = response.json()["schema"]
    assert [section["id"] for section in schema["sections"]], "an editor needs the questions"
    assert schema["version"] == FULL_TEMPLATE_SCHEMA["version"]


def test_a_coach_may_not_read_a_templates_questions(client, as_lead_coach, a_full_template):
    """§5.5 — a coach sees `derived_flags` and nothing else, and §6.4 puts the editor on the
    manager dashboard."""
    response = client.get(
        f"/api/v1/health-templates/{a_full_template}", headers=as_lead_coach.headers
    )
    assert response.status_code == 403


# -- editing -------------------------------------------------------------------
def test_a_manager_can_reword_a_question(client, as_manager, a_full_template, app_session):
    """D11 in one sentence: 'a manager can add, remove and reword questions'."""
    schema = _reworded(FULL_TEMPLATE_SCHEMA, "asthma", "האם אובחנה אסתמה?")
    response = client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": schema},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    draft_id = uuid.UUID(response.json()["id"])
    assert draft_id != a_full_template, "a published version is never edited in place"

    app_session.expire_all()
    row = app_session.get(HealthFormTemplate, draft_id)
    assert row.published_at is None
    assert row.version == FULL_TEMPLATE_SCHEMA["version"] + 1
    labels = {q["id"]: q.get("label") for s in row.schema["sections"] for q in s["questions"]}
    assert labels["asthma"] == "האם אובחנה אסתמה?"


def test_the_published_version_a_signature_points_at_is_left_exactly_as_signed(
    client, as_manager, a_full_template, app_session
):
    """The rule the draft exists for. A declaration records `template_version=1`; if v1's wording
    changed under it, that column would name questions nobody was ever asked."""
    before = app_session.get(HealthFormTemplate, a_full_template).schema
    client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": _reworded(FULL_TEMPLATE_SCHEMA, "asthma", "אסתמה?")},
        headers=as_manager.headers,
    )
    app_session.expire_all()
    assert app_session.get(HealthFormTemplate, a_full_template).schema == before


def test_a_second_edit_updates_the_same_draft_rather_than_stacking_versions(
    client, as_manager, a_full_template, app_session
):
    """A manager rewording four questions in four saves must not mint four versions. At most one
    draft: a second would be a second answer to 'what are we about to ask'."""
    first = client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": _reworded(FULL_TEMPLATE_SCHEMA, "asthma", "א")},
        headers=as_manager.headers,
    ).json()["id"]
    second = client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": _reworded(FULL_TEMPLATE_SCHEMA, "allergy", "ב")},
        headers=as_manager.headers,
    ).json()["id"]
    assert first == second

    app_session.expire_all()
    versions = sorted(
        v
        for (v,) in app_session.execute(
            select(HealthFormTemplate.version).where(
                HealthFormTemplate.studio_id == as_manager.studio_id,
                HealthFormTemplate.kind == "full",
            )
        ).all()
    )
    seeded = FULL_TEMPLATE_SCHEMA["version"]
    assert versions == [seeded, seeded + 1]


def test_publishing_with_no_draft_is_refused(client, as_manager, a_full_template):
    """Silently re-stamping the live version would tell a manager their unsaved edits went out."""
    response = client.post(
        f"/api/v1/health-templates/{a_full_template}/publish", headers=as_manager.headers
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "nothing_to_publish"


def test_the_bundled_marker_is_gone_from_the_shipped_schema(
    client, as_manager, a_full_template, app_session
):
    """The inverse of the test that used to live here.

    `is_bundled_default` was D11's caveat in machine-readable form: it told the editor whose
    questions it was showing, so a studio that had reworded ours would stop being told it was
    editing the bundled set. Template v2 is the CLUB's own form, so there is no bundled set left
    to mark -- and a marker still riding along would make the editor claim the club is editing
    ours. It must be absent on the seeded row and on anything edited from it."""
    seeded = app_session.get(HealthFormTemplate, a_full_template)
    assert "is_bundled_default" not in (seeded.schema or {})

    draft_id = uuid.UUID(
        client.put(
            f"/api/v1/health-templates/{a_full_template}",
            json={"schema": _reworded(FULL_TEMPLATE_SCHEMA, "asthma", "אסתמה?")},
            headers=as_manager.headers,
        ).json()["id"]
    )
    app_session.expire_all()
    assert "is_bundled_default" not in (
        app_session.get(HealthFormTemplate, draft_id).schema or {}
    )


def test_a_manager_can_remove_a_question(client, as_manager, a_full_template, app_session):
    import copy

    schema = copy.deepcopy(FULL_TEMPLATE_SCHEMA)
    schema["sections"][0]["questions"] = [
        q for q in schema["sections"][0]["questions"] if q["id"] != "diabetes"
    ]
    response = client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": schema},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    app_session.expire_all()
    row = app_session.get(HealthFormTemplate, uuid.UUID(response.json()["id"]))
    ids = {q["id"] for s in row.schema["sections"] for q in s["questions"]}
    assert "diabetes" not in ids


def test_a_schema_with_no_questions_at_all_is_refused(client, as_manager, a_full_template):
    """A declaration nobody is asked anything is not a declaration, and §5.5's coach badge comes
    from answers that would not exist."""
    response = client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": {"version": 1, "kind": "full", "sections": []}},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_duplicate_question_ids_are_refused(client, as_manager, a_full_template):
    """Two questions with one id means one answer for two questions, and `derived_flags` would
    take whichever the serialiser happened to write last."""
    schema = {
        "version": 1,
        "kind": "full",
        "sections": [
            {
                "id": "s",
                "questions": [
                    {"id": "asthma", "type": "boolean", "label": "א"},
                    {"id": "asthma", "type": "boolean", "label": "ב"},
                ],
            }
        ],
    }
    response = client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": schema},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


# -- the trial template is not this lane's ------------------------------------
def test_editing_the_trial_template_is_refused(client, as_manager, a_trial_template):
    """Conflict C3. A 409 and not a 403: the row exists and the caller is allowed to manage
    templates — this operation does not apply to that row."""
    response = client.put(
        f"/api/v1/health-templates/{a_trial_template}",
        json={"schema": FULL_TEMPLATE_SCHEMA},
        headers=as_manager.headers,
    )
    assert response.status_code == 409


def test_publishing_the_trial_template_is_refused(client, as_manager, a_trial_template):
    response = client.post(
        f"/api/v1/health-templates/{a_trial_template}/publish", headers=as_manager.headers
    )
    assert response.status_code == 409


# -- publishing ----------------------------------------------------------------
def test_publishing_mints_a_new_version_and_leaves_the_old_one_intact(
    client, as_manager, a_full_template, app_session
):
    client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": _reworded(FULL_TEMPLATE_SCHEMA, "asthma", "אסתמה?")},
        headers=as_manager.headers,
    )
    response = client.post(
        f"/api/v1/health-templates/{a_full_template}/publish", headers=as_manager.headers
    )
    assert response.status_code == 201
    body = response.json()
    assert body["template"]["version"] == FULL_TEMPLATE_SCHEMA["version"] + 1

    app_session.expire_all()
    # Scoped by studio_id: `app_session` is an UNSCOPED session (tests/health/conftest.py says
    # so), and a bare `kind == "full"` here counts every studio's templates, including the other
    # lane's, sharing this container.
    versions = sorted(
        v
        for (v,) in app_session.execute(
            select(HealthFormTemplate.version).where(
                HealthFormTemplate.studio_id == as_manager.studio_id,
                HealthFormTemplate.kind == "full",
            )
        ).all()
    )
    # Every `full` template this studio has, in order. The seeded one plus the one just
    # published -- computed rather than [1, 2], because the seed is v2 since the club's own
    # form replaced the bundled questionnaire and a literal here would need editing again
    # at v3.
    seeded = FULL_TEMPLATE_SCHEMA["version"]
    assert versions == [seeded, seeded + 1]


def test_a_declaration_keeps_its_own_version_but_gets_fresh_flags(
    client, as_manager, a_full_template, a_student, app_session
):
    """The whole reason `recompute_derived_flags` is one named entry point. A manager adds a flag
    question; every declaration in the studio is re-derived; M5 never knows it happened."""
    declaration = HealthDeclaration(
        studio_id=as_manager.studio_id,
        student_id=a_student,
        template_id=a_full_template,
        template_version=1,
        answers_encrypted={"asthma": True, "vertigo": True},
        derived_flags={"asthma": True},
        signed_by_person_id=as_manager.person_id,
        signed_at=T0,
    )
    app_session.add(declaration)
    app_session.commit()

    client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": _with_extra_flag_question(FULL_TEMPLATE_SCHEMA, "vertigo")},
        headers=as_manager.headers,
    )
    response = client.post(
        f"/api/v1/health-templates/{a_full_template}/publish", headers=as_manager.headers
    )
    assert response.status_code == 201
    assert response.json()["declarations_recomputed"] == 1

    app_session.expire_all()
    row = app_session.get(HealthDeclaration, declaration.id)
    # The literal 1 is deliberate: the row above is CONSTRUCTED with template_version=1, and
    # what this asserts is that publishing a new version did not rewrite it. Deriving it from
    # FULL_TEMPLATE_SCHEMA would make the assertion agree with itself no matter what happened.
    assert row.template_version == 1, "the signature records the questions actually asked"
    assert row.derived_flags["vertigo"] is True


def test_publishing_is_audit_logged_without_a_single_question_label(
    client, as_manager, a_full_template, audit_entries, app_session
):
    """§11.2. G7 is stated here even though a template holds no answers: the next editor of this
    diff should find the rule already written down rather than discover it."""
    client.put(
        f"/api/v1/health-templates/{a_full_template}",
        json={"schema": _with_extra_flag_question(FULL_TEMPLATE_SCHEMA, "vertigo")},
        headers=as_manager.headers,
    )
    client.post(f"/api/v1/health-templates/{a_full_template}/publish", headers=as_manager.headers)

    app_session.expire_all()
    new_id = app_session.execute(
        select(HealthFormTemplate.id).where(
            HealthFormTemplate.studio_id == as_manager.studio_id,
            HealthFormTemplate.kind == "full",
            HealthFormTemplate.version == FULL_TEMPLATE_SCHEMA["version"] + 1,
        )
    ).scalar_one()
    entries = audit_entries("health_form_template", new_id)
    assert [e.action for e in entries] == ["health_template.publish"]
    diff = entries[0].diff or {}
    assert diff["from_version"] == FULL_TEMPLATE_SCHEMA["version"]
    assert diff["to_version"] == FULL_TEMPLATE_SCHEMA["version"] + 1
    assert diff["questions_added"] == ["vertigo"]
    serialised = repr(diff)
    assert "שאלה חדשה" not in serialised, "a diff carries ids, never wording"


# -- the studio's own PDF (D11 — reference only) -------------------------------
def test_a_manager_can_upload_the_studios_own_pdf(client, as_manager, a_full_template, app_session):
    response = client.post(
        f"/api/v1/health-templates/{a_full_template}/source-pdf",
        files={"file": ("form.pdf", MINIMAL_PDF, "application/pdf")},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    app_session.expire_all()
    row = app_session.get(HealthFormTemplate, a_full_template)
    assert row.source_pdf_object_key.endswith(".pdf")


def test_uploading_a_pdf_never_changes_the_questions(
    client, as_manager, a_full_template, app_session
):
    """D11 — 'stored at source_pdf_object_key for reference'. Nothing parses it back into a
    question set, and a test says so rather than a comment."""
    before = app_session.get(HealthFormTemplate, a_full_template).schema
    client.post(
        f"/api/v1/health-templates/{a_full_template}/source-pdf",
        files={"file": ("form.pdf", MINIMAL_PDF, "application/pdf")},
        headers=as_manager.headers,
    )
    app_session.expire_all()
    assert app_session.get(HealthFormTemplate, a_full_template).schema == before


def test_a_png_wearing_a_pdf_filename_is_refused(client, as_manager, a_full_template):
    """The declared content type is attacker-controlled; the first bytes are not
    (app/core/storage.py §2.4)."""
    response = client.post(
        f"/api/v1/health-templates/{a_full_template}/source-pdf",
        files={"file": ("form.pdf", b"\x89PNG\r\n\x1a\n0000", "application/pdf")},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


# -- §3.2's matrix -------------------------------------------------------------
def test_a_lead_coach_may_not_edit_publish_or_upload(client, as_lead_coach, a_full_template):
    """§3.2 gives template management to manager and owner. A coach sees `derived_flags` and
    nothing else (§5.5); a coach who could reword a question could erase a flag."""
    assert (
        client.put(
            f"/api/v1/health-templates/{a_full_template}",
            json={"schema": FULL_TEMPLATE_SCHEMA},
            headers=as_lead_coach.headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/health-templates/{a_full_template}/publish", headers=as_lead_coach.headers
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/health-templates/{a_full_template}/source-pdf",
            files={"file": ("form.pdf", MINIMAL_PDF, "application/pdf")},
            headers=as_lead_coach.headers,
        ).status_code
        == 403
    )


def test_an_assistant_coach_may_not_edit(client, as_assistant_coach, a_full_template):
    assert (
        client.put(
            f"/api/v1/health-templates/{a_full_template}",
            json={"schema": FULL_TEMPLATE_SCHEMA},
            headers=as_assistant_coach.headers,
        ).status_code
        == 403
    )


def test_a_guardian_may_not_edit(client, as_guardian_of, a_student, a_full_template):
    parent = as_guardian_of(a_student)
    assert (
        client.put(
            f"/api/v1/health-templates/{a_full_template}",
            json={"schema": FULL_TEMPLATE_SCHEMA},
            headers=parent.headers,
        ).status_code
        == 403
    )


def test_an_owner_may_edit(client, as_owner, a_full_template):
    assert (
        client.put(
            f"/api/v1/health-templates/{a_full_template}",
            json={"schema": _reworded(FULL_TEMPLATE_SCHEMA, "asthma", "אסתמה?")},
            headers=as_owner.headers,
        ).status_code
        == 200
    )


def test_an_unknown_template_is_404_not_403(client, as_manager, a_full_template):
    """A cross-studio row is invisible rather than merely forbidden — a 403 would confirm it
    exists (app/routers/structure.py's module docstring)."""
    assert (
        client.put(
            f"/api/v1/health-templates/{uuid.uuid4()}",
            json={"schema": FULL_TEMPLATE_SCHEMA},
            headers=as_manager.headers,
        ).status_code
        == 404
    )
