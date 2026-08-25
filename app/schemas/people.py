"""Request and response shapes for /students, /guardians, /enrollments, /registration-requests.

**No money field appears anywhere here.** A student's debt is a `charge` query (W4), never
a column on `StudentOut` — invariant 3 forbids a coach-reachable endpoint returning a
financial field, and the roster is the most coach-reachable endpoint in the product.
Putting `balance_agorot` on `StudentOut` would fail that gate for every caller at once.

**`GuardianOut` carries no permission fields**, because §5.3 says there are none to carry:
"All guardians are equal. `is_primary` decides only bill addressing and הוראת קבע
matching." A `can_edit` or `is_readonly` flag here would invite a client to branch on
something the server does not branch on.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, Field, model_validator

from app.schemas._pagination import CursorPage
from app.schemas.schedule import TrialSlotOut

#: §4.3, mirrored as patterns so the generated client gets unions rather than `string`.
STUDENT_STATUS_PATTERN = r"^(lead|trial|pending_approval|active|frozen|left|lost)$"
HEALTH_STATUS_PATTERN = r"^(missing|trial_signed|signed)$"
ENROLLMENT_STATUS_PATTERN = r"^(pending|active|frozen|ended)$"
TRIAL_OUTCOME_PATTERN = r"^(pending|converted|lost)$"
REGISTRATION_SOURCE_PATTERN = r"^(public_link|parent_app|manager)$"
REGISTRATION_STATUS_PATTERN = r"^(pending|approved|rejected)$"

#: C12 — `enrollment.attends_weekdays`. 0-6 **Sunday-first**, matching
#: `group_schedule_rule.weekday` (§4.3) and not Python's Monday-first `date.weekday()`.
#: Bounded here as well as by the table's CHECK so the generated client and the OpenAPI
#: document both carry the range: a client sending 7 should be told why, not 500'd.
Weekday = Annotated[int, Field(ge=0, le=6)]


class GuardianOut(BaseModel):
    """§4.3's `guardian` link, projected.

    `is_primary` is reported because the parent app shows whose name the bill carries
    (§5.10) — not because anything is gated on it. See the module docstring.
    """

    person_id: uuid.UUID
    student_id: uuid.UUID
    display_name: str
    relation: str
    is_primary: bool
    phone: str | None = None
    email: str | None = None


class StudentOut(BaseModel):
    """One student, as every surface reads them.

    `health_status` is here and `derived_flags` is **not**. That split is §5.5's whole
    privacy model: the status is a three-valued fact a coach may see, the flags are health
    data and travel only on the roster payload a coach is already authorised for
    (`BootstrapPayload.roster[]`, W3). A general-purpose student shape that carried flags
    would leak them into every screen that happens to list students.
    """

    id: uuid.UUID
    person_id: uuid.UUID
    first_name: str
    last_name: str
    birthdate: date | None
    status: str = Field(pattern=STUDENT_STATUS_PATTERN)
    health_status: str = Field(pattern=HEALTH_STATUS_PATTERN)
    joined_on: date | None
    left_on: date | None
    current_belt_id: uuid.UUID | None
    #: C11 — the tuition price is set per **student**, never per enrollment. The id only;
    #: the amount is W4's `PricePlanOut`, behind a manager-scoped endpoint.
    price_plan_id: uuid.UUID | None = None
    #: Rendered as `BeltBar` — D7's ring is unconditional, so the colour travels raw and
    #: the component is what guarantees it is never fill-only.
    current_belt_name: str | None = None
    current_belt_color_hex: str | None = None
    guardians: list[GuardianOut] = Field(default_factory=list)


class GuardianCreate(BaseModel):
    """§5.3 — guardians are invited by email or phone, and the invitation carries a token
    binding the accepting identity to the pre-created Person.

    Declared above `StudentCreate` because that shape references it: `from __future__
    import annotations` makes the annotation a string, but Pydantic resolves it when the
    model class is built, so the name has to exist by then.
    """

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    relation: str = Field(default="parent", max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    #: §5.3 — this decides bill addressing and הוראת קבע matching, and nothing else.
    is_primary: bool = False

    @model_validator(mode="after")
    def _a_guardian_is_reachable(self) -> GuardianCreate:
        if not self.email and not self.phone:
            raise ValueError("a guardian needs an email or a phone to be invited on")
        return self


class StudentCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    birthdate: date | None = None
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    #: §5.4 — a manager adding a student directly. The public link cannot reach this.
    group_id: uuid.UUID | None = None
    #: §5.4(a) — 'parent details → child details and group'. One request, because a
    #: student with no guardian is a child nobody can be contacted about, and §5.3 makes
    #: at least one guardian structural rather than optional.
    #:
    #: Optional on the shape rather than required, because §5.4a's trial booking reuses
    #: `StudentCreate` for its `children[]` and supplies the parent once for the whole
    #: submission. `POST /students` rejects an absent guardian at the router.
    guardian: GuardianCreate | None = None


class StudentUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    birthdate: date | None = None
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)


class StudentFreezeIn(BaseModel):
    """§7 — `POST /students/{id}/freeze`. §5.10 step 4: a frozen student generates no
    charge for the frozen period, which is why this is a date range and not a boolean."""

    from_date: date
    to_date: date | None = None
    reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _the_freeze_ends_on_or_after_it_starts(self) -> StudentFreezeIn:
        if self.to_date is not None and self.to_date < self.from_date:
            raise ValueError("to_date must not precede from_date")
        return self


class StudentLeaveIn(BaseModel):
    """§7 — `POST /students/{id}/leave`.

    Parent artboard `12i` states it plainly: **the monthly charge stays the parent's
    responsibility**. Leaving is not a refund, so this shape carries no money field and no
    "cancel outstanding charges" flag. A manager who wants to write one off does it in the
    billing screen, deliberately, where it is audit-logged as a write-off.
    """

    left_on: date
    reason: str | None = Field(default=None, max_length=200)


class StudentStatusHistoryOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    from_status: str | None
    to_status: str
    reason: str | None
    changed_at: datetime


class EnrollmentOut(BaseModel):
    """One group membership. **Carries no price** — C11 put that on the student, so a
    child in two groups has two of these and one tuition charge."""

    id: uuid.UUID
    student_id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    status: str = Field(pattern=ENROLLMENT_STATUS_PATTERN)
    started_on: date
    ended_on: date | None
    #: C12 — which of this group's weekly sessions the student is expected at, 0-6 matching
    #: `group_schedule_rule.weekday`. `None` means all of them.
    attends_weekdays: list[Weekday] | None = None


class EnrollmentCreate(BaseModel):
    student_id: uuid.UUID
    group_id: uuid.UUID
    started_on: date
    attends_weekdays: list[Weekday] | None = Field(default=None, min_length=1)


class EnrollmentUpdate(BaseModel):
    status: str | None = Field(default=None, pattern=ENROLLMENT_STATUS_PATTERN)
    ended_on: date | None = None
    attends_weekdays: list[Weekday] | None = Field(default=None, min_length=1)


class TrialBookingOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    group_id: uuid.UUID
    session_id: uuid.UUID | None
    booked_at: datetime
    #: Three states, not two. `None` is "the lesson has not happened yet", which the
    #: follow-up automation treats completely differently from "they did not turn up".
    attended: bool | None
    outcome: str | None = Field(default=None, pattern=TRIAL_OUTCOME_PATTERN)
    is_override: bool


class TrialBookingSelfIn(BaseModel):
    """§7 — `POST /trial-bookings/self`, **authenticated**: the parent has just signed in.

    §5.4's sign-in-first booking. The children are described here rather than matched by
    the client, because §5.4 matches people on **verified email or phone** and a client
    cannot verify anything. `trial_health_declarations` carries §5.4a's trial answers,
    which is why the request lands in `registration_request.payload_encrypted` rather than
    being written straight to a table (§11.1).
    """

    group_id: uuid.UUID
    session_id: uuid.UUID
    children: list[StudentCreate] = Field(min_length=1, max_length=10)
    #: One per child, same order. Booleans and short answers only — never free text about
    #: a condition, which is what the full declaration (W3) is for.
    trial_health_declarations: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _one_declaration_per_child(self) -> TrialBookingSelfIn:
        if self.trial_health_declarations and len(self.trial_health_declarations) != len(
            self.children
        ):
            raise ValueError("trial_health_declarations must have one entry per child")
        return self


class RegistrationRequestOut(BaseModel):
    """The approval queue's row (dashboard `6c`).

    **`payload` is not here.** The encrypted payload is a stranger's personal data about a
    minor (§11.1); the queue renders a summary, and reading the full submission is a
    separate, audit-logged fetch. A list endpoint that decrypted every row would defeat
    the encryption for the cost of one page load.
    """

    id: uuid.UUID
    source: str = Field(pattern=REGISTRATION_SOURCE_PATTERN)
    status: str = Field(pattern=REGISTRATION_STATUS_PATTERN)
    submitted_at: datetime
    reviewed_at: datetime | None
    #: §5.4's matching on verified email or phone. `None` is a genuinely new family, and
    #: that is the common case rather than an error.
    matched_person_id: uuid.UUID | None
    child_display_name: str
    guardian_display_name: str


class RegistrationDecisionIn(BaseModel):
    """`POST /registration-requests/{id}/{approve|reject}`.

    §5.4: **enrollment is always a manager decision.** Approving is where the group is
    chosen, which is why `group_id` lives on the decision and not on the submission — the
    public link's only job is a first lesson.
    """

    group_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=200)


StudentPage = CursorPage[StudentOut]
EnrollmentPage = CursorPage[EnrollmentOut]
RegistrationRequestPage = CursorPage[RegistrationRequestOut]
TrialBookingPage = CursorPage[TrialBookingOut]


# -- M3's own shapes, appended by lane PEOPLE. The contract shapes above are unchanged
# apart from `StudentCreate.guardian`, which §5.4(a) needs in the same request.
#
# **Where `price_plan_id` may and may not appear.** Invariant 3 forbids a financial field
# on any coach-scoped response, and `tests/invariants/test_03`'s detector matches the
# property name against `^price` — so `price_plan_id` IS a financial field as far as the
# gate is concerned, whatever the contract's own docstring intended. `StudentOut` carries
# it and is therefore returned only from manager-scoped routes; every shape a coach can
# reach is built without it. `StudentPricePlanOut` is the manager's way to read it, and it
# carries the C11 volume suggestion beside it because that is the number §5.10 shows when
# the plan is chosen.


class StudentSummaryOut(BaseModel):
    """The row dashboard `3b` and staff `9h` render, and the only student shape a coach
    receives from a list.

    `group_names` and not `group_ids`: C11 makes several live enrollments normal, and
    `3b`'s column shows what a manager reads rather than what a client would have to join.
    """

    id: uuid.UUID
    person_id: uuid.UUID
    first_name: str
    last_name: str
    birthdate: date | None
    status: str = Field(pattern=STUDENT_STATUS_PATTERN)
    health_status: str = Field(pattern=HEALTH_STATUS_PATTERN)
    joined_on: date | None
    left_on: date | None
    current_belt_id: uuid.UUID | None = None
    current_belt_name: str | None = None
    current_belt_color_hex: str | None = None
    group_names: list[str] = Field(default_factory=list)
    #: §5.4's freeze shows guardians "מוקפא" with the return date. `None` on an
    #: open-ended freeze, which is a real state a manager sets deliberately.
    frozen_until: date | None = None
    guardian_display_names: list[str] = Field(default_factory=list)


class StudentDetailOut(BaseModel):
    """One student in full, for staff `9c` and dashboard `4a` — and **coach-reachable**.

    `StudentOut` minus `price_plan_id`. §3.2 gives every staff role "View students in own
    groups", so `GET /students/{id}` is a coach route, and invariant 3's detector reads
    `price_plan_id` as financial. The price is not omitted to be coy: a coach has no use
    for it, and a shape that cannot carry it is cheaper to guarantee than a filter that
    has to remember to.
    """

    id: uuid.UUID
    person_id: uuid.UUID
    first_name: str
    last_name: str
    birthdate: date | None
    phone: str | None = None
    email: str | None = None
    status: str = Field(pattern=STUDENT_STATUS_PATTERN)
    health_status: str = Field(pattern=HEALTH_STATUS_PATTERN)
    joined_on: date | None
    left_on: date | None
    current_belt_id: uuid.UUID | None = None
    current_belt_name: str | None = None
    current_belt_color_hex: str | None = None
    frozen_until: date | None = None
    guardians: list[GuardianOut] = Field(default_factory=list)


class StudentPricePlanOut(BaseModel):
    """C11's two numbers, manager-scoped. **Never** returned from a `coach`-tagged route.

    `weekly_volume` is what §5.10 shows beside the plan picker so a mismatch between what
    a child attends and what they are billed for is visible at the moment the price is
    set. It is a suggestion, not a computation — the manager picks the plan.

    No amount, because `price_plan` is W4's table and does not exist yet (L2).
    """

    student_id: uuid.UUID
    price_plan_id: uuid.UUID | None
    weekly_volume: int


class GuardianListResponse(BaseModel):
    items: list[GuardianOut]


class StudentConvertIn(BaseModel):
    """§5.4a step 5 — 'Manager converts → picks group, sets price, status=active,
    enrollment created.' Three decisions in one request, because they are one decision."""

    group_id: uuid.UUID
    started_on: date
    #: C11, L2 — an opaque id. `price_plan` is W4's table, so this is stored and never
    #: resolved, and no endpoint in this lane returns an amount.
    price_plan_id: uuid.UUID | None = None
    #: C12 — offered as checkboxes over the group's training weekdays, all ticked by
    #: default. `None` means all of them.
    attends_weekdays: list[Weekday] | None = Field(default=None, min_length=1)
    reason: str | None = Field(default=None, max_length=200)


