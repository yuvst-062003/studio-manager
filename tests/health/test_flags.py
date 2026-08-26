"""§5.5's derived flags, derived. Pure functions, no database, no request.

**Why the schema and not the constant.** `FULL_FLAG_QUESTIONS` freezes the bundled set's eight
ids, and D11 makes the question set editable — so a manager who adds a flag question has a
template the constant does not describe. Derivation follows the *schema a declaration was signed
against*, and the constant is what the bundled schema is asserted to agree with.

G7: nothing here is a real answer about a real child. The strings below are shaped like answers
and are about nobody.
"""

from __future__ import annotations

import pytest
from app.services.health.flags import derive_flags, flag_question_ids
from app.services.structure.health_templates import (
    FULL_FLAG_QUESTIONS,
    FULL_TEMPLATE_SCHEMA,
    TRIAL_FLAG_QUESTIONS,
    TRIAL_TEMPLATE_SCHEMA,
)


def test_the_bundled_schema_declares_exactly_the_eight_frozen_flag_questions():
    """The constant and the schema are two statements of one fact, and they must agree.

    A question that quietly loses its `flag: True` is a ⚠ that silently stops appearing on the
    one screen §5.5's warning matters on. This is the test that makes that a red diff.

    **Membership, not order.** `FULL_FLAG_QUESTIONS` lists `heart` before `diabetes`; the schema
    puts `diabetes` in the medical-history section and `heart` in the cardiac one, so it derives
    them the other way round. The constant's stated job is "M4's pipeline reads one list, and a
    question that quietly loses its flag is a visible diff" — that is a set property. Order is the
    manager's, and it is the schema that carries it (`test_flag_ids_are_returned_in_schema_order`).
    """
    assert set(flag_question_ids(FULL_TEMPLATE_SCHEMA)) == set(FULL_FLAG_QUESTIONS)
    assert len(flag_question_ids(FULL_TEMPLATE_SCHEMA)) == len(FULL_FLAG_QUESTIONS)


def test_the_trial_schema_agrees_with_its_own_constant_too():
    """Conflict C3's row is not this lane's to change, so this asserts it was left alone."""
    assert set(flag_question_ids(TRIAL_TEMPLATE_SCHEMA)) == set(TRIAL_FLAG_QUESTIONS)


def test_every_flag_is_a_boolean_and_an_unanswered_flag_is_false():
    flags = derive_flags({"asthma": True}, FULL_TEMPLATE_SCHEMA)
    assert flags["asthma"] is True
    assert flags["allergy"] is False
    assert set(flags) == set(FULL_FLAG_QUESTIONS)
    assert all(isinstance(value, bool) for value in flags.values())


def test_free_text_never_becomes_a_flag():
    """§4.3 — a free-text flag is a medical description on a coach's screen, which is exactly
    what the flag mechanism replaced."""
    flags = derive_flags(
        {"asthma": True, "allergy_details": "פירוט כלשהו", "restrictions": "אין"},
        FULL_TEMPLATE_SCHEMA,
    )
    assert "allergy_details" not in flags
    assert "restrictions" not in flags
    assert all(isinstance(value, bool) for value in flags.values())


def test_a_string_answer_to_a_flag_question_is_refused_rather_than_coerced():
    """Both coercions are dangerous in opposite directions and `app/schemas/health.py` already
    argues it: `"no"` silently becoming False hides a real condition, and `1` silently becoming
    True raises a ⚠ nobody's declaration asked for. A false alarm teaches coaches to ignore the
    badge, which is worse than showing none."""
    with pytest.raises(ValueError, match="asthma"):
        derive_flags({"asthma": "no"}, FULL_TEMPLATE_SCHEMA)


def test_an_integer_answer_to_a_flag_question_is_refused_too():
    with pytest.raises(ValueError, match="allergy"):
        derive_flags({"allergy": 1}, FULL_TEMPLATE_SCHEMA)


def test_a_non_flag_question_may_hold_anything_at_all():
    """Only flag questions are constrained. The rest are the encrypted record, and §5.5 puts no
    type rule on them — a phone number, a free-text restriction and a health fund all live there."""
    flags = derive_flags(
        {"emergency_contact": "050-0000000", "health_fund": "כללית", "asthma": False},
        FULL_TEMPLATE_SCHEMA,
    )
    assert flags["asthma"] is False


def test_a_manager_added_flag_question_derives_a_flag():
    """D11 — the question set is editable, so derivation follows the schema, not a constant."""
    schema = {
        "version": 2,
        "kind": "full",
        "sections": [
            {
                "id": "extra",
                "title": "נוסף",
                "questions": [
                    {"id": "vertigo", "type": "boolean", "label": "סחרחורות", "flag": True}
                ],
            }
        ],
    }
    assert derive_flags({"vertigo": True}, schema) == {"vertigo": True}


def test_a_manager_removing_a_flag_question_removes_the_flag():
    """The other direction, and the reason `recompute_derived_flags` exists: a roster must stop
    showing a ⚠ for a question the studio no longer asks."""
    schema = {
        "version": 3,
        "kind": "full",
        "sections": [{"id": "s", "questions": [{"id": "asthma", "type": "boolean", "flag": True}]}],
    }
    assert derive_flags({"asthma": True, "allergy": True}, schema) == {"asthma": True}


def test_a_schema_with_no_questions_derives_no_flags():
    assert derive_flags({"asthma": True}, {"version": 1, "kind": "full", "sections": []}) == {}


def test_flag_ids_are_returned_in_schema_order():
    """Order is the manager's, so the chips on a roster read the way the questionnaire does."""
    schema = {
        "sections": [
            {"questions": [{"id": "b", "flag": True}, {"id": "a", "flag": True}]},
            {"questions": [{"id": "c", "flag": True}]},
        ]
    }
    assert flag_question_ids(schema) == ("b", "a", "c")
