"""D11's default `full` question set -- "ship a standard Israeli sports health declaration
as the default health_form_template question set, seeded by migration. A manager can add,
remove and reword questions in the app."

15 item 1 used to make the studio's own הצהרת בריאות PDF a hard blocker on the whole M4
lane, because the template was to be derived from it. D11 closed that on 2026-08-24 and
this file is what makes the closure real: there IS a default set, every studio has one, and
it says out loud that it is a starting point.

**D11's caveat is not decoration.** A health declaration for minors in an Israeli sports
club touches insurance and regulatory ground. The bundled template is a starting point and
the app must say so where the manager edits it; it is not a compliance artefact.
`is_bundled_default` is the machine-readable half of that, `template.disclaimer` in
web/packages/i18n/{he,en,ru}/health.ts the visible one.

These live beside tests/structure/test_trial_template.py rather than in tests/health/,
deliberately. The trial half is M1's and the seed half is main's; tests/health/** belongs to
lane HEALTH, and a contract commit filling it would hand the lane a directory it did not
write.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from app.models.health import HealthFormTemplate
from app.models.studio import Studio
from app.services.structure.health_templates import (
    FULL_FLAG_QUESTIONS,
    FULL_TEMPLATE_SCHEMA,
    TRIAL_TEMPLATE_SCHEMA,
    ensure_full_template,
    ensure_trial_template,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[2]
T0 = datetime(2026, 8, 26, 12, 0, tzinfo=UTC)


@pytest.fixture
def studio_id(app_session: Session) -> Iterator[uuid.UUID]:
    studio = Studio(name="מועדון", slug=f"ft-{uuid.uuid4().hex[:8]}")
    app_session.add(studio)
    app_session.commit()
    yield studio.id
    app_session.rollback()


def _questions() -> list[dict]:
    return [q for section in FULL_TEMPLATE_SCHEMA["sections"] for q in section["questions"]]


def _count(session: Session, studio_id: uuid.UUID, kind: str) -> int:
    return session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.studio_id == studio_id, HealthFormTemplate.kind == kind)
    ).scalar_one()


# -- the seed reaches every studio, not only the ones alive at migration time -----------
def test_the_migration_seeded_a_full_template(app_session):
    """D11 says "seeded by migration". The demo studio is created by revision 0003, so at
    least one studio exists when 0007 runs and the INSERT has something to reach."""
    rows = app_session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.kind == "full", HealthFormTemplate.version == 1)
    ).scalar_one()
    assert rows >= 1


def test_a_studio_provisioned_after_the_migration_still_gets_one(app_session, studio_id):
    """The hole a migration-only seed leaves. A studio created tomorrow never ran 0007's
    INSERT, and lane HEALTH cannot fix that from inside a worktree -- seeding is a
    migration and migrations are main-only."""
    ensure_full_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "full") == 1


def test_seeding_twice_does_not_create_a_second(app_session, studio_id):
    """Same reason as the trial form: the wizard is resumable (5.1), and the unique index
    on (studio_id, kind, version) would turn a second published v1 into an integrity error
    rather than a duplicate."""
    ensure_full_template(app_session, studio_id, at=T0)
    ensure_full_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "full") == 1


def test_it_returns_the_existing_row_rather_than_none(app_session, studio_id):
    """The caller reads the id back. Returning None on the second call would make the
    happy path depend on whether it had run before."""
    first = ensure_full_template(app_session, studio_id, at=T0)
    second = ensure_full_template(app_session, studio_id, at=T0)
    assert first.id == second.id


def test_seeding_the_full_one_does_not_disturb_the_trial_one(app_session, studio_id):
    """Conflict C3's resolution has to survive this wave. M3's trial booking writes against
    the kind='trial' template and nothing here may replace or renumber it."""
    trial = ensure_trial_template(app_session, studio_id, at=T0)
    ensure_full_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "trial") == 1
    assert ensure_trial_template(app_session, studio_id, at=T0).id == trial.id


# -- D11's caveat -----------------------------------------------------------------------
def test_the_bundled_marker_is_gone():
    """The inverse of the test that used to stand here, and the reason is the whole change.

    D11 shipped `is_bundled_default: True` so the editor could tell a manager whose questions
    it was showing -- ours, until they reworded them. Template v2's declaration section is the
    CLUB's own `טופס הרשמה`, so there is no bundled set left to mark, and a marker still riding
    along would have the editor claim the club is editing ours."""
    assert "is_bundled_default" not in FULL_TEMPLATE_SCHEMA


def test_the_disclaimer_string_is_gone_from_every_locale():
    """D11's caveat -- "a starting point only, not a compliance artefact" -- was true of a
    question set we wrote and handed to a club that had not reviewed it. It is false about the
    club's own form and its own תקנון, signed under the club's own name, so it is removed from
    the screen, the editor and the PDF alike.

    Asserted rather than assumed: one locale left behind is one language in which the app still
    disclaims a document it is no longer entitled to disclaim."""
    for locale in ("he", "en", "ru"):
        text = (ROOT / f"web/packages/i18n/{locale}/health.ts").read_text(encoding="utf-8")
        assert "'template.disclaimer'" not in text, locale
        assert "'template.editingBundled'" not in text, locale


def test_the_club_terms_strings_exist_in_every_locale():
    """What replaced the caveat. A family ticking "I have read the terms" against a missing
    string has agreed to a blank space."""
    for locale in ("he", "en", "ru"):
        text = (ROOT / f"web/packages/i18n/{locale}/health.ts").read_text(encoding="utf-8")
        for key in (
            "clubTerms.title",
            "clubTerms.payment.cheques",
            "clubTerms.payment.cancellation",
            "clubTerms.payment.proRata",
            "clubTerms.accept",
            "declaration.clause.none",
            "declaration.clause.limited",
        ):
            assert f"'{key}'" in text, f"{locale}: {key}"


# -- the shape a coach's badge is derived from ------------------------------------------
def test_every_flag_question_has_a_label_to_render():
    """5.5's badge is drawn from `flag.<id>` in the i18n bundle. A flag question whose id
    has no label renders a blank chip -- a warning that silently is not one, on the one
    screen where 5.5's warning actually matters."""
    text = (ROOT / "web/packages/i18n/he/health.ts").read_text(encoding="utf-8")
    for question_id in FULL_FLAG_QUESTIONS:
        assert f"'flag.{question_id}'" in text, question_id


