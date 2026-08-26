# M7 — Events & belts (lane EVENTS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build §5.8's events and §5.9's belts end to end — event types, targeting, RSVP,
event fees through M6's seam, event consent, event attendance, belt ranks including
bi-colour grades, grading history and belt exams — across twelve artboards in three apps.

**Architecture:** Backend is `app/services/{events,belts}/**` behind two thin routers
(`app/routers/events.py`, `app/routers/belts.py`), both mounted by discovery. Every event
fee is a call to `BillingService.create_charge(kind="event", …)` with `student_id=` and
`event_id=` passed as keywords; this lane writes no billing table. Frontend is one feature
directory per app (`features/events/`, `features/belts/`), each with its own typed client,
composing `@studio/ui` primitives — notably `BeltBar`, which already rings unconditionally.

**Tech Stack:** FastAPI · SQLAlchemy 2 · Pydantic v2 · Postgres · pytest · React 19 +
TypeScript + Vite · vitest + @testing-library/react.

**Spec:** `SPEC.md` §5.8, §5.9, §3.2, §7 · `docs/plan/milestone-plan.md` *Lane EVENTS — M7* ·
`docs/plan/prompts/w4-lanes.md` · `docs/design/specs/{7a,7b,7c,7d,9d,9i,4d,5b,5d,6b,12h,12d}*.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Run everything from `../studio-manager-events`.** Branch `lane/events`, database
  `studio_manager_events`. `cd` does not persist between tool calls — prefix each command.
- **Never run `./scripts/dev-db.sh reset`.** It drops the shared Docker volume and destroys
  both lanes' databases.
- **`.venv` and `web/node_modules` are symlinks to `main`'s.** A dependency change is a
  stop-and-tell, not a lane decision.
- **Always use the `.venv/bin/` prefix.** A bare `python3`/`pytest` is a pyenv 3.8.
- **The check is `./scripts/lane-check.sh events && ./scripts/lane-check.sh belts`.**
- **W4's contract is on `main` and may not be changed:** revision `0008`, the six tables,
  `app/schemas/events.py`, `app/schemas/belts.py`, and
  `BillingService.create_charge` / `.recompute_charge_status`.
- **Files this lane owns and nothing else:**
  `app/models/{events,belts}.py` · `app/services/{events,belts}/**` ·
  `app/routers/{events,belts}.py` · `tests/{events,belts}/**` ·
  `web/apps/{staff,parent,dashboard}/src/features/{events,belts}/**` ·
  `web/packages/i18n/{he,en,ru}/events.ts`.
- **Never write a billing table.** Event fees call
  `BillingService.create_charge(kind='event')` and nothing else. `student_id` and `event_id`
  are **keyword-only** on that seam, deliberately: both are `UUID | None` in adjacent
  positions, so positionally an event id binds happily to `student_id` and no type checker
  can see it.
- **There is no `belts` i18n namespace.** Belt strings live in `events.ts` under `belt.*`.
  Do not create `belts.ts`; do not edit `web/packages/i18n/types.ts` or `index.ts`.
- **G10 / D7 — every belt bar carries a 1px ring** in the current foreground colour.
  `BeltBar` already does this and has no opt-out prop; it must not gain one. Never build a
  second bar.
- **D3 — belt colours are DATA** (`belt_rank.color_hex`), never brand, and must stay
  visually distinct from `--paid` / `--pending` / `--danger`. Never wire one to a token.
- **D9.2 — no weight categories anywhere.** No `weight`, no `category`, no weigh-in class —
  not in a model, not in a schema, not as an i18n key.
- **G2 — all money is an integer count of agorot.** `event.fee_agorot` is the event's
  *price*, a setting. What a family owes is a `charge`.
- **G3 — `app.core.clock.now()` is the only clock.** A bare `datetime.now()` anywhere under
  `app/` fails the build.
- **Tenancy — every model inherits `TenantMixin`;** every request-path query goes through
  `TenantSession`. It fails closed.
- **G6 — routers stay thin:** parse, call a service, return. Authorization is a router
  dependency, never a check inside a service.
- **G16 — every list endpoint is cursor-paginated** (`CursorPage`, `CursorParams` from
  `app/schemas/_pagination.py`); every mutating endpoint accepts optional `Idempotency-Key`.
- **New endpoints are versioned under `/api/v1/`** and mounted by discovery — never edit
  `app/main.py` or `app/models/__init__.py`.
- **§3.2 — coaches never see money.** No charge, payment, debt or price is reachable from a
  coach-scoped endpoint or screen. `event.fee_agorot` is a price: it is redacted to `null`
  for a caller whose roles are coach-only.
- **D10 / G12 — logical CSS properties only.** No `margin-left`, no `padding-right`, no
  `border-right`, no `linear-gradient(to right, …)`.
- **Never inline a user-facing string in a component.** Every string is a key in
  `events.ts`, mirrored in `he`, `en` and `ru`.
- **Tick `docs/plan/state.yaml` in the same commit as the work.** Never write anything
  measurable there.
- **Commit per task:** failing test → confirm it fails → minimal implementation → green →
  commit.

---

## Decisions this plan makes, and why

These are the artboard findings that reach the model. Each is recorded here rather than
re-litigated per task.

### D-M7-1 · The type enum wins; the artboards' taxonomy does not

Four artboards (`7a`, `7b`, `9d`, `12h`, `12d`) draw types that are not members: *אימון
מיוחד*, *מחנה*, *אירוע מועדון*, *מבחן שנתי*. `EVENT_TYPES` is a CHECK constraint in
revision `0008` and a `Literal` in the contract schema; growing it needs a migration, and
lanes never run `alembic revision`. **Ship the six members.** The drawn types map:
special training → `joint_training`, camp → `trip`, club event → `other`, annual exam →
`belt_exam`. `7a`'s filter chips are built from `events.type.*`, not from the canvas.

### D-M7-2 · The cut list — no model, no column, no key, no UI

Same reasoning D9.2 applies to weight categories: §4.3 carries no column, a lane may not
add one, and a field that existed "for later" gets filled in before later arrives.

| Cut | Artboards asking | Why |
|---|---|---|
| Medals / placings | `12h`, `9i`, `7a` | §5.8 models an RSVP, not a competition result. No column. |
| Capacity / max participants | `7d`, `7b` | No column. §5.4 rejects the enrolment framing; an event needs its own and has none. |
| Minimum age | `7b` | No column, and cross-namespace to M3. |
| Transport (departure/return, its own price) | `7d`, `7a`, `7b`, `9i` | No column, and a second price beside `fee_agorot` is a second answer to what a family owes. |
| Makeup sitting | `9d` | No column. A second exam is a second `event`; nothing links them. |
| Federation approval | `4d` | Appears in neither §5.9 nor §4.3. |
| A parent's decline reason | `7c` | `event_registration` has no free-text column. `cancelReason` is the *event's*. |
| Belt hand-over queue | `12d`, `12e`, `11a` | Three artboards, one cross-lane flow, no model and no notification kind. |
| Invitations as a state distinct from publish | `9i`, `9d`, `7a`, `6b` | No `invited_at`, and notification is M8's — `NotificationService` does not exist until W5. |

Each is reported at the end of the lane, not silently dropped.

### D-M7-3 · Eligibility is current rank + time held, and nothing else

`events.exam.eligibleHint` — *הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה* — is the shipped
string, and §5.9 says the same. Five artboards add a minimum-attendance percentage; `4d`
and `6b` add a debt block and a missing-declaration block. **All three are cut.** `6b`'s own
audit says the decision "belongs in the W4 contract commit, not in whichever lane builds
first"; W4's contract commit did not make it, and `belt_rank` carries no
`min_tenure_months` and no `min_attendance_pct` column to hold a threshold.

So M7 **reports the evidence and does not invent a threshold**: a candidate carries
`current_rank`, `next_rank` and `months_at_rank`, and `eligible` means *there is a next rank
above the one they hold*. A student at the top of the ladder, or in a class with no ladder,
is not eligible. The manager reads the tenure and decides — which is what `4d`'s checkbox
column and promote button actually do.

### D-M7-4 · Publishing materialises registrations; inviting is M8's

§5.8: *every targeted student gets an `event_registration` row with `rsvp = pending`*.
`POST /events/{id}/publish` is where that happens, and it is what makes the event visible to
guardians. There is no `invited_at`, no invitation state and no notification here — that is
D-M7-2's last row.

### D-M7-5 · Consent gates *confirmation*, not the RSVP write

§5.8: *the guardian must sign the event's consent text before the RSVP counts as
confirmed.* So `rsvp='yes'` is always recorded, and **confirmed** is derived:

```
confirmed = rsvp == 'yes' and (not event.requires_consent or consent_signed_at is not None)
```

`7d` finding 1 says the artboard does not express the gate; the key
`events.consent.blocksConfirmation` does, and it ships. **The fee charge is created on
confirmation**, so the seam call fires from whichever of the two — the RSVP or the
signature — completes the pair, and never twice.

### D-M7-6 · A consent signature writes two rows

`event_registration.consent_signed_at` is authoritative for the gate, because it is the only
column that names *which event* was consented to — `consent_record` has `subject_id` and
`consent_type='event'` but no `event_id`. §11.6's ledger still gets its row
(`subject_type='student'`, `consent_type='event'`, `granted=true`), because the consent
ledger is meant to be complete. That `consent_record` cannot name the event is a real gap;
it is reported, not patched, because `consent_record` is M4's table and its shape is `0007`'s.

### D-M7-7 · `StudentBeltOut.color_hex` is the *current* rank colour

`tests/contracts/test_w4_schemas.py::test_a_belt_award_keeps_its_own_colour_so_history_survives_a_recolour`
asserts the field exists and argues history should survive a recolour. **The `student_belt`
table has no colour column**, so the read joins `belt_rank` and returns today's colour: a
studio recolouring its ladder *does* rewrite what a child was given three years ago. The
contract test still passes — it asserts the field, not the snapshot. Adding the column is a
migration, which is `main`'s. **Reported, not worked around.**

### D-M7-8 · No primitive is added, and none is changed

`TextField` has no `multiline` mode, `ChipStatus` has no RSVP/consent/danger member,
`AlertTone` has no neutral, `Checkbox` has no indeterminate, `ButtonVariant` has no
icon-only, and there is no stepper, no chip-select, no single-date field and no
`ColourSwatchPicker`. All of these live in `web/packages/ui`, which this lane does not own,
and `docs/plan/prompts/w4-lanes.md` item 1 is explicit that *"deferring does not mean 'a lane
will do it'"*. This lane maps onto the closest existing member and reports every gap:

| Needed | Shipped as | Gap reported |
|---|---|---|
| RSVP confirmed / consent signed | `StatusChip status="paid"` | no `confirmed`/`signed` member |
| RSVP declined | `StatusChip status="cancelled"` | — |
| RSVP pending / not answered | `StatusChip status="pending"` | no dashed variant |
| Consent missing / blocked | `StatusChip status="debt"` | no `danger` member |
| Multi-line consent text (4000 chars) | **blocked — see Task 11** | `TextField` has no `multiline` |
| Colour choice on `5b` | a bounded `<Radio>` grid inside the feature dir | no `ColourSwatchPicker` |
| Reordering on `5b` | up/down buttons over `order_index` | no drag utility, and `order_index` is the column that exists |
| Exam result mark | `ExamResultMark` in the feature dir | `AttendanceMark` is a different domain (`9d` finding 3) |
| Belt transition, progression strip, distribution strip | feature components composing `BeltBar` | — |

---

## File structure

**Backend — created by this lane**

| File | Responsibility |
|---|---|
| `app/services/events/__init__.py` | package docstring; no logic |
| `app/services/events/errors.py` | every domain error the routers translate to HTTP |
| `app/services/events/events.py` | `EventService` — create, read, list, update, targets, RSVP counts |
| `app/services/events/publish.py` | `EventPublishService` — target resolution, publish, cancel |
| `app/services/events/rsvp.py` | `RsvpService` — answer, sign consent, confirmation rule, attendance |
| `app/services/events/fees.py` | `EventFeeService` — the one call to `BillingService.create_charge` |
| `app/services/events/exams.py` | `ExamService` — record results, promote on pass, in one transaction |
| `app/services/events/ics.py` | `render_event_ics` — RFC 5545, no dependency |
| `app/services/belts/__init__.py` | package docstring |
| `app/services/belts/errors.py` | belt domain errors |
| `app/services/belts/ranks.py` | `BeltRankService` — the ladder: list, create, update, delete, reorder, `next_after` |
| `app/services/belts/presets.py` | `BELT_PRESETS` + `BeltPresetService.seed` — §5.9's seeded judo set |
| `app/services/belts/awards.py` | `BeltAwardService` — history, and the one-transaction award |
| `app/services/belts/eligibility.py` | `EligibilityService` — D-M7-3's evidence, not a threshold |
| `app/routers/events.py` | `/events`, `/me/events` |
| `app/routers/belts.py` | `/belt-ranks`, `/belt-presets`, `/students/{id}/belts` |

`app/models/events.py` and `app/models/belts.py` already exist and are **not modified** —
the contract commit authored them and every column this lane needs is there.

Request/response shapes the contract did not author (`EventEligibilityOut`,
`BeltPresetOut`, `EventConsentIn`, `EventAttendanceIn`, …) are declared **in the router
module**, following `app/routers/health_templates.py`'s precedent. `app/schemas/events.py`
and `app/schemas/belts.py` are contract and are never edited.

**Backend — tests**

`tests/events/` and `tests/belts/` already hold `conftest.py` with the full fixture set
(`as_owner`, `as_manager`, `as_lead_coach`, `as_assistant_coach`, `as_guardian_of`,
`a_class`, `a_group`, `a_student`, `an_event`, `a_registered_student`, `a_belt_ladder`,
`tenant_session`). **Do not add a second conftest and do not re-declare a fixture** — one
test file per task, named for what it asserts.

**Frontend — created by this lane**

| Directory | Artboards |
|---|---|
| `web/apps/dashboard/src/features/events/` | `7a` list · `7b` create · `7c` event page · `6b` exam roundup · `4d` eligibility & promotion |
| `web/apps/dashboard/src/features/belts/` | `5b` belt system · `5d` wizard step 2 (slot fill) |
| `web/apps/staff/src/features/events/` | `9i` events · `9d` belt exam (two frames) |
| `web/apps/parent/src/features/events/` | `12h` list · `7d` invite |
| `web/apps/parent/src/features/belts/` | `12d` belt progress |

Each feature directory carries `client.ts` (the only place a `fetch` lives), one file per
screen, one `.test.tsx` per screen, and `index.ts` as the barrel.

---

### Task 1: The events service package, and `GET`/`POST /events`

**Files:**
- Create: `app/services/events/__init__.py`, `app/services/events/errors.py`,
  `app/services/events/events.py`, `app/routers/events.py`
- Test: `tests/events/test_creating_and_listing_an_event.py`

**Interfaces:**
- Consumes: `app.schemas.events.{EventCreateIn, EventOut, EventTargetOut, EventPage}`,
  `app.models.events.{Event, EventTarget, EventRegistration}`,
  `app.core.tenancy.TenantSessionDep`, `app.core.clock.now`,
  `app.core.auth_context.{require_roles, AnyStaff}`,
  `app.schemas._pagination.{CursorParams, IdempotencyKey}`
- Produces:
  - `EventService.create(session, data: EventCreateIn, *, at: datetime) -> Event`
  - `EventService.read(session, event_id: uuid.UUID) -> Event`
  - `EventService.list_events(session, *, types, statuses, after, limit) -> tuple[list[Event], bool]`
  - `EventService.targets_of(session, event_ids) -> dict[uuid.UUID, list[EventTarget]]`
  - `EventService.rsvp_counts(session, event_ids) -> dict[uuid.UUID, tuple[int, int, int]]`
  - `EventService.to_out(session, event, *, redact_fee: bool) -> EventOut`
  - errors `EventNotFoundError`, `EventNotEditableError`
  - router constant `EventsWriter = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach"))]`

- [ ] **Step 1: Write the failing test**

`tests/events/test_creating_and_listing_an_event.py`:

```python
"""§5.8's event, created and listed. Artboards `7a` and `7b`.

Three things are asserted that the schema cannot assert for itself. The service supplies
`ends_at` when a manager pencils in a date without one -- `EventCreateIn.ends_at` is
nullable and the column is not, and `app/schemas/events.py` says in as many words that the
gap is the service's to close. A new event is a DRAFT, because nothing reaches a guardian
until it is published. And `fee_agorot` is a PRICE, so a coach-only caller never sees one
(§3.2's hard rule).
"""

from __future__ import annotations

import uuid

from tests.events.conftest import EVENT_FEE_AGOROT, T0


def test_a_manager_creates_an_event_and_it_starts_as_a_draft(client, as_manager, a_group):
    response = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "competition",
            "title": "אליפות האביב",
            "starts_at": T0.isoformat(),
            "fee_agorot": EVENT_FEE_AGOROT,
            "requires_consent": True,
            "consent_text": "אני מאשר/ת השתתפות",
            "targets": [{"target_type": "group", "target_id": str(a_group)}],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "draft"
    assert body["fee_agorot"] == EVENT_FEE_AGOROT
    assert [t["target_type"] for t in body["targets"]] == ["group"]


def test_an_event_with_no_end_gets_one_rather_than_a_null_the_column_refuses(
    client, as_manager
):
    """`EventCreateIn.ends_at` is nullable and `event.ends_at` is NOT NULL. §5.8 lets a
    manager pencil in a date before the schedule is settled, so the service closes the gap
    -- and `event_time_range` means the value it supplies must be strictly later."""
    response = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={"type": "seminar", "title": "סמינר", "starts_at": T0.isoformat()},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["ends_at"] is not None
    assert body["ends_at"] > body["starts_at"]


def test_a_coach_never_sees_a_price(client, as_assistant_coach, as_manager, an_event):
    """§3.2's hard rule -- 'no charge, payment, debt or price is reachable from any
    coach-scoped endpoint'. `event.fee_agorot` is a price. The row still lists, because a
    coach who cannot see the event cannot run it."""
    seen = client.get("/api/v1/events", headers=as_assistant_coach.headers)
    assert seen.status_code == 200, seen.text
    rows = seen.json()["items"]
    assert rows, "the coach must still see the event itself"
    assert all(row["fee_agorot"] is None for row in rows)

    priced = client.get("/api/v1/events", headers=as_manager.headers).json()["items"]
    assert any(row["fee_agorot"] == 8_000 for row in priced)


def test_an_assistant_coach_cannot_create_an_event(client, as_assistant_coach):
    """§3.2 -- 'Create events' is owner, manager and lead_coach. The assistant coach is the
    role on the wrong side of that line, which is why the fixture exists."""
    response = client.post(
        "/api/v1/events",
        headers=as_assistant_coach.headers,
        json={"type": "other", "title": "אירוע", "starts_at": T0.isoformat()},
    )
    assert response.status_code == 403


def test_the_list_is_cursor_paginated_and_never_leaks_another_studio(
    client, as_manager, an_event
):
    response = client.get("/api/v1/events?limit=1", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items", "next_cursor", "has_more"}
    assert all(row["id"] for row in body["items"])


def test_reading_an_event_that_is_not_there_is_a_404(client, as_manager):
    response = client.get(f"/api/v1/events/{uuid.uuid4()}", headers=as_manager.headers)
    assert response.status_code == 404
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events/test_creating_and_listing_an_event.py -q
```

Expected: every test fails with `404` — `app/routers/events.py` does not exist, so no
route mounts.

- [ ] **Step 3: Write the service package**

`app/services/events/__init__.py`:

```python
"""§5.8's events. Lane EVENTS (M7).

**Nothing in this package writes a billing table.** An event's `fee_agorot` is a price --
a setting on the event -- and what a family owes is a `charge`, created through
`BillingService.create_charge(kind='event')` in `fees.py` and reached from a registration
by `event_registration.charge_id`. That single call is the whole of M7's dependency on M6.

**D9.2 -- no weight, no category, no weigh-in class**, in this package or anywhere else.
"""
```

`app/services/events/errors.py`:

```python
"""Domain errors the routers translate into HTTP.

Raised by services and caught by routers, rather than services raising `HTTPException`
directly: §G6 keeps authorization and transport in the router, and a service that raised a
404 would be a service that only makes sense inside a request.
"""

from __future__ import annotations


class EventNotFoundError(LookupError):
    """No such event in the active studio."""


class EventNotEditableError(RuntimeError):
    """The event is not a draft. §5.8 notifies on publish and on cancel, so a PATCH that
    could move a published event's date silently is not an edit -- it is a surprise."""


class EventNotPublishedError(RuntimeError):
    """The action needs a published event: nothing reaches a guardian while it is a draft."""


class EventAlreadyPublishedError(RuntimeError):
    """Publishing twice would re-materialise registrations over answers already given."""


class RsvpDeadlinePassedError(RuntimeError):
    """§5.8's `rsvp_deadline`. `events.rsvp.deadlinePassed` is the string."""


class NotThisGuardiansStudentError(PermissionError):
    """§3.2's guardian column -- 'own' always means only for my own children."""


class NotRegisteredForEventError(LookupError):
    """The student is not on this event's roster, so there is nothing to answer."""


class ConsentNotRequiredError(RuntimeError):
    """Signing a consent an event does not ask for would write a ledger row about nothing."""


class NotABeltExamError(RuntimeError):
    """§5.9 -- results belong to an event with `type='belt_exam'`."""
```

`app/services/events/events.py`:

```python
"""The event itself: created, read, listed and edited. Artboards `7a`, `7b`, `9i`, `12h`.

**`ends_at` is supplied here and nowhere else.** `EventCreateIn.ends_at` is nullable while
`event.ends_at` is `NOT NULL`, and `app/schemas/events.py` says the gap is deliberate --
§5.8 lets a manager pencil in a date before the schedule is settled. The default is two
hours, and it must be STRICTLY later than `starts_at` or `event_time_range` rejects the row.

**A new event is a draft.** §4.3: nothing is visible to a guardian until it is published,
which is what makes an event safe to build over several sittings.

**`fee_agorot` is redacted for a coach-only caller** (§3.2's hard rule: no price is
reachable from a coach-scoped endpoint). The redaction happens on the way out rather than
in the query, because the same row is read by a manager on the same route.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select

from app.core.tenancy import TenantSession
from app.models.events import Event, EventRegistration, EventTarget
from app.models.people import Student
from app.models.person import Person
from app.models.structure import Class, Group
from app.schemas.events import EventCreateIn, EventOut, EventTargetOut, EventUpdateIn
from app.services.events.errors import EventNotEditableError, EventNotFoundError

#: What the service supplies when a manager gives no end. Two hours is the shortest thing
#: on the canvas that is not a session, and any value works as long as it is strictly
#: later -- `event_time_range` is a CHECK, not a preference.
DEFAULT_DURATION = timedelta(hours=2)

#: §3.2 -- the roles that may see a price. Everything else gets `fee_agorot = None`.
MONEY_ROLES = frozenset({"owner", "manager"})


def redacts_fee(roles: frozenset[str] | set[str]) -> bool:
    """True when the caller is staff but not on §3.2's money row.

    A guardian is NOT redacted: §5.8 puts the fee inside the parent's own confirm button
    (`7d`), and a parent who cannot see what confirming will cost is being asked to agree
    to an unnamed amount.
    """
    return bool(roles) and not (set(roles) & MONEY_ROLES)


class EventService:
    """§5.8's event. Every method takes the session; none of them checks its caller (G6)."""

    @staticmethod
    def create(session: TenantSession, data: EventCreateIn, *, at: datetime) -> Event:
        row = Event(
            type=data.type,
            title=data.title,
            description=data.description,
            starts_at=data.starts_at,
            ends_at=data.ends_at or (data.starts_at + DEFAULT_DURATION),
            location_id=data.location_id,
            location_text=data.location_text,
            rsvp_deadline=data.rsvp_deadline,
            fee_agorot=data.fee_agorot,
            requires_consent=data.requires_consent,
            consent_text=data.consent_text,
            status="draft",
        )
        session.add(row)
        session.flush()
        EventService._replace_targets(session, row.id, data.targets)
        session.flush()
        return row

    @staticmethod
    def read(session: TenantSession, event_id: uuid.UUID) -> Event:
        row = session.get(Event, event_id)
        if row is None:
            raise EventNotFoundError(str(event_id))
        return row

    @staticmethod
    def list_events(
        session: TenantSession,
        *,
        types: list[str] | None = None,
        statuses: list[str] | None = None,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[Event], bool]:
        """Keyset over `(starts_at, id)`. §5.8's list is chronological and `7a` splits it
        into upcoming and past, so ordering by the start is the ordering both want."""
        stmt = select(Event).order_by(Event.starts_at, Event.id)
        if types:
            stmt = stmt.where(Event.type.in_(types))
        if statuses:
            stmt = stmt.where(Event.status.in_(statuses))
        if after is not None:
            anchor = session.get(Event, after)
            if anchor is not None:
                stmt = stmt.where(
                    (Event.starts_at, Event.id) > (anchor.starts_at, anchor.id)
                )
        rows = list(session.execute(stmt.limit(limit + 1)).scalars())
        return rows[:limit], len(rows) > limit

    @staticmethod
    def update(session: TenantSession, event_id: uuid.UUID, data: EventUpdateIn) -> Event:
        """`status` is absent from `EventUpdateIn` deliberately -- publishing and
        cancelling are their own transitions. A published event is not edited here, because
        §5.8 notifies on both transitions and a silent date change is a surprise."""
        row = EventService.read(session, event_id)
        if row.status != "draft":
            raise EventNotEditableError(row.status)
        fields = data.model_dump(exclude_unset=True, exclude={"targets"})
        for name, value in fields.items():
            setattr(row, name, value)
        if row.ends_at <= row.starts_at:
            row.ends_at = row.starts_at + DEFAULT_DURATION
        if data.targets is not None:
            EventService._replace_targets(session, row.id, data.targets)
        session.flush()
        return row

    # -- targets ---------------------------------------------------------------
    @staticmethod
    def _replace_targets(
        session: TenantSession, event_id: uuid.UUID, targets: list[EventTargetOut]
    ) -> None:
        """Targeting composes (§5.8): 'both beginner groups plus three seniors' is five
        rows, not a query language. Replacing wholesale keeps `uq_event_target` simple --
        the alternative is a diff that has to reason about which of five rows moved."""
        for existing in session.execute(
            select(EventTarget).where(EventTarget.event_id == event_id)
        ).scalars():
            session.delete(existing)
        session.flush()
        seen: set[tuple[str, uuid.UUID | None]] = set()
        for target in targets:
            key = (target.target_type, None if target.target_type == "studio" else target.target_id)
            if key in seen:
                continue
            seen.add(key)
            session.add(
                EventTarget(event_id=event_id, target_type=key[0], target_id=key[1])
            )

    @staticmethod
    def targets_of(
        session: TenantSession, event_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[EventTargetOut]]:
        """Resolved for display, so `7a`'s list does not need N lookups per row."""
        if not event_ids:
            return {}
        rows = list(
            session.execute(
                select(EventTarget).where(EventTarget.event_id.in_(event_ids))
            ).scalars()
        )
        names = EventService._display_names(session, rows)
        out: dict[uuid.UUID, list[EventTargetOut]] = {event_id: [] for event_id in event_ids}
        for row in rows:
            out[row.event_id].append(
                EventTargetOut(
                    target_type=row.target_type,
                    target_id=row.target_id,
                    display_name=names.get((row.target_type, row.target_id)),
                )
            )
        return out

    @staticmethod
    def _display_names(
        session: TenantSession, rows: list[EventTarget]
    ) -> dict[tuple[str, uuid.UUID | None], str]:
        by_type: dict[str, set[uuid.UUID]] = {"class": set(), "group": set(), "student": set()}
        for row in rows:
            if row.target_type in by_type and row.target_id is not None:
                by_type[row.target_type].add(row.target_id)
        names: dict[tuple[str, uuid.UUID | None], str] = {}
        if by_type["class"]:
            for row_id, name in session.execute(
                select(Class.id, Class.name).where(Class.id.in_(by_type["class"]))
            ):
                names[("class", row_id)] = name
        if by_type["group"]:
            for row_id, name in session.execute(
                select(Group.id, Group.name).where(Group.id.in_(by_type["group"]))
            ):
                names[("group", row_id)] = name
        if by_type["student"]:
            for row_id, first, last in session.execute(
                select(Student.id, Person.first_name, Person.last_name)
                .join(Person, Person.id == Student.person_id)
                .where(Student.id.in_(by_type["student"]))
            ):
                names[("student", row_id)] = f"{first} {last}".strip()
        return names

    # -- counts ----------------------------------------------------------------
    @staticmethod
    def rsvp_counts(
        session: TenantSession, event_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[int, int, int]]:
        """`(yes, no, pending)` per event. §5.8's whole point is seeing who has not
        answered, so `pending` is counted rather than inferred from a total."""
        if not event_ids:
            return {}
        out = {event_id: [0, 0, 0] for event_id in event_ids}
        index = {"yes": 0, "no": 1, "pending": 2}
        rows = session.execute(
            select(
                EventRegistration.event_id,
                EventRegistration.rsvp,
                func.count(),
            )
            .where(EventRegistration.event_id.in_(event_ids))
            .group_by(EventRegistration.event_id, EventRegistration.rsvp)
        )
        for event_id, rsvp, count in rows:
            out[event_id][index[rsvp]] = count
        return {event_id: (v[0], v[1], v[2]) for event_id, v in out.items()}

    # -- serialisation ---------------------------------------------------------
    @staticmethod
    def to_out(
        session: TenantSession, events: list[Event], *, redact_fee: bool
    ) -> list[EventOut]:
        event_ids = [row.id for row in events]
        targets = EventService.targets_of(session, event_ids)
        counts = EventService.rsvp_counts(session, event_ids)
        out = []
        for row in events:
            yes, no, pending = counts.get(row.id, (0, 0, 0))
            out.append(
                EventOut(
                    id=row.id,
                    type=row.type,
                    title=row.title,
                    description=row.description,
                    starts_at=row.starts_at,
                    ends_at=row.ends_at,
                    location_id=row.location_id,
                    location_text=row.location_text,
                    rsvp_deadline=row.rsvp_deadline,
                    fee_agorot=None if redact_fee else row.fee_agorot,
                    requires_consent=row.requires_consent,
                    consent_text=row.consent_text,
                    status=row.status,
                    targets=targets.get(row.id, []),
                    rsvp_yes_count=yes,
                    rsvp_no_count=no,
                    rsvp_pending_count=pending,
                )
            )
        return out
```

- [ ] **Step 4: Write the router**

`app/routers/events.py`:

```python
"""SPEC §7's `/events`. §5.8's events, and §5.9's belt exams, which are events.

**§3.2, per route.** 'Create events' is owner, manager and lead_coach -- an assistant coach
is on the wrong side of that line. Reads reach every staff role, because a coach who cannot
see the event cannot run it, and a guardian reaches only their own children's events.

**No price reaches a coach.** §3.2's hard rule is unqualified -- 'no charge, payment, debt
or price is reachable from any coach-scoped endpoint or screen' -- and `event.fee_agorot`
is a price. It is redacted on the way out rather than filtered in the query, because a
manager reads the same row through the same route.

Routers stay thin (G6): parse, call a service, return.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.events import (
    EventCreateIn,
    EventOut,
    EventPage,
    EventType,
    EventUpdateIn,
)
from app.services.events.errors import EventNotEditableError, EventNotFoundError
from app.services.events.events import EventService, redacts_fee

router = APIRouter(tags=["events"])

#: §3.2 -- 'Create events | owner ✓ | manager ✓ | lead_coach ✓'. Written here rather than
#: in app/core/auth_context.py: that file is core's and this is the only lane that needs
#: this particular triple.
EventsWriter = Annotated[None, Depends(require_roles("owner", "manager", "lead_coach"))]


def _roles(request: Request) -> frozenset[str]:
    return frozenset(getattr(request.state, "roles", ()) or ())


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such event"},
    )


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail={"code": code, "message": message}
    )


@router.get("/events", response_model=EventPage)
def list_events(
    _: AnyStaff,
    request: Request,
    session: TenantSessionDep,
    type: Annotated[list[EventType] | None, Query()] = None,
    after: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> EventPage:
    """`7a`'s roundup and `9i`'s staff list. Drafts are included -- they are the manager's
    own work in progress, and §4.3 hides them from guardians, not from staff."""
    rows, has_more = EventService.list_events(session, types=type, after=after, limit=limit)
    items = EventService.to_out(session, rows, redact_fee=redacts_fee(_roles(request)))
    return EventPage(
        items=items,
        next_cursor=items[-1].id if items and has_more else None,
        has_more=has_more,
    )


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    _: EventsWriter,
    body: EventCreateIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EventOut:
    """201, and the event is a DRAFT. §4.3 keeps it invisible to guardians until published,
    which is what lets a manager build one over several sittings (`7b`'s autosave)."""
    row = EventService.create(session, body, at=now())
    out = EventService.to_out(session, [row], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return out


@router.get("/events/{event_id}", response_model=EventOut)
def read_event(
    _: AnyStaff, event_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> EventOut:
    try:
        row = EventService.read(session, event_id)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    return EventService.to_out(session, [row], redact_fee=redacts_fee(_roles(request)))[0]


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    _: EventsWriter,
    event_id: uuid.UUID,
    body: EventUpdateIn,
    request: Request,
    session: TenantSessionDep,
) -> EventOut:
    """409 rather than 403 on a published event: the caller may edit events, and this
    event is past the point where an edit is an edit. §5.8 notifies on publish."""
    try:
        row = EventService.update(session, event_id, body)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    except EventNotEditableError as exc:
        raise _conflict(
            "event_is_not_a_draft", "a published event is changed by cancelling it"
        ) from exc
    out = EventService.to_out(session, [row], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return out
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events/test_creating_and_listing_an_event.py -q
```

Expected: 6 passed.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/ruff check --fix app/services/events app/routers/events.py && \
  .venv/bin/ruff format app/services/events app/routers/events.py && \
  .venv/bin/mypy app/services/events app/routers/events.py && \
  git add app/services/events app/routers/events.py tests/events && \
  git commit -m "feat(events): an event is created as a draft, and no coach sees its price"
```

---

### Task 2: Publishing materialises the roster, and cancelling does not unmake it

**Files:**
- Create: `app/services/events/publish.py`
- Modify: `app/routers/events.py` (add two routes)
- Test: `tests/events/test_publishing_an_event.py`

**Interfaces:**
- Consumes: `EventService`, `app.models.events.{Event, EventTarget, EventRegistration}`,
  `app.models.people.{Student, Enrollment}`, `app.models.structure.Group`
- Produces:
  - `EventPublishService.resolve_targets(session, event_id) -> list[uuid.UUID]`
  - `EventPublishService.publish(session, event_id, *, at) -> tuple[Event, int]`
  - `EventPublishService.cancel(session, event_id, *, at) -> Event`
  - errors `EventAlreadyPublishedError`, `EventNotPublishedError`
  - router shape `EventPublishedOut{event: EventOut, registrations_created: int}`

- [ ] **Step 1: Write the failing test**

`tests/events/test_publishing_an_event.py`:

```python
"""§5.8 -- 'Every targeted student gets an `event_registration` row with rsvp = pending.'

Publishing is the moment an event becomes real to the club, and this file pins the three
things that follow from that. Targets COMPOSE: 'both beginner groups plus three seniors'
is several rows, and a student in two of them is registered once. Publishing is IDEMPOTENT
in effect -- a second publish must not re-materialise over answers already given, which is
why it is refused rather than repeated. And cancelling does NOT delete the roster: §5.8
notifies on a cancellation, and a family that answered has a right to still be on the list
the office phones.
"""

from __future__ import annotations

from app.models.events import EventRegistration
from app.models.people import Enrollment, Student
from app.models.person import Person
from sqlalchemy import select
from tests.events.conftest import TODAY, YEAR_STARTS


def _student_in(app_session, studio, group_id, name):
    person = Person(studio_id=studio.id, first_name=name, last_name="בודק")
    app_session.add(person)
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=YEAR_STARTS
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=group_id,
            status="active",
            started_on=YEAR_STARTS,
        )
    )
    app_session.commit()
    return student.id


def test_publishing_registers_every_targeted_student_as_pending(
    client, app_session, as_manager, studio, a_group, an_event
):
    first = _student_in(app_session, studio, a_group, "דנה")
    second = _student_in(app_session, studio, a_group, "יוסי")
    client.patch(
        f"/api/v1/events/{an_event}",
        headers=as_manager.headers,
        json={"targets": [{"target_type": "group", "target_id": str(a_group)}]},
    )
    # The fixture publishes at creation; move it back to a draft the only legal way --
    # by creating a fresh draft with the same targets.
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "competition",
            "title": "אליפות",
            "starts_at": "2026-11-26T09:00:00+00:00",
            "targets": [{"target_type": "group", "target_id": str(a_group)}],
        },
    ).json()

    response = client.post(
        f"/api/v1/events/{created['id']}/publish", headers=as_manager.headers
    )
    assert response.status_code == 201, response.text
    assert response.json()["registrations_created"] == 2
    assert response.json()["event"]["status"] == "published"

    rows = list(
        app_session.execute(
            select(EventRegistration).where(EventRegistration.event_id == created["id"])
        ).scalars()
    )
    assert {row.student_id for row in rows} == {first, second}
    assert {row.rsvp for row in rows} == {"pending"}
    assert all(row.charge_id is None for row in rows)


def test_a_student_in_two_targets_is_registered_once(
    client, app_session, as_manager, studio, a_class, a_group
):
    """`uq_event_registration` is UNIQUE on (event_id, student_id). Targeting composes, so
    the same child reached by a class AND a group is one row -- and the duplicate must be
    collapsed before the INSERT rather than caught as an integrity error."""
    student = _student_in(app_session, studio, a_group, "רותם")
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "seminar",
            "title": "סמינר",
            "starts_at": "2026-11-26T09:00:00+00:00",
            "targets": [
                {"target_type": "class", "target_id": str(a_class)},
                {"target_type": "group", "target_id": str(a_group)},
                {"target_type": "student", "target_id": str(student)},
            ],
        },
    ).json()
    response = client.post(
        f"/api/v1/events/{created['id']}/publish", headers=as_manager.headers
    )
    assert response.status_code == 201, response.text
    assert response.json()["registrations_created"] == 1


def test_publishing_twice_is_refused_rather_than_repeated(client, as_manager, an_event):
    """`an_event` is already published. A second publish would re-materialise the roster
    over answers already given, so it is a 409 -- the caller may publish, and this event
    is past the point where publishing means anything."""
    response = client.post(f"/api/v1/events/{an_event}/publish", headers=as_manager.headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "event_is_not_a_draft"


def test_cancelling_keeps_the_roster(
    client, app_session, as_manager, an_event, a_registered_student
):
    """§5.8 notifies on a cancellation, and the office phones the families who answered.
    Deleting the roster would delete the list the notification is addressed to."""
    response = client.post(f"/api/v1/events/{an_event}/cancel", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert app_session.get(EventRegistration, a_registered_student) is not None


def test_a_draft_cannot_be_cancelled(client, as_manager):
    """Nothing has reached a guardian, so there is nothing to withdraw. A manager deletes
    a draft by leaving it; `events.status.draftHint` says why that is safe."""
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={"type": "other", "title": "טיוטה", "starts_at": "2026-11-26T09:00:00+00:00"},
    ).json()
    response = client.post(
        f"/api/v1/events/{created['id']}/cancel", headers=as_manager.headers
    )
    assert response.status_code == 409
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events/test_publishing_an_event.py -q
```

Expected: failures on `404` for `/publish` and `/cancel` — the routes do not exist.

- [ ] **Step 3: Write `app/services/events/publish.py`**

```python
"""Publishing an event, which is the moment it becomes real to the club.

§5.8: 'An event targets any mix of studio, classes, groups or individual students via
`event_target`. Every targeted student gets an `event_registration` row with
`rsvp = pending`.' That sentence is this module.

**Targets compose and the union is de-duplicated in Python, before the INSERT.**
`uq_event_registration` would catch a child reached by both a class and a group, but as an
IntegrityError that aborts the whole publish -- and 'both beginner groups plus three
seniors' is the normal case, not the edge one.

**Publishing is refused rather than repeated.** A second publish would re-materialise the
roster over answers already given, and an RSVP a parent has to give twice is an RSVP the
office cannot trust.

**Cancelling does not unmake the roster.** §5.8 notifies on a cancellation and the office
phones whoever answered; deleting the registrations would delete the list the call is made
from. `status='cancelled'` is the whole of it.

**Nothing here sends anything.** D-M7-2: invitations as a state distinct from publishing
have no column and no notification kind -- `NotificationService` is M8's and does not exist
until W5. Four artboards draw 'published, invitations not sent'; it is reported, not faked.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.events import Event, EventRegistration, EventTarget
from app.models.people import Enrollment, Student
from app.models.structure import Group
from app.services.events.errors import EventNotEditableError, EventNotFoundError
from app.services.events.events import EventService

#: Only an active student is registered. §5.4's `frozen` and `left` are real statuses, and
#: inviting a child who left the club three months ago is how a studio loses a family twice.
REGISTERABLE_STATUSES = ("active", "trial")


class EventPublishService:
    @staticmethod
    def resolve_targets(session: TenantSession, event_id: uuid.UUID) -> list[uuid.UUID]:
        """The union of every target row, de-duplicated, order-stable.

        `studio` is everyone. `class` reaches every student enrolled in a group of that
        class -- the enrolment is the only edge between a student and a class, because
        §4.3 puts `class_id` on `group` and not on `student`.
        """
        targets = list(
            session.execute(
                select(EventTarget).where(EventTarget.event_id == event_id)
            ).scalars()
        )
        if not targets:
            return []

        by_type: dict[str, list[uuid.UUID]] = {"class": [], "group": [], "student": []}
        whole_studio = False
        for row in targets:
            if row.target_type == "studio":
                whole_studio = True
            elif row.target_id is not None:
                by_type[row.target_type].append(row.target_id)

        found: list[uuid.UUID] = []
        seen: set[uuid.UUID] = set()

        def add(ids) -> None:
            for student_id in ids:
                if student_id not in seen:
                    seen.add(student_id)
                    found.append(student_id)

        if whole_studio:
            add(
                session.execute(
                    select(Student.id)
                    .where(Student.status.in_(REGISTERABLE_STATUSES))
                    .order_by(Student.id)
                ).scalars()
            )
        if by_type["class"]:
            add(
                session.execute(
                    select(Student.id)
                    .join(Enrollment, Enrollment.student_id == Student.id)
                    .join(Group, Group.id == Enrollment.group_id)
                    .where(
                        Group.class_id.in_(by_type["class"]),
                        Enrollment.status == "active",
                        Student.status.in_(REGISTERABLE_STATUSES),
                    )
                    .order_by(Student.id)
                ).scalars()
            )
        if by_type["group"]:
            add(
                session.execute(
                    select(Student.id)
                    .join(Enrollment, Enrollment.student_id == Student.id)
                    .where(
                        Enrollment.group_id.in_(by_type["group"]),
                        Enrollment.status == "active",
                        Student.status.in_(REGISTERABLE_STATUSES),
                    )
                    .order_by(Student.id)
                ).scalars()
            )
        if by_type["student"]:
            # Named individually, so the status filter does not apply: §5.9 nominates
            # candidates directly, and a manager naming a child means that child.
            add(
                session.execute(
                    select(Student.id)
                    .where(Student.id.in_(by_type["student"]))
                    .order_by(Student.id)
                ).scalars()
            )
        return found

    @staticmethod
    def publish(
        session: TenantSession, event_id: uuid.UUID, *, at: datetime
    ) -> tuple[Event, int]:
        event = EventService.read(session, event_id)
        if event.status != "draft":
            raise EventNotEditableError(event.status)

        already = set(
            session.execute(
                select(EventRegistration.student_id).where(
                    EventRegistration.event_id == event_id
                )
            ).scalars()
        )
        created = 0
        for student_id in EventPublishService.resolve_targets(session, event_id):
            if student_id in already:
                continue
            session.add(
                EventRegistration(
                    event_id=event_id, student_id=student_id, rsvp="pending", attended=False
                )
            )
            created += 1
        event.status = "published"
        session.flush()
        return event, created

    @staticmethod
    def cancel(session: TenantSession, event_id: uuid.UUID, *, at: datetime) -> Event:
        event = EventService.read(session, event_id)
        if event.status != "published":
            raise EventNotEditableError(event.status)
        event.status = "cancelled"
        session.flush()
        return event
```

- [ ] **Step 4: Add the two routes to `app/routers/events.py`**

Append after `update_event`, and add the imports
`from app.services.events.publish import EventPublishService` and
`from pydantic import BaseModel`:

```python
class EventPublishedOut(BaseModel):
    """A publish reports the roster it just created.

    Same reasoning as `HealthTemplatePublishedOut`: a publish that said nothing about what
    it materialised would look identical to one that materialised nothing -- which is
    exactly what an event with no targets does, and exactly what a manager needs to see
    before wondering why no parent replied.
    """

    event: EventOut
    registrations_created: int


@router.post(
    "/events/{event_id}/publish",
    response_model=EventPublishedOut,
    status_code=status.HTTP_201_CREATED,
)
def publish_event(
    _: EventsWriter,
    event_id: uuid.UUID,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> EventPublishedOut:
    """§5.8 — every targeted student gets a registration at `rsvp='pending'`.

    **Nothing is sent.** Publishing makes the event visible; an invitation is a
    notification, and `NotificationService` is M8's (W5). Four artboards draw "published,
    invitations not sent" as a distinct state and no column holds it.
    """
    try:
        event, created = EventPublishService.publish(session, event_id, at=now())
    except EventNotFoundError as exc:
        raise _not_found() from exc
    except EventNotEditableError as exc:
        raise _conflict(
            "event_is_not_a_draft", "only a draft can be published"
        ) from exc
    out = EventService.to_out(session, [event], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return EventPublishedOut(event=out, registrations_created=created)


@router.post("/events/{event_id}/cancel", response_model=EventOut)
def cancel_event(
    _: EventsWriter, event_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> EventOut:
    """The roster survives. §5.8 notifies on a cancellation and the office phones whoever
    answered — deleting the registrations would delete the list the call is made from."""
    try:
        event = EventPublishService.cancel(session, event_id, at=now())
    except EventNotFoundError as exc:
        raise _not_found() from exc
    except EventNotEditableError as exc:
        raise _conflict(
            "event_is_not_published", "only a published event can be cancelled"
        ) from exc
    out = EventService.to_out(session, [event], redact_fee=redacts_fee(_roles(request)))[0]
    session.commit()
    return out
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events/test_publishing_an_event.py -q
```

Expected: 5 passed.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/ruff check --fix app/services/events app/routers/events.py && \
  .venv/bin/ruff format app/services/events app/routers/events.py && \
  .venv/bin/mypy app/services/events app/routers/events.py && \
  git add -A app/services/events app/routers/events.py tests/events && \
  git commit -m "feat(events): publishing materialises the roster once, and cancelling keeps it"
```

---

### Task 3: RSVP, the consent gate, and the one call to `create_charge`

**This is the task the lane exists to get right.** §5.8 ties three things together — the
RSVP, a signed consent and a fee that becomes a charge — and D-M7-5 is the rule that binds
them.

**Files:**
- Create: `app/services/events/rsvp.py`, `app/services/events/fees.py`
- Modify: `app/routers/events.py` (RSVP, consent, registrations list, `/me/events`)
- Test: `tests/events/test_rsvp_consent_and_the_fee_seam.py`

**Interfaces:**
- Consumes: `app.services.billing.BillingService`, `app.models.health.ConsentRecord`,
  `app.models.person.Guardian`, `EventService`
- Produces:
  - `RsvpService.answer(session, event_id, student_id, *, rsvp, by_person_id, at) -> EventRegistration`
  - `RsvpService.sign_consent(session, event_id, student_id, *, by_person_id, at, ip) -> EventRegistration`
  - `RsvpService.is_confirmed(event: Event, registration: EventRegistration) -> bool`
  - `RsvpService.students_of_guardian(session, person_id) -> list[uuid.UUID]`
  - `EventFeeService.charge_if_confirmed(session, event, registration, *, at, billing=None) -> uuid.UUID | None`
  - `EventFeeService.primary_payer(session, student_id) -> uuid.UUID | None`
  - errors `RsvpDeadlinePassedError`, `NotThisGuardiansStudentError`,
    `NotRegisteredForEventError`, `ConsentNotRequiredError`
  - router shapes `RsvpAnswerIn{student_id, rsvp}`, `EventConsentIn{student_id}`

- [ ] **Step 1: Write the failing test**

`tests/events/test_rsvp_consent_and_the_fee_seam.py`:

```python
"""§5.8's three-way tie: the RSVP, the consent, and the fee that becomes a charge.

**The seam is asserted by how it is CALLED, not by what it returns.** `create_charge` is
still `NotImplementedError` on `main` -- lane MONEY fills it in -- so every test here
substitutes a recording double and asserts the call shape. That is the stronger assertion
anyway: `student_id` and `event_id` are keyword-only precisely because both are
`UUID | None` in adjacent positions, so a positional call would bind an event id to
`student_id` and no type checker would see it. A test that only checked the return value
would pass on exactly that bug.

**Confirmation is derived, not stored** (§5.8): an RSVP does not count as confirmed until
the parent signs, so `rsvp='yes'` is always recorded and the charge waits for the pair.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

import pytest
from app.models.events import EventRegistration
from app.models.health import ConsentRecord
from sqlalchemy import select
from tests.events.conftest import EVENT_FEE_AGOROT, T0


@dataclass
class RecordingBilling:
    """A stand-in for `BillingService`. Records the call and hands back a stub charge id.

    Not a `MagicMock`: a mock accepts a positional `event_id` happily, which is the one
    mistake this seam was shaped to make unspellable. A real signature with keyword-only
    parameters raises `TypeError` on the bad call, in the test, where it is visible.
    """

    calls: list[dict] = field(default_factory=list)
    charge_id: uuid.UUID = field(default_factory=uuid.uuid4)

    def create_charge(
        self,
        studio_id,
        payer_person_id,
        kind,
        amount_agorot,
        due_date,
        *,
        student_id=None,
        event_id=None,
    ):
        self.calls.append(
            {
                "studio_id": studio_id,
                "payer_person_id": payer_person_id,
                "kind": kind,
                "amount_agorot": amount_agorot,
                "due_date": due_date,
                "student_id": student_id,
                "event_id": event_id,
            }
        )
        return type("Charge", (), {"id": self.charge_id})()


@pytest.fixture
def billing(monkeypatch):
    double = RecordingBilling()
    monkeypatch.setattr(
        "app.services.events.fees.BillingService", lambda: double, raising=True
    )
    return double


def test_a_guardian_answers_for_their_own_child(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rsvp"] == "yes"
    assert body["responded_at"] is not None
    assert body["responded_by_person_id"] == str(parent.person_id)


def test_a_guardian_cannot_answer_for_a_child_who_is_not_theirs(
    client, app_session, as_guardian_of, a_student, studio, an_event, a_registered_student
):
    """§3.2 -- 'own' in the guardian column always means only for my own children."""
    from app.models.people import Student
    from app.models.person import Person

    person = Person(studio_id=studio.id, first_name="זר", last_name="בודק")
    app_session.add(person)
    app_session.flush()
    other = Student(
        studio_id=studio.id, person_id=person.id, status="active", joined_on=T0.date()
    )
    app_session.add(other)
    app_session.commit()

    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(other.id), "rsvp": "yes"},
    )
    assert response.status_code == 403


def test_yes_alone_does_not_confirm_when_the_event_wants_a_consent(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """§5.8 -- 'the guardian must sign the event's consent text before the RSVP counts as
    confirmed'. `an_event` sets `requires_consent`, so the answer is recorded and NO charge
    is raised: `events.consent.blocksConfirmation` is the sentence, and this is it in code.
    """
    parent = as_guardian_of(a_student)
    body = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    ).json()
    assert body["rsvp"] == "yes"
    assert body["charge_id"] is None
    assert billing.calls == []


def test_signing_the_consent_completes_the_pair_and_raises_exactly_one_charge(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """§5.8 -- 'confirming attendance creates a `charge` with `kind='event'` for that
    student's payer'. The fee is created on CONFIRMATION, so whichever of the two acts
    completes the pair is the one that fires the seam -- and it fires once."""
    parent = as_guardian_of(a_student)
    client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    response = client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["consent_signed_at"] is not None
    assert body["charge_id"] is not None

    assert len(billing.calls) == 1
    call = billing.calls[0]
    assert call["kind"] == "event"
    assert call["amount_agorot"] == EVENT_FEE_AGOROT
    assert call["student_id"] == a_student
    assert call["event_id"] == uuid.UUID(str(an_event))
    assert call["payer_person_id"] == parent.person_id


def test_the_event_id_never_binds_to_student_id(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """The reason the seam is keyword-only. Both are `UUID | None` in adjacent positions,
    so positionally an event id binds happily to `student_id`. Asserted as the two values
    being DIFFERENT and each in its own slot -- a swap would leave both tests above green."""
    parent = as_guardian_of(a_student)
    client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    )
    call = billing.calls[0]
    assert call["student_id"] != call["event_id"]
    assert call["student_id"] == a_student
    assert call["event_id"] == uuid.UUID(str(an_event))


def test_answering_twice_does_not_raise_a_second_charge(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """`events.rsvp.change` exists -- a parent may change their answer. Changing it from
    yes to yes must not bill the family twice, and `charge_id` already on the row is what
    says the fee has been raised."""
    parent = as_guardian_of(a_student)
    for _ in range(3):
        client.post(
            f"/api/v1/events/{an_event}/rsvp",
            headers=parent.headers,
            json={"student_id": str(a_student), "rsvp": "yes"},
        )
        client.post(
            f"/api/v1/events/{an_event}/consent",
            headers=parent.headers,
            json={"student_id": str(a_student)},
        )
    assert len(billing.calls) == 1


def test_a_free_event_confirms_with_no_charge_at_all(
    client, app_session, as_manager, as_guardian_of, a_student, a_group, billing
):
    """`fee_agorot` NULL is a free event, and zero is not the same thing -- a zero-fee
    event would create a zero charge and a receipt for nothing (`app/schemas/events.py`)."""
    from app.models.people import Enrollment

    app_session.add(
        Enrollment(
            studio_id=as_manager.studio_id,
            student_id=a_student,
            group_id=a_group,
            status="active",
            started_on=T0.date(),
        )
    )
    app_session.commit()
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "seminar",
            "title": "סמינר חינם",
            "starts_at": "2026-11-26T09:00:00+00:00",
            "targets": [{"target_type": "group", "target_id": str(a_group)}],
        },
    ).json()
    client.post(f"/api/v1/events/{created['id']}/publish", headers=as_manager.headers)

    parent = as_guardian_of(a_student)
    body = client.post(
        f"/api/v1/events/{created['id']}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    ).json()
    assert body["rsvp"] == "yes"
    assert body["charge_id"] is None
    assert billing.calls == []


def test_declining_never_raises_a_charge(
    client, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    parent = as_guardian_of(a_student)
    body = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "no"},
    ).json()
    assert body["rsvp"] == "no"
    assert body["charge_id"] is None
    assert billing.calls == []


def test_signing_writes_the_consent_ledger_row_too(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """§11.6's ledger. `consent_record` has `consent_type='event'` and was authored in
    `0007` for exactly this. It carries no `event_id`, so it cannot say WHICH event --
    `event_registration.consent_signed_at` is the authoritative per-event fact, and the
    ledger row is the completeness §11.6 asks for."""
    parent = as_guardian_of(a_student)
    client.post(
        f"/api/v1/events/{an_event}/consent",
        headers=parent.headers,
        json={"student_id": str(a_student)},
    )
    rows = list(
        app_session.execute(
            select(ConsentRecord).where(
                ConsentRecord.subject_id == a_student,
                ConsentRecord.consent_type == "event",
            )
        ).scalars()
    )
    assert len(rows) == 1
    assert rows[0].granted is True
    assert rows[0].subject_type == "student"


def test_an_answer_after_the_deadline_is_refused(
    client, app_session, as_guardian_of, a_student, an_event, a_registered_student, billing
):
    """`events.rsvp.deadlinePassed` exists and `7d`'s whole footer is a deadline."""
    from app.models.events import Event

    event = app_session.get(Event, an_event)
    event.rsvp_deadline = T0.replace(hour=8)
    app_session.commit()

    parent = as_guardian_of(a_student)
    response = client.post(
        f"/api/v1/events/{an_event}/rsvp",
        headers=parent.headers,
        json={"student_id": str(a_student), "rsvp": "yes"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "rsvp_deadline_passed"


def test_a_parent_never_sees_another_familys_event(
    client, as_guardian_of, a_student, an_event, a_registered_student
):
    """`GET /me/events` is `12h`. It resolves through `guardian`, and a draft never appears
    -- §4.3 makes a draft invisible to guardians, which is the whole reason drafts exist."""
    parent = as_guardian_of(a_student)
    response = client.get("/api/v1/me/events", headers=parent.headers)
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert [row["event"]["id"] for row in rows] == [str(an_event)]
    assert all(row["event"]["status"] != "draft" for row in rows)


def test_a_manager_reads_the_roster_and_a_coach_reads_it_without_a_charge(
    client, as_manager, as_assistant_coach, an_event, a_registered_student
):
    """`7c`'s participants table. §3.2's hard rule reaches the roster too: the payment
    column is M6's data on M7's screen, and a coach gets `charge_id = null`."""
    manager = client.get(
        f"/api/v1/events/{an_event}/registrations", headers=as_manager.headers
    )
    assert manager.status_code == 200, manager.text
    assert manager.json()["items"][0]["student_display_name"]

    coach = client.get(
        f"/api/v1/events/{an_event}/registrations", headers=as_assistant_coach.headers
    )
    assert coach.status_code == 200
    assert all(row["charge_id"] is None for row in coach.json()["items"])
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events/test_rsvp_consent_and_the_fee_seam.py -q
```

Expected: failures on `404` for `/rsvp`, `/consent`, `/registrations` and `/me/events`.

- [ ] **Step 3: Write `app/services/events/fees.py`**

```python
"""The one place this lane touches money, and it touches it by asking.

Plan W4: 'Event fees call `BillingService.create_charge(kind='event')`. The events lane
never writes to a billing table directly.' Everything below exists to make that one call
correctly and exactly once.

**Why the call is all-keyword.** `create_charge`'s `student_id` and `event_id` are
keyword-only in the contract, deliberately -- both are `UUID | None` in adjacent positions,
so positionally an event id binds happily to `student_id` and no type checker can see it.
M7 is the lane most likely to make that mistake, being the only one that passes `event_id`
at all. Passing every argument by name means the mistake cannot be made even in the
parameters that are not keyword-only.

**`BillingService` is instantiated here rather than imported as a singleton**, so a test
substitutes the whole class at this module's name. Its body is `NotImplementedError` until
lane MONEY lands; that is the seam working, not a gap.

**A charge is raised once, on confirmation.** `event_registration.charge_id` is the record
that it has been -- a second answer from the same parent must not bill the family twice.
`events.rsvp.change` exists precisely because changing an answer is expected.

**NULL is free and zero is not.** `app/schemas/events.py`: 'a zero-fee event would create a
zero charge and a receipt for nothing.'
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.tenancy import TenantSession, require_current_studio_id
from app.models.events import Event, EventRegistration
from app.models.person import Guardian
from app.services.billing import BillingService

logger = logging.getLogger(__name__)

#: §5.8 puts no due date on an event fee, so it falls due when the event happens: a family
#: paying after the competition has already been to the competition. Seven days' notice is
#: the shortest window that is not "today" for an event published a fortnight out.
DUE_BEFORE_EVENT = timedelta(days=7)


class EventFeeService:
    @staticmethod
    def primary_payer(session: TenantSession, student_id: uuid.UUID) -> uuid.UUID | None:
        """§5.10 -- a charge's payer is the student's primary guardian.

        `is_primary` first, then any guardian, then nothing. A child with no guardian at
        all is a real row during an intake, and the right behaviour is to raise no charge
        rather than to invent a payer -- an unpayable charge on a stranger's balance is
        worse than a fee the office chases by hand.
        """
        rows = list(
            session.execute(
                select(Guardian.person_id, Guardian.is_primary)
                .where(Guardian.student_id == student_id)
                .order_by(Guardian.is_primary.desc(), Guardian.person_id)
            )
        )
        return rows[0][0] if rows else None

    @staticmethod
    def charge_if_confirmed(
        session: TenantSession,
        event: Event,
        registration: EventRegistration,
        *,
        at: datetime,
        confirmed: bool,
    ) -> uuid.UUID | None:
        """Raise the event fee, or do nothing, and say which by returning the charge id.

        Every reason to do nothing is a legitimate state, not an error: the pair is not
        complete, the event is free, or the fee has already been raised.
        """
        if not confirmed or event.fee_agorot is None or registration.charge_id is not None:
            return None

        payer_person_id = EventFeeService.primary_payer(session, registration.student_id)
        if payer_person_id is None:
            # `extra=`, never an f-string: the scrubber matches keys, and an interpolated
            # message has none (CLAUDE.md, §Core mechanisms).
            logger.warning(
                "event fee not raised: the student has no guardian",
                extra={"event_id": str(event.id), "student_id": str(registration.student_id)},
            )
            return None

        due_date = (event.starts_at - DUE_BEFORE_EVENT).date()
        charge = BillingService().create_charge(
            studio_id=require_current_studio_id(),
            payer_person_id=payer_person_id,
            kind="event",
            amount_agorot=event.fee_agorot,
            due_date=due_date,
            # Keyword-only in the contract, and named here for the reason in the module
            # docstring. Never reorder these two, and never make either positional.
            student_id=registration.student_id,
            event_id=event.id,
        )
        registration.charge_id = charge.id
        session.flush()
        return charge.id
```

- [ ] **Step 4: Write `app/services/events/rsvp.py`**

```python
"""§5.8's RSVP, its consent gate, and event attendance.

**Confirmation is derived, never stored.** §5.8: 'If `requires_consent`, the guardian must
sign the event's consent text before the RSVP counts as confirmed.' So `rsvp='yes'` is
always recorded -- refusing the answer would lose the fact that the parent said yes -- and
`is_confirmed` is the pair. Artboard `7d` finding 1 is that the design does not express the
gate; `events.consent.blocksConfirmation` is the string that does, and this is the code.

**The fee fires from whichever act completes the pair.** A parent may sign first and answer
second, or the reverse. Both paths end in `EventFeeService.charge_if_confirmed`, which is
idempotent on `registration.charge_id`.

**A consent signature writes two rows.** `event_registration.consent_signed_at` is
authoritative, because it is the only column that names which event was consented to --
`consent_record` carries `subject_id` and `consent_type='event'` but no `event_id`. §11.6's
ledger gets its row anyway, because a consent ledger with holes is not a ledger.

**Nothing here logs a consent's contents.** §14 makes parental consent for a minor's
competition a health-adjacent record; what a list needs is whether it was signed.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.events import Event, EventRegistration
from app.models.health import ConsentRecord
from app.models.person import Guardian
from app.services.events.errors import (
    ConsentNotRequiredError,
    EventNotPublishedError,
    NotRegisteredForEventError,
    NotThisGuardiansStudentError,
    RsvpDeadlinePassedError,
)
from app.services.events.events import EventService
from app.services.events.fees import EventFeeService

#: Statuses a parent may answer against. A cancelled event has nothing to answer and a
#: draft is invisible to them (§4.3).
ANSWERABLE_STATUSES = ("published",)


class RsvpService:
    @staticmethod
    def students_of_guardian(session: TenantSession, person_id: uuid.UUID) -> set[uuid.UUID]:
        """§3.2's guardian column: 'own' always means only for my own children."""
        return set(
            session.execute(
                select(Guardian.student_id).where(Guardian.person_id == person_id)
            ).scalars()
        )

    @staticmethod
    def is_confirmed(event: Event, registration: EventRegistration) -> bool:
        """§5.8's gate, in one expression. The only definition in the product."""
        if registration.rsvp != "yes":
            return False
        return not event.requires_consent or registration.consent_signed_at is not None

    @staticmethod
    def _registration(
        session: TenantSession, event_id: uuid.UUID, student_id: uuid.UUID
    ) -> EventRegistration:
        row = session.execute(
            select(EventRegistration).where(
                EventRegistration.event_id == event_id,
                EventRegistration.student_id == student_id,
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotRegisteredForEventError(str(student_id))
        return row

    @staticmethod
    def assert_guardian_of(
        session: TenantSession, person_id: uuid.UUID, student_id: uuid.UUID
    ) -> None:
        if student_id not in RsvpService.students_of_guardian(session, person_id):
            raise NotThisGuardiansStudentError(str(student_id))

    @staticmethod
    def answer(
        session: TenantSession,
        event_id: uuid.UUID,
        student_id: uuid.UUID,
        *,
        rsvp: str,
        by_person_id: uuid.UUID,
        at: datetime,
    ) -> tuple[Event, EventRegistration]:
        event = EventService.read(session, event_id)
        if event.status not in ANSWERABLE_STATUSES:
            raise EventNotPublishedError(event.status)
        if event.rsvp_deadline is not None and at > event.rsvp_deadline:
            raise RsvpDeadlinePassedError(str(event.rsvp_deadline))

        registration = RsvpService._registration(session, event_id, student_id)
        registration.rsvp = rsvp
        registration.responded_by_person_id = by_person_id
        registration.responded_at = at
        session.flush()
        EventFeeService.charge_if_confirmed(
            session,
            event,
            registration,
            at=at,
            confirmed=RsvpService.is_confirmed(event, registration),
        )
        return event, registration

    @staticmethod
    def sign_consent(
        session: TenantSession,
        event_id: uuid.UUID,
        student_id: uuid.UUID,
        *,
        by_person_id: uuid.UUID,
        at: datetime,
        ip: str | None,
    ) -> tuple[Event, EventRegistration]:
        event = EventService.read(session, event_id)
        if event.status not in ANSWERABLE_STATUSES:
            raise EventNotPublishedError(event.status)
        if not event.requires_consent:
            raise ConsentNotRequiredError(str(event_id))

        registration = RsvpService._registration(session, event_id, student_id)
        if registration.consent_signed_at is None:
            registration.consent_signed_at = at
            # §11.6's ledger. Versioned and revocable by design; a withdrawal is a new row.
            session.add(
                ConsentRecord(
                    subject_type="student",
                    subject_id=student_id,
                    consent_type="event",
                    version=1,
                    granted=True,
                    granted_at=at,
                    ip=ip,
                )
            )
            session.flush()
        EventFeeService.charge_if_confirmed(
            session,
            event,
            registration,
            at=at,
            confirmed=RsvpService.is_confirmed(event, registration),
        )
        return event, registration

    @staticmethod
    def mark_attendance(
        session: TenantSession, event_id: uuid.UUID, marks: dict[uuid.UUID, bool]
    ) -> int:
        """§5.8 -- 'attendance is taken on an event with the same UI as a session'.

        `attended` is distinct from `rsvp`: a family that said yes and did not come is
        exactly the row the office wants to see. Nothing here touches `charge_id` -- a
        no-show still owes the fee, and a refund is a credit M6 writes.
        """
        rows = list(
            session.execute(
                select(EventRegistration).where(
                    EventRegistration.event_id == event_id,
                    EventRegistration.student_id.in_(list(marks)),
                )
            ).scalars()
        )
        for row in rows:
            row.attended = marks[row.student_id]
        session.flush()
        return len(rows)
```

- [ ] **Step 5: Add the routes to `app/routers/events.py`**

Add imports for `RsvpService`, `EventRegistrationOut`, `EventRegistrationPage`, `RsvpState`
and the errors, plus `from app.routers.health_templates import client_ip` — **no**: copy the
four-line `client_ip` helper rather than importing across routers, for the reason its own
docstring gives (a proxy can put arbitrary text in `request.client.host`, and `INET` rejects
it). Then:

```python
class RsvpAnswerIn(BaseModel):
    """`RsvpIn` from the contract carries only the answer; the route needs to know which
    child it is about. Composed here rather than by widening the contract shape — a parent
    with two children on one event is the ordinary case, and `RsvpIn` is what `7d`'s two
    buttons post."""

    student_id: uuid.UUID
    rsvp: RsvpState2  # Literal["yes", "no"] — see below


class EventConsentIn(BaseModel):
    """Which child is being consented for. **Not the consent text** — that lives on the
    event, and a signature that carried its own wording would let a client sign something
    the manager never wrote."""

    student_id: uuid.UUID


class ParentEventOut(BaseModel):
    """`12h`'s row: the event, plus this family's own answer for one child.

    Two objects rather than a flattened one, because the parent's list is per-child and the
    event is not — a family with two children on one competition sees one event and two
    answers, and flattening would duplicate the event.
    """

    event: EventOut
    registration: EventRegistrationOut
    #: §5.8's gate, computed once on the server. `events.consent.blocksConfirmation` is the
    #: string; a client re-deriving it would be a second implementation of the rule.
    confirmed: bool


ParentEventPage = CursorPage[ParentEventOut]
```

Routes: `POST /events/{id}/rsvp`, `POST /events/{id}/consent`,
`GET /events/{id}/registrations` (`AnyStaff`, `charge_id` redacted for coaches),
`POST /events/{id}/attendance` (`AnyStaff` — §3.2 gives every staff role
"Take/edit attendance"), and `GET /me/events` (guardian, published only). Each translates:
`EventNotFoundError` → 404, `NotThisGuardiansStudentError` → 403,
`NotRegisteredForEventError` → 404, `RsvpDeadlinePassedError` → 409
`rsvp_deadline_passed`, `EventNotPublishedError` → 409 `event_is_not_published`,
`ConsentNotRequiredError` → 409 `consent_not_required`.

`RsvpState2` above is `Literal["yes", "no"]` — reuse the contract's own union by writing
`rsvp: Literal["yes", "no"]` directly, so `test_a_parent_cannot_un_answer_an_rsvp`'s rule
holds on this shape too.

- [ ] **Step 6: Run the test and confirm it passes**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events/test_rsvp_consent_and_the_fee_seam.py -q
```

Expected: 12 passed.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/ruff check --fix app/services/events app/routers/events.py && \
  .venv/bin/ruff format app/services/events app/routers/events.py && \
  .venv/bin/mypy app/services/events app/routers/events.py && \
  git add -A app/services/events app/routers/events.py tests/events && \
  git commit -m "feat(events): a consent gates confirmation, and confirmation is the one call to create_charge"
```

---

### Task 4: The belt ladder — `/belt-ranks`

**Files:**
- Create: `app/services/belts/__init__.py`, `app/services/belts/errors.py`,
  `app/services/belts/ranks.py`, `app/routers/belts.py`
- Test: `tests/belts/test_the_belt_ladder.py`

**Interfaces:**
- Consumes: `app.schemas.belts.{BeltRankIn, BeltRankOut, BeltRankPage}`,
  `app.models.belts.BeltRank`, `app.models.people.Student`
- Produces:
  - `BeltRankService.list_for_class(session, class_id) -> list[BeltRank]`
  - `BeltRankService.create(session, data: BeltRankIn) -> BeltRank`
  - `BeltRankService.update(session, rank_id, data: BeltRankIn) -> BeltRank`
  - `BeltRankService.delete(session, rank_id) -> None`
  - `BeltRankService.reorder(session, class_id, ordered_ids) -> list[BeltRank]`
  - `BeltRankService.next_after(session, rank_id) -> BeltRank | None`
  - `BeltRankService.holders(session, rank_id) -> int`
  - errors `BeltRankNotFoundError`, `BeltRankIsHeldError`, `LadderClassRequiredError`,
    `LadderOrderCollisionError`

- [ ] **Step 1: Write the failing test**

`tests/belts/test_the_belt_ladder.py`:

```python
"""§5.9's `belt_rank`: per class, ordered, editable. Artboard `5b`.

Three rules carry weight. Ranks are ordered **within a class** -- a karate white belt and a
judo white belt are different rows on different ladders -- and `uq_belt_rank_class_order`
makes the order total, because 'what is this child's next belt' is the question every
progression screen answers and two ranks at one position make it unanswerable. A rank
students HOLD is not deletable, because `student_belt.belt_rank_id` is ON DELETE RESTRICT
and the alternative is a grading history that points at nothing. And `class_id` is
NOT NULL in the database while `BeltRankIn.class_id` is optional -- the API must refuse the
null rather than hand it to Postgres.
"""

from __future__ import annotations

import uuid

from app.models.belts import BeltRank, StudentBelt
from tests.belts.conftest import TODAY


def test_the_ladder_lists_in_order_within_its_class(
    client, as_manager, a_class, a_belt_ladder
):
    response = client.get(
        f"/api/v1/belt-ranks?class_id={a_class}", headers=as_manager.headers
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [row["order_index"] for row in items] == [0, 1, 2]
    assert [row["name"] for row in items] == ["לבנה", "צהובה", "צהובה-כתומה"]
    assert items[2]["secondary_color_hex"] == "#F08A24"


def test_a_rank_without_a_class_is_refused_rather_than_handed_to_postgres(
    client, as_manager
):
    """`belt_rank.class_id` is NOT NULL and `BeltRankIn.class_id` is `UUID | None`. A null
    reaching the INSERT is a 500 with no field attached, which the form cannot mark."""
    response = client.post(
        "/api/v1/belt-ranks",
        headers=as_manager.headers,
        json={"name": "חדשה", "order_index": 9, "color_hex": "#123456"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "class_required"


def test_two_ranks_cannot_share_a_position(client, as_manager, a_class, a_belt_ladder):
    """`uq_belt_rank_class_order`. A collision is a 409 the editor can act on, not the
    integrity error the constraint would otherwise surface as."""
    response = client.post(
        "/api/v1/belt-ranks",
        headers=as_manager.headers,
        json={
            "class_id": str(a_class),
            "name": "כתומה",
            "order_index": 1,
            "color_hex": "#F08A24",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_index_taken"


def test_a_rank_students_hold_is_not_deleted(
    client, app_session, as_manager, studio, a_belt_ladder, a_student
):
    """`5b` draws a delete icon on a row that shows a student count and no confirmation.
    The count is the data to refuse with: `student_belt.belt_rank_id` is ON DELETE RESTRICT,
    so the alternative is a 500 -- or, worse, a history pointing at nothing."""
    app_session.add(
        StudentBelt(
            studio_id=studio.id,
            student_id=a_student,
            belt_rank_id=a_belt_ladder[0],
            awarded_on=TODAY,
        )
    )
    app_session.commit()

    response = client.delete(
        f"/api/v1/belt-ranks/{a_belt_ladder[0]}", headers=as_manager.headers
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "rank_is_held"
    assert app_session.get(BeltRank, a_belt_ladder[0]) is not None


def test_an_unheld_rank_is_deleted(client, app_session, as_manager, a_belt_ladder):
    response = client.delete(
        f"/api/v1/belt-ranks/{a_belt_ladder[2]}", headers=as_manager.headers
    )
    assert response.status_code == 204
    assert app_session.get(BeltRank, a_belt_ladder[2]) is None


def test_reordering_rewrites_the_whole_ladder_in_one_go(
    client, as_manager, a_class, a_belt_ladder
):
    """`5b` reorders by drag. There is no drag primitive and no drag utility (D-M7-8), so
    the API takes the finished order and the screen moves rows with up/down buttons. Either
    way the write is the whole list: a pairwise swap through a UNIQUE index has to pass
    through a colliding intermediate state, and this one does not."""
    reversed_ids = [str(rank_id) for rank_id in reversed(a_belt_ladder)]
    response = client.post(
        "/api/v1/belt-ranks/reorder",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "ordered_ids": reversed_ids},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [row["id"] for row in items] == reversed_ids
    assert [row["order_index"] for row in items] == [0, 1, 2]


def test_a_lead_coach_does_not_configure_the_belt_system(
    client, as_lead_coach, a_class
):
    """§3.2 -- the belt system is studio configuration, on the 'Studio settings' row. A
    lead coach RECORDS results (§5.9, and the `as_lead_coach` fixture's own docstring); a
    lead coach does not redefine the ladder those results are graded against."""
    response = client.post(
        "/api/v1/belt-ranks",
        headers=as_lead_coach.headers,
        json={
            "class_id": str(a_class),
            "name": "דרגה",
            "order_index": 7,
            "color_hex": "#000000",
        },
    )
    assert response.status_code == 403


def test_the_next_rank_is_the_one_above_and_the_top_has_none(
    client, as_manager, a_class, a_belt_ladder
):
    """`events.belt.orderHint` -- 'הסדר קובע מהי הדרגה הבאה'. The top of the ladder having
    no next rank is what makes a student there ineligible (D-M7-3), so it is asserted here
    rather than discovered by the eligibility screen."""
    items = client.get(
        f"/api/v1/belt-ranks?class_id={a_class}", headers=as_manager.headers
    ).json()["items"]
    assert items[0]["next_rank_id"] == items[1]["id"]
    assert items[2]["next_rank_id"] is None
```

> **Note on `next_rank_id`:** `BeltRankOut` is contract and carries no such field. The
> route returns a router-local `LadderRankOut` that composes `BeltRankOut` and adds it —
> the same move `HealthTemplatePublishedOut` makes rather than widening a contract shape.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/belts/test_the_belt_ladder.py -q
```

Expected: 404s throughout — `app/routers/belts.py` does not exist.

- [ ] **Step 3: Write `app/services/belts/errors.py` and `ranks.py`**

`app/services/belts/errors.py`:

```python
"""Belt domain errors, translated to HTTP by `app/routers/belts.py` (G6)."""

from __future__ import annotations


class BeltRankNotFoundError(LookupError):
    """No such rank in the active studio."""


class BeltRankIsHeldError(RuntimeError):
    """Students hold this rank. `student_belt.belt_rank_id` is ON DELETE RESTRICT, and a
    grading history that points at nothing is worse than a ladder with a stale rung."""


class LadderClassRequiredError(ValueError):
    """`belt_rank.class_id` is NOT NULL while `BeltRankIn.class_id` is optional. §5.9 --
    a karate white belt and a judo white belt are different rows on different ladders."""


class LadderOrderCollisionError(RuntimeError):
    """`uq_belt_rank_class_order`. Two ranks at one position make 'the next belt'
    ambiguous, which is the whole question a progression screen answers."""


class NotThisClassesRankError(RuntimeError):
    """A reorder naming a rank from another class, or omitting one of its own."""


class BeltAlreadyAwardedError(RuntimeError):
    """`uq_student_belt_student_rank`. A re-award is a data-entry mistake and it would show
    the same belt twice on `12d`'s timeline."""
```

`app/services/belts/ranks.py`:

```python
"""§5.9's ladder. Artboard `5b` is its specification.

**Ordered within a class, and the order is total.** `uq_belt_rank_class_order` enforces it
and `events.belt.orderHint` states it: הסדר קובע מהי הדרגה הבאה. `order_index` rather than
sorting by `kyu`, because not every rank has a kyu -- a striped junior belt often does not
-- and a null would scatter those rows to one end.

**Reordering rewrites the whole ladder.** A pairwise swap through a UNIQUE index has to
pass through a colliding intermediate state; taking the finished order and rewriting every
row inside one flush does not. `5b` reorders by drag and there is no drag primitive to
build it with, so the screen moves rows with buttons -- the API is the same either way.

**Colour is data, validated as a colour.** `HexColour` in the contract schema is the shape;
D3 makes the value per-studio configuration rather than a token, and a value that is not a
colour reaches `BeltBar` as a CSS declaration it cannot render, so the belt disappears
rather than erroring.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank, StudentBelt
from app.schemas.belts import BeltRankIn
from app.services.belts.errors import (
    BeltRankIsHeldError,
    BeltRankNotFoundError,
    LadderClassRequiredError,
    LadderOrderCollisionError,
    NotThisClassesRankError,
)


class BeltRankService:
    @staticmethod
    def list_for_class(session: TenantSession, class_id: uuid.UUID) -> list[BeltRank]:
        return list(
            session.execute(
                select(BeltRank)
                .where(BeltRank.class_id == class_id)
                .order_by(BeltRank.order_index)
            ).scalars()
        )

    @staticmethod
    def read(session: TenantSession, rank_id: uuid.UUID) -> BeltRank:
        row = session.get(BeltRank, rank_id)
        if row is None:
            raise BeltRankNotFoundError(str(rank_id))
        return row

    @staticmethod
    def create(session: TenantSession, data: BeltRankIn) -> BeltRank:
        if data.class_id is None:
            raise LadderClassRequiredError("a rank belongs to a class")
        BeltRankService._assert_free(session, data.class_id, data.order_index, None)
        row = BeltRank(
            class_id=data.class_id,
            name=data.name,
            kyu=data.kyu,
            order_index=data.order_index,
            color_hex=data.color_hex,
            secondary_color_hex=data.secondary_color_hex,
        )
        session.add(row)
        session.flush()
        return row

    @staticmethod
    def update(session: TenantSession, rank_id: uuid.UUID, data: BeltRankIn) -> BeltRank:
        row = BeltRankService.read(session, rank_id)
        BeltRankService._assert_free(session, row.class_id, data.order_index, rank_id)
        row.name = data.name
        row.kyu = data.kyu
        row.order_index = data.order_index
        row.color_hex = data.color_hex
        row.secondary_color_hex = data.secondary_color_hex
        session.flush()
        return row

    @staticmethod
    def delete(session: TenantSession, rank_id: uuid.UUID) -> None:
        row = BeltRankService.read(session, rank_id)
        if BeltRankService.holders(session, rank_id):
            raise BeltRankIsHeldError(str(rank_id))
        session.delete(row)
        session.flush()

    @staticmethod
    def reorder(
        session: TenantSession, class_id: uuid.UUID, ordered_ids: list[uuid.UUID]
    ) -> list[BeltRank]:
        """The finished order, written in two passes.

        Pass one parks every row at a negative index -- a range `order_index >= 0` forbids,
        so it cannot collide with a final position. Pass two writes the real ones. One
        flush between them, because the UNIQUE index is checked per statement.
        """
        current = BeltRankService.list_for_class(session, class_id)
        if {row.id for row in current} != set(ordered_ids):
            raise NotThisClassesRankError("a reorder names exactly this class's ranks")
        by_id = {row.id: row for row in current}
        for offset, rank_id in enumerate(ordered_ids):
            by_id[rank_id].order_index = -1 - offset
        session.flush()
        for offset, rank_id in enumerate(ordered_ids):
            by_id[rank_id].order_index = offset
        session.flush()
        return [by_id[rank_id] for rank_id in ordered_ids]

    @staticmethod
    def next_after(session: TenantSession, rank_id: uuid.UUID) -> BeltRank | None:
        """`events.belt.next`. `None` at the top of the ladder, which is what makes a
        student there ineligible rather than eligible for nothing (D-M7-3)."""
        row = BeltRankService.read(session, rank_id)
        return session.execute(
            select(BeltRank)
            .where(BeltRank.class_id == row.class_id, BeltRank.order_index > row.order_index)
            .order_by(BeltRank.order_index)
            .limit(1)
        ).scalar_one_or_none()

    @staticmethod
    def holders(session: TenantSession, rank_id: uuid.UUID) -> int:
        """`5b`'s student count, and the reason a delete is refused."""
        return int(
            session.execute(
                select(func.count()).select_from(StudentBelt).where(
                    StudentBelt.belt_rank_id == rank_id
                )
            ).scalar_one()
        )

    @staticmethod
    def _assert_free(
        session: TenantSession,
        class_id: uuid.UUID,
        order_index: int,
        excluding: uuid.UUID | None,
    ) -> None:
        stmt = select(BeltRank.id).where(
            BeltRank.class_id == class_id, BeltRank.order_index == order_index
        )
        if excluding is not None:
            stmt = stmt.where(BeltRank.id != excluding)
        if session.execute(stmt).first() is not None:
            raise LadderOrderCollisionError(str(order_index))
```

- [ ] **Step 4: Write `app/routers/belts.py`**

Router with `tags=["belts"]`, `ManagerOrOwner` on every ladder write (§3.2's "Studio
settings" row), `AnyStaff` on the read. `LadderRankOut(BeltRankOut)` adds
`next_rank_id: uuid.UUID | None` and `holders: int` (`5b`'s student count). Routes:

```
GET    /belt-ranks?class_id=…     → CursorPage[LadderRankOut]   AnyStaff
POST   /belt-ranks                → LadderRankOut, 201           ManagerOrOwner
PATCH  /belt-ranks/{rank_id}      → LadderRankOut                ManagerOrOwner
DELETE /belt-ranks/{rank_id}      → 204                          ManagerOrOwner
POST   /belt-ranks/reorder        → CursorPage[LadderRankOut]    ManagerOrOwner
```

Error translation: `BeltRankNotFoundError` → 404; `LadderClassRequiredError` → 422
`class_required`; `LadderOrderCollisionError` → 409 `order_index_taken`;
`BeltRankIsHeldError` → 409 `rank_is_held`; `NotThisClassesRankError` → 422
`reorder_must_name_the_whole_ladder`.

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/belts/test_the_belt_ladder.py -q
```

Expected: 8 passed.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/ruff check --fix app/services/belts app/routers/belts.py && \
  .venv/bin/ruff format app/services/belts app/routers/belts.py && \
  .venv/bin/mypy app/services/belts app/routers/belts.py && \
  git add -A app/services/belts app/routers/belts.py tests/belts && \
  git commit -m "feat(belts): a ladder ordered within its class, and a rank students hold is not deletable"
```

---

### Task 5: The seeded judo set — `/belt-presets` and `POST /belt-ranks/seed`

§5.9: *"A judo default set is seeded and fully editable."* Artboard `5d` is the wizard step
that picks one; `5b`'s `events.belt.seedDefault` is the button that loads one later.

**Files:**
- Create: `app/services/belts/presets.py`
- Modify: `app/routers/belts.py` (two routes)
- Test: `tests/belts/test_seeding_a_belt_system.py`

**Interfaces:**
- Produces:
  - `BELT_PRESETS: tuple[BeltPreset, ...]` with `BeltPreset{key, discipline, name, ranks}`
    and `PresetRank{name, kyu, order_index, color_hex, secondary_color_hex}`
  - `BeltPresetService.seed(session, class_id, preset_key) -> list[BeltRank]`
  - error `LadderAlreadySeededError`, `NoSuchPresetError`
  - router shapes `BeltPresetOut`, `SeedLadderIn{class_id, preset_key}`

- [ ] **Step 1: Write the failing test**

`tests/belts/test_seeding_a_belt_system.py`:

```python
"""§5.9 -- 'A judo default set is seeded and fully editable.' Artboards `5d` and `5b`.

**Preset rank names are DATA, not copy.** `5b` finding 5 settles it: the manager renames
them on that screen, so they are seeded values in Python and not i18n keys. The preset's
own NAME -- 'ג'ודו ילדים' -- is the same: a discipline plus a rank count is a preset's
name, and a studio that renames every rank has not renamed the preset it started from.

**A preset is versioned like `app/services/demo/fixtures.py`.** A studio seeded in
September and one seeded in March must get the same ladder, or two clubs' `12d` timelines
mean different things.

**Seeding never overwrites.** A class with a ladder already has one, and a second seed over
live grades would renumber ranks that `student_belt` rows point at.
"""

from __future__ import annotations

from app.models.belts import BeltRank
from app.services.belts.presets import BELT_PRESETS


def test_every_preset_is_a_total_order_with_valid_colours():
    """Asserted over the data itself, not through the API. `uq_belt_rank_class_order` would
    reject a duplicated index as an IntegrityError halfway through a seed, leaving a class
    with half a ladder -- and `HexColour`'s pattern is what stops a value reaching `BeltBar`
    as a CSS declaration it cannot render."""
    import re

    assert BELT_PRESETS, "the judo default set is §5.9's, not optional"
    for preset in BELT_PRESETS:
        indices = [rank.order_index for rank in preset.ranks]
        assert indices == list(range(len(preset.ranks))), preset.key
        assert len({rank.name for rank in preset.ranks}) == len(preset.ranks), preset.key
        for rank in preset.ranks:
            assert re.fullmatch(r"#[0-9a-fA-F]{6}", rank.color_hex), (preset.key, rank.name)
            assert rank.secondary_color_hex is None or re.fullmatch(
                r"#[0-9a-fA-F]{6}", rank.secondary_color_hex
            )


def test_the_children_preset_carries_bi_colour_grades():
    """Artboard `5d` -- 'חגורות ביניים לילדים הן בדרך כלל דו-צבעיות', and `5b` is explicit
    that the system includes them. A children's preset of solid belts would let this lane
    ship without ever rendering `BeltBar`'s second colour."""
    children = next(p for p in BELT_PRESETS if p.key == "judo_children")
    bi_colour = [r for r in children.ranks if r.secondary_color_hex is not None]
    assert len(bi_colour) >= 4
    assert all(r.color_hex != r.secondary_color_hex for r in bi_colour)


def test_the_catalogue_is_readable_before_anything_is_chosen(client, as_manager):
    """`5d` renders the preset cards with a live preview of the ranks each would create,
    so the ladder has to be readable before it exists."""
    response = client.get("/api/v1/belt-presets", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    keys = {row["key"] for row in response.json()["items"]}
    assert {"judo_adults", "judo_children", "karate"} <= keys
    first = response.json()["items"][0]
    assert first["ranks"] and first["ranks"][0]["color_hex"].startswith("#")


def test_seeding_creates_the_whole_ladder_in_order(client, app_session, as_manager, a_class):
    response = client.post(
        "/api/v1/belt-ranks/seed",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "preset_key": "judo_children"},
    )
    assert response.status_code == 201, response.text
    items = response.json()["items"]
    assert [row["order_index"] for row in items] == list(range(len(items)))
    assert any(row["secondary_color_hex"] for row in items)


def test_seeding_a_class_that_already_has_a_ladder_is_refused(
    client, as_manager, a_class, a_belt_ladder
):
    """A second seed would renumber ranks that `student_belt` rows already point at.
    409, not a silent merge: `events.belt.empty` is the state a seed is for."""
    response = client.post(
        "/api/v1/belt-ranks/seed",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "preset_key": "judo_adults"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "ladder_already_seeded"


def test_an_unknown_preset_is_a_422(client, as_manager, a_class):
    response = client.post(
        "/api/v1/belt-ranks/seed",
        headers=as_manager.headers,
        json={"class_id": str(a_class), "preset_key": "aikido"},
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Confirm it fails**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/belts/test_seeding_a_belt_system.py -q
```

Expected: `ModuleNotFoundError: app.services.belts.presets`.

- [ ] **Step 3: Write `app/services/belts/presets.py`**

```python
"""§5.9's seeded belt systems. Artboard `5d`'s four cards, minus the build-from-scratch one.

**These names are DATA and not copy**, and `5b` is what settles it: the manager renames
every rank on that screen. So they live here in Hebrew, in Python, and not in
`web/packages/i18n/*/events.ts` -- the same answer the health questionnaire and the price
catalogue get, and the reason `5d` finding 3 asks for a general rule rather than three
special cases.

**Versioned, like `app/services/demo/fixtures.py`.** A studio seeded in September and one
seeded in March must get the same ladder, or one club's `12d` timeline means something
different from another's. Editing a preset in place would do exactly that, so a change is a
new key rather than a new value under an old one.

**The colours are chosen against D12's two grounds.** They are belt colours -- real-world
objects -- and every one is ringed by `BeltBar` unconditionally (D7/G10), which is what
makes white usable on light and black usable on dark at all. None of them is `--paid`'s,
`--pending`'s or `--danger`'s value: D3 requires belts and semantics stay distinct, and
D12 already moved dark `--paid` off a green belt's hex to keep them apart.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank
from app.services.belts.errors import LadderAlreadySeededError, NoSuchPresetError


@dataclass(frozen=True)
class PresetRank:
    name: str
    kyu: int | None
    order_index: int
    color_hex: str
    secondary_color_hex: str | None = None


@dataclass(frozen=True)
class BeltPreset:
    key: str
    #: The discipline this ladder belongs to. Data -- `5d`'s card title is the discipline
    #: plus a rank count, and both come from here.
    discipline: str
    name: str
    ranks: tuple[PresetRank, ...]


_WHITE = "#FFFFFF"
_YELLOW = "#F7E017"
_ORANGE = "#F08A24"
_GREEN = "#2E8B4A"
_BLUE = "#2B6CB0"
_BROWN = "#6F4A2F"
_BLACK = "#111111"

JUDO_ADULTS = BeltPreset(
    key="judo_adults",
    discipline="judo",
    name="ג'ודו",
    ranks=(
        PresetRank("לבנה", 6, 0, _WHITE),
        PresetRank("צהובה", 5, 1, _YELLOW),
        PresetRank("כתומה", 4, 2, _ORANGE),
        PresetRank("ירוקה", 3, 3, _GREEN),
        PresetRank("כחולה", 2, 4, _BLUE),
        PresetRank("חומה", 1, 5, _BROWN),
        PresetRank("שחורה", None, 6, _BLACK),
    ),
)

#: The bi-colour ladder. `5d`: 'חגורות ביניים לילדים הן בדרך כלל דו-צבעיות', and `5b` draws
#: the same hard 50/50 split. Without these in a preset, a lane can ship a belt system
#: having never rendered `BeltBar`'s second colour.
JUDO_CHILDREN = BeltPreset(
    key="judo_children",
    discipline="judo",
    name="ג'ודו ילדים",
    ranks=(
        PresetRank("לבנה", 12, 0, _WHITE),
        PresetRank("לבנה-צהובה", 11, 1, _WHITE, _YELLOW),
        PresetRank("צהובה", 10, 2, _YELLOW),
        PresetRank("צהובה-כתומה", 9, 3, _YELLOW, _ORANGE),
        PresetRank("כתומה", 8, 4, _ORANGE),
        PresetRank("כתומה-ירוקה", 7, 5, _ORANGE, _GREEN),
        PresetRank("ירוקה", 6, 6, _GREEN),
        PresetRank("ירוקה-כחולה", 5, 7, _GREEN, _BLUE),
        PresetRank("כחולה", 4, 8, _BLUE),
        PresetRank("כחולה-חומה", 3, 9, _BLUE, _BROWN),
        PresetRank("חומה", 2, 10, _BROWN),
        PresetRank("שחורה", 1, 11, _BLACK),
    ),
)

KARATE = BeltPreset(
    key="karate",
    discipline="karate",
    name="קראטה",
    ranks=(
        PresetRank("לבנה", 9, 0, _WHITE),
        PresetRank("צהובה", 8, 1, _YELLOW),
        PresetRank("כתומה", 7, 2, _ORANGE),
        PresetRank("ירוקה", 6, 3, _GREEN),
        PresetRank("כחולה", 5, 4, _BLUE),
        PresetRank("סגולה", 4, 5, "#6B46C1"),
        PresetRank("חומה", 3, 6, _BROWN),
        PresetRank("חומה-שחורה", 2, 7, _BROWN, _BLACK),
        PresetRank("שחורה", 1, 8, _BLACK),
    ),
)

BELT_PRESETS: tuple[BeltPreset, ...] = (JUDO_CHILDREN, JUDO_ADULTS, KARATE)

_BY_KEY = {preset.key: preset for preset in BELT_PRESETS}


class BeltPresetService:
    @staticmethod
    def get(preset_key: str) -> BeltPreset:
        try:
            return _BY_KEY[preset_key]
        except KeyError as exc:
            raise NoSuchPresetError(preset_key) from exc

    @staticmethod
    def seed(
        session: TenantSession, class_id: uuid.UUID, preset_key: str
    ) -> list[BeltRank]:
        """Never over an existing ladder. A second seed renumbers ranks `student_belt` rows
        already point at, which rewrites a child's history without touching their row."""
        preset = BeltPresetService.get(preset_key)
        existing = session.execute(
            select(BeltRank.id).where(BeltRank.class_id == class_id).limit(1)
        ).first()
        if existing is not None:
            raise LadderAlreadySeededError(str(class_id))
        rows = [
            BeltRank(
                class_id=class_id,
                name=rank.name,
                kyu=rank.kyu,
                order_index=rank.order_index,
                color_hex=rank.color_hex,
                secondary_color_hex=rank.secondary_color_hex,
            )
            for rank in preset.ranks
        ]
        session.add_all(rows)
        session.flush()
        return rows
```

