# Finishing the join wizard, and the trial door

**Date:** 2026-09-05
**Follows:** `2026-09-05-join-wizard-redesign-design.md`, which specifies the four wizard
screens. Those are built and reviewed. This document covers everything still between them
and a family that can actually join.
**Status:** design agreed 2026-09-05, not started

---

## 0 · What is already done

The four screens exist under `web/apps/parent/src/features/onboarding/wizard/` and were
reviewed step by step against the owner's prototype. Door B (`/join/<token>`) runs on them
in `App.tsx`. Typecheck, lint and the parent suite are green.

What is NOT done is everything that makes those screens do something: the payment methods
are collected and discarded, three of the four doors still run the old flow, and the
strings have never left the feature folder.

## 0.1 · Decisions taken

| Question | Decision |
|---|---|
| **The trial door** | Door A stops being a wizard door. The landing page books a lesson and sends emails; the app is offered only *after* the lesson. §1. |
| **Trial identity** | The follow-up email carries an invitation token bound to the trial family, so a returning parent lands in door C with their child pre-filled — not as a second record. §1.4 |
| **Trial health** | The club's real declaration, with a single "is there anything we should know?" that records every answer as *no* when there is not. §1.2 |
| **Payment ordering** | Client-side, two phase, behind one button: register, then act on the charges it created. Credit forces a second phase regardless, so a server-side variant would buy nothing. §2.1 |
| **Standing orders** | Stay one mandate per child — uPay cannot mint a link at a stated amount. The screen becomes a checklist so it reads as a list being completed. §3 |
| **Doors C and D** | Move onto the new wizard. `SelfServeJoinFlow` retires. §5 |

---

## 1 · Door A — the trial

### 1.1 What changes

Today the landing page books a trial *and* offers the app on its confirmation screen, and
a trial family that installs sees a trial-shaped app. All of that goes.

The landing page becomes a booking form that ends in two things: a booked lesson and an
email. **It does not mention the app.** A stranger who has not yet had the lesson has no
reason to install one, and §6.5's install prompt moves from the confirmation screen to the
follow-up email.

### 1.2 The form

What it asks, and this is close to what it asks today:

- Parent: first name, last name, phone, **email**
- Child: full name, birthdate
- A group, filtered by whether the child's age fits it, and a session slot
- The three agreement ticks
- Health — see below

Never a national id and never an address. That was decided when door A was first built and
it stands: a stranger booking a free taster should not hand over a minor's national id.

**The email is now load-bearing.** It is the only channel by which this family ever hears
from the club again, so it is required rather than optional.

**Health collapses but does not shrink.** One question — *is there anything we should know
about your child's health?* Answering **no** records every question in the studio's real
`HealthFormTemplate` as `false` and stores a complete declaration, versioned like any
other. Answering **yes** opens the real form.

The saving is the parent's time, not the club's record. A declaration is stored either way.

**A flagged declaration notifies the manager**, naming the child and what was declared, so
somebody decides before the child is on a mat. The contents go in the notification and
**never into a log line or an `audit_log.diff`** — the standing rule for minors' health
data in this repo.

### 1.3 The two emails

**Immediately: the confirmation.** Day, time, address, what to bring. No app link.

**After the lesson: the follow-up.** `app/workers/followups.py` already runs this, already
distinguishes an attender from a no-show, and already carries a route in its payload. It
gains email delivery.

- **Attended** — "איך היה?" and a link to join.
- **No-show** — today's gentler message, and **no join link**. The worker already refuses
  to offer a join button to a family that did not come. Keep that.

The worker fires on days 1, 3 and 7. As in-app notifications that is fine; as email it is
three messages asking one question. **The email goes once, on day 1.** The existing cadence
stays for anyone who did install.

### 1.4 The token

The follow-up email's join link carries an `Invitation` — `intended_role='guardian'`, bound
to the lead Person and the trial Student. This is the row the manager's own invitation
already uses and door C already redeems, so no second claim mechanism is invented.

The parent taps it, signs in with Google, the token attaches their identity to the record
they already have, and **the full four-step wizard opens with their child's row
pre-filled**. Nothing is skipped.

