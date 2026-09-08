# The trainee card, the plan screen, and the money a plan change moves

The parent app's redesign reached every tab and stopped at the two screens behind them.
`#/student/<id>` and `#/plan/<studentId>` are still built from the previous design system,
neither has a way back, and between them they hold the one decision this club sells: which
plan a child trains on, and what it costs.

This spec covers three surfaces — the trainee card, the plan screen, and a new entry point
on home — and the four payment routes a plan change has to move money through.

The audit behind it is published at
`https://claude.ai/code/artifact/af3e0c68-0392-47b5-999f-1d30560afa1c` and its finding ids
(A1, B3, C2, …) are used throughout.

---

## 1. What is wrong now

**All eighteen findings, and the section that answers each.** Nothing appears here that this
spec leaves undone. §12's non-goals are decisions with reasons, and not one of them is a
finding from this table.

| id | Defect | Answered in |
| --- | --- | --- |
| **A1** | `#/student/<id>` has no back control. `ParentShell` draws no app header by design, and the card is opened from a bottom sheet that closes behind it. In an installed PWA there is no browser back — the screen is a dead end. | §4.1 |
| **A2** | An adult member is listed as his own parent. `guardian.relation` is already `'self'` for anyone who registered themselves; `GuardiansSection` renders a fixed הורים over whatever names return. | §4.3 |
| **A3** | The guardians row shows the *family's* guardians, not the child's. `GET /me/guardians` walks every one of the caller's children and deduplicates by person, so both siblings' cards carry an identical list. | §4.3 |
| **A4** | That row links to `#/profile`, which since the 2026-09-06 review has no guardian view at all. There is now nowhere in the app that shows a second guardian's phone number. | §4.3 |
| **A5** | The card is styled from the previous design system while every screen around it is the current one, and rows render only when their data exists — a real student collapses to five rows on a two-thirds empty screen. | §4.2 |
| **A6** | Nothing on the card identifies the child but their name: no avatar, and no belt in the header until one is graded. | §4.2 |
| **B1** | Plan options describe themselves with a credit balance: `PlanRow` renders `weekly_extra_allowance` through `schedule.plan.remaining` = נותרו {{count}}, so the 400 ₪ plan reads "1 remaining". | §5.2 |
| **B2** | There is no word for a downgrade. Every non-current plan says שדרוג המסלול or בחירת המסלול; a family moving 550 → 300 is told they are upgrading. | §5.3 |
| **B3** | The screen never says when a change lands — an upgrade is immediate, a downgrade waits for the first of the month — nor which plan a scheduled change moves from and to. | §5.3 |
| **B4** | `#/plan/<id>` has no back control either, and its only entrance is a screen that has none. | §4.1 |
| **B5** | Two-thirds of the plan screen is a timetable the app shows in two other places. | §5.1 |
| **B6** | The plan screen is titled המסלול שלי — "my plan" — on a route that is per child. Two children give two identically titled screens. | §5 |
| **B7** | The extras section renders נותרו 0 above a full-width dashed empty state: two ways of saying "nothing to do", in the middle of the screen. | §5.1 |
| **C1** | Choosing a plan collects no money. אשלם דרך האפליקציה records the change and answers המנהל ייצור קשר לגבי התשלום — a promise that somebody will telephone. | §6 |
| **C2** | A standing-order family changing plan keeps paying the old amount. `standing_order_link_url` hangs off the *price plan*; change the plan and the signed mandate is the wrong mandate. G8 says the provider cannot cancel it for us. | §6.4 |
| **C3** | The cash floor and the twelve-month prepayment ceiling do not reach this screen. | §6.3 |
| **C4** | An upgrade is free until the first — deliberately, no proration — and the screen never says so. | §5.3, §6.2 |
| **D1/D2** | Home says nothing about the plan, and cannot: `StudentSummaryOut` omits `price_plan_id` because it shares a shape with the coach-reachable roster. | §7, §8 |
| **D3** | The plan is three taps deep behind a single link, on the screen where a parent goes to change their own phone number. | §7 |
| **D4** | Every new string is trilingual across two namespaces, and `billing.ts` belongs to another lane. | §9 |

---

## 2. Decisions taken

Owner, 2026-09-08:

1. **The trainee card is a full screen** with its own header and a back control — not a
   sheet. It is a destination: the home schedule links to it, and a link has to be able to
   open one child.
2. **Plan options are drawn like the public landing page's pricing tiers** — badge, name,
   cadence, price, feature bullets, action — and their copy is **reused from
   `clubContent.ts`** rather than newly stored.
3. **Home carries a plan pill** beside the bell: icon, plan name and price, opening the
   plan screen.
4. **A plan change moves real money on all four routes.**
5. **On הוראת קבע, the parent is told to cancel the old mandate,
   and the manager's settlement queue stays as the backstop.**

