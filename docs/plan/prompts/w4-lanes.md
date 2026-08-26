# W4 lanes — MONEY and EVENTS

Written 2026-08-26, at the end of W4's contract commit. Both worktrees exist and both
lane checks are green in them; nothing below is speculative.

---

## State at handover

| | |
|---|---|
| `main` | `728b665`, pushed. Revision `0008` is head, seventeen W4 tables live. |
| `lane/money` | `../studio-manager-money`, at `728b665`, database `studio_manager_money` |
| `lane/events` | `../studio-manager-events`, at `728b665`, database `studio_manager_events` |
| Suite | 1837 passed, 1 skipped, 1 xfailed |
| Lane checks | `billing` 6 scoped gates · `events` 6 · `belts` 3 — all green **inside their own worktrees** |

**Invariant 1 is no longer vacuous.** Ten money columns, every one `*_agorot INTEGER`.
**Invariant 5's tripwire is armed**: `test_the_seam_detector_recognises_the_contract_stub`
passes and `test_the_billing_run_is_idempotent` skips, and the moment M6 writes a real
`create_charge` body that skip becomes a failure demanding a real idempotence assertion.
That is the design, not a gap.

### What each worktree already has

Both were set up here, because `git worktree add` copies no untracked file and this repo
has no `.worktreeinclude`:

- **`.env`**, copied from the committed template with *only* the two database URLs
  repointed. Without it the lane falls back to the **shared** database — worse than a
  stale copy, because both lanes then tread on each other's rows and each one's failures
  read as the other one's bugs.
- **`.venv` and `web/node_modules`, symlinked to `main`'s.** Deliberate: it gives both
  lanes the verified Python 3.14 interpreter and sidesteps the trap that `python3` on this
  machine is a pyenv 3.8, so the documented `python3 -m venv` produces an unusable venv.
  **The consequence is that a dependency change is a stop-and-tell**, not a lane decision —
  installing a package changes it for the other lane and for `main`.
- Its own database, migrated to `0008`.

> **NEVER run `./scripts/dev-db.sh reset` while a lane is working.** It drops the shared
> Docker volume and destroys BOTH lane databases mid-run. W3's managing session did this
> and cost both lanes time. It was run once in W4's contract commit, before either
> worktree existed, and that was the last safe moment for it.

---

## Merge order — MONEY first

Same logic W3 used, and it held up:

1. **Lane MONEY.** It owns `app/integrations/upay/**` and every money table, so EVENTS
   rebases onto a stable ledger rather than the reverse. M7's event fees are a pure caller
   of M6's seam.
2. Full suite, then **`security-reviewer` on the uPay diff specifically**, before merge.
   This is the one diff in the project where a review miss costs real money.
3. Rebase lane EVENTS, re-run, review, merge, full suite.

**E2E-3 and E2E-4 are not reachable at merge time.** Both need the harness
`HB-w3-e2e-harness` describes and nobody has built: seventeen `page.goto()` deep links
against an app with no router, one `baseURL` for three separate Vite apps, and eleven named
testids of which none exists. Do not promise W4 an exit gate that depends on it — build the
harness while the lanes run (see the last section).

---

## The five decisions W3 handed forward

Recorded here rather than implemented. The contract commit's own gate was green and pushed,
and none of these is a schema or a seam, so none of them blocks a lane from starting. Items
1 and 3 are the two both W4 lanes will actually hit.

### 1. `TextField` has no multiline mode — **do it first, on `main`, before either lane needs it**

Four artboards want one, and W4 supplies the fields: `event.consent_text` (4000 chars),
`charge.proration_note`, `student_belt.note`, `ChargeAdjustmentIn.reason`.
`web/packages/ui/src/primitives/TextField.tsx` renders an `<input>` and nothing else.

**Primitives are not a lane's to add**, so deferring does not mean "a lane will do it" — it
means each lane builds a local `<textarea>` and the two diverge on label wiring,
`aria-describedby` and the error state. The whole point of the primitive is that the
accessibility wiring is written once.

Shape: a `multiline` prop selecting a `<textarea>` branch, with the union of
`InputHTMLAttributes<HTMLInputElement>` and `TextareaHTMLAttributes<HTMLTextAreaElement>`
discriminated on it. The label, message, `aria-describedby`, `aria-invalid` and
`data-state` wiring is already correct and is shared unchanged.

### 2. `AlertTone` has no green that is not `paid` — **raise D13, do not add it quietly**

