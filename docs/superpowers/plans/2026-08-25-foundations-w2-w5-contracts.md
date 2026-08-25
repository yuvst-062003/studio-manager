# Foundations — W2–W5 contracts, core/ui primitives, uPay parsing, e2e, component specs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every wave-opening contract (models, schemas, seam signatures, i18n) for W2–W5,
plus the shared pure-function layer, the two missing UI leaf primitives, uPay IPN parsing, the
five E2E specs and the M2–M9 component specs — without touching a single file the concurrent
M1 session owns.

**Architecture:** This session is the *contract author*, never a lane. It writes the things
§2.2 of the milestone plan says must exist on `main` **before** two worktrees are created:
full §4.3 columns behind `TenantMixin`, Pydantic in/out schemas, and empty-bodied service
classes whose signatures are the cross-lane seam. Bodies raise `NotImplementedError`; a test
asserts each signature so a lane cannot silently change the contract it was handed. Everything
lands as **new files** in directories with exactly one owner.

**Tech Stack:** FastAPI · SQLAlchemy 2 (`Mapped`/`mapped_column`) · Pydantic v2 · pytest ·
React 19 + TS 5.9 · vitest · Playwright.

**Spec:** [SPEC.md](../../../SPEC.md) §4.3, §5.10, §7, §8.2, §8.3, §13 ·
[docs/plan/milestone-plan.md](../../plan/milestone-plan.md) Global Constraints, §1.3, W2–W5
contract tables · [docs/design/decisions.md](../../design/decisions.md) D1–D12 ·
[upay-integration.md](../../../upay-integration.md).

---

## Global Constraints

Copied verbatim from the milestone plan's Global Constraints table. Every task inherits these.

| # | Constraint |
|---|---|
| G1 | Python tooling is in `.venv/`. Always the `.venv/bin/` prefix. |
| G2 | Money is **always** an integer count of agorot. Never a float, never a decimal. Every money column is `*_agorot INTEGER`. |
| G3 | Timestamps are **always** stored UTC `timestamptz`; rendered in `Asia/Jerusalem` **regardless of locale**. |
| G4 | No user-facing string is ever inlined in a component. |
| G5 | New API endpoints are versioned under `/api/v1/`. |
| G6 | Routers stay thin. All business logic in `app/services/`. |
| G7 | Health declarations are personal data about minors. **Never log their contents.** Coaches see `derived_flags` booleans only. |
| G8 | No automated recurring billing. הוראת קבע mandates cannot be created in code. |
| G9 | Every tenant-scoped table carries non-null `studio_id` with a leading composite index (`TenantMixin`). |
| G10 | Every belt bar carries a **1px ring in the current foreground colour**. Never fill-only. |
| G11 | `#6f6b62` is the floor for any **light-mode** text token. `#a8a49a`/`#8f8b82` are dark-mode-only. `#7a766d` is retired outright. |
| G12 | Physical CSS properties are ESLint-banned. Exported canvas CSS is a **visual reference only**. |
| G13 | Colours live in named tokens, never hardcoded hex. Semantic tokens are **never overridable**. |
| G14 | Typeface is **Rubik**, one family. |
| G15 | Soft-delete (`deleted_at`) on user-generated content. No PII is ever denormalized into a financial row. |
| G16 | Every list endpoint is cursor-paginated. Every mutating endpoint accepts an optional `Idempotency-Key`. |
| G18 | A failing test is written before any bug fix. |

### Session ownership — the hard boundary

**Owned (new files only unless stated):** `app/models/**` · `app/schemas/**` ·
`app/services/**` (seam signatures, empty bodies) · `app/integrations/upay/**` ·
`web/packages/core/**` (pure helpers only — **not** the offline queue, M5 owns that) ·
`web/packages/i18n/{he,en,ru}/*.ts` (never `index.ts`) · `web/packages/ui/src/**` (**new leaf
primitives only**) · `e2e/**` · `docs/design/specs/**`.

**Never touched:** `web/apps/**` · `alembic/versions/**` · `web/packages/i18n/index.ts` ·
`web/packages/ui/src/slots.ts` · `app/main.py` · `app/models/__init__.py` ·
`docs/plan/state.yaml` (machine-written by the cockpit; W1's pieces are M1's to tick).

### Three constraints discovered while reading, that change what gets built