### 2.1 The one concern raised and overruled

Reusing `clubContent.ts` couples a billing screen to a landing-page module whose contents
are static marketing copy for exactly three plans, maintained apart from the `price_plan`
rows. A fourth plan gets no copy, and a re-priced plan silently loses its bullets. The owner
chose it anyway, and §5.2 below makes it as safe as that choice allows: the join key is the
**price**, never list position or name; the app always renders the **database** amount; and
a plan with no match falls back to copy derived from its own allowance rather than to an
empty card.

---

## 3. What this depends on, and must not touch

The parent-payments redesign is **in flight in this working tree** (uncommitted as of
2026-09-08 18:00). This work reads it and must not edit it:

| Depended on | Owner |
| --- | --- |
| `student.payment_method` + migration `7050317e1aef` | payments redesign |
| `app/routers/payment_methods.py` — `GET`/`PUT /me/payment-methods` | payments redesign |
| `app/services/billing/prepay_ceiling.py` — `prepay_headroom_months`, `refuse_past_ceiling` | payments redesign |
| `web/…/billing/redesign/pay.ts` — `cashMonthChips`, `prepayHeadroomMonths`, `CASH_LADDER`, `PREPAY_CEILING_MONTHS` | payments redesign |
| `web/…/onboarding/wizard/submitJoin.ts` | payments redesign |
| `web/packages/i18n/{he,en,ru}/billing.ts` | payments redesign |

**Rule for every lane in this work: stage by explicit path, never `git add -A`.** Another
session is committing to `main` in the same checkout.

If any of the above is not on `main` when this work starts, it blocks **lanes 4 and 5 only**
— the money (§6), the home pill (§7), and the cleanup (§11.3, §11.4). Lanes 1, 2 and 3 —
the card, the plan screen's shape, and the back control on the other five screens — have no
dependency on it and can land first.

---

## 4. The trainee card

Route unchanged: `#/student/<id>`.

### 4.1 The frame

A new `ScreenHeader` in `web/apps/parent/src/features/shell/`. One component rather than a
back button per screen: eight screens need one, and eight hand-rolled chevrons are eight
chances to point it the wrong way in a right-to-left document.

```
ScreenHeader({ title, subtitle?, onBack?, locale })
```

- `onBack` defaults to `history.back()` when the app has somewhere to go back to and
  `location.hash = '#/'` when it does not. A card opened from a pasted link, a push
  notification, or a cold start has no history entry, and a back button that does nothing
  is worse than none.
- The chevron points **inline-start-ward**, which is leftward in Hebrew, matching every
  other disclosure arrow in the app. It is decorative; the accessible name is the label.
- Sticky to the top of the phone column, above the scroll, so a long card keeps its exit.

**Every screen that needs one adopts it, in this work.** A1 is not the trainee card's
defect; it is the app's, and a component built to fix it that fixes it on two screens out
of seven leaves five parents still stranded. The survey, from a grep for
`ArrowRight|ArrowLeft|history.back` across `features/`:

| Screen | Hash | Today | After |
| --- | --- | --- | --- |
| Trainee card | `#/student/<id>` | nothing | `ScreenHeader` |
| Plan | `#/plan/<id>` | nothing | `ScreenHeader` |
| Belt progress | `#/belts/<…>` | nothing — a dead end | `ScreenHeader` |
| Directions | `#/directions` | nothing | `ScreenHeader` |
| Child calendar | `#/calendar` | nothing | `ScreenHeader` |
| Privacy | `#/privacy` | nothing | `ScreenHeader` |
| Payments | `#/payments` | nothing | `ScreenHeader` — **lane 5**, the file is the payments lane's (§3) |
| Technique detail | `#/techniques/<slug>` | a `Button` hardcoded to `#/techniques`, in one branch only | `ScreenHeader`, which restores the intent `App.tsx`'s own comment already claims |
| Club shop | `#/shop` | nothing | **unchanged** — it is a tab, and a tab needs no back |

The five beyond our two screens are one import and one element each, and they are grouped
into their own commit per §13 so a screenshot pass covers them together. `PayScreen` waits
for lane 5 for the same reason everything else in §3 does: another session is editing that
file now.

### 4.2 The card itself

The slot registry stays. It is what lets six milestones own sections of one screen, and
nothing here needs the container to learn a section's name. What changes is the frame the
slots render into and the styling of `DetailRow`.

Header — one block, in the current design language:

```
┌──────────────────────────────────────┐
│ ‹   כרטיס חניך                        │  ScreenHeader
├──────────────────────────────────────┤
│  ╭─────╮                             │
│  │  י  │   יובל סטולין        [פעיל]  │  avatar · name · status chip
│  ╰─────╯   חגורה לבנה · קבוצה 1       │  belt · groups
└──────────────────────────────────────┘
```

