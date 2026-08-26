"""The response shapes `POST /attendance/batch` and `POST .../bulk-present` return.

**Why these are here and not in `app/schemas/attendance.py`.** That module belongs to W3's
contract commit, which authored `AttendanceIn`, `BatchAttendanceIn`, `BulkPresentIn`,
`RosterEntry` and `BootstrapPayload` — the shapes both lanes agreed on before either
started. It did not author a *result* shape for a flush, because nothing outside this lane
consumes one. This lane owns `app/services/attendance/**`, so the shape lands here rather
than in a file W3's ownership list does not give it. Where a Pydantic model lives has no
effect on the generated OpenAPI component, so nothing downstream can tell.

**No free text anywhere in a conflict.** §10.5's cards are rendered from
`attendance.conflict.*`, nine keys the i18n namespace already carries. A server-authored
sentence here would be a tenth Hebrew string §9 cannot reach, in the one place a manager
is being asked to make a decision.
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

#: §10.5's cross-actor cases, one member each. `rejected` is the catch-all the client
#: renders with `attendance.conflict.title`; the other two have their own copy.
ConflictKind = Literal["session_cancelled", "student_unenrolled", "rejected"]


class AttendanceConflictOut(BaseModel):
    """One dismissible card. §10.5: "nothing is silently dropped".

    A card is raised **beside** stored marks, never instead of them. `count` is how many
    marks it concerns, which is what artboard `1c`'s copy interpolates
    (`השיעור בוטל — התקבלו 22 סימוני נוכחות`).
    """

    kind: ConflictKind
    session_id: uuid.UUID
    #: Which children it concerns. Empty for a session-wide conflict, because a manager
    #: deciding about a cancelled lesson is deciding about the lesson.
    student_ids: list[uuid.UUID] = Field(default_factory=list)
    count: int


class BatchResult(BaseModel):
    """What the server did with a flush.

    Four numbers rather than one, because the client shows different things for each:

    * `applied` — written. The queue entry is done.
    * `replayed` — the same `client_mark_id` was already stored (§10.5). **Also done**: a
      replay is a successful flush, not a failure, and a client that retried it forever
      would never drain its queue.
    * `superseded` — somebody else's later mark won on `device_marked_at`. Done too, and
      worth showing: the coach's tap did reach the server and did not take effect.
    * `conflicts` — stored, and a human has to decide.
    """

    applied: int = 0
    replayed: int = 0
    superseded: int = 0
    conflicts: list[AttendanceConflictOut] = Field(default_factory=list)