**Expiry outlives the write-off.** `_sweep_the_lost` marks a booking `lost` after
`LOST_AFTER_DAYS`. The token expires no sooner, so a family returning on day 20 lands in
the right place rather than on a dead link.

### 1.5 The consequence worth noticing

**Door A is no longer a wizard door.** A trial family returns through **door C**. There is
no anonymous wizard mode, no three-step variant, and no fourth step list. The work reduces
to: a form, two emails, a token — and doors C and D.

### 1.6 What this leaves stranded

`TrialHome` and `everyChildIsOnATrial` in the parent app assume a trial family that
installed. Under this design none does. **Leave them.** Families already mid-trial on
production may have the app, and deleting a screen they can still reach is a worse failure
than an unused component.

---

## 2 · Payment methods that act on the choice

### 2.1 Why it is two phase, and why that is not a compromise

A promise names *specific open charges*. Those charges do not exist until `register` runs —
`charge_first_month` fires inside that write — and `OnboardingRegisterOut` returns
`charges_created` as a **count, not ids**.

A server-side variant, carrying the methods in the register payload, would let the promise
methods settle inside one transaction. It buys nothing, because **credit cannot settle
there either way**: a card is charged by showing uPay's page to a human. Credit is two
phase no matter what, so the whole step is two phase, and one mechanism beats two.

The old flow already does exactly this — `PaymentSetup` renders only once `registered` is
true. The wizard does the same, behind one button.

### 2.2 The sequence

Step 3's final button runs, in order:

1. `POST /onboarding/{token}/register` — the single write. Family, children, enrolments,
   plans, declarations, first charges.
2. `GET /me/charges?status=open` — the ids the promises and the order need, matched to
   children by `student_id`.
3. **Credit children:** one `POST /me/payment-orders` over all of their charges together,
   then `orderForm`, then the payment frame. Money is held per payer, so one checkout
   settles every card child and a three-child family enters a card once.
4. **Cash and cheque:** one promise per method over those children's charges.
5. **Standing order:** a promise *and* a mandate. The promise is written with
   `method='standing_order'` so the manager sees money **expected rather than collected**
   — our provider cannot create a mandate programmatically, so nothing is charged here —
   and the parent signs the mandate itself at uPay, one per child. See §3.
   `already_paid` is split into its own promise: a parent's self-reported claim must not
   be merged with the ordinary "expect this to clear" row.

Step 4 is reached when every child is accounted for.

### 2.3 If it breaks in the middle

Registration has landed and a promise has not. The family exists, is charged, and the club
does not know they said cash. **This is recoverable and must not be papered over:** the
payments screen already lets a parent say "cash" over open charges, so the state is a
normal one the product handles. Step 4 must not claim a payment arrangement was recorded
when the call failed — show what did land and what did not.

### 2.4 What comes back

`JoinShell` gives back the billing client, the privacy client and the standing-order
mandate fetch, which were removed when nothing consumed them.

---

## 3 · Standing orders read as a checklist

uPay cannot mint a link at a stated amount — confirmed with the owner, 2026-09-05. A shared
link carries a fixed amount and `standing_order_link_url` hangs off the **price plan**, not
the family. Two children on the ₪400 plan therefore point at the same link, and signing it
once sets up ₪400 a month rather than ₪800. **They must sign twice, or the club
under-collects for the second child every month.**

So the money does not change. The screen does.

Instead of a form that reappears, step 3 shows the mandates as a list with state:

```
הוראת קבע — 2 הרשאות להסדרה
  איתי לוי   ₪400   ✓ הוסדר
  מאיה לוי   ₪400   ○ להסדרה
```

Each row opens the same link in the payment frame; returning marks that row done. A family
sees two known items being completed rather than one form repeating for no visible reason.

**Multi-child families are told card is one form.** When a family has two or more children
and reaches for הוראת קבע, say plainly that card would be a single checkout — then let them
choose. Never refuse.

