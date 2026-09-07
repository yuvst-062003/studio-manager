# Implement the parent onboarding wizard redesign

Repo: `/Users/yuvalstolin/Desktop/studio-manager`. Read `CLAUDE.md` first — no inlined
strings, every Hebrew string lives in `web/packages/i18n/he/<namespace>.ts` and is
mirrored in `en/` and `ru/`; Python tooling is in `.venv`, always use the `.venv/bin/`
prefix; `docs/plan/state.yaml` gets ticked in the same commit as the work it completes,
never for anything measurable.

Lane verticals: **`people`** and **`health`**. Gates: `./scripts/lane-check.sh people`
and `./scripts/lane-check.sh health`.

## Read this first, in full, before touching anything

**`docs/superpowers/specs/2026-09-02-parent-onboarding-wizard-redesign.md`** is the
design — every decision in this prompt was made there, across a long conversation, and
the file is the durable record of it. Do not re-derive or re-litigate any of it; if
something in the spec seems wrong once you're reading the actual code, say so and stop
rather than silently deviating.

**Read the spec's "Corrections found before implementation (2026-09-03)" section and its
"Step 4 addendum (2026-09-03)" section especially carefully** — both were added the day
after the rest of the spec, from a separate conversation that started implementing this
prompt and found real gaps. The addendum in particular changes Step 4's scope: payment now
needs to happen inside an in-app overlay (an iframe), not a redirect out of the app, because
the redirect was silently losing every card-paying family's health declarations (Step 3's
deferred-submission design never got to fire). This was tested live and confirmed to work —
read the addendum for what is proven and what still needs building.

