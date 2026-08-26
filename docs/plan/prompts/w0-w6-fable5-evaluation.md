# Fable 5 Evaluation Prompt: W0-W6 Full Stack Audit

You are auditing **Studio Manager** — a judo club management SaaS, all waves w0-w6 complete, shipping next. Fresh eyes: find gaps, defects, and integration issues across all five years of work.

## Priority Focus

**Attendance and Money are the two highest-leverage flows.** Every other feature serves these:

- **Attendance** (w3): A coach takes attendance for 25 kids in <10 seconds on a mat with no signal. This is the daily load and the product's core.
- **Money** (w4): A manager knows exactly who owes money without a spreadsheet. This is the business model and the reason studios adopt.
- Everything else (schedule, people, health, comms, reports, rollover) is scaffolding or compliance.

**If attendance works and money is accurate, the product is viable. If either breaks, the product is broken.**

**Audit these ruthlessly. If E2E-2 (offline attendance → sync) or E2E-3/E2E-4 (billing → payment) show any crack, stop and detail it.**

---

## What Was Built

| Wave | Milestone | What | Status |
|---|---|---|---|
| W0 | M0 | Foundations: skeleton, design system, install layer, demo studio | shipped 2026-08-24 |
| W1 | M1 | Identity: OAuth, JWTs, roles, permissions, platform console, studio setup wizard | shipped 2026-08-25 |
| W2 | M2∥M3 | Schedule∥People: classes/groups/sessions, students/guardians, enrollment, trial booking, lead funnel | shipped 2026-08-26 |
| W3 | M4∥M5 | Health∥Attendance: health declarations, offline-first attendance, roster, sync | shipped 2026-08-26 |
| W4 | M6∥M7 | Money∥Events: billing ledger, charges/payments, uPay IPN, events/RSVP, belts | shipped 2026-08-26 |
| W5 | M8∥M9 | Comms∥Reports: announcements (push/email/inbox), monthly reports, privacy jobs | shipped 2026-08-26 |
| W6 | M10 | Rollover and polish: rollover wizard, a11y/RTL sweep, 61 artboards | **shipped 2026-08-27** |

---

## Exit Gates (All Stated as Met)

- **W0**: All three apps install to home screen and run standalone
- **W1**: Both apps sign in, refuse correctly, route to wizard
- **W2**: E2E-5 (schedule change) green; E2E-1a (registration → approval → active) green
- **W3**: E2E-2 (offline attendance → sync) green; E2E-1 complete with health green
- **W4**: E2E-3 (uPay happy path) and E2E-4 (forged IPN) green
- **W5**: E2E suite all five flows green with no fixme; announcement delivered to push and inbox; every report exports
- **W6**: All 61 artboards pass a11y/RTL sweep in Hebrew and English, light and dark

---

## What You're Looking For

### 1. Integration Breaks Across Waves

Does w1's auth + w2's enrollment + w4's money actually work together end to end? Does the offline queue (w3) flush correctly when w5's comms are involved?

### 2. E2E Flows Green in Unit Tests but Broken in Browser

The suite runs against real apps, but gaps hide:
- Can a parent actually register a student and get them active (E2E-1)?
- Can a coach take attendance offline and sync it (E2E-2)?
- Can a manager run a billing month and collect payment (E2E-3/E2E-4)?
- Can the rollover wizard actually run (w6 new)?

### 3. A11y/RTL Passing Static Sweep but Breaking at Runtime

The sweep checked CSS, a11y tree, keyboard nav, focus traps, contrast. Check:
- Hebrew + English rendering (particularly text direction on nested elements)
- Light and dark themes (contrast in dark especially)
- Screen reader announcements (do they match visual intent?)
- Keyboard nav in complex components (roster, schedule, billing list)

### 4. Data Integrity Across Tenants

w1 shipped `TenantMixin` that "fails closed". Verify:
- A studio can never see another studio's students/charges/messages
- A parent can only access their own children
- A coach can only see their assigned groups

### 5. Hard Gates That Are Soft in Running App