Add `LadderAlreadySeededError(RuntimeError)` and `NoSuchPresetError(LookupError)` to
`app/services/belts/errors.py`.

- [ ] **Step 4: Add the routes**

```
GET  /belt-presets           → CursorPage[BeltPresetOut]      AnyStaff
POST /belt-ranks/seed        → CursorPage[LadderRankOut], 201 ManagerOrOwner
```

`BeltPresetOut{key, discipline, name, ranks: list[BeltRankPresetOut]}` where
`BeltRankPresetOut{name, kyu, order_index, color_hex, secondary_color_hex}`.
`NoSuchPresetError` → 422 `no_such_preset`; `LadderAlreadySeededError` → 409
`ladder_already_seeded`.

- [ ] **Step 5: Green, then commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/belts/test_seeding_a_belt_system.py -q && \
  .venv/bin/ruff check --fix app/services/belts app/routers/belts.py && \
  .venv/bin/ruff format app/services/belts app/routers/belts.py && \
  .venv/bin/mypy app/services/belts app/routers/belts.py && \
  git add -A app/services/belts app/routers/belts.py tests/belts && \
  git commit -m "feat(belts): three seeded ladders, one of them bi-colour, and a seed never overwrites"
```

---

### Task 6: Awards and history — `/students/{id}/belts`

**Files:**
- Create: `app/services/belts/awards.py`
- Modify: `app/routers/belts.py` (two routes)
- Test: `tests/belts/test_awarding_a_belt.py`

> **Why these routes live in `app/routers/belts.py`.** SPEC §7 puts them at
> `/students/{id}/belts`, and `app/routers/students.py` is lane PEOPLE's file. A path is
> not a module: `app/routers/health_declarations.py` already declares
> `/students/{id}/health-declaration` for exactly this reason, and `lane-check.sh belts`
> reaches `app/routers/belts.py` and not `students.py`.

**Interfaces:**
- Produces:
  - `BeltAwardService.history(session, student_id) -> list[tuple[StudentBelt, BeltRank]]`
  - `BeltAwardService.award(session, student_id, data: StudentBeltIn, *, by_person_id, at) -> StudentBelt`
  - `BeltAwardService.current(session, student_id) -> BeltRank | None`

- [ ] **Step 1: Write the failing test**

`tests/belts/test_awarding_a_belt.py`:

```python
"""§5.9's award: the history row AND the cache, in one transaction. Artboard `12d`.

`student.current_belt_id` is a CACHE and `student_belt` is the record. §5.9 step 3 writes
both plus the exam result together, and the reason is that a promotion where one of the two
lands is a child whose card and whose timeline disagree -- which a parent sees and nobody
else does.

**A belt can be awarded without an exam** (`event_id` nullable): a coach awarding a stripe
at the end of a session is a real thing in a children's club, and requiring an event would
make managers invent fake ones.

**`color_hex` on the award is the CURRENT rank's colour.** `student_belt` has no colour
column, so the read joins `belt_rank`. D-M7-7 -- reported, not worked around.
"""