- The avatar is an initial on the club navy, matching `ProfileHeader`'s. No photo: there is
  no student photo anywhere in this product and inventing an upload here is out of scope.
- The `mark` region keeps the belt colour; the `status` region keeps the status chip. Both
  move into the header block rather than floating above the name.
- The sub-line collapses belt and groups, which are today two separate ledger rows on a
  card that has five. A child with neither shows no sub-line.

Below it, the ledger, restyled to the Tailwind card language (`rounded-3xl`, hairline
dividers) and **kept as a ledger** — a fixed label column is what makes eight lanes' rows
read as one record.

### 4.3 The guardians row

Three separate defects, one row.

**A new read.** `GET /me/students/{id}/guardians`, in `app/routers/students.py` beside
`my_status_history`, which is the pattern it copies: ownership checked through
`StudentService.for_guardian`, a **404** and never a 403 for a student that is not the
caller's, no role dependency (§3.1 — guardian is not a role). It returns
`GuardianListResponse` for **that one child**, not deduplicated.

`GET /me/guardians` stays as it is. It answers a different question — "who are this
family's guardians" — and the profile tab may want it back one day.

**The label follows the relation.** `GuardianOut.relation` is already on the wire.

```
rows = guardians where relation != 'self'

rows is empty                     → the row is not rendered at all
every row has relation == 'parent' → הורים        people.guardian.plural
otherwise                          → אפוטרופוסים   people.guardian.pluralGuardians   (new)
```

A self-guarding adult has no row: there is nobody to name, and naming yourself as your own
parent is the defect. A grandparent among the guardians moves the whole row to
אפוטרופוסים, which is true of the set and is what the join wizard's
own form already says (`joinWizard.form.guardianSection` = פרטי ההורה /
אפוטרופוס).

**Where it goes.** Not `#/profile` — A4. The row shows each guardian's name with their
relation beneath it and their phone as a `tel:` action at the far end, in place. There is no
guardian screen to link to and building one is not in this scope; a row that answers itself
is better than a chevron pointing at a menu.

### 4.4 What else changes on the card

- The plan row's value becomes the **plan's name and monthly amount**, not the literal
  המסלול שלי. It reads from the new §8 endpoint.
- Nothing else. The debt, health, attendance and membership rows keep their behaviour and
  their owners; only `DetailRow`'s styling moves.

---

## 5. The plan screen

Route unchanged: `#/plan/<studentId>`. Title becomes the child's:
המסלול של {{name}} (**B6**).

### 5.1 What is on it

```
┌──────────────────────────────────────┐
│ ‹   המסלול של יובל                    │
├──────────────────────────────────────┤
│  המסלול הנוכחי                        │
│  ┌────────────────────────────────┐   │
│  │ מסלול יסוד                      │   │
│  │ פעמיים בשבוע          ₪300/חודש │   │
│  │ ✓ …  ✓ …  ✓ …                  │   │
│  └────────────────────────────────┘   │
│                                       │
│  האימון הנוסף שלי השבוע        0 / 1  │
│  (rows, or one line when there are    │
│   no extras open this week)           │
│                                       │
│  מסלולים אחרים                        │
│  ┌────────────────────────────────┐   │
│  │        [ מסלול מתקדם ]          │   │
│  │ מסלול לוחם                      │   │
│  │ שלוש פעמים בשבוע      ₪400/חודש │   │
│  │ ✓ …  ✓ …  ✓ …                  │   │
│  │        [ שדרוג המסלול ]         │   │
│  └────────────────────────────────┘   │
│  … one card per other plan …          │
└──────────────────────────────────────┘
```

**Removed** (**B5**): תמיד כלול, the list of this week's base
sessions. Home's schedule and לוח הילד both already show them, and
the plan card's cadence line says the same thing in one line.

**Kept**: the extra-session marking. It is the only way to spend an allowance, and deleting
it without a new home for it would remove a working feature. It shrinks: the standalone
נותרו 0 paragraph and the full-width dashed empty state collapse into
a counter beside the heading and, when there is nothing open, one muted line (**B7**).

### 5.2 Where the plan cards' copy comes from

Decision 2. A mapper in `web/apps/parent/src/features/billing/planCopy.ts`:

```ts
planCopyFor(locale, monthlyAmountAgorot) → { cadence, features, badge?, highlighted } | null
```

- It reads `clubContentFor(locale).plans` and keys by **`priceAgorot`**. Both lists agree on
  the price and on nothing else: `PRICES_AGOROT = [30000, 40000, 55000]` in
  `clubContent.ts`, and the database rows carry the same three amounts.
- **Never by list position and never by name.** The names genuinely differ — the database
  says פעמיים בשבוע where the landing page says
  מסלול יסוד — and CLAUDE.md records what picking by position cost
  the last time.
