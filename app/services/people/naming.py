"""One place to turn a person's `first_name` + `last_name` into a display string.

Decision 20 shrank the manager's add-student form to three fields -- student name,
`18 ומעלה?`, guardian email. The manager no longer types the parent's name, so the
guardian `Person` row is created with an empty `first_name` and `last_name`, on purpose:
the parent fills in their own name later, in the wizard.

`f"{first_name} {last_name}"` on two empty strings is `" "` -- a single space, not an
empty string. That is not caught by an `if not display_name` check, and it is not obvious
from reading the f-string that it needs one. It rendered as a blank row on the manager's
screens for every guardian who had not yet completed onboarding.

Every producer of a `display_name` (or `*_display_name`) field should call this instead
of concatenating locally, so an absent name comes out `""` -- the truth -- and never a
string that merely looks empty.
"""

from __future__ import annotations


def format_person_name(first_name: str | None, last_name: str | None) -> str:
    """`""` when both parts are empty or missing. Never a bare space."""
    return f"{first_name or ''} {last_name or ''}".strip()
