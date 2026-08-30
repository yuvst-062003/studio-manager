# Trial to member — the journey, and the three holes in it

**Date:** 2026-08-30
**Status:** approved in brainstorming, not yet implemented
**Owner decision:** both the parent and the manager can start the joining

## The problem

A parent books a trial from the landing page. The child comes. They love it.

Then nothing happens, unless a manager notices and acts.

Everything needed to prompt that family already exists and every prompt is a dead
end:

* `TrialHome` shows **איך היה?** after the lesson — with nothing to press.
* `app/workers/followups.py` sends `trial.followup` on days 1, 3 and 7, titled
  **איך היה?**, body **נשמח לשמוע מכם** — with no link and no action.
* After the window closes the same worker marks the student `lost`.

So the product asks a family whether they enjoyed themselves, three times, and
offers them no way to answer. The only route in is a manager opening the student
card and converting by hand.

Three further defects surround it, two of them created by the 2026-08-30
self-enrolment change:

1. **A trial parent cannot use the club's join link.** `OnboardingService.register`
   refuses when a Person already exists for that auth identity, returning
   `already_registered: true` and creating none of the children. Booking a trial
   creates exactly that Person. So the club's most natural funnel — try it, like
   it, get sent the link — silently does nothing.
2. **No duplicate check on any self-service door.** `possible_duplicate_students`
   runs only on the registration-request detail view, whose sole producer was
   removed. A trial parent using `+ הוסף ילד` creates a second student for the
   same child: one `trial`, one `active`, both on the roster.
3. **An unpriced child is recorded where nobody looks.** `_charge_one` appends to
   `tally.unpriced` when no plan matches; the tally lands in `billing_run.log`,
   which no router, worker or screen reads. A child whose groups total three
   sessions a week in a club selling 1 / 2 / unlimited trains all year and is
   never billed.

## The shape

**One finishing line, two entrances.** However a family arrives, they end in the
same sequence, which already exists and does not change:

```
health declaration  ->  payment method per child  ->  pay
```

What changes is how they reach it.

## Entrance A — the parent

### The prompt gains a destination

* `TrialHome`'s **איך היה?** gains a **הצטרפות למועדון** action.
* `trial.followup`'s payload gains a route to the same screen. The push copy stops
  at "we would love to hear from you" today; it will name the action.
* **`trial.no_show` is untouched.** The worker already sends a no-show a different
  message, on the stated ground that "איך היה?" to somebody who did not come is
  worse than silence. Offering that family a join button is the same mistake with
  money attached.

### Choosing groups

The picker opens with **the group they trialled already ticked**, and every other
public group available to add. Owner decision: the parent picks. A manager may
tell them afterwards to add a second group — that conversation is not the app's
job to prevent.

`is_invite_only` and `is_active` are enforced, as they now are on every enrolment
path (`OnboardingService.add_child`).

### What confirming does

**It converts the student who already exists.** This is the load-bearing decision
of the whole design: reusing `add_child` would create a second record for a child
already on the roster, which is defect 2 caused deliberately by the feature meant
to fix it.

In one transaction:

1. `trial -> active` (the status transition runs first, so an illegal move refuses
   before an enrolment is written).
2. An `Enrollment` per chosen group.
3. `student.price_plan_id` from **weekly volume across the chosen groups**, by the
   rule in *Pricing* below — the same rule every enrolment path uses.
4. The first charge, through `BillingRunService._charge_one`, which already
   prorates a first month by remaining sessions.
5. Open trial bookings close with outcome `converted`, so the `lost` sweep will
   not later contradict the join.

`health_status` is **not** promoted. §5.4a: "the trial declaration is not
sufficient for enrollment — converting requires the full form." The existing gate
then collects it, which is the first step of the finishing line.

### The new endpoint

`POST /me/students/{student_id}/join` — the caller must be a guardian of that
student, the student must be `trial`. Body: `group_ids` (plural, at least one).
No price in the body; the server derives it.

It cannot reuse `POST /students/{id}/convert`: that is `ManagerOrOwner`, takes a
single `group_id`, and takes a manager-chosen `price_plan_id`.

## Entrance B — the manager

Unchanged in shape, and already works: the manager converts from the student card,
choosing group and price; the parent opens the app, is already active, and
finishes health and payment. This is the "even sent the plan for him" the owner
described — the manager has decided the plan, and the parent only finishes and
pays.

**One thing is missing and it breaks that sentence.** `StudentService.convert`
raises no charge. `register` raises the first month immediately; conversion does
not. A child converted on the 12th is active, enrolled and priced with nothing to
pay until the 1st, so the payment step stands itself down and the parent is never
asked for money.

