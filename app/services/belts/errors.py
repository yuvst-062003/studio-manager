"""Belt domain errors, translated into HTTP by `app/routers/belts.py` (G6)."""

from __future__ import annotations


class BeltRankNotFoundError(LookupError):
    """No such rank in the active studio."""


class BeltRankIsHeldError(RuntimeError):
    """Students hold this rank.

    `student_belt.belt_rank_id` is ON DELETE RESTRICT, so the alternative to refusing is a
    500 -- and if the constraint were ever relaxed, a grading history pointing at nothing.
    `5b`'s row already shows the count, so the refusal has its reason on screen.
    """


class LadderClassRequiredError(ValueError):
    """`belt_rank.class_id` is NOT NULL while `BeltRankIn.class_id` is optional.

    §5.9 -- a karate white belt and a judo white belt are different rows on different
    ladders, so a rank without a class is not a rank.
    """


class LadderOrderCollisionError(RuntimeError):
    """`uq_belt_rank_class_order`.

    Two ranks at one position make "the next belt" ambiguous, which is the whole question a
    progression screen answers.
    """


class NotThisClassesLadderError(ValueError):
    """A reorder naming a rank from another class, or omitting one of its own.

    A partial list would leave the omitted ranks sitting at indices the named ones are
    about to take.
    """


class LadderAlreadySeededError(RuntimeError):
    """The class already has a ladder.

    A second seed renumbers ranks that `student_belt` rows already point at, which rewrites
    a child's history without touching their row.
    """


class NoSuchPresetError(LookupError):
    """§5.9's seeded sets are versioned. An unknown key is a client error, not an empty
    ladder."""


class BeltAlreadyAwardedError(RuntimeError):
    """`uq_student_belt_student_rank`.

    A re-award is a data-entry mistake, and it would show the same belt twice on `12d`'s
    timeline.
    """
