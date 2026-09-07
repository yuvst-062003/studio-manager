# Prompt 4 — The parent wizard: 28 taps, a back button that eats the form, and no way to resume

Repo: `/Users/yuvalstolin/Desktop/studio-manager`. Read `CLAUDE.md` first — **no inlined
strings**, every Hebrew string lives in `web/packages/i18n/he/<namespace>.ts` and is mirrored
in `en/` and `ru/`. `web/packages/i18n/index.ts` is authored once and a lane never edits it.
Python tooling is in `.venv` — always use the `.venv/bin/` prefix.

Read `docs/superpowers/specs/2026-09-02-completion-findings-register.md` **§5 and §6** in
full. Also read `docs/onboarding-link-spec.md` — §5.4b is the written spec for this flow, and
it records that the invariant "enrollment is always a manager decision" is **deliberately
excepted** here for families that already train at the club.

Lane verticals: **`people`** and **`health`**. Gates:
`./scripts/lane-check.sh people` and `./scripts/lane-check.sh health`.

This is the manager's loudest complaint: *the sign-up wizard is not good — no forward/back
buttons, too long.* Two things are true about that. The back button **is already fixed** in
the working tree and on staging; production is one iteration behind (§5). And "too long" is
measurable: **28 required interactions for one child, 49 for two.**

## Read §5 before you plan anything

Production's parent bundle is missing 30 strings that exist on staging — the entire wizard
rework, including `onboarding.stepOf` (the "step X of Y" counter), `onboarding-wizard-back`
and `join-payment-step`. **His loudest complaint is against a build one iteration old.**

Worse: production's bundle contains `join-onboarding-rail`, `join-step-position` and
`join-terms-step`, and **none of those strings exists in any commit**. Production was deployed
straight from an uncommitted working directory, which is what `railway up` does. **Git is not
a record of what is running.** Take that as this lane's standing warning, not a footnote.

## Do this FIRST — use AskUserQuestion

Use the **AskUserQuestion** tool before writing code. Questions 1 and 2 change the shape of
the deliverable:

