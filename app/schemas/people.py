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
    #: Where the student came from -- §5.4b's checklist chip renders when this reads
    #: 'onboarding_link', the ניסיון-chip pattern applied to the migration cohort.
    source: str | None = None
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
    #: The group this child joins. §5.4(a) for a manager adding a student directly —
    #: 'child details and group ... creates everything immediately' — and §5.4a step 2 for
    #: a trial booking, where it is asked **per child** because the group list is filtered
    #: by each child's age. Absent on a trial booking means 'use the one at the root'.
    group_id: uuid.UUID | None = None
    #: C12 — which of that group's weekly sessions the child is actually expected at.
    #: NULL means all of them, which is the default and the common case. Ignored when
    #: `group_id` is absent, and by §5.4a's trial booking, which creates no enrollment.
    attends_weekdays: list[int] | None = None
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


class EnrollmentMoveIn(BaseModel):
    """Staff 9c's move: the target group, and optionally the effective date."""

    group_id: uuid.UUID
    moved_on: date | None = None


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


class TrialChildIn(StudentCreate):
    """One child in §5.4a's booking, with the two choices the spec makes **per child**.

    Step 2 is "class ▸ group (groups filtered by the child's age)" and step 4 is "the next
    N upcoming sessions of each chosen group, **one pick per child**". Siblings of
    different ages are the whole reason the group list is age-filtered, so a booking that
    can only carry one group cannot express the case the picker exists for.
    """

    #: §5.4a step 4. Absent means 'use the root one', which is only honoured when this
    #: child is in the root group — see `TrialBookingSelfIn._resolve_per_child_choices`.
    session_id: uuid.UUID | None = None


class TrialBookingSelfIn(BaseModel):
    """§7 — `POST /trial-bookings/self`, **authenticated**: the parent has just signed in.

    §5.4's sign-in-first booking. The children are described here rather than matched by
    the client, because §5.4 matches people on **verified email or phone** and a client
    cannot verify anything. `trial_health_declarations` carries §5.4a's trial answers,
    which is why the request lands in `registration_request.payload_encrypted` rather than
    being written straight to a table (§11.1).
    """

    #: §5.4a ① — 'A per-group QR pre-selects that group.' A default for children who name
    #: no group of their own; a child's own `group_id` always wins. Optional because a
    #: booking where every child chose for themselves has no single group to put here.
    group_id: uuid.UUID | None = None
    session_id: uuid.UUID | None = None
    children: list[TrialChildIn] = Field(min_length=1, max_length=10)
    #: One per child, same order. Booleans and short answers only — never free text about
    #: a condition, which is what the full declaration (W3) is for.
    trial_health_declarations: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _resolve_per_child_choices(self) -> TrialBookingSelfIn:
        """Fold the root defaults into each child, so every layer below reads one place.

        The session default is deliberately narrower than the group default: a root
        `session_id` belongs to the root group, so handing it to a child who chose a
        DIFFERENT group would book them into a lesson their group never holds. That is the
        same class of mistake as applying one group to every child, one level down.
        """
        for child in self.children:
            if child.group_id is None:
                child.group_id = self.group_id
                if child.session_id is None:
                    child.session_id = self.session_id
        without_a_group = [
            index for index, child in enumerate(self.children) if child.group_id is None
        ]
        if without_a_group:
            raise ValueError(
                f"children at {without_a_group} have no group: give each child a group_id, "
                "or one at the root for all of them"
            )
        return self

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
    #: Where the student came from — 'onboarding_link' rows get 3b's chip so a manager
    #: can spot self-registered families that still need a look (feature pass 2026-08-27).
    source: str | None = None
    #: `הסכם הרשמה` — whether registration, health and the club's terms have ALL landed.
    #:
    #: **`None` everywhere except `/me/students`**, and deliberately. This is what the parent
    #: app's gate reads, and it costs a consent lookup per row to compute. A staff roster of
    #: 200 students has no use for it and should not pay for 200 lookups to render, so the
    #: field is populated on the one route whose caller is the family it describes.
    agreement_complete: bool | None = None
    #: 9h's `92%` — present / (present + absent) over MARKED sessions only, like the
    #: student-card strip: an unmarked register says nothing about the child. `None`
    #: until anything was marked, so a new student shows nothing rather than 0%.
    attendance_percent: int | None = None


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


