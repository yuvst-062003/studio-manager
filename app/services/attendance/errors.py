"""What this lane raises, and the one distinction that matters.

`NotFoundError` is deliberately not distinguished from "does not exist anywhere", the same
way `app/services/schedule/service.py` states it: the tenant filter makes another studio's
row invisible, and a 403 would confirm it is real.
"""

from __future__ import annotations


class NotFoundError(LookupError):
    """A row this studio cannot see."""


class ForbiddenError(Exception):
    """An identity that may not act on a row it CAN see.

    Distinct from `NotFoundError` on purpose: a guardian asking about another family's
    child gets a 404, but a guardian asking about their own child at a session that has
    already started gets a refusal with a reason, because hiding it would be a lie about
    a lesson they can see on their own calendar.
    """


class PreconditionError(Exception):
    """A write the studio's own state forbids -- §10.2's deadline, a duplicate report.

    Carries a `code` because §10.2 makes the parent app SAY WHY rather than fail silently,
    and `attendance.absence.tooLate` and `.alreadyReported` are two different strings.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
