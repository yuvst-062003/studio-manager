# The four doors and one wizard — onboarding spec

**Status:** agreed, not started. No code has been written against this document.
**Date:** 2026-09-03
**Supersedes:** `2026-09-02-parent-onboarding-wizard-redesign.md` and the implementation
plan `docs/superpowers/plans/2026-09-03-onboarding-wizard-redesign-implementation.md`,
both of which describe a four-step wizard that writes to the server mid-flow and lives
only at `/join/<token>`.
**Design reference:** `docs/design/proposals/parent-onboarding-redesign.html` — still the
visual reference for the screens; its *five*-step spine and its "the price is not asked"
rule are both superseded below.

---

## 1. Why this exists

There are four ways into the club and they share nothing:

| # | Door | Today |
|---|---|---|
| 1 | `/t/<slug>` | `BookingFlow`, 4 steps, its own rail, anonymous, creates a lead + `TrialBooking` |
| 2 | `/join/<token>` | `JoinFlow`, 4 steps, its own chrome, creates children `active` + priced + charged |
| 3 | `/?invite=<token>` | **no wizard at all** — `AccessGate` redeems, then the app-level `ConsentGate` → `HealthGate` → `PaymentSetupGate` stack |
| 4 | `#/add-child` | 3 fields, no chrome, no rail; enrols `active` immediately |

Four shells, four progress rails, four back-button behaviours — and no shared answer to
the question every one of them has to ask: **"which steps has this family already
finished?"** Each screen re-derives it from a different scatter of facts (`student.status`,
`health_status`, `agreement_complete`, `price_plan_id` being null, consent records,
`trial_booking.attended`, `session.access.parent`). That disagreement is the cause of the
dead end where a parent signs the same health form forever and never reaches payment.

---

## 2. Decisions taken (2026-09-03)

Each of these was decided by the owner in session. They are not open.

### Architecture

1. **One wizard, four step lists.** All four doors use one set of screens. The *door*
   decides which steps exist; a *status* decides which are still needed; the wizard opens
   on the first one still needed. If nothing is needed it does not open at all.
2. **Nothing is written until one final button.** Steps 1–3 and the payment summary write
   nothing. Everything lands in a single transaction on "אישור ומעבר לתשלום". Back and
   forward work freely across every step the parent typed into.
3. **The draft lives in `localStorage`,** keyed per token. It is the only copy of the
   registration until submit, so it must survive a closed tab. Cleared the moment the
   submit succeeds, and on sign-out.
4. **On finishing, the parent sees their groups immediately.** The final write returns the
   students and enrolments it created; the wizard stores that as a first snapshot and
   reloads the session, so the home screen draws at once and one API request fills in the
   live schedule behind it.
5. **Every door shows the welcome screen and all three agreements.** No door has a reduced
   document set. A trial is still the club taking a minor's health declaration, so the
   privacy policy is not optional there, and the club's own terms are what a family is
   walking into whether or not they pay this week. A door only skips the step when the
   *status* says this person already agreed to the current versions — the same rule that
   skips any other finished step.
6. **The wizard only ever asks about the students it is creating in this run.** Health and
   payment are scoped to those students and no others. A parent adding a fourth child
   signs one declaration and sees one price — never the whole family's. If a child already
   on the account owes something, that is the app's own gate's job, not the wizard's.
   See F19: this is not how it behaves today.

### Content

7. **One health form for everybody.** The short trial template is retired. Two reasons, and
   the second is worse than the first. It omitted the cardiac screen — chest pain, fainting,
   family sudden death — from the one person the club has never met. And the landing page
   never used it anyway: its "health declaration" asks **zero** questions and posts a
   hardcoded `{confirmed: true}` per child (F21). With the new popup a healthy child is one
   tap, so the old "don't scare a stranger with 20 questions" argument no longer holds, and
   a trial family stops filling a health form twice.
8. **A trial asks for:** a contact block — name · phone · email — then, per student, full
   name · birthdate · group · **מועד** · emergency phone. **Not** ת.ז., **not** address:
   those are a *member* record, and a stranger booking a free lesson should not hand over a
   minor's national ID. Birthdate stays because it filters the group list to groups the
   child may legally join; emergency phone stays because it is the only thing that matters
   on the mat. Group **and slot** are both per student, and both live in that student's own
   panel — the slot list is filtered by the group chosen directly above it.
