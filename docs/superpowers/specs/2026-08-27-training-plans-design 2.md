# Training plans — design

**Date:** 2026-08-27
**Status:** Approved for planning. No implementation has started.
**Covers:** the 300 / 400 / 550 ₪ monthly plans, what each one unlocks, and how a parent
changes plan from the parent app.
**Source of truth:** the club manager's own description of the 2026/27 season, and the
printed weekly timetable it accompanies. Where this document and SPEC §5.10 disagree,
§5.10 is amended — see §12.
**Companions:** `2026-08-27-payment-routes-links-and-cheques-design.md` — the הוראת קבע
link a manager sets per plan, and cheques as a payment route.
`2026-08-27-prepayment-and-credit-design.md` — **closes open item 1 below and narrows
§11's manager task to the standing-order route only.** Independent of this document;
any may ship first.

---

## 1. What the club actually sells

The manager's rule, in his words: base training is Tuesday and Friday; on 400 ₪ the
student may choose one more session per week and **must mark that they are coming**, after
which the app stops letting them mark more; on 550 ₪ there is no weekly limit and the
Saturday private lessons open up.

| Plan | Base | Extra sessions per week | Saturday private |
|---|---|---|---|
| **300 ₪** | Tuesday + Friday | 0 | no |
| **400 ₪** | Tuesday + Friday | 1 | no |
| **550 ₪** | Tuesday + Friday | unlimited | **yes** (ages 12+) |

The timetable is what makes this work. Tuesday and Friday are the only two days carrying
all five numbered judo groups, so **every student has exactly one Tuesday slot and one
Friday slot, decided entirely by which numbered group the coach put them in.** The base is
never a choice. What the plan sells is access to the other days.

| Day | Time | Session |
|---|---|---|
| Sunday | 16:00 | Judo, ages 8–12 |
| Sunday | 17:00 | Competition Team |
| Monday | 16:00 | CrossFit for Judo |
| Tuesday | 16:00 / 17:00 / 17:45 / 18:30 / 19:30 | Judo Group 4 / 1 / 2 / 3 / 5 |
| Wednesday | 16:00 | Girls Team |
| Wednesday | 17:00 | CrossFit for Judo |
| Thursday | 16:00 | Competition Team |
| Friday | 14:00 / 14:45 / 15:30 / 16:30 / 17:30 | Judo Group 1 / 2 / 3 / 4 / 5 |
| Saturday | 11:00 | Private Technique, ages 12+ |

Numbered groups are age brackets: Group 1 is 4–6, Group 2 is 7–9, Group 3 is 9–10,
Group 4 is 10–12, Group 5 is teens and adults. The brackets overlap deliberately; the
coach places the child.

---

## 2. The missing concept — `group.kind`

The schema cannot currently tell a Tuesday judo class from a Monday CrossFit session from
a Saturday private lesson. They are all `group` rows. Every rule in this document depends
on separating them, and nothing else in the design is possible until they are.

| Kind | Groups | Rule |
|---|---|---|
| `base` | Judo Group 1–5 | One per student, assigned by the coach. Included in every plan. Never marked, never chosen. |
| `extra` | Sunday Judo 8–12, Monday CrossFit, Wednesday CrossFit, Sunday Competition Team, Thursday Competition Team, Wednesday Girls Team | Spent from the plan's **weekly allowance** by marking. |
| `private` | Saturday Private Technique | Requires a plan with an unlimited allowance. |

Two things this deliberately does *not* do.

**There is no `team` kind.** An earlier draft had one, on the assumption that the coach
selects the competition squad. The manager corrected this: **students put themselves on
the competition teams.** A self-selected session beyond the base is exactly an extra, so
the kind collapsed. Its only lasting consequence is real and worth stating plainly: the
Competition Team trains Sunday *and* Thursday, so **attending the full team schedule
requires 550 ₪.** On 400 an athlete gets one of the two. That follows from the model rather
than being written into it, and it appears to be the intent — the manager's letter opens by
saying the new timetable was built for the competitive athletes.

**`kind` is not derived from `class` or from the printed colour.** Sunday's Judo 8–12 is
printed in the same blue as the base groups and is a judo class in every other sense, but
functionally it is an extra. The manager sets `kind` per group, explicitly.

---

## 3. The weekly allowance

