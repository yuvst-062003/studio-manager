# Join payment fixes — decided 2026-09-12

A real family signed up on production on 12 September and was shown a uPay card page for
₪275 after the manager intended הוראת קבע at ₪550. Investigating that produced four
decisions and one already-shipped fix, plus a second report from the same root cause.
This is the work list.

## What actually happened

Verified against production, not inferred:

| Evidence | Finding |
| --- | --- |
| Charge `2df04303` | ₪275, original ₪550, note `בגין 4 מתוך 8 שיעורים`, Sept 2026, still `open` |
| Order `2e61391d` | ₪275, `pending`, expires 2026-09-13 07:26 UTC (10:26 Asia/Jerusalem) |
| `student.payment_method` | `upay_card` |
| Audit log | **one** registration, 07:26:24 UTC; method written 07:26:25; nothing since |
| Payment promises | **none in the entire database** |

Three causes, and it took all three to produce the screenshot:

1. **The wizard saves nothing.** `JoinWizard.tsx` holds `step`, `agreed`, `students`,
   `methods` and `alreadyArranged` in plain `useState` and persists none of them. The
   manager was in a **mobile browser tab, not an installed PWA**, and twenty minutes passed
   between the screenshot and the submit — ample time for the tab to be reclaimed and
   reloaded. Everything resets to first principles on reload.
2. **The method was never really chosen.** `methods[student.id] ?? 'credit'` means אשראי
   arrives pre-selected and the footer already reads `(₪550)`. A deliberate card choice and
   an untouched screen are pixel-identical and behave identically. So when (1) wiped the
   real choice, the screen silently showed card and the next press charged it. Proven by
   test: touching no method at all still calls `createOrder`.
3. **The card route billed a prorated first month.** ₪550 × 4/8 = ₪275, correct per §5.10 as
   it stood — but הו"ק's uPay link is a flat ₪550 we cannot change, so the same family was
   priced differently depending on which button they pressed.

**(1) and (2) are one bug wearing two faces.** The manager also reported having to fill the
whole wizard again after leaving it mid-way — that is cause (1) on its own, without (2)
attached. Fixing persistence fixes both reports.

## Decisions

- **The wizard remembers where the family left off.** Leaving mid-registration must not cost
  them their answers — on a phone browser, leaving is normal, not exceptional.
- **Take the method the person picked.** No silent default.
- **Full month, every time.** Proration of the first month is removed entirely. Someone
  joining on the 29th pays the full month; a manager waives it by hand when they choose to
  (`POST /charges/{id}/adjust` and `/close` already exist).
- **Cash at signup collects 3 months total** — this month plus 2 more. ₪1,650 at ₪550/month.
- **הו"ק's mandate covers its own first month.** Nothing collected separately. With
  proration gone the flat ₪550 link matches the rule exactly, so no special handling is
  needed anywhere.
- **Applies to new orders only.** No retroactive re-pricing of existing charges.

---

## 0. Remove the "ביטוח שנתי כלול" badge — DONE, uncommitted

A hard-coded label in the breakdown header backed by no data — no plan, studio setting or
price carried insurance.

- [x] Badge removed from `Step3Payment.tsx`
- [x] `insuranceIncluded` removed from `wizard/copy.ts`
- [x] Key removed from `i18n/{he,en,ru}/people.ts`
- [x] `npm run typecheck` clean · 29 `JoinWizard.test.tsx` tests pass

## 1. Remember the wizard when the family leaves it

The manager left mid-registration and had to start from scratch. Same root cause as the
payment-method loss, and the higher-leverage half of it.

**`joinDraftStorage.ts` already exists and does exactly this job** — `loadJoinDraft`,
`saveJoinDraft`, `clearJoinDraft`, keyed per token, with its own passing test file. Its
header argues the case in detail and cites §2 decision 3: *"the draft lives in localStorage,
keyed per token ... it must survive a closed tab."*

**Nothing in the app calls it.** `saveJoinDraft` and `loadJoinDraft` have zero production
callers — only their own tests. The wizard rewrite dropped the persistence a decision
required, the module was left orphaned, and its green tests prove nothing about the screen.