- **The card always renders the database amount**, `PlanOptionOut.monthly_amount_agorot`,
  never `priceAgorot`. A club that re-prices loses its bullets, never shows a wrong number.
- **No match falls back to derived copy.** The cadence line comes from
  `PricePlan.sessions_per_week` — a column that already exists, is exactly this label
  ("C11 — 'פעמיים בשבוע' is 2, 'כל יום' is 5"), and is `NULL` for open membership. It is
  added to `PlanOptionOut`, which is the only schema change §5 needs. The bullets are the
  facts the API carries: the base sessions, `n` extra a week or no weekly limit
  (`weekly_extra_allowance`), and the Saturday private lesson when the plan opens one.

**The fallback is not the rare path — it is the demo studio's only path.** `seed_money` in
`app/services/demo/layers.py` seeds 24,000 / 32,000 / 42,000, and `PRICES_AGOROT` is
30,000 / 40,000 / 55,000. So on the demo studio — which the §19 developer account and every
local checkout run against — **nothing matches and every card renders derived copy**. Two
consequences, both binding:

1. **The §13 checkpoint screenshots must be taken against a studio priced 300/400/550**, or
   they will show the fallback and be signed off as the landing-style design they are not.
   The reviewer is told which studio the screenshot came from.
2. **The derived path gets the same care as the matched one.** It is what a developer sees
   every day and what any club that is not Gladiator sees for ever. It is not a degraded
   card: same layout, same badge slot left empty, bullets from real data.

**And a guard, because a silent divergence is what this join risks.** A test asserts that
every amount in `PRICES_AGOROT` is one this app can actually price a plan at, and fails
loudly rather than quietly falling back, so a club that re-prices learns it from CI instead
of from a parent. The landing page's own hardcoded prices are the other half of that defect
and are §12's — but the guard names it, which is the difference between a known gap and an
unknown one.

The card's two title lines are then:

| line | source |
| --- | --- |
| name | the landing page's name — מסלול לוחם — the name the family saw on the club's site |
| cadence | the **database** plan name — שלוש פעמים בשבוע — which is what appears on their charges |

Both are shown so neither surface can contradict the other in the family's hand. When there
is no landing copy, the database name becomes the title and the cadence line is derived.

### 5.3 Upgrade, downgrade, and what a change does

`PlanOptionOut` grows nothing. The direction is a comparison the screen can already make and
the server already makes the same way (`_is_upgrade`, by price):

```
plan.monthly_amount_agorot >  current  → שדרוג המסלול   schedule.plan.upgrade
plan.monthly_amount_agorot <  current  → מעבר למסלול חסכוני   schedule.plan.downgrade   (new)
no current plan                        → בחירת מסלול     schedule.plan.choose
```

`is_offered` stops choosing the verb and goes back to meaning what §5.1 says it means: a
plan that would not raise this child's week keeps its reason line
(`schedule.plan.notOffered`) beside a button it still has (**B2**).

Every card states its consequence before the parent commits (**B3**, **C4**):

| direction | the line under the button |
| --- | --- |
| upgrade | האימונים נפתחים מיד. החיוב החדש יעלה ב־1 ב{{month}} — על החודש הזה לא מגיע תשלום נוסף. |
| downgrade | המסלול ישתנה ב־1 ב{{month}}. עד אז לא משתנה כלום, והאימונים שכבר סומנו נשמרים. |

The month comes from the server, not from the client: §8's payload carries
`next_effective_on`, which is `first_of_next_month(now())` computed by
`app.core.clock.now()`. A client that computed it from the device clock would disagree with
the worker across a timezone boundary.

The scheduled-change banner gains the two plan names and keeps its cancel button:
מ־מסלול לוחם ל־מסלול יסוד · ייכנס לתוקף ב־1 באוקטובר.

---

## 6. The money a plan change moves

Decision 4. Today the confirm step asks a question and files a promise (**C1**). It becomes
a step that names the family's own payment route and does the thing that route needs.

### 6.1 Which route

Read `GET /me/payment-methods` (payments redesign, §3) and take **this child's** method.
Per child, because that is what the column is and what a mandate is.

`null` — a family who has never been asked — shows the four routes as a choice, writes the
answer through `PUT /me/payment-methods`, and then continues into the route chosen. This is
the same picker the profile's אמצעי תשלום sheet draws; it is
rendered here rather than linked to, because sending a parent to another tab mid-decision is
how a plan change gets abandoned.

### 6.2 אשראי — card

A uPay order through `createOrder` + `orderForm` + `PaymentOverlay` — the same three calls
`ParentPayments` and `ClubShop` already make. No new payment path.

**What is charged.** Nothing today, in the ordinary case, and the screen says so. There is
no proration: an upgrade unlocks access at once and the new amount is raised by the monthly
run on the 1st. So the card route offers what the payments screen offers — settle what is
open, optionally buy months forward at the **new** monthly amount — and never invents a
mid-month difference to collect.