The club's week runs **Sunday to Saturday**. This is not a new convention: `app/services/
people/attendance_pattern.py` already states that the club's week starts on Sunday and so
does every roster in the product.

For a student on 400 ₪:

1. The week opens with one extra credit.
2. They see the extra sessions they are eligible for this week.
3. They mark one. The credit is spent.
4. The rest become unmarkable, with the reason shown and the upgrade offered.
5. The following Sunday the credit resets.

On 300 ₪ nothing is ever markable. On 550 ₪ marking never blocks — it exists there only so
the coach knows who is coming.

**Base sessions are never marked.** Tuesday and Friday come from the enrollment exactly as
they do today. Marking applies to `extra` and `private` groups only.

### 3.1 Which week a session belongs to

The bucket is computed from the session's **local** date in Asia/Jerusalem, not from its
stored UTC timestamp. `session.starts_at` is `timestamptz` in UTC and Jerusalem is UTC+2 or
UTC+3, so a session stored at Saturday 22:00 UTC is Sunday morning locally and belongs to
the *following* week's allowance. Getting this wrong hands one student a free credit twice
a year and takes one away twice a year, silently. A test pins both DST boundaries.

### 3.2 Releasing a mark

A booking may be released and re-marked freely **until the session starts**; once it has
begun the credit is spent whether or not the student attended. This gives a family real
flexibility — a child sick on Monday can move to Wednesday — while giving the coach a
roster that stops moving at the moment it matters. See §15.

---

## 4. Eligibility

Not every extra is open to every student. From the manager: Sunday Judo is for Groups 2–4,
CrossFit is for Groups 3–5, the Competition Team is for age 9 and up, and the Girls Team is
for girls from Group 2 upward.

```
Sunday Judo 8-12        <-  Group 2, 3, 4
Monday CrossFit         <-  Group 3, 4, 5
Wednesday CrossFit      <-  Group 3, 4, 5
Sunday Competition      <-  Group 3, 4, 5
Thursday Competition    <-  Group 3, 4, 5
Wednesday Girls Team    <-  invite list
Saturday Private        <-  age 12+, unlimited-allowance plan only
```

**Eligibility is an explicit link from extra group to base group, not a derivation from
age.** The brackets overlap — Groups 2 and 3 both contain nine-year-olds, Groups 3 and 4
both contain ten-year-olds — so an age rule would let a nine-year-old the coach placed in
Group 2 into CrossFit, which is not what "Groups 3+4+5" means. The link table is roughly
fifteen rows, set once, and it matches how the manager states the rule.

### 4.1 The Girls Team, and why no gender column is added

`person` carries `first_name`, `last_name`, `birthdate`, `phone`, `email`, `locale` — and
no gender. Enforcing "girls only" in software would mean adding a personal-data field about
minors to a system built to be careful with exactly that, for the sake of one group's
filter.

Instead, `group.is_invite_only` — a boolean. When true, eligibility comes from an active
`enrollment` the manager creates, not from the link table. The Girls Team is the only group
that uses it today. This reuses machinery that already exists, adds no new personal data,
and leaves a path open if the manager ever wants to hand-pick a squad, without building
that now.

---

## 5. What each plan buys, per group

This falls out of §4 and is the most consequential table in the document, because the three
tiers do not function uniformly.

| Student | Extras they can reach | 300 | 400 | 550 |
|---|---|---|---|---|
| Group 1 (4–6) | — none — | offered | **grey** | **grey** |
| Group 2 boy (7–9) | Sunday Judo | offered | offered | **grey** |
| Group 2 girl (7–9) | Sunday Judo, Girls Team | offered | offered | offered |
| Group 3 (9–10) | Sunday Judo, Mon CF, Wed CF, Sun Team, Thu Team (+ Girls Team) | offered | offered | offered |
| Group 4 (10–12) | as Group 3, + Saturday Private from age 12 | offered | offered | offered |
| Group 5 (teens+) | Mon CF, Wed CF, Sun Team, Thu Team, Saturday Private (+ Girls Team) | offered | offered | offered |

Group 5 has no Sunday Judo because that session is ages 8–12.

The rows read "boy" and "girl" for legibility, but the app never knows either — per
§4.1 the Girls Team is an invite list, so the row that applies to a student is decided by
whether the manager has added them to it. "Group 2 girl" means "a Group 2 student on the
Girls Team list", and the rule in §5.1 is written in exactly those terms.

**Group 1 can reach no extra at all**, so 400 and 550 buy nothing. **A Group 2 boy can
reach exactly one extra in the entire timetable**, so "unlimited per week" and "one per
week" resolve to the same three training days — he would pay 150 ₪ more for an identical
week. A Group 2 girl is not in that position: she can reach two, so 550 genuinely buys her
a fourth day.

This is a gap in the timetable, not a fault in the pricing. If the manager wants to sell
550 to seven-to-nine-year-old boys, the schedule needs a second session open to Group 2 —
opening one CrossFit session to them would do it.

### 5.1 The rule, not the special case

None of the above is hardcoded. One rule produces every row:

> **Offer a plan only if it raises the number of sessions this student could attend in a
> week.**

Formally, for student *s* and plan *p*, reachable(*s*, *p*) = 2 (base) + min(*p*.allowance,
count of extras *s* is eligible for) + 1 if *p* has an unlimited allowance and *s* is
eligible for a private session. Plan *p* is offered when reachable(*s*, *p*) is greater
than reachable(*s*, next-cheaper plan). It recomputes itself the moment the manager opens
CrossFit to another group.

A greyed plan is **shown with its reason, not hidden**. A Group 1 parent who hears "400"
from another parent in the hall and finds nothing in the app phones the manager; one line
of explanation answers the question before it is asked, and the plan turns itself on when
the child moves up to Group 2.

---

## 6. Schema

Three columns, three tables. Every new table inherits `TenantMixin` per M0.2.

### 6.1 Columns

| Column | Type | Meaning |
|---|---|---|
| `group.kind` | `varchar(10)`, not null, default `'base'` | `base` / `extra` / `private`, with a CheckConstraint and a module-level `GROUP_KINDS` tuple, following `GROUP_STAFF_ROLES` in `app/models/structure.py` |
| `group.is_invite_only` | `boolean`, not null, default false | §4.1 |
| `price_plan.weekly_extra_allowance` | `integer`, **nullable** | 300 → `0`, 400 → `1`, 550 → `NULL` = unlimited. The enforced rule. |

`price_plan.sessions_per_week` becomes **nullable**, where NULL means open membership. It
keeps the meaning its docstring already gives it — *a label on the plan, not a rule the run
enforces* — so that docstring stays true and the enforceable rule lives in the new column
beside it. The existing `sessions_per_week > 0` CheckConstraint tolerates NULL unchanged.

Deriving the allowance as `sessions_per_week - 2` and skipping the new column was
considered and rejected: it hardcodes "every base is two sessions", which is true this
season and is precisely the assumption §5.15's rollover breaks when the timetable moves.

### 6.2 `group_eligibility`

```
group_eligibility
  studio_id         TenantMixin
  extra_group_id    -> group   (kind='extra')
  base_group_id     -> group   (kind='base')
  unique (extra_group_id, base_group_id)