class StudentPricePlanRow(BaseModel):
    """One student's plan, for a screen that shows many of them at once."""

    student_id: uuid.UUID
    price_plan_id: uuid.UUID | None


class StudentPricePlansPage(BaseModel):
    """Every student's plan in one manager-scoped read.

    A roster badge needs the plan for twenty children at once, and the per-student route
    below would be twenty requests. It cannot come from `GET /students` instead: that route
    is coach-tagged, `price_plan_id` is what invariant 3's detector reads as a financial
    field, and adding it to `StudentSummaryOut` would fail the gate — correctly.

    A student with no plan appears with `price_plan_id: null` rather than being left out,
    because "no plan set" is a state the badge draws and an absent row is indistinguishable
    from a student the caller never read.
    """

    items: list[StudentPricePlanRow]


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
    #: The token as the parent-app link (`{parent origin}/?invite={token}`), ready to
    #: send. None when no invitation was minted, or the environment's parent host is
    #: still a PENDING placeholder.
    invitation_url: str | None = None


class StudentStatusHistoryListResponse(BaseModel):
    items: list[StudentStatusHistoryOut]


class MyStudentStatusHistoryOut(BaseModel):
    """One move through §5.4a's funnel, as the FAMILY reads it.

    `StudentStatusHistoryOut` minus `reason` and minus the row's own id. The omission is
    the whole point of a second shape, and it is the argument `StudentDetailOut` already
    makes for `price_plan_id`: a shape that cannot carry the field is cheaper to guarantee
    than a filter that has to remember to.

    `reason` is the club's note about a family, written for the club. "משפחה נסעה לחו״ל" is
    innocuous; "stopped paying" and "the mother was abusive to the coach" go in the same
    column, written by whoever pressed the button. §11.2 already keeps that text out of the
    audit diff's reach for the same reason — this keeps it off the parent's screen.

    The row id goes too, and not to be coy: a parent has nothing to do with it, and an id a
    client can see is an id a client eventually addresses. There is no per-row route here
    and there should not be one.
    """

    student_id: uuid.UUID
    from_status: str | None
    to_status: str
    changed_at: datetime


class MyStudentStatusHistoryListResponse(BaseModel):
    items: list[MyStudentStatusHistoryOut]


class MyTrialBookingOut(BaseModel):
    """The trial lesson, as the family it was booked for reads it.

    Three fields and a group name, chosen against `TrialBookingRow` — the dashboard's queue
    row — by asking of each one what a parent does with it:

    * `session_starts_at` is the lesson. Nullable, because `trial_booking.session_id` is:
      §5.4a lets a manager log a phone enquiry before any slot is chosen, and that family is
      exactly the one `TrialHome`'s fallback copy exists for. A route that could not say
      "no lesson yet" would force the client to guess.
    * `attended` stays **three-state**. `None` is "the lesson has not happened yet", which
      is not `False`; §5.4a ④'s "איך היה?" must not appear before the lesson.
    * `group_name` is on the flyer already — `PublicGroupOut` gives it to strangers.

    What is deliberately absent: `coach_note` (§5.4a ③ — a note written for the club, about
    a child, by somebody who has met them once), `outcome` (§5.4a makes conversion a manager
    decision, and a family reading `lost` before anyone telephones them is the app breaking
    the news), `is_override` (that a manager granted a second free trial is the club's
    business), and the booking id (no per-row route exists for a parent, and none should).
    """

    student_id: uuid.UUID
    #: The group they trialled in, so entrance A's picker opens with it already ticked.
    #:
    #: An ID in a parent-facing shape, and it is the same id `PublicGroupOut` hands to
    #: strangers on the landing page — the join picker is built from that very list, so
    #: without this the screen could not tell which of those cards the family has already
    #: been to. Nothing else about the group is added: `group_name` was, and remains, what
    #: the screen renders.
    group_id: uuid.UUID
    group_name: str
    session_starts_at: datetime | None
    attended: bool | None