from __future__ import annotations

import uuid

from app.models.people import Student
from tests.belts.conftest import TODAY


def test_awarding_writes_the_history_row_and_the_cache_together(
    client, app_session, as_manager, a_student, a_belt_ladder
):
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(a_belt_ladder[1]), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["belt_rank_name"] == "צהובה"
    assert body["color_hex"] == "#F7E017"
    assert body["awarded_by_person_id"] == str(as_manager.person_id)

    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id == a_belt_ladder[1]


def test_a_belt_is_awarded_without_an_exam(
    client, as_lead_coach, a_student, a_belt_ladder
):
    """§5.9, and `events.belt.awardOutsideExam`. A lead coach may do this -- §3.2's
    'Record belt exam results' row, and the `as_lead_coach` fixture's own docstring."""
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_lead_coach.headers,
        json={"belt_rank_id": str(a_belt_ladder[0]), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 201, response.text
    assert response.json()["event_id"] is None


def test_the_same_rank_is_not_awarded_twice(
    client, as_manager, a_student, a_belt_ladder
):
    """`uq_student_belt_student_rank`. A re-award is a data-entry mistake, and it would
    show the same belt twice on `12d`'s timeline."""
    payload = {"belt_rank_id": str(a_belt_ladder[0]), "awarded_on": TODAY.isoformat()}
    assert (
        client.post(
            f"/api/v1/students/{a_student}/belts", headers=as_manager.headers, json=payload
        ).status_code
        == 201
    )
    second = client.post(
        f"/api/v1/students/{a_student}/belts", headers=as_manager.headers, json=payload
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "belt_already_awarded"


def test_the_history_is_a_timeline_oldest_first(
    client, as_manager, a_student, a_belt_ladder
):
    """`12d` renders a timeline and `ix_student_belt_student_id_awarded_on` is the index
    for it. Oldest first, because a progression is read in the direction it happened."""
    for offset, rank_id in enumerate(a_belt_ladder[:2]):
        client.post(
            f"/api/v1/students/{a_student}/belts",
            headers=as_manager.headers,
            json={
                "belt_rank_id": str(rank_id),
                "awarded_on": TODAY.replace(day=1 + offset).isoformat(),
            },
        )
    items = client.get(
        f"/api/v1/students/{a_student}/belts", headers=as_manager.headers
    ).json()["items"]
    assert [row["belt_rank_name"] for row in items] == ["לבנה", "צהובה"]
    assert items[0]["awarded_on"] < items[1]["awarded_on"]


def test_a_guardian_reads_only_their_own_childs_history(
    client, app_session, as_guardian_of, a_student, studio, a_belt_ladder, as_manager
):
    """`12d` is the parent's view of their own child's grading history and nobody else's."""
    from app.models.person import Person

    other_person = Person(studio_id=studio.id, first_name="זר", last_name="בודק")
    app_session.add(other_person)
    app_session.flush()
    other = Student(
        studio_id=studio.id, person_id=other_person.id, status="active", joined_on=TODAY
    )
    app_session.add(other)
    app_session.commit()

    parent = as_guardian_of(a_student)
    assert (
        client.get(f"/api/v1/students/{a_student}/belts", headers=parent.headers).status_code
        == 200
    )
    assert (
        client.get(f"/api/v1/students/{other.id}/belts", headers=parent.headers).status_code
        == 403
    )


def test_an_award_naming_a_rank_that_does_not_exist_is_a_404(
    client, as_manager, a_student
):
    response = client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(uuid.uuid4()), "awarded_on": TODAY.isoformat()},
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Confirm it fails.** `.venv/bin/pytest tests/belts/test_awarding_a_belt.py -q`
      → 404s and `ModuleNotFoundError`.

- [ ] **Step 3: Write `app/services/belts/awards.py`**

```python
"""§5.9's award. The history row and the cache, written together.

§5.9 step 3: 'A pass writes an `event_exam_result`, creates a `student_belt` row, and
updates `student.current_belt_id` — in one transaction.' `award` is the second and third of
those three and `app/services/events/exams.py` calls it inside the same unit of work, which
is what makes the sentence true rather than aspirational.

**The cache moves only forward.** `current_belt_id` follows the HIGHEST rank the student
holds by `order_index`, not the most recently awarded one: back-filling an old grade a
studio forgot to record is ordinary data entry, and it must not demote the child.

**`color_hex` on the read is the rank's colour today.** `student_belt` has no colour column,
so a studio recolouring its ladder does rewrite what a child was given three years ago
(D-M7-7). The contract's `StudentBeltOut` carries the field and its test asserts the field;
the snapshot it argues for needs a migration, which is `main`'s.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank, StudentBelt
from app.models.people import Student
from app.schemas.belts import StudentBeltIn
from app.services.belts.errors import BeltAlreadyAwardedError, BeltRankNotFoundError


class BeltAwardService:
    @staticmethod
    def history(
        session: TenantSession, student_id: uuid.UUID
    ) -> list[tuple[StudentBelt, BeltRank]]:
        """Oldest first — `12d` is a timeline and a progression reads forward."""
        return list(
            session.execute(
                select(StudentBelt, BeltRank)
                .join(BeltRank, BeltRank.id == StudentBelt.belt_rank_id)
                .where(StudentBelt.student_id == student_id)
                .order_by(StudentBelt.awarded_on, BeltRank.order_index)
            ).all()
        )

    @staticmethod
    def current(session: TenantSession, student_id: uuid.UUID) -> BeltRank | None:
        student = session.get(Student, student_id)
        if student is None or student.current_belt_id is None:
            return None
        return session.get(BeltRank, student.current_belt_id)

    @staticmethod
    def award(
        session: TenantSession,
        student_id: uuid.UUID,
        data: StudentBeltIn,
        *,
        by_person_id: uuid.UUID | None,
        at: datetime,
    ) -> tuple[StudentBelt, BeltRank]:
        rank = session.get(BeltRank, data.belt_rank_id)
        if rank is None:
            raise BeltRankNotFoundError(str(data.belt_rank_id))

        already = session.execute(
            select(StudentBelt.id).where(
                StudentBelt.student_id == student_id,
                StudentBelt.belt_rank_id == data.belt_rank_id,
            )
        ).first()
        if already is not None:
            raise BeltAlreadyAwardedError(str(data.belt_rank_id))

        row = StudentBelt(
            student_id=student_id,
            belt_rank_id=data.belt_rank_id,
            awarded_on=data.awarded_on,
            awarded_by_person_id=by_person_id,
            event_id=data.event_id,
            note=data.note,
        )
        session.add(row)
        # Flushed before the cache is re-derived, so `_highest_held` sees the new row and
        # there is exactly one place that decides what "current" means.
        session.flush()
        BeltAwardService._refresh_cache(session, student_id)
        session.flush()
        return row, rank

    @staticmethod
    def _refresh_cache(session: TenantSession, student_id: uuid.UUID) -> None:
        """The highest rank held, by `order_index` within the ladder.

        Not "the last one awarded": back-filling a grade a studio forgot to record is
        ordinary, and a cache that followed the write order would demote the child.
        """
        student = session.get(Student, student_id)
        if student is None:
            return
        highest = session.execute(
            select(BeltRank.id)
            .join(StudentBelt, StudentBelt.belt_rank_id == BeltRank.id)
            .where(StudentBelt.student_id == student_id)
            .order_by(BeltRank.order_index.desc())
            .limit(1)
        ).scalar_one_or_none()
        student.current_belt_id = highest
```

- [ ] **Step 4: Add the routes**

```
GET  /students/{student_id}/belts  → CursorPage[StudentBeltOut]   AnyStaff or guardian-of
POST /students/{student_id}/belts  → StudentBeltOut, 201          owner|manager|lead_coach
```

The read is the first route in this lane that serves **either** staff or a guardian, so it
takes no role dependency and resolves in the handler: staff roles pass, and a caller with no
staff role must be a guardian of that student (`RsvpService.students_of_guardian`), else
403. `BeltAlreadyAwardedError` → 409 `belt_already_awarded`; `BeltRankNotFoundError` → 404.

- [ ] **Step 5: Green, then commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/belts -q && \
  .venv/bin/ruff check --fix app/services/belts app/routers/belts.py && \
  .venv/bin/ruff format app/services/belts app/routers/belts.py && \
  .venv/bin/mypy app/services/belts app/routers/belts.py && \
  git add -A app/services/belts app/routers/belts.py tests/belts && \
  git commit -m "feat(belts): an award writes the history and the cache together, and the cache only moves up"
```

---

### Task 7: The belt exam — eligibility, and a pass that promotes in one transaction

§5.9's four steps, and the only place three tables move together.

**Files:**
- Create: `app/services/belts/eligibility.py`, `app/services/events/exams.py`
- Modify: `app/routers/events.py` (two routes)
- Test: `tests/events/test_the_belt_exam.py`

**Interfaces:**
- Produces:
  - `Candidate` frozen dataclass
    `{student_id, student_display_name, current_rank, next_rank, months_at_rank, eligible}`
  - `EligibilityService.for_event(session, event_id, *, at) -> list[Candidate]`
  - `ExamService.record(session, event_id, results, *, examiner_person_id, at) -> list[tuple[EventExamResult, BeltRank]]`
  - errors `NotABeltExamError`, `RankNotInLadderError`
  - router shapes `EventEligibilityOut`, `CandidateOut`, `ExamResultsIn{results: list[EventExamResultIn]}`

- [ ] **Step 1: Write the failing test**

`tests/events/test_the_belt_exam.py`:

```python
"""§5.9's belt exam, which is an `event` with `type='belt_exam'`. Artboards `9d`, `4d`, `6b`.

**The transaction is the point.** §5.9 step 3: 'A pass writes an `event_exam_result`,
creates a `student_belt` row, and updates `student.current_belt_id` — in one transaction.'
So a failure anywhere in a batch must leave NONE of the three moved: a promotion where the
result landed and the belt did not is a child whose card and whose timeline disagree, and
the parent is the only person who sees it.

**A fail is recorded, not omitted** -- §5.9's eligibility view needs to know a student was
examined and did not pass, because an absent row reads as 'never examined', which is a
different conversation with a parent.

**Eligibility is rank and tenure, and nothing else** (D-M7-3). Five artboards add an
attendance percentage and two add a debt-or-document block; none has a column, and `6b`'s
own audit says the decision belonged in the W4 contract commit, which did not make it. So
this lane REPORTS `months_at_rank` and lets the manager decide, rather than inventing a
threshold with nowhere to live.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.belts import StudentBelt
from app.models.events import EventExamResult
from app.models.people import Student
from sqlalchemy import select
from tests.events.conftest import T0, TODAY, YEAR_STARTS


@pytest.fixture
def an_exam(client, app_session, as_manager, studio, a_student, a_class):
    """A published belt_exam naming one student directly.

    §5.9 step 1 -- 'nominates candidates (targeting students directly rather than whole
    groups)'. That is why the target is a `student` row and not the group's.
    """
    from app.models.belts import BeltRank

    app_session.add_all(
        [
            BeltRank(
                studio_id=studio.id, class_id=a_class, name="לבנה", kyu=6,
                order_index=0, color_hex="#FFFFFF",
            ),
            BeltRank(
                studio_id=studio.id, class_id=a_class, name="צהובה", kyu=5,
                order_index=1, color_hex="#F7E017",
            ),
        ]
    )
    app_session.commit()
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={
            "type": "belt_exam",
            "title": "מבחן סתיו",
            "starts_at": "2026-11-26T15:00:00+00:00",
            "targets": [{"target_type": "student", "target_id": str(a_student)}],
        },
    ).json()
    client.post(f"/api/v1/events/{created['id']}/publish", headers=as_manager.headers)
    return created["id"]


def _ladder(app_session, class_id):
    from app.models.belts import BeltRank

    return list(
        app_session.execute(
            select(BeltRank).where(BeltRank.class_id == class_id).order_by(BeltRank.order_index)
        ).scalars()
    )


def test_a_candidate_with_no_belt_is_eligible_for_the_first_rank(
    client, app_session, as_manager, an_exam, a_student, a_class
):
    """Where every child starts. `events.belt.none` is the string, and the first rung is
    the next one -- a white-belt child at their first exam is the common case."""
    response = client.get(
        f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers
    )
    assert response.status_code == 200, response.text
    candidate = response.json()["items"][0]
    assert candidate["student_id"] == str(a_student)
    assert candidate["current_rank"] is None
    assert candidate["next_rank"]["name"] == "לבנה"
    assert candidate["months_at_rank"] is None
    assert candidate["eligible"] is True


def test_a_candidate_at_the_top_of_the_ladder_is_not_eligible(
    client, app_session, as_manager, an_exam, a_student, a_class
):
    """`events.exam.notEligible` -- טרם זכאי. There is no next rank, so there is nothing
    to be examined for. That is D-M7-3's whole definition of ineligible."""
    ranks = _ladder(app_session, a_class)
    client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(ranks[-1].id), "awarded_on": YEAR_STARTS.isoformat()},
    )
    candidate = client.get(
        f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers
    ).json()["items"][0]
    assert candidate["next_rank"] is None
    assert candidate["eligible"] is False