9. **There is no "you and your children" split, on any door.** Every students step is a
   contact block and then **one list of students**, and the person filling the form may be
   one of them: `אני מתאמן/ת` adds them as a student and reuses the name already given. An
   adult training alone never meets a screen about children, and a parent never types their
   own name twice. This is what `BookingFlow`'s separate "you" and "children" steps get
   wrong today, and it is why an adult booking a trial for themselves currently cannot
   avoid a children step.
10. **Step 1 is three cards of identical shape:** one document · one link · one popup · one
   tick. The club card is titled **תקנון ותנאי תשלום** and the three payment clauses *are*
   that document — there is no separate regulations text and none is pending.
11. **The club logo appears on the welcome screen and in each popup header.**
12. **The 18+ question is gone from the wizard.** The birthday is always asked, so the age is
   derived and the parent/pickup fields appear only under 18. It survives on the *manager's*
   add-student form, which has no birthday field.
13. **The typed-full-name field under the signature pad is deleted.** Drawing only.
   Consequence, accepted: a keyboard-only parent then cannot sign, and the health
   declaration blocks the whole app. Mitigation is a line in the accessibility statement
   telling them to call the club, who complete it for them.
14. **Each student picks their own plan** in the students step. This replaces "the price is
   not asked, because it is already decided".

### Money

15. **הוראת קבע is one frame per child.** A uPay shared link charges a *fixed* amount, so
   two children at the same price still need two mandates. Presented as a queue on the done
   screen — after the write, which is the only point at which the links can exist. **A child
   marked "כבר שילמתי · הוראת קבע" is not in that queue**: they have said the mandate
   already exists, and handing them a link to create a second one is how a family ends up
   paying twice a month.
16. **Mixed methods in one family:** card children → **one** frame (money is held per payer);
   הוראת קבע children → one frame each; cash/cheque → no frame, a promise the manager settles.
17. **"כבר שילמתי" is a fifth answer to "how do you pay", and it is offered up front.** A
   family who handed the manager cash last week must be able to say so *before* they read a
   price, or they arrive at the payment step afraid of being charged twice. It is a
   **tense**, not a method — `already_paid` changes no arithmetic and settles nothing, it
   only tells the manager to go looking for the money now rather than wait for it — so
   choosing it asks one follow-up, **איך שילמתם?**, and stores `method` + `already_paid:
   true`. Card is not offered in that follow-up: a card payment made in the app already
   has a record. See F20 — today this exists for הוראת קבע children only.
18. **The write groups promises by `(method, already_paid)`, never by method alone.** A
   claimed payment and an expected one, both cash, are two promises — merging them would
   file the claim as `already_paid: false` and lose it. `recordStandingOrder()` already
   splits this way and explains why; `tellTheManager()` does not, which is the second half
   of F20.
19. **A claim is never shown as settled.** Every "כבר שילמתי" row reads
   *כבר שולם · ממתין לאישור המועדון*, visibly different from a paid row. The manager
   confirms it from their own reconciliation queue. A screen that reads "done" leaves the
   parent thinking they are finished and the club thinking they owe — which is worse than
   not offering the option at all.

### The manager's side

20. **`AddStudentScreen` becomes student-first and three fields:** full name · 18 ומעלה? ·
   guardian email. Everything the manager leaves empty, the parent fills in the wizard.
   "18+" means self-guarding: the student *is* the guardian and the email is theirs.
21. **The invitation reaches the parent two ways** — a copyable link (works today) *and* an
   email. The email half stays dark until `SMTP_PASSWORD` is set on production; that must be
   visible in the UI rather than silent.

### Legal copy

22. **The cheque payee changes** from `עמותת מכבי נתניה סיף ואגרוף` to **`בריין בילדינג (ע״ר)`**.
   Six strings: three i18n (`he`/`en`/`ru` `health.ts`, the screen) and three in
   `app/services/health/club_terms.py` — **the copy rendered into the signed PDF**. Two
   tests assert the old name.