def test_every_flag_question_is_marked_as_one():
    """M4's derived-flag pipeline reads the marks. A question named in FULL_FLAG_QUESTIONS
    but not marked would silently produce no badge."""
    marked = {q["id"] for q in _questions() if q.get("flag")}
    assert marked == set(FULL_FLAG_QUESTIONS)


def test_every_flag_question_is_a_boolean():
    """G7 and 5.5 -- derived_flags holds booleans only, never free text. A free-text flag
    question would put a minor's medical prose on a coach's screen, which is exactly what
    the flag mechanism replaced."""
    for question in _questions():
        if question.get("flag"):
            assert question["type"] == "boolean", question["id"]


def test_the_set_asks_what_an_israeli_sports_declaration_asks():
    """D11 -- "a standard Israeli sports health declaration". The cardiac questions and the
    family sudden-death question are what a sports declaration exists for; dropping them
    leaves a form that is merely short rather than standard."""
    ids = {q["id"] for q in _questions()}
    # `fit_to_train` was v1's paraphrase of the club's own declaration sentence. v2 carries the
    # sentence itself, confirmed through `clause_confirmed` -- so the attestation is still
    # required, by a question that quotes the club rather than approximating it.
    for expected in ("heart", "family_sudden_death", "chest_pain", "fainting", "clause_confirmed"):
        assert expected in ids, expected


def test_it_is_longer_than_the_trial_form_and_that_is_the_point():
    """5.4a's trial form is short because it sits in a five-step funnel walked on a phone,
    and a long form is where that funnel leaks. The full one is signed once, at leisure, and
    makes the opposite trade."""
    trial = [q for s in TRIAL_TEMPLATE_SCHEMA["sections"] for q in s["questions"]]
    assert len(_questions()) > len(trial)


def test_the_schema_is_versioned_so_a_signature_records_what_was_signed():
    """4.3 stores template_version on the declaration. D11 makes editing the questions a
    manager's right, so without a version a template edit silently rewrites the meaning of
    every signature already collected."""
    # v2: the club's own `טופס הרשמה` replaced the bundled questionnaire. v1 is still seeded
    # and still rendered for the signatures made against it -- see revision 0018.
    assert FULL_TEMPLATE_SCHEMA["version"] == 2
    assert FULL_TEMPLATE_SCHEMA["kind"] == "full"


def test_the_schema_carries_no_place_for_an_answer():
    """The template holds questions. Anything resembling storage for a response belongs on
    health_declaration, encrypted (11.1)."""
    text = str(FULL_TEMPLATE_SCHEMA)
    for forbidden in ("answers", "signature_image", "signed_by", "derived_flags"):
        assert forbidden not in text, forbidden
