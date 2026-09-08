# Trial booking redesign — Door A on one page

**Date:** 2026-09-08
**Scope:** the public website's trial booking (Door A). The parent app, the join wizard
and Doors B/C/D are untouched.
**Status:** design approved by the owner 2026-09-08; awaiting spec review before planning.

---

## 1. The problem

Pressing "book a trial" on the club's website costs three screens.

1. **Agreements.** Three document cards and one tick. It asks nothing about the family,
   and its Continue button stays disabled until `GET /privacy/consents` returns — so the
   very first tap of the club's main call to action can sit there doing nothing visible.
2. **Contact, then trainees.** Four contact fields, then a panel per child, inside a
   dialog roughly the width of a phone — on a page most visitors open in a desktop
   browser.
3. **Health declaration.** A separate screen with a popup and a signature pad per child.

Two things are wrong beyond the length.

**The booking is written last.** `submitBooking` fires from `handleHealthSigned`
(`BookingFlow.tsx`), so a parent who fills in everything and then abandons at the
signature pad leaves **nothing** — no name, no email, no lead the club could ring. The
step most likely to be abandoned is also the one standing in front of the write.

**It is a phone design shown on a desktop.** The landing page moved to
`gladiatorclub.co.il`, where most first visits happen on a wide screen, and the booking
opens as a narrow modal over it.

## 2. What replaces it

**One page.** Not a dialog. For one child it is seven fields, one health press, one tick
and one button, all visible without scrolling on a desktop.

| Block | Fields |
| --- | --- |
| Trainee | first name · surname · birthdate |
| | group (chips, age-filtered) · lesson time (chips, for that group) |
| Parent — *only when the trainee is a minor* | name · phone · email |
| Health | **הכל תקין** ⟷ **יש מה לדווח** (thirteen questions appear only on the second) |
| Consent | one tick naming all three documents · link to `/legal` in a new tab |
| | **קביעת שיעור הניסיון** |

A second child is a second card with the trainee fields only; the parent block carries
over from the first, shown as a green line with a link to change it.

### Behaviour that carries the design

- **The birthdate decides the shape of the form.** Under 18 renders the parent block,
  introduced by a band that says why. 18 and over renders neither — the trainee's own
  phone and email take its place, and there is no "who is this for?" question, because
  the birthdate already answered it. `isMinor()` in the wizard's `types.ts` is the rule,
  and an unknown birthdate counts as a minor, which is the safe direction.
- **Groups are filtered per trainee, and never hidden.** A group that does not fit shows
  disabled with the reason on the chip (`לא מתאים לגיל 9`). A parent who cannot see a
  group cannot tell whether it exists. This is `groupFitsAge`, unchanged.
- **Slots belong to the group chosen directly above them**, fetched per group and shared
  between two children who picked the same one.
- **The consent link is its own row, never inside the checkbox label.** Tapping a label
  must toggle the box, not navigate. It opens `/legal` in a new tab, so a filled form
  survives being read.
- **Nothing on the page waits on the network to become usable.** The consent read that
  gated the deleted screen is gone; groups and slots arrive with the landing payload the
  page already loaded.

### The health declaration stays, and loses its signature

Keeping it is the owner's call and the right one: `PartHealth` already offers a
**הכל תקין** preset that answers all thirteen questions in one press, so only a parent
with something to declare ever sees the questions. That is cheap enough to belong on this
page rather than a screen of its own — and putting it under the same button removes the
gap that loses leads today.

**No signature pad on this form.** A trial writes `health_status = 'trial_signed'`, whose
own comment in `app/services/people/trials.py` says it "records that it is not the full
one. Converting requires the full form." The drawn signature stays exactly where it
matters — the join wizard's full declaration at conversion, unchanged. Here the press is
recorded with the parent's name and the date, both already on the form.

**Settled by the owner, 2026-09-08: no signature on the landing page.** The insurance
question was put to the club and answered — a trial is declared, not signed. `SignaturePad`
is not imported by anything in this feature, and a test asserts the trial request carries
an empty `signature_image_base64`, so the pad cannot creep back in unnoticed. The drawn
signature remains required in the join wizard, where a family actually enrols.

## 3. The one write

Unchanged: `POST /trial-bookings/self`, one request carrying everything.

```text
guardian:                    from the parent block, or the adult trainee's own fields
                             (omitted entirely when the caller is signed in)
children[]:                  first_name, last_name, birthdate, group_id, session_id
trial_health_declarations[]: one per child, same order
                             { template_id, answers, signature_image_base64: "",
                               declared_by, declared_at }
agreements_accepted:         the tick
```