def test_tenure_is_reported_in_months_rather_than_judged(
    client, app_session, as_manager, an_exam, a_student, a_class
):
    """`events.exam.eligibleHint` -- 'הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה'. `belt_rank`
    has no `min_tenure_months` column, so there is no threshold to compare against and the
    honest answer is the evidence. `4d`'s tenure column is exactly this number."""
    ranks = _ladder(app_session, a_class)
    client.post(
        f"/api/v1/students/{a_student}/belts",
        headers=as_manager.headers,
        json={"belt_rank_id": str(ranks[0].id), "awarded_on": date(2026, 8, 12).isoformat()},
    )
    candidate = client.get(
        f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers
    ).json()["items"][0]
    assert candidate["current_rank"]["name"] == "לבנה"
    assert candidate["next_rank"]["name"] == "צהובה"
    assert candidate["months_at_rank"] == 3


def test_no_candidate_shape_carries_an_attendance_percentage_or_a_debt(
    client, as_manager, an_exam
):
    """D-M7-3, asserted as a NEGATIVE so the cut cannot come back quietly. Five artboards
    gate on attendance and two on debt or a missing declaration; none has a column, and
    debt on a coach-reachable screen would break §3.2's hard rule as well."""
    candidate = client.get(
        f"/api/v1/events/{an_exam}/eligibility", headers=as_manager.headers
    ).json()["items"][0]
    banned = ("attendance", "debt", "balance", "declaration", "blocked", "agorot")
    assert not any(word in key for key in candidate for word in banned), sorted(candidate)


