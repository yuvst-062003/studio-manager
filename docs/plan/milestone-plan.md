# Studio Manager — Parallel Milestone Plan

> **For agentic workers:** this is a *milestone* plan, not a task plan. It defines waves,
> lanes, ownership and gates. The per-task TDD breakdown for a lane is written inside that
> lane's worktree, at the start of that lane, using `superpowers:writing-plans`.
> Lane setup and opening prompts: [lanes.md](lanes.md). Agent roster: [agents.md](agents.md).

**Goal:** Re-cut SPEC.md §14's existing M0–M11 into a wave-and-lane execution plan where all
three surfaces advance in every feature milestone, the sequential core lands on main before
any lane starts, and every lane has a single runnable check.

**Architecture:** Eight waves. Waves 0, 1, 6 and 7 are sequential on `main` — nothing about
them is parallelisable and pretending otherwise buys merge conflicts. Waves 2–5 each run
**two build worktrees plus one review session**, paired by feature vertical. Every wave opens
with a *contract commit* on `main` — models, one Alembic revision, Pydantic schemas,
regenerated `api-client`, i18n namespaces and slot registries — after which the lanes never
touch a shared file.

**Tech Stack:** FastAPI · SQLAlchemy · Alembic · PostgreSQL 16 · Redis/ARQ · React 19 +
TS 5.9 · Vite · npm workspaces · Workbox + Dexie · installable PWAs, no native shell · Railway.

**Spec:** [SPEC.md](../../SPEC.md) — especially §4.3, §8.2, §10, §13, §14, §15.
Design law: [docs/design/decisions.md](../design/decisions.md) D1–D10.
Artboards: [docs/design/canvas/INVENTORY.md](../design/canvas/INVENTORY.md).

---

## Global Constraints

Every task in every lane inherits these. Copied verbatim from their sources.

| # | Constraint | Source |
|---|---|---|
| G1 | Python tooling is in `.venv/`. Always the `.venv/bin/` prefix — a bare `python3`/`pytest` resolves to an old 3.8 interpreter earlier on PATH. | CLAUDE.md §Commands |
| G2 | Money is **always** an integer count of agorot. Never a float, never a decimal. A lint rule and a model-level test reject float columns on any money field. | SPEC §8.3 |
| G3 | Timestamps are **always** stored UTC `timestamptz`; rendered in `Asia/Jerusalem` **regardless of locale**. | SPEC §8.3, §9 |
| G4 | No user-facing string is ever inlined in a component. Everything goes through the i18n package. | SPEC §8.3 |
| G5 | New API endpoints are versioned under `/api/v1/`. | CLAUDE.md §Conventions |
| G6 | Routers stay thin — parse, call a service, return. All business logic in `app/services/`. | SPEC §7, CLAUDE.md |
| G7 | Health declarations contain personal data about minors. **Never log their contents.** Coaches see `derived_flags` booleans only. | CLAUDE.md §Gotchas, SPEC §5.5 |
| G8 | No automated recurring billing. הוראת קבע mandates **cannot** be created in code; they are marked paid manually, same flow as bank transfers. | CLAUDE.md §Gotchas, SPEC §12 |
| G9 | Every tenant-scoped table carries non-null `studio_id` with a leading composite index. Bypassing `TenantMixin` requires the explicit `.with_all_tenants()` escape hatch. | SPEC §4.2 |
| G10 | Every belt bar carries a **1px ring in the current foreground colour** — `#17150f` on light, `#fffefb` on dark. Never fill-only. | D7 |
| G11 | `#6f6b62` is the floor for any **light-mode** text token. `#a8a49a` and `#8f8b82` are **dark-mode-only** tokens. `#7a766d` is retired outright. | D8 |
| G12 | Physical CSS properties (`margin-left`, `padding-right`, `left:`, `right:`) are banned by ESLint in all frontend source. Exported canvas CSS is a **visual reference only** — never copy-pasted. | D10 |
| G13 | Colours live in named tokens, never hardcoded hex. Semantic tokens (debt · paid · pending · cancelled · danger · focus ring) are **never overridable**. | D1, D2 |
| G14 | Typeface is **Rubik**, one family, weights 300/400/500/600/700. It is the only family covering Hebrew + Latin + base Cyrillic. | D6 |
| G15 | Soft-delete (`deleted_at`) on user-generated content. Hard delete only via anonymization. No PII is ever denormalized into a financial row. | SPEC §8.3, §11.4 |
| G16 | Every list endpoint is cursor-paginated. Every mutating endpoint accepts an optional `Idempotency-Key`. | SPEC §8.3 |
| G17 | **Both apps are installable PWAs — no App Store, no Play listing.** On iOS, Web Push exists only for a home-screen web app, and there is no way to *trigger* an install (`beforeinstallprompt` is Chromium-only). Treat the install as part of onboarding, never an afterthought. | §6.5, §12 |
| G18 | A failing test is written before any bug fix. Prefer a single test file over the full suite during development. | CLAUDE.md §Workflow, SPEC §13 |

---

# Part 1 — Step 0: dependency analysis

Run before splitting anything, per Part 4 of [claude-code-guide.md](../../claude-code-guide.md).

## 1.1 The hypothesis, tested

The prompt proposed that **splitting by surface is probably wrong** and **splitting by feature
vertical is probably right**. Both halves hold, but for a sharper reason than "shared files".

### Surface cut — refuted

Under SPEC §8.2 the frontend is three apps over four shared packages:

```
web/packages/{api-client, ui, core, i18n}
web/apps/{staff, parent, dashboard}
```

A parent-lane, a staff-lane and a dashboard-lane would each need to add attendance endpoints,
attendance services and attendance models. Concretely, all three would write to:

| Shared file | Why all three surface-lanes need it |
|---|---|
| `app/models/attendance.py` | every surface reads attendance |
| `app/services/attendance/*.py` | §7 has one `POST /attendance/batch` for all callers |
| `alembic/versions/*` | one `attendance` table, three lanes wanting it |
| `web/packages/ui/**` | `StudentRow`, `BeltBar`, `StatusChip` are used by all three apps |
| `web/packages/core/**` | the offline queue is imported by staff *and* parent |
| `web/packages/i18n/**` | one `he.ts` (CLAUDE.md) or one `he/` tree (§8.2) |

That is six shared-file collisions on a single feature. **Refuted.** Worse, a surface cut
produces exactly the failure mode the prompt forbids: the parent lane would be idle for the
whole of M9, and the dashboard lane idle for the whole of M5's offline work.

### Feature-vertical cut — confirmed, with a correction

Each vertical touches all three surfaces at once — which *is* what "advance all three
together" means — and §14 is already sliced this way. Verified against the schema: §4.3's
tables cluster cleanly into verticals with almost no cross-vertical FKs beyond `studio_id`,
`person_id` and `student_id`, all of which are stable after M1.

**The correction:** because §14's milestones *are already* feature verticals, "split by
feature vertical" cannot mean splitting one milestone in two. It means **running two
milestones concurrently**. The unit of parallelism is a milestone, not a slice of one. That
is what makes the wave structure below the plan rather than a decoration on it.

## 1.2 Pairwise collision matrix

Every adjacent milestone pair, tested for shared files, shared tables, shared migrations, and
the contract that must exist first.