Both entrances will call the same first-charge path.

## Pricing: what is chosen and what is derived

Two questions that are easy to conflate:

* **How much** is never chosen by a parent. It is derived from the groups they
  tick — total sessions per week decides the plan.
* **How to pay** is always chosen by a parent: card, cash, cheques or הוראת קבע,
  per child, on the payment step. That step shipped 2026-08-30 and is untouched
  here.

### The matching rule changes

`PricePlan.sessions_per_week` is documented in the model as "a label on the plan,
not a rule the run enforces — the manager picks the plan". The self-service lanes
turned that label into the assignment rule, because there is no manager in them,
and required an **exact** match: `sessions_per_week == volume`, with exactly one
live plan matching. Zero or two matches left the student unpriced.

That is brittle in a way that costs the club money silently. A club selling 1× at
300, 2× at 400 and unlimited at 550 has no plan labelled 3, so a child ticking
three groups' worth of training gets **no price and no charge** — and trains all
year for nothing, recorded only in a log nobody reads.

The rule becomes: **the cheapest live plan whose `sessions_per_week` is at least
the child's volume.** If the volume exceeds every plan, the plan with the greatest
`sessions_per_week`. Ties resolve by amount, then by id, so the choice is
deterministic and a re-run picks the same plan.

Three consequences, stated deliberately:

* A child can now be priced **above** their exact volume — three sessions on the
  unlimited plan. That is the club selling the smallest package that covers them,
  and it is correctable: the price is on the student card and the plan-change flow
  exists. The alternative was free forever.
* **Over-charging is visible; under-charging to zero is not.** A family billed 550
  who expected 400 says so within the month. A family billed nothing says nothing,
  and neither does the product.
* **Unpriced is still possible** — a club with no live plans at all — so defect 3's
  visibility still matters. It stops being the normal outcome of an ordinary
  timetable.

This changes `register` and `add_child` as well as the new join path. One rule on
every door is the point; two would be the same class of bug this spec exists to
close.

## The three defects

### 1. A trial parent can use the join link

`existing_registration` answers "does this identity already have a Person here",
and `register` treats that as "this family is already registered". Those are
different questions, and the difference is exactly a trial family.

The guard becomes: **do not duplicate the parent; do add the missing children.**
An existing Person is adopted as the parent, and each submitted child runs through
`add_child`. A resubmission of children who are already on the account remains a
no-op — the duplicate check below is what decides that.

### 2. The duplicate check moves to where parents are

Same first name, last name and birthdate as an existing student in this studio →
the write is refused with a code the app can explain, offering the parent the
existing child instead of a second copy. On the join path (entrance A) the child
being converted is by definition the existing one, so the check does not apply.

This is the one genuinely valuable thing the approval queue did.

### 3. Unpriced children become visible

Surface active students with `price_plan_id IS NULL` on the collections screen,
where a manager already goes to ask "who owes what". A child nobody can bill
belongs in the same view as a child who has not paid.

The billing run keeps writing `tally.unpriced`; this adds a read that a human
reaches.

## What gets deleted

The registration approval queue: `RegistrationService.submit_from_parent`, the
approve and reject routes, and the dashboard panel. Its only producer of pending
rows is gone, and its one useful behaviour moves to entrance A's neighbourhood.

**The `registration_request` table stays.** The trial funnel writes a row there —
`status="approved"`, `reviewed_at` set, no reviewer — as an encrypted holding pen
for trial health answers, because it is the only column in the schema built to
hold a minor's data at rest. That is a different use of the same table and is
untouched.

## Testing

* A trial parent taps join, picks two groups, and ends `active` with **one**
  student record, two enrolments, the two-a-week plan, and a prorated first charge.
* A no-show is offered no join action, and their follow-up message is unchanged.
* A trial parent given the join link gets their children created, not
  `already_registered` with nothing.
* Adding a child who matches an existing student by name and birthdate is refused
  with a code, and creates nothing.
* A manager conversion raises a first charge, so the payment step has something to
  show.
* A child whose volume matches no plan exactly is priced at the cheapest plan that
  covers them, not left unpriced.
* A child whose volume exceeds every plan is priced at the largest plan.
* A studio with no live plans at all leaves the student unpriced, and they appear
  in the unpriced list.
* `is_invite_only` is refused as not-found on the join path, as on every other.

## Out of scope

* Any parent-facing way to choose a price directly. The groups are the choice, and
  the payment METHOD is the parent's — see *Pricing*.
* Changing what `sessions_per_week` means on the plan. It stays a label the manager
  sets; only the self-service matching rule around it changes.
* Reworking `TrialHome`'s content beyond adding the action.