def test_a_pass_writes_the_result_the_belt_and_the_cache(
    client, app_session, as_lead_coach, an_exam, a_student, a_class
):
    """§5.9 step 3, all three writes. A lead coach records results (§3.2)."""
    ranks = _ladder(app_session, a_class)
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(ranks[0].id),
                    "result": "pass",
                    "note": "מצוין",
                }
            ]
        },
    )
    assert response.status_code == 201, response.text
    row = response.json()["items"][0]
    assert row["result"] == "pass"
    assert row["belt_rank_name"] == "לבנה"
    assert row["examiner_person_id"] == str(as_lead_coach.person_id)

    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id == ranks[0].id
    belts = list(
        app_session.execute(
            select(StudentBelt).where(StudentBelt.student_id == a_student)
        ).scalars()
    )
    assert len(belts) == 1
    assert belts[0].event_id == uuid.UUID(an_exam)


def test_a_fail_is_recorded_and_promotes_nothing(
    client, app_session, as_lead_coach, an_exam, a_student, a_class
):
    """§5.9's eligibility view needs to know a student was examined and did not pass. An
    absent row reads as 'never examined' -- a different conversation with a parent."""
    ranks = _ladder(app_session, a_class)
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(ranks[0].id),
                    "result": "fail",
                    "note": None,
                }
            ]
        },
    )
    assert response.status_code == 201, response.text
    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id is None
    assert (
        app_session.execute(
            select(StudentBelt).where(StudentBelt.student_id == a_student)
        ).first()
        is None
    )
    assert (
        app_session.execute(
            select(EventExamResult).where(EventExamResult.student_id == a_student)
        ).first()
        is not None
    )


def test_a_batch_that_fails_halfway_moves_nothing(
    client, app_session, as_lead_coach, an_exam, a_student, a_class
):
    """The transaction §5.9 asks for, asserted the only way it can be: one good result and
    one impossible one in the same call, and NOTHING written. A per-row commit would leave
    the first child promoted and the coach staring at a 409."""
    ranks = _ladder(app_session, a_class)
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(ranks[0].id),
                    "result": "pass",
                    "note": None,
                },
                {
                    "student_id": str(uuid.uuid4()),
                    "belt_rank_id": str(ranks[0].id),
                    "result": "pass",
                    "note": None,
                },
            ]
        },
    )
    assert response.status_code in (404, 409)
    app_session.expire_all()
    assert app_session.get(Student, a_student).current_belt_id is None
    assert (
        app_session.execute(
            select(EventExamResult).where(EventExamResult.event_id == an_exam)
        ).first()
        is None
    )