class StudentMarkLostIn(BaseModel):
    """§5.4a — 'No conversion after N days → status=lost, with a reason.' Required here
    and optional in the job, because a manager pressing the button knows why and the job
    only knows that time passed."""

    reason: str = Field(min_length=1, max_length=200)


class StudentCreateResult(BaseModel):
    """§5.4(a) — 'Creates everything immediately with health_status = missing, and sends
    the parent an invitation.'

    `invitation_token` is returned **once**, to the manager who just created the student,
    so the dashboard can render a copyable link for a parent standing at the desk. Only
    its SHA-256 hash reaches `invitation.token_hash`, and it is never logged.

    Manager-scoped, so `StudentOut` (with `price_plan_id`) is safe here.
    """

    student: StudentOut
    invitation_token: str | None = None


class StudentStatusHistoryListResponse(BaseModel):
    items: list[StudentStatusHistoryOut]


class PublicGroupOut(BaseModel):
    """§7 — `GET /public/studios/{slug}/groups`, unauthenticated.

    A deliberately narrow projection, for the same reason `TrialSlotOut` is one: this is a
    shop window on the open internet. No class id, no staff, no enrollment count.
    `training_weekdays` is here because parent `13a` shows "מתאמנים בימים" beside each
    group, and because §5.4a filters groups by the child's age where a range is set.
    """

    id: uuid.UUID
    name: str
    description: str | None
    age_min: int | None
    age_max: int | None
    training_weekdays: list[Weekday] = Field(default_factory=list)