Three notes on the shape:

- **`signature_image_base64: ""` is already an accepted value** — `BookingFlow` sends
  `draft.signatureBase64 ?? ''` today, and `_store_trial_declarations` parks the entry
  unvalidated in `registration_request.payload_encrypted`.
- **`declared_by` / `declared_at` are new keys in that same unvalidated blob, and adding
  them is safe.** Checked 2026-09-08: `RegistrationService.detail` reads only
  `payload["children"]`, `payload["guardian"]` and `payload["preferred_group_id"]`, and
  `RegistrationRequestDetailOut` projects no declarations at all. Nothing in the API or
  the dashboard reads a declaration entry, so a new key inside one cannot break a screen
  a manager sees. Recording who declared and when is worth having regardless — without a
  signature it is the only trace of the act.
- **One contact per booking.** `TrialGuardianIn` is a single guardian and
  `book_for_self` resolves one `parent` Person, ignoring any per-child guardian. Two
  children given genuinely different parents therefore record the first as the contact.
  Accepted: rare on a trial, and fixing it properly means changing the endpoint.

**A signed-in caller is asked for nothing about themselves.** The server ignores a typed
guardian in favour of the verified address regardless; the form must not ask either. A
member arriving from the join wizard's "רוצים שהילד/ה ינסה קודם?" link sees only the
child's fields.

## 4. Components

**New,** in `web/apps/parent/src/features/landing/`:

| File | Job |
| --- | --- |
| `TrialBookingPage.tsx` | The page: header, hero, trainee cards, add button, consent, submit. Owns the draft state and the single write. |
| `TrialTraineeCard.tsx` | One trainee: fields, group and slot pickers, the minor-triggered parent block, the health block. |
| `TrialHealthBlock.tsx` | The two preset buttons; renders the template's questions inline when `יש מה לדווח` is pressed. Reads the public template endpoint. |
| `TrialAside.tsx` | The desktop side column — what happens next, where the club is, WhatsApp. Stacks under the form on a phone. |
| `LegalPage.tsx` | The new public documents page. |

**Deleted**, once nothing calls them:

- `features/onboarding/JoinWelcomeStep.tsx` (+ test) — `BookingFlow` is its only caller.
- `features/landing/BookingDialog.tsx` — there is no dialog any more.
- `features/landing/BookingFlow.tsx` (+ test) — replaced by `TrialBookingPage`.
- `features/onboarding/JoinHealthStep.tsx` (+ test) — `BookingFlow` is its only caller.
  Confirm with a grep before removing; `healthClient.ts` and `healthDraft.ts` mention it
  in comments only.

**Untouched:** `OnboardingWizardChrome` (still used by `ConsentGate` and
`JoinFamilyStep`), `SignaturePad`, the join wizard and all its parts, every other door.
`JoinFamilyStep` appears to be dead already — note it, do not remove it here.

**Styling** follows the join wizard: the `tw-scope` Tailwind classes and the club palette
(`#001849`, `#0056c5`, `#faf8ff`, `#e9edff`), not the design-system primitives. That is
what "the same style as the parent app's wizard" means, and mixing an `@studio/ui` panel
into a Tailwind port is the mistake `features/shell/loadFailed.ts` already records.

## 5. Routing

Two new views, on both hosts, keyed the way `landingSlugFor` already keys the landing
page itself:

| Host | Landing | Booking | Legal |
| --- | --- | --- | --- |
| `gladiatorclub.co.il` (a configured landing host) | `/` | `/trial` | `/legal` |
| any host | `/t/<slug>` | `/t/<slug>/trial` | `/t/<slug>/legal` |

`matchLandingPath`'s regex (`^\/t\/([a-z0-9-]{1,80})\/?$`) grows an optional
`(trial|legal)` segment and returns a view alongside the slug; `landingSlugFor` does the
same for a landing host's root. Both keep their current narrow character class — the slug
is interpolated into an API path.

Real paths rather than hashes: these are links a club puts in an ad and a footer, and
`route.ts` already argues the case for the landing page itself. `navigateFallback:
'index.html'` in the PWA config already resolves deep links.

Pressing "book a trial" anywhere on the landing page navigates to the booking view; the
browser back button returns to the landing page.

## 6. The legal page

