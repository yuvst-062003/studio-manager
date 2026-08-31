# Design decisions — running log

Settled decisions only. Each entry records what was decided, when, and why, so a later
reader does not reopen a closed question. Open questions live at the bottom.

---

## D1 — v1 ships one fixed design. Per-studio colours are v2.

**Decided:** 2026-08-23

A manager may upload a **logo** in v1 (already supported: `studio.logo_object_key`,
§4.3; setup wizard step 1, §5.1; roadmap item #7 blocking M1). No colour customization
in v1.

**Why:** Logo-only sidesteps the contrast problem entirely — an uploaded image cannot
fail a WCAG check the way a studio-chosen hex can. It also lets the v1 design commit
harder, since it only has to serve one club rather than survive an arbitrary hue swap.

**Consequence:** colours still live in **named tokens**, never hardcoded hex. That costs
nothing now and keeps v2 cheap. See D2 for the tier split that v2 will switch on.

## D2 — Tokens are tiered, and the tiers are not negotiable

**Decided:** 2026-08-23

| Tier | Owner | Contents |
|---|---|---|
| **Brand** | Studio (v2) | Logo, one primary hue, derived on-colour |
| **Semantic** | Product — **never overridable** | debt · paid · pending · cancelled · danger · focus ring |
| **Structural** | Product — never overridable | Type scale, spacing, radii, density, motion, component shape |

**Why:** a club branding itself red + black would otherwise swallow the debt banner
(`⚠ חוב של 320₪`), which is the most important alert in the parent app. Any club picking
green, amber or grey creates the same collision. Semantics must be immune to branding.

**Consequences for v2, recorded now so they are not rediscovered:**
1. Never render a studio's raw hex. Derive a tint ramp and **validate contrast at the
   moment the colour is set** — the wizard rejects or auto-adjusts anything that cannot
   reach 4.5:1. A colour picker in an admin screen is the most likely way to break
   [ui-rtl-a11y.md](../../.claude/rules/ui-rtl-a11y.md).
2. Brand colour is **forbidden in status positions**. Enforce with a lint rule.

## D3 — Register: dojo-restrained

**Decided:** 2026-08-23

Quiet, disciplined, high contrast. Draws on judo's own visual heritage — the white gi,
the tatami, the ranked belt. Near-neutral grounds, one deep accent, generous whitespace,
confident typography, minimal decoration.

**Why:** differentiates hardest from Arbox and Boostapp, who are both generic corporate
blue. Reads as "this club is serious" rather than "this is a fitness app". Survives being
seen next to a real dojo.

**Rejected:** belt colours as the brand palette. They are **data** — `belt_rank.color_hex`
is defined per class (§5.9) — so using them as brand would collide with rank display, and
they carry no meaning for a non-martial-art studio.

## D4 — Light / dark / auto, user-settable, on both apps

**Decided:** 2026-08-23

Three options: **Light · Dark · System**. "System" follows the OS setting, which both iOS
and Android already schedule by hour (sunset→sunrise or custom times).

**Why System rather than our own hour-based scheduler:** it delivers the requested
time-of-day switching without duplicating a scheduler the user has already configured, and
it does not override someone who deliberately runs their phone dark all day.

**Open consequence:** dark mode complicates belt-rank display. A **white belt** chip on a
near-black ground and a **black belt** chip on a near-black ground both need explicit
handling — see Q2 below.

## D5 — Dashboard is a superset of the staff app, and contains a calendar

**Decided:** 2026-08-23

Every action available on the staff phone app is available on the dashboard. Plus a
calendar. This matches §6.4 as written: *"Everything the staff app has, plus what needs a
big screen."*

Scope note: superset of the **staff** app. The parent app is itself a PWA, so parents
already have web access and the manager dashboard is not their surface.

**Calendar spec, from the Arbox teardown ([research/02](research/02-arbox-dashboard.md)):**
- **Three views only** — day, week, month. Week is the default. Arbox ships five; that is
  choice paralysis in a tool used between classes.
- **Quick View**: clicking a session opens a popover with the roster and **inline
  attendance marking** — never leave the calendar to take a register (§5.7).
- Savable filter sets (by coach, group, location).
- A session block surfaces **coverage and completion** — is a coach assigned, is it
  cancelled, has attendance been taken — *not* registration counts. Children are enrolled,
  not booking (§5.4), so capacity and waitlists are near-irrelevant to us.
- Every toggle carries a **visible state label**. An Arbox reviewer specifically reported
  being unable to tell whether a toggle was on or off.

---

## D6 — Typeface: Rubik

**Decided:** 2026-08-23 · **Verified against the Google Fonts subset manifest 2026-08-23**

Rubik is the **only** candidate covering Hebrew, Latin and base Cyrillic (U+0400–045F) in a
single family:

| Family | Hebrew | Latin | Cyrillic (base) |
|---|:--:|:--:|:--:|
| **Rubik** | yes | yes | **yes** |
| Heebo | yes | yes | no |
| Assistant | yes | yes | no |
| Noto Sans Hebrew | yes | yes | no — `cyrillic-ext` only |
| IBM Plex Sans Hebrew | yes | yes | no — `cyrillic-ext` only |

**The trap:** `cyrillic-ext` is U+0460–052F — historic and minority-language characters.
Russian lives in the base `cyrillic` range. Noto Sans Hebrew and Plex Sans Hebrew *look*
like they support Cyrillic and would silently fall back to another font the moment a
Russian-speaking parent (§6.1) reads a screen.

One family also means one loading strategy, which matters for a PWA that must work offline
(§6.1) — every extra family is another asset to cache before a coach walks into a basement.

Accepted trade-off: Rubik is slightly rounded and common in Israeli UI, which pulls against
D3's restraint. Restraint comes from weight, scale and spacing instead.

## D7 — Every belt bar carries a 1px ring

**Decided:** 2026-08-24 · from the contrast audit in [canvas-review.md](canvas-review.md)

A belt bar is never fill-only. It always carries a **1px ring in the current foreground
colour** — `#17150f` on light grounds, `#fffefb` on dark.

**Why:** fill alone makes exactly one belt disappear in each mode, and a third fails in both.

| | Ratio | |
|---|--:|---|
| White belt `#fffefb` on light ground `#f7f5f1` | 1.08:1 | invisible |
| Black belt `#17150f` on dark ground `#141311` | 1.02:1 | invisible |
| Yellow belt `#d9a800` on light ground | 2.02:1 | fails even the 3:1 non-text threshold |

Yellow is one of the most common children's grades, so that third case appears on real
rosters constantly — it is not an edge case.

One border declaration on one component fixes all three. It is also truer to the object: a
real judo belt has an edge.

**Applies to:** the belt bar beside a student name, belt progression segments, and the belt
strip on the student card. Anywhere `belt_rank.color_hex` (§5.9) is rendered as a fill.

## D8 — `#6f6b62` is the floor for any text token

**Decided:** 2026-08-24 · from the contrast audit in [canvas-review.md](canvas-review.md)

No text token may be lighter than `#6f6b62` (4.88:1 on `#f7f5f1`) in light mode.

**Retired — all fail AA on the warm ground:**

| Token | Uses in canvas | Ratio | |
|---|--:|--:|---|
| `#a8a49a` | 33 | 2.28:1 | replace with `#6f6b62` |
| `#8f8b82` | 19 | 3.12:1 | replace with `#6f6b62` |
| `#7a766d` | 9 | 4.16:1 | replace with `#6f6b62` |

**Do not fix this by lightening the ground.** The ground is `#f7f5f1` by design (D3); the
greys must darken.

**Dark mode needs no change** — every dark pair already passes, most at AAA. `#a8a49a` and
`#8f8b82` remain valid *in dark mode only*, where they measure 7.46:1 and 5.47:1. They are
dark-mode tokens, not shared ones.

## D9 — Three scope cuts from the canvas

**Decided:** 2026-08-24 · from [canvas-review.md](canvas-review.md)

1. **Cut the conversation half of parent artboard `2b`.** Keep the `עדכוני מועדון` inbox;
   drop `שיחה עם המשרד`. §2.3 lists **in-app two-way chat** as explicitly out of scope, and
   §5.11 permits exactly two levels — push, and a one-way inbox. If reaching the office is a
   real gap, it is a spec change to argue on its merits, not something to absorb via a mockup.
2. **Cut the `משקל / קטגוריה` column from dashboard artboard `7c`.** §2.2 defers weight
   categories to v2, and they imply student fields §4.3 does not carry. The rest of the
   artboard — RSVP counts, parent consent, payment status — matches §5.8 and stands.
3. **Retitle parent artboard `12f` from `קבלות ותשלומים` to `תשלומים`,** and scope the
   email affordance to card rows only. §5.10: uPay issues a חשבונית/קבלה for **card payments
   only**; the system issues no tax document for cash, bank transfer or הוראת קבע. A screen
   promising that *all* receipts live there is false for the payment methods §5.10 expects to
   be common.

## D11 — The health declaration ships with a default question set the manager can edit

**Decided:** 2026-08-24

SPEC §5.5 says the form is *"a structured template derived from the studio's existing
PDF"*. §15 item 1 made that PDF a hard blocker on the whole M4 health lane, because
without it there was nothing to derive from.

**Resolved:** ship a standard Israeli sports health declaration as the default
`health_form_template` question set, seeded by migration. A manager can **add, remove and
reword questions** in the app, and may upload their own PDF, which is stored at
`source_pdf_object_key` for reference.

**Why questions and not "sign the PDF".** The obvious cheaper design — show the parent the
declaration and take a signature — cannot work, because §5.5 also says coaches see *only*
`derived_flags`: a ⚠ badge reading אסתמה or אלרגיה on the roster. That badge is derived
from structured answers. A signature over a PDF image yields no flags, so a coach gets no
warning, a manager gets no "missing declaration" list, and reading anything at all would
mean opening the full medical record — the exact opposite of what §11.1 and §11.2 are for.
The parent's experience is unchanged and slightly better: they tap answers and sign with a
finger, rather than pinch-zooming a PDF on a phone.

**Caveat to carry into M4.** A health declaration for minors in an Israeli sports club
touches insurance and regulatory ground. The bundled template is a **starting point, and
the app must say so** where the manager edits it. It is not a compliance artefact and must
not be presented as one.

**Consequence:** §15 item 1 no longer blocks M4. Editable questions are v1 scope, not v2.

## D10 — Ban physical CSS properties before the first component

**Decided:** 2026-08-24

An ESLint rule rejecting `margin-left` / `margin-right` / `padding-left` / `padding-right` /
`left` / `right` in `web/src/**`, in favour of their `-inline-start` / `-inline-end`
equivalents.

**Why now rather than later:** `Manager Dashboard.dc.html` already carries 14 physical
declarations and zero logical ones. RTL bugs of this kind are nearly invisible to an LTR
reader, so they survive review and surface in front of Hebrew-speaking users. The rule is
cheap before `web/src/` exists and annoying to retrofit afterwards.

**Corollary:** treat the exported canvas CSS as a **visual reference only**. Never
copy-paste it into components.

## D12 — Four token values the canvas audit never measured

**Decided:** 2026-08-24 · from M0.3's computed token audit

[canvas-review.md](canvas-review.md) measured light-mode text against the **ground**
`#f7f5f1` and dark-mode text against the dark **ground** `#141311`. It never measured
anything against the card **surface** (`#fffefb` / `#1e1d1a`), never measured a chip's
text against its own tinted fill, and never measured belt fills against the dark ground
at all. Four values seeded in M0.1 fail once those pairings are computed:

| Token | Was | Measured | Needs | Now |
|---|---|--:|--:|---|
| `--border-strong` light | `#e5e0d5` | 1.21 on ground | 3.0 | `#8d8674` |
| `--border-strong` dark | `#4a4842` | 1.84 on surface | 3.0 | `#726e65` |
| `--accent` / `--paid` dark | `#3f8f52` | 4.22 on surface | 4.5 | `#4a9b5e` |
| `--cancelled` dark | `#8f8b82` | 4.34 on its tint | 4.5 | `#a8a49a` |

`--border-strong` had also been seeded one hex unit from `--border`, i.e. no distinction
at all. It now has a job: **`--border` is the decorative hairline and carries no contrast
obligation; `--border-strong` is the boundary of an interactive control and must reach
3:1** (SC 1.4.11) — a ghost button's outline is the only thing identifying it as a
control. The dark accent change also removes a collision: `#3f8f52` is artboard `4h`'s
**green belt**, and D3 requires belt colours stay distinct from semantics.

**D7 is stronger than it reads.** The audit found three failing belt fills, all on the
light ground. Against the dark ground, brown (2.38) and green (2.86) fail as well — five
belts across the two modes are invisible or sub-threshold as fills, not three. Nobody
should read D7 as a three-case patch and add a fill-only variant "just for dark".

**One correction to the canvas, not a re-litigation.** Artboard `4h` draws the `בוטל`
status chip in `#7a766d`, the only retired grey anywhere on that artboard. D8 postdates
the artboard and G11 is a global constraint, so `--cancelled` supersedes it.

**Consequence:** ratios are no longer written in comments anywhere in the token layer.
`web/packages/ui/src/tokens.roles.ts` records each token's tier and contrast obligation,
and `tokens.audit.test.ts` recomputes every ratio from the live values on every run — so
a new too-light value is caught as well as the ones D8 happened to name. A token with no
role fails the build, and a role with no token fails the build.

---

## Canvas

~62 artboards across three surfaces live in [canvas/](canvas/), reviewed in
[canvas-review.md](canvas-review.md). The design language held across 13 iterations; four
scope issues found, one of which is a SPEC.md bug.

The **component library** artboard (Manager Dashboard `4h`, `ספריית רכיבים`) is the
highest-value artboard for the code port — it is the intended source for the token and
component layer.

---

## Open questions

- ~~**Q2 — Belt chips in dark mode.**~~ **ANSWERED 2026-08-24.** Confirmed broken both ways:
  white belt on light ground is 1.08:1, black belt on dark ground is 1.02:1. Yellow belt on
  light ground is 2.02:1 and also fails. **Fix: a 1px ring in the current foreground colour
  on every belt bar** — solves all three at once. See [canvas-review.md](canvas-review.md).
- ~~**Q3 — Contrast audit.**~~ **DONE 2026-08-24.** Dark mode is clean throughout (all AA,
  mostly AAA). Light mode has three failing greys: `#a8a49a` (2.28, 33 uses), `#8f8b82`
  (3.12, 19 uses), `#7a766d` (4.16, 9 uses). `#6f6b62` at 4.88 is the lowest passing grey and
  should be the floor for any text token.
- **Q4 — Where the studio logo appears** across the three surfaces.
- **Q6 — `SignIn.tsx`: one face or three?** It lives in `@studio/ui` and takes
  `app: 'staff' | 'parent' | 'dashboard'`, so it is one screen serving all three — and
  [D14](#d14--outward-surfaces-wear-the-brand-inward-tools-wear-the-working-palette) is the
  one surface boundary it cannot be placed on. Restyling it to the brand moves the dashboard
  sign-in the owner is happy with. To be asked against a screenshot, not in the abstract.
- ~~**Q5 — Scope resolutions**~~ **SETTLED 2026-08-24 as [D9](#d9--three-scope-cuts-from-the-canvas).**
  The §2.1/§2.2 contradiction is **fixed in SPEC.md** — `trial-lesson booking` removed from
  the deferred list. The three artboard cuts (2b, 7c, 12f) are decided and **applied to the canvas**
  (2026-08-24), and the rendered result was reviewed and approved by the owner. `2b`'s
  chat was the second tab of a two-tab switcher, so the switcher went with it and the
  עדכוני מועדון inbox stands alone.

## D13 — an empty calendar cell may start a session

**Decided:** 2026-08-29 · owner request, in session

**This reverses a decision `3a` records.** The spec for the week board says of an empty grid
cell:

> Drawn as a bare bordered cell with **no "add a session here" affordance**. The only way to
> create a session is the top-bar CTA. That is a decision, not an omission to fix silently.

It is now clickable, and opens the create form anchored at that cell with the day and start
time already filled in. Recorded here so the reversal is not silent, which is what that
sentence asked for.

**Why the original reasoning still partly holds, and what changed.** `3a` was right that a
grid of forty visible buttons is a worse screen than a grid. So the cell carries **no visible
affordance**: it is a transparent button with an accessible name and nothing drawn, earning a
faint wash only on hover or focus. What changed is the task — a manager setting a club up
fills a whole timetable in one sitting, and routing every one of those through a top-bar
button that then asks for the day and time they had just pointed at is the slower path to the
same `POST /sessions`.

**Its sibling.** A long press on an existing block picks it up, and the next cell chosen
becomes its new day and time, carrying the duration. That is a `PATCH` to the route §5.6
already documents as the move control — the same write the popover's date fields perform, so
this adds an accelerator rather than a second way to change a session. It is deliberately not
built on HTML5 drag-and-drop, which is unusable with a screen reader and does not fire on
touch; the popover's date fields remain the keyboard path.

## D14 — outward surfaces wear the brand; inward tools wear the working palette

**Decided:** 2026-08-31 · owner decision, in session

The product had three visual registers and no stated rule about which surface takes which:
a navy Stitch landing page, a warm neutral parent app, and a warm neutral dashboard. A
parent's real sequence was navy landing → red split-screen sign-in → warm app, three looks
in three taps, and nobody could say which was correct.

**The rule.**

| Surface | Palette | Why |
|---|---|---|
| Public landing, **parent app** | The club's **brand** | The same person at two moments — before they join, and every week after. A family should not cross a visual border by signing in. |
| Staff app, manager dashboard | The **neutral working palette** | A tool used for hours a day by someone who works there. Its job is to recede; a saturated brand at that duration is fatigue, not identity. |

**How it is carried.** One CSS block — `[data-surface="outward"]` in
`packages/ui/src/tokens.css`, plus its dark pair — re-values the structural palette and the
brand tier. Every `@studio/ui` primitive already reads `var(--surface)`, `var(--radius-md)`,
`var(--text-title)`, so eighteen screens re-skin with **no primitive forked and no call site
touched**. The parent app's `index.html` carries the attribute on `<html>`; the staff app and
the dashboard carry nothing and are unmoved.

The two alternatives were considered and rejected: a `theme` prop on every primitive touches
every call site across three apps to solve what one block solves, and a hand-written
`parent.css` puts eighteen screens outside the tested primitives — which is where the RTL,
contrast and tap-target guarantees live.

**Named `outward`, not `parent`.** The landing and the app are the same person at two
moments; the name is what makes their later convergence possible instead of shipping a second
permanent fork. `landing.css` now reads eight of its colours from this block rather than
repeating them, so "the navy look" has one definition and the audit reads it.

**This does not touch D2.** The semantic band is not brand-tier and the outward block may not
re-value it — `tokens.audit.test.ts` fails if it tries. A club branding itself red still gets
a working debt banner, which is the whole reason D2 exists. It is also why the landing's
crimson `#ba1a1a` does **not** cross into the app: on a marketing page it is brand, and in
this app red means a family owes money. (Measured, as it happens: `#ba1a1a` reaches only
2.82:1 on the outward dark ground, so it could not have served as text there either.)

**D1's brand tier gets its first consumer.** `brand.ts` was written in v1 so that v2's colour
picker would have a guarded path rather than an improvised one, and had never been called.
The navy enters through it, which means v2's picker re-skins the landing and the app together
with contrast validated at the moment the colour is set. The ramp is derived from
`--brand-primary` rather than adding six brand tokens — otherwise a studio could set six
colours badly instead of one.

**Open, and deliberately not decided here.** `SignIn.tsx` lives in `@studio/ui` and serves all
three apps, so it is the one screen the boundary cannot classify on its own. Whether it wears
one face or three is the owner's call — see the open questions below.

## Applied vs. pending

| Decision | Recorded | Applied |
|---|:--:|:--:|
| D1–D8, D10 | yes | **yes — the token layer, primitives and lint rules landed in M0.3 (2026-08-24)** |
| D11 health template | yes | n/a — M4 |
| D12 four corrected token values | yes | **yes — `web/packages/ui/src/tokens.css`, asserted by `tokens.audit.test.ts`** |
| D9.1 cut in-app chat from `2b` | yes | **yes — edited + owner-approved 2026-08-24** |
| D9.2 cut weight column from `7c` | yes | **yes — edited + owner-approved 2026-08-24** |
| D9.3 retitle `12f` to תשלומים | yes | **yes — edited + owner-approved 2026-08-24** |
| SPEC.md §2.2 contradiction | yes | **yes — SPEC.md edited 2026-08-24** |
| C10 — `3f` loses the health-block toggle | yes | **yes — canvas edited 2026-08-26 (W6)** |
| D13 empty cell may start a session | yes | **yes — `WeekBoard.tsx`, 2026-08-29. The canvas is NOT edited: `3a` still draws an inert cell, and the affordance is invisible until hover.** |
| D14 outward wears the brand | yes | **yes — the `[data-surface="outward"]` block in `tokens.css`, the parent app's `index.html`, and `landing.css` re-pointed at it. Asserted by `tokens.audit.test.ts`, which audits all four surface-and-theme palettes and fails if the block re-values a semantic token.** |

**All three D9 rows were re-verified against the artboard markup on 2026-08-26**, because
`milestone-plan.md`'s C9 still claimed the opposite and that claim was blocking W6. They were
applied. The divergence was between two documents, not between a document and the canvas.

**The table is no longer the only record.** `tests/contracts/test_canvas_matches_spec.py`
asserts each of these against the artboard HTML and runs in every lane, so an undone edit
fails when the canvas changes rather than when someone next reads this file.
