# The landing page — what `13a`/`13b`/`13c` ask for, and what actually ships

| | |
|---|---|
| **Checked** | 2026-08-27 |
| **Canvas** | [`docs/design/canvas/01-parent-app/Parent App.dc.html`](canvas/01-parent-app/Parent%20App.dc.html) — **the design of record** |
| **Artboards** | [`13a`](canvas/01-parent-app/Parent%20App.dc.html#13a) · [`13b`](canvas/01-parent-app/Parent%20App.dc.html#13b) · [`13c`](canvas/01-parent-app/Parent%20App.dc.html#13c) — jump links into that file |
| **Per-artboard specs** | [`13a`](specs/13a-parent-landing-mobile.md) · [`13b`](specs/13b-parent-trial-confirmed.md) · [`13c`](specs/13c-parent-landing-desktop.md) |
| **Code** | `web/apps/parent/src/features/landing/` |
| **Plan** | `M3.7 — Artboards parent 13a/13b/13c…`, `status: shipped`, `on: 2026-08-26` |

> **Open the canvas in a browser** to look at the actual designs —
> `file://<repo>/docs/design/canvas/01-parent-app/Parent%20App.dc.html#13a`.
> Each artboard is a `dv-opt` block with a stable `id`, so `#13a`, `#13b` and `#13c` jump straight to
> one and highlight its label. Do **not** read the file as text when planning: it is ~180 KB of
> inline styles and will swamp a session's context — the per-artboard specs and
> [the inventory](canvas/INVENTORY.md) exist for that.

**Verdict: the contract was built, the look was not.**

The three artboards were read as a *specification of behaviour* and implemented faithfully as one.
They were not read as a specification of *appearance*, and almost none of it exists. What ships is
correct, accessible, well-commented semantic HTML wrapped in design-system primitives. It is not the
page in the canvas, and at mobile width it does not resemble it.

This file explains the difference, separates the gaps that are **defects** from the divergences that
are **deliberate and correct**, and lists what has to exist before the gap can be closed. It does not
change any code.

## How this was checked

- Read `13a` (lines 16–128), `13b` (129–154) and `13c` (155–258) of
  [`Parent App.dc.html`](canvas/01-parent-app/Parent%20App.dc.html) — the line numbers are as of
  2026-08-27, after the capacity removal below — against
  [`PublicLanding.tsx`](../../web/apps/parent/src/features/landing/PublicLanding.tsx),
  [`BookingFlow.tsx`](../../web/apps/parent/src/features/landing/BookingFlow.tsx) and
  [`BookingConfirmed.tsx`](../../web/apps/parent/src/features/landing/BookingConfirmed.tsx).
- Read the server side of the contract: `PublicLandingOut` and `PublicGroupOut` in
  `app/schemas/people.py`, `LandingService` in `app/services/people/landing.py`,
  `app/routers/public.py`.
- `npx vitest run apps/parent/src/features/landing` — **4 files, 58 tests, all passing.** The gap is
  not a broken build. Everything the code claims to do, it does.

## What is faithful — do not rebuild these

**The palette is exact.** `web/packages/ui/src/tokens.css` carries the canvas values verbatim —
`#17150f`, `#f7f5f1`, `#fffefb`, `#55524a`, `#6f6b62`, `#e6e1d6`, `#1f6b3f`, `#8a5a00`. A rebuild
reaches for token roles and gets the artboard's colours for free. No hex needs to be transcribed.

**The `13a` → `13c` collapse is one component, not two.** `PublicLanding` uses a single
`grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr))` with `position: sticky` on the offer
column. At 390px the grid is one column and `sticky` is inert; at 1440px the form parks beside the
club. That is the correct reading of "the same page at two widths", and it is the one structural
decision the implementation got exactly right.

**The route.** `/t/{slug}` is a real path, not a hash, because it goes in an Instagram bio and on a
printed QR code. See `features/landing/route.ts`.

## The gap — `13a` and `13c`

Regions numbered as in the [`13a` spec](specs/13a-parent-landing-mobile.md).

| # | Region | Ships today | Gap |
|---|---|---|---|
| 1 | **Hero band** — inverted ground, brand row (mark · club name · phone), two-line headline, subheadline, seven-segment belt strip + caption | Club logo `<img>`, club name as `<h1>`, `headline` as a bare `<p>`, all on the page ground | **Absent.** No inverted band, no phone, no belt strip, no typographic hierarchy |
| 2 | **Stats strip** — three tiles (`214` / `18` / `4`) | — | **Absent**, and no field carries the numbers |
| 3 | **"How a trial lesson looks"** — heading + three numbered steps | — | **Absent.** Seven strings, none of which has a key |
| 4 | **"When you can come"** — one card, three read-only group rows with a belt accent bar, name, age range, days **and time** | `<ul>` of `Card`s: name, description, age range, weekday names | **Partial.** No accent bar, no single-card container, and **no time of day** — `training_weekdays` carries days only, so `ראשון וחמישי · 16:00` cannot be rendered |
| 5 | **Reservation form card** — open on the page, four fields, a wrapping chip group, submit, disclaimer | A `Button` (`landing-start-booking`) that reveals a four-step wizard | **Two gaps.** The form is *hidden behind a button* — in both artboards the open form is the page's centre of gravity. And the picker is a `<select>` plus radio lists, not `SlotChips` |
| 6 | **Location card** — heading, address, map, `ניווט` and `וואטסאפ` buttons | `address` as a bare `<p>` under an `<h2>` | **Partial.** No card, no map, neither button. WhatsApp needs a phone field that does not exist |
| 7 | **Footer band** — inverted ground, club identity, the one-free-trial line | — | **Absent** |
| — | **Photos** | — | `photo_urls` is returned by the API on every request and rendered nowhere. §5.4a ① names photos explicitly |

`13c` adds, and is also missing: the inverted **top bar** (mark · name · address · phone), the
**52px headline**, the stats as three bordered cards, the three schedule cards laid **across** rather
than stacked, and the **WhatsApp contact row** pinned to the bottom of the form panel. The sticky
panel itself is the one part that exists.

> **▲ The hero headline is not buildable from the current token set.** `--text-display` is
> `1.5rem` (24px) and is the largest type token there is. `13a`'s headline is 36px and `13c`'s is
> 52px. Closing region 1 means adding a display size — which means a `TOKEN_ROLES` entry, because
> `tokens.audit.test.ts` fails the build on any token without a role. That is the intended
> friction, not an obstacle to route around.

## The gap — `13b`

| Element | Ships today | Gap |
|---|---|---|
| Green check badge, 64px, `--paid` ground | — | **Absent** |
| Headline naming the child — `נשמר מקום לאורי` | `people.submitted.title` — `נרשמתם לשיעור ניסיון`, generic | **Partial.** The child's name is in a card below, not in the headline |
| Date · time · group · **address** on one line | Date, time and group, one `Card` per child | **Partial.** No address. The per-child card is the *correct* call — siblings can book different groups, which the artboard does not draw |
| `מה עכשיו` — three icon rows: WhatsApp sent · health declaration · arrive ten minutes early | Two lines of text: `bringHint`, `installApp` | **Partial.** No icons, no WhatsApp row |
| Two buttons side by side: `הוספה ליומן` · `חתימה על ההצהרה` | A bare `<a download>` for the `.ics` | **Partial.** Not a `Button`, and there is no second CTA |
| Footer — *need to change the time? message us* | — | **Absent** |

> The artboard's `חתימה על ההצהרה` button is **moot**. `13b` was drawn before the flow settled;
> the trial declaration is now signed at step 3, before the booking is sent. Do not build it.

## Divergences that are correct — do not "fix" these

**1 · Sign-in first, not a lead-capture form.** `13a` draws four fields and a submit. The code runs
§5.4a's `sign-in → children → health → slot`. The spec wins: §5.4a is explicit that the parent
authenticates *before* entering child details, so the profile exists the moment they finish and the
funnel has one less place to leak. This was [`13a` finding 1](specs/13a-parent-landing-mobile.md)
— *"one of them is wrong, and it changes the whole flow"* — and the code settled it correctly.
**The artboard is the stale half.**

**2 · No capacity anywhere.** Settled 2026-08-27 — see below.

**3 · One `.ics` with one `VEVENT` per child.** Not drawn, and right: two siblings at different
hours would otherwise put one in the parent's calendar and silently drop the other.

## Open conflict — the picker is specified twice, differently

[`13a`'s spec](specs/13a-parent-landing-mobile.md) says, of region 5:

> *"Do not build a two-step group→slot flow; the canvas has a one-step slot picker with the group
> folded into the label."*

`BookingFlow` builds exactly the two-step flow: the group is chosen per child at step 2, the session
at step 4. **The code is defensible** — §5.4a asks both questions *per child*, groups are filtered by
each child's age, and siblings of different ages are the case the picker exists for. A single flat
chip list cannot express "Uri in the 18:30 group, Noa in the 16:00 one".

But the spec and the code now say opposite things, and the spec is what a lane reads.
**Settle it before building region 5** — most likely by amending the spec to say: one-step chips when
there is exactly one child, the per-child flow when a sibling is added.

## Capacity — settled, there is no limit

A group has **no cap**. The page shows no remaining places, no `מלאה` state, and no waiting list.

The code never had it. `PublicGroupOut` refuses it in writing — *"A deliberately narrow projection…
No class id, no staff, no enrollment count"* — and `is_bookable` is session status only
(`row.status == "scheduled"`), never a count. A search for spots-left across all of `app/` and
`web/` returns nothing.

It lived only in the design — in
[`Parent App.dc.html`](canvas/01-parent-app/Parent%20App.dc.html), and nowhere else. Removed on
2026-08-27:

| Where | Removed |
|---|---|
| Canvas `13a` | `6 מקומות`, `מלאה`, `3 מקומות`; the `17:00 — רשימת המתנה` chip became a plain `ראשון 17:00` |
| Canvas `13c` | `6 מקומות פנויים`, `הקבוצה מלאה — רשימת המתנה`, `3 מקומות פנויים`; the amber "full" card border reverted to neutral; same chip change |
| Canvas `12g` | the `14/20` occupancy ratio; the waitlist line, replaced by the schedule line that belongs in that slot |
| Specs `13a` · `13c` · `12g` | the waitlist chip state, the `--pending` full/waitlist token row, the group-full states, the capacity string rows, and the findings that asked for them |

`7d`'s `42 מתוך 54 מקומות תפוסים` is **left alone** — that is an *event* cap, a different thing, and
the parent events code already cut it (`ParentEvents.test.tsx` asserts no `/מקומות/` renders).

## What has to exist before the gap can be closed

### The one real fork: who owns the marketing copy?

Roughly twenty strings on this page have no i18n key — the headline, the three stat captions, the
three trial steps, the location card, the footer. This is
[`13a` finding 2](specs/13a-parent-landing-mobile.md) and it is still open. It has two answers and
they lead to different work:

- **Translated UI** — grow a `landing.*` block in the `people` namespace, mirrored in `en/` and
  `ru/`. Every club gets the same pitch in three languages.
- **Studio-editable content** — the club writes its own words, stored in `studio.settings`.

**Recommendation: studio-editable, with translated chrome.** The precedent already exists —
`headline`, `about` and `address` are read from `studio.settings` today and rendered as data, not as
translated strings. A club's pitch, its stats and its "how a trial looks" steps are the club's words
in the club's voice; a shared Hebrew sentence about *"ג׳ודו לילדים מגיל 5"* is wrong for a club that
teaches from age four. Keep keys for the chrome only — section headings, button labels, the
disclaimer, error and empty states.

### Prerequisites

| Layer | Needed | Note |
|---|---|---|
| **API** | `phone` on `PublicLandingOut` | Blocks the hero brand row, the `13c` top bar, both WhatsApp affordances and the footer — five places |
| **API** | time of day on `PublicGroupOut` | Region 4 and `13c`'s schedule cards both draw `days · HH:MM`. Comes through the schedule seam (L5), like `training_weekdays` |
| **API** | the three stat numbers | **Needs a decision.** An active-student count on an unauthenticated endpoint sits awkwardly beside `PublicGroupOut`'s "no enrollment count". Either the stats are club-authored text, or the count is deliberately exempted — say which |
| **Tokens** | a display size above `--text-display` | Plus its `TOKEN_ROLES` entry, or the audit test fails |
| **Primitives** | `SlotChips` | Wrapping, single-select, two states. `SegmentedControl` renders one non-wrapping track and cannot do it |
| **Primitives** | a `BeltBar` full-ladder variant | Renders the whole ladder with no "current" marker. **Colours come from `belt_rank.color_hex`** — the canvas has two conflicting belt palettes and draws the black belt near-white, which is a design-file bug |
| **i18n** | the chrome keys | Scope depends on the fork above |

## Build order

0. **Decide three things** — copy ownership; stats on a public endpoint; one-step vs two-step
   picker. All three change what gets built, and two of them change the API.
1. **API fields** — `phone`, group time of day, and whatever the stats decision produces.
2. **Token and primitives** — the display size, `SlotChips`, the `BeltBar` ladder variant. These
   are shared and land before composition.
3. **`13a` / `13c` composition** — regions 1, 2, 3, 6, 7, then open the form in place (region 5) and
   put the accent bar and time on the group rows (region 4). One component throughout; the grid
   already collapses.
4. **`13b`** — badge, the child's name in the headline, the icon rows, the calendar link as a
   `Button`, the footer.
5. **Retick `M3.7`** honestly, and add the states none of the three artboards draw: loading, field
   validation, submit-in-flight, submit failure, and no-slots.


## Log

### 2026-08-27 · L0–L8 — the gap closed, and the three decisions that closed it

**Decision 1 — copy is studio-editable; chrome is translated.** The club writes its own
pitch: `headline`, `about`, `address`, and now `phone` and `trial_steps`, all in
`studio.settings.landing`, rendered as data. i18n keys carry only headings, buttons and
states. Reasoning: the precedent already existed (headline/about/address were data), and a
shared Hebrew sentence about "ג׳ודו מגיל 5" is simply wrong for a club that teaches from
four. A club that wrote nothing gets honest fallbacks (the chrome offer as the hero
headline) or the region hidden (trial steps) — never placeholder copy pretending to be theirs.

**Decision 2 — the stats strip is cut.** Removed from the canvas (13a and 13c) and from
both specs, and `tests/contracts/test_canvas_matches_spec.py::test_13a_and_13c_have_no_stats_strip`
holds it removed, in the same shape as C10's and D9.2's assertions. Reasoning: no field
carries the numbers, and computing them would publish a live headcount on an
unauthenticated endpoint — which sits badly beside `PublicGroupOut`'s written refusal
("No class id, no staff, no enrollment count").

**Decision 3 — the picker spec was amended to match the code.** 13a's spec said "do not
build a two-step group→slot flow"; `BookingFlow` builds one, and the code was the right
half. §5.4a asks group and slot per child and groups filter by each child's age — a flat
chip list cannot say "Uri at 18:30, Noa at 16:00". The amended rule: one-step `SlotChips`
for a single child (no fieldset naming anybody), the per-child flow once a sibling is
added. Both halves are pinned by tests.

**What was widened, exactly.** `PublicLandingOut` gained `phone` (from settings, L1),
`belt_ladder` (L2's rule: colours from `belt_rank.color_hex`, never the canvas — the design
file draws the black belt near-white) and `trial_steps` (decision 1). The ladder is the
first active class's by name, deterministically — a one-class club simply gets its ladder.
`PublicGroupOut` gained `training_times` (`HH:MM`, Asia/Jerusalem, a set because a group
can train at two hours) and **nothing else** — its narrowness is the contract, and the
docstring now says what was added and why.

**One artboard claim refused in 13b:** the drawn "WhatsApp sent" row is not built — nothing
sends a WhatsApp, and a confirmation must not claim a message went out. The declaration row
states the fact that is true (signed at step 3), which is also why the drawn
`חתימה על ההצהרה` button stays moot.

**L0's finding** — the audit's SHELL verdict was a 503 empty state — is recorded in
`docs/design/audit/parent.md`'s log so the next capture does not re-file it.
