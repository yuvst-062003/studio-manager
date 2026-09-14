# §20 — Growth: what this club actually needs

> Drafted 2026-09-14 from a one-line idea ("integrate Facebook, Instagram and WhatsApp,
> manage the leads and the marketing; create fliers with AI; create content with AI").
> **Rewritten the same day**, after an interview with the owner, a read of the code, and a
> query against production. **§20.4 was added in a second round**, when the owner asked for
> a content studio — camera guidance, a prompter, captions, and posts made from photos.
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
| Why the owner doesn't post | **not knowing what to post** — not a shortage of time |
| Who would film | the owner **and the coaches** |
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

> **This cut is scoped to reaching parents, and §20.5.3 reverses it for one other use.**
> Broadcasting to a hundred families and capturing leads from ads are what fail here. A
> single-recipient approval loop with the *manager* — who replies, and whose replies make
> every message in the exchange free — is a different calculation that comes out the other
> way. Both verdicts are in this document on purpose.

### §20.3 Facebook and Instagram — cut

Lead capture requires a Meta Business account, a Facebook Page, a linked Instagram Business
account, and paid ads to capture from. The club has an Instagram and a Facebook, neither
converted to Business, and has never run an ad. This is capture with nothing to capture.

### The first draft's §20.4, AI fliers and content — half cut

**Fliers: cut.** The club has never made one. The first draft designed a templating system
for a job nobody does.

**Drafting: survives**, for a reason the first draft could not have known. The owner does not
post because they **do not know what to post** — a blank page, not a shortage of minutes.
That is the single thing in this document a language model is genuinely good at, and it is
the only part of the original four that came through the interview stronger than it went in.

It grew into something much larger when the owner described what they actually wanted, and
**§20.4 below is that section** — the number is reused deliberately, because the content
studio is what this slot should always have held.

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

### 3. The content studio — and only after the club is on the app.

The owner asked for this directly: a feature that says where to put the camera and what to
say, runs a prompter while filming, turns speech into captions afterwards, and makes a post
out of a handful of photos. It is the largest thing in this document and it splits sharply
into parts that are nearly free and parts that are a project. §20.4 below prices each one.

**Nothing is posted automatically.** Not by us, and not to a network we hold no token for.
The owner copies the text out. That rule is not negotiable for a product that speaks to
parents about their children.

---

## §20.4 The content studio

### What the app knows that CapCut does not

The phone already films well and free editors already cut well. Competing with either is a
losing trade. The app has exactly two assets nothing else has, and the whole section should
be built on them:

1. **The club's real data.** The actual date of the grading, the actual age range of
   קבוצה 2, the actual name of the event. A caption that says "יום ראשון 17:00" because a
   `session` row says so cannot be got from a chat window.
2. **The consent ledger.** `consent_record` already carries `photo_video`, versioned and
   revocable ([app/models/health.py:171](../app/models/health.py#L171)), and the parent app
   already lets a family grant or withdraw it. **No outside tool can tell a coach which
   children in the room may be filmed.** This app can.

The second one is the strongest idea in this document, and it arrived by accident — it is
the same question that took the landing-page photographs down on 2026-09-08.

### The parts, priced

| | What it is | Build | Running cost | Verdict |
|---|---|---|---|---|
| **A** | **The brief** — a screen per shot type: where to stand, what's in frame, how long, what to say, drawn from the real event | ~2 days | **₪0** — it is content and club data, no model call | **Build** |
| **B** | **The consent check** — "2 children in קבוצה 3 may not be filmed", before the coach presses record | ~2 days | **₪0** | **Build — do this one first** |
| **C** | **The caption writer** — photos and/or an event in, Hebrew caption out, in a box the owner edits | ~2 days | **~3–7 agorot** per caption | **Build** |
| **D** | **Captions from speech** — transcribe the clip, hand back an `.srt` | ~3 days | **~2 agorot** per minute of video | **Build, after A–C** |
| **E** | **The live teleprompter over the camera** — app owns the lens, script scrolls, app records | 1–2 weeks, and see below | ₪0 | **Defer** — high risk of not working on iPhone |
| **F** | **Rendering video** — burning captions in, photo slideshows with music | 2–3 weeks | storage + CPU | **Cut** |
| **G** | **AI-generated video** (Veo and similar) | — | **₪4.40–₪22 per 8-second clip** | **Cut** |

### The costs, honestly: the AI is the cheap part

At this club's volume the model spend is a rounding error, and saying otherwise would be
scaremongering:

- **A Hebrew caption** — roughly 500 tokens in, 200 out. On Claude Haiku 4.5 ($1/$5 per
  million) that is about **0.5 agorot**; on Opus 5 ($5/$25) about **3 agorot**. Add three
  photographs for the model to look at and it is about **7 agorot**.
- **Transcribing a clip** — Whisper is **$0.006/minute**, about **2 agorot** a minute.
- **A realistic month** — a dozen captioned posts and eight one-minute clips comes to
  **under ₪2 a month.** Not ₪100. Not ₪20.

Which means: **the cost of this feature is the engineering, not the tokens.** Every hard
decision below is about weeks of work and whether an iPhone will cooperate, never about the
bill. The per-studio monthly cap the first draft asked for is still worth having — a loop
with a bug can spend real money — but set it as a guard, not a budget.

The one genuinely expensive item is **G**. Veo 3.1 runs **$0.15/second** on the fast tier
and **$0.75/second** standard — an 8-second clip is **₪4.40 to ₪22**. Eight clips a month
is ₪35 at best and ₪176 at worst, which breaks the stated budget on its own. It is also the
wrong tool: it generates *synthetic* people, and a judo club's content is worth something
precisely because the children in it are the club's real children. **Cut, on both counts.**

### The hard part: this is a PWA, and E is where that bites

§6.5 ships installable PWAs — there is no native shell, and no plan for one. That is fine
for everything the product does today and it is the central risk in **E**:

- **iOS camera access in standalone mode has a long history of breaking.** Home-screen web
  apps are exactly the mode where WebKit's `getUserMedia` has repeatedly failed — no
  permission prompt, or the device reporting no camera at all. The app is installed to the
  home screen by design, so this feature would live in the worst-supported configuration
  Apple ships.
- **`MediaRecorder` is version-dependent.** Safari has it from 14.5, but the container
  differs by iOS version — `audio/mp4` (AAC) on 14.5–18.3, `webm/opus` only from 18.4.
  Anything written here needs per-version branching that nothing else in this codebase has.
- **There is nowhere to put the video.** `STORAGE_BACKEND` is a `FilesystemObjectStore` on
  a 4.9 GB Railway volume ([app/core/storage.py](../app/core/storage.py)), currently 0.1 GB
  used; the S3 backend is a seam that raises. A few minutes of phone video would fill it.
  **F is cut for this reason before any other.**

**So do not let the app own the camera.** The version of E that always works costs nothing:
the app shows the script, the coach props the phone and films with the ordinary camera app.
For a long script, read it aloud through an earphone rather than scrolling text the coach
cannot look at while looking at the lens. Revisit an in-app prompter only if a real iPhone
and a real Android both prove the camera works from the installed app — **half a day of
testing that should happen before any of E is estimated**, not after.

### The consent problem — answered in §20.5.1

**This section asked a question and the owner has since answered it.** It is kept because
the reasoning is what makes the answer safe to rely on.

`photo_video` consent is recorded against `subject_type='person'` — the **guardian**
([app/services/privacy/consent.py:159](../app/services/privacy/consent.py#L159)) — not the
child. So "may this child be filmed" is an inference from the parent's row rather than a
fact the ledger states, and the choice was: let a guardian's grant explicitly cover their
children (cheap, and defensible **only if the parent actually agreed to that in writing**),
or move consent to `subject_type='student'` (correct, and a migration).

**The owner chose the first, and supplied the missing half**: the parent signs their
agreement to image use **at registration**, which is what makes the guardian's row
load-bearing rather than an assumption. §20.5.1 is that change, it is a day's work, and it
has a deadline — the onboarding link.

The rule that falls out of it is unchanged: **if a coach films, the clip is not the club's
to publish until every identifiable child in it has consent.** The same sentence that took
five photographs down in September. The app should say this on the screen, not in a policy
document nobody opens.

### Coaches, and the review gate

The owner said coaches would film too. That adds one requirement and it is not optional:
**a coach can draft and record; only an owner or manager can mark something ready to
publish.** Not because coaches are careless, but because the consent question above has to
be answered by the person who is accountable for it. Generation stays owner-or-manager
only; the prompter and the brief are open to coaches.

### The outside tools

The spec assumes these stay outside the product. Building any of them is out of scope.

| Tool | What it is genuinely for | What to know |
|---|---|---|
| **Canva** | Posters, story templates, anything designed. Hebrew and RTL support are workable | This is where a flier gets made, if one ever does. Do not rebuild it |
| **CapCut** | Trimming, music, transitions — the editor most Israeli clubs already use, free | **Its auto-captions may not cover Hebrew** — the language list is short and CapCut's own documentation does not enumerate it. It does not matter: **§20.5.2 found five tools that do Hebrew well**, so captioning is not the reason to pick an editor. Pick CapCut for the cutting |
| **Google AI (Gemini / Veo)** | Gemini for drafting; Veo for generated video | Veo is priced and judged above — cut. If Gemini is preferred over Claude for Hebrew drafting that is a swap of one API for another, not a change of plan |

The honest division of labour: **the app briefs and writes, the phone films, CapCut cuts,
Canva designs.** A product that tries to be all four will be worse at each than the free
tool it replaced, and this is a club with four enquiries a month.

---

## §20.5 Three answers from the third round

### 1. Photo consent is signed at registration — and this is urgent

The owner's answer to the open question: **the parent signs, at registration, that they
agree to the use of images, and the content studio checks the parent's file.** So a
guardian's grant covers their children, and `subject_type='person'` is the right shape
after all. §20.4 **B** is unblocked.

The machinery is already there and this is genuinely small:

- `photo_video` is already in `GRANTABLE_CONSENT_TYPES`
  ([app/services/privacy/policy.py:63](../app/services/privacy/policy.py#L63)).
- `ConsentService.record` already writes person-level rows, versioned, append-only and
  audited, from a `grants` dict ([app/services/privacy/consent.py:159](../app/services/privacy/consent.py#L159)).
- The registration agreement **already grants a consent at the moment of signature** —
  `club_terms`, through exactly that call ([app/services/health/agreement.py:655](../app/services/health/agreement.py#L655)).

So this is one more key in a dict that is already being written. Perhaps a day.

**The one rule that cannot be bent.** The club's own published privacy policy says, in
Hebrew, that photo consent is entirely optional — *"הסכמה לפרסום תמונות היא רשות מלאה —
סירוב אינו משפיע על ההשתתפות ואינו נרשם כהסכמה"*. So it is a **tick inside the signature,
never a condition of it**: registration must complete with the box unticked, refusal must
change nothing, and an unanswered box must be recorded as **no**, not as silence. Getting
this wrong makes the club's own policy text untrue — which is precisely the finding that
took the landing-page photographs down on 2026-09-08.

> **Do this before the onboarding link goes out.** The link is due **this week** and will
> bring in over a hundred families in one pass. If the tick is not in the signing flow when
> they register, every one of them signs without ever being asked, and the only way to ask
> afterwards is to hope they visit the privacy screen and opt in — which almost nobody
> does. **One day of work now, or a hundred families with no answer on file.** This is the
> most time-sensitive item in this document.

The known limitation, stated rather than discovered later: person-level consent means a
parent with two children cannot say yes for one and no for the other. That is almost
certainly fine for this club, and the upgrade path — consent at `subject_type='student'` —
stays open because the ledger is versioned.

### 2. The tools — Hebrew captioning is solved, and CapCut was the wrong worry

The owner is right that it need not be CapCut. Researched properly, **Hebrew auto-captioning
is well served**: Sonix claims 85–99% on Hebrew, VEED ~95%, and Flixier, Submagic and
Filmora all handle Hebrew with Filmora documenting RTL support explicitly. The doubt in
§20.4's table was about CapCut specifically, and it stops mattering — there are five
alternatives and the club needs one.

Two things follow, and they pull in opposite directions from what you would expect:

- **It does not make D more valuable — it makes it cheaper to skip.** If any of those tools
  does the job for free, three days of building transcription buys very little. Try one on
  one real clip first.
- **But if D is built, the app's own path is still the cheapest**: Whisper at ~2 agorot a
  minute, inside a flow that already knows the club, with no second account and no upload
  to a third party. That last part is not nothing when the video is of children.

**The real technical gotcha is not accuracy, it is direction.** Hebrew subtitle files come
out of many tools flipped or misaligned, and fixing it needs explicit Unicode RTL embedding
in the `.srt` — there are standalone tools that exist to do nothing else. Any caption work
here must be checked in a player, not in a text editor: an `.srt` that looks right in code
is the single most likely way to ship broken Hebrew subtitles.

So the division of labour in §20.4 stands, with one correction: **the outside tool is for
cutting and design, not for captions.** Captions are either free in the editor the club
picks, or two agorot a minute in the app — and the decision is one test clip away.

### 3. The approval loop over WhatsApp

The owner wants the system to draft content, send it to the manager **in WhatsApp**, and
publish nothing until the manager approves — with the manager able to send corrections back
and get a revision. WhatsApp specifically, because it is where the manager already lives.

**This reverses §20.2's verdict, and the reversal is honest rather than convenient.** That
section cut the Business API for *broadcasting to two hundred parents* and for *lead
capture from ads that do not exist*. **One recipient with a reply loop is a completely
different calculation**, and it comes out the other way.

**The economics, which are better than anyone expects.** Since per-message pricing replaced
conversation pricing on 1 July 2025:

- **Service messages** — non-template replies inside an open 24-hour customer service
  window — are **free, with no monthly cap**. The old "1,000 free service conversations"
  limit was retired with the old model.
- **Utility templates sent inside an open window are also free.**
- Only a business-initiated message **outside** the window costs anything. Israel's exact
  utility rate sits in a rate-card CSV I could not read; it is small, and the design below
  avoids it entirely.

**So make the loop manager-initiated, which is both the free path and the correct one.**
The manager messages the club's number — *"תכין פוסט על הבחינות"* — which opens the free
window; the app replies with a draft; the manager replies *"קצר יותר"*; the app revises;
the manager replies *"אשר"*. Every message in that exchange is free, in both directions,
for as long as the manager keeps replying. **₪0 a month.** And an approval loop that only
starts when the manager asks for something is exactly the consent semantics the owner
described, rather than a bot that interrupts them.

**What it actually costs is setup, not messages**, and it is the same gate that killed lead
capture: a **Meta Business Portfolio**, completed **Business Verification** (1–5 working
days), and a **dedicated number not already on WhatsApp**. The club has none of the three.
The difference from §20.3 is that here the ongoing cost is genuinely zero and the value is
concrete, so the gate is worth walking through rather than a reason to stop. Note also that
**Coexistence** (§20.2's corrected facts) means that number can still run the Business app —
the club does not lose a phone.

**Build it transport-agnostic, and ship push first.** The expensive half of this is not
WhatsApp, it is the state machine: *draft → sent for approval → corrections → revised →
approved → published*, with nothing leaving that flow unapproved. Push notifications have
been live since 2026-09-13, so that state machine plus an in-app approve/revise screen
**works today, costs nothing, and needs no Meta account at all**. Wire WhatsApp in as a
second transport once the Business account exists. This is not an argument against the
owner's preference — it is the order that gets the loop working in days instead of weeks,
and the WhatsApp half is then a transport, not a rebuild. The inbound webhook has a pattern
to copy in [app/routers/webhooks.py](../app/routers/webhooks.py).

**One privacy note, stated and not laboured.** A draft carrying photographs of children
that goes out over WhatsApp puts those images on Meta's servers. The manager would almost
certainly send them there anyway, and that is a fair argument — but it is a decision, and
§11 is the reason to write it down rather than let it happen by default.

---

## If you only ever build one thing

**The share button.** One day, no vendor, no key, no approval, nothing to pay monthly, and
it is the only thing here aimed at the channel that demonstrably works.

But build it **after** the onboarding link has gone out. The order is the whole
recommendation: the first draft's "build the lead table first" was advice to instrument a
funnel before the club had one.

**If you only ever build one thing from §20.4**, it is **B, the consent check** — not
because it makes content, but because it is the only part an outside tool cannot do, it
costs nothing to run, and the club has already been caught once by the question it answers.

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

**Build a smaller version.** The acquisition half is two days; the content studio is a
further eight or so, and worth it only in the order below.

| | | |
|---|---|---|
| **Before the link goes out** | **§20.5.1** — the photo-consent tick in the registration signature | **~1 day** |
| This week | Send the onboarding link to the club | no code |
| Then | The share button in the parent app | ~1 day |
| Then | **§20.4 B** — the consent check before a coach films | ~2 days |
| Then | **§20.4 A + C** — the shot brief and the caption writer | ~4 days |
| Then | **§20.5.3** — the approve/revise state machine, **over push first** | ~3 days |
| Then | **§20.5.3** — the same loop over WhatsApp, once the Meta account exists | ~3 days + verification |
| Ten minutes, before estimating D | Try one real clip in one Hebrew captioning tool | — |
| Then, only if that fails | **§20.4 D** — captions from speech, with RTL checked in a player | ~3 days |
| Half a day, before estimating E | Prove the camera works in the installed app on a real iPhone **and** a real Android | — |
| **Deferred** | **§20.4 E** — the in-app teleprompter that owns the camera | pending that test |
| **Not on today's numbers** | the lead table · the lead screen · WhatsApp broadcasts to parents · Meta lead capture · AI fliers · **§20.4 F** video rendering · **§20.4 G** AI-generated video | — |

**Running cost: under ₪2 a month**, almost all of it captions and transcription — and the
WhatsApp loop adds **₪0** to that, because a manager who replies keeps every message in the
exchange free. The ₪100/month the owner was willing to spend is **not needed**. The expense
here is weeks of work, and the only item that would have spent real money (Veo) is cut for
being wrong as well as dear.

**The first row is the one that cannot slip.** Everything else in this table can be done in
any order, later, at leisure. The consent tick has a deadline set by someone else's
calendar: once a hundred families have signed without being asked, asking them again is a
campaign rather than a checkbox.

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
6. **Why don't you post?** Not time — *not knowing what to post*. This is what saved §20.4
   and shaped it: the brief (A) matters more than the camera (E), because the blank page is
   the thing that actually stops the owner.

Answered in the second round, after the owner asked for the content studio:

7. **Live text over the lens — prompter or captions?** Both: a script to read while
   filming, transcribed to subtitles afterwards. Split into **E** (deferred, PWA risk) and
   **D** (cheap, buildable).
8. **Which outside tools?** CapCut, Canva, Google AI. All three stay outside the product;
   §20.4's last table says what each is for.
9. **Who films?** The owner *and the coaches* — which is the whole reason §20.4 carries a
   review gate and why **B** exists at all.

Answered in the third round, and each one closed something:

10. **Does a guardian's grant cover their children?** **Yes** — the parent signs it at
    registration and the app reads their file. `subject_type='person'` stands, **B** is
    unblocked, and §20.5.1 became the most urgent item in the document.
11. **Does CapCut caption Hebrew?** Wrong question — it need not be CapCut, and five other
    tools do Hebrew well. §20.5.2 replaces it with a better one: *does any free editor do
    it well enough that D is not worth building at all?*
12. **How should approval work?** The system drafts, the manager approves in WhatsApp, and
    corrections go back the same way. §20.5.3 — and it reverses §20.2 for this one use.

Still open, and all three are cheap to close:

13. **Which captioning tool, if any?** One real clip through one of the five. Ten minutes,
    and it decides three days of work.
14. **Does the club want a Meta Business Portfolio?** Verification is 1–5 working days and
    a dedicated number. Needed for WhatsApp, not for push — so the loop can ship before
    this is answered.
15. **Does the club accept photographs of children passing through Meta's servers?**
    §20.5.3's last paragraph. Probably yes, but it should be a decision.