- **§6.1 step 6**: "On first login, if any linked student has health_status = missing, no other screen is reachable." — **KNOWN ISSUE: HealthGate is built but never mounted.** A guardian with an unsigned declaration reaches home.
- **§5.5**: Health declarations are mandatory before attendance is taken — verify the app enforces it.

### 6. Money Flows That Silently Fail

Billing is complex:
- A charge is created for a student with no active enrollment — should not happen
- A payment is allocated to an old charge after a new one opens — should use oldest-first
- Registration fee + proration are both applied — should not double-charge
- A recurring-payment suggestion shows when a standing order already exists — should not suggest

---

## Known Open Defects (Carried, Not W6 Scope)

- **HB-e2e-demo-reset**: `POST /dev/demo/reset` 500s on repeat. Migration written, needs to land. Blocks per-test E2E reset.
- **HB-w6-health-gate-unmounted**: HealthGate/DeclarationForm/SignaturePad built but never wired into parent app. §6.1's hard gate does not exist.
- **HB-w3-manual-offline**: 90-minute real-device airplane-mode run never happened. The code works offline; iOS suspension assumptions never tested.

---

## Your Task

### 1. Run the E2E Suite

```bash
cd e2e && npm run test:e2e
```

All five flows (E2E-1 through E2E-5) should pass. If any fixme remains or any test fails, name it and why.

### 2. Spot-Check A11y/RTL in Running App

- Run dev servers: `.venv/bin/uvicorn app.main:app --reload` + `npm run dev` in `web/`
- Sign in as each role (use `/dev/sign-in-as`)
- Switch languages (Hebrew ↔ English) and verify text direction flips correctly
- Toggle light ↔ dark and verify contrast in both
- Run axe or a11y scanner on 3–5 representative pages per app (staff, parent, dashboard)

### 3. Verify Data Isolation

- Create two studios (sign in as platform_admin via `/dev/`)
- Add a student to studio A
- Sign in as a parent in studio B
- Verify they cannot see studio A's student

### 4. Test the Health Gate (It Will Fail)

- Sign in as parent to the demo studio
- The first screen should be the health declaration form if any child is unsigned
- If you reach home directly, record this as a broken §6.1 gate

### 5. Spot-Check One Money Flow End to End

- As a manager, create a tuition charge for a student (billing run, or one month past trial)
- As a parent, try to pay it via uPay
- Verify the charge moves to `paid` or `overpaid` and does not double-charge

### 6. Report Findings As

- **Blocked**: Gates that should be green but are broken (data loss, access violation, critical UX)
- **Degraded**: Gates that are green but have rough edges (unclear error, clunky UX, minor a11y)
- **Verified**: Gates that work as specified

---

## Key Facts

- All money is in agorot (integers), never floats
- Timestamps stored UTC; rendered in Asia/Jerusalem
- Hebrew strings in `web/packages/i18n/he/*.ts`, never inline
- Three apps: `web/apps/staff/` (coaches), `web/apps/parent/` (guardians), `web/apps/dashboard/` (managers)
- Backend: Python FastAPI, SQLAlchemy, PostgreSQL
- Auth: Google OAuth, JWT refresh tokens, session from request context
- Tenancy: `TenantMixin` filters every query by studio_id, fails closed (raises if no studio in context)
- E2E suite: `e2e/01-registration.spec.ts`, `02-schedule.spec.ts`, etc. Uses Playwright, three projects (one per app)

---

## Before You Start

- The backend database may be fresh or stale — reset it: `./scripts/dev-db.sh reset`
- The E2E suite owns its own database separate from pytest — `scripts/e2e-backend.sh` manages it
- All three dev servers need to run in parallel for E2E: the config starts them automatically
- If a test 500s and you can't tell why, check `app/main.py`'s logs for a structured JSON error

---

## When You're Done

Report findings in three sections:

1. **Blocked (gates that are broken)** — list them with reproduction steps
2. **Degraded (gates that work but have issues)** — rough edges, missing copy, minor a11y
3. **Verified (gates that work)** — the flows you confirmed end to end, with test names

This is a fresh evaluation, not an iteration. Make the calls. If something smells wrong, it probably is.
