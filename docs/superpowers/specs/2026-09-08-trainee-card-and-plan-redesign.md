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

Eighteen findings. The ones that decide the shape of the work:

| id | Defect |
| --- | --- |
| **A1** | `#/student/<id>` has no back control. `ParentShell` draws no app header by design, and the card is opened from a bottom sheet that closes behind it. In an installed PWA there is no browser back — the screen is a dead end. `#/plan/<id>` (**B4**) is the same, one level deeper. |
| **A2** | An adult member is listed as his own parent. `guardian.relation` is already `'self'` for anyone who registered themselves; `GuardiansSection` renders a fixed הורים over whatever names return. |
| **A3** | The guardians row shows the *family's* guardians, not the child's. `GET /me/guardians` walks every one of the caller's children and deduplicates by person, so both siblings' cards carry an identical list. |
| **A4** | That row links to `#/profile`, which since the 2026-09-06 review has no guardian view at all. There is now nowhere in the app that shows a second guardian's phone number. |
| **B1** | Plan options describe themselves with a credit balance: `PlanRow` renders `weekly_extra_allowance` through `schedule.plan.remaining` = נותרו {{count}}, so the 400 ₪ plan reads "1 remaining". |
| **B2** | There is no word for a downgrade. Every non-current plan says שדרוג המסלול or בחירת המסלול; a family moving 550 → 300 is told they are upgrading. |
| **B3** | The screen never says when a change lands — an upgrade is immediate, a downgrade waits for the first of the month — nor which plan a scheduled change moves from and to. |
| **B5** | Two-thirds of the plan screen is a timetable the app shows in two other places. |
| **C1** | Choosing a plan collects no money. אשלם דרך האפליקציה records the change and answers המנהל ייצור קשר לגבי התשלום — a promise that somebody will telephone. |
| **C2** | A standing-order family changing plan keeps paying the old amount. `standing_order_link_url` hangs off the *price plan*; change the plan and the signed mandate is the wrong mandate. G8 says the provider cannot cancel it for us. |
| **C3** | The cash floor and the twelve-month prepayment ceiling do not reach this screen. |
| **C4** | An upgrade is free until the first — deliberately, no proration — and the screen never says so. |
| **D1/D2** | Home says nothing about the plan, and cannot: `StudentSummaryOut` omits `price_plan_id` because it shares a shape with the coach-reachable roster. |
| **D3** | The plan is three taps deep behind a single link, on the screen where a parent goes to change their own phone number. |

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

If any of the above is not on `main` when this work starts, it blocks §6 and §7 only. §4
(the card) and §5 (the plan screen's shape) have no dependency on it and can land first.

---

## 4. The trainee card

Route unchanged: `#/student/<id>`.

### 4.1 The frame

A new `ScreenHeader` in `web/apps/parent/src/features/shell/`, because A1 is not one
screen's defect — belts, technique detail, directions and לוח הילד
share it, and a fifth hand-rolled back button is a fifth chance to get the RTL chevron
backwards.

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

This spec adopts it on the trainee card and the plan screen. The other four screens are
listed in §11 and are separate work.

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
- **No match falls back to derived copy**, from `weekly_extra_allowance`: the cadence line
  is the database plan's own name, and the bullets are the two or three facts the API does
  carry (base sessions included, `n` extra sessions a week or no weekly limit, the Saturday
  private lesson when the plan opens one).

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
chevron's direction is asserted in both directions.

`routes.reachable.test.ts` continues to guard that both screens are reachable, and gains the
home pill as a third entrance to `#/plan/`.

---

## 11. Deliberately not in this

- **`ScreenHeader` on the other four screens.** Belts, technique detail, directions and
  לוח הילד share A1. The component is built to be adopted; adopting
  it there is separate work with its own screenshots.
- **A guardian screen.** §4.3 answers the row in place. A real guardian view — add, remove,
  set primary — is a feature, not a fix.
- **Proration.** The no-proration rule is the club's. This spec says it out loud on screen
  and changes nothing about it.
- **The landing page.** Its prices are hardcoded in `clubContent.ts` and can already diverge
  from the database. That is a real defect and it is not this one.
- **Moving the extra-session marking to home.** Considered and rejected: it needs the week's
  bookable sessions, which home does not read.
- **Who may change a plan.** Unchanged — any guardian of the child. §5.3 has no permission
  to branch on.

---

## 12. Order of work

Three lanes. The first two are independent of the payments redesign and of each other.

1. **The frame and the card** — `ScreenHeader`, the card header, `DetailRow`'s restyle,
   `GET /me/students/{id}/guardians`, the relation-aware row. Screenshot checkpoint.
2. **The plan screen's shape** — `GET /me/training-plans`, `planCopy.ts`, the landing-style
   cards, upgrade/downgrade, the effect lines, the banner, the removal of
   תמיד כלול. Screenshot checkpoint.
3. **The money and home** — the four routes, `plan_id` on the mandate links, the plan names
   on `PlanChangeOut`, the home pill. **Blocked** until §3's payments work is on `main`.

Each lane runs `./scripts/lane-check.sh` and ticks `docs/plan/state.yaml` in the same commit
as its work.
