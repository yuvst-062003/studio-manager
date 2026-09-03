"""§5.5's declaration flow: submit, supersede, and the two facts that never expire.

G7: every "answer" below is about a fixture child who does not exist. Nothing here decrypts
anything into a log, an audit `diff`, or an assertion message.
"""

from __future__ import annotations

import base64
import uuid

from app.models.health import HealthDeclaration
from app.models.people import Student
from app.models.studio import Studio
from app.services.structure.health_templates import FULL_TEMPLATE_SCHEMA
from sqlalchemy import select, text

#: The smallest valid PNG: 1×1, transparent. A finger-drawn signature is a PNG data URL from a
#: canvas, and the sniffing in app/core/storage.py reads the first bytes rather than the header.
ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
SIGNATURE_B64 = base64.b64encode(ONE_PIXEL_PNG).decode()

ANSWERS = {
    "asthma": True,
    "allergy": False,
    "medication": False,
    "epilepsy": False,
    "heart": False,
    "diabetes": False,
    "injury": False,
    "other": False,
    # F14 / decision "step 3": health_fund flipped to required in
    # app/services/structure/health_templates.py. This fixture is imported by every other
    # file in this directory that submits a full-template declaration, so one addition here
    # keeps all of them answering a now-required question rather than each guessing its own
    # placeholder.
    "health_fund": "מכבי",
    "emergency_contact": "050-0000000",
    # Template v2. `fit_to_train` and `notify_changes` were v1's paraphrase of the club's own
    # two sentences; the club's `טופס הרשמה` supplies the sentences themselves, and which of
    # the two applies is derived rather than chosen (app/services/health/clauses.py).
    # `asthma: True` above is why this is `limited` -- `none` would be refused by the server.
    "clause_confirmed": "limited",
}


#: The trial form's own required set (app/services/structure/health_templates.py): three flag
#: questions plus the two the funnel marks required. Shorter on purpose — §5.4a's trial
#: declaration is step 3 of five on a phone.
TRIAL_ANSWERS = {
    "asthma": False,
    "allergy": False,
    "medication": False,
    "fit_to_train": True,
    "emergency_contact": "050-0000000",
}


def _submit(client, caller, student_id, template_id, *, answers=None, signature=SIGNATURE_B64):
    body: dict[str, object] = {
        "template_id": str(template_id),
        "answers": ANSWERS if answers is None else answers,
    }
    if signature is not None:
        body["signature_image_base64"] = signature
    return client.post(
        f"/api/v1/students/{student_id}/health-declaration", json=body, headers=caller.headers
    )