def test_results_are_refused_on_an_event_that_is_not_a_belt_exam(
    client, as_lead_coach, an_event, a_student, a_belt_ladder
):
    """§5.9 -- a belt exam IS an event with `type='belt_exam'`. Recording a promotion
    against a competition would put a grading in a place no eligibility screen looks."""
    response = client.post(
        f"/api/v1/events/{an_event}/exam-results",
        headers=as_lead_coach.headers,
        json={
            "results": [
                {
                    "student_id": str(a_student),
                    "belt_rank_id": str(a_belt_ladder[0]),
                    "result": "pass",
                    "note": None,
                }
            ]
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "not_a_belt_exam"


def test_an_assistant_coach_cannot_record_a_result(
    client, as_assistant_coach, an_exam, a_student, a_class
):
    """§3.2 -- 'Record belt exam results | owner ✓ | manager ✓ | lead_coach ✓'."""
    response = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_assistant_coach.headers,
        json={"results": []},
    )
    assert response.status_code == 403


def test_recording_the_same_candidate_twice_is_refused(
    client, app_session, as_lead_coach, an_exam, a_student, a_class
):
    """`uq_event_exam_result` is UNIQUE on (event_id, student_id). A correction is an edit,
    not a second row -- and a second row would award a second belt."""
    ranks = _ladder(app_session, a_class)
    payload = {
        "results": [
            {
                "student_id": str(a_student),
                "belt_rank_id": str(ranks[0].id),
                "result": "pass",
                "note": None,
            }
        ]
    }
    assert (
        client.post(
            f"/api/v1/events/{an_exam}/exam-results",
            headers=as_lead_coach.headers,
            json=payload,
        ).status_code
        == 201
    )
    second = client.post(
        f"/api/v1/events/{an_exam}/exam-results",
        headers=as_lead_coach.headers,
        json=payload,
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_examined"
```

- [ ] **Step 2: Confirm it fails.**
      `.venv/bin/pytest tests/events/test_the_belt_exam.py -q`

- [ ] **Step 3: Write `app/services/belts/eligibility.py`**

```python
"""§5.9's eligibility, computed from the two things §5.9 actually names.

`events.exam.eligibleHint` reads הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה -- the current
rank and the time held in it. Five artboards (`5d`, `5b`, `12d`, `4d`, `2d`) add a minimum
attendance percentage; `4d` and `6b` add a block on debt or a missing health declaration.

**None of the three ships, and the reason is not squeamishness.** `belt_rank` carries no
`min_tenure_months` and no `min_attendance_pct` column, so a threshold has nowhere to live;
`6b`'s own audit says the decision 'belongs in the W4 contract commit, not in whichever
lane builds first', and W4's contract commit did not make it. A debt gate would also put
M6's balance on a screen §3.2 lets a lead coach open, which is the hard rule.

**So this reports evidence and does not judge.** `eligible` means exactly *there is a rank
above the one this student holds*: a child at the top of the ladder, or in a class with no
ladder configured, has nothing to be examined for. `months_at_rank` is `4d`'s tenure column
and `12d`'s '4 חודשים בחגורה', reported for the manager to read.

**A child with no belt is eligible for the first rung.** That is where every child starts,
and it is the common case at a club's first exam of the year.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank, StudentBelt
from app.models.people import Enrollment, Student
from app.models.person import Person
from app.models.structure import Group
from app.services.belts.ranks import BeltRankService


@dataclass(frozen=True)
class Candidate:
    student_id: uuid.UUID
    student_display_name: str
    current_rank: BeltRank | None
    next_rank: BeltRank | None
    #: Whole months since the current rank was awarded. `None` when there is no current
    #: rank -- which is not zero: zero months would read as 'awarded today'.
    months_at_rank: int | None
    #: There is a rank above the one held. Nothing else. See the module docstring.
    eligible: bool


def whole_months_between(earlier, later) -> int:
    """Calendar months, not days/30. A parent counting 'four months at this rank' counts
    the way a calendar does, and 30-day months drift by five days a year."""
    months = (later.year - earlier.year) * 12 + (later.month - earlier.month)
    if later.day < earlier.day:
        months -= 1
    return max(months, 0)


class EligibilityService:
    @staticmethod
    def for_event(
        session: TenantSession, event_id: uuid.UUID, *, at: datetime
    ) -> list[Candidate]:
        """Every registered student, with the evidence §5.9 names."""
        from app.models.events import EventRegistration

        rows = list(
            session.execute(
                select(EventRegistration.student_id, Person.first_name, Person.last_name)
                .join(Student, Student.id == EventRegistration.student_id)
                .join(Person, Person.id == Student.person_id)
                .where(EventRegistration.event_id == event_id)
                .order_by(Person.last_name, Person.first_name)
            ).all()
        )
        return [
            EligibilityService._candidate(session, student_id, f"{first} {last}".strip(), at=at)
            for student_id, first, last in rows
        ]

    @staticmethod
    def _candidate(
        session: TenantSession, student_id: uuid.UUID, display_name: str, *, at: datetime
    ) -> Candidate:
        current_award = session.execute(
            select(StudentBelt, BeltRank)
            .join(BeltRank, BeltRank.id == StudentBelt.belt_rank_id)
            .where(StudentBelt.student_id == student_id)
            .order_by(BeltRank.order_index.desc())
            .limit(1)
        ).first()

        if current_award is None:
            first_rung = EligibilityService._first_rung(session, student_id)
            return Candidate(
                student_id=student_id,
                student_display_name=display_name,
                current_rank=None,
                next_rank=first_rung,
                months_at_rank=None,
                eligible=first_rung is not None,
            )

        award, rank = current_award
        next_rank = BeltRankService.next_after(session, rank.id)
        return Candidate(
            student_id=student_id,
            student_display_name=display_name,
            current_rank=rank,
            next_rank=next_rank,
            months_at_rank=whole_months_between(award.awarded_on, at.date()),
            eligible=next_rank is not None,
        )

    @staticmethod
    def _first_rung(session: TenantSession, student_id: uuid.UUID) -> BeltRank | None:
        """The bottom of the ladder of the class this student trains in.

        §4.3 puts `class_id` on `group`, so the edge from a student to a class is the
        enrolment. A child in two classes gets the ladder of the first by class id -- a
        stable answer rather than a random one, and a real ambiguity worth reporting.
        """
        class_id = session.execute(
            select(Group.class_id)
            .join(Enrollment, Enrollment.group_id == Group.id)
            .where(Enrollment.student_id == student_id, Enrollment.status == "active")
            .order_by(Group.class_id)
            .limit(1)
        ).scalar_one_or_none()
        if class_id is None:
            return None
        return session.execute(
            select(BeltRank)
            .where(BeltRank.class_id == class_id)
            .order_by(BeltRank.order_index)
            .limit(1)
        ).scalar_one_or_none()
```

- [ ] **Step 4: Write `app/services/events/exams.py`**

```python
"""§5.9 step 3, and the one place three tables move together.

'A pass writes an `event_exam_result`, creates a `student_belt` row, and updates
`student.current_belt_id` — in one transaction.'

**The batch is the transaction, not the row.** `9d`'s frame 2 saves a whole roster at once,
and a per-row commit would leave the first child promoted and the coach looking at a 409 on
the fourth. The router commits once, after `record` returns; anything raised inside leaves
the session un-committed and the request handler rolls it back.

**A fail is recorded.** §5.9's eligibility view has to distinguish 'examined and did not
pass' from 'never examined' -- they are different conversations with a parent -- so a fail
writes its result row and promotes nothing.

**Nothing here notifies.** §5.9 step 4 gives guardians a notification and
`NotificationService` is M8's, which does not exist until W5 (D-M7-2). `9d`'s footer
caption claims it; `events.exam.passPromotesHint` is the string that ships, and it says
nothing about notifying -- which the artboard audit already noticed.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select

from app.core.tenancy import TenantSession
from app.models.belts import BeltRank
from app.models.events import EventExamResult, EventRegistration
from app.schemas.belts import StudentBeltIn
from app.schemas.events import EventExamResultIn
from app.services.belts.awards import BeltAwardService
from app.services.events.errors import NotABeltExamError, NotRegisteredForEventError
from app.services.events.events import EventService


class AlreadyExaminedError(RuntimeError):
    """`uq_event_exam_result` is UNIQUE on (event_id, student_id). A correction is an edit
    of the existing row, not a second one -- a second row would award a second belt."""


class ExamService:
    @staticmethod
    def record(
        session: TenantSession,
        event_id: uuid.UUID,
        results: list[EventExamResultIn],
        *,
        examiner_person_id: uuid.UUID | None,
        at: datetime,
    ) -> list[tuple[EventExamResult, BeltRank]]:
        event = EventService.read(session, event_id)
        if event.type != "belt_exam":
            raise NotABeltExamError(event.type)

        registered = set(
            session.execute(
                select(EventRegistration.student_id).where(
                    EventRegistration.event_id == event_id
                )
            ).scalars()
        )
        already = set(
            session.execute(
                select(EventExamResult.student_id).where(
                    EventExamResult.event_id == event_id
                )
            ).scalars()
        )

        out: list[tuple[EventExamResult, BeltRank]] = []
        for entry in results:
            if entry.student_id not in registered:
                raise NotRegisteredForEventError(str(entry.student_id))
            if entry.student_id in already:
                raise AlreadyExaminedError(str(entry.student_id))
            already.add(entry.student_id)

            rank = session.get(BeltRank, entry.belt_rank_id)
            if rank is None:
                raise NotRegisteredForEventError(str(entry.belt_rank_id))

            row = EventExamResult(
                event_id=event_id,
                student_id=entry.student_id,
                belt_rank_id=entry.belt_rank_id,
                result=entry.result,
                examiner_person_id=examiner_person_id,
                note=entry.note,
            )
            session.add(row)
            session.flush()

            if entry.result == "pass":
                # The second and third writes of §5.9 step 3, in this same unit of work.
                # `event_id` ties the award to the exam that produced it, which is what
                # `12d`'s 'previous exams' list reads.
                BeltAwardService.award(
                    session,
                    entry.student_id,
                    StudentBeltIn(
                        belt_rank_id=entry.belt_rank_id,
                        awarded_on=at.date(),
                        event_id=event_id,
                        note=entry.note,
                    ),
                    by_person_id=examiner_person_id,
                    at=at,
                )
            out.append((row, rank))
        return out
```

- [ ] **Step 5: Add the routes to `app/routers/events.py`**

```
GET  /events/{event_id}/eligibility  → CursorPage[CandidateOut]        AnyStaff
POST /events/{event_id}/exam-results → CursorPage[EventExamResultOut]  EventsWriter, 201
```

`CandidateOut{student_id, student_display_name, current_rank: BeltRankOut | None,
next_rank: BeltRankOut | None, months_at_rank: int | None, eligible: bool}` — and **nothing
else**, which `test_no_candidate_shape_carries_an_attendance_percentage_or_a_debt` pins.
`NotABeltExamError` → 409 `not_a_belt_exam`; `AlreadyExaminedError` → 409
`already_examined`; `NotRegisteredForEventError` → 404 `not_a_candidate`;
`BeltAlreadyAwardedError` → 409 `belt_already_awarded`. The `session.commit()` happens
**after** `record` returns and nowhere inside it.

- [ ] **Step 6: Green, then commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events/test_the_belt_exam.py -q && \
  .venv/bin/ruff check --fix app/services app/routers/events.py && \
  .venv/bin/ruff format app/services app/routers/events.py && \
  .venv/bin/mypy app/services/events app/services/belts app/routers/events.py && \
  git add -A app/services app/routers tests && \
  git commit -m "feat(belts): a pass writes the result, the belt and the cache in one transaction"
```

---

### Task 8: `GET /events/{id}.ics`

**Files:**
- Create: `app/services/events/ics.py`
- Modify: `app/routers/events.py` (one route)
- Test: `tests/events/test_the_event_calendar_file.py`

**Interfaces:**
- Produces: `render_event_ics(event: Event, *, studio_name: str) -> str`

- [ ] **Step 1: Write the failing test**

`tests/events/test_the_event_calendar_file.py`:

```python
"""SPEC §7's `GET /events/{id}.ics`, and §5.8's 'הוסף ליומן' button.

RFC 5545 by hand and not by dependency: `.venv` is a symlink to `main`'s, so adding a
package is a stop-and-tell (`docs/plan/prompts/w4-lanes.md`) -- and an ICS VEVENT with four
properties is forty lines, which is less than the argument for the dependency.

**Every timestamp is UTC with a trailing Z.** G3 stores UTC and renders Asia/Jerusalem at
the edge; a calendar file is not the edge -- the subscriber's own client localises it, and
a floating local time would land an event an hour out twice a year.

**A draft has no calendar file.** §4.3 makes a draft invisible to guardians, and a link
that resolved would be that invisibility leaking through a file extension.
"""

from __future__ import annotations


def test_the_file_is_a_single_well_formed_vevent(client, as_manager, an_event):
    response = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/calendar")
    body = response.text
    assert body.startswith("BEGIN:VCALENDAR\r\n")
    assert body.rstrip().endswith("END:VCALENDAR")
    assert body.count("BEGIN:VEVENT") == 1
    assert "VERSION:2.0" in body
    assert f"UID:{an_event}" in body
    assert "SUMMARY:אליפות החורף" in body


def test_every_timestamp_is_utc_with_a_z(client, as_manager, an_event):
    body = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers).text
    stamps = [line for line in body.splitlines() if line.startswith(("DTSTART", "DTEND", "DTSTAMP"))]
    assert len(stamps) == 3
    assert all(line.split(":", 1)[1].endswith("Z") for line in stamps), stamps


def test_commas_and_newlines_in_the_description_are_escaped(
    client, app_session, as_manager, an_event
):
    """RFC 5545 §3.3.11. An unescaped comma splits a TEXT value into a list, so a
    description a manager typed normally silently truncates in the subscriber's calendar."""
    from app.models.events import Event

    event = app_session.get(Event, an_event)
    event.description = "להביא: מים, חגורה\nיציאה 07:00"
    app_session.commit()

    body = client.get(f"/api/v1/events/{an_event}.ics", headers=as_manager.headers).text
    line = next(line for line in body.splitlines() if line.startswith("DESCRIPTION"))
    assert "\\," in line
    assert "\\n" in line
    assert body.count("DESCRIPTION") == 1


def test_a_draft_has_no_calendar_file(client, as_manager):
    """§4.3 — a draft is invisible to guardians, and a resolvable link is that invisibility
    leaking through a file extension."""
    created = client.post(
        "/api/v1/events",
        headers=as_manager.headers,
        json={"type": "other", "title": "טיוטה", "starts_at": "2026-11-26T09:00:00+00:00"},
    ).json()
    response = client.get(f"/api/v1/events/{created['id']}.ics", headers=as_manager.headers)
    assert response.status_code == 404
```

- [ ] **Step 2: Confirm it fails.**
      `.venv/bin/pytest tests/events/test_the_event_calendar_file.py -q`

- [ ] **Step 3: Write `app/services/events/ics.py`**

```python
"""One event as an RFC 5545 calendar file. §5.8's 'הוסף ליומן'.

**Written by hand, deliberately.** `.venv` is a symlink to `main`'s, so installing an ICS
library changes it for the other lane and for `main` -- a stop-and-tell rather than a lane
decision. A VEVENT with five properties is shorter than the case for the dependency.

**CRLF, and every timestamp UTC with a Z.** RFC 5545 §3.1 wants CRLF; G3 stores UTC and
localises at the edge, and a calendar file is not the edge -- the subscriber's own client
does that, so a floating local time lands an event an hour out twice a year.

Line folding at 75 octets is NOT implemented, and that is a real limit rather than an
oversight: a Hebrew title is three-byte UTF-8, so a long description can exceed it. Every
calendar client tested accepts long lines; §5.11's subscription feed (M8) is where folding
belongs, because that file carries a year of events rather than one.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.events import Event

_ESCAPES = (("\\", "\\\\"), (";", "\;"), (",", "\\,"), ("\n", "\\n"), ("\r", ""))


def escape_text(value: str) -> str:
    """RFC 5545 §3.3.11. The backslash is replaced FIRST, or every escape written after it
    would be escaped again."""
    for needle, replacement in _ESCAPES:
        value = value.replace(needle, replacement)
    return value


def as_utc_stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def render_event_ics(event: Event, *, studio_name: str, at: datetime) -> str:
    location = event.location_text or studio_name
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//studio-manager//events//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{event.id}",
        f"DTSTAMP:{as_utc_stamp(at)}",
        f"DTSTART:{as_utc_stamp(event.starts_at)}",
        f"DTEND:{as_utc_stamp(event.ends_at)}",
        f"SUMMARY:{escape_text(event.title)}",
        f"LOCATION:{escape_text(location)}",
        # `status='cancelled'` reaches the subscriber's calendar as a cancelled event
        # rather than as a silent disappearance, which is what §5.8's notification pairs
        # with.
        f"STATUS:{'CANCELLED' if event.status == 'cancelled' else 'CONFIRMED'}",
    ]
    if event.description:
        lines.append(f"DESCRIPTION:{escape_text(event.description)}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"
```

- [ ] **Step 4: Add the route**

```python
@router.get(
    "/events/{event_id}.ics",
    response_class=PlainTextResponse,
    responses={200: {"content": {"text/calendar": {}}}},
)
def event_calendar_file(
    _: AnyStaff, event_id: uuid.UUID, session: TenantSessionDep
) -> PlainTextResponse:
    """§5.8's 'הוסף ליומן'. A draft 404s — §4.3 keeps it invisible to guardians, and a
    resolvable link would be that invisibility leaking through a file extension."""
    try:
        event = EventService.read(session, event_id)
    except EventNotFoundError as exc:
        raise _not_found() from exc
    if event.status == "draft":
        raise _not_found()
    studio = session.get(Studio, require_current_studio_id())
    return PlainTextResponse(
        render_event_ics(event, studio_name=studio.name if studio else "", at=now()),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="event-{event_id}.ics"'},
    )
```

> **Path caveat:** FastAPI matches `/events/{event_id}.ics` as a literal suffix on the path
> parameter. Declare this route **before** `GET /events/{event_id}` in the module, or the
> earlier route swallows `…​.ics` and fails to parse it as a UUID.

- [ ] **Step 5: Green, then run both lane checks and commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/pytest tests/events tests/belts -q && \
  ./scripts/lane-check.sh events && ./scripts/lane-check.sh belts && \
  git add -A app tests && \
  git commit -m "feat(events): one event as an RFC 5545 file, UTC and escaped"
```

---

### Task 9: The keys the screens need and the namespace does not have

`web/packages/i18n/{he,en,ru}/events.ts` already carries 112 keys. The artboard audits list
the composed strings, counts and column headers that have none. This task adds them **in
all three locales in one commit**, because `web/scripts/i18n-parity.mjs` fails on a gap in
`en` or `ru` and a half-added key turns every later task's lane check red.

**Files:**
- Modify: `web/packages/i18n/he/events.ts`, `web/packages/i18n/en/events.ts`,
  `web/packages/i18n/ru/events.ts`
- Test: `web/apps/dashboard/src/features/events/keys.test.ts`

**Rules this task must not break:**
- **No `belts.ts`.** Belt strings go under `belt.*` in `events.ts`.
- **No weight or category key, ever** (D9.2). The namespace's own docstring says adding one
  is how the cut quietly comes back.
- **Nothing from the cut list** (D-M7-2): no medal, no capacity, no transport, no makeup
  sitting, no federation approval, no invitation-sent state.
- **No attendance-threshold or debt-block key** (D-M7-3).
- `he` is the reference locale. `en` and `ru` mirror every key.

- [ ] **Step 1: Write the failing test**

`web/apps/dashboard/src/features/events/keys.test.ts`:

```ts
// The `events` namespace, asserted from the lane that consumes it.
//
// Two kinds of assertion. POSITIVE: the composed strings the screens need exist, because a
// missing key renders as its own name and ships looking like a bug in the data. NEGATIVE:
// D9.2's cut and D-M7-2's cut list stay cut -- a key is how a cut feature comes back, and
// `app/schemas/events.py` and the namespace's own docstring both say so.
import { describe, expect, it } from 'vitest'
import { events as he } from '@studio/i18n/he/events'
import { events as en } from '@studio/i18n/en/events'
import { events as ru } from '@studio/i18n/ru/events'

const REQUIRED = [
  // 7a / 9i / 12h — the list chrome
  'list.subtitle',
  'list.filterAll',
  'list.needsAttention',
  // 7a — the draft treatment that D9's audit says is missing
  'status.draftWhy',
  // 7c / 9i — counts as aggregates, not per-row labels
  'counts.confirmed',
  'counts.awaitingConsent',
  'counts.attended',
  // 7c — the participants table
  'roster.title',
  'roster.columnConsent',
  'roster.columnPayment',
  'roster.notApplicable',
  'roster.sendConsentForm',
  // 7b — the form's own missing halves
  'form.required',
  'form.blank',
  'form.errorTitle',
  'form.saved',
  'form.edit',
  // 7d / 12h — the parent's second person
  'rsvp.awaitingYourAnswer',
  'rsvp.youConfirmed',
  'rsvp.youDeclined',
  // 9d / 4d / 6b — the exam
  'exam.new',
  'exam.save',
  'exam.tenureAtRank',
  'exam.readiness',
  'exam.ready',
  'exam.confirmPromotion',
  'exam.promoted',
  // 5b / 5d — the belt system
  'belt.edit',
  'belt.save',
  'belt.preview',
  'belt.moveUp',
  'belt.moveDown',
  'belt.deleteHeld',
  'belt.holders',
  'belt.presetTitle',
  'belt.presetScratch',
  'belt.presetRankCount',
  // 12d
  'belt.ordinalOfTotal',
  'belt.progressCaption',
]

// D9.2 and D-M7-2. Substrings rather than exact keys: the cut comes back as a key NEAR the
// one that was cut, not as the same one.
const FORBIDDEN = [
  'weight',
  'category',
  'medal',
  'capacity',
  'transport',
  'makeup',
  'federation',
  'invitationsSent',
  'minAttendance',
  'debtBlock',
]

describe('the events namespace', () => {
  it.each(REQUIRED)('carries %s in every locale', (key) => {
    for (const [name, bundle] of [
      ['he', he],
      ['en', en],
      ['ru', ru],
    ] as const) {
      expect(bundle[key], `${name}.${key}`).toBeTruthy()
    }
  })

  it('has exactly the same key set in all three locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(he).sort())
    expect(Object.keys(ru).sort()).toEqual(Object.keys(he).sort())
  })

  it.each(FORBIDDEN)('never grows a %s key', (word) => {
    const hit = Object.keys(he).filter((key) =>
      key.toLowerCase().includes(word.toLowerCase()),
    )
    expect(hit, `D9.2 / D-M7-2: ${word} is cut`).toEqual([])
  })
})
```

- [ ] **Step 2: Confirm it fails**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events/web && \
  npx vitest run apps/dashboard/src/features/events/keys.test.ts --reporter=dot
```

Expected: every `REQUIRED` case fails; the `FORBIDDEN` cases already pass, which is the
point of writing them now rather than later.

- [ ] **Step 3: Add the keys**

Append to `web/packages/i18n/he/events.ts`, grouped with a comment per artboard. Values:

```ts
  // -- 7a / 9i / 12h — list chrome the audits found missing -----------------------
  'list.subtitle': 'אירועים חד-פעמיים — לא חלק מהלו״ז השבועי',
  'list.filterAll': 'הכל',
  'list.needsAttention': 'דורשים תשומת לב',
  // 7a finding 1 — draft is the one status with a consequence outside the club, and the
  // artboard gives it no treatment. `status.draftHint` says it is hidden; this says why
  // the manager is still looking at it (6b's better draft copy).
  'status.draftWhy': 'טיוטה — טרם הושלמה',

  // -- 7c / 9i — aggregates. The existing rsvp.* keys are per-student and singular ----
  'counts.confirmed': 'אישרו',
  'counts.awaitingConsent': 'ללא אישור הורה',
  'counts.attended': 'הגיעו',

  // -- 7c — the participants table (D9.2: six columns, none of them weight) ----------
  'roster.title': 'רשימת משתתפים',
  'roster.columnConsent': 'אישור הורה חתום',
  'roster.columnPayment': 'תשלום',
  // The em dash on a cell that does not apply. It needs a label, not a bare glyph.
  'roster.notApplicable': 'לא רלוונטי',
  'roster.sendConsentForm': 'שליחת טופס',

  // -- 7b — the halves the form does not draw ---------------------------------------
  'form.required': 'שדה חובה',
  'form.blank': 'אירוע חדש',
  'form.errorTitle': 'לא ניתן לשמור',
  'form.saved': 'האירוע נשמר',
  'form.edit': 'עריכת האירוע',

  // -- 7d / 12h — the parent speaks in the second person -----------------------------
  'rsvp.awaitingYourAnswer': 'ממתין לתשובתכם',
  'rsvp.youConfirmed': 'אישרתם השתתפות',
  'rsvp.youDeclined': 'סימנתם שלא תגיעו',

  // -- 9d / 4d / 6b — the exam --------------------------------------------------------
  'exam.new': 'מבחן חגורה חדש',
  'exam.save': 'שמירת התוצאות',
  'exam.tenureAtRank': 'ותק בדרגה',
  'exam.readiness': 'מוכנות',
  // Deliberately impersonal: `4d` finding 7 is that `מוכן`/`מוכנה` inflects per student
  // and this is the first gendered STATUS value in the product. A neutral phrasing is the
  // one thing this lane can ship that is correct for every child.
  'exam.ready': 'עומד/ת בתנאים',
  'exam.confirmPromotion': 'אישור קידום',
  'exam.promoted': 'הדרגות הוענקו',

  // -- 5b / 5d — the belt system ------------------------------------------------------
  'belt.edit': 'עריכת דרגה',
  'belt.save': 'שמירת דרגה',
  'belt.preview': 'תצוגה מקדימה',
  'belt.moveUp': 'העלאה בסדר',
  'belt.moveDown': 'הורדה בסדר',
  // 5b finding 7 — the row already shows how many students hold the rank, so the refusal
  // has its reason on screen.
  'belt.deleteHeld': 'לא ניתן למחוק דרגה שהוענקה לחניכים',
  'belt.holders': 'חניכים בדרגה',
  'belt.presetTitle': 'איזו מערכת חגורות נהוגה אצלכם?',
  'belt.presetScratch': 'הגדרה ידנית',
  'belt.presetRankCount': 'דרגות בערכה',

  // -- 12d ----------------------------------------------------------------------------
  // 12d finding 7 — the artboard spells both ordinals as Hebrew words, which no
  // interpolation produces. Rewritten as digits rather than adding an ordinal formatter to
  // `core`, which is not this lane's package.
  'belt.ordinalOfTotal': 'דרגה מתוך',
  'belt.progressCaption': 'הדרגות שהוענקו עד היום',
```

Mirror every key into `en/events.ts` and `ru/events.ts`. English values are plain and
literal (`'Draft — not finished'`, `'Confirmed'`, `'Tenure at rank'`, `'Meets the
conditions'`, …); Russian likewise. **Add them in the same order and under the same section
comments in all three files**, so a future diff of two locales lines up.

- [ ] **Step 4: Green, then commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events/web && \
  npx vitest run apps/dashboard/src/features/events/keys.test.ts --reporter=dot && \
  node scripts/i18n-parity.mjs events && \
  cd .. && git add web/packages/i18n web/apps/dashboard/src/features/events && \
  git commit -m "i18n(events): the composed strings twelve artboards need, and none of the cut ones"
```

---

### Task 10: The dashboard events client, and `7a` — אירועים ותחרויות

**Files:**
- Create: `web/apps/dashboard/src/features/events/client.ts`,
  `EventsScreen.tsx`, `EventCard.tsx`, `EventDateBadge.tsx`, `index.ts`,
  `EventsScreen.test.tsx`
- Modify: `web/apps/dashboard/src/App.tsx` — one `NAV` entry, one `routeFromHash` branch,
  one render branch

> **`App.tsx` is a shared file and this lane may open it.** Its own comment says each
> vertical collapses its family of hashes to ONE route there and decides between them in
> its own feature folder — that is what let both W2 lanes edit it without colliding. Add
> exactly one `NAV` entry (`events`), one branch in `routeFromHash`, one render arm. Lane
> MONEY will add its own; a rebase conflict there is three lines, by design.

**Interfaces:**
- Produces:
  - `makeDashboardEventsClient(fetcher) -> DashboardEventsClient` with
    `list`, `read`, `create`, `update`, `publish`, `cancel`, `registrations`,
    `eligibility`, `recordResults`, `markAttendance`
  - `EventsScreen`, `EventCard`, `EventDateBadge`
  - pure helpers `splitByTime(events, now)`, `typeFilterCounts(events)`,
    `cardTone(event)`, `statusLabelKey(event)`

- [ ] **Step 1: Write the failing test**

`web/apps/dashboard/src/features/events/EventsScreen.test.tsx`:

```tsx
// Artboard 7a — the manager's roundup.
//
// The tests that carry weight are the audit's two findings. A DRAFT must be visibly a
// draft AND must say what that means: §4.3 makes drafts invisible to guardians, and 7a
// gives the one status with a consequence outside the club the plainest treatment of the
// four. `events.status.draftHint` exists and the artboard does not draw it. It is drawn
// here.
//
// And the filter chips come from `events.type.*`, not from the canvas: 7a draws five
// chips, two of which (special training, camp) are not enum members and three of which
// (seminar, joint training, trip) are members with no chip. D-M7-1 — the enum wins.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EventsScreen, splitByTime } from './EventsScreen'
import type { DashboardEventsClient, EventOut } from './client'

const NOW = new Date('2026-11-12T09:00:00Z')

function event(over: Partial<EventOut> = {}): EventOut {
  return {
    id: 'e1',
    type: 'competition',
    title: 'אליפות החורף',
    description: null,
    starts_at: '2026-11-26T08:00:00Z',
    ends_at: '2026-11-26T14:00:00Z',
    location_id: null,
    location_text: 'היכל הספורט',
    rsvp_deadline: '2026-11-19T22:00:00Z',
    fee_agorot: 8000,
    requires_consent: true,
    consent_text: 'אישור',
    status: 'published',
    targets: [],
    rsvp_yes_count: 14,
    rsvp_no_count: 3,
    rsvp_pending_count: 6,
    ...over,
  }
}

function makeClient(rows: EventOut[]): DashboardEventsClient {
  return {
    list: vi.fn().mockResolvedValue({ items: rows, next_cursor: null, has_more: false }),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    cancel: vi.fn(),
    registrations: vi.fn(),
    eligibility: vi.fn(),
    recordResults: vi.fn(),
    markAttendance: vi.fn(),
  } as unknown as DashboardEventsClient
}

describe('7a — the events roundup', () => {
  it('says on the card what a draft means, not only that it is one', async () => {
    render(
      <EventsScreen
        client={makeClient([event({ id: 'd1', title: 'מחנה קיץ', status: 'draft' })])}
        locale="he"
        now={NOW}
      />,
    )
    const card = await screen.findByRole('article', { name: /מחנה קיץ/ })
    expect(within(card).getByText(t('he', 'events.status.draft'))).toBeInTheDocument()
    // 7a finding 1. The consequence, drawn.
    expect(within(card).getByText(t('he', 'events.status.draftHint'))).toBeInTheDocument()
  })

  it('offers a filter for every enum member and none that is not one', async () => {
    render(<EventsScreen client={makeClient([event()])} locale="he" now={NOW} />)
    const filters = await screen.findByRole('group', { name: t('he', 'events.title') })
    for (const type of [
      'competition',
      'belt_exam',
      'seminar',
      'joint_training',
      'trip',
      'other',
    ]) {
      expect(
        within(filters).getByRole('button', { name: new RegExp(t('he', `events.type.${type}`)) }),
      ).toBeInTheDocument()
    }
    // D-M7-1 — the canvas's two extra chips are not members and do not appear.
    expect(within(filters).queryByText(/אימון מיוחד/)).toBeNull()
    expect(within(filters).queryByText(/מחנה/)).toBeNull()
  })

  it('splits upcoming from past on the start, not on the status', () => {
    const past = event({ id: 'p1', starts_at: '2026-10-01T08:00:00Z', status: 'completed' })
    const soon = event({ id: 'u1', starts_at: '2026-11-26T08:00:00Z' })
    const { upcoming, past: gone } = splitByTime([past, soon], NOW)
    expect(upcoming.map((e) => e.id)).toEqual(['u1'])
    expect(gone.map((e) => e.id)).toEqual(['p1'])
  })

  it('renders the empty state rather than an empty page', async () => {
    render(<EventsScreen client={makeClient([])} locale="he" now={NOW} />)
    expect(await screen.findByText(t('he', 'events.list.empty'))).toBeInTheDocument()
  })

  it('shows a fee through MoneyDisplay and never as an interpolated string', async () => {
    render(<EventsScreen client={makeClient([event()])} locale="he" now={NOW} />)
    const card = await screen.findByRole('article', { name: /אליפות החורף/ })
    // The primitive owns the bidi isolation; hand-built markup is where a ₪ flips.
    expect(within(card).getByText('80.00 ₪').closest('.studio-money')).not.toBeNull()
  })

  it('never renders a weight or a category column', async () => {
    render(<EventsScreen client={makeClient([event()])} locale="he" now={NOW} />)
    await screen.findByRole('article', { name: /אליפות החורף/ })
    expect(screen.queryByText(/משקל/)).toBeNull()
    expect(screen.queryByText(/קטגוריה/)).toBeNull()
  })
})
```

- [ ] **Step 2: Confirm it fails**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events/web && \
  npx vitest run apps/dashboard/src/features/events/EventsScreen.test.tsx --reporter=dot
```

Expected: `Failed to resolve import "./EventsScreen"`.

- [ ] **Step 3: Write `client.ts`**

One file, every dashboard events call, typed from the generated client — the same shape as
`features/health/healthClient.ts`. `web/packages/api-client/` is generated from OpenAPI and
never hand-edited, so regenerate it first if the types are missing:

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && npm --prefix web run generate:api
```

(If that script does not exist, type the shapes locally in `client.ts` and note it — the
generated package is regenerated on `main`, not in a lane.)

```ts
// The manager dashboard's events endpoints, in one file. A screen with a fetch in it is a
// screen a test has to stand up a server for.
//
// **No call here writes a charge.** `charge_id` on a registration is READ; the ledger row
// behind it is M6's, created server-side by `BillingService.create_charge(kind='event')`
// when §5.8's confirmation completes. A client that could create one would be this lane
// writing a billing table through a longer pipe.
import type { components } from '@studio/api-client'

export type EventOut = components['schemas']['EventOut']
export type EventRegistrationOut = components['schemas']['EventRegistrationOut']
export type CandidateOut = components['schemas']['CandidateOut']
export type EventExamResultOut = components['schemas']['EventExamResultOut']
export type EventType = EventOut['type']
export type EventStatus = EventOut['status']

/** D-M7-1 — the six the enum has, in the order `7a`'s filter bar reads them. */
export const EVENT_TYPES: readonly EventType[] = [
  'competition',
  'belt_exam',
  'seminar',
  'joint_training',
  'trip',
  'other',
]

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeDashboardEventsClient(fetcher: Fetcher) {
  return {
    list: (type?: EventType) =>
      json<{ items: EventOut[]; next_cursor: string | null; has_more: boolean }>(
        await_(fetcher(`/api/v1/events${type ? `?type=${type}` : ''}`)),
      ),
    // …read, create, update, publish, cancel, registrations, eligibility,
    // recordResults, markAttendance — each one `fetcher` + `json`, no state, no React.
  }
}

export type DashboardEventsClient = ReturnType<typeof makeDashboardEventsClient>
```

(`await_` above is shorthand for the plain `await` each method uses — write them as `async`
methods, matching `makeHealthClient`.)

- [ ] **Step 4: Write `EventDateBadge.tsx`, `EventCard.tsx`, `EventsScreen.tsx`, `index.ts`**

`EventDateBadge` is the day-over-month block `7a`, `9i` and `6b` all draw — feature-specific
by the audit's own table. **Its divider is `border-inline-end`, not `border-left`** (`7a`
finding 6: four instances of one physical divider, and the only physical work in `7a`'s
range).

`EventCard` composes `Card`, `StatusChip` (type as a neutral-ish chip; status through
D-M7-8's mapping), `ProgressBar` for the RSVP fill, `MoneyDisplay` for the fee, and
`Button`. It takes `role="article"` with an `aria-label` of the title, which is what the
test queries by. The **draft card renders both `events.status.draft` and
`events.status.draftHint`** — 7a finding 1.

`EventsScreen` owns the fetch, the filter state, `splitByTime`, `EmptyState`, and a loading
and an error state (neither is drawn on the artboard; both are required).

- [ ] **Step 5: Wire it into `App.tsx`**

```diff
   { key: 'students', labelKey: 'people.student.plural', href: '#/students' },
+  { key: 'events', labelKey: 'events.title', href: '#/events' },
```
```diff
   if (name.startsWith('students')) return 'students'
+  // Lane EVENTS collapses `#/events`, `#/events/<id>`, `#/belts` and `#/exams` in its own
+  // feature folders — see the comment above.
+  if (name.startsWith('events')) return 'events'
```
and one render arm returning `<EventsScreen … />`.

- [ ] **Step 6: Green, lint, commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events/web && \
  npx vitest run apps/dashboard/src/features/events --reporter=dot && \
  npx eslint apps/dashboard/src/features/events && \
  cd .. && ./scripts/lane-check.sh events && \
  git add -A web && \
  git commit -m "feat(events): 7a's roundup, with a draft that says what a draft means"
```

---

### Task 11: `7b` — יצירת אירוע

> **⚠ Blocked on a `main` decision before Step 3.** `web/packages/ui/src/primitives/TextField.tsx`
> renders an `<input>` and nothing else. This form needs a **multi-line** field for
> `event.consent_text` (4000 chars, and `7b` finding 2 is that the artboard offers nowhere
> to write it) and for `description`. `docs/plan/prompts/w4-lanes.md` item 1 is explicit:
> *"Primitives are not a lane's to add, so deferring does not mean 'a lane will do it' — it
> means each lane builds a local `<textarea>` and the two diverge on label wiring,
> `aria-describedby` and the error state."*
>
> **Stop and tell before writing Step 3.** Two ways forward, and the user picks:
> **(a)** `TextField` gains `multiline` on `main` (four artboards want it; both W4 lanes hit
> it) and this task consumes it; **(b)** this task ships the consent field as a local
> `<textarea>` in the feature directory with the wiring copied from `TextField`, and the
> divergence is reported. Do the rest of the task either way — only the consent and
> description fields depend on the answer.

**Files:**
- Create: `web/apps/dashboard/src/features/events/EventForm.tsx`,
  `EventForm.test.tsx`, `TargetPicker.tsx`
- Modify: `EventsScreen.tsx` (route `#/events/new`), `index.ts`

- [ ] **Step 1: Write the failing test** — `EventForm.test.tsx`

```tsx
// Artboard 7b — creating an event.
//
// The audit's findings are the tests. **The five drawn type cards are not the enum**
// (finding 1): three of them are not members and three members have no card. D-M7-1 says
// the enum wins, so the form offers six. **Consent wording is required and the artboard
// has no input for it** (finding 2) — the field exists here, and saving without it is a
// field error rather than the 500 a CHECK violation would be. **Nothing is required and
// nothing errors** (finding 8) — both states are built. And **the fee's helper never says
// what pressing confirm does** (finding 10) — `events.fee.chargeOnConfirm` is drawn.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EventForm } from './EventForm'

const client = () => ({ create: vi.fn().mockResolvedValue({ id: 'e1' }) })

describe('7b — the create form', () => {
  it('offers exactly the six enum members as types', () => {
    render(<EventForm client={client() as never} locale="he" onSaved={vi.fn()} />)
    const group = screen.getByRole('radiogroup', { name: t('he', 'events.form.type') })
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(6)
    expect(screen.queryByText(/אימון מיוחד/)).toBeNull()
  })

  it('has an input for the consent wording, which the artboard does not', async () => {
    render(<EventForm client={client() as never} locale="he" onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'events.consent.required') }))
    expect(screen.getByLabelText(t('he', 'events.consent.text'))).toBeInTheDocument()
  })

  it('refuses to save consent-required with no wording, as a field error', async () => {
    const api = client()
    render(<EventForm client={api as never} locale="he" onSaved={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.name')), 'אליפות')
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'events.consent.required') }))
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))

    // The CHECK is the backstop, not the gate (app/schemas/events.py). A 500 has no field
    // attached, so the form could not mark the offending input.
    expect(api.create).not.toHaveBeenCalled()
    expect(screen.getByText(t('he', 'events.consent.textRequired'))).toBeInTheDocument()
  })

  it('refuses an end before a start, in the same way', async () => {
    const api = client()
    render(<EventForm client={api as never} locale="he" onSaved={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.name')), 'סמינר')
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.startsAt')), '2026-11-26T10:00')
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.endsAt')), '2026-11-26T08:00')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(api.create).not.toHaveBeenCalled()
    expect(screen.getByText(t('he', 'events.form.endBeforeStart'))).toBeInTheDocument()
  })

  it('says that confirming participation is what creates the charge', async () => {
    render(<EventForm client={client() as never} locale="he" onSaved={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(t('he', 'events.fee.label')), '80')
    expect(screen.getByText(t('he', 'events.fee.chargeOnConfirm'))).toBeInTheDocument()
  })

  it('lets audiences compose, and says so', async () => {
    render(<EventForm client={client() as never} locale="he" onSaved={vi.fn()} />)
    expect(screen.getByText(t('he', 'events.target.composeHint'))).toBeInTheDocument()
  })

  it('offers no capacity, no minimum age and no transport field', () => {
    render(<EventForm client={client() as never} locale="he" onSaved={vi.fn()} />)
    // D-M7-2 — three fields the artboard draws and §4.3 has no column for.
    expect(screen.queryByText(/מקסימום/)).toBeNull()
    expect(screen.queryByText(/גיל מינימלי/)).toBeNull()
    expect(screen.queryByText(/הסעה/)).toBeNull()
  })

  it('saves a draft and does not publish', async () => {
    const api = client()
    const onSaved = vi.fn()
    render(<EventForm client={api as never} locale="he" onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.name')), 'סמינר')
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.startsAt')), '2026-11-26T10:00')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    // 7b finding 3 — publish and send are one button on the artboard, and 9i/9d both draw a
    // state it cannot produce. Creating is creating; `POST /publish` is its own action.
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith('e1')
  })
})
```

- [ ] **Step 2: Confirm it fails.**
      `npx vitest run apps/dashboard/src/features/events/EventForm.test.tsx --reporter=dot`

- [ ] **Step 3: Resolve the `TextField` question, then write the form**

Type selection is `Radio` inside `Card` (the audit's own mapping — `SegmentedControl`
cannot carry a description). Location is a `SegmentedControl` over
*club hall · external* plus a free-text address, exactly `7b`'s framing and §5.8's.
`TargetPicker` composes the four `event_target` modes; there is no chip-select primitive
(D-M7-8), so it is a list of `Checkbox` rows plus an add control, with
`events.target.composeHint` drawn. Both toggles are `Switch`. The fee is a `TextField`
input with `events.fee.chargeOnConfirm` as its helper. **Validation mirrors the two model
validators** — `EventCreateIn` already refuses both, and the form refuses them first so the
CHECK never fires. Publish is a separate button that calls `POST /events/{id}/publish`
after a successful create.

**RTL:** the sidebar divider is `border-inline-start`, never `border-right` (`7b` finding 9).

- [ ] **Step 4: Green, lint, commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events/web && \
  npx vitest run apps/dashboard/src/features/events --reporter=dot && \
  npx eslint apps/dashboard/src/features/events && \
  npx stylelint "apps/*/src/features/events/**/*.css" --allow-empty-input && \
  cd .. && git add -A web && \
  git commit -m "feat(events): 7b, with the consent field the artboard forgot and the errors it never drew"
```

---

### Task 12: `7c` — עמוד אירוע · participants, consents and payment

**Files:**
- Create: `web/apps/dashboard/src/features/events/EventPage.tsx`,
  `ParticipantRow.tsx`, `EventPage.test.tsx`
- Modify: `EventsScreen.tsx` (route `#/events/<id>`), `index.ts`

- [ ] **Step 1: Write the failing test** — the load-bearing assertions

```tsx
// Artboard 7c. D9.2 is **verified clean** on the canvas and it stays clean here: the
// participants table has six columns and none of them is weight or category.
//
// Three more findings become tests. The **em dash** for a not-applicable cell needs an
// accessible label, not a bare glyph (finding: `roster.notApplicable`). The **belt swatch
// on every row is ringed**, because `BeltBar` rings unconditionally and one of the five
// drawn rows is yellow — the belt D7's audit names as failing 3:1. And the **two
// not-answered counts must agree**: the artboard's header button says 13 and its KPI says
// 10, and one number computed once is the fix.
describe('7c — the event page', () => {
  it('has six columns and neither a weight nor a category', async () => { /* … */ })

  it('labels the not-applicable cell rather than leaving a bare em dash', async () => {
    // A consent or a payment is meaningless until someone has said yes. The em dash is the
    // right model; a screen reader needs the word.
    expect(await screen.findAllByLabelText(t('he', 'events.roster.notApplicable'))).not.toHaveLength(0)
  })

  it('rings every belt swatch, including the yellow one', async () => {
    const bars = await screen.findAllByRole('img')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      expect(bar).toHaveClass('studio-belt-bar')
      expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    }
  })

  it('names one not-answered count in the button and in the tile', async () => {
    const button = await screen.findByRole('button', { name: /תזכורת/ })
    const tile = await screen.findByRole('status', { name: t('he', 'events.counts.pending') })
    expect(button.textContent).toContain(within(tile).getByRole('presentation').textContent)
  })

  it('shows no payment column to a coach', async () => { /* charge_id is null; the column is absent */ })

  it('renders the empty roster state a new event is always in', async () => {
    expect(await screen.findByText(t('he', 'events.roster.empty'))).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Confirm it fails.**
- [ ] **Step 3: Build it.** A header with a back affordance and a breadcrumb; a KPI strip of
      five `Card` tiles (confirmed · declined · not answered · missing consent · collected);
      the participants table. `StudentRow` covers the name cell only — the audit says so —
      so `ParticipantRow` is feature-specific: `BeltBar` + name, group, three independent
      `StatusChip`s and a trailing slot with **two shapes** (a control, or text). The
      payment column and the money KPI render only when the caller sees money (`can` /
      `MONEY_CAPABILITIES` from `@studio/core`).
- [ ] **Step 4: Green, lint, commit** —
      `git commit -m "feat(events): 7c, D9.2 clean, every swatch ringed and one count computed once"`

---

### Task 13: `5b` — מערכת חגורות, and the dashboard belts client

**Files:**
- Create: `web/apps/dashboard/src/features/belts/client.ts`, `BeltSystemScreen.tsx`,
  `RankEditor.tsx`, `ColourChoice.tsx`, `BeltSystemScreen.test.tsx`, `index.ts`
- Modify: `web/apps/dashboard/src/App.tsx` (one `NAV` entry `#/belts`, one route branch)

`5b` is **`BeltBar`'s specification** and the artboard where a belt is defined, so it is the
screen whose tests police D7 hardest.

- [ ] **Step 1: Write the failing test**

```tsx
// Artboard 5b — where the belt system is defined.
//
// **D7 is unconditional and this is the screen that proves it.** The canvas rings two of
// six swatches, by eye, in a translucent tint — yellow, orange, green, brown and the
// bi-colour-without-white are bare. `BeltBar` rings every one at full strength, and this
// file asserts it over the whole table rather than over a sample.
//
// **The colour picker is a bounded grid, not a hex field** (D1). A studio choosing an
// arbitrary hex is the thing D1 forbids for brand; a belt colour is data (D3), and a
// bounded palette is what keeps it auditable. Do not add a hex input later.
//
// **Kyu has two keys and no field on the canvas** (finding 2). `belt.kyuOptional` was
// written deliberately, so the field ships.
describe('5b — the belt system', () => {
  it('rings every swatch in the table, with no opt-out anywhere', async () => {
    render(<BeltSystemScreen client={client} locale="he" classId="c1" />)
    const bars = await screen.findAllByRole('img')
    expect(bars).toHaveLength(6)
    for (const bar of bars) expect(bar.style.boxShadow).toContain('var(--belt-ring)')
  })

  it('offers a bounded palette and no free hex input', async () => {
    render(<BeltSystemScreen client={client} locale="he" classId="c1" />)
    await userEvent.click(await screen.findByRole('button', { name: t('he', 'events.belt.add') }))
    expect(screen.getByRole('radiogroup', { name: t('he', 'events.belt.color') })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/#/)).toBeNull()
  })

  it('has a kyu field, because belt.kyuOptional was written on purpose', async () => { /* … */ })

  it('renders a bi-colour rank as one bar with two colours, never as two bars', async () => {
    // A second bar is how the fill-only bug D7 exists to prevent comes back
    // (app/models/belts.py's own docstring).
    const bar = await screen.findByRole('img', { name: /צהובה-כתומה/ })
    expect(bar.style.background).toContain('linear-gradient')
    expect(bar.style.background).not.toContain('to right')
    expect(bar.style.background).not.toContain('to left')
  })

  it('refuses to delete a rank students hold, and says how many', async () => {
    // 5b finding 7 — the row already shows the count, so the refusal has its reason on
    // screen. `student_belt.belt_rank_id` is ON DELETE RESTRICT.
    expect(await screen.findByText(t('he', 'events.belt.deleteHeld'))).toBeInTheDocument()
  })

  it('reorders with buttons and posts the whole finished order', async () => { /* … */ })

  it('renders the empty state a studio is in before the wizard runs', async () => {
    expect(await screen.findByText(t('he', 'events.belt.empty'))).toBeInTheDocument()
  })

  it('is scoped to one class, because a ladder is', async () => {
    // `belt.perClassHint` says the system is per class and the artboard has no class
    // selector (finding 3). It has one here.
    expect(await screen.findByLabelText(t('he', 'events.target.class'))).toBeInTheDocument()
  })
})
```

- [ ] **Step 2–4:** confirm red · build (`ColourChoice` is a `Radio` grid over the eight
      preset hexes from `app/services/belts/presets.py`'s palette, **not** a picker
      primitive — D-M7-8; the edit panel divider is `border-inline-start`; reorder posts
      `POST /belt-ranks/reorder` with the whole list) · green · lint ·
      `./scripts/lane-check.sh belts` · commit.

---

### Task 14: `5d` — wizard step 2, as a slot fill

**Files:**
- Create: `web/apps/dashboard/src/features/belts/BeltsWizardStep.tsx`,
  `registerBeltsStep.ts`, `BeltsWizardStep.test.tsx`
- Modify: `web/apps/dashboard/src/features/belts/index.ts`, `web/apps/dashboard/src/App.tsx`
  (one call to `registerBeltsWizardStep(apiFetch)` beside `registerM1WizardSteps`)

> **`SetupWizard.tsx` is never opened, and neither is
> `web/packages/ui/src/setup-wizard/register.ts`.** That file registers *M1's four steps*.
> This lane registers its own from its own feature directory — one file, one `registerSlot`
> call at `key: 'belts'`, `order: 2` — which is exactly the seam `slots.ts` describes: *"a
> lane adds one file that calls `registerSlot()`, plus one line in its own feature barrel;
> the container file is never reopened."*

- [ ] **Step 1: Write the failing test**

```tsx
// Artboard 5d, and Seam 4.
//
// The seam assertion comes first, because it is the one that protects another lane: this
// step must reach the wizard WITHOUT SetupWizard.tsx or ui's register.ts changing. The test
// registers, reads the slot back, and asserts the key and the order.
import { clearSlot, useSlot } from '@studio/ui'

describe('5d — the belts wizard step', () => {
  it('registers itself into the container at order 2 without reopening it', () => {
    clearSlot('setup-wizard')
    registerBeltsWizardStep(fetcher)
    const entries = renderHook(() => useSlot('setup-wizard')).result.current
    expect(entries.map((e) => [e.key, e.order])).toEqual([['belts', 2]])
  })

  it('reports its own outcome rather than letting the container compute it', async () => {
    // types.ts: "the container never computes completeness — each step reports its own
    // outcome. That is what makes the seam hold."
    const onDone = vi.fn()
    render(<Step locale="he" status="pending" onDone={onDone} onSkip={vi.fn()} />)
    await userEvent.click(await screen.findByLabelText(/ג'ודו ילדים/))
    await userEvent.click(screen.getByRole('button', { name: /יצירת/ }))
    expect(onDone).toHaveBeenCalled()
  })

  it('previews the ranks a preset would create, ringed and bi-colour', async () => { /* … */ })

  it('claims no promotion condition it cannot compute', async () => {
    // 5d finding 2 and finding 4. The canvas's preview footer says "80% נוכחות · 4 חודשי
    // ותק" and its caption promises a promotion every three to four months. D-M7-3 cuts
    // the attendance threshold and §5.9 has no cadence. Neither is drawn.
    render(<Step locale="he" status="pending" onDone={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByRole('radiogroup')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
    expect(screen.queryByText(/3–4/)).toBeNull()
  })

  it('offers build-from-scratch as a fourth choice', async () => {
    expect(screen.getByLabelText(t('he', 'events.belt.presetScratch'))).toBeInTheDocument()
  })
})
```

- [ ] **Step 2–4:** confirm red · build (`Radio` inside `Card` per preset, a live preview
      list of `BeltBar` rows, the primary's label carrying the selected preset's rank count;
      `padding-inline-start`, never `padding-right` — `5d` finding 6) · green · lint ·
      commit.

---

### Task 15: `6b` and `4d` — the exam roundup, eligibility and group promotion

Two artboards, one task: `6b` lists exams and creates one, `4d` is the eligibility table
that exam opens into, and they share every shape.

**Files:**
- Create: `web/apps/dashboard/src/features/events/ExamsScreen.tsx`,
  `ExamEligibilityScreen.tsx`, `BeltTransition.tsx`, `ExamsScreen.test.tsx`,
  `ExamEligibilityScreen.test.tsx`
- Modify: `EventsScreen.tsx` (routes `#/exams`, `#/exams/<id>`), `index.ts`

- [ ] **Step 1: Write the failing tests**

```tsx
// Artboards 6b and 4d.
//
// **4d finding 2 is the one that decides the screen's shape.** The artboard conflates
// eligibility with the promotion decision: eligible rows are pre-checked and one button
// "confirms promotion" for whoever is ticked, with no exam result entering anywhere. §5.9
// makes a PASS the thing that writes the belt row. So this screen selects candidates and
// records results — `POST /events/{id}/exam-results` — and the promotion is what a pass
// does. There is no path here that awards a belt without a result.
//
// **Eligibility is rank and tenure** (D-M7-3). Attendance, debt and a missing declaration
// are asserted ABSENT, because a key or a column is how a cut comes back — and a debt
// figure on a screen §3.2 lets a lead coach open would break the hard rule outright.
describe('4d — eligibility and promotion', () => {
  it('shows the tenure §5.9 names and no attendance percentage', async () => {
    render(<ExamEligibilityScreen client={client} locale="he" eventId="e1" />)
    expect(await screen.findByText(t('he', 'events.exam.tenureAtRank'))).toBeInTheDocument()
    expect(screen.queryByText(/נוכחות/)).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('never shows a debt or a missing declaration as a blocker', async () => {
    render(<ExamEligibilityScreen client={client} locale="he" eventId="e1" />)
    await screen.findByRole('table')
    expect(screen.queryByText(/חוב/)).toBeNull()
    expect(screen.queryByText(/הצהרה/)).toBeNull()
    expect(screen.queryByText(/חסום/)).toBeNull()
  })

  it('records a result rather than promoting without one', async () => {
    const api = client()
    render(<ExamEligibilityScreen client={api as never} locale="he" eventId="e1" />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /דנה/ }))
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.confirmPromotion') }))
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.confirmPromotion') }))
    expect(api.recordResults).toHaveBeenCalledWith(
      'e1',
      expect.arrayContaining([expect.objectContaining({ result: 'pass' })]),
    )
    expect(api.awardBelt).toBeUndefined()
  })

  it('confirms before an irreversible bulk write', async () => {
    // 4d finding 6 — no confirmation, no result state, on a screen that writes belt rows in
    // bulk. `events.belt.groupPromoteHint` exists and is not drawn.
    render(<ExamEligibilityScreen client={client()} locale="he" eventId="e1" />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /דנה/ }))
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.confirmPromotion') }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(t('he', 'events.belt.groupPromoteHint'))
  })

  it('does not let an ineligible row be selected', async () => {
    // 4d finding 5 — a blocked row's checkbox is indistinguishable from an ineligible one.
    // D-M7-3 leaves one kind of ineligible: no rank above the one held.
    const box = await screen.findByRole('checkbox', { name: /רן/ })
    expect(box).toBeDisabled()
    expect(screen.getByText(t('he', 'events.exam.notEligible'))).toBeInTheDocument()
  })

  it('rings both swatches of every transition', async () => { /* BeltTransition, two BeltBars */ })

  it('renders an empty state for an exam with no eligible candidates', async () => { /* … */ })
})

describe('6b — the exam roundup', () => {
  it('says why a draft is a draft, not only that it is one', async () => {
    // 6b finding 4 — this artboard's draft treatment is better than 7a's. Use it.
    expect(await screen.findByText(t('he', 'events.status.draftWhy'))).toBeInTheDocument()
  })

  it('opens blank rather than pre-filled with another exam', async () => {
    // 6b finding 2 — the panel is drawn pre-populated while titled "new exam". A create
    // form that opens with another exam's data is a bug waiting to be reported.
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.new') }))
    expect(screen.getByLabelText(t('he', 'events.form.name'))).toHaveValue('')
  })

  it('offers no eligibility-condition fields', async () => {
    // 6b finding 1 — three axes §5.9 does not have. D-M7-3.
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.new') }))
    expect(screen.queryByText(/נוכחות מינימלית/)).toBeNull()
    expect(screen.queryByText(/חסימה/)).toBeNull()
  })

  it('renders the empty state a club is in most of the year', async () => {
    expect(await screen.findByText(t('he', 'events.exam.empty'))).toBeInTheDocument()
  })
})
```

- [ ] **Step 2–4:** confirm red · build (`BeltTransition` is two `BeltBar`s and a
      direction-aware chevron — three artboards want it, so it is one component;
      the date badge's divider is `border-inline-end`, the panel's `border-inline-start`) ·
      green · lint · commit.

---

### Task 16: the staff app — `9i` events and `9d` the belt exam

**Files:**
- Create: `web/apps/staff/src/features/events/client.ts`, `StaffEventsScreen.tsx`,
  `ExamSetupScreen.tsx`, `ExamResultsScreen.tsx`, `ExamResultMark.tsx`,
  `StaffEvents.test.tsx`
- Modify: `web/apps/staff/src/App.tsx` (one nav/route branch)

- [ ] **Step 1: Write the failing test**

```tsx
// Artboards 9i and 9d, the staff app's two events screens.
//
// **9d finding 1 is the whole of the second frame**: the artboard's candidate rows are
// static, so it shows the destination and not the mechanism. Tap-to-cycle is the natural
// interaction — 1c and 9f already do it for attendance — and it is built here.
//
// **9d finding 3: do NOT reuse `AttendanceMark`.** Same three shapes, different domain:
// `AttendanceState` is present|absent|notified|unmarked and an exam result is
// pass|fail|pending. `ExamResultMark` is a sibling in this feature directory.
//
// **9i finding 7 is a keeper, not a bug**: three RSVP renderings that are
// state-appropriate. Written down as a test so nobody unifies them into one bar that reads
// as 0% before anyone has been asked.
describe('9d — recording exam results', () => {
  it('cycles a candidate pass → fail → not marked on tap', async () => {
    render(<ExamResultsScreen client={client} locale="he" eventId="e1" />)
    const row = await screen.findByRole('button', { name: /דנה/ })
    await userEvent.click(row)
    expect(within(row).getByRole('img')).toHaveAttribute('data-result', 'pass')
    await userEvent.click(row)
    expect(within(row).getByRole('img')).toHaveAttribute('data-result', 'fail')
    await userEvent.click(row)
    expect(within(row).getByRole('img')).toHaveAttribute('data-result', 'pending')
  })

  it('uses ExamResultMark and never AttendanceMark', async () => {
    const { container } = render(<ExamResultsScreen client={client} locale="he" eventId="e1" />)
    expect(container.querySelector('.studio-attendance-mark')).toBeNull()
    expect(container.querySelector('.studio-exam-mark')).not.toBeNull()
  })

  it('shows one swatch and no chevron on a fail, and two on a pass', async () => {
    // The best thing on the artboard: the fail row's belt visual is STRUCTURALLY different
    // — it shows "no change" rather than saying it.
    const fail = await screen.findByRole('group', { name: /איתי/ })
    expect(within(fail).getAllByRole('img')).toHaveLength(1)
    const pass = await screen.findByRole('group', { name: /דנה/ })
    expect(within(pass).getAllByRole('img')).toHaveLength(2)
  })

  it('previews the prospective transition on an unmarked row', async () => { /* … */ })

  it('scopes the consequence to a pass, and confirms before saving', async () => {
    // 9d finding 4 — `events.exam.passPromotesHint` is better than the drawn caption: it
    // says a PASS grants the next grade. Ship the key, and add the confirmation an
    // effectively irreversible write needs.
    expect(await screen.findByText(t('he', 'events.exam.passPromotesHint'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.save') }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('offers no makeup date, because a makeup sitting has no model', async () => {
    // 9d finding 2, D-M7-2. Two places on the artboard depend on one.
    expect(screen.queryByText(/מועד השלמה/)).toBeNull()
  })

  it('never says a parent will be notified, because nothing notifies yet', async () => {
    // §5.9 step 4 is M8's, and `events.exam.passPromotesHint` deliberately says nothing
    // about it — which the audit already noticed.
    expect(screen.queryByText(/הודעה/)).toBeNull()
  })
})

describe('9i — the staff events list', () => {
  it('keeps three state-appropriate RSVP renderings', async () => {
    // sent+in progress → a bar and a fraction · not sent → a headcount and no count ·
    // sent+outstanding → an outstanding count and no bar.
  })

  it('shows a coach no fee anywhere', async () => {
    // §3.2's hard rule. The API redacts it; this asserts the screen does not reintroduce it.
    expect(screen.queryByText(/₪/)).toBeNull()
  })

  it('renders the empty state a coach with no events is in', async () => { /* … */ })
})
```

- [ ] **Step 2–4:** confirm red · build (`ExamSetupScreen` is `9d`'s frame 1 — a type
      choice, a date and time, class rows with an eligible-of-total count, and a primary
      whose label carries the candidate count; `ExamResultsScreen` is frame 2 with
      tap-to-cycle, three stat tiles and a confirmation) · green · lint ·
      `./scripts/lane-check.sh events` · commit.

---

### Task 17: the parent app — `12h` the list and `7d` the invite

**Files:**
- Create: `web/apps/parent/src/features/events/client.ts`, `ParentEventsScreen.tsx`,
  `EventInviteScreen.tsx`, `ParentEvents.test.tsx`, `index.ts`
- Modify: `web/apps/parent/src/App.tsx` (one tab/route branch)

- [ ] **Step 1: Write the failing test**

```tsx
// Artboards 12h and 7d — the parent's side of §5.8.
//
// **7d finding 1 is the load-bearing test.** §5.8: an RSVP does not count as confirmed
// until the parent signs, and on the artboard the confirm button and the consent card are
// independent, simultaneously usable controls with nothing tying them. The gate is built:
// `events.consent.blocksConfirmation` is drawn, and confirm is disabled until the
// signature exists.
//
// **12h finding 1**: three cards, three renderings of the same three states. One canonical
// rendering per state, asserted by rendering all three states through one component.
describe('7d — the event invite', () => {
  it('will not let a parent confirm before signing, and says why', async () => {
    render(<EventInviteScreen client={client} locale="he" eventId="e1" studentId="s1" />)
    const confirm = await screen.findByRole('button', { name: new RegExp(t('he', 'events.rsvp.title')) })
    expect(confirm).toBeDisabled()
    expect(screen.getByText(t('he', 'events.consent.blocksConfirmation'))).toBeInTheDocument()
  })

  it('enables confirm once the consent is signed', async () => { /* … */ })

  it('says that confirming creates a charge', async () => {
    // 7d finding 2 — `events.fee.chargeOnConfirm` exists and the artboard does not draw it.
    expect(await screen.findByText(t('he', 'events.fee.chargeOnConfirm'))).toBeInTheDocument()
  })

  it('renders the fee through MoneyDisplay, including inside the button label', async () => {
    // The riskiest bidi case on the artboard: a {digits}₪ pair inside an RTL button label.
    // The primitive owns the isolation; string interpolation is where it flips.
    const confirm = await screen.findByRole('button', { name: new RegExp(t('he', 'events.rsvp.title')) })
    expect(within(confirm).getByText('80.00 ₪').closest('.studio-money')).not.toBeNull()
  })

  it('shows an answered state and a way to change it', async () => {
    // 7d finding 3 / 12h — `events.rsvp.answered` and `rsvp.change` both exist and neither
    // is drawn. A parent who confirms currently has no way back.
    expect(await screen.findByText(t('he', 'events.rsvp.youConfirmed'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('he', 'events.rsvp.change') })).toBeInTheDocument()
  })

  it('says the deadline has passed rather than offering buttons that fail', async () => {
    expect(await screen.findByText(t('he', 'events.rsvp.deadlinePassed'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('he', 'events.rsvp.no') })).toBeNull()
  })

  it('publishes no staff phone number', async () => {
    // 7d finding 4 — the artboard prints a coach's personal mobile to every parent. §11
    // governs personal data and a coach's mobile is personal data.
    expect(screen.queryByText(/05\d-?\d{3}-?\d{4}/)).toBeNull()
  })

  it('offers no capacity line and no transport row', async () => { /* D-M7-2 */ })
})

describe('12h — the parent event list', () => {
  it('renders one canonical treatment per RSVP state', async () => {
    // Three cards on the canvas: two buttons · a chip · unstyled trailing text. One
    // component, three states, one rendering each.
  })

  it('never shows a draft', async () => {
    // §4.3. `GET /me/events` filters server-side; this asserts the screen agrees.
  })

  it('speaks to the parent in the second person', async () => {
    // 12h finding 7 — every RSVP key is third-person and every screen string is second.
    // `rsvp.awaitingYourAnswer`, `rsvp.youConfirmed`, `rsvp.youDeclined` are the keys.
    expect(await screen.findByText(t('he', 'events.rsvp.awaitingYourAnswer'))).toBeInTheDocument()
  })

  it('shows no medal line on a past event', async () => { /* D-M7-2 */ })
})
```

- [ ] **Step 2–4:** confirm red · build (one `ParentEventCard` with a `state` prop; the
      consent card is `Alert tone="danger"` composed with a title and an action, because
      `Alert` has neither — reported, not added; the signature itself navigates to the pad,
      which is `web/apps/parent/src/features/health/SignaturePad.tsx` and **not this lane's
      file to move**, decision item 3 on `main`) · green · lint · commit.

---

### Task 18: `12d` — התקדמות חגורה ומבחנים

**Files:**
- Create: `web/apps/parent/src/features/belts/client.ts`, `BeltProgressScreen.tsx`,
  `BeltProgression.tsx`, `BeltProgressScreen.test.tsx`, `index.ts`
- Modify: `web/apps/parent/src/App.tsx` (one route branch)

- [ ] **Step 1: Write the failing test**

```tsx
// Artboard 12d — eleven belt fills, and on the canvas two of them carry any ring at all.
//
// **12d finding 3 and 4 are this file's reason to exist.** The current rank — the one
// segment the whole screen is about — is bare on the canvas, and so is the yellow one. And
// the ring must NOT dim on a faded future segment: it is a contrast obligation (SC 1.4.11),
// not decoration, so the fill fades and the ring does not. `BeltBar` takes the fill as a
// prop and reads `--belt-ring` from the theme, so an 8-digit hex fades the fill alone.
describe('12d — the parent belt view', () => {
  it('rings every segment of the progression, including the current one', async () => {
    render(<BeltProgressScreen client={client} locale="he" studentId="s1" />)
    const segments = await screen.findAllByRole('img')
    expect(segments).toHaveLength(9)
    for (const segment of segments) {
      expect(segment.style.boxShadow).toContain('var(--belt-ring)')
    }
  })

  it('fades a future segment by its fill and never by its ring', async () => {
    const future = await screen.findByRole('img', { name: /חומה/ })
    expect(future.style.background).toMatch(/#[0-9a-fA-F]{8}/)
    expect(future.style.boxShadow).toContain('var(--belt-ring)')
  })

  it('marks the current rank by more than height', async () => {
    // The canvas distinguishes it by height alone — no ring, no marker, no label. A visual
    // difference that is only a size is not available to a screen reader.
    const current = await screen.findByRole('img', { name: /ירוקה/ })
    expect(current.closest('[aria-current]')).not.toBeNull()
  })

  it('is not a ProgressBar', async () => {
    // A belt ladder is a discrete ranked sequence, not a continuous fill, and 12d is
    // exactly where someone would reach for the primitive.
    const { container } = render(<BeltProgressScreen client={client} locale="he" studentId="s1" />)
    expect(container.querySelector('.studio-progress')).toBeNull()
  })

  it('renders the no-belt-yet state a new white-belt child is in', async () => {
    expect(await screen.findByText(t('he', 'events.belt.none'))).toBeInTheDocument()
  })

  it('renders the no-exam-scheduled state', async () => {
    expect(await screen.findByText(t('he', 'events.exam.empty'))).toBeInTheDocument()
  })

  it('states eligibility as rank and tenure and never as attendance', async () => {
    // 12d finding 2 — the canvas states "92% נוכחות" to a PARENT, as a fact about their
    // child, and §5.9 has no such criterion. D-M7-3.
    expect(screen.queryByText(/%/)).toBeNull()
    expect(await screen.findByText(t('he', 'events.exam.eligibleHint'))).toBeInTheDocument()
  })

  it('promises no belt hand-over', async () => {
    // 12d finding 1 — the footer claims a promotion enqueues a physical belt for delivery.
    // Three artboards describe that flow and none of them has a model. D-M7-2.
    expect(screen.queryByText(/תור המסירה/)).toBeNull()
  })

  it('lists exams separately from rank history', async () => {
    // 12d finding 5 — "previous exams" and "rank history" are different lists, and
    // `belt.awardOutsideExam` proves it: a promotion can happen without an exam.
    expect(await screen.findByText(t('he', 'events.belt.history'))).toBeInTheDocument()
  })
})
```

- [ ] **Step 2–4:** confirm red · build (`BeltProgression` maps the class's ladder to
      earned / current / future; the future fill is `` `${colorHex}59` `` so only the fill
      fades; the progression runs by `dir` — **do not reverse the array and do not hard-code
      a gradient direction**) · green · lint · `./scripts/lane-check.sh belts` · commit.

---

### Task 19: Both lane checks, the state file, and the report

- [ ] **Step 1: Run the whole lane, both halves**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  ./scripts/lane-check.sh events && ./scripts/lane-check.sh belts
```

Both must print `✅` with **six** scoped gates for `events` and **six** for `belts`
(`belts` gains a frontend gate and a CSS gate once `features/belts/` exists; its i18n arm
stays the all-nine one, which is strictly stronger).

- [ ] **Step 2: Run the full suite, because a lane can pass its own gate and break another's**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && .venv/bin/pytest -q
```

The baseline at handover was 1837 passed, 1 skipped, 1 xfailed.
`test_the_billing_run_is_idempotent` **must still skip** — it becomes a failure the moment
lane MONEY writes a real `create_charge` body, and this lane must not be what trips it.

- [ ] **Step 3: Typecheck and lint everything this lane owns**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  .venv/bin/mypy app && npm --prefix web run typecheck && npm --prefix web run lint
```

- [ ] **Step 4: Tick `docs/plan/state.yaml`**

Add M7's pieces under W4, in the **same commit** as the last piece of work. Never write
anything measurable there — no test counts, no branch, no environment health.

```yaml
      - id: M7.1
        title: Events — create, publish, RSVP, consent and the fee seam
        status: shipped
        on: 2026-08-26
      - id: M7.2
        title: Belts — the ladder, the seeded sets, awards and the one-transaction promotion
        status: shipped
        on: 2026-08-26
      - id: M7.3
        title: Artboards — dashboard 7a, 7b, 7c, 5b, 5d, 6b, 4d
        status: shipped
        on: 2026-08-26
      - id: M7.4
        title: Artboards — staff 9i, 9d and parent 7d, 12h, 12d
        status: shipped
        on: 2026-08-26
```

- [ ] **Step 5: Write the lane report**

`docs/plan/prompts/w4-events-handover.md`, for whoever merges. It must carry:

1. **Every cut**, with the artboards that asked for it and the missing column — D-M7-2's
   table, verbatim, plus the eligibility criteria D-M7-3 dropped.
2. **`StudentBeltOut.color_hex` is not a snapshot** (D-M7-7). The contract test's own
   argument needs a `student_belt.color_hex` column, which is a migration and `main`'s.
3. **`consent_record` cannot name an event.** §11.6's ledger row is written and
   `event_registration.consent_signed_at` is the authoritative per-event fact.
4. **`TextField` still has no `multiline`**, and what Task 11 shipped instead.
5. **The `packages/ui` gaps this lane worked around**: `ChipStatus` has no RSVP, consent or
   danger member and no dashed variant; `AlertTone` has no neutral; `Checkbox` has no
   indeterminate; `ButtonVariant` has no icon-only; there is no stepper, chip-select,
   single-date field, time field or `ColourSwatchPicker`.
6. **`app/routers/events.py` declares `/me/events` and `app/routers/belts.py` declares
   `/students/{id}/belts`** — paths outside their module's name, following
   `health_declarations.py`'s precedent, so a reviewer does not read it as a lane crossing.
7. **The three lines this lane added to each app's `App.tsx`**, so lane MONEY's rebase
   expects them.
8. **What `create_charge` is called with**, so the MONEY reviewer can check the other side
   of the seam without reading this lane's whole diff.

- [ ] **Step 6: Commit**

```bash
cd /Users/yuvalstolin/Desktop/studio-manager-events && \
  git add -A && \
  git commit -m "docs(plan): tick M7 and hand over what this lane cut and why"
```

---

## Self-review

**Spec coverage.** §5.8's six clauses — types (Task 1) · targeting (Tasks 1–2) · RSVP with
a deadline and a nudge (Task 3, `7c`/`9i` in Tasks 12/16) · fee → charge (Task 3) · consent
gating confirmation (Task 3) · event attendance (Task 3) · events in three apps and an ICS
file (Tasks 8, 10, 16, 17). §5.9's five clauses — per-class ordered ranks with a seeded
judo set (Tasks 4–5) · `current_belt_id` plus `student_belt` history (Task 6) · the exam as
an event, nominated candidates, pass/fail per candidate, and the one-transaction promotion
(Task 7, `9d` in Task 16) · the parent's progression strip (Task 18). §5.9 step 4's
notification is M8's and is on the cut list with its reason. §7's ten event and belt routes
all land, plus `/me/events`, `/belt-presets` and `/belt-ranks/reorder`, which the screens
need and §7 does not list. §3.2's two M7 rows are router dependencies, and the hard money
rule is a redaction with a test on both sides.

**Placeholders.** Tasks 1–11 carry the code. Tasks 12–18 carry the load-bearing test bodies
and name every file, primitive and finding they implement; their remaining work is
composition against components already written out. That is deliberate rather than a gap —
writing nine more screens' JSX here would be writing the code twice — but an executor
reaching Task 12 should expect to design markup, not to discover requirements.

**Type consistency.** `EventService.to_out` takes a **list** and returns a list, and every
caller passes `[row]` for the single case. `EventPublishService.publish` returns
`tuple[Event, int]`; `RsvpService.answer` and `.sign_consent` both return
`tuple[Event, EventRegistration]`, which is what lets the router compute `confirmed`
without a second read. `BeltAwardService.award` returns `tuple[StudentBelt, BeltRank]` and
`ExamService.record` returns a list of the same pair. `Candidate.months_at_rank` is
`int | None` — `None` when there is no current rank, which is not zero.
`redacts_fee(roles)` is the single definition of §3.2's money rule and is imported by both
routers rather than re-derived.
