"""Conflict C3 -- 'M3's trial booking needs a health declaration that 14 puts in M4.
health_form_template.kind is already (full|trial) in 4.3. Seed the kind='trial' template
here; that is what unblocks M3 without pulling M4 forward.'

5.4a's funnel puts the trial declaration at step 3 of five, before the parent picks a
session. A trial booking with nothing to sign is a funnel that stops there.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from app.models.health import HealthFormTemplate
from app.models.studio import Studio
from app.services.structure.health_templates import (
    TRIAL_FLAG_QUESTIONS,
    TRIAL_TEMPLATE_SCHEMA,
    ensure_trial_template,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

T0 = datetime(2026, 8, 25, 12, 0, tzinfo=UTC)


@pytest.fixture
def studio_id(app_session: Session) -> Iterator[uuid.UUID]:
    studio = Studio(name="מועדון", slug=f"tt-{uuid.uuid4().hex[:8]}")
    app_session.add(studio)
    app_session.commit()
    yield studio.id
    app_session.rollback()


def _count(session: Session, studio_id: uuid.UUID, kind: str) -> int:
    return session.execute(
        select(func.count())
        .select_from(HealthFormTemplate)
        .where(HealthFormTemplate.studio_id == studio_id, HealthFormTemplate.kind == kind)
    ).scalar_one()


def test_seeding_creates_one_trial_template(app_session, studio_id):
    ensure_trial_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "trial") == 1


def test_seeding_twice_does_not_create_a_second(app_session, studio_id):
    """The wizard is resumable (5.1) and a studio can be set up over several sittings, so
    this runs more than once. A second published v1 trial template is ambiguity at the
    moment a parent is signing."""
    ensure_trial_template(app_session, studio_id, at=T0)
    ensure_trial_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "trial") == 1


def test_seeding_returns_the_existing_row_rather_than_none(app_session, studio_id):
    """M3 calls this and reads the id back. Returning None on the second call would make
    the caller's happy path depend on whether it had run before."""
    first = ensure_trial_template(app_session, studio_id, at=T0)
    second = ensure_trial_template(app_session, studio_id, at=T0)
    assert first.id == second.id


def test_no_full_template_is_seeded_here(app_session, studio_id):
    """C3 says seed the TRIAL one. Seeding the full one too would be pulling M4 forward,
    which is the thing C3's resolution exists to avoid."""
    ensure_trial_template(app_session, studio_id, at=T0)
    app_session.commit()
    assert _count(app_session, studio_id, "full") == 0


def test_the_trial_schema_is_short_enough_not_to_leak_the_funnel():
    """5.4a's funnel has five steps and this is step 3, walked on a phone. A trial form as
    long as the full one is exactly where the funnel leaks -- which is the whole reason
    `kind` is an enum rather than one template for everything."""
    questions = [q for section in TRIAL_TEMPLATE_SCHEMA["sections"] for q in section["questions"]]
    assert len(questions) <= 8


def test_the_trial_schema_asks_the_questions_a_coach_needs_on_the_mat():
    """5.5 -- 'Coaches see only derived_flags -- a ⚠ badge with אסתמה or אלרגיה.' A trial
    form that does not ask cannot derive them, and a first session is when nobody in the
    room knows the child."""
    ids = {q["id"] for section in TRIAL_TEMPLATE_SCHEMA["sections"] for q in section["questions"]}
    assert set(TRIAL_FLAG_QUESTIONS) <= ids


def test_every_flag_question_is_marked_as_one():
    """M4's derived-flag pipeline reads the marks. A question named in
    TRIAL_FLAG_QUESTIONS but not marked would silently produce no badge."""
    marked = {
        q["id"]
        for section in TRIAL_TEMPLATE_SCHEMA["sections"]
        for q in section["questions"]
        if q.get("flag")
    }
    assert marked == set(TRIAL_FLAG_QUESTIONS)


def test_every_flag_question_is_a_boolean():
    """G7 and 5.5 -- 'derived_flags holds booleans only, never free text. This is what a
    coach sees.' A free-text flag question would put a minor's medical prose on a roster."""
    for section in TRIAL_TEMPLATE_SCHEMA["sections"]:
        for question in section["questions"]:
            if question.get("flag"):
                assert question["type"] == "boolean", question["id"]


def test_the_schema_is_versioned_so_a_signature_records_what_was_signed():
    """4.3 stores template_version on the declaration. A schema with no version makes that
    column meaningless the first time the questions change."""
    assert TRIAL_TEMPLATE_SCHEMA["version"] == 1


def test_the_schema_carries_no_place_for_an_answer():
    """The template holds questions. Anything resembling storage for a response belongs on
    M4's health_declaration, encrypted."""
    text = str(TRIAL_TEMPLATE_SCHEMA)
    for forbidden in ("answers", "signature", "signed_by", "derived_flags"):
        assert forbidden not in text, forbidden