# -- submitting ----------------------------------------------------------------
def test_a_guardian_submits_and_the_answers_round_trip(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    parent = as_guardian_of(a_student)
    response = _submit(client, parent, a_student, a_full_template)
    assert response.status_code == 201

    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert row.answers_encrypted["emergency_contact"] == "050-0000000"
    assert row.signed_by_person_id == parent.person_id
    assert row.template_version == FULL_TEMPLATE_SCHEMA["version"], (
        "the signature records which questions were actually asked"
    )


def test_the_answers_are_ciphertext_on_disk(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """§11.1. The ORM decrypts on read, so the only honest assertion is against the raw column —
    otherwise this test passes just as happily with the column type removed."""
    parent = as_guardian_of(a_student)
    _submit(client, parent, a_student, a_full_template)

    # Raw SQL, not the ORM column: `EncryptedJSON` decrypts on read, so an ORM select would
    # hand back the plaintext dict and this test would pass just as happily with the column type
    # removed. The point is what is actually on disk.
    raw = app_session.execute(
        text("SELECT answers_encrypted FROM health_declaration WHERE student_id = :s"),
        {"s": str(a_student)},
    ).scalar_one()
    assert raw.startswith(b"SMv1"), "the envelope format from app/core/encryption.py"
    assert b"050-0000000" not in raw
    assert "אסתמה".encode() not in raw


def test_the_signature_is_ciphertext_on_disk(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """A finger-drawn signature is biometric-adjacent personal data, stored the same way as the
    answers rather than as a plain BYTEA blob (app/models/health.py)."""
    parent = as_guardian_of(a_student)
    _submit(client, parent, a_student, a_full_template)

    raw = app_session.execute(
        text("SELECT signature_image_encrypted FROM health_declaration WHERE student_id = :s"),
        {"s": str(a_student)},
    ).scalar_one()
    assert raw.startswith(b"SMv1")
    assert ONE_PIXEL_PNG not in raw


def test_the_flags_land_on_the_row(client, as_guardian_of, a_student, a_full_template, app_session):
    parent = as_guardian_of(a_student)
    response = _submit(client, parent, a_student, a_full_template)
    assert response.json()["derived_flags"]["asthma"] is True
    assert response.json()["derived_flags"]["allergy"] is False

    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert all(isinstance(v, bool) for v in row.derived_flags.values())


def test_the_response_carries_no_answers_at_all(client, as_guardian_of, a_student, a_full_template):
    """The coach-safe shape, even for the parent who just typed them. `HealthDeclarationOut` has
    no `answers` field, and a response that grew one would leak onto every roster."""
    parent = as_guardian_of(a_student)
    body = _submit(client, parent, a_student, a_full_template).json()
    assert "answers" not in body
    assert "signature_image_base64" not in body
    assert body["has_signature"] is True


def test_submitting_moves_the_student_to_signed(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """The W3 seam's data half. M5 renders `health_status`; this is what fills it."""
    parent = as_guardian_of(a_student)
    _submit(client, parent, a_student, a_full_template)
    app_session.expire_all()
    assert app_session.get(Student, a_student).health_status == "signed"


def test_a_trial_declaration_moves_the_student_to_trial_signed_only(
    client, as_guardian_of, a_student, a_trial_template, app_session
):
    """Conflict C3's row is M3's to write against, and this lane must not upgrade a trial
    signature into a full one — §5.5's parent gate turns on exactly that difference."""
    parent = as_guardian_of(a_student)
    response = _submit(
        client,
        parent,
        a_student,
        a_trial_template,
        answers=TRIAL_ANSWERS,
    )
    assert response.status_code == 201
    app_session.expire_all()
    assert app_session.get(Student, a_student).health_status == "trial_signed"


def test_a_full_declaration_after_a_trial_one_upgrades_the_status(
    client, as_guardian_of, a_student, a_trial_template, a_full_template, app_session
):
    parent = as_guardian_of(a_student)
    _submit(
        client,
        parent,
        a_student,
        a_trial_template,
        answers=TRIAL_ANSWERS,
    )
    _submit(client, parent, a_student, a_full_template)
    app_session.expire_all()
    assert app_session.get(Student, a_student).health_status == "signed"


def test_a_second_submission_supersedes_rather_than_coexists(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """One live declaration per student (`uq_health_declaration_student_id`). Two rows would be
    two answers to 'is this child asthmatic'."""
    parent = as_guardian_of(a_student)
    _submit(client, parent, a_student, a_full_template)
    updated = dict(ANSWERS, asthma=False, allergy=True)
    response = _submit(client, parent, a_student, a_full_template, answers=updated)
    assert response.status_code == 201

    rows = list(
        app_session.execute(
            select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
        ).scalars()
    )
    assert len(rows) == 1
    app_session.expire_all()
    assert rows[0].derived_flags["asthma"] is False
    assert rows[0].derived_flags["allergy"] is True


# -- §5.5: declarations do not expire ------------------------------------------
def test_valid_until_is_null(client, as_guardian_of, a_student, a_full_template, app_session):
    parent = as_guardian_of(a_student)
    response = _submit(client, parent, a_student, a_full_template)
    assert response.json()["valid_until"] is None
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert row.valid_until is None


def test_valid_until_stays_null_even_when_the_studio_sets_a_validity(
    client, as_guardian_of, a_student, a_full_template, app_session, studio
):
    """§5.5 makes `health_declaration_validity_months` a **renewal-reminder switch**, not an
    expiry the row records. A studio that later wants annual renewal sets the setting; nothing
    here changes, and the eight artboards that assume an expiry date are wrong (12c finding 1)."""
    studio_row = app_session.get(Studio, studio.id)
    studio_row.settings = dict(studio_row.settings or {}, health_declaration_validity_months=12)
    app_session.commit()

    parent = as_guardian_of(a_student)
    _submit(client, parent, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert row.valid_until is None


# -- refusals ------------------------------------------------------------------
def test_a_submission_with_no_signature_is_refused_and_writes_nothing(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """§5.5 — 'the guardian answers the questions and draws a signature'. The field is optional in
    the schema so a validation error on the answers does not discard a signature already drawn;
    the service is what requires it."""
    parent = as_guardian_of(a_student)
    response = _submit(client, parent, a_student, a_full_template, signature=None)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "signature_required"
    assert (
        app_session.execute(
            select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
        ).scalar_one_or_none()
        is None
    )


def test_a_signature_that_is_not_a_png_is_refused(
    client, as_guardian_of, a_student, a_full_template
):
    """The bytes decide, not the caller's word. app/core/storage.py §2.4, and no SVG ever."""
    parent = as_guardian_of(a_student)
    svg = base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>").decode()
    response = _submit(client, parent, a_student, a_full_template, signature=svg)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "signature_not_a_png"


def test_a_missing_required_answer_is_refused(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """12c finding 5 — 'a declaration that defaults every question to no and gets signed is a
    health record nobody actually answered'. The server enforces it too, because a client is a
    suggestion."""
    parent = as_guardian_of(a_student)
    incomplete = {k: v for k, v in ANSWERS.items() if k != "clause_confirmed"}
    response = _submit(client, parent, a_student, a_full_template, answers=incomplete)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "answers_incomplete"
    assert (
        app_session.execute(
            select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
        ).scalar_one_or_none()
        is None
    )


def test_a_flag_question_answered_with_text_is_refused(
    client, as_guardian_of, a_student, a_full_template
):
    """§4.3 — booleans only. A string answer here is a client bug, and the loud failure is the
    cheap way to find it."""
    parent = as_guardian_of(a_student)
    response = _submit(
        client, parent, a_student, a_full_template, answers=dict(ANSWERS, asthma="כן")
    )
    assert response.status_code == 422


def test_a_guardian_of_a_different_child_may_not_submit(
    client, as_guardian_of, a_student, a_full_template, app_session, studio
):
    person = app_session.execute(
        select(Student.person_id).where(Student.id == a_student)
    ).scalar_one()
    other = Student(studio_id=studio.id, person_id=person, status="active")
    # A second student on the same person is impossible (person_id UNIQUE), so use a fresh one.
    from app.models.person import Person

    someone_else = Person(studio_id=studio.id, first_name="ילד", last_name="אחר")
    app_session.add(someone_else)
    app_session.flush()
    other = Student(studio_id=studio.id, person_id=someone_else.id, status="active")
    app_session.add(other)
    app_session.commit()

    parent = as_guardian_of(a_student)
    response = _submit(client, parent, other.id, a_full_template)
    assert response.status_code == 403


def test_a_stranger_gets_401(client, a_student, a_full_template):
    response = client.post(
        f"/api/v1/students/{a_student}/health-declaration",
        json={"template_id": str(a_full_template), "answers": ANSWERS},
    )
    assert response.status_code == 401


def test_an_unknown_student_is_404(client, as_manager, a_full_template):
    response = _submit(client, as_manager, uuid.uuid4(), a_full_template)
    assert response.status_code == 404


def test_a_manager_may_submit_on_a_parents_behalf(
    client, as_manager, a_student, a_full_template, app_session
):
    """§5.1's manager does the data entry for a club that arrives on paper. The record still
    names who signed it — `signed_by_person_id` is the manager, and the audit row says so."""
    response = _submit(client, as_manager, a_student, a_full_template)
    assert response.status_code == 201
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert row.signed_by_person_id == as_manager.person_id


def test_a_coach_may_not_submit(client, as_lead_coach, a_student, a_full_template):
    """§3.2 gives a coach no write on a health declaration at all."""
    assert _submit(client, as_lead_coach, a_student, a_full_template).status_code == 403


# -- the signing context (§5.5) ------------------------------------------------
def test_the_user_agent_is_recorded(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """§5.5 — 'the signing person, timestamp, IP and user agent'. D11 says the bundled template
    is not a compliance artefact; a defensible audit trail is what makes it usable anyway."""
    parent = as_guardian_of(a_student)
    client.post(
        f"/api/v1/students/{a_student}/health-declaration",
        json={
            "template_id": str(a_full_template),
            "answers": ANSWERS,
            "signature_image_base64": SIGNATURE_B64,
        },
        headers={**parent.headers, "User-Agent": "StudioManager/1.0 (test)"},
    )
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert row.signed_user_agent == "StudioManager/1.0 (test)"


def test_signed_at_comes_from_the_one_clock(
    client, as_guardian_of, a_student, a_full_template, app_session
):
    """`app.core.clock.now()` is the only clock, and `X-Dev-Now` shifts it for one request. The
    fixture headers carry T0, so a `datetime.now()` anywhere in the path fails here."""
    from tests.health.conftest import T0

    parent = as_guardian_of(a_student)
    _submit(client, parent, a_student, a_full_template)
    row = app_session.execute(
        select(HealthDeclaration).where(HealthDeclaration.student_id == a_student)
    ).scalar_one()
    assert row.signed_at == T0
