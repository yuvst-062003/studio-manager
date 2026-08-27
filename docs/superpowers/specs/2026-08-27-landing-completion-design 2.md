# Public landing page — completion spec

**Written:** 2026-08-27
**Surface:** `web/apps/parent/src/features/landing/` at `/t/<slug>` — a **real path**, not a hash,
because it goes in an Instagram bio and on a printed QR code (`features/landing/route.ts`).
**Artboards:** `13a` mobile · `13b` trial confirmed · `13c` desktop

## The documents around this one

| Document | Says |
|---|---|
| [`docs/design/landing-page-gap.md`](../../design/landing-page-gap.md) | **The authority for this surface.** A region-by-region comparison of `13a`/`13b`/`13c` against the code, separating defects from deliberate divergences, with prerequisites and a build order. **This spec does not repeat it — read it first and keep it open.** |
| [`13a`](../../design/specs/13a-parent-landing-mobile.md) · [`13b`](../../design/specs/13b-parent-trial-confirmed.md) · [`13c`](../../design/specs/13c-parent-landing-desktop.md) | The per-artboard specs — regions, states, token roles, primitives, i18n keys. |
| `docs/design/canvas/01-parent-app/Parent App.dc.html#13a` | The design of record. **Open it in a browser**; never read it as text — it is ~180 KB of inline styles and will swamp a session's context. |
| [`2026-08-27-parent-completion-design.md`](2026-08-27-parent-completion-design.md) | The parent app's spec. **L5 depends on its P1** — `13b`'s calendar button is the unreachable `EventCalendarButtons`. |

**Numbering.** Workstreams here are `L0`–`L8` — **L for landing**. The other specs use `F`
(dashboard), `P` (parent) and `S` (staff). A bare `D2`, `D7`, `D9` or `D10` is the repo's own
design decision.

## What this document is

The gap doc's verdict is exact and worth repeating once: **the contract was built, the look was
not.** The three artboards were read as a specification of *behaviour* and implemented
faithfully — 4 test files, 58 tests, all passing. They were not read as a specification of
*appearance*, and almost none of that exists.

This is the top of the lead funnel and the one screen a stranger sees first. §2.1 puts it in v1.

The gap doc deliberately *"does not change any code"* — it is the analysis. This spec is the
instruction set: it settles the three decisions the gap doc left open, adds what a running-app
probe found that a document comparison could not, and states the done-conditions.

## The three open decisions, now settled

The gap doc's build step 0 was *"decide three things — copy ownership; stats on a public
endpoint; one-step vs two-step picker."* All three are decided. **Record each in L8 with its
reasoning; do not re-open them mid-build.**

