# Rebuild the parent app's payments screen

**Start by asking, not by coding.** The design is half-decided and the rest is the
owner's call. Use **AskUserQuestion** for every open point below before you write
anything, and again whenever a new fork appears.

---

## The situation

The parent app was redesigned — home, shop, updates, profile and the join wizard.
**The payments screen was never ported.** It is still the original screen, in the old
design system, and the owner has now seen it and does not understand it. Reached from
Profile → תשלומים, or `#/payments`.

- Screen: `web/apps/parent/src/features/billing/PaymentsScreen.tsx` (view) and
  `PaymentsSection.tsx` (data + client). No `redesign/` version exists.
- The redesigned look to match: `web/apps/parent/src/features/onboarding/wizard/Step3Payment.tsx`
  (the wizard's payment step) and `Step4Done.tsx` (its confirmation).
- A redesigned "how will you pay" block already exists and works:
  `web/apps/parent/src/features/billing/redesign/ClubShop.tsx` + `ShopScreen.tsx`
  (card → uPay overlay, cash → promise → manager notified). **Reuse it. Do not write a
  third one.**

## Why the screen has to exist at all

The owner asked this directly, and the answer shapes the design:

- The wizard makes a family **choose** a method and **start** paying. It does not
  guarantee money arrived — a cash choice is only a promise, and a card checkout can be
  abandoned. The owner's own account has **₪208.33 stuck in a payment that was opened and
  never finished**, and nothing chased it.
- `app/services/billing/run.py` creates **a new charge every month** for every student.
  The wizard runs once, at joining. Everything after that lands here.
- Cash and cheque families never pay in the app at all. They owe every month.

## What the owner has decided

1. It should look like the wizard's payment step.
2. **The monthly choice is card or cash only.** With הוראת קבע the money moves by itself,
   and cheques are handed over as a block — neither needs a monthly action from the parent.
   Those two are set up once and should not compete for attention every month.

## What is wrong today, beyond the styling

Every number on the screen is correct and none of it is explained:

- ₪208.33 shows as owed, but the payment cards offer ₪500 / ₪750 / ₪3,000, because the
  ₪208.33 is frozen inside that unfinished payment and cannot be paid again.
- מזומן demands 3 months ahead and צ'קים 12 — those are **the club's settings** (the
  manager's `PrepayTermsPanel`), not choices the parent is making, and nothing says so.
- The screen never mentions the stuck payment or offers a way out of it.

## Ask the owner about these

Do not decide them yourself:

- **Which wizard screen is the model** — the payment step (3) or the done screen (4)? The
  owner said "step 4"; the payment step is 3. Confirm before porting a layout.
- **Where do הוראת קבע and צ'קים go** if they are not monthly choices — a "set up once"
  section lower down, in Profile, or gone from this screen entirely?
- **Cash is configured as 3 months ahead.** If cash is to be a monthly choice, does that
  setting change, or does the screen show a 3-month block and say so?
- **The stuck payment.** Should the screen offer to resume or cancel it? Should the wizard
  refuse to finish while a checkout is unpaid? Should something chase it? Today: none of
  the three.
- **How much history** belongs here versus behind `#/payments/history`.

## Rules

`CLAUDE.md` is authoritative. The ones this work will trip over:

- Hebrew strings live in `web/packages/i18n/he/billing.ts`, mirrored in `en/` and `ru/`.
  Never inline a string.
- Money is integer agorot. Never divide at a call site.
- RTL: logical CSS only (`margin-inline-start`, never `margin-left`).
- Anything `fixed` to the bottom must include `env(safe-area-inset-bottom)` — there is a
  guard in `web/tools/__tests__/app-viewport.test.ts` that scans for it.
- Write a failing test first. Verify by mutation: break the fix, watch the test go red.
- Show the owner each screen and wait for a yes before moving on.