| Pair | Files both touch | Shared tables / migration | Contract needed first | Verdict |
|---|---|---|---|---|
| **M2 Schedule ∥ M3 People** | none after the seams below | `session` (M3 reads) | `session` model + `ScheduleService.materialize_sessions()` + `GET /sessions` | **parallel** — M3 is a pure reader |
| **M4 Health ∥ M5 Attendance** | roster row (`1c`/`9f`) if health writes the badge | `student.health_status` (M4 writes, M5 reads) | `student.health_status`, `health_declaration.derived_flags`, roster bootstrap schema | **parallel** — see 1.3, this is the seam that needed a decision |
| **M6 Money ∥ M7 Events** | none after the seams below | `charge` (M7 creates event fees) | `charge` model + `BillingService.create_charge(kind=...)` | **parallel** — M7 is a pure caller |
| **M8 Comms ∥ M9 Reports** | none after the seams below | `notification` (M9's at-risk job enqueues) | `notification` model + `NotificationService.enqueue()` | **parallel** |
| M1 ∥ anything | `person`, `role_assignment`, both app shells, both nav drawers | everything | — | **sequential** — M1 *is* the contract |
| M10 ∥ anything | every file under `web/` | — | — | **sequential** — an a11y/visual sweep touches everything by definition |
| M3 ∥ M4 (if paired instead) | trial declaration write path | `health_declaration` | — | avoid — see §3.2 conflict C3 |

## 1.3 The four shared-file seams, and the mechanism for each

Three rules from Part 4, applied literally.

> **Migrations serialize. One lane owns the schema.**
> **Shared types land on main BEFORE lanes start.**
> **One owner per file. Assign directories, not tasks.**

Every wave therefore opens with a **contract commit** on `main`. Nothing in it is speculative
— §4.3 already specifies every table and §7 already specifies every endpoint, so the whole
wave's schema is knowable before either lane starts.

### Seam 1 — Alembic

`main` owns `alembic/versions/**` outright. One revision per wave, authored in the contract
commit, before the worktrees are created. Lanes never run `alembic revision`.

This is already enforced deterministically: [`.claude/hooks/block-protected.sh`](../../.claude/hooks/block-protected.sh)
denies any `Edit`/`Write` to `*/alembic/versions/*` with exit code 2. That hook is the reason
this rule will actually hold rather than being a sentence in a doc.

### Seam 2 — module registration

`app/main.py` and `app/models/__init__.py` are edited by every vertical, which makes them a
guaranteed conflict on every merge. Replace both with discovery, in M0:

```python
# app/models/__init__.py — final content, never edited again
import importlib, pkgutil
from app.models.base import Base  # noqa: F401

for _m in pkgutil.iter_modules(__path__):
    if not _m.name.startswith("_"):
        importlib.import_module(f"{__name__}.{_m.name}")
```

```python
# app/main.py — router mounting, never edited again
import importlib, pkgutil
from fastapi import APIRouter
import app.routers

v1 = APIRouter(prefix="/api/v1")
for _m in pkgutil.iter_modules(app.routers.__path__):
    if _m.name.startswith("_"):
        continue
    if _m.name == "dev" and settings.ENV == "production":
        continue          # §19.6 — the router does not exist in prod, not merely guarded
    v1.include_router(importlib.import_module(f"app.routers.{_m.name}").router)
app.include_router(v1)
```

A lane adds `app/routers/attendance.py` and it mounts. No shared file changes.

### Seam 3 — i18n

CLAUDE.md says *"Hebrew user-facing strings live in `web/src/i18n/he.ts`"*. A single file is a
guaranteed merge conflict on every wave, because both lanes add Hebrew strings in every task.
SPEC §8.2's `packages/i18n/he.ts` has the same problem.

**Split by namespace in M0:**

```
web/packages/i18n/
├── index.ts              main only — re-exports, never edited by a lane
├── he/{common,schedule,people,health,attendance,billing,events,comms,reports}.ts
├── en/…  ru/…            same namespaces
```

One namespace file per vertical per locale. Lane `attendance` owns `*/attendance.ts` in all
three locales and nothing else. `index.ts` is authored once in M0 with every namespace already
listed, including ones whose files are still empty stubs — so no lane ever has to touch it.

> Hebrew is the reference locale; missing keys in `en`/`ru` fall back to Hebrew and are
> reported per-locale (§9). `scripts/i18n-parity.mjs` (M0) runs that check scoped to one
> namespace so it is part of a lane's own check, not just CI's.

### Seam 4 — composite screens

Five artboards are composed of sections owned by *different* verticals. These are the only
places where the "one owner per file" rule needs help.

| Artboard | Container owner | Sections, and who owns each |
|---|---|---|
| parent `2c` student card | M3 | belt strip (M7) · attendance strip (M5) · documents strip (M4) · payment strip (M6) |
| staff `1c` / `9f` roster row | M5 | health badge (renders M4's `derived_flags`) · item-handout action (M6) |
| dashboard `6c` alert centre | M3 | approval cards (M3) · conflict cards (M5) · reconciliation cards (M6) · at-risk cards (M8) |
| dashboard `5c`–`5f` setup wizard | M1 | step 2 belts (M7) · step 4 prices (M6) |
| the dev bar (§19.4) | M0 | offline/slow (M5) · time travel (M6) · run-a-job (M6/M8) · simulate IPN (M6) |

**Mechanism — a slot registry, landed in M0, one per composite:**

```ts
// web/packages/ui/src/slots.ts — main only, authored once in M0
export type SlotId =
  | 'student-card' | 'roster-row' | 'alert-centre' | 'setup-wizard' | 'dev-bar'

type Entry = { key: string; order: number; render: React.FC<any> }
const registry = new Map<SlotId, Entry[]>()

export function registerSlot(slot: SlotId, entry: Entry) {
  const list = registry.get(slot) ?? []
  list.push(entry); list.sort((a, b) => a.order - b.order)
  registry.set(slot, list)
}
export function useSlot(slot: SlotId) { return registry.get(slot) ?? [] }
```

A lane adds one file — `web/apps/parent/src/features/health/DocumentsStrip.tsx` — which calls
`registerSlot('student-card', …)` at module load, and one line in its own feature barrel. The
container file is never reopened. Where the section needs data, it reads a field the contract
commit already added to the payload; it never asks the container to fetch for it.

> **This is the mechanism that makes the M4 ∥ M5 pairing safe.** The health badge on the
> roster is not a health-lane edit to an attendance-lane file. The attendance lane renders
> `<HealthBadge status={row.health_status} flags={row.derived_flags} />` from two fields the
> contract commit put in `GET /sync/bootstrap`; the health lane owns the component and the
> code that populates those two fields. Neither lane opens the other's file.

## 1.4 Build order

```
SEQUENTIAL ─────────────────────────────────────────────────────────────────
  W0  M0  Foundations              main        ← tokens, tenancy, dev bar, Play test
  W1  M1  Identity & structure     main        ← person/roles/classes/groups/shells

PARALLEL (2 build lanes + 1 review session per wave) ────────────────────────
  W2  contract → M2 Schedule  ∥  M3 People & funnel
  W3  contract → M4 Health    ∥  M5 Attendance
  W4  contract → M6 Money     ∥  M7 Events & belts
  W5  contract → M8 Comms     ∥  M9 Reports & privacy

SEQUENTIAL ─────────────────────────────────────────────────────────────────
  W6  M10 Rollover & polish        main + fan-out for the mechanical sweep
  W7  M11 Launch                   main        ← production cutover, no store queue
```

**Why two lanes and not three.** Part 4 is explicit: *"parallelism doesn't multiply your
output, it multiplies your review load, and your review bandwidth is fixed."* Two build lanes
plus a dedicated review session is three concurrent sessions — the stated ceiling — and it
spends the third on **verification rather than building**, which is the guide's stated
preference. A third build lane would mean reviewing three diffs against a spec while writing
none of them.

---

# Part 2 — The wave plan

## 2.1 Overview

| Wave | Milestones | Mode | Lanes | Exit gate |
|:--:|---|---|:--:|---|
| **W0** | M0 Foundations | sequential | 1 | `lane-check.sh core` green · **all three apps install to a home screen and run standalone** |
| **W1** | M1 Identity & structure | sequential | 1 | both apps sign in, refuse correctly, and route to the wizard |
| **W2** | M2 ∥ M3 | parallel | 2 + review | **E2E-5** (schedule change) + **E2E-1a** (registration → approval → active) |
| **W3** | M4 ∥ M5 | parallel | 2 + review | **E2E-2** (offline attendance → sync) + **E2E-1** complete (with health) |
| **W4** | M6 ∥ M7 | parallel | 2 + review | **E2E-3** (uPay happy path) + **E2E-4** (forged IPN) |
| **W5** | M8 ∥ M9 | parallel | 2 + review | announcement delivered to push + inbox; every report exports |
| **W6** | M10 Rollover & polish | sequential + fan-out | 1 | all 61 artboards pass the a11y/RTL sweep in `he` and `en`, light and dark |
| **W7** | M11 Launch | sequential | 1 | production cutover done; the iOS install walkthrough validated on real parents' phones |

E2E flow numbering is SPEC §13's, unchanged.

## 2.2 The contract commit

Identical shape every wave. Authored on `main`, reviewed, pushed, **then** the worktrees are
created. Anything discovered mid-wave that belongs here is a **stop-and-tell**, not a lane edit.

1. `app/models/<vertical>.py` for both lanes' verticals — full §4.3 columns, `TenantMixin`,
   composite indexes leading with `studio_id`.
2. **One** Alembic revision covering both verticals. `.venv/bin/alembic upgrade head` clean on
   a fresh database and on the previous wave's database.
3. `app/schemas/<vertical>.py` — Pydantic in/out models for every §7 endpoint in the wave.
4. Empty-bodied service classes with **real signatures and real return types** for anything the
   *other* lane calls (the cross-lane seam functions named in 1.2). Each raises
   `NotImplementedError` and has a test asserting the signature.
5. `npm run generate:api-client` → committed. A diff in generated output that is not committed
   fails CI (§8.2).
6. i18n namespace files created empty for both verticals, in all three locales.
7. Slot registrations for any composite section either lane will fill.
8. `tests/<vertical>/conftest.py` with the fixtures both lanes need.

---

# Part 3 — Milestones

Each milestone lists: what lands on main first · which lane owns what, as directory globs ·
the artboards delivered, by surface · the lane's verification command · what merges when.

Ownership globs use the SPEC §8.2 layout with one added convention, defined in M0:
`app/services/<vertical>/`, `app/routers/<vertical>.py`, `app/models/<vertical>.py`,
`web/apps/<app>/src/features/<vertical>/`, `web/packages/i18n/<locale>/<vertical>.ts`,
`tests/<vertical>/`.

---

## W0 · M0 — Foundations — **sequential only**

**Why sequential:** M0 *is* the shared substrate. Every seam mechanism in §1.3, the token
layer, the tenancy layer and the test harness are things lanes depend on existing. There is
nothing here two lanes could own without owning each other's files.

**Delivers**

- Monorepo per §8.2 · npm workspaces · CI (typecheck, lint, pytest, vitest, generated-client
  diff, i18n parity, dependency + secret scanning)
- Railway environments (dev / staging / production) with a public HTTPS staging URL — §15 #3,
  needed by M6 and worth having early
- Alembic baseline · `TenantMixin` + `TenantSession` + `.with_all_tenants()` escape hatch (§4.2)
- AES-256-GCM envelope with versioned keys in Railway secrets (§11.1) — needed by M3's
  `registration_request.payload_encrypted`, not just M4
- Append-only `audit_log` with the DB role holding `INSERT` and no `UPDATE`/`DELETE` (§11.2)
- Log scrubber, plus the invariant test that sensitive fields never serialize into log output
- **i18n scaffolding, namespaced** per §1.3 seam 3, all three locales
- **Design token layer + UI primitives, ported from artboard `4h`** — D2's three tiers, D7's
  belt ring, D8's corrected text tokens, D6's Rubik loading strategy
- **The D10 ESLint rule**, before the first component exists
- The demo studio seed, the developer account, the dev bar and its slot registry (§19)
- The four seam mechanisms from §1.3
- **The PWA install layer** (§6.5) — Web App Manifest per app, icon and splash sets, Workbox
  service worker registration, a `display-mode: standalone` check, and
  `navigator.storage.persist()` requested on the staff app

**No store clock any more, and that is the point**

The earlier version of this plan opened with a Google Play skeleton on day one, because a new
personal developer account must run a closed test with 12 testers for 14 consecutive days
before publishing. **§6.5 now ships installable PWAs and no store build**, so that clock is
gone, along with both developer accounts and App Store review. Nothing in M0–M10 changed —
the apps were always PWAs; the wrappers were only wrappers.

What replaces it is smaller but not free. On iOS, Web Push exists **only** for a home-screen
web app, and iOS gives you no way to trigger an install. So the install has to be *taught*,
and that work is spread across M0 (the manifest layer), M1 (the iOS walkthrough in first run)
and M8 (install-state reporting beside push delivery).

**No §15 item blocks M0 any more.** Item 9, the `ru` translation source, was answered —
machine translation was approved and `ru/common.ts` reached parity with `he`. What remains
is the native-speaker read, which only gates tightening `i18n-parity.mjs` from `report` to
`strict`, and `HB-ru-review` files that under **M11**.

**Item 5**, a stable HTTPS domain, was repointed to **W1** on 2026-08-25. It was filed under
M0 for the trust reason — an invitation link people install from should not be a random
subdomain — but the binding constraint is auth, not install. `up.railway.app` is a public
suffix, so the app hosts and the api host are different sites and §11.7's refresh cookie is
third-party across them; Safari drops it and an iPhone session cannot renew past the
15-minute JWT. M0 ships no auth, M1 does. See `infra/railway/README.md` § The domain.

**Artboards** — dashboard `4h`.

> **This is the one milestone exempt from the three-surface rule, and legitimately so.** `4h`
> *is* the cross-surface artboard: decisions.md calls it *"the highest-value artboard for the
> code port — the intended source for the token and component layer."* Every one of the other
> 60 artboards sits on what M0 builds. The three-surface check applies from M1 on.

**Verification** — `./scripts/lane-check.sh core`, which M0 itself delivers:

```bash
#!/usr/bin/env bash
# scripts/lane-check.sh <vertical>   —   the one command every lane runs
set -euo pipefail
V="${1:?usage: lane-check.sh <vertical>}"
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "── invariants (SPEC §13) ──"
.venv/bin/pytest tests/invariants -q

echo "── backend · $V ──"
.venv/bin/pytest "tests/$V" -q

echo "── types · $V ──"
.venv/bin/mypy "app/services/$V" "app/routers/$V.py" "app/models/$V.py"

echo "── frontend · $V ──"
npx vitest run --reporter=dot \
  "web/apps/*/src/features/$V/**/*.test.tsx" \
  "web/packages/core/src/$V/**/*.test.ts"

echo "── lint · $V ──"
.venv/bin/ruff check "app/services/$V" "app/routers/$V.py"
npx eslint "web/apps/*/src/features/$V/**" "web/packages/i18n/*/$V.ts"

echo "── i18n parity · $V ──"
node scripts/i18n-parity.mjs "$V"

echo "✅ lane $V green"
```

`tests/invariants/` holds §13's five non-negotiables and runs in **every** lane, every time:

1. no money column is a float
2. every tenant-scoped table has `studio_id` and a leading composite index
3. no coach-scoped endpoint returns any financial field
4. health data never appears in serialized log output
5. the billing run is idempotent across repeated executions

(3 and 5 assert vacuously true until M6 lands the endpoints and the run — that is correct.
They must exist from M0 so no lane can land the first violation unnoticed.)

**Merge order** — everything on `main`. No worktrees exist yet.

---

## W1 · M1 — Identity & structure — **sequential only**

**Why sequential:** M1 defines `person`, `auth_identity`, `role_assignment`, both app shells,
both nav drawers and the studio setup wizard container. Every later lane imports all of it.
Two lanes here would collide on the shells, the drawers, the auth dependency and the JWT claims.

**Delivers**

- Google + Apple OAuth as a **standard top-level redirect** with server-side PKCE exchange.
  Never a webview — Google returns `disallowed_useragent` (§5.2). A home-screen web app on
  iOS runs the redirect in its own standalone context: **verify on a real device that the
  session survives the round trip**, because this is the one place install mode changes auth
  behaviour. Apple sign-in is no longer mandatory (Guideline 4.8 binds App Store builds only)
  but stays, because retrofitting it later would be an identity migration
- Access JWT 15 min carrying `identity_id` / `active_studio_id` / role snapshot; rotating
  30-day refresh with reuse detection and a revocation denylist
- Account linking, with Apple private-relay addresses stored as-is and **never used for
  matching** (§5.2)
- Identity resolution and the two refusal screens (§6.1 "Wrong app") — access is
  `EXISTS(role_assignment)` / `EXISTS(guardian)`, a **query, not a role check** (§3.1)
- Platform console: studio provisioning + owner invitation only (§5.1) — see conflict **C4**
- `person`, `role_assignment`, `invitation`, `platform_admin`, `class`, `group`, `group_staff`,
  `location`
- Studio setup wizard container + steps 1, 3, 5, 6, with the slot registry open for the belt
  step (M7) and the price step (M6)
- Both app shells, both nav drawers, the studio switcher (hidden for single-studio people)
- **The iOS install walkthrough** (§6.5): the invitation link detects iOS Safari and opens a
  screenshotted Add-to-Home-Screen guide; first run does not proceed until
  `display-mode: standalone` is true. Android and desktop get a real install button via
  `beforeinstallprompt`. This is where install conversion is won or lost

**Artboards** — parent `1a`, `2e` · staff `9e` · dashboard `5c`, `5f`, `3d`, `3f`. ✅ 3/3 surfaces

> `1a` is the base parent home; `2a` — the same screen enriched with the day strip and past
> attendance — belongs to M5. `9e` is the staff drawer, the mirror of `2e`.

**Verification** — `./scripts/lane-check.sh identity && ./scripts/lane-check.sh structure`

**Blocked on you** — §15 item 7, studio branding (logo). D1: logo only, no colour
customization in v1.

**Merge order** — everything on `main`.

---

## W2 · M2 Schedule ∥ M3 People & funnel

### Contract commit (main, before either lane)

| Kind | Contents |
|---|---|
| Models | `training_year`, `studio_closure`, `group_schedule_rule`, `session`, `session_staff`, `session_note` · `student`, `guardian`, `student_freeze`, `student_status_history`, `trial_booking`, `enrollment`, `registration_request` · `health_form_template`, `health_declaration` (see **C3**) |
| Migration | one revision, both verticals |
| Schemas | `SessionOut`, `TrialSlotOut`, `StudentOut`, `GuardianOut`, `EnrollmentOut`, `RegistrationRequestOut` |
| **Seam** | `ScheduleService.materialize_sessions(group_id, from_date, to_date) -> list[Session]` — M3's trial-slot picker is a pure reader through this |
| i18n | `*/schedule.ts`, `*/people.ts` in he/en/ru |
| Slots | `student-card` (M3 container), `alert-centre` (M3 container), `setup-wizard` steps 3 & 5 |

### Lane SCHEDULE — M2

**Owns**

```
app/models/schedule.py            app/services/schedule/**
app/routers/schedule.py           app/routers/sessions.py
app/workers/schedule.py           tests/schedule/**
web/apps/staff/src/features/schedule/**
web/apps/parent/src/features/schedule/**
web/apps/dashboard/src/features/schedule/**
web/packages/i18n/{he,en,ru}/schedule.ts
```

**Builds** — training years · closure calendar with Israeli holiday presets offered as
**proposals the manager ticks, never automatic closures** (§5.6) · schedule rules · session
materialization for the whole training year · per-session overrides · ad-hoc sessions · the
impact-preview dialog on `PUT /groups/{id}/schedule` showing exactly what will change before it
changes.

**Invariant:** changing a rule rewrites **only future** sessions. Past sessions and any session
with `is_manually_edited = true` are never overwritten (§5.6). This is E2E-5.

**Artboards** — parent `12b` · staff `9a`, `9b`, `1d` · dashboard `3a`, `6a`, `4b`. ✅ 3/3

**Check** — `./scripts/lane-check.sh schedule`

### Lane PEOPLE — M3

**Owns**

```
app/models/people.py              app/services/people/**
app/routers/students.py           app/routers/enrollments.py
app/routers/public.py             app/routers/trial_bookings.py
app/workers/followups.py          tests/people/**
web/apps/{staff,parent,dashboard}/src/features/people/**
web/apps/parent/src/features/landing/**      ← the public trial page
web/packages/i18n/{he,en,ru}/people.ts
```

**Builds** — students, guardians, enrollment · public trial landing page with **sign-in-first**
booking and the session picker · lead/trial statuses and `student_status_history` · manager
conversion · trial follow-up automation · person and child matching on **verified email or
phone** · approval queue · parent-initiated add-sibling · freeze and leave · invitations.

**Invariants:** enrollment is always a manager decision — the public link's only job is a first
lesson (§5.4). Guardians are never duplicated: submissions match on verified email or phone.
All guardians are equal; `is_primary` decides only bill addressing and הוראת קבע matching.

**Artboards** — parent `13a`, `13b`, `13c`, `12j`, `12g`, `12i`, `2c` · staff `11b`, `9c`, `9h`
· dashboard `3b`, `3c`, `4a`, `6c`. ✅ 3/3

**Check** — `./scripts/lane-check.sh people`

**Blocked on you** — §15 item 10, the club's real class/group structure and weekly schedule
(nominally M2, but M3's trial-slot picker needs real groups to be worth demoing).

### Merge & integration

1. **Lane SCHEDULE first.** M3 reads sessions; the reader merges onto a base that already has
   the writer. Review the diff *before* merging (Part 4: a bad merge contaminates the other
   lane's baseline).
2. `.venv/bin/pytest -q` full suite on `main`.
3. Rebase Lane PEOPLE on the new `main`. Re-run its own check inside the worktree.
4. Review Lane PEOPLE's diff, merge, full suite again.
5. **E2E-5** then **E2E-1a**. Wave does not close until both pass.

---

## W3 · M4 Health ∥ M5 Attendance

> **This pairing is a decision, recorded.** §5.5 puts Health's entire staff surface *inside*
> the attendance roster — the `⚠ הצהרת בריאות חסרה` badge, the one-tap `שלח תזכורת להורה`, and
> the `derived_flags` chips a coach sees. Under §14's order that roster does not exist when M4
> runs, so M4 alone has a parent surface and a dashboard surface and **no staff surface at
> all**. Pairing the two milestones in one wave fixes it without amending §14: the wave covers
> all three surfaces, and the seam is data, not a shared file. See §1.3 seam 4.

### Contract commit (main, before either lane)

| Kind | Contents |
|---|---|
| Models | `attendance`, `absence_report` · `consent_record` · `health_declaration` full columns |
| Migration | one revision, both verticals. `attendance` gets `UNIQUE(session_id, student_id)` **and** a second unique index on `client_mark_id` (§4.3) |
| Schemas | `AttendanceIn/Out`, `BatchAttendanceIn`, `BootstrapPayload`, `HealthDeclarationIn/Out`, `DerivedFlags` |
| **Seam** | `BootstrapPayload.roster[].health_status: Literal['missing','trial_signed','signed']` and `.derived_flags: dict[str, bool]` — M5 renders them, M4 populates them. Neither lane opens the other's file |
| **Seam** | `HealthService.recompute_derived_flags(student_id) -> dict[str, bool]` |
| i18n | `*/health.ts`, `*/attendance.ts` |
| Slots | `roster-row` health badge (M4 fills) · `student-card` documents strip (M4 fills) · `student-card` attendance strip (M5 fills) · `alert-centre` conflict cards (M5 fills) · `dev-bar` offline/slow toggles (M5 fills) |

### Lane ATTENDANCE — M5

**Owns**

```
app/models/attendance.py          app/services/attendance/**
app/routers/attendance.py         app/routers/sync.py
tests/attendance/**
web/packages/core/src/offline/**       ← pending_ops, network-state machine, sync queue
web/apps/staff/src/features/attendance/**
web/apps/parent/src/features/absence/**
web/apps/dashboard/src/features/attendance/**
web/packages/i18n/{he,en,ru}/attendance.ts
```

**Builds** — roster UI · bulk mark with the pre-report protection rule · parent absence
reporting · the offline queue · sync · conflict handling.

**This is the highest-risk lane in the plan.** It is the only one that owns
`web/packages/core/**`, and offline is the thing the prompt correctly identified as most likely
to break a naive split. Four things must be true and each needs its own test:

| Requirement | Source | Test |
|---|---|---|
| **Four network states, not two.** Never trust `navigator.onLine` — it is `true` on a captive portal that routes nowhere. Mode derives from request outcomes against a lightweight ping. A 6s timeout demotes a slow request into the offline path. Intermittent is treated as offline until **two consecutive** successes | §10.1 | state-machine unit test per transition |
| **Offline writes never depend on a valid token.** Marks go to `pending_ops` regardless of auth state — the local write is not an API call. A queue is **never** dropped on auth failure; there is no code path that discards unsynced work. Re-auth as a *different* person surfaces a conflict card instead of flushing | §10.3 | expired-access, expired-refresh, and different-person cases |
| **Cross-actor conflicts.** Coach offline + manager cancels the session → marks stored, card raised, never silently dropped and never silently applied. Two coaches → last write by `device_marked_at`, **except a parent pre-report, which never loses to a bulk action regardless of timestamp**. Same device flushes twice → no-op on `client_mark_id` | §10.5 | one test per row |
| **`pending_ops` is exempt from eviction under all circumstances.** Cache bounded to two days, evicted oldest-first | §10.6 | eviction test asserting `pending_ops` survives |
| **iOS cannot fully guarantee that exemption**, so manage it: require standalone mode, call `navigator.storage.persist()`, and show a **blocking warning** when unsynced work has been queued for more than one session. A native container would have given the guarantee; §6.5 traded it away deliberately and coaches are a small, known group | §6.5, §12 | persist() requested on boot; warning renders on stale queue |

Offline priming is **not optional** — first launch blocks on fetching today's and tomorrow's
sessions and rosters into IndexedDB before the coach reaches Today (§6.1).

Parent absence pre-reports **require a connection on purpose** and the app says so, rather than
queuing into the void (§10.2).

**Artboards** — parent `2a`, `12a` · staff `1c`, `9f`, `9g`, `2d` · dashboard `4c`, `1e`. ✅ 3/3

**Check** — `./scripts/lane-check.sh attendance`

### Lane HEALTH — M4

**Owns**

```
app/models/health.py              app/services/health/**
app/routers/health_templates.py   app/routers/health_declarations.py
app/workers/health_reminders.py   tests/health/**
web/apps/parent/src/features/health/**
web/apps/dashboard/src/features/health/**
web/apps/staff/src/features/health/HealthBadge.tsx    ← registers into 'roster-row'
web/packages/i18n/{he,en,ru}/health.ts
```

> **`app/routers/health.py` is not this lane's file**, and the earlier draft of this block
> said it was. That file is core's liveness probe — `GET /api/v1/health`, asserted by
> `tests/test_health.py`. §7 puts M4's routes at `/health-templates` and
> `/students/{id}/health-declaration`, hence the two filenames above; `GET /health-templates`
> already exists in `app/routers/structure.py` (M1, conflict C3) and this lane adds the write
> side. W3's contract commit corrected `lane-check.sh` to match: the default branch resolved
> `app/routers/$V.py` straight onto the liveness probe, and a gate reads as ownership.

**Builds** — the `kind='full'` template **editor** on top of D11's seeded default question
set, in versioned `health_form_template.schema` · declaration flow with a finger-drawn
signature · encryption of answers and signature image · `derived_flags` · signed-PDF
rendering · the parent app gate.

**Invariants:**
- The gate is a **hard block in the parent app only**. Nothing on the mat is ever blocked —
  the roster shows `⚠` with a one-tap reminder and the coach can still mark the student
  present. There is deliberately **no** `block_attendance_without_health` setting (§5.5).
- Coaches see `derived_flags` — **booleans only, never free text**. Reading the full
  declaration requires manager or owner and **every read is audit-logged** (§4.3, §11.2).
- Declarations do not expire. `valid_until` is `NULL`; `health_declaration_validity_months`
  defaults to `null` and is a config flag, not a migration (§5.5).
- **Hebrew PDF rendering** needs an embedded Noto Sans Hebrew face and explicit bidi handling.
  §5.5 calls this known-fiddly and mandates a golden-PDF fixture test. Budget for it.
- G7: never log declaration contents. The M0 scrubber test covers serialization; the reviewer
  checks call sites.

**Artboards** — parent `12c` · dashboard `4e`. **Staff: no new artboard.**

> **Documented exception.** M4's staff surface is real work with no screen of its own: the
> `⚠ הצהרת בריאות חסרה` badge and one-tap reminder on `1c`/`9f`, and the `derived_flags` chips
> on `9c`. All three are `registerSlot` additions rendering into containers owned by other
> milestones. The wave as a whole is ✅ 3/3; M4 in isolation is 2/3 for a structural reason,
> not an oversight. See §3.2 conflict **C2**.

**Check** — `./scripts/lane-check.sh health`

**Not blocked.** §15 item 1 made the studio's own הצהרת בריאות PDF a hard blocker on this
whole lane, because §5.5 said the template was *"derived from the studio's existing PDF"* and
there was nothing to derive from. [D11](../design/decisions.md) closed that on 2026-08-24 and
W3's contract commit acted on it: revision `0007` seeds a standard Israeli sports health
declaration as the default `full` `health_form_template` question set, for every studio. What
this lane owns is making it **editable** — a manager adds, removes and rewords questions — and
accepting the studio's own PDF at `source_pdf_object_key` for reference if they upload one.
There is no `docs/forms/` directory and there does not need to be.

**Carry D11's caveat into the UI.** A health declaration for minors in an Israeli sports club
touches insurance and regulatory ground. The bundled set is a **starting point and the app
must say so** where the manager edits it. `template.disclaimer` is already authored in all
three locales and the seeded row carries `is_bundled_default`, so the editor can tell whose
questions it is showing. It is not a compliance artefact and must not be presented as one.

### Merge & integration

1. **Lane ATTENDANCE first.** It owns `web/packages/core/**`, which is the wider blast radius;
   merging it first means the health lane rebases onto a stable core rather than the reverse.
2. Full suite on `main`.
3. Rebase Lane HEALTH, re-run its check, review, merge, full suite.
4. **E2E-2** (coach marks offline → reconnects → marks sync → dashboard reflects them), then
   **E2E-1** end to end including the health declaration.
5. Manual: airplane mode on a real device, 90 minutes, then reconnect. The dev bar's offline
   toggle proves the code path; it does not prove iOS suspends the way you assumed.

---

## W4 · M6 Money ∥ M7 Events & belts

### Contract commit (main, before either lane)

| Kind | Contents |
|---|---|
| Models | `price_plan`, `product`, `charge`, `billing_run`, `payment`, `payment_allocation`, `payment_order`, `payment_order_charge`, `upay_ipn_record`, `payer_fingerprint`, `recurring_subscription` · `belt_rank`, `student_belt`, `event`, `event_target`, `event_registration`, `event_exam_result` |
| Migration | one revision. **Every money column `_agorot INTEGER`** — G2, and invariant test 1 now has real columns to assert against |
| **Seam** | `BillingService.create_charge(studio_id, payer_person_id, kind, amount_agorot, due_date, *, student_id=None, event_id=None) -> Charge` — M7's event fees are a pure caller |
| **Seam** | `BillingService.recompute_charge_status(charge_id) -> None` — the **one place** charge status is maintained (§4.3) |
| i18n | `*/billing.ts`, `*/events.ts`, `*/belts.ts` |
| Slots | `student-card` payment strip (M6) · `student-card` belt strip (M7) · `roster-row` item-handout action (M6) · `alert-centre` reconciliation cards (M6) · `setup-wizard` step 2 belts (M7) and step 4 prices (M6) · `dev-bar` time-travel + run-a-job + simulate-IPN (M6) |

### Lane MONEY — M6

**Owns**

```
app/models/billing.py             app/services/billing/**
app/integrations/upay/**          app/routers/billing.py
app/routers/payments.py           app/routers/webhooks.py
app/workers/billing.py            tests/billing/**
web/apps/{staff,parent,dashboard}/src/features/billing/**
web/packages/i18n/{he,en,ru}/billing.ts
```

**Builds** — price plans · product catalog · debt escalation ladder · billing run with
proration · charge/payment/allocation ledger · uPay one-time flow with every §5.10 security
requirement · reconciliation queue · payer fingerprints · manual payments and adjustments.

**Invariants:**
- **Charges are never mutated to record payment.** A charge is settled when its
  `payment_allocation` rows sum to `amount_agorot`; `charge.status` is a derived cache
  maintained only in `recompute_charge_status` (§4.3).
- `charge.payer_person_id` is captured at creation from the primary guardian. If the primary
  guardian changes later, historical charges stay with whoever actually owed them.
- **Proration applies to the first month only**, computed from **materialized sessions, not
  calendar days**: `round(monthly × remaining_sessions ÷ total_sessions_in_period)`. Closures,
  holidays and absences never change the amount thereafter — the fee buys the slot.
- **The IPN has no cryptographic signature** (§12). UUID order refs + IP allowlist +
  independent amount verification are mandatory. The form is client-submitted and `amount` is
  editable, so `amount_mismatch` is a real state that records the real money received. The
  return redirect is **never** the source of truth — the IPN arrives ~5 minutes later.
- **G8 — no automated recurring billing.** הוראת קבע links are dashboard-created only, share
  one fixed amount across all parents, and their IPNs carry no customer identifier. Matching is
  human-confirmed via `payer_fingerprint` (four digits + normalized card-owner name). Do not
  build a mandate creator. Do not build automatic matching.
- No card owner names or last-4 digits in application logs (§11.7).
- The billing run is **idempotent** across repeated executions — invariant test 5 becomes real.

**Artboards** — parent `1b`, `12e`, `12f` · staff `11a` · dashboard `3e`, `5a`, `5e`. ✅ 3/3

> `12f` ships under **D9.3**: retitled `קבלות ותשלומים` → `תשלומים`, with the email affordance
> scoped to card rows only. uPay issues a חשבונית/קבלה for **card payments only**; the system
> issues no tax document for cash, bank transfer or הוראת קבע.

**Check** — `./scripts/lane-check.sh billing`

**Blocked on you** — §15 items 2 (uPay merchant email + live confirmation), 3 (public HTTPS URL
for IPN testing — Railway staging, delivered in M0), 8 (current price list per group).

**Reference** — [upay-integration.md](../../upay-integration.md) and the
[`payments` skill](../../.claude/skills/payments/SKILL.md). The skill exists precisely so this
lane does not re-derive the flow.

### Lane EVENTS — M7

**Owns**

```
app/models/events.py              app/models/belts.py
app/services/events/**            app/services/belts/**
app/routers/events.py             app/routers/belts.py
tests/events/**                   tests/belts/**
web/apps/{staff,parent,dashboard}/src/features/events/**
web/apps/{staff,parent,dashboard}/src/features/belts/**
web/packages/i18n/{he,en,ru}/events.ts
```

> **Belt strings live in `events.ts`. There is no `belts` namespace**, and W4's contract
> commit decided there will not be one. Seam 3 exists so that two *lanes* never touch one
> file; `events` and `belts` are the same lane, so a second namespace buys no isolation
> and costs an edit to `web/packages/i18n/types.ts` **and** `index.ts` — two files §1.3
> says are authored once and never touched by a lane. `scripts/lane-check.sh` and
> CLAUDE.md's nine-namespace list both already assumed this; the line above is what
> disagreed.

**Builds** — event types · targeting · RSVP · event fees · event consent · event attendance ·
belt ranks including **bi-colour** grades · grading history · belt exams.

**Invariants:**
- Event fees call `BillingService.create_charge(kind='event')`. The events lane never writes to
  a billing table directly.
- **G10 — every belt bar carries a 1px ring** in the current foreground colour. Fill alone makes
  white invisible on light (1.08:1), black invisible on dark (1.02:1) and yellow fail even the
  3:1 non-text threshold (2.02:1). Yellow is one of the most common children's grades, so this
  is a constant, not an edge case.
- Belt colours are **data** (`belt_rank.color_hex`), never brand (D3). They must stay visually
  distinct from the three semantic colours.

**Artboards** — parent `12d`, `12h`, `7d` · staff `9d`, `9i` · dashboard `7a`, `7b`, `7c`,
`6b`, `4d`, `5b`, `5d`. ✅ 3/3

> `7c` ships under **D9.2**: the `משקל / קטגוריה` column is cut. §2.2 defers weight categories
> to v2 and they imply `student` fields §4.3 does not carry. RSVP counts, parent consent and
> payment status all stand.
>
> `5d` (wizard step 2, belt system) and `5e` (step 4, prices) are `setup-wizard` slot fills
> into M1's container. Neither lane opens `SetupWizard.tsx`.

**Check** — `./scripts/lane-check.sh events && ./scripts/lane-check.sh belts`

### Merge & integration

1. **Lane MONEY first** — M7 is the caller, M6 the callee.
2. Full suite, then **`security-reviewer` (opus) on the uPay diff specifically**, before merge.
   This is the one diff in the project where a review miss costs real money.
3. Rebase Lane EVENTS, re-run, review, merge, full suite.
4. **E2E-3** (parent selects 3 months → uPay order → simulated IPN → charges settled → parent
   sees paid), then **E2E-4** (forged/tampered IPN → `amount_mismatch` → charges **not**
   settled → manager alerted). Drive both from the dev bar's IPN simulator: success · amount
   mismatch · forged ref · duplicate — which §19.5 notes are exactly §5.10's four security
   requirements.

---

## W5 · M8 Communication ∥ M9 Reports & privacy completion

### Contract commit (main, before either lane)

| Kind | Contents |
|---|---|
| Models | `announcement`, `notification`, `notification_delivery`, `push_token`, `calendar_feed` · `data_export_request` |
| Migration | one revision, both verticals |
| **Seam** | `NotificationService.enqueue(person_id, kind, title, body, payload) -> Notification` — M9's jobs are pure callers |
| i18n | `*/comms.ts`, `*/reports.ts` — **no `*/privacy.ts`**: `types.ts` lists nine namespaces and `index.ts` is authored once, so privacy strings live in `reports.ts` under `privacy.*`, exactly as belt strings live in `events.ts`. Same lane, so a second namespace buys no isolation. |
| Slots | `alert-centre` at-risk cards (M8) · parent profile data-export row (M9, into M3's `12i`) |

### Lane COMMS — M8

**Owns** `app/{models,services,routers}/comms*`, `app/routers/calendar.py`,
`app/workers/notify.py`, `tests/comms/**`, `web/apps/*/src/features/comms/**`,
`web/packages/i18n/*/comms.ts`

**Builds** — announcements · push + inbox delivery with delivery reporting and the
push-disabled banner · at-risk alerts · notification preferences · ICS calendar feeds ·
per-event calendar buttons.

**Invariants:** §5.11 permits exactly two levels — a push notification and a **one-way** in-app
inbox. Push permission is opt-in on iOS and Android 13+, so **some parents will never receive
alerts** — hence delivery reporting and the push-disabled banner (§12). Apple has no
third-party calendar write API and Google Calendar write is a restricted scope requiring an
annual third-party security assessment, so **ICS subscription is the only option** (§12).

Also owns **install-state reporting**: which guardians are running standalone and can
therefore receive push at all. This sits beside the push-delivery report, because on iOS they
are the same question — a parent in a Safari tab has no Push API to grant permission to
(§6.5). The dashboard needs a list the office can phone.

**Artboards** — parent `2b` · dashboard `4f`. **Staff: no new artboard.**

> `2b` ships under **D9.1**: the `עדכוני מועדון` inbox is kept, `שיחה עם המשרד` is cut. §2.3
> lists in-app two-way chat as explicitly out of scope.
>
> **Documented exception, same shape as M4.** M8's staff-surface work is real and screenless:
> `push_token` registration for the staff app, notification preferences inside the existing
> `9e` drawer, the coach's at-risk push with its one-tap `צור קשר עם ההורה`, and the coach ICS
> feed (`calendar_feed.subject_type = 'coach'`). See conflict **C2**.

**Check** — `./scripts/lane-check.sh comms`

### Lane REPORTS — M9

**Owns** `app/{models,services,routers}/reports*`, `app/routers/privacy.py`,
`app/routers/platform.py`, `app/workers/retention.py`, `tests/reports/**`, `tests/privacy/**`,
`web/apps/dashboard/src/features/{reports,privacy,platform}/**`,
`web/apps/parent/src/features/privacy/**`, `web/packages/i18n/*/reports.ts`

**Builds** — financial, operational and funnel reports with CSV/XLSX export on every table ·
studio overview · data export · anonymization · retention job · the platform console's
operations board (see **C4**).

**Invariants:**
- **Sessions held vs planned** is why `unmarked` must be a real state (§5.14). Do not let a
  report treat unmarked as absent.
- Anonymization **destroys** health declarations, signature images and rendered PDFs outright,
  and **retains** charges, payments and allocations — which works only because G15 holds: no
  PII is ever denormalized into a financial row. Receipts render names by join.
- Hard deletion is impossible: Israeli tax law requires ~7 years of financial records (§11.4).
- Retention defaults to 24 months after `status = 'left'`; managers preview what the next run
  will anonymize and can exempt individuals (§11.5).
- A **guardian** can request an export from the parent app; managers can trigger the same for
  any student (§11.3). Every export is audit-logged.
- The demo studio is excluded from `platform_studio_stats` and every cross-studio report (§19.7).

**Artboards** — dashboard `4g`. **Parent and staff: no new artboard.**

> **The plan's thinnest milestone, and honestly so.** M9's parent surface is the data-export
> request row added to `12i` (M3's profile screen) via the slot registry. Its staff surface is
> receipt of the at-risk push — no screen. M9 is a back-office milestone; §14 wrote it that
> way and no re-cut changes that. See conflict **C2**.

**Check** — `./scripts/lane-check.sh reports && ./scripts/lane-check.sh privacy`

### Merge & integration

1. **Lane COMMS first** — M9's at-risk and retention jobs call `NotificationService`.
2. Full suite, review, merge.
3. Rebase Lane REPORTS, re-run, review, merge, full suite.
4. Gate: an announcement reaches both push and inbox with a delivery record; every report
   exports to XLSX; a data-export bundle assembles and its link expires.

---

## W6 · M10 — Rollover & polish — **sequential only**

**Why sequential:** an accessibility pass and a both-direction visual pass touch every file
under `web/` by definition. There is no ownership split that survives it.

**Two stages, in this order:**

**Stage A — the training-year rollover wizard (§5.15), built normally on `main`.**
§5.15 calls it *"the single highest-leverage screen in the product"*. Seven steps: define the
year · closures from the Israeli holiday checklist · groups carried forward, renamed, retired
or created · students confirmed, moved or not returning, in bulk, **with no automatic age-based
promotion in v1** · prices reviewed with old plans **closed, not overwritten** · generate every
session for the year skipping closures · optionally announce. Resumable; a `draft`
`training_year` holds partial progress and **nothing is visible to guardians until activated**.

> **This is not polish, and it has no artboard.** See conflict **C5**.

**Stage B — the sweep, as a fan-out rather than a lane.**
Part 4's mechanism 5 is the right tool for *"anything repetitive across many files"*, and this
is exactly that. Enumerate first, fix per-file, with `--allowedTools` scoping the loop:

```bash
claude -p "List every file under web/ that violates the D10 ESLint rule \
  or uses a retired D8 token (#a8a49a, #8f8b82, #7a766d) in a light-mode \
  position. One path per line, to sweep.txt." \
  --allowedTools "Read,Grep,Glob,Write"

while read -r f; do
  claude -p "Fix $f: logical CSS properties only (D10); no retired D8 token in a \
    light-mode position; every belt bar carries its 1px ring (D7). Run the tests \
    for it. Return OK or FAIL." \
    --allowedTools "Edit,Bash(npx vitest run:*),Bash(npx eslint:*)"
done < sweep.txt
```

Test the prompt on two or three files before running the set. The remaining M10 work — studio
setup wizard polish, performance, the `→` direction check from canvas-review.md's "not
verified" list — folds into the same sweep.

**Artboards** — none new. M10 re-verifies **all 61** in `he` (RTL) and `en` (LTR), light and
dark. That is §13's visual layer and it is the exit gate.

**Verification** — `.venv/bin/pytest -q && npm run typecheck && .venv/bin/mypy app && npm run lint`
plus the Playwright visual suite in both directions and both themes.

---

## W7 · M11 — Launch — **sequential only**

**Why sequential:** it is a cutover. There is nothing to divide.

**Delivers** — production cutover on Railway · the club's real classes, groups, schedule,
students and price plans loaded · the iOS install walkthrough validated on real parents'
phones · install-conversion and push-delivery reporting live on the dashboard · the operator
alert set verified (§18) · the club onboarded in person.

**No store submission.** §6.5 ships installable PWAs. No App Store review, no Play listing, no
14-day closed test, no developer accounts.

**What to check before inviting the whole club:**
- Both apps install and run standalone on a real iPhone **and** a real Android device, and the
  OAuth redirect survives the round trip in standalone mode on iOS.
- Web Push arrives on an installed iPhone. This is the single most likely thing to be quietly
  broken, because it works everywhere else without the install.
- The invitation link's iOS walkthrough reads correctly in Hebrew, RTL, on a small screen.
- The dashboard shows who has not installed, so the office has a call list from day one.

**Blocked on you** — §15 item 6: 3–5 real parents to walk through the iPhone install before
the club-wide invite. Their confusion is the only honest measure of whether the walkthrough
works; your own phone will not tell you.

**Artboards** — none.

---

# Part 4 — The artboard ledger

All **61** artboards from [INVENTORY.md](../design/canvas/INVENTORY.md), each assigned to
exactly one milestone. Nothing is dropped.

> **A correction to the brief.** The prompt says *"three are already cut by D9 (2b, 7c, 12f)"*.
> Reading D9 as written, none of the three is cut as an artboard — all three ship, in reduced
> form: `2b` loses its conversation half and keeps the inbox; `7c` loses one column and keeps
> RSVP, consent and payment status; `12f` is retitled and has its email affordance narrowed.
> They are marked **▲ reduced** below. **The count of fully cut artboards in this plan is
> zero**, which is a stronger position than the brief assumed, and worth being explicit about
> so nobody later "restores" a screen that was never removed.

## 4.1 By milestone

| M | Parent | Staff | Dashboard | Σ | 3/3 |
|:--:|---|---|---|:--:|:--:|
| **M0** | — | — | `4h` | 1 | n/a — cross-surface by construction |
| **M1** | `1a` `2e` | `9e` | `5c` `5f` `3d` `3f` | 7 | ✅ |
| **M2** | `12b` | `9a` `9b` `1d` | `3a` `6a` `4b` | 7 | ✅ |
| **M3** | `13a` `13b` `13c` `12j` `12g` `12i` `2c` | `11b` `9c` `9h` | `3b` `3c` `4a` `6c` | 14 | ✅ |
| **M4** | `12c` | *(slot fills)* | `4e` | 2 | ⚠ 2/3 — see C2 |
| **M5** | `2a` `12a` | `1c` `9f` `9g` `2d` | `4c` `1e` | 8 | ✅ |
| **M6** | `1b` `12e` `12f`▲ | `11a` | `3e` `5a` `5e` | 7 | ✅ |
| **M7** | `12d` `12h` `7d` | `9d` `9i` | `7a` `7b` `7c`▲ `6b` `4d` `5b` `5d` | 12 | ✅ |
| **M8** | `2b`▲ | *(slot fills)* | `4f` | 2 | ⚠ 2/3 — see C2 |
| **M9** | *(slot fill into `12i`)* | *(push only)* | `4g` | 1 | ⚠ 1/3 — see C2 |
| **M10** | re-verifies all 61 | | | 0 | n/a |
| **M11** | — | — | — | 0 | n/a |
| | **20** | **14** | **27** | **61** | |

**By wave** — every parallel wave is 3/3:

| Wave | Parent | Staff | Dashboard | 3/3 |
|:--:|:--:|:--:|:--:|:--:|
| W2 (M2+M3) | 8 | 6 | 7 | ✅ |
| W3 (M4+M5) | 3 | 4 | 3 | ✅ |
| W4 (M6+M7) | 6 | 3 | 10 | ✅ |
| W5 (M8+M9) | 1 | 0 | 2 | ⚠ staff by slot fill only — C2 |

## 4.2 By artboard

**Parent app (20)**

| ID | Screen | M |
|---|---|:--:|
| `1a` | בית — בהיר + כהה | M1 |
| `1b` | תשלומים | M6 |
| `2a` | בית עם רצועת ימים, כולל נוכחות שהייתה | M5 |
| `2b` ▲ | הודעות — `עדכוני מועדון` inbox (D9.1: `שיחה עם המשרד` cut) | M8 |
| `2c` | כרטיס חניך — container; strips filled by M4/M5/M6/M7 | M3 |
| `2e` | מגירת חשבון — מועדונים, שפה, מצב כהה | M1 |
| `7d` | הזמנה לאירוע ואישור השתתפות | M7 |
| `12a` | דיווח היעדרות מראש | M5 |
| `12b` | לוח הילד — חודש שלם | M2 |
| `12c` | הצהרת בריאות — מילוי וחתימה | M4 |
| `12d` | התקדמות חגורה ומבחנים | M7 |
| `12e` | הזמנת פריטים — תשלום מיידי בכרטיס | M6 |
| `12f` ▲ | תשלומים (D9.3: retitled; email scoped to card rows) | M6 |
| `12g` | הוספת ילד נוסף | M3 |
| `12h` | אירועים ותחרויות | M7 |
| `12i` | פרופיל · עזיבת המועדון (M9 adds the data-export row) | M3 |
| `12j` | הרשמה ראשונה | M3 |
| `13a` | דף נחיתה — מובייל | M3 |
| `13b` | אחרי השליחה | M3 |
| `13c` | דף נחיתה — דסקטופ | M3 |

**Staff app (14)**

| ID | Screen | M |
|---|---|:--:|
| `1c` | נוכחות בשיעור — בהיר + כהה | M5 |
| `1d` | היום | M2 |
| `2d` | כרטיס חניך מתוך רשימת הנוכחות | M5 |
| `9a` | היום — מסנן מאמן, רצועת ימים | M2 |
| `9b` | בחירת תאריך — יומן מלא | M2 |
| `9c` | כרטיס חניך ומעבר כיתה | M3 |
| `9d` | מבחן חגורה שהמאמן פותח | M7 |
| `9e` | עוד — מגירה | M1 |
| `9f` | נוכחות — ״הודיעו מראש״ | M5 |
| `9g` | סיכום מפגש | M5 |
| `9h` | חניכים — חיפוש | M3 |
| `9i` | אירועים בצוות | M7 |
| `11a` | מסירת פריטים בשיעור | M6 |
| `11b` | שיעור ניסיון — הוספת חניך תוך כדי שיעור | M3 |

**Manager dashboard (27)**

| ID | Screen | M |
|---|---|:--:|
| `1e` | לוח מנהל — שבוע, Quick View + סימון נוכחות | M5 |
| `3a` | לוח שבועי עם תפריט הצד | M2 |
| `3b` | חניכים — טבלה עם מסננים | M3 |
| `3c` | הוספת חניך — שיוך למשק בית קיים | M3 |
| `3d` | צוות — עומס, הרשאות, שיעורים ללא מאמן | M1 |
| `3e` | תשלומים וגבייה — חוב לפי משק בית | M6 |
| `3f` | הגדרות — תווית מצב לכל מתג | M1 |
| `4a` | כרטיס חניך | M3 |
| `4b` | קבוצות ומחזורים | M2 |
| `4c` | נוכחות — מה לא סומן, מי נעדר ברצף | M5 |
| `4d` | מבחן חגורה — זכאות וקידום קבוצתי | M7 |
| `4e` | מסמכים והצהרות | M4 |
| `4f` | הודעות — קהל יעד ותצוגה מקדימה | M8 |
| `4g` | דוחות — ללא גרפים צבעוניים | M9 |
| `4h` | ספריית רכיבים | **M0** |
| `5a` | מחירים ומסלולים | M6 |
| `5b` | מערכת חגורות — כולל דו-צבעיות | M7 |
| `5c` | אשף · שלב 1 — פרטי מועדון | M1 |
| `5d` | אשף · שלב 2 — מערכת חגורות | M7 |
| `5e` | אשף · שלב 4 — מחירים ופריטים | M6 |
| `5f` | אשף · שלב 6 — סיום והזמנת הורים | M1 |
| `6a` | עמוד קבוצה בודדת + לו״ז שבועי | M2 |
| `6b` | מבחני חגורה — ריכוז | M7 |
| `6c` | מרכז התראות — container; cards from M3/M5/M6/M8 | M3 |
| `7a` | אירועים ותחרויות — ריכוז | M7 |
| `7b` | יצירת אירוע | M7 |
| `7c` ▲ | עמוד אירוע (D9.2: `משקל / קטגוריה` column cut) | M7 |

---

# Part 5 — Conflicts to resolve, not paper over

Every place §14 or another checked-in doc fights the parallel cut. Ordered by cost of leaving
it alone.

### C1 — CLAUDE.md's layout contradicts SPEC §8.2, and it silently disables the RTL rule 🔴

CLAUDE.md §Layout says `web/src/` React: `pages/`, `components/`, `api/`, `hooks/`.
SPEC §8.2 specifies npm workspaces with `web/packages/{api-client,ui,core,i18n}` and
`web/apps/{staff,parent,dashboard}`. These are irreconcilable, and neither exists on disk yet.

The damage is not stylistic. [`.claude/rules/ui-rtl-a11y.md`](../../.claude/rules/ui-rtl-a11y.md)
is path-scoped to `web/src/**`. Under §8.2's layout **that path never exists, so the rule
matches nothing** — the one rule enforcing logical CSS properties, i18n-only strings, WCAG AA
contrast, labelled inputs and focus states would apply to zero files while appearing to be
configured. D10's ESLint rule is scoped to `web/src/**` for the same reason and inherits the
same silence.

**Resolved by evidence, not by preference:** §8.2 is the specific, dated, three-app design;
CLAUDE.md's §Layout is the generic starter block from Part 5 of the guide, and it describes a
single-app structure that cannot hold three apps and four shared packages. **§8.2 wins.**

**Required in M0:**
1. Amend CLAUDE.md §Layout to §8.2's tree.
2. Re-scope `ui-rtl-a11y.md` to `paths: ["web/apps/**", "web/packages/**"]`.
3. Write D10's ESLint rule against the same globs.
4. Amend CLAUDE.md's *"Hebrew user-facing strings live in `web/src/i18n/he.ts`"* to the
   namespaced tree from §1.3 seam 3 — a single `he.ts` serializes every wave.

### C2 — three milestones cannot be tri-surface, and the check should say so 🟠

M4, M8 and M9 have real work on surfaces with no artboard of their own. Reported honestly
rather than hidden: M4's staff surface is the roster badge and reminder (§5.5), M8's is push
registration, notification preferences and the coach ICS feed, M9's parent surface is the
data-export row and its staff surface is a push notification.

**The check as briefed is necessary but not sufficient.** A milestone can list artboards for
all three surfaces and still be lopsided, and — as here — can list them for one and still be
correct. **Recommended amendment:** apply the artboard test at **wave** granularity, where
W2/W3/W4 pass cleanly and W5's staff gap is the single visible exception, and require any
milestone with a screenless surface to enumerate that surface's deliverables explicitly (done
above). The W3 pairing came from applying exactly this test to M4 and taking the failure
seriously; that is what the check is for.

### C3 — M3's trial booking needs a health declaration that §14 puts in M4 🟠

§7's `POST /trial-bookings/self` takes `children[] + group + session + trial health
declarations`, and §4.3 gives `student.health_status` a `trial_signed` value. So M3 must write
a `health_declaration` — but §14 puts *"template derived from the studio's PDF"* in M4, and M3
runs a wave earlier.

**Resolution:** `health_form_template.kind` is already `(full|trial)` in §4.3. Make the
**`trial` template a fixed, seeded short form** shipped with M1's studio provisioning — not
derived from the studio's PDF, not editable in v1. M4 then owns only the `full` template, the
PDF mapping, the template editor, `derived_flags`, PDF rendering and the app gate, exactly as
§14 says. M3 writes a trial declaration against a template that already exists.

**Requires a one-line SPEC clarification in §5.5:** state that the `trial` template is seeded
and the PDF-derived template is `full`. Without it, M3 blocks on §15 item 1 — a PDF you may not
have yet — for no reason.

### C4 — §14 lists the platform console in both M1 and M9 🟡

M1: *"platform console with studio provisioning and owner invitation"*. M9: *"platform
console"*, unqualified. Two milestones, one name.

**Resolution:** M1 owns provisioning + owner invitation (§5.1's chain of authority — a studio
cannot exist without it, so it cannot wait for M9). M9 owns §18.3's operations board:
listing, suspension, aggregate usage, and break-glass access. **Amend §14 M9 to read
"platform operations board and break-glass (§18.2–18.3)"** so the two entries stop colliding.

### C5 — the rollover wizard is filed under "polish" and has no artboard 🟡

§14 M10 is *"Rollover & polish"*. §5.15 calls the training-year rollover *"the single
highest-leverage screen in the product"* and specs seven steps with bulk student operations and
price-plan versioning. That is a feature, and it is the last substantial one built.

It also has **no artboard** — the canvas has 61 screens and none of them is the rollover wizard.
Every other major flow was designed before it was built.

**Recommended:** either design it (one Claude Design pass, and INVENTORY.md goes to 62) or
accept that it ships without a visual reference and say so out loud. Splitting M10 into
"M10a rollover" and "M10b polish" in §14 would also stop a genuine feature inheriting the
scheduling assumptions of a cleanup pass — but that edges toward inventing a milestone, so it
is a suggestion rather than part of the plan above.

### C6 — §7 carries an endpoint §4.3 explicitly forbids 🟡

§7 lists `POST /people/{id}/payment-mode`. §4.3 states: *"There is **no** `payment_mode` on a
person. A payer is never locked into one way of paying; the payments screen always offers all
three."* The endpoint is stale. **Delete it from §7** before M6 starts, or a lane will
faithfully implement it.

### C7 — `.claude/rules/api.md` uses `club_id`; the schema uses `studio_id` 🟡

The rule says *"Any endpoint touching student data must filter by the caller's `club_id`"*.
§4.2 and every table in §4.3 use `studio_id`. A lane reading the rule will look for a column
that does not exist. **Update the rule to `studio_id`** and, while there, point it at §4.2's
`TenantMixin` so the enforcement mechanism is named rather than implied.

### C8 — the permission allowlist does not match the mandated commands 🟡

[`.claude/settings.json`](../../.claude/settings.json) allows `Bash(pytest:*)` and
`Bash(ruff:*)`. G1 mandates `.venv/bin/pytest` and `.venv/bin/ruff`, which **do not match those
patterns** — so the very commands CLAUDE.md requires will prompt every time, in every lane, all
day. Add to `allow` in M0:

```json
"Bash(.venv/bin/pytest:*)", "Bash(.venv/bin/ruff:*)", "Bash(.venv/bin/mypy:*)",
"Bash(.venv/bin/alembic upgrade:*)", "Bash(./scripts/lane-check.sh:*)",
"Bash(npx eslint:*)", "Bash(git worktree:*)"
```

`Bash(alembic downgrade:*)` stays denied — and note the existing deny pattern has the same
prefix problem, so add `Bash(.venv/bin/alembic downgrade:*)` to `deny` too. A deny that does not
match is worse than no deny, because it reads as protection.

### C9 — the D9 canvas edits are recorded but not applied 🟡

decisions.md's own "Applied vs. pending" table marks D9.1, D9.2 and D9.3 as **not yet applied
to the canvas**. The artboards still show in-app chat, the weight column and the `קבלות` title.

The port happens in M3/M6/M7/M8, and a lane reading `2b` in a browser will build the chat.
**Either** run the Claude Design edit pass before W2 opens, **or** accept the divergence and
rely on the ▲ markers in Part 4 plus each lane's opening prompt (both carry the reduction
explicitly — see [lanes.md](lanes.md)). The second is cheaper; the first is safer. Recommend
the edit pass, because the mockup is what a human opens at 2am, not this table.

---

# Part 6 — Self-review

Run against SPEC.md with fresh eyes, per `superpowers:writing-plans`.

**Spec coverage.** §1–§4 → M0/M1 contract commits. §5.1 → M1 (+ steps 2/4 slotted from
M7/M6). §5.2 → M1. §5.3–§5.4a → M3. §5.5 → M4 (+ C3's seeded trial template). §5.6 → M2.
§5.7 → M5. §5.8 → M7. §5.9 → M7. §5.10 → M6. §5.11 → M8. §5.12 → M8. §5.13 → M2/M3/M5 by
owner (session notes M2 model / M5 offline write path; student notes M3 model / M5 write path).
§5.14 → M9. §5.15 → M10 (flagged, C5). §6.1–6.4 → M1 shells + per-vertical fills. §6.5 → M0
(manifest layer) + M1 (iOS walkthrough) + M8 (install reporting) + M11 (validation). §7 → one router file per vertical, C6 excepted. §8 → M0. §9 → M0
scaffolding + M10 sweep. §10 → M5. §11.1–11.2 → M0. §11.3–11.6 → M9. §11.7 → M0 + M6. §12 →
constraint table above, per lane. §13 → `tests/invariants/` from M0 + one E2E per wave gate.
§14 → this document. §15 → "Blocked on you" per milestone. §18 → M0 boundary, M9 console.
§19 → M0. **No gaps found.**

**Placeholder scan.** No TBDs. `lane-check.sh`, `models/__init__.py`, `main.py`, `slots.ts` and
the M10 fan-out loop are given as real content, not descriptions of content. `i18n-parity.mjs`
is named with its exact job and invocation and is a genuine M0 deliverable, not a gesture.

**Type consistency.** Cross-lane seam signatures are stated once and reused verbatim:
`ScheduleService.materialize_sessions`, `HealthService.recompute_derived_flags`,
`BillingService.create_charge`, `BillingService.recompute_charge_status`,
`NotificationService.enqueue`, `registerSlot`/`useSlot`. Vertical names are consistent between
the ownership globs, `lane-check.sh`'s `$V`, the i18n namespaces and the worktree names in
[lanes.md](lanes.md).

**Arithmetic.** 61 artboards, each in exactly one milestone: 1 + 7 + 7 + 14 + 2 + 8 + 7 + 12 +
2 + 1 = 61. Per surface: 20 parent + 14 staff + 27 dashboard = 61. ✓
