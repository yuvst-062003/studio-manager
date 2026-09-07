# Build the parent app's payments screen

The design questions are settled — they were asked and answered on 2026-09-07. This is a
build, not a design session. `docs/plan/prompts/rebuild-payments-screen.md` is the
original brief and still worth reading for background; everything it asks you to decide
is decided below.

Vertical: `billing`. Gate: `./scripts/lane-check.sh billing`.

---

## The screen, in one sentence

It answers "do I owe money, and how do I pay it right now" — and nothing else.

```
┌─────────────────────────────┐
│  יש לשלם                    │   ← the debt. One number. Never moves.
│  ₪208.33                    │
│  ספטמבר 2026 · יובל         │
└─────────────────────────────┘

  איך תשלמו?
  ┏━━━━━━━━━━┓  ┌──────────┐
  ┃ 💳 אשראי ┃  │ 💵 מזומן │
  ┗━━━━━━━━━━┛  └──────────┘

  כמה חודשים?   [1] [2] [3] [6]      ← card only

  שולם מראש · התשלום האחרון · כל התשלומים ←

┌─────────────────────────────┐
│      לתשלום ₪458.33         │   ← what this button charges. Always exact.
└─────────────────────────────┘
```

Three rules that make it honest, and they are the point of the whole rebuild:

1. **The top number is the debt and never moves.** Choosing a method does not change what
   the family owes.
2. **The button always states the real amount.** Never a total the reader has to assemble
   out of two figures.
3. **When the number jumps, the screen says why.** "3 חודשים קדימה" is a line to read, not
   arithmetic to do — and it names the club as the one who chose 3.

## What the owner decided

- **Model the layout on the wizard's step 3**, `features/onboarding/wizard/Step3Payment.tsx`
  — light background, white rounded cards, a summary strip, a sticky bottom button. Not
  step 4 (that one is dark and celebratory; it reports an outcome rather than asking for
  one).
- **Card and cash only.** Card offers 1/2/3/6 months. Cash shows the club's block.
- **Cash shows the 3-month block and names the club as its source** — "המועדון גובה 3
  חודשים מראש במזומן". The club's `PrepayTermsPanel` setting does not change, and the
  screen stops presenting the club's rule as if it were the parent's choice.
- **הוראת קבע and צ'קים leave this screen** for Profile → תשלומים
  (`features/people/redesign/sheets.tsx`, `PaymentsSheet`, under אמצעי תשלום). Both are set
  up once — a standing order moves the money by itself and cheques buy a whole season — so
  neither is a monthly decision and neither should compete for attention every month. The
  `/me/standing-order-links` read moves with them.
- **History: the last payment on this screen, plus the existing link** to
  `#/payments/history`. Nothing more.
- **If they owe it, they can pay it.** See below — this is the behaviour change, and it is
  the reason the old screen could show ₪208.33 owed above buttons offering ₪500/₪750/₪3,000.

## The behaviour change: "if they owe it, they can pay it"

Opening a card payment claims its charges so nobody pays the same month twice. Today that
claim also blocks **the payer themselves** from retrying after closing the uPay tab. In
production the nightly `sweep_stale_orders` releases it a day or two later; on staging
`billing-run` is not a scheduled job at all (`infra/railway/jobs.json` — production only),
so it never releases. That is why the owner's own ₪208.33 sat unpayable.

The fix is in `OrderService`, not in the screen: **the payer's own abandoned pending order
is replaced rather than refused.** Two things stay protected, and both matter:

- An order opened within the last `REPLACE_GRACE_MINUTES` (10) is left alone. uPay's IPN
  lands about five minutes after a real payment; replacing inside that window is the one
  way this flow can take a family's money twice.
- `paid` and `amount_mismatch` still hold their claim. Neither is abandoned — money
  arrived, and for a mismatch a human has to look.

Because it lives in `OrderService.create`, the shop's checkout gets it too.

## State of the working tree

Two files are modified and **uncommitted**. Read the diff before you continue — the
approach is sound but the change is half-landed.

