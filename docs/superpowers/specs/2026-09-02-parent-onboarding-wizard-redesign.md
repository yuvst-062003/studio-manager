# Parent onboarding wizard — redesign spec

> Drafted 2026-09-02, for `docs/plan/prompts/fix-onboarding-wizard.md` (lane verticals:
> `people`, `health`). Scope: `/join/<token>` only — the shared member onboarding link.
> Landing/trial booking, `#/join` and `#/add-child` (§6.6 of the completion findings
> register) belong to a different lane and are untouched here.

## Why this exists

The original prompt scoped this lane to fixing concrete bugs in the existing 5-step
wizard (back button, invisible validation, dead ends, no draft, length). Investigating
those bugs against the actual code — not just the findings register, two of whose claims
turned out to be stale (see "Findings disproven" below) — surfaced a deeper problem: the
screen's own data model assumes every signer is a parent and every subject is their
child. That assumption breaks the moment the signer is a lone adult training member, and
fixing it well means restructuring how step 3 asks its questions, not just patching the
bug that exposed it. This spec covers that restructuring plus the original bug list.

## Findings disproven (register corrections)

The completion findings register (`docs/superpowers/specs/2026-09-02-completion-findings-register.md`
§6.1) claims "only 8 of the 13 health questions are enforced, and the parent can't tell
which 5 are optional." Reading the actual template schema (`alembic/versions/0018_the_clubs_own_registration_agreement.py`,
`_FULL_TEMPLATE_SCHEMA_V2`, and its frozen predecessor in `0007`) shows this is wrong: all
13 boolean yes/no questions are required by default (`required` key absent = required).
The 7 fields that actually carry `"required": False` are all free-text elaboration/notes
fields (4 conditional "details" boxes that only appear after a "yes," plus `health_fund`,
`restrictions`, `special_notes`, which are always-visible open notes with no natural
trigger). §6.8's "ConsentGate stands aside on a failed read but the caller still renders a
blank page" is also imprecise: `ConsentGate`'s own internal logic already renders
`children` correctly on `state === null` (a failed read) — the actual bug is one level up,
in `App.tsx`, where the `children` prop passed into the gate was itself precomputed as
`null` whenever `consentReviewed` hadn't been flipped true by a completed submit, so a
failed read had nothing to stand aside *over*. Both corrections are folded into the fixes
below; annotate the register with them per the prompt's "Done" checklist.

## Corrections found before implementation (2026-09-03)

Two more mismatches between this spec's prose and the actual code, found while starting
implementation. Both are small compared to the Step 4 addendum below, but a fresh session
should not have to re-derive either.

**The club card's "two links" claim, in Step 2 below, does not match `ClubTermsStep.tsx`.**
The step 2 section says the club card is "already exactly this shape today
(`ClubTermsStep.tsx`): one checkbox, two links." Reading the actual component: it has one
checkbox and the three payment clauses printed inline, always visible — there are no links,
and there is no separate תקנון (regulations) document anywhere in the product to link to;
`PolicyDocument` (the thing the "two links" phrasing was likely echoing from `ConsentGate`)
only ever renders the app's own terms/privacy, never club regulations. Build the composed
Step 1 club card matching what `ClubTermsStep` actually does — inline clauses, one checkbox,
no links — rather than inventing "read the full תקנון" content that has nothing behind it.
The App card's own two links (to the app's real terms and privacy documents, reusing
`PolicyDocument`) are real and unaffected by this correction.

**The per-minor "same as / different" parent-info toggle, in Step 2 below, has no backend
to write to.** `OnboardingRegisterIn` carries exactly one `other_parent` and one
`pickup_contacts` list for the **entire submission** — `_apply_family_details` applies that
same single pair to every minor child in the batch, and there is no per-child field anywhere
in the wire contract. This spec's own "wire format unchanged" rule (stated later in Step 2)
forecloses adding one without a schema/service change, which is main-owned territory this
lane does not have standing to make. Build Step 2 with **one shared parent-info section**
covering every minor row — the same behaviour `JoinFamilyStep.tsx` already has today — and
drop the "same as [earlier child]" / "different" toggle entirely. If the club genuinely needs
per-child divergence later, flag it as a cross-vertical request the same way the plan
picker's billing dependency is flagged below, rather than building a control with nowhere to
send its answer.

