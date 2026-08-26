# Lane MONEY (M6) — handover

Written 2026-08-26 at the end of the lane. Everything below was measured in this worktree,
not remembered. Where a number is stated, the command that produced it is stated with it.

---

## State

| | |
|---|---|
| Branch | `lane/money`, rebased onto `main` (which moved three times during the lane) |
| Pieces | `M6.1` … `M6.12`, all ticked in `docs/plan/state.yaml` |
| Lane check | `./scripts/lane-check.sh billing` — **green, 7 scoped gates** (6 at handover; the frontend gate stopped being skipped) |
| Backend suite | `.venv/bin/pytest` — **1 failed, everything else green.** The one failure is `tests/identity/test_settings.py::test_no_provider_credential_has_a_default`, which is not this lane's — see *Owed elsewhere* |
| Frontend suite | `cd web && npx vitest run` — **15 failed, 1458 passed.** All fifteen are `apps/*/src/sw-precache.test.ts`, which throw `dist is missing — run npm run build first`. Not this lane's |
| Lane tests | 191 backend across `tests/billing` + `tests/upay`, 62 frontend |
| Types | `.venv/bin/mypy app` and `npm run typecheck` both clean |

---

## The four IPN shapes, measured against a running server

Not simulated in a test client — `uvicorn` on port 8931, four real HTTP GETs at
`/api/v1/webhooks/upay/{public_ref}`, each against its own seeded studio, order and charge.

| Shape | HTTP | order | charge | payments | agorot received | ipn rows | match |
|---|---|---|---|---|---|---|---|
| `success` | 200 | `paid` | **settled** | 1 | 25 000 | 1 | `auto` |
| `amount_mismatch` | 200 | `amount_mismatch` | **open** | 1 | **24 999** | 1 | `unmatched` |
| `forged_ref` | 200 | `pending` | **open** | **0** | 0 | 1 | `unmatched` |
| `duplicate` (delivered twice) | 200 | `paid` | settled | **1** | **25 000** | **1** | `auto` |

Read the two rows that matter. `amount_mismatch` records a payment for the money that
**actually arrived** and settles nothing — §5.10's "a payment **is** recorded … charges are
**not** settled", with the real 24 999 on the row. `duplicate` delivered the same
`transactionid` twice and produced **one** payment and **one** record, not two — 25 000
total, not 50 000.

That is E2E-3's and E2E-4's backend halves, proven. **The browser halves are not**, and
cannot be — see the next section.

---

## What this lane could not close

**E2E-3 and E2E-4 — W4's stated exit gate.** `HB-w3-e2e-harness` blocks both and is a
carried holdback, not this lane's: there is no Playwright harness, no router for the
seventeen `page.goto()` deep links, one `baseURL` for three separate Vite apps, and none of
the eleven testids the specs name. The backend halves are proven above; the browser halves
need the harness.

**`HB-price-list`** stays open. It blocks the club's real numbers, not the code — a price
plan is data a manager enters, and the lane shipped against the fixture's ₪250/₪100.

---

## ▲ Three things somebody has to decide

### 1. `app/routers/dev.py`'s IPN simulator never delivers, and cannot (**D-M6-13**)

§19.5 calls it "the important one" and W4's exit gate is meant to be driven from it. Two
bugs, both in the core lane's file:

```
dev.py checks : /api/v1/webhooks/upay/824721ce-…   in openapi? False
openapi has   : /api/v1/webhooks/upay/{public_ref} in openapi? True
```

`simulate_ipn` builds a **concrete** path and tests it against OpenAPI's **templated** keys.
It can never match, so `delivered` is `false` for ever and the note keeps naming M6 as
unlanded — the exact failure mode its own docstring says the OpenAPI check was chosen over a
`.routes` walk to avoid. And separately: even when the check passes, the handler never issues
the GET. It computes a note and returns the query, so `delivered: true` would be a claim
rather than an action.

`tests/dev/test_ipn_simulator.py::test_the_endpoint_reports_honestly_that_m6_has_not_landed`
says going red is "the signal to delete it". It will never go red.

A few lines in `app/routers/dev.py` plus that test. Not this lane's file.

### 2. `''` is not `None`, and it has now bitten four times (**D-M6-12**)

The committed environment template ships **eight** optional keys with empty values, and all
eight are declared `X | None = None`. Following the template — which its own first line
instructs — yields `''`, never `None`:

| key | bitten |
|---|---|
| `DEV_TOOLS_TOKEN` | `dev_tools_allowed` (fixed in `728b665`), then `DevClockMiddleware` (fixed in `b5cf3e1`) |
| `GOOGLE_OAUTH_CLIENT_ID` | `tests/identity/test_settings.py` — **still red** |
| `UPAY_MERCHANT_EMAIL` | this lane's blast radius |

The fix belongs once in the settings module, the way `configured_dev_token()` now does for
one key. **This lane defended its own boundary regardless**: `OrderService.form_fields`
raises `MerchantEmailMissingError` on a missing *or blank* merchant email, because `email=`
on the form is a real payer sent to a real hosted page to pay an account that does not exist,
and `upay_form_fields` checks `studio.is_demo` and nothing else.

### 3. A §11.7 gap the scrubber cannot reach

