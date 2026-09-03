"""Request and response shapes for /attendance, /absence-reports and /sync/bootstrap.

**`BootstrapPayload` is the offline contract.** §6.1: first launch blocks on fetching
today's and tomorrow's sessions and rosters into IndexedDB before the coach reaches Today.
Everything a roster renders has to be *in this payload* — a field that needs a second
request is a field that is blank in a basement.

**This module is where §1.3 seam 4 actually lives.** `RosterEntry.health_status` and
`RosterEntry.derived_flags` are populated by M4 and rendered by M5. Neither lane opens the
other's file: M5 writes `<HealthBadge status={row.health_status} flags={row.derived_flags} />`
against these two fields, and M4 owns both the component and the code that fills them.

**Invariant 3 is why there is no money here.** The roster is the most coach-reachable
payload in the product; a `balance_agorot` on `RosterEntry` would fail that gate for every
coach at once. `plan_name` is the deliberate exception -- a plan's label, never its
`monthly_amount_agorot` -- see `app/services/attendance/roster.py::RosterRowRaw`.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas._pagination import CursorPage
from app.schemas.health import DerivedFlags, HealthStatus, _flags_are_booleans
from app.schemas.schedule import SessionOut

#: §4.3 — `attendance  status(unmarked|present|absent_excused|absent_unexcused)`.
#: A `Literal` rather than a pattern: the staff app switches on these to pick a mark
#: glyph, and a union in the generated client turns a typo into a compile error.
AttendanceStatus = Literal["unmarked", "present", "absent_excused", "absent_unexcused"]

#: §4.3 — `attendance  source(coach|parent|bulk|system)`. §10.5's conflict rules are
#: expressed entirely through this value; see `app/models/attendance.py`.
AttendanceSource = Literal["coach", "parent", "bulk", "system"]


class AttendanceIn(BaseModel):
    """One mark, as the client produces it.

    `client_mark_id` is **required and client-generated**. §10.3: the local write is not
    an API call, so the id cannot come from one — it exists in `pending_ops` before the
    device has any idea when it will next reach a network. It is what makes a replay
    idempotent (§10.5, "same device flushes twice → no-op").

    `device_marked_at` is likewise the client's clock, not the server's. §10.5 resolves a
    two-coach conflict on it, because resolving on arrival time would let whoever
    reconnected second overwrite the earlier mark.
    """

    student_id: uuid.UUID
    status: AttendanceStatus
    client_mark_id: uuid.UUID
    device_marked_at: datetime
    note: str | None = Field(default=None, max_length=500)


class BatchAttendanceIn(BaseModel):
    """`POST /attendance/batch` — §7 marks it **(idempotent)**.

    The batch is the offline queue's flush. It is idempotent per *mark*, on
    `client_mark_id`, rather than per request: a queue that partially reached the server
    must be safe to resend whole, and a request-level key would make the second attempt a
    no-op that silently dropped the marks the first attempt never delivered.
    """

    session_id: uuid.UUID
    marks: list[AttendanceIn] = Field(min_length=1, max_length=500)
    #: §10.5 — the coach's device believed the session was in this state when they marked.
    #: A manager cancelling the session meanwhile is the cross-actor conflict this field
    #: lets the server detect rather than silently apply.
    session_status_seen: str | None = None


class BulkPresentIn(BaseModel):
    """`POST /sessions/{id}/attendance/bulk-present`.

    §5.7's "bulk mark with the pre-report protection rule", and the rule is in the name of
    the field below. §10.5: **a parent pre-report never loses to a bulk action regardless
    of timestamp.** The default is therefore to protect, so a caller that omits the field
    gets the safe branch rather than overwriting every parent who reported this morning.
    """

    client_mark_id_prefix: uuid.UUID
    device_marked_at: datetime
    respect_absence_reports: bool = True


class AttendanceOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    student_id: uuid.UUID
    status: AttendanceStatus
    source: AttendanceSource
    marked_by_person_id: uuid.UUID | None
    marked_at: datetime
    device_marked_at: datetime
    client_mark_id: uuid.UUID
    note: str | None


class AbsenceReportIn(BaseModel):
    """`POST /absence-reports`. §5.7's "הודיעו מראש".

    §10.2: this **requires a connection on purpose** and the parent app says so, rather
    than queuing into the void. There is deliberately no `client_mark_id` here — an
    offline pre-report that syncs after the class started is not a pre-report, and giving
    it a queue id would imply otherwise.
    """

    student_id: uuid.UUID
    session_id: uuid.UUID
    reason: str | None = Field(default=None, max_length=200)


class AbsenceReportOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    session_id: uuid.UUID
    reported_by_person_id: uuid.UUID
    reason: str | None
    created_at: datetime


class RosterEntry(BaseModel):
    """One student on a coach's roster. **The W3 seam** (plan §1.3 seam 4).

    `health_status` and `derived_flags` are M4's to populate and M5's to render. They are
    on this shape rather than fetched separately because the roster must render **offline**
    (§6.1) — a badge that needs a second request is a badge that is blank in a basement,
    which is the one place §5.5's warning actually matters.

    §5.5's gate is a **hard block in the parent app only**. Nothing on the mat is ever
    blocked: this shape carries the ⚠ and the coach can still mark the student present.
    There is deliberately no `blocked` field, because there is deliberately no
    `block_attendance_without_health` setting.
    """

    student_id: uuid.UUID
    display_name: str
    #: Rendered by `BeltBar`, whose D7 ring is unconditional.
    belt_color_hex: str | None = None
    belt_name: str | None = None
    #: `PricePlan.name` only -- never an amount. `None` until a manager chooses one.
    plan_name: str | None = None
    #: -- the seam ------------------------------------------------------------
    health_status: HealthStatus = "missing"
    #: §5.5 — booleans only, never free text. This is what a coach sees.
    derived_flags: DerivedFlags = Field(default_factory=dict)
    #: -- the current mark ----------------------------------------------------
    status: AttendanceStatus = "unmarked"
    source: AttendanceSource | None = None
    #: §10.5 — a bulk action must not overwrite this, regardless of timestamps.
    has_absence_report: bool = False
    absence_reason: str | None = None
    #: The parent said the child WILL be there. Separate from `has_absence_report`
    #: because "said yes", "said no" and "has not answered" are three states — a coach
    #: reading one boolean cannot tell the last two apart, which is the gap this closes.
    has_confirmation: bool = False

    _validate_flags = field_validator("derived_flags", mode="before")(_flags_are_booleans)


class SessionRosterOut(BaseModel):
    """`GET /sessions/{id}/attendance`."""

    session: SessionOut
    roster: list[RosterEntry] = Field(default_factory=list)


class BootstrapPayload(BaseModel):
    """`GET /sync/bootstrap?from&to` — §6.1's offline priming payload.

    **Everything the staff app needs before it loses the network.** §6.1 makes first launch
    block on this, so it is one round trip by design rather than a convenience wrapper.

    `server_time` is carried so the client can detect clock skew: §10.5 resolves conflicts
    on `device_marked_at`, and a device whose clock is an hour out would win or lose every
    conflict for the wrong reason. §10.4's staleness banner is computed from it too.
    """

    server_time: datetime
    #: §10.6 — the cache is bounded to two days. The window is echoed back so the client
    #: evicts against what it actually received rather than what it asked for.
    from_time: datetime
    to_time: datetime
    sessions: list[SessionOut] = Field(default_factory=list)
    #: Keyed by session id. One roster per session in the window.
    rosters: dict[uuid.UUID, list[RosterEntry]] = Field(default_factory=dict)


class InjuryReportIn(BaseModel):
    """`9g`'s injury report (S2) -- written by the coach, read by the manager and the
    child's guardians. The description is the coach's own words FOR those readers; it is
    not a health-declaration content and is never logged (G7 still applies to logs)."""

    student_id: uuid.UUID
    description: str = Field(min_length=1, max_length=500)


class InjuryReportOut(BaseModel):
    #: How many people were actually told. Zero is a fact worth surfacing -- a student
    #: with no guardian on file and a studio with no manager would otherwise "send" a
    #: report nobody receives.
    notified: int


class UnmarkedSessionOut(BaseModel):
    """One row of `4c`'s `ממתין לסימון` list — a lesson that has ended with nothing
    decided about anybody in it.

    Deliberately NOT `SessionOut`. That shape carries the whole session projection and this
    list is a chase list: an id to act on, a group to recognise, a time to feel bad about.
    A wider shape would also have to be kept invariant-3 clean for no gain.
    """

    id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    starts_at: datetime
    ends_at: datetime


class GroupAttendanceRate(BaseModel):
    """`4c`'s second card — name · bar · percentage, for one group over the window.

    **`rate_percent` is nullable and that is the whole design.** The denominator is the
    marks somebody actually decided: present + absent_excused + absent_unexcused. §5.14
    makes `unmarked` a real state so that a coach who forgot the register does not read as
    a child who stopped coming, and a rate that counted `unmarked` as absence would undo
    that in the one number a manager quotes. A group with no decided marks in the window
    therefore has no rate — `null`, never `0`, because 0% is a claim about children who did
    not come and "nobody said" is not that claim.

    `sessions` and `marked_sessions` are carried so the percentage can be read with its
    coverage beside it: 100% over one marked session out of nine is a different fact from
    100% over nine, and a bar alone cannot tell them apart.
    """

    group_id: uuid.UUID
    group_name: str
    present: int
    #: Excused and unexcused together. The rate asks who was on the mat, and a parent's
    #: advance notice makes an absence polite rather than attended.
    absent: int
    #: Reported, never divided by. See the class docstring.
    unmarked: int
    rate_percent: int | None
    sessions: int
    marked_sessions: int


class AttendanceReportOut(BaseModel):
    """`GET /attendance/report?from&to` — artboard `4c`, in one round trip.

    Both halves of the screen come from one request because they are one question asked of
    one window: which lessons were not signed, and how are the groups doing. Two endpoints
    would let a date picker drive them out of step for a frame, and the range is echoed back
    for the same reason `BootstrapPayload` echoes its own — a client should render what it
    received rather than what it asked for.
    """

    #: Echoed back. Unlike `/sync/bootstrap` this is never clamped; see the router.
    from_date: date
    to_date: date
    unmarked_sessions: list[UnmarkedSessionOut] = Field(default_factory=list)
    groups: list[GroupAttendanceRate] = Field(default_factory=list)


AttendancePage = CursorPage[AttendanceOut]
AbsenceReportPage = CursorPage[AbsenceReportOut]