When the family owes nothing and buys nothing forward, there is no order and the confirm
button simply records the change. A uPay order for zero agorot is a dead end at the
provider.

### 6.3 מזומן — cash

Month chips, from the payments redesign's own arithmetic (**C3**):

```
floor    = the club's cash_prepay_months        (3 at this club)
headroom = prepayHeadroomMonths(creditAgorot, monthlyTotalAgorot)
chips    = cashMonthChips(floor, headroom)
```

**Both numbers come from one re-read, after the change is recorded.** `refuse_past_ceiling`
prices `credit_after = credit + prepay_months × monthly_total_agorot` from the **payer's**
monthly total, so a client that priced its chips off the chosen plan's amount instead would
offer a chip meaning different money from the one the server checks — the disagreement at
the boundary the payments spec §5.1 exists to prevent. So the order is: record the change,
re-read `GET /me/prepay-terms`, then compute. An upgrade has already moved `price_plan_id`
by then and the re-read carries the new total; a downgrade has not, and the months being
bought are genuinely still at today's price. Either way the two sides agree by construction
rather than by arithmetic done twice.

`headroom <= 0` renders no chips and one line —
שולם מראש עד {{month}} — and the change is recorded without a
promise. The ceiling beats the club's floor, per the payments spec §5.3.

The promise is `createPromise` with `already_paid: false` and the chosen `prepay_months`,
exactly as the payments screen raises one. A manager confirms it.

### 6.4 הוראת קבע — standing order

Decision 5. Two steps, both shown, in this order:

```
① חתימה על הוראת קבע חדשה     ₪400 לחודש        [ קישור ↗ ]
② ביטול ההוראה הישנה (₪300) בבנק שלכם
   אחרת המועדון יגבה את שני הסכומים.
```

- The link is the **new plan's** `standing_order_link_url`, read from
  `GET /me/standing-order-links` **after** the change is recorded — the endpoint returns the
  link for the plan the student currently points at, so an upgrade (which moves
  `price_plan_id` immediately) yields the new link on the next read. A **downgrade does
  not**: `price_plan_id` does not move until the first of the month, so the link would still
  be the old one. See §6.6.
- The old amount named in step ② comes from the plan being left, so the sentence is specific
  enough to act on.
- `target="_blank" rel="noopener noreferrer"`, like the profile's mandate links. Following
  it in place loses the app.
- **The manager's backstop is unchanged.** `PlanChange.settlement_status` stays `pending`
  and the change lands in the settlement queue exactly as today. The parent being told is an
  addition, not a replacement: only the payer can cancel a mandate at their own bank, and a
  family that does not is the case the queue exists for.

### 6.5 צ׳קים — cheques

The season total at the new price, and one promise — the same shape the profile's cheque
card raises, with `method: 'cheque'`, subject to the same ceiling. Cheques buy a season for
the family, so the total is family-level and the copy says so.

### 6.6 What the server needs

Three changes, all small:

1. **`GET /me/standing-order-links` gains an optional `plan_id` query parameter.** Without
   it, today's behaviour. With it, the link for that plan — for this caller's own child
   only, and only for a plan that is `active` and has a link. This is what lets the
   downgrade case show the right mandate before `price_plan_id` has moved. It cannot be
   done client-side: `standing_order_link_url` is not on `PlanOptionOut` and must not be —
   the full catalogue is deliberately never exposed (`billing.py:850`).
2. **`PlanChangeOut` gains `from_price_plan_name` and `to_price_plan_name`.** The banner
   needs them and the client has no other way to name a closed plan.
3. **Nothing about the ceiling.** `refuse_past_ceiling` already guards
   `OrderService.create` and `PaymentPromiseService.create`, which are the only two routes
   this screen writes money through. The screen's chips mirror the server; they do not
   re-implement it.

`POST /students/{id}/plan-changes` is otherwise unchanged. It still refuses a second
scheduled change with a 409, and the screen still shows the existing one with its cancel
button rather than offering a picker that would 409.

---

## 7. Home

Decision 3. A pill in `HomeTop`'s header row, beside the bell:

```
╭────────────────────────────────╮
│ 🎫  פעמיים בשבוע · ₪300      › │
╰────────────────────────────────╯
```

- It shows the **selected** child's plan. `HomeTop` already has `selectedChildId`; `null`
  means all children.
- One child in the family → the pill always shows that child, and `null` is not a distinct
  case.
- Several children and `null` selected → the pill reads
  המסלולים שלנו with no amount, and pressing it opens a small
  chooser. It must not sum two children's prices into one number, and it must not silently
  pick the first.
- No plan set (a `lead`, or a child a manager has not priced) → the pill is not rendered for
  that child. An empty plan pill is a question a parent cannot answer.
- Pressing goes to `#/plan/<studentId>`.