## Step structure — 4 steps, renumbered

| # | Name | Replaces |
|---|---|---|
| 1 | Welcome + Agreements | today's bare sign-in screen, plus today's separate consent (step 1) and club-terms (step 2) steps |
| 2 | Family | today's step 3 |
| 3 | Health | today's step 4, unchanged pipeline |
| 4 | Payment | today's step 5, richer done-state |

`ONBOARDING_WIZARD_STEPS` in `OnboardingWizardChrome.tsx` and the `stepPosition()` helper
(added this session) need their step list updated from 5 entries to these 4 — every
caller already goes through `stepPosition(key)` rather than a hardcoded number, so this is
a single-file change once the new step components exist.

### Step 1 — Welcome + Agreements

**Inner sequence** (two panels under one step number, not two separate steps):
1. Welcome panel — studio name/logo, one line of context copy, an emoji or small
   animation, sign-in buttons if not yet authenticated.
2. Agreements panel — the two cards below. Shown immediately after sign-in, still
   counted as step 1.

One screen, no sign-in-then-separate-legal-steps split:

- Studio name, a short welcome line, and a small emoji or lightweight animation — replaces
  the bare "sign in" screen with something warmer before the legal content.
- Sign-in (Google/Apple) if not already signed in.
- Two cards, each with its own single checkbox and its own two "read the full document"
  links:
  - **App card** — terms of use + privacy policy. Today these render as two separate
    checkboxes in `ConsentGate.tsx` (`accepted.terms`, `accepted.privacy`); this collapses
    them to one checkbox, matching the club card's existing shape. **This consent is a
    hard legal gate, not optional chrome** — the privacy policy is what permits the club
    to hold a minor's personal/medical data at all (`ConsentGate.tsx`'s own comment: "the
    privacy policy is what says the club may collect a medical record about a child at
    all"), and it is versioned — a republished policy re-opens this gate for every family
    on their next login, which a settings-page-only presentation cannot force. It is not
    being removed or weakened, only visually combined into one checkbox.
  - **Club card** — regulations + payment terms. Already exactly this shape today
    (`ClubTermsStep.tsx`): one checkbox, two links ("קריאת התקנון", "קריאת תנאי התשלום").
- Continue once both cards are checked. Submitting records **both** consent grants (the
  app-level `client.grant(...)` and the club-level `healthClient.acceptClubTerms(...)`),
  from one combined action.
- **Build this as a screen local to the join wizard**, composing the existing
  document-rendering pieces from `ConsentGate` and `ClubTermsStep` rather than changing
  `ConsentGate.tsx` itself. `ConsentGate` is also used at `App.tsx:681` for the regular
  app's own first-run gate, which never shows club terms and should not change shape as a
  side effect of this redesign. Confirmed via `grep` that `ClubTermsStep` has no other
  caller, so this composition is safe.

### Step 2 — Family (the flat-list redesign)

**Inner sequence:** one screen, no sub-steps — your details → the subject list (empty by
default) → per-row 18+ toggle with conditional parent/pickup → one "continue" that submits
everyone in the one transaction described below.


Replaces the current "your details as a parent" card + "children" list structure in
`JoinFamilyStep.tsx`, which breaks the moment the signer trains but has no children (today
they still see a phantom blank child card, a "which parent are you" control, and a pickup
list that make no sense for them — see "Bug: phantom blank child" below).

**Structure:**

1. **Your details** — national id, address, city, phone, optional home phone/aliyah year.
   Name and email come from sign-in, not typed. This section always exists (someone has to
   administer the account) and **doubles as your own student row** if you tick "I train
   too" — it does not re-ask your name/id/address a second time in the list below.
