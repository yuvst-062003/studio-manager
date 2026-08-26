"""Three exceptions, so a router maps outcomes to status codes in one place.

A service raising `HTTPException` would be a service whose guarantees depend on being
called from a router -- and `.claude/rules/api.md` puts authorization in the router
precisely so services stay callable from a worker. The follow-up job (§5.4a) calls the
same code paths the routes do, with no request anywhere in sight.
"""

from __future__ import annotations


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