Also worth having open: `docs/onboarding-link-spec.md` (§5.4b, the original feature spec)
and `docs/superpowers/specs/2026-09-02-completion-findings-register.md` §5–§6 (the
original bug findings — two of its claims are already disproven in the redesign spec's
"Findings disproven" section; trust the redesign spec over the register where they
disagree, but the register's other findings still apply).

## Git is not a reliable record here — verify before trusting anything

`web/apps/parent/src/features/onboarding/JoinFamilyStep.tsx`, `JoinHealthStep.tsx`,
`OnboardingWizardChrome.tsx`, `WizardNavButtons.tsx`, and `JoinFlow.test.tsx` are **not
tracked by git** — only `JoinFlow.tsx` is (confirmed via `git ls-files`). A large part of
the wizard's current implementation exists only in the uncommitted working tree. Do not
assume `git diff`/`git log` on this directory tells you what's actually running or what
changed. Check the working tree directly, and consider getting this baseline committed
before doing substantial further work on top of it — a lot is one `git clean`/reset away
from being lost.

Concurrent sessions commit to this repo mid-work on unrelated lanes (billing, comms, and
others were mid-edit during the spec-writing conversation). Stage by explicit path when
committing anything — never `git add -A`.

## What's already applied vs. still pending

The redesign spec's "Bug fixes bundled into this pass" table is the authoritative list.
Highlights, so you don't redo or skip anything:

- **Already applied** (verify still present, another session may have touched these
  files): the `stepPosition()` single-source-of-truth helper in
  `OnboardingWizardChrome.tsx`; the inert payment-step back button removed in
  `JoinFlow.tsx`; the duplicate back button removed in `JoinHealthStep.tsx`; the
  `ConsentGate` blank-page fix in `App.tsx` (`join` is no longer gated on
  `consentReviewed`); the backend fix in `app/services/people/onboarding.py` that lets
  `_apply_family_details` run for duplicate-matched children, not just freshly-created
  ones.
- **Needs a correction before it's safe** — do this before anything else touches that
  file. Worked example of the actual risk, not a hypothetical:

  The original bug: a parent submits step 3, something goes wrong (back button, network
  hiccup), and they resubmit the same form. Their kids already exist from the first
  attempt, so the server correctly reports each one as a duplicate
  (`DuplicateStudentError`) — but the old code skipped writing the parent's household
  details entirely whenever *every* child in the resubmission was a duplicate (the write
  only ran `if created_pairs`, i.e. only when something was freshly created), so the
  family's registration never completed. The fix: when a child comes back as a duplicate,
  use the existing student's id (the error already carries it) and write the household
  details onto that student anyway, instead of skipping.

  The problem: how does the server decide "this child already exists"? `duplicate_student()`
  (`app/services/people/matching.py:174`) searches for a matching name (and birthdate, if
  given) **anywhere in the whole studio** — it has no concept of "this parent's own kids."
  So picture two *unrelated* families in the same club who both happen to have a child
  named "Yossi Cohen" — not a rare coincidence over a studio's lifetime. Family A submits
  the wizard listing their own Yossi. The server searches the studio, finds *Family B's*
  Yossi — a real name match — and reports "duplicate." Correct duplicate detection. But
  the fix above then writes Family A's address, phone, other-parent, and pickup-contact
  details onto that match — except "that match" is Family B's actual child, a family
  Family A has never met. Family B's real registration silently gets overwritten with a
  stranger's data. This isn't a malicious-input edge case; it just requires two families
  sharing a name, which will eventually happen in any studio with enough families.

  The fix for the fix: before writing anything, check the matched student is **already
  guarded by this same parent** — i.e. this really is the same family resubmitting (the
  original bug's actual scenario), not a coincidental name match with a stranger's kid
  (`select(Guardian).where(Guardian.student_id == ..., Guardian.person_id == parent.id)`
  — the same query `_apply_family_details` already runs later in that function). If the
  match isn't this parent's own kid, leave it untouched — same as today's current, safe
  (if unhelpful) behavior of just skipping it. Write the failing test for the cross-family
  case first: two `Person` rows in the same studio each with a guarded `Student` named
  identically, a third parent submitting a same-named child, and an assertion that
  `_apply_family_details` never touches the other family's student.
- **Not yet applied**: the invisible-validation bug (`JoinFamilyStep`'s forward button is
  `disabled` while invalid, so `submit()` and its error display never run — make it
  always clickable, matching `ClubTermsStep`'s already-correct pattern); the discarded
  `{code, field}` on a national-id error in `JoinFlow.tsx`'s `submitFamily` catch-all.
- **Found 2026-09-03, not yet applied**: the spec's "Corrections found before
  implementation" section — the club card's "two links" claim doesn't match
  `ClubTermsStep.tsx` (build what the component actually does: inline clauses, no links),
  and the per-minor "same as / different" parent-info toggle has no backend field to write
  to (build one shared parent-info section for every minor, matching today's actual
  behavior, and drop the toggle). And the spec's "Step 4 addendum" — Step 4 now includes
  building an in-app payment overlay (uPay's checkout loads in an iframe on the same
  screen instead of a redirect out of the app), because the redirect silently lost every
  card-paying family's health declarations. Read both additions in full before starting
  Step 1 or Step 4.
- **Superseded, not fixed directly**: the phantom-blank-child bug and the step-3→2
  data-loss bug are both resolved by the flat-list rebuild in the spec's Step 2 section,
  not by a standalone patch — don't fix them separately, build the new component.

## The work, in the order the spec presents it

1. **Step renumbering** — 4 steps (Welcome+Agreements, Family, Health, Payment), update
   `ONBOARDING_WIZARD_STEPS`/`stepPosition()` accordingly.
2. **Step 1** — combined welcome + agreements screen, composed from `ConsentGate`'s and
   `ClubTermsStep`'s existing document-rendering pieces, built local to the join wizard.
   Do **not** change `ConsentGate.tsx` itself — it's also used at `App.tsx`'s regular
   first-run gate, which must not change shape.
3. **Step 2** — the flat-list family rebuild (empty-by-default subject list, 18+ toggle
   per row, shared-vs-"same as" parent info among minors, plan picker per row with
   mismatch display). The plan picker's billing-vertical half (plan-list endpoint,
   `register()` accepting `price_plan_id`) is a dependency to raise with whoever owns
   billing, not to build unilaterally inside `people`/`health`.
4. **Step 3** — the 2-inner-step health redesign, the shared review popup, `special_notes`
   surfaced in it, the 4 now-required detail fields (flag the migration for `main`), and
   the deferred-submission model (health data lives in the sessionStorage draft through
   the whole rest of the wizard; nothing calls the submit endpoint until the parent
   presses "enter the app" on the done screen).
5. **Step 4** — the richer done-state (every child, every method, identical visual
   weight), the plan re-editing note for the billing vertical, and the point where the
   deferred health flush actually fires. **Per the spec's 2026-09-03 addendum, this step
   now also includes building the in-app payment overlay**: uPay's checkout renders inside
   an iframe on the same screen instead of navigating the tab away, and the card-pay
   button, the standing-order links, and `PaymentCompleteScreen`'s completion detection all
   need building or changing for it — see the addendum for exactly what's proven (embedding
   works, tested live) versus what still needs designing (the `postMessage` completion
   signal). This supersedes the older boundary that treated `PaymentSetup.tsx` as
   untouchable; the addendum explains exactly which pieces of it change and why.
6. **Draft persistence** — `sessionStorage` per token, covering both family and (per the
   deferred model) health data, cleared only after the final flush succeeds.

## What this lane does not touch

Same boundaries as the original prompt, still in force: the other three entrances
(landing/trial booking, `#/join`, `#/add-child`), `RegistrationStep.tsx`/`AgreementFlow.tsx`
(confirmed `/join/<token>` never renders it), and any schema change beyond what's flagged
for `main` above.

**`PaymentSetup.tsx`, `PaymentsSection.tsx`/`submitUpayForm`, and
`PaymentCompleteScreen.tsx`/`PaymentCompleteSection.tsx` are now in scope, narrowly** — the
2026-09-03 addendum overrides the original "different lane's file" boundary for exactly the
in-app payment overlay and its completion detection, and for nothing else in those files.
Build the overlay as one reusable piece both the join wizard and the ordinary parent
payments screen use, since `submitUpayForm` is already shared between them. Do not touch
anything else in those files (method selection, the summary screen's layout, promise
creation for cash/cheque/standing-order) beyond wiring the card button and the
standing-order links through the new overlay instead of a full-page navigation.

## Workflow

Follow the `fix` skill's discipline per bug (reproduce with a failing test first, name
the cause, hold scope, gate scoped to the blast radius) for the bug-fix items, and
standard TDD for the new components. Write the failing/first test before the
implementation in both cases.