There is no public page for these documents today — the text exists but only inside popups
behind a sign-in, which is the wrong way round for documents a stranger should be able to
read before committing.

### One source of truth: the parent app's

**Owner's instruction, 2026-09-08: the join wizard's documents are the correct ones.**
Everything this change renders — the consent tick's wording, the `/legal` page, and the
booking form — reads `legalDocs()` from
`features/onboarding/wizard/copy.ts` (`people.joinWizard.legal.*`) and nothing else.

That is a real correction, because the repo currently holds **three** sets of legal text
and the trial door is on the wrong two:

| Source | Content | Rendered by |
| --- | --- | --- |
| `legalDocs()` → `people.joinWizard.legal.*` | terms (8 sections) · privacy (12 sections) · payments (3 paragraphs) | the join wizard's `Step1Agreements` — **canonical** |
| `PolicyDocument` → `reports.privacy.*` | terms + privacy, **versioned** | `JoinWelcomeStep` (Door A), `ConsentGate`, `PrivacyScreen`, `StaffConsentGate`, staff `LegalScreen` |
| `PAYMENT_CLAUSE_KEYS` → `health.clubTerms.payment.*` | 4 payment clauses | `JoinWelcomeStep` (Door A), `ClubTermsStep` |

So a stranger booking a trial today is shown different terms from a family joining the
club. Deleting `JoinWelcomeStep` and reading `legalDocs()` closes that for Door A.

Four sections on the page: the three documents plus `faqItems()`, which currently no
stranger can reach. A contents rail beside the text on desktop; collapsible cards on a
phone. Linked from the consent tick and from the site footer.

**Content check before it ships:** read all four as a stranger would. Anything that reads
like an internal note gets flagged to the owner rather than published.

> **Reported, not fixed here.** Five other screens still render the older sources, so if
> the join wizard's text is right, those five are showing outdated text. It is not a
> straight copy job: `PolicyDocument` is tied to `policy_version` and the consent ledger,
> while `legalDocs()` is unversioned static text — consolidating means deciding what the
> ledger records a family agreed to. That is its own change and its own decision.

## 7. Copy and accessibility

- Every string goes through `web/packages/i18n`, in `he/people.ts` under `people.trial.*`,
  mirrored in `en/` and `ru/`. Nothing inlined. `people.joinWizard.legal.*` is reused for
  the documents rather than duplicated.
- Logical CSS properties only; the page is RTL.
- Every input has a real `<label>`; errors link by `aria-describedby`; the group and slot
  pickers are radio groups with a legend, not clickable divs; the two health presets are
  buttons with `aria-pressed`; visible focus everywhere; 4.5:1 minimum.
- The band that appears when a birthdate makes a trainee a minor is announced, not just
  drawn — a form that grows a section should say why in words as well as layout.

## 8. Testing

Scoped to what the change reaches: the landing feature's tests, the route tests, and the
trial booking service tests if the payload keys change.

- **The seam, not the components.** One test drives the form — type a child, pick a group
  and a slot, press `הכל תקין`, tick the box, submit — and asserts the **request body**:
  guardian, one child with the right `group_id` and `session_id`, one declaration with the
  real answers and an empty `signature_image_base64`, `agreements_accepted: true`. A field
  silently dropped between the form and the request is exactly what a props-level test
  would miss.
- A minor renders the parent block; an 18+ birthdate does not, and sends the trainee's own
  contact details as the guardian.
- A second child inherits the first's parent details, and can override them.
- A signed-in caller is asked nothing about themselves, and no `guardian` key is sent.
- Age-unfit groups render disabled with a reason, and cannot be selected.
- `יש מה לדווח` reveals the questions; `הכל תקין` sends every answer without showing them.
- Submit failures — rate limited, already used, schedule unavailable — render on the page
  with a retry, never a dead end.
- Route tests: `/trial` and `/legal` resolve on a landing host and under `/t/<slug>`, and
  an unconfigured host still resolves nothing at its root.

## 9. Out of scope

- The parent app's `#/add-child` and the full join wizard.
- The endpoint's one-guardian-per-booking shape.
- A public "sign your declaration later" endpoint — unnecessary now that the declaration
  is collected in the form.
- Redirecting `app.gladiatorclub.co.il/t/<slug>` to `www.`. Both stay live; `/t/<slug>` is
  matched first on every host on purpose, so a printed QR always resolves to its club.
- The landing page's own marketing sections, other than the call-to-action targets.
