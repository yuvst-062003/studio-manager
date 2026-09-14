# §20 — Growth: social channels, leads, and AI-assisted content

> Drafted 2026-09-14 from a one-line idea ("integrate Facebook, Instagram and WhatsApp,
> manage the leads and the marketing; create fliers with AI; create content with AI"),
> written in SPEC.md's voice and numbered §20 so it can be merged after §19.
>
> **Nothing here is implemented.** This is a spec to argue with, not a plan to execute.
> Where it says a thing is hard or expensive, that is the part worth reading first — the
> easy parts will look after themselves.

## Purpose and scope

Every feature in this product so far serves a family the club **already has**. §5.4a adds
them, §5.4b onboards them in bulk, §5.10 bills them, §5.11 tells them things. The one
place a stranger appears is the trial funnel — the public landing page and
`TrialBooking` — and it is a door with nobody standing outside it.

This section is about the outside. It has four parts, and they are **not** equally
sensible to build:

| | What it is | Verdict |
|---|---|---|
| §20.1 | **Leads** — one place every enquiry lands and is worked | Build first. Needs no vendor. |
| §20.2 | **WhatsApp** — reach a parent where they already are | Build second. One vendor, real cost. |
| §20.3 | **Facebook / Instagram** — capture leads, publish posts | Build third, capture before publish. |
| §20.4 | **AI fliers and content** — drafting, not designing | Build last, smallest first. |

They are ordered by how much of the value is reachable without a third party. That order
is the recommendation, and §20.5 says what to do if only one of them is ever built.

### What this is not

**It is not a CRM.** A judo club with 200 families does not need pipelines, scoring or
sequences, and building them would produce a screen the manager avoids. The test for
every field below is: does a manager, mid-week, do something differently because of it?

**It is not a social media manager.** Scheduling posts across networks is a solved,
crowded market (Buffer, Later, Meta's own Business Suite) and the club can use one for
€0–15/month. What no tool does is know *which of these leads booked a trial*, and that
is the only integration worth owning.

---

## §20.1 Leads

### The model

One new tenant-scoped table. `lead`:

```
lead  studio_id, source, source_ref?, display_name?, phone?, email?,
      child_name?, child_birthdate?, message?, status, owner_person_id?,
      trial_booking_id?, student_id?, first_seen_at, last_touched_at,
      converted_at?, lost_reason?
```

**`status` is five values and no more**: `new`, `contacted`, `trial_booked`, `joined`,
`lost`. Anything finer is a pipeline nobody updates. The three interesting transitions
are automatic:

- `trial_booked` when a `TrialBooking` is created carrying this lead's id
- `joined` when the resulting `Student` reaches `active` — §5.4a already writes that
- `lost` only ever by hand, with a reason, because "we never heard back" and "too
  expensive" are different problems for the club

**`source` is the whole point of the table.** `landing`, `whatsapp`, `facebook`,
`instagram`, `walk_in`, `referral`, `manual`. Without it this is a worse version of
`RegistrationRequest`; with it the club can answer *"where do our members actually come
from"*, which is the one marketing question a small club can act on.

**`source_ref`** holds the platform's own id — a Meta `leadgen_id`, a WhatsApp message
id — so a lead is reconcilable with the platform it came from, and importing the same
lead twice is a no-op rather than a duplicate.

### What already exists and must not be duplicated

`RegistrationRequest` (§5.4a) is a request from someone who has already decided to join.
`TrialBooking` is a booked lesson. A `lead` is **earlier than both** and becomes both. So:

- Booking a trial from the public landing page creates a `lead` with `source='landing'`
  and links it. The lead is not a second record of the booking; it is the record of the
  *person*, which survives the booking being cancelled.
- A lead that reaches `joined` keeps `student_id` and stops being worked. It is never
  deleted: the club's own history of where its families came from is the asset here.

### The screen

One screen in the dashboard, `#/leads`, and one card on the manager's home. The list is
**grouped by status, ordered by `last_touched_at` ascending** — oldest neglected lead at
the top, because the failure mode of every lead list is that the newest is always on
screen and the three-day-old enquiry is never seen again.

Each row does exactly four things: call (`tel:`), WhatsApp (`https://wa.me/<phone>`),
book a trial (straight into the existing §5.4a flow), mark lost. No free-text notes
field beyond `message` — notes are where CRMs go to die, and the club's actual memory is
WhatsApp.

### Why this first

It needs **no vendor, no API key, no review process, and no monthly cost**. The landing
page already produces enquiries the club currently loses. This makes them visible and
countable, and every later part of §20 writes into the same table rather than inventing
its own.

---

## §20.2 WhatsApp

### The honest constraint

WhatsApp is where Israeli parents actually are. It is also the most restricted of the
three channels, and a spec that skips this is useless:

- **Business-initiated messages must use a pre-approved template.** You cannot send free
  text to someone who has not messaged you in the last 24 hours. Templates are submitted
  to Meta and approved or rejected, typically within a day.
- **Templates cost money per message**, priced per country and per category. Utility
  templates (a lesson cancelled, a payment due) are cheap; marketing templates cost
  several times more. For a 200-family club this is small but not zero — budget in
  shekels per month, not per year.
- **The 24-hour window** is the exception: once a parent messages the club, free-text
  replies are allowed for 24 hours. This is what makes lead *conversation* viable and
  lead *broadcasting* expensive.
- **A number used with the Business API cannot also be used in the normal WhatsApp app.**
  This surprises every club that tries it. The club needs a dedicated number, or it loses
  the phone the coaches currently use.

### What to build, in order

**A. Click-to-WhatsApp links (zero integration).** `https://wa.me/<phone>?text=<prefilled>`
from the lead row and the student card. No API, no cost, no approval — it opens the
manager's own WhatsApp with the message drafted. This captures most of the day-to-day
value and should ship with §20.1.

**B. Inbound lead capture.** A "Click to WhatsApp" ad or a link in the club's bio opens a
chat with a known first message. A webhook creates a `lead` with `source='whatsapp'` and
`source_ref` set to the message id. This is the highest-value integration in §20: it
turns a conversation the club was already having into a row it can work.

**C. Outbound templates**, and only for things §5.11 already decides to send — a
cancelled lesson, an overdue payment. This is `push` with a different transport, and it
belongs behind the existing `NotificationPreference` switches, not beside them. A parent
who muted payment notifications must not receive them on WhatsApp instead.

**Marketing broadcasts are explicitly out of scope.** A club that blasts 200 families
with a promotion on WhatsApp gets reported as spam, and a reported number is a number
Meta can restrict. If the club wants to announce something to everyone, §5.11's
announcements already do it in an app the family chose to install.

---

## §20.3 Facebook and Instagram

### Capture before publish

Two halves, and only one is worth building.

**Lead capture (worth it).** Meta Lead Ads let someone submit a form without leaving
Facebook or Instagram. A webhook delivers the submission; we create a `lead` with
`source='facebook'` / `'instagram'` and `source_ref` set to the `leadgen_id`. The club
sees the enquiry in the same list as every other, within seconds rather than whenever
someone next opens Business Suite. **This is the integration that pays for itself**, and
it is a webhook, a token refresh, and a mapping — perhaps a week.

**Publishing (probably not worth it).** Posting to a Page or an Instagram Business
account through the Graph API is possible and tedious: image upload is a two-step
container flow, Stories and Reels have separate rules, and every one of these breaks on
Meta's schedule rather than ours. Buffer does it for €6/month.

Build publishing only if the club is posting several times a week AND wants it tied to
club data ("belt gradings this Saturday", drawn from `Event`). Otherwise link out to
Business Suite from the marketing screen and spend the week on §20.1 instead.

### What Meta will ask for

Not optional, and worth knowing before anyone promises a date:

- A Meta **Business account** and a **Facebook Page** the club owns; Instagram must be a
  **Business** account linked to that Page
- An **App Review** for `leads_retrieval` (and `pages_manage_posts` if publishing),
  including a screencast of the flow. Days to weeks, and it can be rejected
- A **privacy policy URL** — the club has one (§11), which is genuinely lucky
- **Token refresh**: page tokens expire. A lead integration that silently stops is worse
  than none, so this needs the same `ops_check` treatment as §18's other signals: a red
  light when the last successful webhook is older than the club's usual quiet period

### Privacy

A Meta lead form can ask for a child's name and age. The moment it does, §11 applies to
data arriving from a third party — the `lead` row is personal data about a minor, and
`message` must never reach a log or an audit `diff`. A lead that never converts should
be purgeable on the same schedule as §11.4's other subject data.

---

## §20.4 AI fliers and content

### What AI is good at here, and what it is not

**Good at**: a first draft of Hebrew copy for a post about an event the club is already
running; three variations of a headline; translating a Hebrew post into Russian for the
club's Russian-speaking families (§9 already carries `ru`).

**Bad at**: producing a printable flier that looks like the club designed it. Image
models do not reliably render Hebrew text, cannot be trusted with a logo, and produce
something subtly wrong in a way that reads as cheap. A club's flier is its face.

So the split is:

**Content drafting (build this).** A "draft a post" button on an `Event` or an
announcement. It knows the club's name, the event's real date and time, and the group's
real age range, because those are rows we already hold. Output is Hebrew text in a box
the manager edits before anything is published. **The manager always edits and always
confirms** — nothing generated is ever posted, sent or printed without a human pressing
a button, and that rule is not negotiable for a product that speaks to parents about
their children.

**Fliers (build narrowly, or not at all).** Not "generate an image". Instead: a small
number of **real templates** — a grading announcement, a trial-week promotion, a summer
camp — rendered server-side with the club's actual logo, colours and details, with AI
writing only the words inside them. This produces something usable every time, which
"generate me a flier" does not. The rendering is the same problem §13's monthly report
PDF already solves, so the machinery exists.

### Cost and the rule that keeps it bounded

Per-generation cost is small but unbounded if a button is free to press. Two limits:

- Generation is **manager-or-owner only**, never a coach and never automatic
- A per-studio monthly cap, visible on the screen before it is hit, not after

### The honest caveat

This is the part of §20 most likely to be a demo that impresses once and is never opened
again. It should be the **last** thing built, and if the lead work (§20.1–20.3) turns out
to fill the manager's week, it should be dropped without regret.

---

## §20.5 If only one thing is ever built

Build **§20.1, the lead table and its one screen**, plus **click-to-WhatsApp links**.

No vendor, no approval, no monthly cost, no token that expires at the worst moment. It
makes the enquiries the club is already receiving visible, countable and workable, and it
answers the one question that changes what a small club spends money on: *where do our
families actually come from?*

Everything else in §20 is an improvement to a funnel that does not yet exist. Build the
funnel first.

---

## Open questions for the owner

1. **Which number would WhatsApp use?** A Business API number cannot also be used in the
   normal app. Is there a spare club number, or would this need a new one?
2. **Does the club already run Meta ads?** If not, §20.3's lead capture has nothing to
   capture yet, and §20.1 is the whole of the work.
3. **Who chases a lead?** The screen is shaped by whether that is one person (a single
   list) or several coaches (`owner_person_id` and a filter).
4. **What does the club currently lose?** A rough count of enquiries per month that never
   became a trial is what decides whether any of this is worth a week.