## Verification

```bash
.venv/bin/pytest -q tests/people tests/health
cd web && npx vitest run apps/parent/src/features/onboarding apps/parent/src/features/health apps/parent/src/features/privacy apps/parent/src/features/billing --reporter=dot
./scripts/lane-check.sh people && ./scripts/lane-check.sh health
npm run typecheck && .venv/bin/mypy app
```

**Walk the whole wizard as a parent, twice** — once with one child, once with two, from
`/join/<token>` to the payment done screen, pressing back at every step, and closing the
tab mid-health-queue to confirm the draft survives a same-tab return. This is not
optional: the deferred-submission model in particular has not been exercised by a human
yet, only reasoned through.

**Testing the in-app payment overlay: never complete a real card payment to test it.**
Confirming the overlay renders uPay's real checkout page is safe (as already done,
2026-09-03). Confirming the `postMessage` completion signal actually fires needs the iframe
to reach `returnurl` — do that by navigating the iframe there directly (or by whatever the
implementation's own test harness does) rather than typing a real card number into a live
merchant account. If a real end-to-end payment test is ever wanted, that is a deliberate
decision to spend real money and needs the user's explicit go-ahead first, not something to
do as a matter of course while verifying this piece.

## Done

Failing tests first. `docs/plan/state.yaml` ticked only if this completes a piece it
tracks — a redesign of this size is not automatically one. The findings register (§5–§6)
annotated with the two corrections the redesign spec already found, plus any new ones you
find. Gates green. The manual walkthrough above actually performed, not assumed.