- [x] Wire `JoinWizard.tsx` to save on change and restore on mount: `step`, `agreed`,
      `students`, `methods`, `alreadyArranged`.
- [x] Reuse `joinDraftStorage.ts` rather than writing a third draft module — the app already
      has two (`draft.ts` for the in-progress child, this one). Extend `JoinDraft` to the
      wizard's shape.
- [x] Honour the existing lifecycle: cleared on successful submit, cleared on sign-out
      (`clearAllJoinDrafts` is already called from `App.tsx` and `AccessGate.tsx`), and give
      it `draft.ts`'s 24h TTL so a minor's health answers do not linger on a shared phone.
- [x] Reconsider `draft.ts` rule 4 — "cleared when the wizard is left" is what makes leaving
      lose the in-progress child. Keep the TTL and the submit/sign-out clears; drop the
      clear-on-exit.
- [x] Test the seam, not the module: fill part of the wizard, remount it, assert the family
      is where they left off with their children and their methods intact. The existing
      `joinDraftStorage.test.ts` passes today and caught none of this.

## 2. Take the chosen payment method

The bug that caused the incident. Highest priority.

- [x] `Step3Payment.tsx` — no method pre-selected; a child with no choice renders with all
      four buttons inactive.
- [x] Remove the `?? 'credit'` fallback in both places it decides behaviour:
      `Step3Payment.tsx` (display, ~line 548) and `submitJoin.ts` (the write, ~line 226).
      They must not disagree, and today they silently agree on the wrong thing.
- [x] Submit button disabled until every chargeable child has a method. A family that has
      not answered cannot reach uPay.
- [x] Persistence of `methods` is handled by section 1. Both are needed: section 1 stops the
      choice being lost, this section stops a lost choice being submitted silently.
- [x] Tests — this seam is why the bug shipped. Only `cash` is currently driven from the
      screen; `standing_order` is asserted with hand-built props, which proves nothing.
  - [x] Each of the four methods, driven from the screen through to the write
  - [x] Submitting with nothing chosen is impossible
  - [x] `standing_order` reaches `createPromise` and never `createOrder`

## 3. Full month, always — remove first-month proration

All in `app/services/billing/run.py`.

- [x] Delete the proration branch in `_charge_one` (~lines 505–530). The charge becomes
      `plan.monthly_amount_agorot`, full stop.
- [x] Remove what that leaves dead — each has exactly one caller today: `proration()`,
      `_is_first_tuition`, `_joined_on`, `_sessions_in_period`, `_explain_proration`.
- [x] Drop `prorated` from `_Tally` and from the run log.
- [x] **Keep the `proration_note` and `original_amount_agorot` columns.** `proration_note`
      is reused as a general line-note by manual charges, adjustments and shop items
      (`routers/billing.py:906,951,1742`, `routers/shop.py:250`). Only the first-month
      writes go.
- [x] Update the backend tests asserting proration.
- [x] Confirm step 3's existing ₪550 is now simply correct — **no preview endpoint is
      needed**, which was the main cost of the alternative.

## 4. Cash prepay at signup

- [x] Change `cash_prepay_months` default from `3` to `2` in `routers/billing.py:1326`.
      **This is the club's number.** `prepay_months` counts months *on top of* what is
      already owed, and signup always has one open charge — so `2` collects this month plus
      two more, three in total, ₪1,650.
- [x] The term is published on `GET /public/onboarding/{token}` so step 3 can show it before
      the family commits — a door B family belongs to no studio until `register` returns, so
      `/me/prepay-terms` 403s at exactly the moment the number is needed.
- [ ] **NOT DONE — `submitJoin.ts` still passes a hardcoded `0`** (lines 377, 390), so a cash
      signup records one month, not three. Deliberately left: wiring the charge without also
      showing the family the ₪1,650 would re-create the defect this whole document is about
      — a screen saying one number while the write records another.