A token-layer decision in D12's territory. The reconciliation queue (`5e`) is the first
screen needing a success tone that is not about money having been received, and adding a
colour to the token layer without a decision record is how a palette stops meaning
anything. Worth a **D13**, not a quiet addition by whichever lane hits it first.

### 3. `SignaturePad` → `web/packages/ui/src/primitives/` — **record, move with item 1**

It lives at `web/apps/parent/src/features/health/SignaturePad.tsx` and two artboards draw
it. It is in a parent feature directory only because primitives were not W3's lane's to
add. A file move plus importer churn, so it pairs naturally with item 1's primitive work
rather than being done alone.

### 4. `app/services/attendance/schemas.py` — **leave it**

It holds `BatchResult`/`AttendanceConflictOut` because W3's contract authored no *result*
shape for a flush. No OpenAPI effect, and moving it is churn in a file W4 has no other
reason to open. Revisit if W5 needs the same shape.

### 5. `4c`'s at-risk sidebar — **W5 renders it**

W3's contract never decided whether M5 or W5 renders M9's list. Every string already lives
in the `reports` namespace, which is the argument the contract itself makes. Settled: W5.

---

## Things this wave decided that a lane must not re-litigate

- **`charge`'s idempotency key is `(student_id, period_year, period_month, kind)`**, partial
  on `student_id IS NOT NULL AND period_year IS NOT NULL`. **Not `enrollment_id`** — C11
  prices per student, so a child in two groups is one charge. Three documents said
  otherwise and were corrected in `21b6c4e`; if you find a fourth, it is also wrong.
- **Both foreign keys W2 deferred are on `student`**, not one on `enrollment`. `enrollment`
  carries no price at all, by C11.
- **There is no `belts` i18n namespace and there will not be one.** Belt strings live in
  `events.ts`. Seam 3 exists so two *lanes* never touch one file, and `events` and `belts`
  are the same lane, so a second namespace buys no isolation while costing an edit to
  `web/packages/i18n/types.ts` **and** `index.ts` — both authored once, never by a lane.
- **`recurring_subscription`'s amount CHECK is named `amount_positive`, not
  `recurring_subscription_amount_positive`.** The repo's habit of repeating the table name
  meets `ck_%(table_name)s_%(constraint_name)s` and overflows Postgres's 63-character
  identifier limit on this table. If you add a constraint to a long-named table, check the
  generated length.
- **The `payment` ↔ `upay_ipn_record` cycle needs an explicit `op.create_foreign_key`.**
  `use_alter=True` inside `op.create_table` is silently dropped — `CreateTable`'s compiler
  skips it and Alembic never emits the follow-up `AddConstraint`. `0008` writes it by hand
  and drops it first in `downgrade()`. Do not "tidy" it away as a duplicate of the inline
  constraint on the same table; the inline one is inert.

---

## Lane MONEY — opening prompt

```
You are lane MONEY (M6) in `../studio-manager-money`, branch `lane/money`, on its own
database `studio_manager_money`. Read @CLAUDE.md, @docs/plan/milestone-plan.md's
`Lane MONEY — M6` section, @docs/plan/prompts/w4-lanes.md, @upay-integration.md and
the `payments` skill. The skill exists precisely so this lane does not re-derive the flow.

W4's contract is on `main` and you may not change it. Revision 0008 is head, the eleven
billing tables exist, `app/schemas/billing.py` is authored, and
`BillingService.create_charge` / `.recompute_charge_status` are empty-bodied seams with
real signatures that lane EVENTS calls. Changing either signature is a stop-and-tell.

You own:
  app/models/billing.py        app/services/billing/**
  app/integrations/upay/**     app/routers/billing.py
  app/routers/payments.py      app/routers/webhooks.py
  app/workers/billing.py       tests/billing/**  tests/upay/**
  web/apps/{staff,parent,dashboard}/src/features/billing/**
  web/packages/i18n/{he,en,ru}/billing.ts

Check: `./scripts/lane-check.sh billing`. It reaches every path above; W4's contract
commit added the branch, because the default resolved app/routers/billing.py, which does
not exist, and reported a green it never earned.

Non-negotiable:
  - Charges are NEVER mutated to record payment. A charge is settled when its
    payment_allocation rows sum to amount_agorot; charge.status is a derived cache with
    exactly ONE writer, recompute_charge_status.
  - G2 — every money value is an integer count of agorot. Invariant 1 is live now and
    asserts against ten real columns.
  - G8 — no automated recurring billing. Our provider cannot create a הוראת קבע mandate
    programmatically. No mandate creator, no automatic matching. Matching is
    human-confirmed via payer_fingerprint.
  - The IPN has NO cryptographic signature (§12). UUID order refs, IP allowlist and
    INDEPENDENT amount verification are all mandatory. `amount_mismatch` is a real state
    recording real money received; the return redirect is NEVER the source of truth.
  - Proration is first month only, from MATERIALIZED SESSIONS, not calendar days.
  - charge.payer_person_id is captured at creation from the primary guardian.
  - §11.7 — no card owner names or last-4 digits in application logs.
  - Invariant 5 currently SKIPS because create_charge is still a stub. The moment you
    write a real body it becomes a FAILURE demanding a real idempotence assertion over a
    seeded period. That is the tripwire working — wire assert_idempotent, do not weaken it.

Never run ./scripts/dev-db.sh reset — it destroys both lanes' databases.
Your .venv and web/node_modules are symlinks to main's, so a dependency change is a
stop-and-tell rather than a lane decision.

Plan with superpowers:writing-plans, then work it task by task: failing test, confirm it
fails, minimal implementation, green, commit.
```