class MyTrialBookingListResponse(BaseModel):
    items: list[MyTrialBookingOut]


class PublicGroupOut(BaseModel):
    """§7 — `GET /public/studios/{slug}/groups`, unauthenticated.

    A deliberately narrow projection, for the same reason `TrialSlotOut` is one: this is a
    shop window on the open internet. No class id, no staff, no enrollment count.
    `training_weekdays` is here because parent `13a` shows "מתאמנים בימים" beside each
    group, and because §5.4a filters groups by the child's age where a range is set.

    `training_times` was added for landing L1 (2026-08-27): region 4 and `13c`'s schedule
    cards draw `days · HH:MM`, and a class's hour is already public information — it is on
    the flyer. It comes through the schedule seam like `training_weekdays`. Nothing else
    has been added, and nothing else should be: the narrowness is the contract.
    """

    id: uuid.UUID
    name: str
    description: str | None
    age_min: int | None
    age_max: int | None
    training_weekdays: list[Weekday] = Field(default_factory=list)
    #: Distinct wall-clock start times, `HH:MM`, Asia/Jerusalem, sorted.
    training_times: list[str] = Field(default_factory=list)


class PublicGroupListResponse(BaseModel):
    """Not a `CursorPage`: a club has a dozen groups, not a growing list somebody pages
    through, and the landing page renders all of them at once."""

    items: list[PublicGroupOut]


class PublicBeltOut(BaseModel):
    """One rung of the hero's belt ladder — L2/L4 (2026-08-27). Name and colours only:
    the ladder is the club's grading system, which is on every flyer, and nothing here
    reaches a person or a count."""

    name: str
    color_hex: str
    secondary_color_hex: str | None = None


class PublicLandingOut(BaseModel):
    """§5.4a ① — 'a public LANDING PAGE at /t/{studio-slug} — the club's shop window, not
    a form.'

    Widened for landing L4 (2026-08-27) by exactly two lists, both marketing material:
    `belt_ladder` (the grading system — L2 rules its colours must come from
    `belt_rank.color_hex`, never the canvas) and `trial_steps` (studio-owned copy from
    `settings.landing`, per the copy-ownership decision). Nothing else; the narrowness of
    `PublicGroupOut` above is untouched."""

    studio_name: str
    slug: str
    logo_url: str | None
    default_locale: str
    #: §5.4a: "Logo, photos, what the club does, where and when". Read from
    #: `studio.settings`, the JSONB M1's setup wizard already writes.
    headline: str | None
    about: str | None
    address: str | None
    #: L1 (2026-08-27) — the hero brand row, `13c`'s top bar, both WhatsApp affordances
    #: and the footer all need it. Read from `studio.settings.landing` beside the three
    #: above; a club that has not filled it in gets null and the affordances stay off.
    phone: str | None = None
    photo_urls: list[str] = Field(default_factory=list)
    groups: list[PublicGroupOut] = Field(default_factory=list)
    #: L4 region 1 — the hero's ladder. Empty until the club defines belt ranks.
    belt_ladder: list[PublicBeltOut] = Field(default_factory=list)
    #: L4 region 3 — "how a trial lesson looks", the club's own words from
    #: `settings.landing.trial_steps`. Empty hides the region.
    trial_steps: list[str] = Field(default_factory=list)


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


#: G16 -- an alias, never a subclass. `class X(CursorPage[T])` carries no generic origin,
#: so tests/contracts/test_w2_schemas.py reads it as a hand-rolled envelope.
StudentSummaryPage = CursorPage[StudentSummaryOut]


class TrialBookingConfirmationOut(BaseModel):
    """§5.4a step 5's "נתראה ביום א׳ 17:00", once per child.

    Two siblings in different groups have two different answers to 'which group' and
    'when', so `13b` renders one of these per child rather than one for the booking.
    """

    student_id: uuid.UUID
    student_display_name: str
    group_name: str
    session_starts_at: datetime | None


