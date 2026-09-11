# Legal, consumer and accessibility audit — Studio Manager

**Date:** 2026-09-08
**Scope:** the public landing page, the three PWAs, and the data the backend holds.
**Status:** audit and decisions. No code changed. The plan that acts on this is
`docs/superpowers/plans/2026-09-08-legal-and-accessibility.md`.

---

## 0. What this document is, and what it is not

I am not a lawyer and this is not legal advice. This is an engineering audit: I read
the code, found where it does and does not meet a duty I can name, and wrote down which
statute I believe creates that duty so an Israeli lawyer can check my reading in an hour
instead of a week. Every legal claim below is marked with how confident I am:

- **Settled** — I am confident in the rule and that it applies here.
- **Check** — I believe the rule applies but a threshold, a date or an exemption needs
  a lawyer's confirmation before we rely on it.

The single most valuable output of this audit is not the code changes. It is
[§7 Decisions the owner must make](#7-decisions-the-owner-must-make) — five questions
only you can answer, three of which block work.

**One mechanic to know before reading further.** `app/services/privacy/policy.py` holds
`POLICY_VERSION = 2`. The terms and privacy policy text now shipping was reviewed and
approved on 2026-09-01. `ConsentService.outstanding` requires a grant *at the current
version*, so **any change to the wording of those two documents raises the version and
re-gates every family**, who must accept again before they can use the app. That is
correct and deliberate. It means: batch the text changes, get them all reviewed together,
and bump once.

---

## 1. Executive summary

The codebase is in better shape than the request assumed. There is a reviewed privacy
policy and terms of service, a versioned consent ledger, encryption on health answers, an
append-only audit log, tenant isolation that fails closed, an accessibility menu with a
statement, contrast tooling with a published audit, self-hosted fonts, and **no analytics,
no advertising pixels and no third-party trackers of any kind**. Several items on the
request are already done.

Six things are genuinely missing or wrong. In descending order of how likely they are to
cost you money:

| # | Finding | Why it bites |
|---|---|---|
| 1 | **The terms of service name no legal entity, and carry no limitation of liability.** [`en/reports.ts:93`](web/packages/i18n/en/reports.ts#L93) says only "operated for the club". | A contract with no named party and no liability cap, for a product that holds minors' medical data and gates who steps onto a mat. This is the clause that stands between a training injury and your personal assets. |
| 2 | **The public landing page links to nothing legal.** [`PublicLanding.tsx:648-676`](web/apps/parent/src/features/landing/PublicLanding.tsx#L648-L676) — the footer has a brand, anchors, a phone and a copyright line. No privacy policy, no terms, no accessibility statement, no business details. | This is the one page a stranger sees, and it advertises monthly prices and takes a booking. Israeli accessibility regulations carry statutory damages of up to ₪50,000 **without proof of damage**, and there is an active plaintiff bar in Israel filing exactly this suit. |
| 3 | **Marketing claims that cannot be substantiated, and testimonials of unverified provenance.** [`clubContent.ts`](web/apps/parent/src/features/landing/clubContent.ts) — "the leading judo club", "1000+ students have trained here", two named quotes, one attributed to a 15-year-old. | Consumer Protection Law §2 prohibits misleading a consumer, in advertising included. A fabricated testimonial is the textbook case. |
| 4 | **No consumer cancellation route, and no refund policy at all.** `cancel_subscription` at [`billing.py:1358`](app/routers/billing.py#L1358) is manager-only; the parent app has no cancellation anywhere. | For an ongoing transaction sold at a distance, Israeli law requires an online cancellation route when joining is online, plus a prominent cancellation link. See [§4.2](#42-distance-selling-and-cancellation). |
| 5 | **Prices shown with no VAT statement and no business details.** [`clubContent.ts:169`](web/apps/parent/src/features/landing/clubContent.ts#L169) — three tiers at ₪300/₪400/₪550 per month. | Distance-selling disclosure requires the seller's name, company or business number, address, the price including VAT, and the cancellation terms — before the transaction. |
| 6 | **No security response headers at all.** No Content-Security-Policy, no X-Frame-Options, no Referrer-Policy, no Strict-Transport-Security anywhere in `app/` or `infra/`. | The uPay payment form runs in an `<iframe>` inside our page. PCI DSS v4 pushed script-integrity duties onto the page that *hosts* the payment iframe, and a CSP is how that is met. |

And one finding that is good news, because it answers a question you asked:

> **You do not need a cookie banner.** See [§3](#3-cookies-storage-and-tracking--the-answer-is-no-banner).

---

## 2. What is already right (do not rebuild these)

Recording this so nobody spends a day re-solving a solved problem.

- **A reviewed privacy policy and terms of service**, in three languages, covering
  controller identity, what is collected, mandatory-versus-voluntary, purposes, health
  data, recipients, retention, subject rights, withdrawal, security, minors, and
  complaints to the Privacy Protection Authority.
  [`he/reports.ts`](web/packages/i18n/he/reports.ts), rendered by
  [`PolicyDocument.tsx`](web/packages/ui/src/legal/PolicyDocument.tsx).
- **A versioned, append-only consent ledger** —
  [`consent.py`](app/services/privacy/consent.py). A withdrawal is a new row, never an
  edit. Consent is recorded against the version the screen actually rendered, and a
  mismatch is rejected.
- **Consent is a hard gate.** `REQUIRED_CONSENT_TYPES` blocks the app until terms and
  privacy are both accepted.
- **Health data is encrypted at rest** with keys held outside the database, opened only by
  a manager, and every opening is written to an append-only log. Coaches see derived flags,
  never answer text. This is the strongest part of the system and it is exactly what the
  Data Security Regulations ask for.
- **Data subject rights are wired**: export and erasure requests exist
  ([`requests.py`](app/services/privacy/requests.py), [`privacy.py`](app/routers/privacy.py)),
  with an honest failure message today because the worker is not finished
  (`privacy.export.failedHelp`). Honest beats silent.
- **No analytics, no pixels, no tag manager, no session recording, no error-reporting SDK.**
  I searched for Google Analytics, Tag Manager, Meta pixel, PostHog, Mixpanel, Hotjar,
  Clarity, Plausible, Umami and Sentry across `web/` and `app/`. Zero hits.
- **Fonts are self-hosted** ([`fonts.css`](web/packages/ui/src/fonts.css)) — no request to
  `fonts.googleapis.com`, so no IP address leaks to Google on page load.
- **An accessibility menu already exists** with text scaling, high contrast, reduced
  motion and link underlining, mounted on every signed-out surface and reachable signed-in
  from the profile and account screens
  ([`AccessibilityMenu.tsx`](web/packages/ui/src/primitives/AccessibilityMenu.tsx)).
- **Contrast is measured, not asserted.** [`contrast.ts`](web/packages/ui/src/contrast.ts)
  plus [`tokens.audit.test.ts`](web/packages/ui/src/tokens.audit.test.ts) fail the build on
  a token that drops below the published floor.
- **Every `<img>` in the codebase has an `alt` attribute.** I checked all 23. Decorative
  images correctly use `alt=""` with `aria-hidden`.
- **Clickable elements are real buttons and links.** The only `onClick` on a `<div>` is a
  modal scrim, which is `aria-hidden` and duplicated by a real close button. Several code
  comments show the team already rejected `<div onClick>` on accessibility grounds.
- **Sections are landmarked** — `aria-labelledby` on every landing section, a labelled
  `<nav>`, `role="dialog"` with `aria-modal` on the booking dialog.
- **YouTube uses `youtube-nocookie.com`** and refuses to load YouTube's IFrame API script,
  talking to the player over `postMessage` instead.

---

## 3. Cookies, storage and tracking — the answer is no banner

You asked whether you need cookie consent. **My reading: no, and the reason is worth
writing down so it stays true.**

**What the site actually stores.** Exactly one cookie:

| Name | Set where | Purpose | Attributes |
|---|---|---|---|
| the refresh cookie | [`refresh.py:55`](app/services/identity/refresh.py#L55) | Keeps you signed in | `httpOnly`, `secure`, `SameSite` |

Plus `localStorage` for: theme, chosen language, accessibility adjustments, an onboarding
draft keyed per invite token, a push-notification-declined timestamp, a technique shelf, and
birthday-greeting state. All first-party, all functional, none of it leaves the device.

**Why no banner (Check).** Israel has no cookie-consent statute. The Privacy Protection
Authority's guidance on tracking technologies treats the placing of trackers that go beyond
what is necessary to deliver the service as processing that needs a legal basis and notice.
A strictly-necessary authentication cookie and functional local storage are not that. There
is nothing here to consent to and a banner asking for consent you do not need is itself a
dark pattern.

**What must be true for that to stay the answer.** Three conditions, and the plan turns
each into something the build enforces rather than something we remember:

1. No analytics, advertising or session-recording script is ever added.
2. Third-party embeds stay click-to-play or are disclosed.
3. The policy tells people what is stored and why, in a section that exists.

Today condition 3 fails: the privacy policy has **no cookie or storage section at all**.
Task 9 of the plan adds one. Task 10 adds a test that fails the build if a tracker is ever
introduced, so the day someone drops a Google Analytics tag in, the build tells them they
now owe a banner rather than a court telling them later.

**Third-party embeds, in full.** These are all of them:

| Origin | Where | What it means |
|---|---|---|
| `app.upay.co.il` | Payment iframe, [`PaymentsSection.tsx:102`](web/apps/parent/src/features/billing/PaymentsSection.tsx#L102) | The card form is uPay's, in an iframe. We never see a card number. Disclose as a processor — the policy already does. |
| `youtube-nocookie.com` | Technique videos, [`TechniquePlayer.tsx:22`](web/apps/parent/src/features/techniques/TechniquePlayer.tsx#L22) | The iframe mounts with the screen, so a request reaches Google (IP, referrer) before anyone presses play. `nocookie` defers cookies until playback, not the request. **Recommendation:** a click-to-play facade, and disclose it either way. |
| `wa.me`, `maps.google.com`, `waze.com` | Outbound links | Plain links. Nothing loads until clicked. Needs `rel="noopener noreferrer"` and a `Referrer-Policy`. |
| Google Sign-In | OAuth | Already disclosed in `privacy.policy.s6.body`. |

---

## 4. Consumer law — the landing page is a shop, and it is not dressed as one

### 4.1 Misleading claims (Settled)

Consumer Protection Law 5741-1981 §2 prohibits doing anything — in an act, in writing, or
by omission — that is liable to mislead a consumer about any material element of a
transaction, and it applies to advertising. The Hebrew copy on the landing page contains
three kinds of exposure:

**Superlatives with no basis.** `hero.lead` opens with "the leading judo club for children
and teenagers". Either the club can point to something that makes it the leading club, or
the word comes out. "Leading" is the classic finding in a misleading-advertising complaint
because it is a factual claim wearing a puff's clothing.

**A number.** `credentials[2]` renders "1000+" as a display figure with "students have
trained here" under it. A specific number invites a specific challenge. Either the club can
produce a roll, or it becomes an unfalsifiable phrase ("generations of students").

**Achievement claims about a named person.** `coach.bio` says three consecutive years
Israeli judo champion, third in the world and second in Europe in belt wrestling, a Wingate
graduate, more than 20 years' experience. These may all be true — but they are published in
the coach's name, and if any is wrong the club published a false claim about a real person's
record. They need documentary backing on file, not memory.

**Testimonials.** [`clubContent.ts:340`](web/apps/parent/src/features/landing/clubContent.ts#L340)
carries two: one from "Yonatan's mother", one from "Daniel, 15". The file's own header
comment says they are "real people's words" — but the whole module was
**transcribed verbatim from an AI-generated design mockup** ("the approved Stitch copy"),
which is precisely how invented copy gets a provenance it never had. A design tool writes
plausible testimonials because that is what the layout needs.

This is the item I would move first, because it is the cheapest to fix and the hardest to
defend. And the second quote is attributed to a minor, which adds a publication-consent
question on top of the truth question. **Both come down unless the club produces the
signed originals.** See [§7 decision D4](#7-decisions-the-owner-must-make).

### 4.2 Distance selling and cancellation

The landing page shows three monthly plans at ₪300, ₪400 and ₪550 and a button that starts
a booking. That makes it an offer in a distance transaction for an ongoing service.

**Pre-transaction disclosure (Settled).** Consumer Protection Law §14ג requires the seller
to disclose, before the transaction: the seller's name, company or business registration
number, and address; the main features of the service; the total price **including VAT** and
every additional charge; payment terms; **the right to cancel, its terms and how to exercise
it**; and the minimum period of the transaction. The page currently gives the club's name,
address and phone. Everything else is missing. There is no VAT statement anywhere in the
codebase — I searched `app/` and `web/packages/i18n` and found none.

**Cancellation of an ongoing transaction (Check the exact amendment, Settled on the
substance).** For an ongoing transaction (עסקה מתמשכת) a consumer may cancel at any time,
with the cancellation taking effect within a few business days. A 2021 amendment added the
requirement that a business which lets a consumer *join* online must let them *cancel*
online, through a route no harder than joining, with a prominent cancellation link. Today:

- Joining is fully online — landing page, booking dialog, onboarding wizard.
- Cancelling is not possible online at all. `POST /recurring-subscriptions/{id}/cancel`
  requires staff authorisation. The parent app has no cancellation screen. A family who
  wants to leave has to phone the club.

That asymmetry is the finding. It is also the largest piece of work in the plan (Task 8),
because it needs a new consumer-facing route and a service that records the request.

**Right of cancellation for a service (Check the fee).** Cancellation Regulations
5771-2010 give a consumer a window after the transaction to cancel a service purchased at a
distance, subject to a minimum notice before the service begins, with a cancellation fee
capped at the lower of 5% or a fixed ceiling. The exact window, the notice period and the
ceiling are what the refund policy must state, and they are what a lawyer confirms. **Do
not let me write those numbers into the product.** The plan therefore builds the refund
policy as a document with the club's terms in it, and leaves the specific figures as
[decision D3](#7-decisions-the-owner-must-make).

**A trap to avoid.** The terms today say "the club sets prices and the refund policy"
([`en/reports.ts:104`](web/packages/i18n/en/reports.ts#L104)). That sentence hands the duty
to the club and provides the consumer with nothing — the consumer's statutory rights do not
depend on what the club sets, and a term that appears to contract out of them is void and
looks bad. The refund document must state the statutory floor first and the club's own terms
second.

---

## 5. Accessibility — the highest-probability lawsuit, and mostly already done

### 5.1 The duty (Settled)

The Equal Rights for Persons with Disabilities Law 5758-1998, through the Accessibility to
Service Regulations 5773-2013, requires a public-service website to conform to Israeli
Standard 5568, which adopts WCAG level AA. Enforcement is what makes this urgent: the Law
allows **statutory damages of up to ₪50,000 without proof of damage**, and Israel has an
active practice of filing these claims against websites en masse. The site does not have to
have harmed anyone.

**A possible exemption (Check).** There is a turnover-based exemption for very small
businesses from parts of the internet accessibility duty. Whether a single judo club falls
under it, and whether the exemption survives the club selling subscriptions online, is a
question for the lawyer — and it is worth asking, because if it applies, some of the
paperwork below is optional. **Do not rely on it without an answer.** The engineering work
is worth doing regardless; the paperwork is what the answer changes.

### 5.2 What the statement must contain, and what ours does not

`common.a11y.statement.*` ([`he/common.ts:46-53`](web/packages/i18n/he/common.ts#L46-L53))
gives a short paragraph inside a `<details>` element in a floating widget. Measured against
what an accessibility statement is required to carry:

| Required element | Present? |
|---|---|
| The standard applied and the level reached | Yes — names IS 5568 and WCAG 2.1 AA |
| **The date of the last accessibility check** | **No** |
| **The name and contact details of the accessibility coordinator** | **No** — it says "contact the club" |
| **Known inaccessible parts, and why** | Partly — the signature pad limitation is disclosed, well. Nothing else is. |
| How to report a problem, and the response time | Partly — no time commitment |
| Reachable from every page | **No** — the landing page footer does not link to it |

**And one finding that is a risk in itself.** The statement claims conformance to WCAG 2.1
level AA. Nobody has audited the site against WCAG 2.1 AA. Publishing a conformance claim
you have not verified is a false statement in the one document a claimant reads first, and
it converts "we have some gaps" into "they said they complied". Until an audit is done, the
statement should say what is true: what has been built and tested for, what is known not to
work, and when it was last checked. Task 12 rewrites it that way.

### 5.3 Accessibility gaps found in code

Most of the request's accessibility items were already handled. These are the real ones:

1. **The landing page's own theme is outside the contrast gate.**
   [`landing.css`](web/apps/parent/src/features/landing/landing.css) defines its own
   `--gl-*` palette. Most map to audited tokens, but a set does not: `--gl-cat-*-bg` and
   `--gl-cat-*-edge` (ten values), `--gl-primary-strong`, `--gl-red: #ba1a1a`, `#d6e3ff` on
   `#0e2a52`, and the dark-mode `--gl-heading`. These paint the timetable — the page's
   densest information — and `tokens.audit.test.ts` reads `tokens.css` only, so it never
   sees them. **The most-viewed page in the product has the least-checked colour.**
2. **No `prefers-reduced-motion` block in `landing.css`**, though the accessibility menu
   offers a reduced-motion setting and other stylesheets honour it.
3. **Gallery alt text is a placeholder in one of two places.**
   [`PublicLanding.tsx:480`](web/apps/parent/src/features/landing/PublicLanding.tsx#L480)
   renders every club-uploaded photo with `alt={clubName}` — five photos, five identical
   alt strings, which tells a screen reader nothing and is worse than `alt=""`. The
   *designed* gallery at line 508 is exemplary by contrast: `galleryAlts` gives each photo
   a real description. The uploaded-photo path needs either a caption field or `alt=""`.
4. **No skip-to-content link** on any of the three apps.
5. **No `eslint-plugin-jsx-a11y`.** The config
   ([`eslint.config.js`](web/eslint.config.js)) carries `eslint-plugin-react-hooks` only.
   Standards are being met by discipline and code review. Discipline does not survive a
   contractor.
6. **No automated accessibility assertions.** No `axe`, no `pa11y`, no Lighthouse budget.
7. **The landing page has no `lang` guarantee for mixed content** — worth a pass, given
   Hebrew club data can carry English words and the reverse.

---

## 6. Data protection, security and the paperwork

### 6.1 Privacy Protection Law and Amendment 13 (Check the thresholds)

Amendment 13 to the Privacy Protection Law came into force in **August 2025**. It rebuilt
the enforcement regime: the Privacy Protection Authority gained substantially larger
administrative fines and new investigatory powers, the database registration duty was
narrowed to particular categories, and new duties attach above size thresholds.

My reading of what matters here — **each threshold to be confirmed by counsel**:

- **Health information is sensitive information.** Not in doubt. Everything the app does
  with health declarations sits in the most heavily regulated category, about children.
- **A duty to appoint a Data Protection Officer** attaches to controllers processing
  sensitive data about a large number of subjects (my reading: on the order of 100,000).
  One judo club is nowhere near. **A multi-club platform eventually could be** — this is a
  threshold to watch as the product grows, not a duty today.
- **A duty to maintain a database definitions document** attaches above a lower threshold
  (my reading: on the order of 10,000 subjects). Also not reached today.
- **The notice duty at collection** — telling a person whether they are obliged to provide
  the data, for what purpose, and to whom it goes — applies from the first record.
  `privacy.policy.s3.body` handles this well and is one of the better-drafted parts of the
  existing text.

**The conclusion is not "we are fine".** It is that the size-triggered duties are ahead of
us, the substantive duties are on us now, and the thing that needs doing today is
[§6.3 the paperwork](#63-the-documents-that-do-not-exist).

### 6.2 Data Security Regulations 5777-2017 (Settled on applicability)

A database holding health data on identifiable people falls at least at the medium security
level, and a database with more than a small number of authorised users does too. The
regulations require, at that level: a database definitions document, a written information
security procedure, access control and authorisation management, logging of access, incident
handling **including notification to the Registrar of a severe incident**, a periodic risk
survey, written agreements with anyone processing on your behalf, and a periodic audit.

**The system already implements most of the technical controls** — encryption, an
append-only audit log, role separation at the database level, tenant isolation that fails
closed, and two distinct database roles. What does not exist is any of the writing.

### 6.3 The documents that do not exist

None of these are code. All of them are what an inspector or a plaintiff asks for first.

- A **database definitions document** — what is in the database, for what purpose, who has
  access, where it lives, how long it is kept.
- A **written information security procedure**.
- An **incident response and breach notification runbook** — including who notifies the
  Registrar, within what time, and who decides.
- **Data processing agreements** with every processor: Railway (hosting and database),
  uPay (payments), Google (sign-in), and whoever delivers push. The privacy policy already
  names these processors to users, which is a promise the paperwork must back.
- A **retention schedule** — the policy already says financial records are kept for about
  seven years for tax law, and that automatic deletion is planned but not in service. That
  is honest and it is also a promise with a deadline attached.

### 6.4 Security headers (Settled)

There are none. Not in `app/`, not in `infra/`. The list to add:

`Content-Security-Policy` · `Strict-Transport-Security` · `X-Content-Type-Options` ·
`Referrer-Policy` · `Permissions-Policy` · `X-Frame-Options` (or CSP `frame-ancestors`)

The CSP is the one that carries a compliance argument as well as a security one: PCI DSS
v4 extended script-integrity and change-detection duties to the page that *hosts* a payment
iframe, which is ours. A CSP with an explicit `frame-src` for `app.upay.co.il` is the
straightforward way to meet it.

### 6.5 Where the WhatsApp bot changes this

There is an uncommitted design at `docs/superpowers/specs/2026-09-08-whatsapp-bot-design.md`
and another session is working on it. **Flagging, not blocking.**

Today the product sends push notifications and an in-app inbox, and `SPEC.md:1110`
deliberately rules out email, SMS and WhatsApp channels. That keeps it clear of the
anti-spam regime. The moment an outbound WhatsApp or SMS channel exists, Communications Law
§30א applies: a commercial message needs **prior explicit opt-in**, an unsubscribe route in
the message, and sender identification, with **statutory damages of up to ₪1,000 per
message** without proof of damage. At a hundred families that is a five-figure exposure from
one careless broadcast.

The distinction that matters is between a transactional message (a lesson cancelled, a
payment due) and a promotional one (a summer camp, a new class). The first is not a
commercial message; the second is, and needs the opt-in. **That distinction has to be built
into the channel, not into a policy document** — a `consent_record` type of `marketing`, a
per-channel opt-out, and a send path that refuses to put promotional content down a
transactional route. Cheap now, extremely expensive to retrofit.

### 6.6 Images, and the people in them

Five club photographs ship in the repo at `web/apps/parent/public/clubs/` and are published
to the open internet on the landing page. Their alt text describes children, medals,
certificates and a party. Two questions, both open:

1. **Copyright.** Who took them? If a hired photographer did, the club needs a licence or an
   assignment. Photographs of a public event taken by a parent are not automatically the
   club's to publish.
2. **The people in them.** These are identifiable minors. The consent ledger already has a
   `photo_video` type in `GRANTABLE_CONSENT_TYPES` — the mechanism exists and **nothing
   connects it to what is actually published**. There is no record tying any published
   photo to a consent row.

`privacy.policy.s3.body` promises parents that photo consent is voluntary and that refusing
does not affect participation. A published gallery that no consent record backs makes that
sentence untrue.

Third-party assets are clean: Rubik is under the SIL Open Font License and lucide-react is
ISC. Both permissive, both requiring the licence text be distributed — a `NOTICES` file,
which we do not have.

---

## 7. Decisions the owner must make

Three of these block work. I cannot answer any of them from the code.

**D1 — Who is the operator? (BLOCKING)**
The terms name no entity. Are you contracting as a company, as a licensed dealer
(עוסק מורשה) in your own name, or is the club itself the sole party and the software just
a tool you licence to them? This single answer determines: whose name goes on the terms,
who is the controller versus the processor in the privacy policy, whose business number
appears in the landing footer, whose liability the limitation clause limits — and whether a
claim about a health declaration reaches you personally. **Nothing in Tasks 4–7 can be
written until this is answered.** If you have not incorporated, this is the conversation to
have with an accountant this week, not after launch.

**D2 — Who is the accessibility coordinator? (BLOCKING for Task 12)**
A name, a phone and an email that goes in the accessibility statement and is answered.

**D3 — What are the refund and cancellation terms? (BLOCKING for Tasks 7 and 8)**
The statutory floor is the lawyer's to state. Above it: does the club pro-rate a
mid-month departure? Is there a notice period? What happens to a prepaid term? What about a
trial lesson? I will not invent these.

**D4 — Are the two testimonials real?**
If the club has the signed originals, they stay, with the minor's quote needing guardian
consent on file. If they came out of the design mock, they come down. Meanwhile the plan
removes them, because an unsubstantiated testimonial should not sit on a live page while we
find out.

**D5 — Do the gallery photos have rights and consent?**
Per photo: who owns it, and is there a `photo_video` consent from every identifiable
child's guardian? Anything without both comes down until it has both.

---

## 8. Risk register

Ranked by probability multiplied by cost, not by how hard it is to fix.

| Rank | Risk | Probability | Cost | Plan task |
|---|---|---|---|---|
| 1 | Accessibility claim against the public page | **High** — this is a filed-in-volume claim in Israel | Up to ₪50,000 statutory, no damage needed | 12, 13, 14, 15 |
| 2 | Personal liability with no corporate shield and no liability cap | Medium | Unbounded | D1, 4, 5 |
| 3 | Misleading advertising complaint over "leading" / "1000+" / testimonials | Medium | Fine, order to correct, reputational | 1, 2 |
| 4 | Consumer complaint over no online cancellation | Medium | Fine, order to change the service | 7, 8 |
| 5 | Privacy Authority interest after any incident, with no paperwork | Low, but rises with every family | Amendment 13 fines are large | 16 (documents) |
| 6 | Publishing a child's photograph with no consent record | Low | Complaint, takedown, trust | D5 |
| 7 | Anti-spam exposure once WhatsApp ships | **Certain if built without opt-in** | Up to ₪1,000 per message | §6.5 — design now |
| 8 | Payment-page script injection through a missing CSP | Low | PCI consequences, card data | 17 |

---

## 9. Reference — statutes named above

Given in English with the Hebrew name, so a lawyer can look each one up.

| English | Hebrew |
|---|---|
| Privacy Protection Law 5741-1981, and Amendment 13 (in force August 2025) | חוק הגנת הפרטיות, התשמ"א-1981; תיקון 13 |
| Privacy Protection (Data Security) Regulations 5777-2017 | תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017 |
| Equal Rights for Persons with Disabilities Law 5758-1998 | חוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998 |
| Equal Rights (Accessibility Adjustments to Service) Regulations 5773-2013, reg. 35 | תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013 |
| Israeli Standard 5568 — web content accessibility | ת"י 5568 |
| Consumer Protection Law 5741-1981 — §2 misleading, §14ג distance sale, §13ג–13ד ongoing transaction | חוק הגנת הצרכן, התשמ"א-1981 |
| Consumer Protection (Cancellation of Transaction) Regulations 5771-2010 | תקנות הגנת הצרכן (ביטול עסקה), התשע"א-2010 |
| Communications (Telecommunications and Broadcasts) Law 5742-1982, §30א — the anti-spam provision | חוק התקשורת (בזק ושידורים), התשמ"ב-1982, סעיף 30א |
| Privacy Protection Authority | הרשות להגנת הפרטיות |
