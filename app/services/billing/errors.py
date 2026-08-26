"""Three exceptions, so a router maps outcomes to status codes in one place.

A service raising `HTTPException` would be a service whose guarantees depend on being
called from a router -- and `.claude/rules/api.md` puts authorization in the router
precisely so services stay callable from a worker. §5.10's monthly run is a worker: it
calls these same code paths with no request anywhere in sight.
"""

from __future__ import annotations


class NotFoundError(Exception):
    """The row is not in the caller's studio. The router answers 404 and never 403: a 403
    confirms the row exists somewhere, which is a cross-tenant read with a polite error
    message."""


class ConflictError(Exception):
    """The write would duplicate something the schema, or §5.10, forbids -- a second
    tuition charge for one student and period, a second allocation of one payment against
    one charge."""


class RefusedError(Exception):
    """The input is well-formed and the row exists, but the product says no. Allocating
    more than a payment holds, reversing a payment twice, paying a charge already covered
    by an open order."""