23. **Apple is removed from the privacy policy.** `/auth/providers` returns Google only on
   staging *and* production; `AppleProvider` exists in code but has never been configured,
   so no parent has seen the button and no data has reached Apple. Three strings
   (`he`/`en`/`ru` `reports.ts`).
24. **Both version constants are bumped** — `CLUB_TERMS_VERSION` 1 → 2, `POLICY_VERSION`
   1 → 2 — because both modules state the rule: change the text, raise the version, every
   family is asked again. Approved because there are no live users yet; the cost of this
   decision only grows.

---

## 3. The doors

**The rule, once:** the door decides which steps exist. The status decides which are done.
The wizard opens on the first step still needed.

That status comes from one new read, `GET /api/v1/me/onboarding-status`, returning the step
list and which are complete. It replaces four screens each guessing from a different pile of
facts.

| Door | Who arrives | Already exists | Steps | Ends at |
|---|---|---|---|---|
| **A** `/t/<slug>` | Stranger from the website | Nothing | agreements · students *(trial set; group **and slot** per student)* · health | "You're booked" |
| **B** `/join/<token>` | Stranger from WhatsApp | Nothing, *or* a trial family | agreements · students *(full + plan)* · health · **payment** | The app |
| **C** `/?invite=<token>` | Manager typed them in | The student, name only | agreements · students *(one row pre-filled)* · health · **payment** | The app |
| **D** `#/add-child` | Existing parent | Parent, address, ת.ז., all consents | agreements *(skipped)* · students *(one child)* · health · **payment or slot** | The app |

**The agreements step is on every door.** No door omits it. Door D's parent has already
agreed, so the *status* marks it done and the wizard opens past it — the same mechanism
that skips any other finished step, not a special case. If a version has moved since they
agreed, it reappears.

### A — the trial link (`/t/<slug>`)

`BookingFlow.tsx` is retired. The landing page keeps its marketing sections; the **booking
form inside it becomes the wizard**, with the trial step list. It is the door whose form
diverges most from the wizard today, and the divergence is not only cosmetic — see F21.

#### What it asks today, and what it will ask

| | Today (`BookingFlow`, 4 steps, own rail) | The wizard, trial list |
|---|---|---|
| — | *no agreements at all* | **agreements** — welcome, logo, three cards, three ticks |
| you | **a step of its own:** first name · last name · email · phone | **not a step.** A small contact block above the list: name · phone · email |
| children | **a second step**, "add a child" | **one list, `+ הוספת תלמיד`** |
| per student | first name · last name · birthdate · group | full name · birthdate · group · **מועד** · emergency phone |
| health | **one checkbox, zero questions** | **the full form**, per student, through the popup |
| slot | **a fourth step** | **inside each student's panel**, under the group that filters it |

**There is no "you and your children" split.** It is one list of students, and the person
filling the form may be one of them — `אני מתאמן/ת` adds them as a student, reusing the name
already typed in the contact block. An adult booking a trial for themselves therefore never
meets a "children" step, which today they cannot avoid.

