# §20 — Growth: what this club actually needs

> Drafted 2026-09-14 from a one-line idea ("integrate Facebook, Instagram and WhatsApp,
> manage the leads and the marketing; create fliers with AI; create content with AI").
> **Rewritten the same day**, after an interview with the owner, a read of the code, and a
> query against production.
>
> Most of the first draft is gone. What it got wrong is recorded below rather than quietly
> deleted, because the reasons are the part worth reading: nearly every item was either
> machinery the product already runs, or a channel this club does not use.
>
> **Nothing here is implemented** except where it says something already shipped.

## The club, measured

Numbers the first draft guessed at. The left column is the owner's; the right is a query
against the production database on 2026-09-14.

| | |
|---|---|
| Children training at the club | **over 100** |
| Students in the app | **3** — all `source='onboarding_link'`, all `active` |
| Trial bookings, ever | **0** |
| Registration requests, ever | **0** |
| Announcements, ever | **0** |
| New enquiries per month | **under 5**, all at the dojo |
| Where enquiries arrive | word of mouth, in person. Not the landing page, not social |
| What has ever produced a member | a current parent telling a friend · a child bringing a schoolfriend |
| Meta assets | Instagram and Facebook exist; neither is a Business account; no ad has ever run |
| Fliers made, ever | **0** |
| Who chases an enquiry | the app does — §5.4a's ladder |
| Budget | a few days to a fortnight of work; up to ~₪100/month |

## The finding

**The club has one acquisition channel, and it is referral from families it already has.
Those families — a hundred of them — are not in the app and have not been asked.**

That single sentence disqualifies most of the first draft. It was not merely over-built;
it was pointed away from the club. It proposed to capture leads on networks that have never
produced one, to manage a pipeline of four, and to replace two mechanisms that already run.

The growth question for this club is not *how do we work our leads*. It is *how does a
parent who already likes us tell someone else*, and the answer needs the parents in the app
first.

---

## What the first draft got wrong

Each of these is cut. The code that contradicts it is named, so the next person to propose
it can check in a minute rather than rediscover it in a week.

### §20.1 Leads — cut

It proposed a new `lead` table with `source`, `status` and a screen. All three exist:

- `Student.status` **opens at `lead`** and `Student.source` is already a column
  ([app/models/people.py:145](../app/models/people.py#L145)).
- [app/services/people/status.py](../app/services/people/status.py) is the single-writer
  transition graph — `lead → trial → pending_approval → active → left|lost` — and §5.4a
  computes the funnel from `student_status_history`.
- The follow-up ladder already runs: [app/workers/followups.py](../app/workers/followups.py)
  sends the 24-hour reminder, follows up on days 1, 3 and 7, and writes `lost` after 21 days.

The screen it proposed sorted "the oldest neglected lead first". There are four of them, the
owner adds them by hand, and the app chases them without being asked. A list that shows you
what you already know is a screen you stop opening.

### §20.2 WhatsApp — cut

Its part A, "click-to-WhatsApp links, zero integration, ship this first", **shipped months
ago**. `whatsappShareUrl` lives in [web/packages/core/src/comms.ts](../web/packages/core/src/comms.ts)
and is used on the landing page, the booking confirmation, the collections screen, the
announcement delivery report and the parent contact sheet.

Parts B and C need the Business API for **four conversations a month**. §5.11 already
weighed and rejected that, on the record, in the file above. The first draft rediscovered a
decision without noticing it had been made.

### §20.3 Facebook and Instagram — cut

Lead capture requires a Meta Business account, a Facebook Page, a linked Instagram Business
account, and paid ads to capture from. The club has an Instagram and a Facebook, neither
converted to Business, and has never run an ad. This is capture with nothing to capture.

### §20.4 AI fliers and content — half cut

**Fliers: cut.** The club has never made one. The first draft designed a templating system
for a job nobody does.

**Drafting: survives**, for a reason the first draft could not have known. The owner does not
post because they **do not know what to post** — a blank page, not a shortage of minutes.
That is the single thing in this document a language model is genuinely good at, and it is
the only part of the original four that came through the interview stronger than it went in.

---

## The facts, corrected

The first draft's WhatsApp constraints were written from memory and most are out of date.
Verified 2026-09-14 against Meta's own documentation. None of it changes the verdict above —
it is recorded so the next person to raise WhatsApp starts from what is true.

| The first draft said | Actually |
|---|---|
| Templates are priced per message, per country and category | True, and newer than it knew: **per-message pricing replaced conversation pricing on 1 July 2025** |
| Utility templates are cheap, marketing several times more | True — but **utility templates are free inside an open 24-hour customer service window**, and non-template replies in that window are free as well |
| A Business API number cannot also be used in the normal WhatsApp app | True of the **consumer** app only. **Coexistence** (May 2025, now every country) runs the **Business app** and the Cloud API on one number and keeps the history — capped at 20 messages/second, and permanently disabling broadcast lists, disappearing messages, view once, and 1:1 live location |
| — not mentioned — | A Click-to-WhatsApp ad opens a **72-hour** free entry-point window, not 24 |

The Meta ask was understated too. Lead retrieval needs five permissions — `leads_retrieval`,
`pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `ads_management` — an
App Review in which reviewers **test the live webhook**, and **Business Verification** on the
Business Manager behind the app. And Meta retains lead data for only **90 days**, so an
integration that silently stops does not delay leads, it destroys them.

---

## What to build

Three things, in order. **The first is not code, and it is the one that matters.**

### 1. Send the onboarding link. This week. No code.

§5.4b already is this feature: [app/routers/onboarding.py](../app/routers/onboarding.py) —
one link, one message to the club's existing WhatsApp groups, and each parent registers
their own children, their own phone numbers and their own health declarations. The data
entry that looks like the wall is not work the owner has to do.

It is **proven**, not theoretical: all three students in production arrived through it.

Everything below is worthless without it. A share button in an app three families have is a
button nobody presses, and a funnel report over zero trial bookings is an empty chart.

### 2. The share button. One day, no vendor, no monthly cost.

`שתפו את המועדון` in the parent app: a `wa.me/?text=` link carrying a pre-composed Hebrew
message and the club's address on the web. `whatsappShareUrl` already exists and already
does exactly this for announcements — this is a second call site and a string, not a
feature.

It is the only item in this document that points at the channel that has actually brought
this club its members, and the owner has said they would push it at parents.

Attribution is the smaller half and worth doing cheaply: the link can carry a marker that
lands `Student.source='referral'`, because `source` is already a column and §5.4a's funnel
already slices by it. If that turns out to be fiddly, ship the button without it. Counting
who referred whom is interesting; getting the message sent is the point.

**Not a reward.** The owner expects parents to share without one. A referral discount is a
billing rule, a fairness argument and an accounting change, and it can be added later if
sharing turns out not to happen on its own.

### 3. The caption drafter. Two or three days — and only after the club is on the app.

A button on an `Event` or an announcement that drafts Hebrew for Instagram. It knows the
real date, the real group's age range and the club's own name, because those are rows the
app holds — which is the entire reason this belongs in the product rather than in a chat
window. The output lands in a box the owner edits.

**Nothing is posted automatically.** Not by us, and not to a network we hold no token for.
The owner copies the text out. That rule is not negotiable for a product that speaks to
parents about their children.

Explicitly out of scope: publishing through the Graph API (it needs the Business accounts
the club does not have, and Buffer does it for €6/month), and image generation (image models
render Hebrew unreliably, a club's flier is its face — and this club has never made one).

Two limits keep the cost bounded: owner-or-manager only, never a coach and never automatic;
and a per-studio monthly cap shown on screen *before* it is reached, not after.

---

## If you only ever build one thing

**The share button.** One day, no vendor, no key, no approval, nothing to pay monthly, and
it is the only thing here aimed at the channel that demonstrably works.

But build it **after** the onboarding link has gone out. The order is the whole
recommendation: the first draft's "build the lead table first" was advice to instrument a
funnel before the club had one.

---

## What this does not solve

**The leak is unevidenced.** The owner named both a thin top and a leaky middle. Only the
first has evidence. There is no evidence of a leak because there is no data — **zero** trial
bookings have ever been recorded. Whether this club loses people between enquiry and joining
becomes answerable about a season after the migration, from `student_status_history`, and
not before. Anyone who claims to fix that leak today is guessing.

**Software may not be the answer at all.** Four enquiries a month is small enough that the
honest position is that no feature in this document moves it much. A club this size grows by
being visible where parents already are — the school gate, the local festival, the
competition results that the photographs on the landing page are finally showing again. The
product's share of that is small, and this document is deliberately a third the length of
the first draft because that is the truthful size of the opportunity.

---

## Recommendation

**Build a smaller version — about two to four days of work, and ₪0 a month.**

| | | |
|---|---|---|
| This week | Send the onboarding link to the club | no code |
| Then | The share button in the parent app | ~1 day |
| Then, only if the owner is on the app and still not posting | The caption drafter | 2–3 days |
| **Not on today's numbers** | the lead table · the lead screen · the WhatsApp Business API · Meta lead capture · AI fliers | — |

The ₪100/month the owner was willing to spend is **not needed**. Nothing above has a vendor.
Keep it.

Revisit WhatsApp and Meta if enquiries ever pass roughly **30 a month** — the point at which
a person stops being able to hold them all in their head, and therefore the first point at
which any of the cut work would pay for itself.

---

## Questions that were open, and their answers

The first draft ended with four questions for the owner. Answered 2026-09-14, and kept here
because each answer is what cut a section.

1. **Which number would WhatsApp use?** Moot — the Business API is cut. For the record, the
   constraint is softer than the draft claimed: Coexistence keeps the Business app on the
   same number.
2. **Does the club run Meta ads?** No, and neither account is a Business account. §20.3 cut.
3. **Who chases a lead?** The app does. §20.1's owner column and filters cut.
4. **What does the club lose?** Under five enquiries a month, added to the app by hand and
   chased automatically. Nothing measurable is being lost in the middle. What is being lost
   is at the top, and the answer to it is referral — hence the share button.

Two the first draft did not think to ask, and which decided the rest:

5. **How many families are actually in the app?** Three, of over a hundred. This is the
   finding.
6. **Why don't you post?** Not time — *not knowing what to post*. This is the only thing
   that saved the AI half of §20.4.
