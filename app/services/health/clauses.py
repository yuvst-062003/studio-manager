"""The club form's two health clauses, and the rule that picks between them.

`טופס הרשמה` block 5 is not a question with two answers -- it is two **alternative
declarations**, and the paper form expects the parent to sign under exactly one:

  1. `אין מגבלות רפואיות/רגישויות כלשהן` -- plus an undertaking to report any that arise
  2. `למרות המגבלות הרפואיות המצוינות לעיל, ... מסוגל לעמוד במאמץ הדרוש`

**The app does not choose for the parent, and it does not let the parent choose freely.**
Both failure modes are real and they are opposite:

  * Choosing silently would have the app make a legal statement on a family's behalf. The
    parent must see the sentence they are signing.
  * Leaving it open would let a family declare "no medical limitations of any kind" on the
    same form where they answered yes to asthma -- a false statement, under a signature,
    that the club would then rely on.

So the clause is DERIVED from the answers, rendered for confirmation, and the confirmation
is checked against the answers again here. `verify_clause` is the server half; the client
renders the same rule, and a client is a suggestion.

**G7.** Nothing here logs, and nothing here holds an answer beyond the call.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

#: `הנני מצהיר/ה כי לרשום מעלה אין מגבלות רפואיות/רגישויות כלשהן`.
CLAUSE_NONE = "none"

#: `הנני מצהיר/ה כי למרות המגבלות הרפואיות המצוינות לעיל`.
CLAUSE_LIMITED = "limited"

CLAUSE_IDS = (CLAUSE_NONE, CLAUSE_LIMITED)

#: Questions whose answers say nothing about fitness to train, and so never move the
#: clause. Named rather than inferred, so adding a question that SHOULD move it is the
#: default and exempting one is a visible diff.
#:
#: `special_notes` is `הערות בריאות מיוחדות` -- a free note, where "מרכיב משקפיים" is a
#: normal thing to write and is not a declaration that a child cannot train. Answering a
#: *question* moves the clause; annotating the form does not.
_NEUTRAL_QUESTIONS = frozenset({"special_notes", "emergency_contact", "health_fund"})

#: The `clause` question itself, which obviously cannot be an input to its own rule.
CLAUSE_QUESTION_ID = "clause_confirmed"


class ClauseMismatchError(Exception):
    """The confirmed clause is not the one the answers imply.

    Raised in both directions. Declaring "no limitations" over a `yes` is the dangerous
    one; declaring "despite the limitations noted above" with none noted makes the
    document refer to something that is not in it.
    """


def _questions(schema: Mapping[str, Any]) -> Iterator[Mapping[str, Any]]:
    for section in schema.get("sections") or ():
        if not isinstance(section, Mapping):
            continue
        for question in section.get("questions") or ():
            if isinstance(question, Mapping) and question.get("id"):
                yield question


def declares_a_limitation(schema: Mapping[str, Any], answers: Mapping[str, Any]) -> bool:
    """True when anything in the answers amounts to a medical limitation.

    Deliberately broader than `FULL_FLAG_QUESTIONS`. A flag exists to raise a coach's ⚠
    badge; this decides which legal sentence a parent signs, and `chest_pain` produces no
    badge while plainly contradicting "no medical limitations of any kind". The
    conservative direction is the safe one here: over-reporting sends a family to clause 2,
    which is a true statement either way.
    """
    for question in _questions(schema):
        qid = str(question["id"])
        if qid in _NEUTRAL_QUESTIONS or qid == CLAUSE_QUESTION_ID:
            continue
        value = answers.get(qid)
        if question.get("type") == "boolean":
            if value is True:
                return True
        elif isinstance(value, str) and value.strip():
            # A free-text medical field with content in it -- `restrictions`,
            # `allergy_details`, `medication_details`. Whitespace is not content: a space
            # bar pressed by accident is not a medical limitation.
            return True
    return False


def applicable_clause(schema: Mapping[str, Any], answers: Mapping[str, Any]) -> str:
    """Which of the two sentences this family is entitled to sign."""
    return CLAUSE_LIMITED if declares_a_limitation(schema, answers) else CLAUSE_NONE


def verify_clause(
    schema: Mapping[str, Any], answers: Mapping[str, Any], confirmed: str | None
) -> str:
    """Raise unless `confirmed` is the clause the answers imply. Returns it on success."""
    if confirmed not in CLAUSE_IDS:
        raise ClauseMismatchError("no clause was confirmed")
    expected = applicable_clause(schema, answers)
    if confirmed != expected:
        # The message names the clauses, never an answer (G7).
        raise ClauseMismatchError(f"answers imply clause {expected!r}, not {confirmed!r}")
    return expected