1. **There is no `belts` namespace and no `privacy` namespace.** The W4 and W5 contract tables
   name `*/belts.ts` and `*/privacy.ts`, but `web/packages/i18n/types.ts` lists exactly nine:
   `common schedule people health attendance billing events comms reports`. `index.ts` is
   authored once and a lane never edits it. **Belt strings therefore live in `events.ts` under a
   `belt.*` key prefix; privacy strings live in `reports.ts` under `privacy.*`.**
2. **uPay has no signature of any kind.** `upay-integration.md` marks this **[VERIFIED]** twice —
   round one ("no cryptographic signature or hash on any field") and round two ("no signature
   exists on any request, inbound or outbound"). There is no HMAC to verify. The real
   mitigations §5.10 mandates are: UUIDv4 `public_ref`, independent server-side amount
   comparison, a source-IP signal (never a gate), and idempotence on `transactionid`. Build
   those.
3. **Four of the five named UI primitives already exist.** `BeltBar` (with the D7 ring, no
   opt-out), `StatusChip` (six semantic statuses), `EmptyState` and `StudentRow` are already in
   `web/packages/ui/src/primitives/`. Only **`MoneyDisplay`** and **`DateRangePicker`** are
   missing. Do not rebuild the other four.

---

## File Structure

New files, grouped by the task that creates them.

| File | Responsibility |
|---|---|
| `app/models/schedule.py` | W2: `training_year`, `studio_closure`, `group_schedule_rule`, `session`, `session_staff`, `session_note` |
| `app/models/people.py` | W2: `student`, `student_freeze`, `student_status_history`, `trial_booking`, `enrollment`, `registration_request` |
| `app/schemas/_pagination.py` | Shared cursor-page envelope + `Idempotency-Key` header type (G16) |
| `app/schemas/schedule.py` | `SessionOut`, `TrialSlotOut` (+ in-models) |
| `app/schemas/people.py` | `StudentOut`, `GuardianOut`, `EnrollmentOut`, `RegistrationRequestOut` |
| `app/services/schedule/__init__.py` | `ScheduleService.materialize_sessions` — W2 seam |
| `app/models/attendance.py` | W3: `attendance`, `absence_report` |
| `app/models/health.py` *(modify)* | W3: `health_declaration`, `consent_record` appended to the existing template-only module |
| `app/schemas/attendance.py` | `AttendanceIn/Out`, `BatchAttendanceIn`, `BootstrapPayload` |
| `app/schemas/health.py` | `HealthDeclarationIn/Out`, `DerivedFlags` |
| `app/services/health/__init__.py` | `HealthService.recompute_derived_flags` — W3 seam |
| `app/models/billing.py` | W4: the eleven-table ledger, every money column `*_agorot INTEGER` |
| `app/models/events.py`, `app/models/belts.py` | W4: events/RSVP/exam results; belt ranks and grading |
| `app/schemas/billing.py`, `app/schemas/events.py`, `app/schemas/belts.py` | W4 Pydantic |
| `app/services/billing/__init__.py` | `BillingService.create_charge` + `recompute_charge_status` — W4 seams |
| `app/models/comms.py`, `app/models/reports.py` | W5: announcements/notifications/push/calendar; `data_export_request` |
| `app/schemas/comms.py`, `app/schemas/reports.py` | W5 Pydantic |
| `app/services/comms/__init__.py` | `NotificationService.enqueue` — W5 seam |
| `app/integrations/upay/callback.py` | IPN parsing into dataclasses + the four §5.10 security verdicts |
| `web/packages/core/src/money.ts` | agorot format/parse, integers only |
| `web/packages/core/src/datetime.ts` | UTC → Asia/Jerusalem, locale-independent |
| `web/packages/core/src/pagination.ts` | cursor-page helper |
| `web/packages/core/src/permissions.ts` | §3.2 permission predicates |
| `web/packages/ui/src/primitives/MoneyDisplay.tsx` | agorot → ₪, semantic tone |
| `web/packages/ui/src/primitives/DateRangePicker.tsx` | logical-property date range, RTL-correct |
| `web/packages/i18n/{he,en,ru}/{schedule,people,health,attendance,billing,events,comms,reports}.ts` | real strings, Hebrew as reference |
| `e2e/*.spec.ts` + `e2e/playwright.config.ts` | SPEC §13's five flows |
| `docs/design/specs/*.md` | component specs for M2–M9 artboards |

---

## Task 1 — W2 contract: schedule + people models

**Files:** Create `app/models/schedule.py`, `app/models/people.py`. Test
`tests/contracts/test_w2_models.py`.

**Interfaces produced:** `TrainingYear`, `StudioClosure`, `GroupScheduleRule`, `Session`,
`SessionStaff`, `SessionNote`, `Student`, `StudentFreeze`, `StudentStatusHistory`,
`TrialBooking`, `Enrollment`, `RegistrationRequest` — all inheriting
`UUIDPrimaryKey, TimestampColumns, TenantMixin, Base` and discovered by Seam 2.

- [x] **Step 1: Write the failing test.** Assert every §4.3 column exists with the right type,
      that `Session` carries `is_manually_edited` and `is_ad_hoc` (E2E-5 rests on both), that
      `registration_request.payload_encrypted` uses `EncryptedJSON`, and that soft-deletable
      user content (`session_note`) has `deleted_at` (G15).
- [x] **Step 2: Run it.** `.venv/bin/pytest tests/contracts/test_w2_models.py -q` → FAIL, no module.
- [x] **Step 3: Implement both modules.** `student.person_id` UNIQUE; `guardian` already exists
      in `app/models/person.py` and is **not** re-declared. `student.health_status` is the W3
      seam field and is declared here because M5 reads it through `BootstrapPayload`.
- [x] **Step 4: Run it.** Expect PASS. Then `.venv/bin/pytest tests/invariants -q` — invariant 2
      (studio_id + leading composite index) now has twelve new tables to assert against.
- [x] **Step 5: Commit.** `feat(contract): W2 schedule and people models`

## Task 2 — W2 contract: schemas + the ScheduleService seam

**Files:** Create `app/schemas/_pagination.py`, `app/schemas/schedule.py`,
`app/schemas/people.py`, `app/services/schedule/__init__.py`. Test
`tests/contracts/test_w2_schemas.py`, `tests/contracts/test_seams.py`.

**Interfaces produced:**
`ScheduleService.materialize_sessions(group_id: UUID, from_date: date, to_date: date) -> list[Session]`
— M3's trial-slot picker is a pure reader through this. `CursorPage[T]` with `items`,
`next_cursor`, `has_more`.

- [x] **Step 1: Write the failing test** asserting the seam signature by
      `inspect.signature`, that the body raises `NotImplementedError`, and that every `*Out`
      list response is a `CursorPage` (G16).
- [x] **Step 2: Run it** → FAIL.
- [x] **Step 3: Implement.** Empty bodies, real return types.
- [x] **Step 4: Run it** → PASS. `.venv/bin/mypy app`.
- [x] **Step 5: Commit.** `feat(contract): W2 schemas and the ScheduleService seam`

## Task 3 — W2 i18n: schedule + people, he → en/ru

**Files:** `web/packages/i18n/{he,en,ru}/{schedule,people}.ts`.

- [x] **Step 1:** Write `he/schedule.ts` and `he/people.ts` with real Hebrew drawn from the
      artboards (`9a` היום, `9b` בחירת תאריך, `3b` חניכים, `13a` דף נחיתה, `12j` הרשמה ראשונה).
- [x] **Step 2:** Mirror every key into `en/` and `ru/`.
- [x] **Step 3:** `node web/scripts/i18n-parity.mjs schedule && node web/scripts/i18n-parity.mjs people`
      → no errors. `en` is `strict`, `ru` is `report`.
- [x] **Step 4: Commit.** `feat(i18n): schedule and people namespaces`

## Task 4 — W3 contract: attendance + health models

**Files:** Create `app/models/attendance.py`. Modify `app/models/health.py` (append
`HealthDeclaration`, `ConsentRecord`). Test `tests/contracts/test_w3_models.py`.

> **C3 note.** `health_form_template` already exists (M1 seeded the trial form). This task adds
> `health_declaration` and `consent_record` — the columns W3's migration carries. The two
> existing tests in `tests/structure` that assert this module holds no minor's answers will now
> legitimately need to change scope; if they fail in a way that cannot be resolved without
> editing an M1-owned test, **stop and report** rather than weakening them.

- [x] **Step 1: Write the failing test.** `attendance` has `UNIQUE(session_id, student_id)` **and**
      a second unique index on `client_mark_id` (§4.3, offline idempotency). Status includes
      `unmarked` as a real state (§5.14 — a report must never treat unmarked as absent).
      `answers_encrypted`/`signature_image_encrypted` are `EncryptedBytes`; `derived_flags` is
      JSONB holding booleans only.
- [x] **Step 2: Run it** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run it** → PASS, plus `tests/invariants` and `tests/restrictions`.
- [x] **Step 5: Commit.** `feat(contract): W3 attendance and health models`

## Task 5 — W3 contract: schemas + the two health seams

**Files:** Create `app/schemas/attendance.py`, `app/schemas/health.py`,
`app/services/health/__init__.py`. Test `tests/contracts/test_w3_schemas.py`.

**Interfaces produced:**
- `HealthService.recompute_derived_flags(student_id: UUID) -> dict[str, bool]`
- `BootstrapPayload.roster[].health_status: Literal['missing','trial_signed','signed']`
- `BootstrapPayload.roster[].derived_flags: dict[str, bool]`

This is §1.3 seam 4 in data form: M5 renders both fields, M4 populates them, neither opens the
other's file.

- [x] **Step 1: Write the failing test** asserting `RosterEntry` carries both fields, that
      `derived_flags` rejects a non-boolean value (G7 — never free text), and the seam signature.
- [x] **Step 2: Run it** → FAIL.
- [x] **Step 3: Implement.** `BatchAttendanceIn` carries `client_mark_id` per mark.
- [x] **Step 4: Run it** → PASS. `.venv/bin/mypy app`.
- [x] **Step 5: Commit.** `feat(contract): W3 schemas, the roster seam and HealthService`

## Task 6 — W3 i18n: health + attendance

**Files:** `web/packages/i18n/{he,en,ru}/{health,attendance}.ts`.

- [x] **Step 1:** Hebrew from `12c` הצהרת בריאות, `4e` מסמכים והצהרות, `1c`/`9f` נוכחות,
      `12a` דיווח היעדרות. Include `⚠ הצהרת בריאות חסרה` and `שלח תזכורת להורה` — §5.5's
      staff surface is these strings.
- [x] **Step 2:** Mirror to `en`/`ru`.
- [x] **Step 3:** Parity per namespace.
- [x] **Step 4: Commit.** `feat(i18n): health and attendance namespaces`

## Task 7 — `web/packages/core`: money, TDD

**Files:** Create `web/packages/core/src/money.ts` + `money.test.ts`. Modify
`web/packages/core/src/index.ts` (append exports only).

**Interfaces produced:** `formatAgorot(agorot: number, opts?): string` ·
`parseShekels(text: string): number` (returns agorot) · `AGOROT_PER_SHEKEL`.

- [x] **Step 1: Write the failing test.** `formatAgorot(32000) === '320₪'`,
      `formatAgorot(32050) === '320.50₪'`, `parseShekels('320.50') === 32050`. The critical
      case: **no float ever appears** — `parseShekels('0.29')` must be exactly `29`, because
      `Math.round(parseFloat('0.29') * 100)` is the bug this exists to prevent (G2).
      Negative amounts round-trip (a credit adjustment is a negative charge, §5.10).
      Rejects `'abc'`, `''`, and more precision than agorot.
- [x] **Step 2: Run it.** `npx vitest run web/packages/core/src/money.test.ts --reporter=dot` → FAIL.
- [x] **Step 3: Implement** with integer string arithmetic, never `parseFloat`.
- [x] **Step 4: Run it** → PASS.
- [x] **Step 5: Commit.** `feat(core): agorot formatting and parsing, integers only`

## Task 8 — `web/packages/core`: datetime, TDD

**Files:** Create `web/packages/core/src/datetime.ts` + `datetime.test.ts`.

**Interfaces produced:** `STUDIO_TIMEZONE = 'Asia/Jerusalem'` ·
`formatInStudioZone(iso: string, locale: Locale, opts?): string` · `studioDayKey(iso): string`.

- [x] **Step 1: Write the failing test.** G3's real requirement: the **same instant renders as
      the same wall-clock time in `he`, `en` and `ru`** — only the numerals and separators may
      differ, never the hour. Cover the Israel DST boundary (last Friday of March / last Sunday
      of October) and an instant that falls on a different calendar day in UTC than in
      Jerusalem — `studioDayKey('2026-03-14T22:30:00Z')` is `2026-03-15`, and a session strip
      that got this wrong would show a class on the wrong day.
- [x] **Step 2: Run it** → FAIL.
- [x] **Step 3: Implement** on `Intl.DateTimeFormat` with an explicit `timeZone`, never the
      host zone.
- [x] **Step 4: Run it** → PASS.
- [x] **Step 5: Commit.** `feat(core): UTC to Asia/Jerusalem rendering, locale-independent`

## Task 9 — `web/packages/core`: pagination + permissions, TDD

**Files:** Create `pagination.ts`/`pagination.test.ts`, `permissions.ts`/`permissions.test.ts`.

**Interfaces produced:** `CursorPage<T>`, `mergeCursorPages`, `hasNextPage` ·
`can(actor, action, resource): boolean` built from §3.2's matrix.

- [x] **Step 1: Write the failing tests.** Pagination: merging pages dedupes by id and never
      reorders. Permissions: the row that matters is **a coach can never read a financial
      field** — invariant 3. A coach scoped to a group sees only that group's students (§3.2).
- [x] **Step 2: Run them** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run them** → PASS. `npm --prefix web run typecheck`.
- [x] **Step 5: Commit.** `feat(core): cursor pagination and permission predicates`

## Task 10 — `web/packages/ui`: MoneyDisplay + DateRangePicker

**Files:** Create `primitives/MoneyDisplay.tsx` + test, `primitives/DateRangePicker.tsx` + test.
Modify `primitives/primitives.css` and `src/index.ts` (append only).

> Only these two. `BeltBar`, `StatusChip`, `EmptyState` and `StudentRow` already exist and are
> correct — `BeltBar` already carries D7's unconditional ring with no opt-out prop.

- [x] **Step 1: Write the failing tests.** `MoneyDisplay` renders through `formatAgorot`, takes a
      semantic tone bound to `--debt`/`--paid`/`--pending`/`--cancelled` (never a hex, G13), and
      the amount is never conveyed by colour alone (SC 1.4.1). `DateRangePicker` uses **logical
      properties only** (G12/D10) and renders correctly in both `he` and `en` — the repo's
      `testing.tsx` helper renders in both directions.
- [x] **Step 2: Run them** → FAIL.
- [x] **Step 3: Implement.** Leaf primitives only — no composite rows, no screens.
- [x] **Step 4: Run them** → PASS. `npm --prefix web run lint` (the D10 ESLint rule and stylelint).
- [x] **Step 5: Commit.** `feat(ui): MoneyDisplay and DateRangePicker leaf primitives`

## Task 11 — W4 contract: billing, events and belts models

**Files:** Create `app/models/billing.py`, `app/models/events.py`, `app/models/belts.py`. Test
`tests/contracts/test_w4_models.py`.

- [x] **Step 1: Write the failing test.** **Every money column is `*_agorot` and `Integer`** —
      assert it by reflection over the three modules, so invariant 1 has real columns to bite on
      (G2). `payment_order.public_ref` is a UUID with a unique index (§5.10 — a sequential id
      here lets anyone mark any tuition paid). `charge` has the §5.10 idempotency key
      `UNIQUE(enrollment_id, period_year, period_month, kind)` so a re-run creates no duplicates.
      `belt_rank.color_hex` is data, not a token (D3).
- [x] **Step 2: Run it** → FAIL.
- [x] **Step 3: Implement** all eleven billing tables plus events and belts.
- [x] **Step 4: Run it** → PASS, plus `tests/invariants`.
- [x] **Step 5: Commit.** `feat(contract): W4 billing, events and belts models`

## Task 12 — W4 contract: schemas + the two BillingService seams

**Files:** Create `app/schemas/{billing,events,belts}.py`, `app/services/billing/__init__.py`.

**Interfaces produced:**
```python
BillingService.create_charge(
    studio_id: UUID, payer_person_id: UUID, kind: ChargeKind,
    amount_agorot: int, due_date: date, *,
    student_id: UUID | None = None, event_id: UUID | None = None,
) -> Charge
BillingService.recompute_charge_status(charge_id: UUID) -> None
```
`recompute_charge_status` is **the one place `charge.status` is maintained** (§4.3). M7's event
fees are a pure caller of `create_charge`.

- [x] **Step 1: Write the failing test** asserting both signatures exactly, including
      keyword-only-ness of `student_id`/`event_id`.
- [x] **Step 2: Run it** → FAIL.
- [x] **Step 3: Implement**, empty bodies.
- [x] **Step 4: Run it** → PASS. `.venv/bin/mypy app`.
- [x] **Step 5: Commit.** `feat(contract): W4 schemas and the BillingService seams`

## Task 13 — W4 i18n: billing + events (belts inside events)

**Files:** `web/packages/i18n/{he,en,ru}/{billing,events}.ts`.

- [x] **Step 1:** Hebrew from `12f` תשלומים (**D9.3** — titled תשלומים, not קבלות ותשלומים, and
      the email affordance is card-rows-only), `3e` תשלומים וגבייה, `5a` מחירים ומסלולים,
      `7a`/`7b`/`7c` אירועים (**D9.2** — no משקל/קטגוריה strings), `5b` מערכת חגורות,
      `12d` התקדמות חגורה. **Belt strings go into `events.ts` under `belt.*`** — there is no
      `belts` namespace and `index.ts` is not editable.
- [x] **Step 2:** Mirror to `en`/`ru`.
- [x] **Step 3:** Parity per namespace.
- [x] **Step 4: Commit.** `feat(i18n): billing and events namespaces, belts under events.belt.*`

## Task 14 — uPay: IPN parsing and the four §5.10 security verdicts, TDD

**Files:** Create `app/integrations/upay/callback.py`. Test `tests/upay/test_callback.py`.

> **There is no HMAC.** `upay-integration.md` marks "no signature exists on any request, inbound
> or outbound" as **[VERIFIED]** in both rounds. This task builds what §5.10 actually mandates.
> **Not built here:** the payment-order flow and reconciliation — those are M6's.

**Interfaces produced:** `IpnPayload` (frozen dataclass, all 31 round-two fields) ·
`parse_ipn(raw: Mapping[str, str]) -> IpnPayload` ·
`verify_ipn(payload, *, expected_amount_agorot, known_public_ref, seen_transaction_ids) -> IpnVerdict`
where `IpnVerdict` is `success | amount_mismatch | forged_ref | duplicate`.

- [x] **Step 1: Write four failing tests, one per §5.10 security case**, each built from
      `ipn.build_ipn_query(shape=...)` so the simulator and the parser are tested against the
      same bytes:
      - `success` → verdict `SUCCESS`, amount parses to exactly `expected_amount_agorot`.
      - `amount_mismatch` → verdict `AMOUNT_MISMATCH` at a **one-agora** difference; the payload
        still carries the real amount received, because §5.10 records a payment for it.
      - `forged_ref` → verdict `FORGED_REF`; a well-formed UUID that matches no order.
      - `duplicate` → verdict `DUPLICATE` on a repeated `transactionid`, byte-identical otherwise.
      Plus: the tamper appears in **both** `amount` and `depositamount` (round two B10), so a
      parser reading either must reach the same verdict; and a whole-shekel `amount=1` must
      **not** be a mismatch against `1.00` — that regression would fire a fraud alert on every
      correct payment in the product.
- [x] **Step 2: Run them.** `.venv/bin/pytest tests/upay/test_callback.py -q` → FAIL.
- [x] **Step 3: Implement.** Parse into dataclasses, no models. Compare **integers** via
      `agorot_from_ipn_amount`, never strings. An unrecognised amount format raises rather than
      coercing. Source IP is a returned signal field, **never a gate**.
- [x] **Step 4: Run them** → PASS. `.venv/bin/mypy app`.
- [x] **Step 5: Commit.** `feat(upay): IPN parsing and the four §5.10 security verdicts`

## Task 15 — W5 contract: comms + reports models, schemas, NotificationService seam

**Files:** Create `app/models/comms.py`, `app/models/reports.py`, `app/schemas/comms.py`,
`app/schemas/reports.py`, `app/services/comms/__init__.py`.

**Interfaces produced:**
`NotificationService.enqueue(person_id: UUID, kind: str, title: str, body: str, payload: dict) -> Notification`
— M9's at-risk and retention jobs are pure callers.

- [x] **Step 1: Write the failing test.** `notification_delivery.status` includes `no_token` and
      `denied` — §5.11/§12: push is opt-in, so **some parents will never receive alerts** and the
      delivery report is how the office learns who to phone. `calendar_feed.token` is unique
      (the feed URL is the only credential). Seam signature asserted.
- [x] **Step 2: Run it** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run it** → PASS. `.venv/bin/mypy app`.
- [x] **Step 5: Commit.** `feat(contract): W5 comms and reports models, schemas and the notify seam`

## Task 16 — W5 i18n: comms + reports (privacy inside reports)

**Files:** `web/packages/i18n/{he,en,ru}/{comms,reports}.ts`.

- [x] **Step 1:** Hebrew from `2b` עדכוני מועדון (**D9.1** — inbox only, **no chat strings**),
      `4f` הודעות, `4g` דוחות. **Privacy strings go into `reports.ts` under `privacy.*`.**
- [x] **Step 2:** Mirror to `en`/`ru`. **Step 3:** Parity. **Step 4: Commit.**
      `feat(i18n): comms and reports namespaces, privacy under reports.privacy.*`

## Task 17 — `e2e/`: SPEC §13's five flows as specs

**Files:** Create `e2e/playwright.config.ts` and five `e2e/*.spec.ts`.

> These **will fail** — the implementations do not exist. That is correct and expected. They are
> written now so each wave's exit gate is a file that already exists rather than one written
> under pressure at the end of the wave.

- [ ] **Step 1:** `e2e/01-registration-to-active.spec.ts` — public registration → health
      declaration → manager approval → student active (W2/W3 gate).
- [ ] **Step 2:** `e2e/02-offline-attendance.spec.ts` — coach marks **offline** → reconnects →
      marks sync → dashboard reflects them (W3 gate).
- [ ] **Step 3:** `e2e/03-upay-happy-path.spec.ts` — parent selects 3 months → uPay order →
      simulated IPN → charges settled → parent sees paid (W4 gate).
- [ ] **Step 4:** `e2e/04-forged-ipn.spec.ts` — forged/tampered IPN → `amount_mismatch` →
      charges **not** settled → manager alerted (W4 gate).
- [ ] **Step 5:** `e2e/05-schedule-change.spec.ts` — manager changes a group's schedule → future
      sessions update, **past and `is_manually_edited` sessions do not** (W2 gate).
- [ ] **Step 6: Commit.** `test(e2e): SPEC §13's five flows, ahead of their implementations`

## Task 18 — `docs/design/specs/`: component specs for M2–M9 artboards

**Files:** Create `docs/design/specs/*.md`, one per artboard, plus a `README.md` index.

> **D10 corollary: prose and structure, never copy-pasted canvas CSS.** The exported canvas CSS
> is a visual reference only. Each spec records: structure, states, tokens used, RTL behaviour —
> and notes the ▲ D9 corrections where they apply (`2b` chat cut, `7c` weight column cut, `12f`
> retitled) and the D12 correction on `4h`'s `בוטל` chip.

- [ ] **Step 1:** Specs for W2's artboards — `9a`, `9b`, `1d`, `3a`, `6a`, `4b`, `12b`;
      `13a`–`13c`, `12j`, `12g`, `12i`, `2c`, `11b`, `9c`, `9h`, `3b`, `3c`, `4a`, `6c`.
- [ ] **Step 2:** W3's — `2a`, `12a`, `1c`, `9f`, `9g`, `2d`, `4c`, `1e`, `12c`, `4e`.
- [ ] **Step 3:** W4's — `1b`, `12e`, `12f`, `11a`, `3e`, `5a`, `5e`; `12d`, `12h`, `7d`, `9d`,
      `9i`, `7a`, `7b`, `7c`, `6b`, `4d`, `5b`, `5d`.
- [ ] **Step 4:** W5's — `2b`, `4f`, `4g`.
- [ ] **Step 5: Commit.** `docs(design): component specs for the M2–M9 artboards`

## Task 19 — Migration drafts (plain files, NOT alembic revisions)

**Files:** Create `docs/plan/migrations/w{2,3,4,5}-draft.py`.

> `main` owns `alembic/versions/**` and a hook blocks the edit. Each draft still has to become a
> **real revision on main, one per wave, chained in order** — W2 → W3 → W4 → W5.

- [ ] **Step 1:** Write the four drafts, each naming its `down_revision` as the previous wave's.
- [ ] **Step 2:** Note in each header that it is a draft, not a revision.
- [ ] **Step 3: Commit.** `docs(plan): migration drafts for W2–W5, one per wave`

## Task 20 — Verification

> **The gate is narrower than `pytest -q`, and deliberately so** (decided 2026-08-25 —
> see § Session log, deviation 1). This branch adds ~30 tables to `Base.metadata` and
> cannot create the Alembic revision that would put them in the database: `main` owns
> `alembic/versions/**` and `.claude/hooks/block-protected.sh` refuses the edit. Task 19
> writes drafts instead. So every test that reflects metadata against a live database is
> red here **by construction**, and stays red until `main` lands the per-wave revisions.
> A gate that cannot go green is not a gate — it is a thing people learn to ignore.
>
> Run the scoped commands below. Then confirm the residue is *only* the known set, so a
> genuine new breakage cannot hide inside it.

- [ ] `.venv/bin/pytest tests/contracts tests/invariants tests/restrictions tests/structure tests/upay -q`
- [ ] `cd web && npx vitest run --reporter=dot` — from `web/`, not the repo root: these
      specs resolve fixture paths from `cwd`, and `--root web` from above makes six files
      fail on ENOENT that pass from inside.
- [ ] `npm --prefix web run typecheck && .venv/bin/mypy app`
- [ ] `.venv/bin/ruff check --fix app tests && .venv/bin/ruff format app tests && npm --prefix web run lint`
- [ ] `for ns in schedule people health attendance billing events comms reports; do node web/scripts/i18n-parity.mjs $ns; done`
- [ ] `.venv/bin/pytest -q` **for the count only.** Expected residue at the end of this
      plan: the `tests/dev/**` family plus
      `test_alembic_baseline.py::test_the_migrations_match_the_models` (the migration
      gap), and the five failures inherited from `fad71db` listed in deviation 4. Any
      failure outside that set is this session's, and is a real one.

---

## Self-review notes

- **Spec coverage.** W2/W3/W4/W5 contract tables → Tasks 1–6, 11–13, 15–16. `web/packages/core`
  → 7–9. `web/packages/ui` → 10. uPay §5.10 → 14. §13 E2E → 17. Canvas specs → 18. Migrations →
  19.
- **Deliberately out of scope, per the session brief:** the offline queue (M5 owns
  `web/packages/core/src/offline/**`), the payment-order flow and reconciliation (M6), composite
  containers `StudentRow`/roster row, and anything under `web/apps/**`.
- **Known deviations from the milestone plan's letter**, all forced and all recorded above:
  `belts.ts`/`privacy.ts` namespaces do not exist and cannot be added; uPay has no HMAC; four of
  five named primitives already exist.


---

## Session log

Written by the session that resumed this plan on 2026-08-25 from an uncommitted Task 11.
Tasks 1–11 were already done, in seven commits from `b917227` to `833365d`, with no
checkbox ticked — the commit log was the only progress record. The boxes above now match
the commits.

| Tasks | Commit |
|---|---|
| 1–2 · W2 models, schemas, ScheduleService seam | `fc259e2` (+ `449f713`, PEP 695 refactor) |
| 3 · W2 i18n | `6d52563` |
| 4–5 · W3 models, schemas, health seams | `5d6caf2` |
| 6 · W3 i18n | `1cea2e9` |
| 7–9 · core: money, datetime, pagination, permissions | `bb2923e` |
| 10 · ui: MoneyDisplay, DateRangePicker | `833365d` |
| 11 · W4 billing, events, belts models | `c23e3e8` |

### Deviations and findings

**1. Task 20's gate is scoped, not full-suite.** Rewritten above with the reasoning.
Approved by the repo owner rather than assumed.

**2. Invariant 1 was red from `fc259e2` onward, for six commits** — `9d18139`. Task 1
Step 4 says to run `tests/invariants`; the result went unread. Two columns tripped the
money-naming rule and neither is money: `enrollment.price_plan_id` is a reference, and
`upay_ipn_record.amount` is uPay's inbound rendering kept as evidence. The detector was
made narrower in two named ways, each paired with a test proving it still fires on what
the narrowing does not cover. It was **not** weakened into silence.

**3. Two M1 boundary markers were retired** — `f1005c5`. Both asserted "not built yet"
about tables this plan builds on purpose, and both named their own expiry in their
docstrings. This is the plan's own C3 note firing exactly as predicted; the removal was
reported and approved, and a comment stands where each test did. G7's live protection is
unchanged and is enumerated in that commit message.

**4. Five failures pre-date this branch entirely.** At the fork point `fad71db` — the W1
session's tip, before any contract work — the suite already had these, and they are
**not** the migration gap:

- `tests/identity/test_auth_context.py` — four failures. Pure middleware and JWT, no
  database involved. Belongs to whoever owns M1.
- `tests/core/test_alembic_baseline.py::test_the_demo_studio_row_exists_after_migration`

They are not this plan's to fix — `web/apps/**` and M1's identity code are outside the
ownership boundary — but they should reach the W1 session rather than sit here unmentioned.

**5. A real bug, found and fixed in Task 11** — `c23e3e8`. `payment` and
`upay_ipn_record` reference each other and both directions are §4.3 columns, so the cycle
is real. Unresolved, SQLAlchemy drops both constraints from its topological sort, which
left `DemoStudioService.wipe_plan()` deleting those two tables in an arbitrary order and
would have emitted `CREATE TABLE` in an order Postgres rejects. `use_alter` on the
reconciliation side, with an explicit constraint name so Alembic can drop it.