2. **The subject list** — starts **empty** (not pre-seeded with a blank child, which is
   today's actual bug — see below). Two symmetric ways to add a row:
   - "I train too" — adds the signer as a subject (no new fields; reuses the details
     above; only asks which group).
   - "+ add a child" (or another person) — adds a row asking name, birthdate, and groups.
3. **Per-row age check** — each non-signer row carries an explicit **"18 or older?"**
   yes/no control (a direct question, not silent birthdate math — decided after
   discussion, since it works even before/without a birthdate and avoids date-math edge
   cases). "Yes" hides that row's parent-details and pickup sections entirely — an adult
   doesn't need pickup authorization or a parent-of-record. "No" shows them.
4. **Shared parent info among minors** — when more than one row answers "no" (a minor),
   their parent-details/pickup sections default to being shared (today's model: one
   section covers every minor in the submission), with a "same as [earlier child]" /
   "different" toggle per row so a mixed-custody submission can diverge. Default to
   shared; only show the toggle once a second minor row exists.
5. **Plan picker per row.** Alongside the group picker, each row also gets a plan
   picker — defaulting to whatever `plan_for_volume` would auto-derive from the groups
   just chosen (e.g. two-sessions-a-week groups → defaults to the twice-a-week plan), but
   changeable. This is a genuine reversal of §5.10's stated reasoning for this specific
   door ("this lane has no manager in it, so the suggestion becomes the assignment") —
   raised and decided explicitly in this conversation, not something disproven or found
   in error the way the register's findings were. Since there is still no manager present
   to catch a parent picking a plan that doesn't match their actual group selection, show
   the derived volume next to the picker so a mismatch is visible (e.g. "Groups chosen:
   twice a week · Plan selected: once a week") rather than blocking on it — the same
   visible-but-not-blocking pattern the manager's own version of this decision already
   uses (`app/models/billing.py:91`'s `PricePlan` docstring: "the app shows the volume
   derived from the child's enrollments beside the picker so a mismatch is visible at the
   moment the price is set"). Re-editable again in step 4 (see below) — same picker,
   same mismatch display, same default-from-groups on first render.
6. Require **at least one subject** in the list before the forward button is usable.

**Cross-vertical dependency — flag, don't silently build.** Two things this needs are
billing-vertical territory, not people/health:
- A read endpoint listing a studio's available `PricePlan`s (name, `sessions_per_week`,
  price), for the picker's options. Nothing today exposes this to a parent-facing screen.
- `OnboardingService.register()`/`add_child()` (`app/services/people/onboarding.py`)
  currently always derives the plan via `plan_for_volume` internally and never accepts an
  explicit choice from the caller — this needs to accept an optional `price_plan_id` per
  child and use it instead of the derived one when present, falling back to today's
  auto-derivation when absent (so every other caller of this service is unaffected).
Per CLAUDE.md's schema/cross-vertical escalation rule, this is worth agreeing explicitly
with whichever lane owns billing rather than building it unilaterally inside `people`.

**The guardian/age question, resolved:** using the "18+?" answer to decide what this form
*asks* does not change who the backend *records* as guardian. `is_self_guarding()`
(`app/services/health/agreement.py:158`) defines self-guardianship as the guardian being
the literal same `Person` row as the student — true only when someone signs in and
registers themselves. A parent-submitted adult "child" row still gets the submitting
parent as guardian in the `guardian` table, which is factually correct (the registration
ran through the parent's account; the young adult never authenticated). This is not a gap
to close — becoming genuinely self-guarding would require the young adult to sign in
themselves and claim their own profile, a different feature this lane does not build.
Nothing downstream breaks either: `_apply_family_details` marks every row's registration
complete regardless of self-status, so an adult "child" row never gets funneled through
the separate `RegistrationStep`/`AgreementFlow` gate (used by other entrances) that would
otherwise ask them for a school grade again.

**Wire format unchanged.** `JoinFamilyPayload`'s shape (signer/other_parent/pickup_contacts/children)
and the `POST /api/v1/onboarding/<token>/register` request body do not need to change —
this is a client-side restructuring of what's asked and how it's grouped, not a new field
set. The "18+" answer only decides which UI sections render; it is not sent to the server
as new data (a `self`/non-self child's `grade`/`national_id` submission already behaves
correctly today for both cases).

### Step 3 — Health (restructured into 2 inner steps, deferred submission)

**Inner sequence, per subject in the queue — exactly 2 inner steps:**

1. **The opening question only.** "Healthy?" (יש אין מגבלות ידועות) vs "something to
   report" (יש משהו שצריך לדעת). Nothing else on this screen.
2. **Everything else, on one screen.** What renders inside it depends on the step-1
   answer:
   - **Healthy** → a collapsed card ("13 questions marked no") with an "open" (פתיחה)
     link.
   - **Something to report** → the full sectioned form (רקע רפואי / לב ומאמץ / אורתופדיה
     / נוסף), expanded, including the 4 now-required detail fields (see below).
   Below either version, unchanged: קופת חולים + טלפון חירום, the derived clause, and the
   signature pad. One "sign and continue to [next kid]" button ends this inner step and
   advances the queue.

**One shared review popup, seeded two ways.** Both the collapsed card's "open" link
*and* the "something to report" button route through the **same** popup component
listing all 13 questions — seeded all-"no" for the healthy path (a review/edit surface)
and blank for the "something to report" path. One component, not two parallel UIs to
keep in sync.

**`special_notes` surfaced in this popup**, prominently — decided in this conversation as
the answer to "a note for the manager": reuse the field that already exists
(`0018_the_clubs_own_registration_agreement.py`'s `special_notes`, always optional, no
positive-answer trigger) rather than building an active notification. A manager already
reads it whenever they open the full declaration (`AuditService`-logged per §11); this
just needs to be visible and clearly labeled inside the popup, not a new backend path.

**4 conditional detail fields become required once their trigger is "yes."**
`chronic_illness_details`, `allergy_details`, `medication_details`, `other_details` all
carry `"required": false` today despite being visible only when their boolean is answered
"yes" — a parent can say "yes, chronic illness" and submit with no elaboration. Flip
these 4 to required-when-visible. Leave `health_fund`, `restrictions`, `special_notes`
optional — they're always-visible open notes with no positive answer to elaborate on.
This requires a new migration (schema-owning territory — flag for `main` rather than
authoring it in this lane's own commits) or, if the template is editable at the row level
without a migration, a data update through whatever path `D11`'s "editable by the
manager" already uses.

**Submission is deferred to the very end of the whole wizard — not per kid, not even at
the end of the health queue.** This is a real change from today's model (`DeclarationForm.submit()`
calls `client.submit(studentId, ...)` immediately after each kid's signature) and is the
answer this conversation settled on for two things at once: making "go back and edit an
earlier kid" trivially safe (nothing exists server-side yet, so there's nothing to
overwrite — no append-only-record question the way consent has), and keeping nothing
half-registered visible anywhere until the family has genuinely finished.

- Every kid's answers **and signature** accumulate in the same local draft this wizard
  already keeps in `sessionStorage` (see "Draft persistence," extended to cover this).
  Going back to an earlier kid edits that local draft directly — freely, since it was
  never sent anywhere.
- Nothing calls the health submit endpoint while the queue is in progress, and **nothing
  calls it at the health→payment boundary either.** The family proceeds through payment
  (step 4) with health data still sitting only in the local draft.
- Only when the parent finishes payment and presses the final "enter the app" action does
  the app flush every kid's declaration — calling the existing per-student submit
  endpoint once per kid, back to back, right before the actual navigation into the app.
  This needs no new backend endpoint: it's N calls to what already exists
  (`client.submit(studentId, ...)`), just fired together at a later moment than today.
- **Why family registration itself does NOT defer the same way** (raised and ruled out in
  this conversation): payment (step 4) needs real `charge` rows to know what to show and
  actually collect — those are created by `OnboardingService.register()` at family
  submission time. Deferring family registration until after payment would mean charging
  a card (or generating a standing-order link, which needs a real `studentId`) against
  numbers with nothing in the database backing them — if the deferred save then failed
  for any reason (a duplicate-name collision, a national-id the server rejects, a group
  that filled up), the parent would have been charged with no registration, no charge
  record, and nothing for the club to reconcile against. Family registration stays
  immediate, exactly as today; only health — which involves no money and cannot strand a
  payment — defers.
- If the family abandons the wizard entirely before that final flush (closes the tab
  during payment, say), the health draft is lost with it, same as it would be lost today
  if they abandoned before signing — no worse than the current behavior, and the
  sessionStorage draft means a same-tab return still has everything typed.

No change to the signature-per-child model (each kid still signs their own, even though
the actual write is now batched) or the `_signed_against_current_questions` re-gating
logic.

### Step 4 — Payment (richer done-state)

**Inner sequence** (only the last part is this lane's to build — see ownership note):
1. Method picker — one method chosen, applied to every child by default; editable per
   child. *(`PaymentSetup.tsx`, a different lane.)*
2. Summary — one line per child (name, amount, method), **plan still editable here** (the
   same picker + derived-volume mismatch display from step 2, re-editable at this final
   review point — same cross-vertical dependency noted in step 2: `PaymentSetup.tsx`
   would need the plan-list endpoint and a way to change `student.price_plan_id` after
   registration, both billing-vertical work), grouped by how the route actually settles:
   - **card** children combine into ONE shared uPay checkout — money is held per payer,
     not per child, so the family enters their card once regardless of how many children
     are on card.
   - **cash / cheque** children combine into ONE promise per method — nothing is paid
     here; a manager marks it received later.
   - **standing order (הוראת קבע)** children each get their **own separate mandate
     link, always** — including two children at the identical price. A uPay standing-order
     link is fixed to one amount; reusing a single link across children would silently
     collect too little from the second child every month, with nothing catching it until
     reconciliation. This is already built correctly (`PaymentSetup.tsx`'s own header
     comment, an explicit owner decision, and `StandingOrderLink` being keyed per
     `studentId` for exactly this reason) — nothing here changes it.
   *(`PaymentSetup.tsx`, a different lane.)*
3. Pay now / confirm — card charges immediately through the one shared order; cash/cheque
   record a promise; each standing-order child's link is opened/completed separately.
   *(`PaymentSetup.tsx`, a different lane.)*
4. **Done state — this lane's to build.** Changes from a generic success message to the
   mockup's richer summary: every child listed with a checkmark, **identical visual weight
   regardless of method**. Card → paid. Cash/cheque → a concrete "named moment" (amount,
   who, when/where — e.g. "give ₪180 to the coach at the first practice, Sunday at
   17:00"). Standing order → per-child status, since it is not confirmable here
   (`billing.standingOrder.notConfirmable` already exists) — the manager marks it received
   once the mandate clears. No method renders as pending or lesser than another; all four
   are a completed decision, per the mockup's own framing. **This is also where the
   deferred health flush fires** — pressing "enter the app" from this screen is what
   submits every kid's held-in-draft health declaration (one call per kid, back to back)
   before the actual navigation happens. See step 3's "deferred submission" section for
   why this waits until here rather than firing per-kid or at the health→payment
   boundary.

**Ownership note:** steps 1–3 above live in `PaymentSetup.tsx`, owned by a different lane
(per the original prompt: "You own `JoinFlow.tsx`'s routing to and from payment; they own
what happens inside it"). This spec describes them for context only — nothing here directs
a change to that file, **except the addendum immediately below, which supersedes this note
for the card route specifically.**

### Step 4 addendum (2026-09-03) — payment happens inside the app, not a redirect out of it

Found while implementing, in a follow-up conversation the same day: the design above has a
hole. §5 "Payment" already says card payments hand off to uPay's hosted checkout by
navigating the whole tab away (`submitUpayForm`, a same-tab form POST), and `returnurl` is
hardcoded server-side (`app/services/billing/orders.py`) to `#/payment-complete/{ref}` — a
route in `App.tsx` entirely outside the join wizard's own state. So a family that pays by
card never reaches the "done state" described above and never presses "enter the app" —
which means the deferred health flush (Step 3's whole design) **never fires for them**.
Every kid's health declaration, held only in the sessionStorage draft, would be silently
lost the moment a family pays by card — probably the most common method. Cash, cheque and
standing-order families are unaffected, because none of those routes leave the tab.

**The fix is not a card-specific workaround.** The first idea considered — flush the draft
right before the card redirect fires, in `JoinFlow`'s own `onOrderOpened` wrapper, and accept
that card-paying families keep seeing today's plain `PaymentCompleteScreen` instead of the
new done-state — would have worked and stayed inside this lane's file boundary. It was
superseded once the actual alternative was tested and confirmed to work: **uPay's checkout
page can be embedded in an iframe.** Confirmed live, 2026-09-03, against the real production
endpoint (`https://app.upay.co.il/API6/clientsecure/redirectpage.php`) with the real merchant
account (`lavi.tamir10@gmail.com`) and a throwaway `paymentdetails`/tiny test amount, no real
payment submitted: neither the bare endpoint nor a fully populated, real checkout request
sends `X-Frame-Options` or a `Content-Security-Policy: frame-ancestors` header, and loading
that exact request inside a local test page's `<iframe>` rendered uPay's actual card-entry
form (card number, expiry, CVV, ת.ז., name, phone, the pay button, reCAPTCHA) with no blank
frame and no frame-busting escape out of the iframe.

**So build this instead:** an in-app payment overlay — a box that stays on the same screen —
that loads uPay's checkout inside an iframe rather than navigating the tab away. A family
paying by card never actually leaves the wizard, so the existing single "enter the app"
flush point (Step 3's design, unchanged) already covers every payment method with no special
case. This also means the richer done-state (point 4 above) can render for every family,
card included, exactly as originally envisioned — no narrowed scope needed after all.

**What is proven and what is still undesigned.** Only "does the checkout page render inside
an iframe" is confirmed. Completion detection is not yet built: the parent page cannot read
a cross-origin iframe's contents or URL while uPay's own pages are loaded (normal,
same-origin-policy behaviour, not a problem). But once payment finishes, uPay navigates the
iframe to `returnurl` — our own origin's `#/payment-complete/{ref}` — and at that moment the
iframe's content becomes same-origin with the parent again. That page should detect
`window.top !== window.self` and call `window.top.postMessage(...)` to tell the parent frame
"payment finished," so the overlay can close and the wizard can proceed to the flush + the
done screen. This mechanism needs building and testing; do not assume it works until it has
been exercised end-to-end with a real (or realistically simulated) completion.

**Scope consequence — this overrides the ownership note above, for this piece only.**
Building the overlay touches:
- `PaymentSetup.tsx` — the card-pay button's handoff, and the per-child standing-order links
  (`<a target="_blank">` today), which should route through the same overlay for the same
  reason rather than opening a new tab.
- `PaymentsSection.tsx` / `submitUpayForm` — shared with the **ordinary** in-app payments
  screen, not just onboarding. Build the overlay as one reusable piece both callers use,
  since the underlying redirect function is already shared code and the same "family never
  leaves the app" benefit applies outside the join wizard too.
- `PaymentCompleteScreen.tsx` / `PaymentCompleteSection.tsx` — needs the embedded-detection
  and `postMessage` behaviour described above.

Nothing else about those files' behaviour changes. This was raised and decided in a
follow-up conversation after the rest of this spec was written and reviewed — it is not
something the original conversation considered and rejected.

## Draft persistence

`sessionStorage`, keyed per token, cleared on successful completion. No server-side draft,
no `localStorage` — confirmed earlier in this conversation as the answer, given the form
holds children's national ids and health answers and a draft that outlives the browser tab
is a privacy decision, not just a convenience one.

**Extended to carry step 3's health data too**, per the deferred-submission design above:
every kid's answers and signature image live in this same draft from the moment they're
entered until the final flush on the done screen, not just steps 1–2's family data. This
is what makes going back to an earlier kid mid-queue free to edit — it's editing the
draft, not an already-written record. Cleared on successful completion (after the final
flush succeeds), same as the rest of the draft. Scope: steps 1–4 of this wizard's own
screens only (not payment's `PaymentSetup` internals, which belong to a different lane).

## Bug fixes bundled into this pass

These were found by reading the actual code (not assumed from the register) and are
either already applied to the working tree or pending as noted:

| Bug | Cause | Fix | Status |
|---|---|---|---|
| Rail position drift | `JOIN_STEP_POSITION` map only fed `terms`/`payment`; `JoinFamilyStep`/`JoinHealthStep` hardcoded `position={3}`/`{4}` independently | Single `stepPosition(key)` helper derived from `ONBOARDING_WIZARD_STEPS`, used everywhere | **Applied** |
| Payment step's back button is inert | `onBack={() => setStep('health')}` — but health's own effect immediately bounces back to payment once nothing is outstanding, so the button visibly does nothing | Removed `onBack` from the payment step | **Applied** |
| `JoinHealthStep` renders back twice | Chrome's own back button (`OnboardingWizardChrome`, always rendered when `onBack` is passed) plus a second explicit `<Button>` in `JoinHealthStep` itself | Removed the redundant explicit button | **Applied** |
| `ConsentGate` blank page on a failed read | `ConsentGate` itself stands aside correctly on `state === null`, but `App.tsx` computed its `children` prop (`join`) as `consentReviewed ? <JoinFlow/> : null` — and nothing flips `consentReviewed` true on a failed read, so the gate stood aside over a `null` | `join` is now always `<JoinFlow .../>`, unconditionally — `ConsentGate` is the sole authority on whether it renders | **Applied** |
| All-duplicate resubmission never completes registration | `_apply_family_details` only ran `if signer is not None and created_pairs` — `created_pairs` stayed empty when every child in the resubmission matched `DuplicateStudentError`, so `registration_complete` never got set and the health gate looped forever (§6.8's second dead end, same root cause as §6.3's step-4→3 trap) | Collect duplicates into the same list passed to `_apply_family_details`, using the existing student id `DuplicateStudentError` already carries | **Applied, but needs a correction — see below** |
| **Correction needed:** duplicate match is studio-wide, not family-scoped | `duplicate_student()` (`app/services/people/matching.py:174`) matches by name **anywhere in the studio** — it has no concept of "this parent's own family." As applied, the fix above would let Family A's resubmission overwrite Family B's same-named child's address/pickup/parent details if the names happen to collide, which is a real cross-family data-integrity bug, not a hypothetical one | Before adding a `DuplicateStudentError` match to the applied-pairs list, check that the matched student is **already guarded by this same parent** (`select(Guardian).where(Guardian.student_id == ..., Guardian.person_id == parent.id)` — the exact query `_apply_family_details` already runs later in the same function). Only then is it safe to assume "this is our own kid from an earlier attempt." If the match belongs to a different family, leave it untouched (today's existing, safe behavior: skip and continue) | **Not yet applied — do this before trusting the duplicate fix** |
| Forward button hides its own validation | `JoinFamilyStep`'s forward button is `disabled` while the form is invalid (`WizardNavButtons`), so `submit()` never runs, so `setShowErrors(true)` is unreachable — a parent missing a field sees a grey button and no reason why | Make the forward button always clickable; let `submit()` run, validate, and show inline errors — same pattern `ClubTermsStep` already uses correctly | **Not yet applied** |
| Server's `{code, field}` discarded on national-id error | `JoinFlow.tsx`'s `submitFamily` catch-all collapses every non-2xx response to `common.error.generic`, discarding the specific field/code the server sends for an invalid national id (`app/routers/onboarding.py:365-369`) | Parse the response body on failure and surface the field-specific message when present | **Not yet applied** |
| Step 3→2 back destroys 18 fields | `JoinFamilyStep` unmounts on back and remounts with fresh `useState` defaults | Superseded by the flat-list rebuild above (new empty-by-default state) — re-verify this is still true against the new component once built, since the underlying remount behavior doesn't change on its own | **Re-check after step 2 rebuild** |
| Phantom blank child forces parent/pickup fields on a solo adult | `children` state initializes to `[emptyChild()]`; ticking "I train too" only appends a self-row alongside it rather than replacing it, so `hasMinorChildren` stays true and the untouched blank child's required fields block submission | Superseded entirely by the flat-list rebuild (empty-by-default list, "add child" and "I train too" as two symmetric adds) | **Superseded — fixed by step 2 rebuild** |

## Out of scope (unchanged from the original prompt)

- Payment step internals (`PaymentSetup.tsx` and friends) — different lane owns them; this
  lane owns only the done-state summary screen and the routing to/from payment.
- The other three entrances (landing/trial booking, `#/join`, `#/add-child`) — different
  lane, per §6.6 of the completion findings register.
- `RegistrationStep.tsx`/`AgreementFlow.tsx` — the separate per-child registration gate
  used by those other entrances. `/join/<token>` never renders it (confirmed: its only
  caller is `AgreementFlow.tsx`, not `JoinHealthStep.tsx`), so nothing here touches it.
- Any schema change beyond what's flagged above (the health-template required-field
  migration) — owned by `main`, one revision per wave.
- The billing-side halves of the plan picker (a studio's plan list exposed to a
  parent-facing screen; `OnboardingService.register()` accepting an explicit
  `price_plan_id`; `PaymentSetup.tsx` gaining a plan-change control) — flagged in step 2
  and step 4 above as a dependency to agree with the billing vertical, not built here.

## Testing plan

- `JoinFlow.test.tsx` (exists) needs its step-3 interaction rewritten for the empty-by-default
  list (today it fills in the pre-seeded blank child directly; the new version needs an
  explicit "add a child" click first) and a new back-navigation assertion.
- New tests: the phantom-blank-child bug (regression, before the fix — TDD), the
  duplicate-resubmission backend fix (both the "same family" success case and the
  "different family, do not overwrite" guard), the `ConsentGate` failed-read case, the
  18+ toggle hiding/showing parent+pickup per row, the shared-vs-"same as" parent info
  across two minors, the plan picker's default-from-groups and mismatch display, the
  health step's 2-inner-step flow (opening question → collapsed-or-expanded second
  screen), the shared review popup seeded both ways, and — most load-bearing —
  **the deferred health submission**: going back and editing an earlier kid's answers
  before the final flush, closing the tab mid-queue (draft survives via sessionStorage,
  same-tab return), and confirming no `client.submit()` call happens until the final
  "enter the app" action, at which point every kid's declaration is submitted.
- `.venv/bin/pytest -q tests/people tests/health`, `npx vitest run apps/parent/src/features/onboarding apps/parent/src/features/health apps/parent/src/features/privacy --reporter=dot`, `./scripts/lane-check.sh people && ./scripts/lane-check.sh health`.
- Manual two-pass walkthrough (one child, two children) from `/join/<token>` to payment,
  pressing back at every step, per the original prompt's "Done" checklist.
