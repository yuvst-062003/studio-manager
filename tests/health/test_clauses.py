"""The club form's two health clauses are ALTERNATIVES, and which one applies is derived.

`טופס הרשמה` block 5 offers a parent two sentences and expects exactly one signature:

  1. "אין מגבלות רפואיות/רגישויות כלשהן" -- and an undertaking to report any that arise
  2. "למרות המגבלות הרפואיות המצוינות לעיל, ... מסוגל לעמוד במאמץ"

On paper the parent picks. In the app the answers already decide it, so the parent
confirms the one that follows from what they said rather than choosing again -- and the
server refuses a confirmation that contradicts the answers, because a client is a
suggestion.
"""

from __future__ import annotations

import pytest
from app.services.health.clauses import (
    CLAUSE_LIMITED,
    CLAUSE_NONE,
    ClauseMismatchError,
    applicable_clause,
    verify_clause,
)
from app.services.structure.health_templates import FULL_TEMPLATE_SCHEMA


def test_all_no_gives_the_no_limitations_clause():
    answers = {"asthma": False, "allergy": False, "medication": False}
    assert applicable_clause(FULL_TEMPLATE_SCHEMA, answers) == CLAUSE_NONE


@pytest.mark.parametrize("flag", ["asthma", "allergy", "medication", "epilepsy", "heart"])
def test_any_yes_gives_the_limited_clause(flag):
    assert applicable_clause(FULL_TEMPLATE_SCHEMA, {flag: True}) == CLAUSE_LIMITED


def test_a_non_flag_boolean_also_counts():
    """`chest_pain` produces no coach badge, but a parent who ticked it is not declaring
    'no medical limitations of any kind'. The clause follows the ANSWERS, not the flags."""
    assert applicable_clause(FULL_TEMPLATE_SCHEMA, {"chest_pain": True}) == CLAUSE_LIMITED


def test_free_text_restrictions_count():
    answers = {"asthma": False, "restrictions": "לא מבצע נפילות אחורה"}
    assert applicable_clause(FULL_TEMPLATE_SCHEMA, answers) == CLAUSE_LIMITED


def test_whitespace_only_restrictions_do_not_count():
    """A space bar pressed by accident is not a medical limitation."""
    assert applicable_clause(FULL_TEMPLATE_SCHEMA, {"restrictions": "   "}) == CLAUSE_NONE


def test_special_notes_alone_do_not_force_the_limited_clause():
    """`הערות בריאות מיוחדות` is a free note -- 'מרכיב משקפיים' is not a declaration that
    the child cannot train. Only answers to actual questions move the clause."""
    answers = {"asthma": False, "special_notes": "מרכיב משקפיים"}
    assert applicable_clause(FULL_TEMPLATE_SCHEMA, answers) == CLAUSE_NONE


def test_the_emergency_phone_does_not_move_the_clause():
    """Every family gives one; it says nothing about fitness to train."""
    answers = {"asthma": False, "emergency_contact": "050-1234567"}
    assert applicable_clause(FULL_TEMPLATE_SCHEMA, answers) == CLAUSE_NONE


def test_verify_accepts_the_clause_that_follows():
    verify_clause(FULL_TEMPLATE_SCHEMA, {"asthma": True}, CLAUSE_LIMITED)
    verify_clause(FULL_TEMPLATE_SCHEMA, {"asthma": False}, CLAUSE_NONE)


def test_verify_refuses_declaring_no_limitations_over_a_yes():
    """The one that matters. A client that let a family declare 'no limitations at all'
    while answering yes to asthma would put a false legal statement under a signature."""
    with pytest.raises(ClauseMismatchError):
        verify_clause(FULL_TEMPLATE_SCHEMA, {"asthma": True}, CLAUSE_NONE)


def test_verify_refuses_the_limited_clause_when_nothing_was_declared():
    """The mirror case. Clause 2 says 'despite the limitations noted above' -- signing it
    with no limitations noted makes the document refer to something that is not there."""
    with pytest.raises(ClauseMismatchError):
        verify_clause(FULL_TEMPLATE_SCHEMA, {"asthma": False}, CLAUSE_LIMITED)


def test_verify_refuses_an_unknown_clause_id():
    with pytest.raises(ClauseMismatchError):
        verify_clause(FULL_TEMPLATE_SCHEMA, {"asthma": False}, "whatever")