`HomeChild` gains `planName: string | null` and `planMonthlyAgorot: number | null`, filled
from §8's read in `Resolve` — where every other home read already lives, so home keeps its
rule of not fetching.

---

## 8. The new read

`GET /me/training-plans` — one row per child of the caller.

```json
{ "items": [ {
  "student_id": "…",
  "student_name": "יובל סטולין",
  "price_plan_id": "…",
  "plan_name": "פעמיים בשבוע",
  "monthly_amount_agorot": 30000,
  "weekly_extra_allowance": 0,
  "next_effective_on": "2026-10-01",
  "scheduled_change": { "id": "…", "to_plan_name": "שלוש פעמים בשבוע",
                        "effective_on": "2026-10-01" }
} ] }
```

**Why a new route and not a field on `/me/students`.** `StudentSummaryOut` is the shape a
coach receives from a list, and invariant 3's detector reads `price_plan_id` as financial. A
tuition amount on that shape would ride onto every screen that happens to list students.
This is a parent-scoped shape, like `TrainingPlanOut` beside it, and it carries the same
§12 amendment for the same reason.

**Why not `GET /students/{id}/training-plan` per child.** That route computes a whole club
week per call. Home would make one per child on every visit to render a pill.

It lives in `app/routers/training_plans.py`, which already holds the parent-scoped plan
reads, and reuses `_own_student`'s ownership rule through `StudentService.for_guardian`.

`next_effective_on` is `first_of_next_month(now())` from `app.core.clock` — one clock, and
the client never computes a date the worker will act on.

---

## 9. Copy

Every new string lands in `he/`, `en/` and `ru/`. `i18n/index.ts` is authored once and no
lane edits it.

**`people.ts`** — `guardian.pluralGuardians`, `card.guardianRelation`, `card.backLabel`,
the card header's belt/group sub-line.

**`schedule.ts`** — `plan.downgrade`, `plan.titleFor` (המסלול של
{{name}}), `plan.currentHeading`, `plan.otherPlans`, `plan.upgradeEffect`,
`plan.downgradeEffect`, `plan.changeFromTo`, `plan.route.*` (the four routes' headings and
the two standing-order steps), `plan.mandateCancelOld`, `plan.noChargeThisMonth`,
`plan.derivedFeature.*` (the fallback bullets).

**`billing.ts` is not touched** — it belongs to the payments redesign in flight (§3). Any
string this work needs that lives there is read, not added.

`schedule.plan.remaining` keeps its meaning — "n remaining this week" — and stops being used
to describe a plan (**B1**).

---

## 10. Testing

Following this repo's split: arithmetic and mapping in pure modules with unit tests, screens
with rendering tests, routes with API tests.

**`planCopy.ts`** — the three known prices map; an unknown price falls back to derived copy
and never to an empty card; the fallback's bullets come from `weekly_extra_allowance` and
name the private lesson only when the plan opens one. A test asserts the mapper is keyed by
price and would still resolve if `clubContent`'s array were reordered.

**The plan screen** — an upgrade card says שדרוג and a cheaper one
says the downgrade string; the effect line names the first of next month from the payload
and not from `Date`; a plan that is not offered keeps its reason **and** its button; the
scheduled-change banner names both plans.

**The money step** — one test per route. Cash renders the chips `cashMonthChips` returns
for `(floor, headroom)` and renders none at zero headroom; standing order shows the new
plan's link and the cancel-the-old sentence naming the old amount; card raises no order when
there is nothing to pay; a `null` method shows the picker and writes it before continuing.

**The guardians row** — a self-guarding adult renders no row; a grandparent switches the
label; two children in one family get two different lists (the defect A3 names); the row
reads the per-child route and never `/me/guardians`.

**Routes** — `GET /me/students/{id}/guardians` answers 404 for another family's student;
`GET /me/training-plans` returns one row per child and no row for a child with no plan;
`GET /me/standing-order-links?plan_id=` refuses a plan the caller's children are not on.

**The frame** — `ScreenHeader`'s back falls through to `#/` with no history entry; the
chevron's direction is asserted in both directions. And **one test that owns the rule rather
than the component**: it walks §4.1's table and asserts each of those screens renders a
`ScreenHeader`, so a ninth screen added behind the tabs without one is a failure rather than
a discovery. That is the difference between fixing A1 eight times and fixing it once.

**The plan copy** — the three matching prices resolve; an unmatched price falls back and
never yields an empty card; the mapper is keyed by price, asserted by reordering
`clubContent`'s array and getting the same answers; and the derived cadence reads
`sessions_per_week`, with `NULL` rendering the open-membership wording rather than "null
times a week".

**The price guard** (§5.2) — every amount in `PRICES_AGOROT` is one a plan can be priced at,
and the test says in its failure message that the landing page and the database have
diverged, because a bare assertion failure here would send the next reader to the wrong file.