**Group and slot are already per student today** (`BookingFlow.tsx` — `children.map` over
both, and `StudentCreate.group_id`'s own note says §5.4a asks both per child). What changes
is *where* they live: in the student's own panel instead of split across two steps, so a
parent picks a group and a time for one child in one motion rather than picking groups on
one screen and being asked for times two screens later.

The students step asks the trial set and nothing more (decision 8): **no ת.ז., no address**.
Those are a member record, and this family has not joined anything.

#### Anonymous booking survives, and so do the agreements

The owner's 2026-08-31 decision stands — a first lesson is booked the way every club books
one, with a form and no account. Decision 5 does not contradict it. An anonymous booker
still reads and ticks the three documents, and the consent attaches to the identity-less
lead `Person` the booking creates. When they later sign in with the same provider-verified
address, §6.1 step 3 attaches them to that same `Person` and the consents come with it.

The health declaration lands where it already does — encrypted in
`registration_request.payload_encrypted`, with `student.health_status = 'trial_signed'` —
only now it contains answers.


### B — the WhatsApp link

Three cases, told apart by the status:

- **Brand-new family** → opens at step 1, walks all four.
- **Trial family** → opens at step 1 with their trial child already in the list and a
  "המשך כחבר מן המניין" tick. They fill only what a trial never asked: ת.ז., address,
  second parent, pickup, groups, plan. The full health form is still needed — the trial one
  was a different document. **Not** an error, **not** a redirect: this is the club's best
  funnel and the server already adopts an existing parent rather than refusing
  (`app/routers/onboarding.py:301`).
- **Existing member** → opens at the students step; agreements already given, so that step
  does not exist for them.

### C — the manager's invitation

The invite is redeemed on arrival and the session reloads — this already works
(`AccessGate.tsx:41`). Because the manager now enters almost nothing (decision 20), almost
everything is a gap — so **Door C is Door B with one row pre-filled**, not a separate
"gaps only" step list. Two doors, one step list.

### D — add a child (`#/add-child`)

The one door used by someone who is already a customer, so it is the one door where almost
everything is already known. It is also the door that today writes the most on the least
information — see F18.

**What the parent already has:** their account, name, verified email, ת.ז., address, city,
phone, all three consents, and at least one student already on the roster whose second
parent and pickup contacts are on file.

**It opens straight into the wizard, at the students step.** There is no separate
add-a-child screen and no fork screen in front of it — the parent taps `+ הוספת ילד` and is
in the same wizard, on step 2, with one empty panel already open. Everything from there is
the ordinary flow.

**Member or trial is a control inside that panel,** not a screen of its own:

| | |
|---|---|
| **הצטרפות למועדון** | ת.ז. · plan asked · health · **payment** |
| **שיעור ניסיון חינם** | no ת.ז. · no plan · health · **slot** |

**The agreements step is skipped, not absent.** The consents are already given, so the
status marks the step done and the wizard opens past it. It reappears only when
`CLUB_TERMS_VERSION` or `POLICY_VERSION` has moved since this parent accepted — exactly the
case decision 24 creates.

**Health and payment show only the new child** (decision 6). Not the siblings, not the
family's other outstanding money. One declaration to sign, one price to look at. This is
not how the wizard behaves today — see F19.

**The students panel is one child, pre-filled where it honestly can be:**

- Last name defaults to the parent's.
- **Second parent and pickup default to "אותם פרטים כמו [שם האח/ות]", already ticked** —
  the parent gave these for an existing child and re-typing them is the friction this door
  exists to remove. Untick to enter different ones.
- Birthdate and ת.ז. are asked; there is nothing to copy them from.
- Age is derived from the birthday, as everywhere (decision 12).
- Groups, then plan — only plans covering the groups chosen.
- **"אני מתאמנ/ת גם"** is available here too: a parent who decides to train alongside their
  child adds themselves as a student, and their name, ת.ז. and address are already known.

**The duplicate check must run in the students panel, not at the final write.**
`add_child` raises `DuplicateStudentError` for a child already on the roster. Under
"nothing is written until the end" that refusal would arrive *after* the parent had filled
a health declaration and chosen a payment method — a dead end with nothing to read. So the
name-and-birthdate check fires as soon as the panel is saved and says so there. This is
CLAUDE.md's own rule: refuse rather than accept, when accepting creates a dead end.

**The write is still one transaction at the end**, same as every other door. What lands
depends on the fork: a member path writes the student, enrolments, plan, first charge and
the declaration; a trial path writes the student as `trial`, the booking and the
declaration, and raises no charge.

**After it finishes:** member path → the sibling is on the home screen with their groups
immediately (decision 4). Trial path → the "You're booked" screen, and the child sits as
`trial` until the lesson happens.

**The trial half is dead until F17 is fixed.** `has_used_a_free_trial` counts per guardian,
so a parent whose first child already had a trial is refused for the sibling. That is why
F17 is in wave A, long before this door is built.

### Redirect rules

- Token expired / revoked / never existed → the "הקישור אינו בתוקף" screen. Unchanged.
- Not signed in → the **shell** shows the sign-in wall above the wizard, with the club's
  logo and name. Never inside step 1 (see finding F1).
- Signed in, nothing left to do → skip the wizard, go to the app.
- Finished → the app, groups already on screen (decision 4).

---

## 4. The wizard

```text
1  agreements   ─┐
2  students      │  nothing written
3  health        │  back and forward, any step, any order
4  summary + how to pay  ─┘
         ↓   "אישור ומעבר לתשלום"  ← ONE transaction
Done  +  payment frame(s)
```

The single call carries: consent, club terms, the parent, the students, the enrolments,
the plans, the first charge, and every health declaration. The only irreversible moment is
the last button.

**Health drafts are keyed by the local student row id**, not a server student id. This is
what removes the need to ask the server "list my children" mid-wizard — and that question is
finding F9.

### Step 1 — agreements

Club **logo** and name, then "לפני שנתחיל" and a line saying why. Three cards:

| Card | Contents |
|---|---|
| תנאי שימוש | version · 3-line summary · **קריאת המסמך המלא ›** · tick |
| מדיניות פרטיות | version · 3-line summary · **קריאת המסמך המלא ›** · tick |
| תקנון ותנאי תשלום | "פעם אחת, עבור כל המשפחה" · what's in it · **קריאת המסמך המלא ›** · tick |

Each link opens a **popup over the screen** with the full document and a close. Reading
never costs the parent their place, and the ticks survive it.

### Step 2 — students

The signer's own details at the top: name and email from the sign-in (read-only), then
ת.ז., address, city, phone.

Then an empty list and **"הוספת תלמיד"**. Each tap opens one student's panel:

1. Full name · birthdate · ת.ז.
2. *(age derived from the birthday — no 18+ question)*
3. **Under 18 only:** second parent + pickup contacts, with **"אותם פרטים כמו הקודם"**
   when a previous minor exists
4. Groups
5. **Plan** — only plans that cover the groups chosen, the matching one preselected
6. Save → back to the list → add the next

### Step 3 — health, per student

1. **"יש משהו שכדאי שנדע?"** — אין מגבלות / יש משהו
2. **A popup opens either way** — pre-marked "לא" for the first, blank for the second.
   Scroll, confirm at the bottom, close.
3. **Summary** — how many answered כן, how many לא, and tapping it **reopens the popup**
4. קופת חולים *(now required)* + טלפון חירום
5. The declaration sentence — derived from the answers, never chosen — and the tick
6. **Signature.** Drawing pad only.

### Step 4 — summary and payment

**One screen, not four.** The prices are already known (decision 14), so nothing here waits
on the server until the last button.

```text
כבר שילמתם למועדון? אין צורך לשלם שוב.        ← read before any number
סמנו "כבר שילמתי" ונעדכן את המועדון.

דנה כהן    ילדים א׳ · פעמיים בשבוע      ₪300
יוסי כהן   ילדים ב׳ · פעמיים בשבוע      ₪300
                                    סה״כ ₪600

איך משלמים?
  כרטיס אשראי      משלמים כאן, עכשיו
  הוראת קבע        קישור לכל ילד
  מזומן            מוסרים למאמן
  צ׳קים            מוסרים למאמן
  ──────────────────────────────
  כבר שילמתי       אין מה לשלם כאן
```

1. Every student, plan and price — **drawn from what the parent picked, no server call**
2. One answer for the family: כרטיס אשראי · הוראת קבע · מזומן · צ׳קים · **כבר שילמתי**
3. Choosing **כבר שילמתי** asks one follow-up — **איך שילמתם?** מזומן / צ׳ק / הוראת קבע —
   and stores `method` + `already_paid: true` for every payable child
4. **Per-student override** — "שינוי" on a row opens a small sheet with the same five
   options and the same follow-up, changing that child alone. A family may have paid for one
   child and not the other.
5. **"אישור ומעבר לתשלום"** → the write → the frame(s)
6. Done — every student ticked, the הוראת קבע queue if any, and כניסה לאפליקציה

**The summary rows carry the tense, and it must not read as settled:**

| Row | Chip |
|---|---|
| paying now, cash | `מזומן` |
| already paid, cash | `כבר שולם · מזומן · ממתין לאישור המועדון` |
| הוראת קבע, not yet | `הוראת קבע · המועדון יאשר לאחר קליטת ההוראה` |

A parent who marked "כבר שילמתי" has made a **claim**. The manager confirms it from their
own reconciliation queue — the chip says so, because a screen that reads "done" leaves the
parent thinking they are finished and the club thinking they owe.

**A child marked "כבר שילמתי · הוראת קבע" is not in the mandate queue** on the done screen.
They have said the mandate exists; handing them a link to create a second one is how a
family ends up with two.

**The write groups promises by `(method, already_paid)`, not by method alone.** Today
`tellTheManager()` groups cash and cheque by method only, which would lump a claimed
payment and an expected one into a single promise with `already_paid: false` — losing the
claim. `recordStandingOrder()` already splits correctly and says why; the rule generalises.

---

## 5. Findings this replaces

Every one verified in the code; F1, F3 and F5 also reproduced in a real browser on
2026-09-03 at 420×900.

### Step 1

- **F1 — the login flash.** `JoinWelcomeStep.tsx:47` calls its own `useSession()`. It
  remounts on back-navigation, restarts at `status: 'loading'`, and the component treats
  anything ≠ `signed-in` as "render the sign-in wall". Measured at ~120 ms locally; far
  longer over a real network. Each remount also **rotates the refresh token**.
- **F2** — no welcome text, no summaries, no version chips, no logo.
- **F3** — privacy and terms share **one** card and **one** tick; the club card prints its
  clauses raw. Back-navigation **erases both ticks**.
- **F4** — "קריאת המסמך המלא" appends the document *below the page*, so opening the
  12-section privacy policy pushes the accept button a screen and a half down.
- **F5** — the primary "המשך" button sits **underneath the accessibility FAB**. Steps 1 and
  2 are the only screens `JoinFlow` renders without its `pageStyle` wrapper, so they have no
  padding and the button is flush in the corner. Playwright could not click it.

### Step 2

- **F6** — one long scroll; no per-student panel.
- **F7** — second parent and pickup are **one family-level block**
  (`JoinFamilyStep.tsx:133`), applied to every child.
- **F8** — an 18+ student is **still asked for כיתה/גן** (`familyDraft.ts` `rowValid`), and
  the 18+ answer is **never sent to the server**; it only hides UI.

### Cross-cutting

- **F9 — a brand-new family is registered but never signs or pays.** Their session has no
  active studio, because they belong to no club at sign-in. `JoinFlow` never reloads it
  after registering, so `/me/students` runs unscoped, `TenantSession` fails closed, and the
  wizard sees zero children — skips health, says "nothing to pay", done. **Not yet proven by
  a test.** Removed by decision 2; a session reload after the write is still needed so the
  app the parent lands in is correct.
- **F10** — `useSession()` is mounted **four times** on `/join/<token>` (app root,
  `JoinShell`, `JoinFlow`, `JoinWelcomeStep`), each doing its own refresh.

### Step 3

- **F11** — neither branch opens a popup. "יש משהו" renders the questionnaire inline and
  **permanently**: `expanded` at `JoinHealthStep.tsx:108` can never return to false, so the
  parent never reaches a summary.
- **F12** — the collapsed card says a **hardcoded** `'13 שאלות סומנו "לא"'` — a literal in
  the translation file, not counted. Correct today by luck.
- **F13 — five of thirteen questions are unenforced.** Only `required: true` or `flag: true`
  questions are checked. `chronic_illness`, `chest_pain`, `fainting`,
  `family_sudden_death` and `surgery_last_year` are neither — so they can be left blank, and
  unanswered is not "yes", so the app then has the parent sign *"אין מגבלות רפואיות
  כלשהן"*. **Closed for free by decision 7 + the popup:** both branches force every question
  to carry an answer.
- **F14** — `health_fund` is `required: False` in the template.

### Step 4

- **F15 — the frame never opens, two ways.** `PaymentSetup.tsx:344` posts into the iframe
  **without checking the demo sentinel**; `PaymentsSection.tsx:329` does check it. A demo
  studio posts to `action: "demo:ipn-simulator"` and gets a permanently blank frame. And if
  `UPAY_MERCHANT_EMAIL` is unset, `/payment-orders/{ref}/form` answers **503**
  (`app/routers/payments.py:494`) which `run()` flattens into a generic error — no frame, no
  reason. *Which of the two bites on staging is still unconfirmed.*
- **F16** — הוראת קבע links are **always missing**. `/me/standing-order-links` is fetched
  once when the session becomes signed-in (`App.tsx:217`), *before* the children exist, so
  by step 4 the list is empty and every standing-order child shows "לא ניתן לאשר". Fixed by
  decision 15 — the queue moves to the done screen, after the write.
- **F20 — a family who already paid has no way to say so.** `already_paid` is exposed only
  as a checkbox under each **הוראת קבע** child's mandate link, in the summary
  (`PaymentSetup.tsx` `setup-standing-already-paid-*`). The backend has taken it for all
  three promise methods since it was written (`app/services/billing/payment_promise.py:76`),
  and the service comment names the intent — *"the two buttons the signup plan step offers
  under every route"*. So a family who handed the manager cash last week is asked for the
  money again, with no control on the screen that says otherwise. Two consequences beyond
  the missing option: the write's `tellTheManager()` groups cash and cheque **by method
  alone**, so a claimed and an expected payment of the same method would merge into one
  promise with `already_paid: false`; and nothing on the screen says the claim is a claim,
  which leaves the parent thinking they are finished and the club thinking they owe.

### Scope

- **F19 — the wizard asks about every child on the account, not the ones it is creating.**
  `JoinFlow.tsx:335` hands the health step `students` — the whole of `/me/students` — and
  `JoinFlow.tsx:360` hands the payment step every student too, while `PaymentSetup` reads
  `client.openCharges('')`, which is *all* of the payer's open charges. Today that is
  already wrong for a returning family on the join link. Reused for Door D as-is, a parent
  adding a fourth child would be walked through a declaration for any sibling the server
  thinks owes one, and shown the whole family's outstanding money on a screen they opened
  to add one child. Closed by decision 6: the wizard carries the set of students **this
  run** is creating, and health and payment read only that set.

### Door D

- **F18 — `#/add-child` writes the most on the least.** It asks first name, last name,
  birthdate and groups, then `add_child` (`app/services/people/onboarding.py:175`) creates
  the person, the student, the guardian link, the enrolments, the price **and the first
  charge** in one go. No ת.ז., no plan, no health step, no payment step — the parent is
  dropped into the app-level `ConsentGate` → `HealthGate` → `PaymentSetupGate` stack to
  find out what else they owe, one gate at a time, with no rail and no sense of a sequence.
  Replaced wholesale by Door D above.

### Door A — the landing page

- **F21 — the trial "health declaration" asks nothing, and records a constant.** The screen
  is headed `הצהרת בריאות לשיעור ניסיון` and its subtitle promises `שאלות קצרות`. It asks
  **zero** questions: one summary card per child and one checkbox, `אני מאשר/ת שהפרטים
  נכונים`. Worse, the checkbox gates the button but not the payload —
  `BookingFlow.tsx:684` posts `trial_health_declarations: children.map(() => ({ confirmed:
  true }))`, a hardcoded literal, whatever the parent ticked. The server stores it encrypted
  and sets `student.health_status = 'trial_signed'`
  (`app/services/people/trials.py:253`). So a child the club has never met walks onto the
  mat carrying a status that says a declaration exists, and the record behind it contains
  the word `true`. `TRIAL_TEMPLATE_SCHEMA` — a real 7-question form — exists in the codebase
  and this screen has never used it. Closed by decision 7: one health form for everybody,
  asked through the popup, here as everywhere.

### Outside the wizard

- **F17 — a second child can never get a free trial.**
  `TrialService.has_used_a_free_trial` (`app/services/people/trials.py:97`) counts trial
  bookings **per guardian** while its own docstring quotes the spec as "one free lesson per
  student, full stop". Signed in, the sibling is refused `409 trial_already_used`;
  anonymous, a **duplicate parent Person** is created because a typed address is never
  matched. Owner has approved counting per student. **Blocks Door D's trial path**, so it lands early.

---

## 6. API changes

No migration anywhere. The database already stores parents and pickup contacts per student.

| Change | Where | Note |
|---|---|---|
| `GET /me/onboarding-status` | new | the one answer to "what is left" |
| `slug` + `logo_url` on `OnboardingInfoOut` | `app/routers/onboarding.py:83` | reuses the existing unauthenticated `GET /public/studios/{slug}/logo` |
| per-child `other_parent`, `pickup_contacts`, `price_plan_id` on the register body | `app/routers/onboarding.py:124` | additive |
| parent-readable live plan list | new | `/price-plans` is `ManagerOrOwner` only; must return name, price, sessions-per-week and nothing else |
| server refuses a plan that does not cover the chosen groups | `OnboardingService.register` | 422; the picker only offers covering plans |
| `GuardianCreate` accepts an email with no names | `app/schemas/people.py:90` | for the manager's 3-field form |
| trial counted per student | `app/services/people/trials.py:97` | F17 |

---

## 7. Build order

Five waves. Everything inside a wave is independent of everything else in it and can be
built in parallel; the waves themselves are ordered.

**The reason the spine is sequential and the tail is not:** phases 2–5 all edit
`JoinFlow.tsx`'s step routing, and they all sit on the shell (wave B). Wave A touches none
of that — five separate corners of the codebase that no wizard work reaches.

### Wave A — independent, start immediately

| Piece | Files | Closes |
|---|---|---|
| Trial counted per student | `app/services/people/trials.py` | F17 |
| Legal copy: payee, Apple, both version bumps | i18n ×6, `club_terms.py`, 2 tests | decisions 22–24 |
| Payment frame: demo sentinel + the 503 message | `PaymentSetup.tsx` | F15 |
| Dashboard add-student — student first, three fields | `web/apps/dashboard/`, `app/schemas/people.py` | decision 20 |
| Invitation email | backend | decision 21 |

### Wave B — the spine, sequential

| # | What |
|---|---|
| B1 | Shell — one session, sign-in above the wizard, status endpoint, logo on the join response |
| B2 | Write at the end · draft to `localStorage` · health keyed to local rows · session reload + first snapshot |

`B2` depends on `B1`. Nothing else may start until both have landed.

### Wave C — the screens, parallel

| Piece | Files | Note |
|---|---|---|
| Step 1 — welcome, logo, three cards, popups | `JoinWelcomeStep`, `people.ts` | |
| Step 3 — the popup flow, on the one health form | `JoinHealthStep`, `health.ts` | |
| Step 2 — per-student panel, age-derived parent/pickup, plan picker + the two endpoints | `JoinFamilyStep`, routers | the large one |

Separable because each owns a different component **and a different i18n namespace** —
which is what the one-namespace-per-vertical rule exists for.

### Wave D — step 4's summary

Depends on wave C's **step 2**: the summary draws its prices from the plan the parent picked
there (decision 14), so it cannot be built before the picker exists. The rest of step 4 —
F15 and the הוראת קבע queue — is already done in wave A.

### Wave E — doors A, C, D onto the wizard

Depends on the whole of B, C and D.

### Running a wave in parallel

Two subagents in one checkout will collide. Parallel work needs `isolation: "worktree"` on
the `Agent` call, and **a worktree needs its own database** — point each agent's
`DATABASE_URL` at a separate database in the same container, because a shared one makes two
lanes' migrations and fixtures fight. Sequential is correct for wave B, wasteful for wave A.

Failing test first on each. Gates: `./scripts/lane-check.sh people` and
`./scripts/lane-check.sh health` per commit. Touching `web/packages/` adds
`npm run typecheck`.

**The legal copy rides in wave A, not with step 1.** An earlier draft put it in the step 1
rebuild so a family would be re-asked once on the new screen — but there are no live users
yet (decision 23), so there is nobody to re-ask, and holding a correct cheque payee behind a
screen rebuild buys nothing.

---

## 8. Still open

1. **Which of F15's two causes bites on staging** — demo studio, or unset
   `UPAY_MERCHANT_EMAIL`. The fix differs.
2. **F9 has no proving test yet.** It is a mechanism read from the code, not an observation.
3. **Editing an already-created child after the final write.** Back from the done screen
   re-submits, and the register call adopts rather than duplicates — but whether a *changed*
   name, group or plan is applied needs checking before it is promised.
4. **`SMTP_PASSWORD` on production** is an ops task, not a code one (decision 21).
