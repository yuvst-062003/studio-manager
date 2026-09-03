# §5.4b — Member onboarding link

> Drafted 2026-08-27 from a design discussion, written in SPEC.md's voice and numbered
> §5.4b so it can be merged after §5.4a. **Implemented**: `app/routers/onboarding.py`
> carries the five routes, and `web/apps/parent/src/features/onboarding/JoinFlow.tsx`
> is routed at `/join/<token>` — with `FirstRegistration` (12j) as its done state since
> the completion run. (An earlier header said "Nothing here is implemented"; it was
> written before the build and never revisited — corrected by P0, because a spec that
> mis-states its own status is worse than no spec.)
>
> **2026-09-02:** added "Inside each step" (the sub-screens within each of the five wizard
> steps, not previously written down) and, under Payment, the standing-order shared-link
> copy gap — a requirement, not yet implemented.

## Purpose and scope

A studio that already runs in the real world — students train, groups exist, WhatsApp
groups are full of parents — has to get dozens of families into the system. Today that
means the manager types every family by hand (§5.4a) or collects emails and sends
per-parent invitations (§5.3). Both are exactly the data-entry grind that kills adoption.

The **onboarding link** is one studio-level URL the manager posts into the club's
existing WhatsApp groups. A parent taps it, signs in, enters their own family, picks
their children's groups, and lands in the parent app with this month's charge waiting.
The parent does the data entry; the health gate does the paperwork; the manager's job
shrinks to setting discounts and merging the occasional duplicate.

**This lane is for existing club members only.** New families go through the trial
funnel (§5.4a) — the landing page remains the shop window, this link is the moving van.

### The invariant exception, stated plainly

§5.4 says **enrollment is always a manager decision**, and every other lane keeps it.
This lane is a deliberate, scoped exception: for a family that already trains at the
club, the enrollment decision was made months or years ago in the real world — the
database is catching up to reality, not making a decision. The invariant continues to
bind the trial funnel, the sibling flow (§5.4c) and everything else. A future lane that
wants to reuse this link for *new* members must not inherit the exception silently.

## The link

- **Studio-level, one live link at a time.** Not per group and not per class: families
  span groups, one child can be in two groups (§5.4), so the form needs a per-child
  group picker regardless — group-scoped links would multiply what the manager has to
  generate, post, and revoke while saving one tap. Generating a new link revokes the
  previous one.
- **Validity: 7 days** from generation (`expires_at`). The card shows a countdown;
  regeneration is one tap, so a start-of-season blast that stragglers miss costs the
  manager one repost.
- **Revocable immediately** (`revoked_at`) — the answer to a leaked link is a button,
  not a support ticket.
- **Token:** 256-bit random, appears once in the copy/share action. Only its SHA-256
  lands in the database (`token_hash`, same reasoning as `invitation.token_hash` and
  `refresh_token.token_hash` — a database read yields no usable link). Never logged.
- **Issued by `owner` or `manager`** (§3.2). Coaches see nothing.

### Where the button lives

A card in **both** the dashboard (people/students area) and the **staff app**:

```
┌─ קישור הצטרפות למועדון ────────────────────┐
│ פעיל · יפוג בעוד 5 ימים · 14 משפחות נרשמו   │
│ [ העתק ]  [ שיתוף ]  [ קישור חדש ]  [ בטל ] │
└─────────────────────────────────────────────┘
```

**שיתוף** opens the share sheet (WhatsApp is the point) with a prewritten message:

> הורים שלום! מהיום מנהלים הכל באפליקציה — רישום, נוכחות, הצהרת בריאות ותשלומים.
> הצטרפו כאן (הקישור בתוקף שבוע): {url}
> **הורה אחד נרשם לכל משפחה** — הורה נוסף יתווסף דרך המנהל.

That one bolded line is the cheapest duplicate-prevention in the whole feature.

## The flow

```
① TAP       Link from WhatsApp → studio name + logo + "הצטרפות למועדון"
                 ↓
            1. התחברות    [ המשך עם Google ]  [ המשך עם Apple ]
                          System browser, §5.2's rules, same as everywhere.
                          → auth_identity created/resolved NOW
            2. פרטי הורה  name · phone.  Email shown READ-ONLY from the
                          provider — a typed email is unverified and can be
                          wrong; the verified one already exists.
            3. הילדים     per child: name · birthdate · group picker
                          [ + הוסף ילד נוסף ]
                          Groups listed by class with their weekly schedule
                          ("נוער · ג׳+ה׳ 17:00") — parents know their group
                          by its days, not by its database name. Multi-select
                          per child: competition + teens is two enrollments.
                          Age filtering as in §5.4a where age_min/max are set.
                          "אני התלמיד" toggle for adult members — one Person
                          who is both student and primary guardian (§5.3).
            4. שליחה      everything created in ONE transaction (below)
                 ↓
② GATES     The parent app's normal first run (§6.1): consents, then the FULL
            health declaration per child — health_status = 'missing' makes the
            existing gate do this with zero new machinery.
                 ↓
③ PAY       Final onboarding step points at תשלומים, where this month's
            prorated charge is already waiting and all three routes are
            visible (§5.10). A choice, never a gate — see below.
                 ↓
            Home. The manager typed nothing.
```

