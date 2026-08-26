"""§5.7's attendance vertical, and §10's offline queue's server half.

Everything here runs inside a `TenantSession`, so the tenant filter is already on every
query and the stamp already on every insert. Nothing below passes `studio_id` by hand.
"""

from __future__ import annotations

from app.services.attendance.errors import ForbiddenError, NotFoundError, PreconditionError
from app.services.attendance.resolve import (
    Decision,
    ExistingMark,
    IncomingMark,
    resolve_mark,
)

__all__ = [
    "Decision",
    "ExistingMark",
    "ForbiddenError",
    "IncomingMark",
    "NotFoundError",
    "PreconditionError",
    "resolve_mark",
]