class TrialBookingSelfResult(BaseModel):
    """§5.4a step 5 — 'אישור: "נתראה ביום א׳ 17:00" · [ הוסף ליומן ] · .ics'.

    Everything artboard `13b` renders, in one response, because the parent has no studio in
    their token yet and a second round trip would need one.
    """

    studio_slug: str
    studio_name: str
    students: list[StudentSummaryOut] = Field(default_factory=list)
    #: One per child, in the order they were submitted. There is deliberately no
    #: `group_name` on this model: with siblings in two groups, any single name here would
    #: be wrong for one of them, and quietly wrong is how the per-child pick got lost in
    #: the first place.
    bookings: list[TrialBookingConfirmationOut] = Field(default_factory=list)


class TrialBookingCreate(BaseModel):
    """§5.4a — 'A manager can also log a phone enquiry, producing the same rows.'"""

    group_id: uuid.UUID
    session_id: uuid.UUID | None = None
    child: StudentCreate
    guardian: GuardianCreate


class TrialBookingUpdate(BaseModel):
    """§5.4a ③ — the coach marks attendance and may leave a note.

    `attended` is `bool | None` **and** the field is optional, so three states survive the
    wire: absent means "do not change", `null` means "not yet", `false` means "did not turn
    up". The follow-up ladder treats the last two completely differently.
    """

    attended: bool | None = None
    coach_note: str | None = Field(default=None, max_length=2000)
    outcome: str | None = Field(default=None, pattern=TRIAL_OUTCOME_PATTERN)


class TrialBookingRow(BaseModel):
    """One row of the dashboard's שיעורי ניסיון queue (§5.4a ②).

    Carries the child's name because a queue of timestamps is not a queue anyone can act
    on — but nothing else about them, and nothing at all about health.
    """

    id: uuid.UUID
    student_id: uuid.UUID
    student_display_name: str
    group_id: uuid.UUID
    group_name: str
    session_id: uuid.UUID | None
    booked_at: datetime
    attended: bool | None
    outcome: str | None = Field(default=None, pattern=TRIAL_OUTCOME_PATTERN)
    is_override: bool


TrialBookingRowPage = CursorPage[TrialBookingRow]


class ChildMatchOut(BaseModel):
    """§5.4a's duplicate-child warning. A candidate the manager judges, never a merge."""

    student_id: uuid.UUID
    display_name: str
    birthdate: date | None


class RegistrationRequestDetailOut(BaseModel):
    """One submission, opened. Reading this is audit-logged as sensitive (§11.2) — the
    summary in the queue is free, the full read is recorded."""

    id: uuid.UUID
    source: str = Field(pattern=REGISTRATION_SOURCE_PATTERN)
    status: str = Field(pattern=REGISTRATION_STATUS_PATTERN)
    submitted_at: datetime
    reviewed_at: datetime | None
    matched_person_id: uuid.UUID | None
    child_display_name: str
    guardian_display_name: str
    children: list[dict[str, Any]] = Field(default_factory=list)
    #: A preference the queue renders. §5.4 puts the group on the DECISION.
    preferred_group_id: uuid.UUID | None = None
    possible_duplicate_students: list[ChildMatchOut] = Field(default_factory=list)


class SiblingRequestIn(BaseModel):
    """Parent `12g`, `+ הוסף ילד`. `POST /me/students`.

    **`group_ids`, plural and required** (owner decision, 2026-08-30). The group used to be
    a `preferred_group_id` — a preference on a request a manager approved — and this door
    now behaves like the club's join link, which enrols directly. Plural because the price
    is derived from WEEKLY VOLUME across every group a child trains in, so one group id
    could not price a child who trains twice a week.
    """

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    birthdate: date | None = None
    group_ids: list[uuid.UUID] = Field(min_length=1, max_length=8)


class StudentJoinIn(BaseModel):
    """Entrance A — `POST /me/students/{student_id}/join`.

    **`group_ids` and no price.** How much a family pays is derived from the weekly volume
    across the groups they tick (§5.10); how they PAY is chosen on §6.1's payment step. A
    `price_plan_id` here would be a price a client can post.

    Plural for the same reason `SiblingRequestIn.group_ids` is: one group id cannot price a
    child who trains twice a week.
    """

    group_ids: list[uuid.UUID] = Field(min_length=1, max_length=8)


RegistrationRequestPageOut = CursorPage[RegistrationRequestOut]