```

### 6.3 `session_booking`

```
session_booking
  studio_id             TenantMixin
  student_id            -> student
  session_id            -> session
  marked_by_person_id   -> person       (parent, adult student, or manager)
  cancelled_at          timestamptz null
  unique (student_id, session_id) where cancelled_at is null
  index (studio_id, session_id) where cancelled_at is null      -- the coach's roster
  index (studio_id, student_id) where cancelled_at is null      -- the allowance count
```

Pointing at `session_id` rather than at a week plus a group is deliberate. Sessions are
already materialised rows carrying `starts_at`, so the week bucket is derivable, the
coach's roster joins directly, and a cancelled or rescheduled session takes its bookings
with it rather than leaving them pointing at a slot that no longer exists.

### 6.4 `plan_change`

A plan change is scheduled, not immediate, so it must be recorded before it takes effect.

```
plan_change
  studio_id                 TenantMixin
  student_id                -> student
  from_price_plan_id        -> price_plan  (nullable: a first assignment)
  to_price_plan_id          -> price_plan
  effective_on              date          -- always the first of a month
  requested_by_person_id    -> person
  requested_at              timestamptz
  status                    scheduled | applied | cancelled
  applied_at                timestamptz null
  settlement_status         pending | settled    -- §11
  settled_by_person_id      -> person null
  settled_at                timestamptz null
  index (studio_id, status, effective_on)
  index (studio_id, settlement_status)