class PublicGroupListResponse(BaseModel):
    """Not a `CursorPage`: a club has a dozen groups, not a growing list somebody pages
    through, and the landing page renders all of them at once."""

    items: list[PublicGroupOut]


class PublicLandingOut(BaseModel):
    """§5.4a ① — 'a public LANDING PAGE at /t/{studio-slug} — the club's shop window, not
    a form.'"""

    studio_name: str
    slug: str
    logo_url: str | None
    default_locale: str
    #: §5.4a: "Logo, photos, what the club does, where and when". Read from
    #: `studio.settings`, the JSONB M1's setup wizard already writes.
    headline: str | None
    about: str | None
    address: str | None
    photo_urls: list[str] = Field(default_factory=list)
    groups: list[PublicGroupOut] = Field(default_factory=list)


class TrialSlotListResponse(BaseModel):
    """Not a `CursorPage`: §7 asks for "the next N bookable sessions", which is a bounded
    peek rather than a list somebody pages through. G16's rule is about lists that grow."""

    items: list[TrialSlotOut]


class EnrollmentWeekdayOptionsOut(BaseModel):
    """C12's checkboxes. The enrolment form asks this before it can draw the day list.

    `training_weekdays` comes through `ScheduleService.materialize_sessions()` (L5), so an
    empty list means "this group has no schedule yet" and the form says exactly that.
    """

    group_id: uuid.UUID
    group_name: str
    training_weekdays: list[Weekday] = Field(default_factory=list)


class StudentSummaryPage(CursorPage[StudentSummaryOut]):
    pass