- [ ] **NOT DONE** — show the family the three months on step 3, then pass the term.
- [ ] **NOT DONE** — test that a cash signup promises the open charge plus two forward months.

## 5. הוראת קבע

- [x] With proration gone the mandate's flat ₪550 and the month's charge are the same
      number, which is what removes the mismatch. Covered by
      `tests/billing/test_first_month.py`.
- [ ] **NOT DONE** — confirm against a real standing-order signup that no second charge is
      raised and the promise matches what the mandate collects. Needs a run on staging.

## 6. The live family on production

**Do nothing to the order.** It expires on its own at 10:26 Asia/Jerusalem on 13 September,
which releases the charge. There is nothing to cancel: no payment, no promise, and no
manager action since the registration.

**Superseded by what the family did next.** At 08:29 UTC (11:29 local) the manager went
through again: a **cash promise for ₪550** was created, `student.payment_method` is now
`cash`, and the ₪275 card order is still `pending` beside an open ₪275 charge. The promise
claims a month the charge does not cover, because the second pass took the
already-on-the-roster path and priced a claim from the plan.

- [ ] **NOT DONE** — reconcile: the ₪275 charge, the ₪550 cash promise and the stale card
      order describe one month three different ways.
- [ ] **NOT DONE** — confirm with the manager before touching a real family's money.

---

## 7. The second onboarding flow — DELETED

The manager's third report: mid-registration he was in a **five-step** wizard
(`הסכמה · תקנון · הפרטים שלכם · הצהרות בריאות · תשלום`) and asked how he had ended up on an
older version. He had not. Production served one bundle and both flows were in it.

`HealthGate` — §5.5's hard block on the whole parent app — rendered `AgreementFlow`, a
second onboarding flow with its own rail and its own registration, terms and declaration
screens. The 2026-09-02 redesign put it explicitly out of scope; nothing ever came back for
it, so the app had two flows and the gate showed the older one.

- [x] `HealthGate` reduced to the DECISION (who is blocked). The shell supplies the one
      wizard, seeded with the family's own children.
- [x] `GET /me/wizard-prefill` — the caller's own children with what step 2 pre-fills from.
      Not `StudentSummaryOut` (shared with a `coach`-tagged route, where a plan id may never
      appear), and deliberately **no ת.ז.**: it stays encrypted at rest and the wizard asks
      for that one field again.
      Not under `/me/students/` either — that prefix is matched by name in client fetch
      stubs, and sharing it hung an unrelated test.
- [x] Deleted: `AgreementFlow`, `ClubTermsStep`, `RegistrationStep`, `DeclarationForm`,
      `SignaturePad`, `JoinFamilyStep`, `OnboardingWizardChrome` (the five-step rail) and
      their tests. `ConsentGate`'s dead `wizard` chrome path went with them.
- [x] `startingStep` hardened: it read `status?.steps.find(...)`, so a present-but-malformed
      status threw — which, now that the gate opens this wizard, would take the whole parent
      app down rather than cost one skipped step. Found by the shell tests.
- [x] `tools/__tests__/unreachable-screens.ts` caught `SignaturePad` left exported and
      unreferenced after the deletion. That guard is the one that would have caught this
      whole class earlier.

**Verified:** 3935 frontend tests across 255 files, typecheck and lint clean;
backend people/billing/contracts/restrictions green, `mypy` and `ruff` clean.

## Open questions

- **Cheque at signup**, still open and NOT wired. `cheque_prepay_months` is `12`. By the same counting rule that makes
  cash `2`, twelve cheques total would be `11` — but at signup `12` would ask for thirteen
  months. Decide the number, or leave cheque out of the signup prepay entirely.
- **Someone joining in the last days of a month** now pays a full ₪550 for one or two
  sessions. The manual waive exists; worth watching whether it gets used often enough to
  deserve a rule.

## Verification

- `.venv/bin/pytest` scoped to the billing suites the change touches — not the whole suite
- `npx vitest run` on the wizard files
- `npm run typecheck && .venv/bin/mypy app`
- Open step 3 in the real app and look at it before calling any of this done