```

### 6.5 What does not change

`enrollment` remains the record of which base group a student belongs to.
`enrollment.attends_weekdays = NULL` still means every session of that group, which for a
base group is Tuesday and Friday. `group_schedule_rule` already holds the whole timetable.
`group.age_min` / `age_max` already hold the brackets. `student.price_plan_id` remains
where a student's plan lives. `app/main.py` and `app/models/__init__.py` mount by
discovery and are not edited.

---

## 7. Enforcement

Four checks, all in one service — `app/services/schedule/booking.py`. Routers stay thin.

1. **Allowance.** Count the student's live bookings for `extra` sessions whose local
   Jerusalem date falls in the same Sunday-to-Saturday week. Refuse if it would exceed
   `weekly_extra_allowance`. A NULL allowance always passes.
2. **Eligibility.** Refuse unless the student's base group is linked to that extra group
   in `group_eligibility` — or, for an invite-only group, unless the student holds a live
   enrollment in it.
3. **Private.** Refuse unless the student's plan has a NULL allowance. The rule attaches to
   `kind='private'`, so no additional column is needed. The `group.age_min` of 12 on the
   Saturday group carries the age half of the rule and is enforced by the same age check
   every group already has.
4. **Timing.** Refuse a mark or a release for a session that has already started, per §3.2.
   `app.core.clock.now()` is the only clock.

Every refusal names the reason and, where a higher plan would remove it, the plan.

---

## 8. Attendance and rosters

The new table meets existing behaviour along a clean seam:

| Session kind | Who is expected |
|---|---|
| `base` | from `enrollment` and `attends_weekdays`, exactly as today — no code path changes |
| `extra` | students holding a live `session_booking` for that session |
| `private` | students holding a live `session_booking` for that session |

A student who marked and did not come is absent, and enters the §5.14 denominators like any
other expected student. A student who never marked is not on the roster and enters no
denominator — which is correct: nobody asked them to be there.

`is_expected()` in `app/services/people/attendance_pattern.py` gains a branch on group
kind. It is not rewritten, and its pure-function, no-I/O contract is preserved: the caller
supplies the booking set the same way it already supplies the group's weekdays.

---

## 9. The API

All under `/api/v1/`. Financial fields stay manager-tagged except where §12 amends the
rule.

**Parent and adult student**

| Endpoint | Purpose |
|---|---|
| `GET /students/{id}/training-plan` | current plan, base sessions, this week's eligible extras with marked state, credits remaining, and the offer list from §5.1 |
| `POST /session-bookings` | mark a session — `{student_id, session_id}` |
| `DELETE /session-bookings/{id}` | release a mark |
| `POST /students/{id}/plan-changes` | request a change; the service sets `effective_on` to the first of the next month |
| `DELETE /students/{id}/plan-changes/{id}` | cancel a scheduled change before it applies |

**Manager and coach**

| Endpoint | Purpose |
|---|---|
| `PATCH /groups/{id}` | `kind`, `is_invite_only` |
| `PUT /groups/{id}/eligibility` | the base groups linked to an extra group |
| `GET /sessions/{id}/bookings` | who has marked, with a live count |
| `GET /plan-changes` | the settlement queue, §11 |
| `POST /plan-changes/{id}/settle` | mark the money handled |

`weekly_extra_allowance` is set when a plan is created. Price plans are versioned and never
edited in place — a change closes the old plan and opens a successor, which
`CatalogueService.close_price_plan` already does.

A worker in `app/workers/` runs daily and applies every `plan_change` whose `effective_on`
has arrived: it sets `student.price_plan_id`, releases future bookings that exceed the new
allowance (latest first, deterministically), writes `applied_at`, and records an audit
entry. `AuditService.record` is called for every plan change at request and at apply.

---

## 10. Parent app

One screen, `web/apps/parent/src/features/billing/`, reachable from home. Hebrew strings
live in the `billing` and `schedule` namespaces of `web/packages/i18n/he/` and are mirrored
in `en/` and `ru/`; `web/packages/i18n/index.ts` is not edited.

```
MY PLAN                                        400 ₪ / month

ALWAYS INCLUDED
   Tuesday    18:30–19:30    Judo Group 3
   Friday     15:30–16:30    Judo Group 3

THIS WEEK'S EXTRA SESSION            1 of 1 remaining
   ○  Sunday     16:00    Judo, ages 8-12
   ○  Monday     16:00    CrossFit for Judo
   ○  Wednesday  17:00    CrossFit for Judo
   Choose one. Resets every Sunday.

UPGRADE TO 550 ₪ — Open Membership
   Attend every session, every week — no weekly limit
   Includes Saturday private technique training
   [Upgrade]      takes effect 1 September
