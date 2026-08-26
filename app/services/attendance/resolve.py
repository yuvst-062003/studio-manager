"""§10.5's conflict rules, as one pure function.

**Why this is a module and not four `if`s inside the service.** The rules apply on three
different paths -- a batch flush from a coach's queue, a bulk `סמן הכל נוכח`, and a
parent's pre-report -- and each of those paths is written by somebody looking at a
different part of the spec. Three implementations of "last write by `device_marked_at`,
except a parent pre-report" is three chances to get the exception wrong, and the artboards
already show what that looks like: `9f` finding 1 is the bulk action overwriting the
parent's advance notice, drawn on the screen that announces it two rows above.

**No session, no I/O, no clock.** Everything the decision needs is in its two arguments,
which is what lets `tests/attendance/test_resolve.py` state each of §10.5's rows as one
assertion rather than a fixture chain.

The four rows, verbatim from §10.5:

* *Two coaches mark the same session.* Last write by `device_marked_at` wins.
* *...except a parent pre-report, which never loses to a bulk action regardless of
  timestamp.*
* *The same device flushes twice.* Idempotent on `client_mark_id`; the replay is a no-op.
* *Coach marks offline; a manager cancels the session meanwhile.* Not a decision this
  function makes -- the mark is still **stored** and the conflict is raised alongside it,
  which is `service.py`'s job. Nothing here ever answers "discard".
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

#: §4.3's `source` value a materialized roster row carries before anybody has said
#: anything. It is written by the system at roster time, hours before a coach taps, so it
#: must never win a `device_marked_at` comparison -- see `_is_placeholder`.
PLACEHOLDER_STATUS = "unmarked"


@dataclass(frozen=True)
class ExistingMark:
    """The row already in the database."""

    status: str
    source: str
    device_marked_at: datetime
    client_mark_id: uuid.UUID


@dataclass(frozen=True)
class IncomingMark:
    """The mark arriving from a queue flush, a bulk action or a parent."""

    status: str
    source: str
    device_marked_at: datetime
    client_mark_id: uuid.UUID


class Decision(StrEnum):
    """What the caller does with the incoming mark.

    **There is no `DISCARD`.** §10.3: "there is no code path that discards unsynced work."
    `KEEP_EXISTING` is not a discard -- the mark reached the server, the server made a
    decision, and the client learns which one. What §10.3 forbids is the *client* throwing
    work away before it is ever seen, and a resolver that could answer "discard" would be
    an invitation to build that.
    """

    APPLY = "apply"
    #: The same `client_mark_id` is already stored. A no-op, and deliberately distinct
    #: from `KEEP_EXISTING`: a replay is a *successful* flush, not a conflict.
    REPLAY = "replay"
    KEEP_EXISTING = "keep_existing"


def _is_placeholder(mark: ExistingMark) -> bool:
    """A roster row nobody has touched.

    §5.14 makes `unmarked` a real, stored state rather than a missing row, which means a
    session's roster is materialized with `unmarked` rows whose `device_marked_at` is
    whenever the roster was built. That instant is frequently *later* than the coach's tap
    -- a roster refreshed at 17:05 for a session a coach started marking at 17:00 -- so
    resolving those on the timestamp alone would make the roster permanently unmarkable.

    A coach tapping a row back to `unmarked` is a different thing entirely and is not
    covered here: that carries `source='coach'`, so it takes the ordinary timestamp path.
    """
    return mark.status == PLACEHOLDER_STATUS and mark.source == "system"


def resolve_mark(existing: ExistingMark | None, incoming: IncomingMark) -> Decision:
    """Which of the two marks the row should hold.

    Order matters, and each branch is a sentence of §10.5:

    1. Nothing stored -- apply.
    2. Same `client_mark_id` -- replay, a no-op.
    3. A **bulk** action against a **parent** pre-report -- keep, *regardless of
       timestamp*. Checked before the clock comparison, because "regardless of timestamp"
       means the clock is never consulted, not that it usually loses.
    4. A **bulk** action against anything a human already set -- keep. §5.7: "it does not
       touch rows a coach has already set."
    5. A system placeholder -- apply, whatever the clocks say.
    6. Otherwise, last write by `device_marked_at`. A tie keeps what is stored, which
       makes the function total.
    """
    if existing is None:
        return Decision.APPLY

    if existing.client_mark_id == incoming.client_mark_id:
        return Decision.REPLAY

    if incoming.source == "bulk":
        # §5.7's bulk rule in full: it sets every `unmarked` row to `present`, and touches
        # nothing else. The parent pre-report is the case §10.5 calls out by name, and the
        # coach's own mark is the case §5.7 does; a placeholder is neither, so it falls
        # through to the apply below.
        return Decision.APPLY if _is_placeholder(existing) else Decision.KEEP_EXISTING

    if _is_placeholder(existing):
        return Decision.APPLY

    if incoming.device_marked_at > existing.device_marked_at:
        return Decision.APPLY
    return Decision.KEEP_EXISTING
