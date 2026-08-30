"""Three exceptions, so a router maps outcomes to status codes in one place.

A service raising `HTTPException` would be a service whose guarantees depend on being
called from a router -- and `.claude/rules/api.md` puts authorization in the router
precisely so services stay callable from a worker. The follow-up job (§5.4a) calls the
same code paths the routes do, with no request anywhere in sight.
"""

from __future__ import annotations

import uuid


class NotFoundError(Exception):
    """The row is not in the caller's studio. The router answers 404 and never 403: a
    403 confirms the row exists somewhere, which is a cross-tenant read with a polite
    error message."""


class ConflictError(Exception):
    """The write would duplicate something the schema, or §5.4, forbids -- a second live
    enrollment in one group, a second free trial, a guardian who is already linked."""


class RefusedError(Exception):
    """The input is well-formed and the row exists, but the product says no. An illegal
    status transition, an `attends_weekdays` naming a day the group does not train."""


class DuplicateStudentError(RefusedError):
    """A self-service door was asked to create a child who is already on the roster.

    **A refusal rather than an acceptance, because accepting creates a dead end.** Two
    students for one child -- one `trial`, one `active`, both on the register -- is a
    correction only a manager can make, and neither the parent nor the product can see that
    it happened. A 422 that names the problem costs one round trip.

    A `RefusedError` subclass so a caller that has not heard of it still refuses rather than
    crashing; every caller that HAS heard of it catches this one first. `student_id` is the
    existing child, and it is the ROUTER's job to decide whether this caller may be told
    about them -- naming a student the caller is not a guardian of would disclose that a
    child of that name trains here (§11.1).
    """

    def __init__(self, message: str, *, student_id: uuid.UUID, display_name: str) -> None:
        super().__init__(message)
        self.student_id = student_id
        self.display_name = display_name
