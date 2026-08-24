"""SPEC §18.2's break-glass boundary, and §19.6's third restriction.

'Health declarations are excluded from break-glass entirely. If you need to debug
something touching them, you debug the shape and the encryption, never the contents.'
And §19.6: 'the developer flag does not change that.'

The `is_developer` parameter exists so that last sentence can be **asserted** rather than
inferred from the parameter's absence. A test passes both values and requires the same
answer. That is a deliberately useless parameter, and it is useless on purpose.

M9 owns the elevation itself -- the reason, the expiry, the notification to the owner and
the per-read audit entries. What lands in M0 is the one decision the developer account
must not be able to move.
"""

from __future__ import annotations

#: SPEC §4.3's health tables. M4 adds the models; the names are fixed here so a table
#: added there without an entry here is a red build (restriction 3's test asserts this
#: set covers them).
HEALTH_ENTITY_TYPES = frozenset(
    {
        "health_declaration",
        "health_declaration_version",
        "health_template",
    }
)


def break_glass_may_read(entity_type: str, *, is_developer: bool = False) -> bool:
    """Whether an elevated platform admin may read this entity type's contents.

    `is_developer` is accepted and deliberately ignored. §19.6: the flag does not change
    what break-glass excludes, and a parameter that is asserted to make no difference is
    stronger than a parameter that was never offered -- the second could be added later
    by someone who did not know.
    """
    del is_developer  # §19.6 -- named, accepted, and intentionally not consulted.
    return entity_type not in HEALTH_ENTITY_TYPES