**Lane 5** carries no behaviour change, so its gate is `npm run typecheck` — which is what
catches all nine moved importers — plus the billing suites that already cover
`makeParentBillingClient` and `submitUpayForm` through their new home.

`routes.reachable.test.ts` continues to guard that both screens are reachable, and gains the
home pill as a third entrance to `#/plan/`.

---

## 11. The old screens are deleted, not shadowed

Owner, 2026-09-08: the screens this replaces come off disk in the same commit that replaces
them.

**This is a departure from what this app has done four times**, and the departure is
deliberate. `ClubShop`, `ParentPayments` and `ProfileScreen` each landed beside the screen
they replaced, with a source comment saying the old one "stays on disk until the redesign is
accepted end to end". Three of those four have since been deleted — `ProfileSection`,
`ShopSection` and `OrderItemsScreen` no longer exist — and the only trace left is `App.tsx`
comments naming files that are gone. The pattern's cost is real: an unrendered screen is
where a stale link hides, `routes.reachable.test.ts` cannot tell the difference, and nobody
remembers to come back.

**What that costs, said plainly.** There is no dark-launch period and no route flip to roll
back with. The checkpoint screenshots in §12 *are* the acceptance, and a rollback is
`git revert` of one commit. That is acceptable here because both screens are behind the tab
bar with a combined three entry points, and neither is on a first-run path.

### 11.1 Deleted with the trainee card (lane 1)

| File | Why it can go |
| --- | --- |
| `features/people/StudentCard.tsx` | The container itself. Its one runtime export is replaced; its type export moves — see below. |
| `features/people/StudentCardSection.tsx` | The data container. One importer, `App.tsx`. |
| `features/people/StudentCard.test.tsx` | Tests the deleted container. Replaced, not ported: it asserts the old header/ledger shape. |
| `features/people/StudentCardData.test.tsx` | Same. |

**`StudentCardSectionProps` is a rename, not a deletion.** Five files import that type —
`register.ts`, the three `sections/*.tsx`, and `features/people/index.ts` — and every
registered section is typed by it. It moves to the new card's file and all five imports
update in the same commit. The slot registry, the `region` field and every lane-owned
section survive: this is the frame being replaced, not the composition (§4.2).

`sections/GuardiansSection.tsx` is rewritten in place rather than deleted — it keeps its
slot key and its order, so no other lane's file reopens.

### 11.2 Deleted with the plan screen (lane 2)

| File | Why it can go |
| --- | --- |
| `features/billing/TrainingPlanScreen.tsx` | Replaced. One importer, `TrainingPlanSection.tsx`, deleted with it. |
| `features/billing/TrainingPlanSection.tsx` | Replaced by the new container. One importer, `App.tsx`. |
| `features/billing/TrainingPlanScreen.test.tsx` | Tests the deleted screen's three-section shape. |

`trainingPlanClient.ts` **survives**. It is the endpoint layer, not the screen, and the new
container calls the same five methods.

### 11.3 The two superseded screens nobody has been able to delete (lane 5)

`PaymentsScreen.tsx` and `PaymentsSection.tsx` were replaced by `ParentPayments` on
2026-09-07 under the same "stays on disk until accepted" comment, and unlike the shop and
profile pair they are still here — because `PaymentsSection.tsx` is **superseded as a screen
and load-bearing as a module**. Four of its five exports have nothing to do with the screen:

```
BillingRequestError      PaymentOverlay, ParentPayments
DEMO_SIMULATOR           ClubShop, ParentPayments, submitJoin
submitUpayForm           PaymentOverlay, PaymentFrame
makeParentBillingClient  ClubShop, ParentPayments, PaymentHistorySection,
                         StudentCardBillingSection, TrainingPlanSection, App.tsx
PaymentsSection          ← nothing. The dead half.
```

That is why it survived: deleting the screen means moving four exports and updating nine
importers, which nobody wanted to do inside a feature commit. It is a twenty-minute job with
a compiler holding the other end, and leaving it undone is what §11's opening paragraph is
about.

**The move.** The four go to `features/billing/billingClient.ts`, which already holds
`BillingClient` and its wire types and is what every one of those nine importers is actually
reaching for. Then `PaymentsSection.tsx` and `PaymentsScreen.tsx` both delete — with
`PaymentsScreen`'s `DebtRow`, `PrepayTerms` and `StandingOrderLink` types, which the
`redesign/` screens replaced with their own — and `features/billing/index.ts` drops its two
`PaymentsScreen` exports.

**Sequenced after the payments lane lands**, and for one reason only: another session has
`PaymentsSection.tsx` open right now (§3). This is not a scope question; it is a merge
question, and doing it on top of their commit costs nothing.

### 11.4 The stale comments (lane 5)

