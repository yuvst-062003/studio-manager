"""§19.7 -- the demo studio never contaminates a cross-studio number.

'The demo studio is excluded from platform_studio_stats, from every cross-studio report
and from the operations board totals (§18.3), so it never contaminates the numbers you
use to judge real studios.'

One helper, built in M0, so that no report written in M9 has to remember. The
alternative -- each report adding its own `WHERE NOT is_demo` -- fails the first time
someone forgets, and it fails quietly: the operations board simply reads one studio
higher than reality and nobody notices for a month.

It takes the studio-id column rather than assuming a shape, because a report's
`studio_id` is usually on the aggregate row (`platform_studio_stats.studio_id`), not on
a joined `studio` table.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ColumnElement, Select, select

from app.models.studio import Studio


def non_demo_studio_ids() -> Select[Any]:
    """Every studio a cross-studio number may legitimately count."""
    return select(Studio.id).where(Studio.is_demo.is_(False))


def exclude_demo_studios(
    stmt: Select[Any], studio_id_column: ColumnElement[uuid.UUID]
) -> Select[Any]:
    """Restrict a cross-studio query to studios holding real people.

    A subquery rather than a join: the caller has already built their own joins, and a
    helper that adds one changes their row count. `IN (SELECT ...)` composes with
    anything.
    """
    return stmt.where(studio_id_column.in_(non_demo_studio_ids()))


#: Files that legitimately reach across studios without excluding the demo studio, and
#: the reason each is exempt. tests/restrictions/test_19_7_demo_data_hygiene.py asserts
#: every other file that touches the escape hatch applies the helper.
CROSS_STUDIO_CALLERS: dict[str, str] = {
    "app/core/tenancy.py": ("defines with_all_tenants; it is the escape hatch, not a caller of it"),
    "app/core/demo.py": "this file -- it is the exclusion",
    "app/services/demo/service.py": (
        "the demo reset operates ON the demo studio by definition; excluding it would "
        "make the reset a no-op"
    ),
    "app/services/demo/fixtures.py": (
        "seeds the demo studio's own tenant root, for the same reason"
    ),
    "app/services/identity/platform.py": (
        "SPEC 18.1 -- the console operates above every studio because 5.1 makes it the "
        "only thing that can create one. 19.7 is about reports and totals; this is the "
        "operator's own inventory, and hiding the demo studio from the one screen that "
        "lists studios would make it unmanageable"
    ),
    "app/services/identity/resolution.py": (
        "SPEC 5.2's login resolver answers 'which studios are yours?' before any studio "
        "is in context, and 3.3 requires one identity to reach several. It is not a "
        "report and feeds no total, so 19.7 does not apply -- and excluding the demo "
        "studio here would make it unreachable to the developer account, which is the "
        "opposite of what 19.1 exists for"
    ),
}
