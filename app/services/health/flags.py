"""§5.5's `derived_flags`, derived. Pure functions: no session, no request, no I/O.

**This is the only place a flag is computed**, and `HealthService.recompute_derived_flags` is the
only place one is written. The split is deliberate: derivation is a property of (answers, schema)
and nothing else, so it is testable without a database, and the seam M5 depends on has exactly one
implementation behind it.

**Why the schema decides and not `FULL_FLAG_QUESTIONS`.** D11 makes the question set editable — a
manager adds, removes and rewords questions. The frozen constant describes the *bundled* set, which
is the starting point, not the studio's set. A declaration is signed against a specific
`template_version`, and its flags must mean what that version's questions asked. So derivation reads
the schema it is handed; the constant survives as the thing the bundled schema is asserted to agree
with (`tests/health/test_flags.py`).

**Booleans only** (§4.3). A free-text flag is a medical description on a coach's screen, which
is precisely what the flag mechanism replaced. A non-boolean answer to a flag question is refused
rather than converted, for the reason `app/schemas/health.py::_flags_are_booleans` states at
length: `"no"` silently becoming `False` hides a real condition, and `1` silently becoming `True`
raises a ⚠ nobody's declaration asked for. A false alarm teaches coaches to ignore the badge, and
§5.5's warning is only useful while it is trusted.

**G7.** Nothing here logs, and the return value carries no answer — only whether each flag question
was answered yes.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def _questions(schema: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    questions: list[Mapping[str, Any]] = []
    for section in schema.get("sections") or ():
        if not isinstance(section, Mapping):
            continue
        for question in section.get("questions") or ():
            if isinstance(question, Mapping):
                questions.append(question)
    return questions


def flag_question_ids(schema: Mapping[str, Any]) -> tuple[str, ...]:
    """The ids whose answers become `derived_flags`, in the manager's own order.

    Order matters on a roster: the chips read the way the questionnaire does, so a coach scanning
    a row sees the studio's own priorities rather than an alphabetisation nobody chose.
    """
    return tuple(
        str(question["id"])
        for question in _questions(schema)
        if question.get("flag") is True and question.get("id") is not None
    )


def derive_flags(answers: Mapping[str, Any], schema: Mapping[str, Any]) -> dict[str, bool]:
    """`{"asthma": True, "allergy": False}` — booleans, one per flag question in `schema`.

    An unanswered flag question is `False` rather than absent. A roster renders chips for the
    `True` ones, and a key that sometimes vanishes would make "no asthma" and "never asked"
    indistinguishable at the one moment the difference matters.

    Raises `ValueError` when a flag question's answer is present and is not a `bool`. That is a bug
    in whoever derived it, and the loud failure is the cheap way to find it.
    """
    flags: dict[str, bool] = {}
    for question_id in flag_question_ids(schema):
        if question_id not in answers:
            flags[question_id] = False
            continue
        answer = answers[question_id]
        if not isinstance(answer, bool):
            raise ValueError(
                f"answer to flag question {question_id!r} is {type(answer).__name__}, not a bool: "
                "§4.3 allows booleans only, never free text"
            )
        flags[question_id] = answer
    return flags
