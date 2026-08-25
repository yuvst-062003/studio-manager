"""Request and response shapes for /sessions, /training-years, /closures, /groups/{id}/schedule.

**No money field appears anywhere here**, for the same reason `structure.py` carries none:
invariant 3 forbids any coach-reachable endpoint returning a financial field, and every
schedule endpoint is coach-reachable by definition.

**`SessionOut` is the widest-read shape in the product.** M3's trial-slot picker, M5's
offline bootstrap, the parent day strip and the dashboard calendar all render it. It is
therefore deliberately flat and complete — a caller that has a `SessionOut` never needs a
second request to decide what to draw, which is what makes it cacheable in IndexedDB
(§10.6) rather than a join the client has to re-do offline.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field, model_validator

from app.schemas._pagination import CursorPage

#: §4.3 — mirrored as patterns so FastAPI publishes them into the OpenAPI schema and the
#: generated client gets a union type rather than a bare string.
SESSION_STATUS_PATTERN = r"^(scheduled|cancelled|completed)$"
TRAINING_YEAR_STATUS_PATTERN = r"^(draft|active|closed)$"
CLOSURE_SOURCE_PATTERN = r"^(holiday_preset|manual)$"
SESSION_STAFF_ROLE_PATTERN = r"^(lead_coach|assistant_coach)$"


class SessionStaffOut(BaseModel):
    person_id: uuid.UUID
    display_name: str
    role: str = Field(pattern=SESSION_STAFF_ROLE_PATTERN)
    is_substitute: bool


class SessionOut(BaseModel):
    """One materialized session. G3 — `starts_at`/`ends_at` are UTC instants; the client
    renders them in Asia/Jerusalem regardless of locale (`@studio/core`'s `datetime`)."""

    id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    training_year_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    location_id: uuid.UUID | None
    location_name: str | None
    status: str = Field(pattern=SESSION_STATUS_PATTERN)
    #: §5.6 / E2E-5 — the client shows a lock on a session a regenerate will not touch.
    is_manually_edited: bool
    is_ad_hoc: bool
    cancel_reason: str | None
    staff: list[SessionStaffOut] = Field(default_factory=list)
    #: D5's session block "surfaces coverage and completion — is a coach assigned, is it
    #: cancelled, has attendance been taken — *not* registration counts." Children are
    #: enrolled, not booking (§5.4), so capacity is near-irrelevant to us.
    attendance_taken: bool = False


class TrialSlotOut(BaseModel):
    """§7 — `GET /public/groups/{id}/trial-slots`, the next N bookable sessions.

    **Unauthenticated, so it is a deliberately narrower projection of `SessionOut`.** No
    staff list, no ids beyond the session and group, no note of whether attendance was
    taken. A public landing page (§5.4, parent `13a`) has no business knowing which coach
    is on the mat, and the cheapest way to guarantee that is a shape that cannot carry it.
    """

    session_id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    starts_at: datetime
    ends_at: datetime
    location_name: str | None
    #: §5.4 — the picker greys out a slot rather than hiding it, so a parent can see the
    #: class exists and pick a different week instead of concluding there is nothing.
    is_bookable: bool = True


class TrainingYearCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def _the_year_ends_after_it_starts(self) -> TrainingYearCreate:
        if self.ends_on <= self.starts_on:
            raise ValueError("ends_on must be after starts_on")
        return self


class TrainingYearOut(BaseModel):
    id: uuid.UUID
    name: str
    starts_on: date
    ends_on: date
    status: str = Field(pattern=TRAINING_YEAR_STATUS_PATTERN)


class ClosureCreate(BaseModel):
    training_year_id: uuid.UUID
    date_from: date
    date_to: date
    reason: str = Field(min_length=1, max_length=200)
    #: §5.6 — a preset the manager ticked is still `holiday_preset`; what the column
    #: records is where the suggestion came from, not who confirmed it.
    source: str = Field(default="manual", pattern=CLOSURE_SOURCE_PATTERN)

    @model_validator(mode="after")
    def _the_closure_ends_on_or_after_it_starts(self) -> ClosureCreate:
        if self.date_to < self.date_from:
            raise ValueError("date_to must not precede date_from")
        return self


class ClosureOut(BaseModel):
    id: uuid.UUID
    training_year_id: uuid.UUID
    date_from: date
    date_to: date
    reason: str
    source: str = Field(pattern=CLOSURE_SOURCE_PATTERN)


class HolidayPresetOut(BaseModel):
    """§7 — `GET /holiday-presets?year=2026`.

    §5.6 is emphatic that these are **proposals the manager ticks, never automatic
    closures**. The shape carries no `applied` flag for that reason: a preset is not a
    thing that can be in a state, it is a suggestion. Ticking one creates a `Closure`.
    """

    key: str
    name: str
    date_from: date
    date_to: date


class ScheduleRuleIn(BaseModel):
    """One weekly rule. `weekday` is 0–6 with **0 = Sunday**, matching Israel's working
    week and Postgres's `EXTRACT(DOW)`."""

    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    location_id: uuid.UUID | None = None
    effective_from: date

    @model_validator(mode="after")
    def _the_session_ends_after_it_starts(self) -> ScheduleRuleIn:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ScheduleRuleOut(ScheduleRuleIn):
    id: uuid.UUID
    group_id: uuid.UUID
    effective_to: date | None = None


class SchedulePutIn(BaseModel):
    """`PUT /groups/{id}/schedule`. §7: "PUT returns an impact preview before applying."

    `apply` is what makes one endpoint serve both halves. `false` (the default) computes
    the preview and writes nothing; `true` performs the change. Defaulting to the harmless
    branch means a caller that forgets the field gets a preview rather than an unreviewed
    rewrite of a whole training year's sessions.
    """

    rules: list[ScheduleRuleIn]
    effective_from: date
    apply: bool = False


class ProtectedSessionOut(BaseModel):
    """One session the change will not touch, named rather than merely counted.

    §5.6's dialog prints the manually-edited ones as bullets — `· 15.11 אימון ים 90 דק'` —
    because "2 sessions were manually edited" tells a manager nothing about which two. The
    shape carries no title: `session` has no name column, and inventing one here would be a
    field with nothing behind it. The client renders the date and the time range.
    """

    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime


class ScheduleImpactPreview(BaseModel):
    """§5.6's impact dialog: "showing exactly what will change before it changes."

    The three protected counts are listed separately rather than summed, because the
    manager's question is not "how many are safe" but "what am I about to lose". E2E-5
    asserts `sessions_protected_manually_edited` is non-zero for a group with an edited
    session and that those sessions are unchanged afterwards.
    """

    sessions_to_create: int
    sessions_to_update: int
    sessions_to_cancel: int
    #: §5.6 — never overwritten. Past sessions and manually-edited ones, counted apart so
    #: the dialog can say *why* a session is untouched.
    sessions_protected_past: int
    sessions_protected_manually_edited: int
    sessions_protected_ad_hoc: int
    first_affected_date: date | None = None
    #: §5.6's bullet list. Only the manually-edited ones: the past is a count (there is
    #: nothing to decide about it) and an ad-hoc session was never going to be touched.
    protected_manually_edited_sessions: list[ProtectedSessionOut] = Field(default_factory=list)
    #: **C12.** Students this change leaves expecting nothing — `attends_weekdays` no
    #: longer intersects any day the group trains on. They vanish off the roster and stop
    #: being counted absent, which looks exactly like the feature working. The dialog says
    #: `⚠ 3 תלמידים לא רשומים לאף יום אחרי השינוי`; this is the 3.
    students_left_unscheduled: int = 0


SessionPage = CursorPage[SessionOut]
TrainingYearPage = CursorPage[TrainingYearOut]
ClosurePage = CursorPage[ClosureOut]