## Inside each step

The five-step rail (`OnboardingWizardChrome`, `ONBOARDING_WIZARD_STEPS` in
`web/apps/parent/src/features/onboarding/OnboardingWizardChrome.tsx`) is **consent → club
terms → family → health → payment** — payment is step 5, not step 4; health is step 4.
Each is one entry on the rail but its own small sequence underneath. Recorded here so a
session touching one step does not have to reverse-engineer the others from the code.

### 1. Consent (`ConsentGate`, wizard mode)

1. Two checkboxes — תקנון (terms) and מדיניות פרטיות (privacy) — each with a one-line
   summary and a "קריאת המסמך המלא" button that opens the full text inline in the same
   card stack (`openDoc` state), not a new screen.
2. אישור is disabled until both are checked. On submit, the version the SCREEN rendered is
   posted back (`state.policy_version`); the server 409s if the published wording moved on
   while the tab was open — what stops an agreement being recorded against text nobody
   actually saw.
3. A failed write leaves the gate up with an inline error and both checkboxes still
   checked — never a blank retry.

Skipped entirely (falls straight through to step 2) for a family that already holds the
current `POLICY_VERSION`.

### 2. Club terms (`ClubTermsStep`)

One screen, three fixed clauses the club itself supplied (cheques, cancellation, pro-rata),
one checkbox, one "המשך". No sub-screens. Recorded once per signing person, not per child,
so a second child added later never sees this step again (§11.6's `consent_record`).

### 3. Family (`JoinFamilyStep`)

One long form, submitted once, not a wizard-within-a-wizard — but three visually distinct
zones:

1. **Your details** — name from sign-in (read-only), national ID, address, phone; the
   "who am I" segmented control (mother/father/other) appears only once a minor child
   exists, since a solo adult member has no relation to declare.
2. **The other parent + pickup contacts** — optional unless the signer picked "other",
   hidden entirely for an adult-only registration.
3. **Children**, repeatable — name, birthdate, national ID, grade, and a per-child group
   multi-select (weekday schedule shown, never the database name). "אני התלמיד" merges the
   signer and one child into one Person. "הוספת ילד" appends another block.

One submit posts the whole family in the one transaction the "What one submission creates"
table below describes, after client-side validation of all of it at once.

### 4. Health (`JoinHealthStep`)

A **queue**, not a single screen: every child still needing a declaration, one
`DeclarationForm` at a time. More than one child in the queue shows a pill row above the
form (1/3, 2/3…) so the length of what is left is never a surprise. Signing one advances to
the next; once none remain, the wizard moves to payment on its own. A family whose children
all already hold a current declaration never sees this step at all.

### 5. Payment (`PaymentSetup`, step 5 — `health.onboarding.step.payment`)

Not one screen either:

1. **Pick a method, once for the family.** One tap of card / cash / cheque / הוראת קבע
   applies to every child with an open charge; a per-child override is reached later, from
   the summary, not offered up front.
2. **Summary.** Every child with an open charge, its amount, the method chosen for it
   (changeable per row), and any child the club has not priced yet (shown, never hidden).
   Card, cash/cheque and הוראת קבע split into their own cards here, because the three
   routes do not combine the same way — see below.
3. **"לתשלום בכרטיס"** (today's button text — not "אישור ומעבר לתשלום", which is the
   confirm button on **uPay's own hosted checkout page**, outside this app). One tap opens
   one order over every card child's charges and hands off to uPay by posting a form; the
   whole tab navigates there. Money is held per payer, not per child — a three-child family
   enters a card once, not three times.
4. **Back in the app, `PaymentCompleteScreen`** is the summary the family sees after
   paying, and it is deliberately honest that it does not yet know the outcome: uPay's IPN,
   not the redirect, is the source of truth, and arrives roughly five minutes later. States
   shown: verifying (default), paid, amount_mismatch, failed, expired.
5. **Cash / cheque** never leaves the app: one promise per method, across every child
   paying that way; the manager marks it received later.
6. **הוראת קבע** never leaves the app either, in a different way that the copy currently
   under-explains — see the next section.

## What one submission creates

| Row | Values that matter |
|---|---|
| `person` (parent) | name, phone; `auth_identity_id` bound immediately — no invitation, no matching |
| `guardian` | one per child, `is_primary = true` (first registrant is the bill's addressee; manager can change) |
| `person` + `student` per child | `status = 'active'`, `source = 'onboarding_link'`, `health_status = 'missing'`, `joined_on = today` |
| `enrollment` per (child, group) | `status = 'active'`, `started_on = today`, `attends_weekdays = NULL` (all sessions — the common case; manager refines per C12) |
| `charge` per child | see pricing below |
| `audit_log` | one record per registration, actor = the new parent's person |

One registration per auth identity per studio; a resubmission returns the existing
result instead of duplicating the family.

## Pricing and the first charge

§5.10 attaches the price plan at conversion, with derived volume as a suggestion the
manager decides on. This lane has no manager in it, so the suggestion becomes the
assignment — and a detail of §5.10 makes that safe: **discounts are negative `manual`
charges, not different plans**, so the volume-matched plan is always the correct *base*
price and the family's discount is applied afterward exactly as it always is.

1. Derive each child's weekly volume from the chosen groups' schedule rules.
2. Assign the live `price_plan` whose `sessions_per_week` matches.
3. **Create the first tuition charge immediately** — not at the next monthly run —
   using §5.10's own first-month proration (materialized sessions, `proration_note`),
   plus the registration fee if the studio has one. The run's idempotency key
   (`student_id, period_year, period_month, kind`) already guarantees the next run
   cannot double-charge: the charge created at signup simply *is* that period's charge.
4. **No matching plan → no charge and no guess.** The student stays unpriced and lands
   on the manager's checklist; an invented price is worse than a visible gap, and a
   silently unpriced student is the §5.10 failure the `RESTRICT` on `price_plan_id`
   exists to prevent.

## Payment: a choice, never a gate

The parent must end onboarding knowing they owe this month — and the open charge plus
the debt total on home does exactly that. Onboarding is **not** blocked on paying, for a
structural reason, not a soft one: **two of the three payment methods cannot be
confirmed in-app** — הוראת קבע is reconciled manually and cash is recorded later by a
manager (§5.10, §12). A completion gate could only verify credit cards, which would
force every family onto uPay — and the migration cohort is full of families with a
standing order already running at their bank, for whom a forced card payment is a
guaranteed double charge. The pressure mechanism is the one that already exists: open
charge, debt escalation, and the manager's dashboard showing who has not paid.

Managers should mark known standing-order families in `recurring_subscription` as they
do today; the existing double-payment warning then covers them.

### One shared link, multiple children — a copy gap, not a code gap

`StandingOrderLinkOut.url` (`app/routers/billing.py:715`) is `plan.standing_order_link_url`
— **a URL that lives on the price plan, not on the student.** uPay's own product is a
fixed-amount shared link (§8/G8: our provider cannot create a mandate programmatically),
so this is the closest thing to automated recurring billing this product has. The
consequence, stated plainly: **two children on the same plan get the literal same URL.** A
family with three children who are all "once a week" (₪300) sees three rows in the
summary's הוראת קבע card, each with a link — and it is the *same link*, three times.

That is correct and intentional (`PaymentSetup.tsx:18-30`, the owner's own words: "for the
same price need to pay twice or for different links"), but the copy does not say so today:

```
setup.standingTitle  "הוראת קבע — קישור לכל ילד"
setup.standingHint   "לכל ילד קישור נפרד, כי הוראת קבע נחתמת על סכום קבוע."
```

"קישור נפרד" ("a separate link") reads as *a different link* to a parent who has not
opened the actual URLs to compare them character by character — exactly the parent who,
having tapped it once for the first child, believes all three are now covered. Nothing in
the product catches that: three mandates were never signed, the club is short two
children's worth of standing orders every month, and nobody notices until reconciliation —
the same failure mode `PaymentSetup.tsx:26-30`'s comment already names for the *design*,
now showing up in the *copy*.

**What needs to change.** `setup.standingHint` needs to say, in one short sentence, that
the link must be opened and completed **separately for each child even when it looks
identical** — not merely that a link exists per child. It is copy-only: `amount_agorot`
and `student_name` already travel with every row (`StandingOrderLinkOut`,
`billing.py:711-715`), and how many children share one URL is already computable
client-side (group `standingRows` by the matched link's `url`) — no schema or backend
change, no new field. Suggested Hebrew, kept to the same register and length as today's
hint, shown once above the group rather than reworded per row:

> "שימו לב: לכמה מהילדים שלכם אותה עלות, ולכן הקישור זהה. יש להיכנס אליו בנפרד לכל ילד
> ({count} פעמים בסה״כ) — כל הרשמה קובעת סכום קבוע ולא יודעת עבור כמה ילדים היא נחתמת."

This belongs in the same lane as the rest of the payment step's behaviour
(register §2/§13.2), not a schema change — implementation is not part of this update, which
only records the requirement and the reasoning behind it.

## The manager's checklist (not an approval queue)

Nothing in this lane blocks the parent — but nothing may get lost either. Every student
with `source = 'onboarding_link'` carries a chip (the ניסיון-chip pattern, §5.4a) on the
roster and student card until the manager confirms them, and the dashboard shows a
"נרשמו דרך הקישור" list, newest first:

- **Set/confirm price** — mandatory where auto-assignment found no matching plan,
  one-tap confirm where it did. Apply the family's discount here if there is one.
- **Merge cards** — see collisions below.
- The link card's counter ("14 משפחות נרשמו") is the manager's live feedback that the
  blast worked.

## Collisions and duplicates

Duplicates replace mistaken identity as the main risk once approval is gone.

- **Both parents register the same child.** Never refuse — "הילד כבר רשום" confirms a
  child's existence to whoever is typing, which is a roster leak. Accept the second
  registration, detect the name/group collision server-side, put a merge card on the
  checklist. The WhatsApp message's "הורה אחד נרשם לכל משפחה" line keeps this rare.
- **Typed phone matches an existing `person`.** Flag as a probable duplicate family for
  merging. **Never auto-bind a broadcast-link registration to a pre-existing Person** —
  typing a phone number proves nothing about owning it. Families the manager already
  entered by hand keep using §5.3 invitations, whose token was *sent to* the address it
  matches.
- **Wrong group picked.** Low-stakes and self-correcting: the child appears on the
  wrong roster, the coach notices at attendance, the manager moves them.

## Security model

A broadcast token is **context, not authorization** — it identifies the studio, never a
person. What contains a leaked or forwarded link:

- A stranger who registers gains access only to the rows they themselves created —
  there is no path from this form to any existing family's data.
- 7-day expiry, one-tap revocation, and regeneration-revokes-previous.
- Rate limits per IP and per link; registrations require a signed-in identity, so the
  queue cannot be flooded anonymously.
- A fake family is visible by construction: an unknown child on a roster is exactly
  what §5.4a already trains coaches to notice.
- Invalid, expired and revoked tokens all return the same "הקישור פג תוקף" — no oracle
  distinguishing "never existed" from "revoked".

## Privacy

- The form displays **no existing data whatsoever** — no roster, no names, no counts.
  The group list with schedules is already public (§5.4a landing page).
- Children's data entered here lands in the same tables, under the same rules, as
  manager-entered data: never in logs (structured-scrubber rules), never health
  contents in `audit_log.diff` (there are none in this flow — the declaration happens
  in the existing gate, after).

## Data model and API sketch

```
onboarding_link   studio_id (TenantMixin) · token_hash UNIQUE · expires_at
                  revoked_at? · created_by_person_id
```

`student.source = 'onboarding_link'` reuses the existing `source` column — no schema
change on `student`.

| Endpoint | Auth | Job |
|---|---|---|
| `GET/POST/DELETE /api/v1/onboarding-link` | owner/manager | current status · regenerate (revokes previous, returns URL once) · revoke |
| `GET /public/onboarding/{token}` | none | validate token → studio name/logo + classes/groups with schedules |
| `POST /api/v1/onboarding/{token}/register` | signed-in identity, no membership required | the one-transaction creation; studio context resolved from the token; idempotent per identity |

i18n: strings live in the `people` namespace (he/en/ru). Surfaces: dashboard card,
staff-app card, and the public registration flow in the parent app's shell.

## Out of scope

- Any approval mode (rejected deliberately — see the invariant exception above).
- Per-group tokens. At most a `?group=` pre-select hint on the same link, later.
- Auto-binding to pre-created Persons; matching/claim flows against existing records.
- Payment as a completion gate; any automated recurring billing (the הוראת קבע gotcha).
- Staff onboarding of any kind — staff access stays provisioned (§5.1, §6.1).
- Using this link as a marketing funnel for new families — that is §5.4a's job.