Four comments in `App.tsx` — lines 935, 937, 945 and 988 — describe `ShopSection`,
`OrderItemsScreen`, `ProfileSection` and `GuardianSettings` as files that "stay on disk
until the redesign is accepted end to end". **All four files are already gone.** The
comments are the last trace of the pattern §11 exists to break, and they are actively
misleading: they tell the next reader that a fallback exists.

They are corrected in lane 5, in the same commit as §11.3, because that commit is already
in `App.tsx` and because a comment that describes a deleted file is exactly the rot the
deletion was meant to prevent.

### 11.5 The check

After each lane, `grep` for the deleted symbols across `web/apps/parent/src` and expect
nothing outside the lane's own diff. `npm run typecheck` is the real gate: a missed importer
of `StudentCardSectionProps` is a compile error, not a silent fallback — which is the whole
reason the type moves rather than being duplicated at the new path.

---

## 12. Deliberately not in this

Four, and each is a decision with a reason rather than a finding pushed out of scope. §1's
table shows every finding answered.

- **A guardian screen — add, remove, set primary.** §4.3 answers A4 in place: the row shows
  each guardian, their relation and a `tel:` action, which is the whole of what the card was
  failing to give. A managed guardian list is a feature the product does not have on any
  surface, staff included, and building the first one behind a fix would be inventing scope
  the owner has not asked for.
- **Proration.** An upgrade mid-month costs nothing extra and the club carries the
  difference. That is the club's rule, deliberately taken (§15 open item 3). This spec makes
  it visible (C4) and changes nothing about it.
- **The landing page's hardcoded prices.** `PRICES_AGOROT` lives in `clubContent.ts` and can
  already disagree with `price_plan` — the club's own site can quote a price it does not
  charge. It is a real defect, it predates this work, and fixing it properly means deciding
  whether the public contract starts serving prices, which is a product decision about a
  page this spec does not otherwise touch. §5.2's guard makes the divergence fail CI here,
  so this work makes the gap **visible** without pretending to close it.
- **Moving the extra-session marking to home.** Considered and rejected on the merits: home
  does not read the week's bookable sessions, and adding that read to make the plan screen
  shorter trades one screen's clutter for another's.

**Not on this list, and in scope after the owner's review of 2026-09-08:** `ScreenHeader` on
every screen that lacks one (§4.1), the deletion of `PaymentsSection` and `PaymentsScreen`
(§11.3), and the four stale `App.tsx` comments (§11.4). All three were deferred in the first
draft and pulled back in, because a spec that diagnoses a defect and then schedules the fix
for nobody is precisely how `PaymentsSection` came to be still here a day after the screen
that replaced it shipped.

---

## 13. Order of work

Five lanes. Lanes 1 and 2 are independent of the payments redesign and of each other; lane 3
needs lane 1's component and nothing else; lanes 4 and 5 wait on §3.

1. **The frame and the card** — `ScreenHeader`, the card header, `DetailRow`'s restyle,
   `GET /me/students/{id}/guardians`, the relation-aware row. **Deletes** §11.1's four files
   and moves `StudentCardSectionProps` with its five importers, in the same commit.
   Screenshot checkpoint.
2. **The plan screen's shape** — `GET /me/training-plans`, `planCopy.ts`, the landing-style
   cards, upgrade/downgrade, the effect lines, the banner, the removal of
   תמיד כלול. **Deletes** §11.2's three files in the same commit. Screenshot checkpoint.
3. **The back control everywhere else** — `ScreenHeader` on belt progress, directions, the
   child calendar, privacy and technique detail (§4.1). One import and one element each,
   in one commit, with one screenshot pass over the five. Depends on lane 1 only, for the
   component.
4. **The money and home** — the four routes, `plan_id` on the mandate links, the plan names
   on `PlanChangeOut`, the home pill. **Blocked** until §3's payments work is on `main`.
5. **The cleanup** — move `BillingRequestError`, `DEMO_SIMULATOR`, `submitUpayForm` and
   `makeParentBillingClient` into `billingClient.ts`, update the nine importers, delete
   `PaymentsSection.tsx` and `PaymentsScreen.tsx` and the billing barrel's two exports, add
   `ScreenHeader` to `PayScreen`, and correct the four stale `App.tsx` comments (§11.3,
   §11.4). **Blocked** on the same work as lane 4, and for the same merge reason. No
   behaviour changes, so the gate is `npm run typecheck` plus the billing suites — no
   screenshot.

**The deletion lands with the replacement, never after it.** A commit that adds the new
screen and leaves the old one for a follow-up is the pattern §11 exists to break: the
follow-up is what nobody does. The screenshot checkpoint is taken on the branch *after* the
deletion, so what is reviewed is what ships.

Each lane runs `./scripts/lane-check.sh` and ticks `docs/plan/state.yaml` in the same commit
as its work.