1. **"Too long" — how do we shorten it?** One child ≈ 28 required interactions; two children
   ≈ 49, because the health step repeats **in full** per child. Options: **carry the family's
   shared answers across siblings and ask only what differs** (recommended — the working tree
   already prefills a sibling's registration step, commit `9ab7a07`) / **surface
   `markAllHealthy` at the top of the health form** — it fills every blank with "no" in one
   tap and is currently buried mid-form (`DeclarationForm.tsx:196-203`), the single biggest
   length mitigation in the product / **cut fields from the family step** — 18 controls for
   one child, of which 9 are required; ask which of the other 9 the club actually needs /
   all three.
2. **Only 8 of the 13 health questions are enforced and the parent cannot tell which 5 are
   optional.** Options: mark the optional five visibly / make all 13 required / drop the five.
   This is the club's medical paperwork — ask, do not decide.
3. **Nothing is saved between steps (§6.4).** Where should the draft live? Options:
   `sessionStorage` per token (recommended — no schema change, no PII at rest beyond the tab)
   / a server-side draft on the onboarding link / `localStorage`. Note when you ask: the form
   holds **children's national ids and health answers**, so a draft that outlives the tab is a
   privacy decision, not a convenience one.
4. **The adult-student path (§6.5).** Confirm the intended flow for an adult who trains
   themselves and has no children — today the checkbox sits last, below "add another child",
   and ticking it keeps the blank child row.

## The work, worst first

### A. Validation refuses invisibly — §6.2, and this is the core of "the wizard is not good"

The forward button is disabled while the form is invalid (`JoinFamilyStep.tsx:606` →
`WizardNavButtons.tsx:39`), so `submit()` never runs, so `setShowErrors(true)`
(`JoinFamilyStep.tsx:211`) is **unreachable**. Consequently `idError`/`requiredError` always
return `undefined`, no field ever turns red, and the "fill the required fields" alert
(`:594-598`) never renders.

**A parent missing one of nine fields sees a grey button and no reason at all.** They cannot
tell which field, that there is a field, or that anything is wrong.

`ClubTermsStep` does not have this bug, because its button is not disabled. That is the fix
in one sentence: let the button be pressed, and let the press explain itself.

Separately, `JoinFlow.tsx:189,200-202` collapses every non-2xx to `common.error.generic`,
discarding the `{code, field}` the server sends for an invalid national id
(`app/routers/onboarding.py:365-369`). The server already tells the client which field is
wrong; the client throws it away.

### B. Back is broken three different ways — §6.3

- **Step 3 → 2 works but destroys all 18 fields.** `JoinFamilyStep` unmounts and returns a
  fresh `emptyChild()` (`JoinFamilyStep.tsx:149`).
- **Step 4 → 3 is a trap.** The children already exist server-side, so resubmitting hits
  `DuplicateStudentError` (`app/services/people/onboarding.py:225`), `created_pairs` is empty,
  and `_apply_family_details` is **skipped entirely** (`:428`). The parent retypes 18 fields
  and **nothing is written**.
- **Step 5 → 4 is inert.** The effect at `JoinFlow.tsx:122-131` immediately pushes back to
  payment. The button visibly does nothing.
- `JoinHealthStep` renders back twice — chrome (`:47`) and a second button (`:98`).

The step-4-back trap is the same defect as §6.8's second dead end, from the other direction.
Fix them together: `_apply_family_details` must run whether the children were created now or
already existed.

### C. Two dead ends where a parent can never finish — §6.8

- If `client.consents()` rejects, `ConsentGate` stands aside (`:120`) but `JoinShell`'s
  children are `consentReviewed ? <JoinFlow/> : null` — so `/join/<token>` renders a
  **completely blank page**. A network blip on the first request ends the funnel.
- **When all children are duplicates**, registration details are never written, so
  `registration_complete` stays false (`app/services/health/agreement.py:204-211`),
  `agreement_complete` stays false, and `needsFullDeclaration` keeps returning the same child
  forever. The parent signs the declaration, sees the green "submitted" alert, and **the
  wizard never advances to payment.** That is exactly the trial-family funnel
  `app/routers/onboarding.py:303-310` says this door exists to serve.

### D. Nothing is saved between steps — §6.4

No `localStorage`, no `sessionStorage`, no server draft anywhere in `features/onboarding/`,
`ConsentGate.tsx`, `ClubTermsStep.tsx` or `DeclarationForm.tsx`. Close the tab at the health
step and step 3's 18 fields, the terms tick and every health answer are gone. Reopening
`/join/<token>` restarts at `step = 'terms'`. **There is no resume path.**

Build per the answer to question 3. Whatever you choose, clear the draft on completion —
a national id sitting in storage after the parent is done is a finding of its own.

### E. Length — §6.1

Per your answer to question 1. Measure before and after and put the two numbers in your
commit message: *"28 → N required interactions for one child, 49 → M for two."* A claim that
it is shorter, without a count, is not a claim anybody can check.

### F. The rail, and its two dead constants — §6.7

The rail is **correct** — consent renders at position 1 inside the same chrome
(`ConsentGate.tsx:255-263`), so 1-2-3-4-5 is consistent. The register's own §16 records that
"the rail is off by one" was **wrong**; do not go looking for it.

What is real: `JOIN_STEP_POSITION` (`JoinFlow.tsx:36-41`) is read only for `terms` and
`payment`, while `family` and `health` are hardcoded in their child components
(`JoinFamilyStep.tsx:270`, `JoinHealthStep.tsx:49`) — two sources of truth that happen to
agree today. And the rail is **absent** on the sign-in wall (`JoinFlow.tsx:145-155`) and the
expired-token screen (`:134-142`), which are exactly the two screens where a parent most needs
to know where they are.

## What this lane does not touch

- **Payment step internals** — `PaymentSetup.tsx`, `PaymentsScreen.tsx`,
  `PaymentCompleteScreen.tsx`, `PaymentCompleteSection.tsx` belong to **prompt 1**. You own
  `JoinFlow.tsx`'s routing to and from payment; they own what happens inside it. §7.2 (the
  standing-order links fetched before the children exist) and §7.6's `onNothingToPay` bounce
  are theirs even though both fire inside your wizard. Agree the seam in the register.
- **The other three entrances** — landing/trial booking, `#/join`, `#/add-child` — belong to
  **prompt 5** (§6.6). You own `/join/<token>` only. If your fix should obviously be shared
  with them, write the shared piece and tell prompt 5 where it is.
- `ConsentGate.tsx:119` returning bare `null` is listed under §7.9 with the money lane's
  three; it is yours, take it.
- Design. Fix the invisible validation; do not restyle the form.

## Verification

```bash
.venv/bin/pytest -q tests/people tests/health
cd web && npx vitest run apps/parent/src/features/onboarding apps/parent/src/features/health apps/parent/src/features/privacy --reporter=dot
./scripts/lane-check.sh people && ./scripts/lane-check.sh health
npm run typecheck && .venv/bin/mypy app
```

`JoinFlow.test.tsx` and `ConsentGateMounted.test.tsx` already exist in the working tree — read
them before adding to them.

**Walk the whole wizard as a parent, twice.** Once with one child, once with two, from
`/join/<token>` to the payment screen, pressing back at every step. The register's §17 records
that no such walk has ever been done — everything in §6 is code reading. You are the first
session in a position to prove or disprove it, and a finding you disprove is worth as much as
one you fix.

## Done

Failing test first. `state.yaml` ticked in the same commit. §5 and §6 of the register
annotated finding by finding. Merged after prompt 3, then staging, **and confirm the staging
bundle contains `onboarding.stepOf` and `onboarding-wizard-back`** — the exact check that
caught production running an unrecorded build.