**Worth asking uPay.** If their API can ever create a link at a given amount, one mandate
per family becomes possible and this section collapses to a single row. It changes nothing
a parent sees except the number of forms, so it can land later without redesign.

---

## 4 · Group cards

`OnboardingGroupOut` returns `id`, `name`, `class_name`, `weekdays`. The card is drawn for
six facts: name, level, days, lesson length, coaches, location.

`toWizardGroup` in `adapters.ts` currently degrades honestly — it renders what is known and
omits the rest rather than inventing it. **Add the three missing fields to the API response
and delete the degradation.** Plumbing, not design.

The same three fields are needed by door C and D's own group step, which reads the studio's
public catalogue rather than the onboarding token's, so both responses gain them.

---

## 5 · Doors C and D

Both move onto the new wizard and `SelfServeJoinFlow` retires.

What differs between them is unchanged and must survive the move:

- **Door C** (`/?invite=<token>`) — one row pre-filled with the manager's stub name. Now
  also the door a returning trial family arrives through (§1.4).
- **Door D** (`#/add-child`) — an existing family adding a sibling.

**Door D shows only the child being added.** This is already the behaviour and is being
confirmed rather than changed: health and payment are scoped to the students *this run*
creates, and `PaymentSetup` builds each row from that child's own charges. A family adding
a fourth child sees one child and one price; the other three children's open balances stay
out of it. The new wizard inherits this by construction — its student list *is* the list it
just built — and a test must pin it, because it is the kind of thing that breaks quietly.

**The agreements step is skipped, not absent.** `doorSteps.ts`'s `startingStep` reads
`/me/onboarding-status` and opens past step 1 when the consents are current. It reappears
when a terms version moves. That mechanism moves across unchanged.

---

## 6 · The manager-review gate

Specified in the previous document's §8 and still unbuilt. Four things:

1. `register` writes `Enrollment.status = 'pending'` for a flagged child instead of the
   literal `'active'`.
2. `charge_first_month` does not fire for that child.
3. A reason **code** is recorded — never the answers.
4. The dashboard's alert centre gains a row type, plus a push, so a Friday-evening
   registration is not left until Sunday.

Nothing downstream changes. All 17 reads of `Enrollment.status` already exclude `pending`,
14 by filtering `'active'` outright and three through constants that are also `('active',)`
— each carrying a comment saying why a pending child is not on a mat.

§1.2's trial flag reuses this path.

---

## 7 · Strings

Every Hebrew string lives in `wizard/content.ts`, which was always an interim home. They
move to `web/packages/i18n/he/` under the existing namespaces, mirrored into `en/` and
`ru/`, neither of which exists for any of this text yet.

Mechanical, large, and the only item here safe to hand to a subagent — file to file, with a
named source and a named target.

---

## 8 · Order

1. **Payment methods** (§2). The only item where the current state actively misleads a
   family: they choose cash and are charged anyway.
2. **Group cards** (§4). Small, and doors C and D want it.
3. **Doors C and D** (§5). Retires `SelfServeJoinFlow`.
4. **Manager-review gate** (§6). Backend, then the badges already drawn for it.
5. **Door A** (§1). Blocked on SMTP.
6. **Strings** (§7). Last, so nothing is translated twice.
7. Delete `wizard-preview.html`, `wizard-preview.tsx` and `wizard-preview-fixtures.ts` once
   the wizard is mounted for real, and retire `JoinFlow`, `SelfServeJoinFlow` and
   `BookingFlow` as each door lands.

## 9 · Prerequisites and risks

**SMTP is unset in production.** §1 is entirely email-carried and delivers nothing until
that is configured. It is a blocker for door A and for nothing else, which is why door A is
fifth rather than first.

**No health content in logs or audit diffs.** §1.2's manager notification and §6's reason
code both touch this. It is the rule most easily broken by a helpful debug line.

**uPay has no sandbox.** Every form the code builds is a live one against a live merchant
account, and a demo studio is refused a form outright. §2's order path cannot be exercised
end to end without a real order; the IPN simulator is the substitute, and the completion
signal from the payment frame remains the one part never proven end to end.