- `tests/billing/test_orders.py` — four new tests at the end of the file. Two pass already
  (they are the guards: the 10-minute window, and money that arrived), two fail. That is
  the correct starting position.
- `app/services/billing/orders.py` — `REPLACE_GRACE_MINUTES`, the two private helpers
  `_replaceable_order_ids` and `_claims`, and `selectable_charges` / `covered_charge_ids`
  rewired through `_claims`. **Not yet run** — the edits landed but no test run followed
  them, so treat every claim in this section as unverified until you run it yourself.

If you would rather start clean: `git checkout -- app/services/billing/orders.py
tests/billing/test_orders.py`. Nothing else in the repo depends on these edits.

## What is left

**Backend**

1. `OrderService.create` — supersede the payer's own replaceable orders (mark them
   `expired`, which is an existing status, so no migration and no contract change) before
   computing the `claimed` set, instead of raising `ConflictError` over them.
2. `PaymentPromiseService.create` (`payment_promise.py`, around line 132) reads
   `covered_charge_ids` for the same guard, so a family with an abandoned card payment
   currently cannot raise a **cash** promise either. Same rule, same helper.
3. `/me/charges` — `_charge_page` in `app/routers/billing.py` calls
   `covered_charge_ids(...)` with no payer. Pass the caller and `now()` so the screen sees
   what `create` would accept. The manager's `/charges` listing keeps today's behaviour:
   an order holds its charge and a manager should see that.
4. A test at the API level: a charge held only by the caller's own abandoned order comes
   back with `is_covered_elsewhere: false`.

**Frontend**

5. The new screen in `web/apps/parent/src/features/billing/redesign/`, wired into
   `App.tsx` at the existing `onPayments` branch. `PaymentsScreen.tsx` and
   `PaymentsSection.tsx` stay on disk until the redesign is accepted end to end, the same
   way `ShopSection` and `ProfileSection` did.
6. Reuse, do not rewrite: `ClubShop.tsx` already does card → uPay overlay and cash →
   promise → manager notified, through `makeParentBillingClient` and `PaymentOverlay`.
   That is the third implementation this repo must not grow.
7. Move the standing-order links and the cheque route into `PaymentsSheet`
   (`features/people/redesign/sheets.tsx`).
8. Strings in `web/packages/i18n/he/billing.ts`, mirrored in `en/` and `ru/`. Never inline
   one. Do not touch `web/packages/i18n/index.ts`.

**Staging cleanup**

9. The owner's stuck ₪208.33 is on **staging** and they approved deleting it. Reaching
   that database is `railway ssh --service api` from a staging-linked worktree — the
   private network is the only route. Show the row before the delete.
10. Worth raising separately, not part of this build: staging has no `billing-run` job at
    all, so no charge run, no debt ladder, no stale-order sweep. Nothing on staging can
    demonstrate those behaviours today.

## Rules this work trips over

`CLAUDE.md` is authoritative. The ones that bite here:

- Money is integer agorot. Never divide at a call site.
- RTL: logical CSS only (`margin-inline-start`, never `margin-left`).
- Anything `fixed` to the bottom needs `env(safe-area-inset-bottom)` — the sticky footer
  sits above the tab bar, and `web/tools/__tests__/app-viewport.test.ts` scans for it.
- Failing test first, then the fix. Verify by mutation: break it, watch the test go red.
- `app.core.clock.now()` is the only clock. Note that the replacement rule reads an
  order's age from `expires_at`, not `created_at`, precisely so it moves with the injected
  clock — `created_at` is a database default and would make the rule untestable.
- Scope test runs to what the change can reach. `tests/billing/`, and the parent app's own
  vitest files. Not the whole suite.
- Tick the piece in `docs/plan/state.yaml` in the same commit as the work. Stage by
  explicit path — other sessions commit to this repo concurrently.

Show the owner each screen state — owing, card picked, cash picked, nothing owed — and
wait for a yes before moving on.