**1 · Copy is studio-editable; chrome is translated.** The club writes its own pitch, stored in
`studio.settings`. The precedent is already there: `headline`, `about` and `address` are read
from `studio.settings` today and rendered as data rather than as translated strings
(`PublicLandingOut`, [`app/schemas/people.py:504`](../../../app/schemas/people.py#L504)). i18n
keys are for **chrome only** — section headings, button labels, the disclaimer, and the error
and empty states. A shared Hebrew sentence about *"ג׳ודו לילדים מגיל 5"* is simply wrong for a
club that teaches from four.

**2 · The stats strip is cut.** Region 2 — `214 חניכים פעילים` / `18 שנים ברעננה` /
`4 מאמנים מוסמכים` — is **removed from the canvas and the specs**, not built. No field carries
the numbers, and computing them would mean publishing a live headcount on an unauthenticated
endpoint, which sits badly beside `PublicGroupOut`'s written refusal:
*"A deliberately narrow projection… No class id, no staff, no enrollment count"*
([`people.py:470`](../../../app/schemas/people.py#L470)). This is a **canvas reduction in the
same class as D9's** and L3 carries it out.

**3 · The picker spec is amended to match the code.** `13a`'s spec says *"do not build a
two-step group→slot flow"*; `BookingFlow` builds one, and the code is right. §5.4a asks group
and slot **per child**, groups filter by each child's age, and a flat chip list cannot express
*"Uri in the 18:30 group, Noa in the 16:00 one."* Amend `13a`'s spec to: **one-step chips when
there is exactly one child, the per-child flow when a sibling is added.** L4 builds region 5
around that.

## Do not "fix" these — they are correct

The gap doc lists these and they are load-bearing. Building against them would be a regression.

1. **The `13a` → `13c` collapse is already implemented, in one component.** `pageStyle:32` is
   `gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))'` and `offerStyle:49` is
   `position: 'sticky'`. At 390px the grid is one column and `sticky` is inert; at 1440px the
   offer panel parks beside the club. There are no `@media` queries because this approach needs
   none. The gap doc calls it *"the one structural decision the implementation got exactly
   right."* **Never build a second component for desktop.**
2. **The palette is exact.** `web/packages/ui/src/tokens.css` carries the canvas values verbatim.
   Reach for token roles and the artboard's colours come free — **no hex is ever transcribed**.
3. **Sign-in first, not a lead-capture form.** `13a` draws four fields and a submit; the code
   runs §5.4a's `sign-in → children → health → slot`. The spec wins and the artboard is the
   stale half: the parent authenticates *before* entering child details, so the profile exists
   the moment they finish and the funnel has one less place to leak.
4. **No capacity anywhere.** Settled 2026-08-27: a group has no cap. No remaining places, no
   `מלאה` state, no waiting list — it lived only in the design and was removed from the canvas
   and the specs. `7d`'s `42 מתוך 54` is an **event** cap, a different thing, and stays.
5. **One `.ics` with one `VEVENT` per child.** Not drawn, and right — two siblings at different
   hours would otherwise put one in the calendar and silently drop the other.
6. **`13b`'s `חתימה על ההצהרה` button is moot.** `13b` was drawn before the flow settled; the
   trial declaration is now signed at step 3, before the booking is sent. **Do not build it.**

## How to verify your work

```
./scripts/dev-db.sh up
.venv/bin/pytest -q
cd web && npx vitest run apps/parent/src/features/landing --reporter=dot
npm run typecheck && .venv/bin/mypy app
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && npm run lint
./scripts/lane-check.sh people
```

**Seed a studio with an active training year before looking at this page by hand.** The landing
answers **503** when a club has no schedule, and the page renders its `no-schedule` empty state —
which is what the parent audit measured and mistook for an unbuilt page. See L0.

---

## L0 — Re-verify, and know what the audit got wrong here

`docs/design/audit/parent.md` measures this page at *"10 lines, 157 characters — byte-identical
at 390px and 1440px"* and marks it `SHELL`. **It is not a shell.** `PublicLanding.tsx` is 240
lines and renders logo, club name, headline, about, address and group cards at lines 171–215.

The mechanism is traceable: `PublicLanding.tsx:133` maps a **503** to the `no-schedule` state,
and [`public.py:107`](../../../app/routers/public.py#L107) raises exactly one —
`schedule_unavailable`, *"the club's schedule has not been built yet."* The captured studio had
no schedule, which is the trap the audit README warns about (a second `buildScenario` closes the
first training year). An empty state is byte-identical at both widths for the obvious reason.

Two consequences, both already reflected above: the audit's *"groups must be published to the
landing"* describes a feature that neither exists nor is needed
([`landing.py:94`](../../../app/services/people/landing.py#L94) filters on `is_active` alone),
and its *"shipped renders the mobile layout at every width"* is wrong — the grid collapses.

**Done when:** you have seeded a studio with an active training year, seen the full page render
at both widths, and recorded in L8 that the `SHELL` measurement was the 503 empty state.

---

## L1 — Two API fields

**Evidence.** Both are named by the gap doc's prerequisites table and both are confirmed absent.

**`phone` on `PublicLandingOut`.** The schema
([`people.py:494`](../../../app/schemas/people.py#L494)) carries `studio_name`, `slug`,
`logo_url`, `default_locale`, `headline`, `about`, `address`, `photo_urls` and `groups` — no
phone. It **blocks five places**: the hero brand row, `13c`'s top bar, both WhatsApp affordances
and the footer. Read it from `studio.settings` beside `headline` and `address`, which already
live there.

**Time of day on `PublicGroupOut`.** It carries `training_weekdays`
([`people.py:484`](../../../app/schemas/people.py#L484)) — days only — so
`ראשון וחמישי · 16:00` cannot be rendered. Region 4 and `13c`'s schedule cards both draw
`days · HH:MM`. It comes through the schedule seam (L5 in the plan's numbering, not this spec's),
the same way `training_weekdays` does.

**Mind the projection's contract.** `PublicGroupOut`'s docstring is a deliberate refusal — *"No
class id, no staff, no enrollment count"* — because this is a shop window on the open internet.
Adding a time of day is consistent with that (it is already public information); adding anything
else is not. **Do not widen it further**, and update the docstring to say what was added and why.

**Done when:** both fields ship with tests, the docstring records the addition, and no other
field has crept in.

---

## L2 — One token and two primitives

These are shared and land **before** any composition.

**A display size above `--text-display`.** `tokens.css:69` sets `--text-display: 1.5rem` (24px)
and it is the largest type token there is. `13a`'s headline is 36px and `13c`'s is 52px, so
region 1 is **not buildable from the current token set**. Adding one means adding a `TOKEN_ROLES`
entry: `tokens.audit.test.ts:62` fails the build on any `:root` token without a role, with the
message *"add these to TOKEN_ROLES — an unclassified token is an unaudited one."* **That is the
intended friction, not an obstacle to route around.**

**`SlotChips`.** A wrapping, single-select chip group with two states. `SegmentedControl` renders
one non-wrapping track and cannot do it. Region 5's picker needs it.

**A `BeltBar` full-ladder variant.** Renders the whole ladder with no "current" marker — the
belt strip in the hero. **Colours come from `belt_rank.color_hex`**, not from the canvas: the
design file carries two conflicting belt palettes and draws the black belt near-white, which is
a bug in the design file. Keep **D7**'s 1px ring — it is what stops a white belt sitting at
1.08:1 on the light ground.

**Done when:** the token has a role and the audit test passes; both primitives exist with tests
covering RTL and both themes; and the ladder variant renders from `color_hex` with its ring.

---

## L3 — Cut the stats strip from the canvas

Decision 2 above. This is a **canvas reduction**, executed the way D9's and C10's were — the
drawing changes, and a test holds it changed.

**Do.** Remove region 2 from `13a` and `13c` in
`docs/design/canvas/01-parent-app/Parent App.dc.html`, and remove the corresponding rows,
findings and token references from `13a`'s and `13c`'s specs. Add an assertion to
`tests/contracts/test_canvas_matches_spec.py` so the strip cannot return, in the same shape as
the two assertions already there — **C10** (artboard `3f` must not regain the
health-declaration attendance-block toggle) and **D9.2** (`7c` must not regain
`משקל / קטגוריה`). Note that file also asserts the artboard count is 61; check whether removing
a region changes it before you assume it does not.

**Done when:** the strip is gone from the canvas and both specs, the new assertion fails if it
returns, and the whole contract test still passes.

---

## L4 — `13a` and `13c` composition

**Read the gap doc's region table before starting.** It gives, per region, exactly what ships
today and exactly what is missing. This spec does not restate it. Regions are numbered as in
`13a`'s spec.

Build, in this order:

1. **Region 1 — the hero band.** Inverted ground, brand row (mark · club name · phone from L1),
   two-line headline at the L2 display size, subheadline, the belt strip from L2's ladder
   variant, and its caption.
2. **Region 3 — "how a trial lesson looks".** Heading plus three numbered steps. Studio-editable
   per decision 1; the heading is chrome and gets a key.
3. **Region 4 — "when you can come".** One card containing three read-only group rows, each with
   a belt accent bar, name, age range, and **days *and time*** — the time arrives with L1.
   Today this is a `<ul>` of separate `Card`s with no accent bar and no time.
4. **Region 6 — the location card.** Heading, address, map, `ניווט` and `וואטסאפ` buttons. The
   WhatsApp button needs L1's phone.
5. **Region 7 — the footer band.** Inverted ground, club identity, the one-free-trial line.
6. **Region 5 — the reservation form, opened in place.** Today a `Button`
   (`landing-start-booking`) hides a four-step wizard; in **both** artboards the open form is the
   page's centre of gravity. Open it, and render the picker with L2's `SlotChips` per decision 3
   — one-step chips for a single child, the per-child flow once a sibling is added.
7. **Photos.** `photo_urls` is returned by the API on every request and rendered nowhere. §5.4a ①
   names photos explicitly. Render them.

`13c` additionally needs the inverted top bar (mark · name · address · phone), the 52px headline,
the three schedule cards laid **across** rather than stacked, and the WhatsApp contact row pinned
to the bottom of the form panel. **The sticky panel already exists** — see "do not fix" 1.

**Done when:** both widths match their artboards region by region; every colour comes from a
token role and no hex was transcribed; the page runs correctly right-to-left and left-to-right;
and the form is open on load with no button in front of it.

---

## L5 — `13b`, the confirmation

**Build.** The 64px green check badge on `--paid` ground. The child's name in the **headline** —
`נשמר מקום לאורי` — rather than only in a card below; today `people.submitted.title` is the
generic `נרשמתם לשיעור ניסיון`. Date · time · group · **address** on one line. The `מה עכשיו`
icon rows: WhatsApp sent · health declaration · arrive ten minutes early. The calendar link as a
real `Button` rather than a bare `<a download>`. And the footer — *need to change the time?
message us*.

**Keep the per-child card.** The artboard draws one card; the code renders one per child, and
that is the **correct** call — siblings can book different groups.

**This depends on the parent spec's P1.** `הוספה ליומן` is `EventCalendarButtons`, one of the
seven components that app has built and never rendered. Wire it here rather than writing a
second one. And per "do not fix" 6, there is **no second CTA** — the declaration is already
signed by this point.

**Done when:** the confirmation names the child in its headline, the calendar button is
`EventCalendarButtons` and produces one `.ics` with one `VEVENT` per child, and no
declaration CTA appears.

---

## L6 — An anonymous page that makes no authenticated call

**Evidence.** The parent audit reports the landing issuing `GET /api/v1/auth/refresh` and taking
a **401**. `PublicLanding.tsx` makes **no authenticated call at all** — the cause is one level
up. [`App.tsx:98`](../../../web/apps/parent/src/App.tsx#L98) calls `useSession()`
unconditionally, and the landing route is not resolved until line 228.

`PublicLanding.tsx`'s own header states the rule: *"the sign-in wall stands in front of
**booking**, never in front of **reading**. A stranger tapping an Instagram link must see the
club."* An authenticated request fired on a page a stranger sees is that wall leaking.

**Build.** Resolve the public route **before** the session hook runs, and mount the landing
without ever touching it.

**Done when:** loading `/t/<slug>` signed out issues zero authenticated requests, asserted by a
test, and first paint no longer waits on a refresh that will fail.

---

## L7 — The states no artboard draws

**Evidence.** The three artboards draw a happy path. The gap doc's build step 5 names what none
of them cover, and the per-artboard specs' **States** sections are the place to record them.

**Build.** Loading. Field validation. Submit in flight. Submit failure. No bookable slots. Add
each to the relevant artboard spec's States section as you build it, since those specs are what
the next lane reads.

Two states already exist and are correct — keep them: **404** → `not-found` (*"no such club"*)
and **503** → `no-schedule`. The gap doc and L0 both explain why telling those two apart matters:
*"'something went wrong' for both would send somebody to the wrong club looking for a typo."*

**Done when:** every state renders something truthful, each is written into the artboard spec it
belongs to, and a submit failure never leaves the parent unsure whether the booking was made.

---

## L8 — The record

**Do.**

1. Add a **`## Log`** section to `docs/design/landing-page-gap.md`, newest first, and record the
   three settled decisions with their reasoning — copy ownership, the stats cut, the picker.
2. **Amend `13a`'s spec** for the picker (decision 3), so the spec and the code stop saying
   opposite things. The spec is what a lane reads; leaving it wrong is how this recurs.
3. **Retick `M3.7` honestly** in `docs/plan/state.yaml`. It reads `status: shipped, on:
   2026-08-26` for *"Artboards parent 13a/13b/13c…"*, and the appearance half was never built.
   Tick it in the same commit as the work, and never write anything measurable into that file.
4. Record what L0 found — that the `SHELL` measurement was a 503 empty state — in
   `docs/design/audit/parent.md`'s log, so the next capture does not re-file it.

**Done when:** all four are done and each decision is written down with its reasoning rather
than living only in a commit message.

---

## Order

```
L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7
                          L8 throughout
```

L1 and L2 are prerequisites for L4 and cannot be skipped: five parts of region 1 need the phone,
region 4 needs the time of day, the headline needs the token, and region 5 needs `SlotChips`.
L3 is independent and can land any time before L4. L6 is independent of all of it and is the
cheapest item here.

## Not in scope

- **Capacity, waiting lists, and "places left".** Settled: a group has no cap. Removed from the
  canvas on 2026-08-27; do not reintroduce it in any form.
- **A separate desktop component.** The grid already collapses.
- **A lead-capture form before sign-in.** §5.4a authenticates first; the artboard is the stale
  half.
- **`13b`'s declaration CTA.** Moot — signed at step 3.
- **The stats strip.** Cut by decision 2 and removed by L3.
- **Widening `PublicGroupOut` beyond a time of day.** It is a shop window on the open internet
  and its narrowness is deliberate.
- Schema migrations should be raised before they are written — `main` owns
  `alembic/versions/**`. L1's two fields read from `studio.settings` and the schedule seam, so
  neither should need one; confirm that before writing either.
