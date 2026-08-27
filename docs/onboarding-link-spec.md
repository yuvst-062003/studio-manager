# §5.4b — Member onboarding link

> Drafted 2026-08-27 from a design discussion, written in SPEC.md's voice and numbered
> §5.4b so it can be merged after §5.4a. **Implemented**: `app/routers/onboarding.py`
> carries the five routes, and `web/apps/parent/src/features/onboarding/JoinFlow.tsx`
> is routed at `/join/<token>` — with `FirstRegistration` (12j) as its done state since
> the completion run. (An earlier header said "Nothing here is implemented"; it was
> written before the build and never revisited — corrected by P0, because a spec that
> mis-states its own status is worse than no spec.)

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