```

After marking, the chosen row shows a release control and the others grey out with the
reason and the upgrade offer. A greyed *plan* shows why it is unavailable for this student,
per §5.1.

Upgrade and downgrade are both self-serve and both take effect on the first of the next
month — access and price move together. There is no proration, no checkout, and no uPay
step: the monthly billing run raises the new amount as an ordinary charge and the parent
pays it on the payments screen they already use. A downgrade shows exactly which future
bookings will be released before the parent confirms.

---

## 11. The money side is a human task

Two of the club's three payment methods are **prepaid**, so a plan change cannot settle
itself:

- **Twelve cheques.** A full year at 300 ₪ is already written and held. An upgrade in
  November does not change eight undeposited cheques; someone must collect 100 ₪ × the
  remaining months.
- **Cash, three months forward.** 900 ₪ already covers September to November. Upgrading in
  October leaves 200 ₪ that no billing run will ever raise.
- **Credit-card standing order.** G8 in `app/models/billing.py` already documents why this
  is the hard one: uPay cannot create a per-payer mandate, so the tiers are *shared payment
  links* — the manager's letter says "links", plural. **The old 300 ₪ mandate keeps charging
  300 ₪ until a human cancels it** and the parent signs up on the 400 ₪ link.

So every `plan_change` lands in a manager queue with the instruction appropriate to that
family's method, and `settlement_status` stays `pending` until a human closes it. The
parent's tap changes access on the first; a person always closes the loop on money. This is
not a limitation to route around — it is the same reality that produced `recurring_
subscription` as "the manager's own note".

A gap worth closing in the same wave: `PAYMENT_METHODS` has no `cheque`. Cheques record as
`bank_transfer` today, which loses the fact that eleven more are pending.

---

## 12. What this amends in SPEC.md

**§5.10, line 284** — *"The manager sets the price... never visible as an input anywhere in
the parent app."* This feature reverses that sentence deliberately: the plan becomes a
parent-facing choice, and the parent app shows the three amounts. `price_plan_id` on the
manager-only student payload keeps its invariant-3 tagging; the new
`GET /students/{id}/training-plan` is a separate, parent-scoped shape that returns the
student's own plan and no other student's anything.

**§5.10's `price_plan` paragraph** — `sessions_per_week` is described as a label the
billing run does not enforce. It stays a label; the enforced rule is the new
`weekly_extra_allowance`, and the paragraph gains it.

**§4.3's `group` block** — gains `kind` and `is_invite_only`, and the three new tables.

---

## 13. Testing

- **Allowance arithmetic** — pure-function tests over the week bucket, including both DST
  boundaries, where a session stored on Saturday evening UTC belongs to the next local week.
- **Eligibility** — a nine-year-old placed in Group 2 is refused CrossFit; the same child
  in Group 3 is accepted. This is the case an age-derived rule would get wrong.
- **Private** — refused on 300 and 400, accepted on 550, refused under age 12 on every plan.
- **The offer rule** — one test per row of §5's table, asserting which plans a student in
  each group is offered. Group 1 offered only 300; a Group 2 boy offered 300 and 400; a
  Group 2 girl offered all three.
- **Downgrade** — future bookings above the new allowance are released on the first, latest
  first, and past bookings are untouched.
- **Rosters** — an extra session's roster is exactly its live bookings; a base session's
  roster is unchanged by anything in this document.
- **Tenancy** — bookings and plan changes are invisible across studios, per invariant 2.
- **Audit** — every plan change writes an entry at request and at apply.
- **Clock** — no `datetime.now()` is introduced; the existing build-failing test covers it.

Database tests fail rather than skip without a local database, per the project rule.

---

## 14. What this deliberately does not deliver

- **No booking for base sessions.** Tuesday and Friday are automatic. Marking exists only
  where the plan limits something.
- **No session capacity or waitlists.** The club's sessions are not oversubscribed. A cap
  is a nullable integer whenever it becomes real.
- **No proration.** A plan change moves on the first, whole.
- **No uPay checkout in the upgrade flow.** §11 explains why it would be a false promise.
- **No automatic recurring billing.** The provider cannot do it; the codebase already says
  so and this feature does not pretend otherwise.
- **No gender column on `person`.** §4.1.

---

## 15. Open items

1. **Release-and-remark policy.** §3.2 specifies free until the session starts, then spent.
   The manager has not been asked. If he prefers "once marked, final", it is one condition.
2. **Prepaid families** — cheques and cash forward no longer need a manual difference.
   `2026-08-27-prepayment-and-credit-design.md` makes the shortfall appear as an
   ordinary open charge, so §11's manager task applies to the standing-order route
   alone. That link still needs cancelling and resending by hand; nothing changes there.
3. **Does a plan change move access on the first, or immediately?** This document moves
   access and price together on the first, which is what "he pays 300 now, charge 400 next
   month" most directly implies. Unlocking access immediately would be a friendlier upgrade
   and costs the club roughly two sessions; it is a one-line change to the worker.
4. **Group 1, and Group 2 boys, can only ever be 300 ₪.** §5 explains why. This is a
   timetable decision for the manager, not a software one.
5. **Requiring 550 ₪ for the full Competition Team schedule** follows from the model rather
   than being designed in. It looks intentional and should be confirmed.
