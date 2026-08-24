# Competitive benchmark — studio management apps

**Date:** 2026-08-23
**Purpose:** Establish what the neighbours do, and where Studio Manager should
deliberately diverge, before setting a visual direction.

**Method and its limits.** This is built from marketing sites, feature pages and
product descriptions. The Arbox App Store listing returned 429 and the Play Store
package id guess 404'd, so **no actual app screenshots were inspected**. Structural
and feature claims below are well-sourced; specific colour and type claims are
inferred from marketing sites and should be treated as impressions, not facts.

---

## 1. Boostapp (boostapp.co.il) — the closest competitor

Israeli, Hebrew-native, RTL-native. Targets studio owners, coaches, group class
managers. The single most relevant benchmark because it solves the RTL problem
in the same market.

**Structure**
- Top horizontal nav, RTL-native flow
- Card-based feature modules
- Phone-number OTP login — *not* Google/Apple. We use OAuth (SPEC §5.2), a
  deliberate divergence.
- Member app home = **the list of classes you have booked**
- "הרשמה חדשה" → class list with times, availability, waitlist
- Each booked class shows remaining cancellation window + cancel button
- "אזור אישי" personal area holds profile + "טופס אישור רפואי" (medical clearance form)

**Visual impression**
- Blue primary, white/grey grounds, high contrast
- System-ish sans for Hebrew
- Emoji used as feature iconography (🧘‍♀️ 🏋️ ⚽️ 🚀) alongside custom SVG
- Stock fitness photography, aspirational tone
- Register: energetic but business-credible

**What to steal:** the medical-clearance-form-in-personal-area pattern maps
directly to our health declaration (SPEC §5.5). They put it where a parent can
find it again, not only in onboarding.

**What to reject:** emoji-as-iconography. It ages badly, renders inconsistently
across Android/iOS, and reads as unserious for a document that is a legal
health declaration about a minor.

---

## 2. Arbox (arboxapp.com) — the regional incumbent

**Structure**
- Dark blue primary, corporate/enterprise register
- Card-based components, generous whitespace, clear heading hierarchy
- Member app: book/cancel classes, weekly schedule, gym feed, memberships,
  punch-card usage, merchandise, log workout results, member-to-member interaction
- Pitch is efficiency and profit — aimed squarely at the owner, not the member
- Check-in designed as "a single access point" with visitor + appointment + visit detail

**What to steal:** the single-access-point check-in idea. Our coach marking
attendance on a mat is the same problem — everything needed on one screen, no
drilling.

**What to reject:** the feature sprawl. Merch, social feed, workout logging and
punch cards are adult-gym concerns. SPEC §2.3 already rules most of this out.

---

## 3. Glofox / Mindbody / TeamUp / Zen Planner — the anglophone field

- All LTR-first. RTL is at best an afterthought; none is a useful RTL reference.
- Zen Planner is explicitly used by **martial arts schools** — closest vertical.
- Mindbody's differentiator is a consumer marketplace. Irrelevant to us: a judo
  club has no discovery problem, the parents already chose the club.

## 4. Martial-arts-specific (Kicksite, OnMat, Wellyx, Jackrabbit Dojo, Gympify)

This cluster is the right vertical and confirms our domain model:
- **Belt / rank progression** visible in the student profile — matches SPEC §5.9
- **Family accounts**: one parent, several children, unified billing — matches §6.3
- **Parent portal**: attendance, belt rank, upcoming classes, fees, per child
- **At-risk / low-attendance flags** surfaced to staff
- Digital waivers as a first-class object — matches our health declaration

---

## The central finding

**Every product surveyed is booking-centric. Studio Manager is not a booking product.**

Their member app answers *"which class shall I book this week?"* — an adult
choosing from a rolling timetable, with waitlists and cancellation windows.

Our parent answers a completely different question: *"where does each of my kids
need to be today, do I owe money, and have I signed the forms?"* The child is
**enrolled in a group with a fixed weekly schedule** (SPEC §5.4, §5.6). There is
no browsing, no booking, no waitlist. The parent's schedule is a *given*, not a
*choice*.

Consequences for design:

1. **The parent home is a read-out, not a marketplace.** SPEC §6.3 already has
   this right: merged chronological schedule across all children, one payment
   banner, one alert list. Do not add a browse/book surface.
2. **The primary parent verbs are narrow**: pay, sign, report an absence, RSVP.
   Four verbs. Everything else is reading.
3. **Multi-child is the default case, not an edge case.** Boostapp and Arbox
   model one member = one account. We model one guardian = N students, and the
   home screen exists purely to collapse N children into one answer. This is our
   sharpest structural difference and the design should show it.
4. **The staff app's centre of gravity is attendance on a mat**, not a desk.
   Nobody in this field designs for bright light and one-handed use. SPEC §6.2
   calls for it explicitly — this is a genuine differentiator.

## Divergences we are choosing on purpose

| Field norm | Studio Manager | Why |
|---|---|---|
| Phone OTP login | Google / Apple OAuth | SPEC §5.2 |
| Book-a-class home | Fixed-schedule read-out | Children are enrolled, not booking |
| One member = one account | One guardian = N students | SPEC §6.3 |
| Adult self-service | Parent acting for a minor | Consent, health data, §5.5 |
| Emoji iconography | Real icon set | Legal documents about minors |
| Owner-facing efficiency pitch | Parent-facing clarity | The parent is the daily user |
| Automated recurring billing | Manual הוראת קבע reconciliation | Provider limitation, CLAUDE.md |

---

## Sources

- [Boostapp](https://www.boostapp.co.il/) · [Boostapp — למתאמנים](https://www.boostapp.co.il/%D7%9C%D7%9E%D7%AA%D7%90%D7%9E%D7%A0%D7%99%D7%9D)
- [Arbox — gym vertical](https://www.arboxapp.com/verticals/gym) · [Arbox check-in](https://www.arboxapp.com/blog/arboxs-gym-check-in-software-simplify-your-visitor-management) · [Arbox on the App Store](https://apps.apple.com/gb/app/arbox/id1037717356)
- [Glofox — gym software comparison](https://www.glofox.com/blog/best-gym-management-software/) · [Capterra: Mindbody vs Zen Planner](https://www.capterra.com/compare/40229-134351/MINDBODY-vs-Zen-Planner)
- [Wellyx — martial arts](https://wellyx.com/martial-arts-software/) · [Gympify — martial arts](https://gympify.com/martial-arts) · [OnMat attendance](https://onmat.app/martial-arts-attendance-software-how-onmat-tracks-every-class-every-student-every-belt/) · [Bytomic — membership tools](https://www.bytomic.com/blogs/journal/top-7-membership-management-tools-for-martial-arts)