## Lane EVENTS — opening prompt

```
You are lane EVENTS (M7) in `../studio-manager-events`, branch `lane/events`, on its own
database `studio_manager_events`. Read @CLAUDE.md, @docs/plan/milestone-plan.md's
`Lane EVENTS — M7` section and @docs/plan/prompts/w4-lanes.md.

W4's contract is on `main` and you may not change it. Revision 0008 is head; `event`,
`event_target`, `event_registration`, `event_exam_result`, `belt_rank` and `student_belt`
all exist, and `app/schemas/{events,belts}.py` are authored.

You own:
  app/models/events.py    app/models/belts.py
  app/services/events/**  app/services/belts/**
  app/routers/events.py   app/routers/belts.py
  tests/events/**         tests/belts/**
  web/apps/{staff,parent,dashboard}/src/features/{events,belts}/**
  web/packages/i18n/{he,en,ru}/events.ts

Check: `./scripts/lane-check.sh events && ./scripts/lane-check.sh belts`.

Non-negotiable:
  - **You never write a billing table.** Event fees call
    BillingService.create_charge(kind='event') and nothing else. student_id and event_id
    on that seam are KEYWORD-ONLY, deliberately: both are `UUID | None` in adjacent
    positions, so positionally an event id binds happily to student_id and no type checker
    can see it. You are the lane most likely to make that mistake, which is why it was
    made unspellable.
  - **There is no `belts` i18n namespace.** Belt strings go in events.ts. Do not create
    belts.ts and do not edit web/packages/i18n/types.ts or index.ts — both are authored
    once and never by a lane.
  - G10 — every belt bar carries a 1px ring in the current foreground colour. Fill alone
    makes white invisible on light (1.08:1), black invisible on dark (1.02:1) and yellow
    fail even the 3:1 non-text threshold (2.02:1). Yellow is one of the most common
    children's grades, so this is a constant, not an edge case. BeltBar has no prop that
    turns the ring off and must not gain one.
  - Belt colours are DATA (belt_rank.color_hex), never brand (D3), and must stay visually
    distinct from the three semantic colours.
  - D9.2 — artboard 7c's `משקל / קטגוריה` column is CUT. No weight categories anywhere.
  - 5d (wizard step 2) and 5e (step 4) are setup-wizard SLOT FILLS into M1's container.
    Neither lane opens SetupWizard.tsx.
  - EventCreateIn already refuses requires_consent without consent_text, and an event that
    ends before it starts. Those validators mirror CHECK constraints; keep both.

Never run ./scripts/dev-db.sh reset — it destroys both lanes' databases.
Your .venv and web/node_modules are symlinks to main's, so a dependency change is a
stop-and-tell rather than a lane decision.

Plan with superpowers:writing-plans, then work it task by task: failing test, confirm it
fails, minimal implementation, green, commit.
```

---

## While the lanes run

`main` is idle. **Build the E2E harness then.** `HB-w3-e2e-harness` blocks W3's gate *and*
W4's, since E2E-3 and E2E-4 need exactly the same rig, and it closes `HB-w2-e2e-gate`'s
owed W2 subsets on the way past. It is the highest-value idle-time work available and it
removes a serial session from the critical path for every remaining wave.

Item 1 and item 3 above (`TextField` multiline, `SignaturePad` → primitives) are the other
good use of an idle `main`, and they are worth doing **early** rather than late: both lanes
hit the textarea, and a primitive added after two lanes have each written their own is a
migration rather than an addition.