uPay delivers the card owner name and last four digits as **query parameters** (§12), so any
access log that records a request's query string copies them — httpx in tests, uvicorn in
production. `app/core/logging.py`'s scrubber redacts by **key** and already lists
`card_owner_name`, `four_digits` and `raw_query`, but an access-log line is one message
string with the whole URL inside it.

Recorded as a **strict xfail** at
`tests/upay/test_webhook.py::test_the_access_log_does_not_carry_the_card_digits`, so it is a
build artefact somebody has to look at rather than a note somebody has to find. Our own
loggers are clean and asserted.

---

## Decisions this lane made (re-open one rather than rediscover it)

| | |
|---|---|
| **D-M6-1** | `1b` is the payments tab; `12f` is history reached from it |
| **D-M6-2** | The receipt email is a card-row affordance — D9.3's structural half, never applied on the artboard |
| **D-M6-3** | `12f`'s filters are `charge.kind`, not a third taxonomy |
| **D-M6-4** | Billing studio settings live under a `billing` key in the JSONB `settings`, on this lane's own router |
| **D-M6-5** | The dev bar's `runJob` triggers `POST /billing-runs`, not a `/dev/jobs` route in core's file |
| **D-M6-6** | Invariant 5's live seam-detector case moved to W5's still-stubbed `enqueue` |
| **D-M6-7** | `assert_idempotent` wired to a real seeded run, not weakened |
| **D-M6-8** | **A tuition charge's period is derived from its `due_date`**, and the run dues every tuition charge on the last day of the period it bills. The frozen seam has no period parameters yet keys idempotence on one; this is the only way both are true. `registration`, `event` and `manual` carry a NULL period, which is what the partial index's `postgresql_where` was written for |
| **D-M6-9** | `3e`'s two finance KPIs get keys in `billing.ts`, not M9's `reports.ts` |
| **D-M6-10** | "Household" is the payer person. There is no household entity (L9) |
| **D-M6-11** | The reconciliation queue is designed from §5.10 — eighteen keys, no artboard anywhere |
| **D-M6-12** | `form_fields` refuses a blank merchant email, not only a missing one |
| **D-M6-13** | The IPN simulator's two bugs, recorded rather than fixed (core's file) |
| **D-M6-14** | **`11a` ships with no inventory.** The artboard draws an out-of-stock row, an auto-inventory switch and a live `7 → 6` decrement; §5.10 and §4.3 both forbid all three, and `product` has no column that could hold a count. `12e`'s spec names the conflict: "only one of them can be right" |
| **D-M6-15** | `11a`'s list is scoped by attendance — a cross-lane **read** of M5's marks, passed in as a prop so the dependency is visible at the call site |

---

## Owed back to `packages/`

Feature-local because `w4-lanes.md`'s rule — primitives are not a lane's to add — applies to
shared packages too. Each is one file, and each is named here so the migration is an
addition rather than an archaeology:

| What | Where it lives now |
|---|---|
| `agorotFromShekels` — the shekels→agorot parse | `web/apps/dashboard/src/features/billing/money.ts`. `@studio/core`'s `money.ts` formats agorot and has no parse in the other direction |
| A KPI stat tile | `CollectionsScreen.tsx`'s local `Stat`. `3e`'s spec asks for it to be extracted once across `6a`, `4a`, `4c`, `1c`, `9g` — this is the sixth copy |
| A sort/select control | Not built. `3e` needs one and its spec records it as a gap on its **third** artboard |
| An icon-only button variant | Not built. `12f`'s receipt icon ships as a labelled `Button`; `9b` and `9c` want the same variant |

`TextField` multiline landed on `main` (`b52369f`) while this lane ran and is used by
`RecordPaymentDialog`. **D13 is still raised and unresolved** — `AlertTone` has no green that
is not `paid`, and the reconciliation queue is the first screen wanting a success tone that
is not about money having been received (`w4-lanes.md` decision 2).

---

## For the merge

1. **MONEY first**, then rebase EVENTS. M7 is a pure caller of `BillingService.create_charge`.
2. **`security-reviewer` on the uPay diff specifically** — `app/integrations/upay/**`,
   `app/routers/webhooks.py`, `app/services/billing/{orders,reconciliation}.py`. The plan
   calls this "the one diff in the project where a review miss costs real money", and the
   lane deliberately kept it uncluttered: the only non-billing change in it is the
   restriction-1 allowlist entry for `webhooks.py`.
3. Files this lane touched **outside** its ownership, each with its reason in the commit:
   `tests/invariants/test_05_*` (the tripwire it was built to fire), `tests/contracts/test_seams.py`
   (the same move lane SCHEDULE made), `tests/restrictions/test_01_*` (the allowlist entry the
   guardrail demanded), `tests/config/test_lane_check.py` (its docstring described a
   pre-M6 billing), and `web/packages/api-client/src/schema.d.ts` + `openapi.json` (generated,
   never hand-edited).
4. `main` gained `b5cf3e1` from this session — the clock middleware answering to
   `dev_tools_allowed` rather than to a copy of it. It fixed 110 failing tests across
   `tests/{health,schedule,attendance,dev}` that no lane check reaches.
