# The parent app's visual redesign — eight screens through Stitch

| | |
|---|---|
| **Written** | 2026-08-31, from `main` at `f9e60ff` |
| **Surface** | `web/apps/parent/` · 390×844 · Hebrew RTL · installable PWA (§6.5) |
| **Supersedes nothing** | It *fills in* [`docs/design/proposals/parent-app-shell.md`](../../design/proposals/parent-app-shell.md), whose Provenance row for Stitch reads `NOT RUN` |
| **Canvas** | **No artboard is added.** `tests/contracts/test_canvas_matches_spec.py` holds the canvas at exactly 61; a 62nd fails the build |
| **Status** | Design approved 2026-08-31. **Step 0 shipped 2026-08-31** — all eight screens re-skinned, none rearranged. Screens 1–8 pending, each behind its own checkpoint. |

## Why this exists

The user is satisfied with the manager dashboard and not with the parent app. The gap is
visual, and it has a measurable form: [`docs/design/audit/parent.md`](../../design/audit/parent.md)
found the artboards use **1–8 distinct non-grey accents per screen and the shipped app uses
0–3**. The app is `--surface` cards on `--ground`, hairline borders, one green.

Two prior passes settled composition questions with Google Stitch — the manager home
(`projects/6650712549032240262`) and the public landing (`projects/17357394349581128197`,
design system *Bushido Junior*). `parent-app-shell.md` was written on 2026-08-29 to be the
third, and stopped at its own Appendix A:

> **The Stitch generation has not been run**; its row in *Provenance* is empty on purpose
> and must not be filled from imagination.

This spec runs it.

## The three decisions, and who made them

Recorded because each one closes an argument that would otherwise be re-litigated per screen.

| # | Decision | Made by | Consequence |
|---|---|---|---|
| 1 | **Full Stitch look**, as on the landing — not "tokens win, Stitch wins composition" | User, 2026-08-31 | This is a restyle *and* a rearrangement. The precedence rule from `MH` is superseded exactly as it was for the landing on 2026-08-30. |
| 2 | **A companion design system** — the landing's palette and fonts, re-specified for a dense logged-in app; the semantic band stays untouchable | User, 2026-08-31 | Rules out reusing *Bushido Junior* unchanged (authored for a marketing page) and rules out letting Stitch invent a third language. |
| 3 | **Eight screens**, first-run included | User, 2026-08-31 | Six from the audit, plus sign-in and the signing flow, both raised by the user. |

## Provenance

| Source | What it contributes | What is rejected |
|---|---|---|
| **Google Stitch — Step 0, the design system** | Project [`17786356207688067866`](https://stitch.withgoogle.com/projects/17786356207688067866), design system *Gladiator*, generated from [`docs/design/DESIGN.md`](../../design/DESIGN.md). It contributed the three bands as a machine-readable theme, and independently **confirmed Rubik** — `DESIGN.md` argued the landing's Hanken Grotesk and Work Sans have no Hebrew glyph, which is why the landing already ships in Rubik despite its Stitch design naming them. | Its derived `primary` `#00234d`, a tonal step darker than the landing's `#003874` that decision 2 carries across unchanged. Its `error: #ba1a1a` — the landing's brand crimson, which may not become an app colour (D14); measured at 2.82:1 on the outward dark ground, it could not have served as text there in any case. |
| **Google Stitch — per screen** | **To be filled by each screen's pass.** One row per screen, written at step 5 of the loop. Do not fill from imagination — that is the failure this file inherited. | — |
| **Screen 4 · student card** — 2026-09-01 | **Stitch produced nothing for this pass, and that is the honest row.** `generate_screen_from_text` against the project above, with the Gladiator system and every fixed constraint in the prompt, timed out; `list_screens` afterwards showed the project still holding only its `DESIGN.md` screen, so there was no generation to adjudicate and no variants to show. The pass fell back to candidates drawn directly against the code's resolved values (`[data-surface="outward"]`, `BeltBar` 8×42 with its ring, `AttendanceMark` 42×42, card 14px, button 2px). Three arrangements went to the owner; **the owner picked C, the dense ledger** — no hero, no headline figures, one hairline-separated list of labelled rows, which is `DESIGN.md`'s own stated stance that "rows are the primary container for data". | Candidate **A** (act-first: a `דורש טיפול` band that exists only when a section puts a row in it) and candidate **B** (standing-first: belt, attendance and this child's balance as three `StatTile`s above the groups). Also rejected, from within C: a `מילוי` action on the health row — `HealthGate` replaces the whole app when a declaration is missing, so that state never reaches this screen and the control would have been dead. |
| [`parent-app-shell.md`](../../design/proposals/parent-app-shell.md) | The four open composition questions; the measured deltas 2, 5, 6 and 7; the shell's region map; the rule that a trailing header action is a control sized like one | Its precedence rule, superseded by decision 1 |
| [`audit/parent.md`](../../design/audit/parent.md) | The accent-count and coloured-bar measurements | Its screen verdicts, overtaken by the P0–P12 log in its own tail |
| [`landing-page.md`](../../design/proposals/landing-page.md) | The palette, the type scale, the squared button shape, the dark equivalent — and the precedent that the user's chosen look wins over token orthodoxy | `--gl-` as a delivery mechanism (see *Approach*) |
| `SPEC.md` §5.5, §6.1, §11.6 | Which gates may block, and what a consent record must carry | — |
| Measured walk of the shipped flow, 2026-08-31 | Every number in *Screen 3* below | — |

---

## Approach — how the Stitch look reaches eighteen shared-primitive screens

The parent app renders almost entirely through `@studio/ui` primitives that the dashboard and
staff app also render. Three ways to restyle it were considered.

| | Approach | Verdict |
|---|---|---|
| **A** | **Surface-scoped token override.** A new block defines the Stitch values under `[data-surface="outward"]`, and `[data-theme="dark"] [data-surface="outward"]` for dark. Every primitive already reads `var(--surface)`, `var(--radius-lg)`, `var(--text-title)`, so all screens re-skin with no primitive forked. | **Chosen.** |
| B | A `theme` prop on every primitive. | Rejected — touches every primitive and every call site across three apps to solve what one CSS block solves. |
| C | A `parent.css` with `--pa-` classes, as `landing.css` did. | Rejected — eighteen screens hand-written outside the tested primitives. The landing is one page; this is a whole app, and the RTL, contrast and tap-target guarantees live in those primitives. |

**Named `outward`, not `parent`.** The landing and the parent app are the same person at two
moments. The name makes the later convergence possible instead of shipping a second permanent
fork.

**The navy goes in the brand tier, not the structural tier.** [`brand.ts`](../../../web/packages/ui/src/brand.ts)
is *"the ONE path a studio-supplied colour may take into the token layer"*, written in v1 so
that v2's colour picker would not have to invent one under deadline. It has never had a
consumer. This work becomes its first. Consequences:

* v1 ships navy as the product default for outward-facing surfaces.
* v2's picker re-skins the landing and the app through the one guarded path, with contrast
  validated at the moment the colour is set — `brand.ts`'s own docstring requires this.
* **D2 holds regardless of what a club picks.** The semantic band is not brand-tier, so a
  club branding itself red still gets a working debt banner.

Derive the ramp from `--brand-primary` rather than adding six brand tokens: `brandOverridesFor`
would otherwise let a studio set six colours badly instead of one.

**`landing.css` re-points at the token layer.** Its ~15 core colour definitions become
`--gl-primary: var(--brand-primary)` and so on. Its 1,026 lines of *layout* are untouched.
Without this, two files define "the navy look" and drift the first time either is edited.

---

## The design system — what goes into `DESIGN.md`

Three bands. Uploaded via `upload_design_md`, then `create_design_system_from_design_md`.

**Brand band — carried from the landing unchanged.** Navy `#003874` / `#1a4f95`, Hanken
Grotesk headlines, Work Sans body, the squared 2px button, the surface ladder
`#fcf9f8` → `#f6f3f2` → `#fff`, and the full dark equivalent `landing.css` already defines.

**Semantic band — carried from `tokens.css`, and the brand never enters it.** `--debt`
`--paid` `--pending` `--cancelled` plus tints, light and dark. This is D2, and it is why the
landing's crimson `#ba1a1a` does **not** become an app colour: red in this app means a family
owes money.

**Register — re-specified for an app, not a page.** The landing's `display-lg` is 48px; a
screen with a debt banner, an agenda and a tab bar has no 48px anything. Type stays near the
current scale (12 / 13 / 14 / 15 / 24). 44px minimum tap targets. Cards and rows, not hero
sections. No testimonial blocks, no pricing cards, no soft neomorphism.

---

## Step 0 — once, before any screen

1. Worktree with its own database (per-worktree DB in the same container; env vars beat the
   dotenv file).
2. Bring the stack up; sign in as `parent3` — the multi-child persona, so the family layer
   and the per-child repetition are both visible.
3. **Capture all eight surfaces as they ship today**, 390×844, light and dark, and look at
   them. `CLAUDE.md`: *"If it renders, render it and look."* The 2026-08-27 audit is four days
   and twelve fixes stale; this capture is the baseline every later comparison uses.
4. **Extend `tokens.audit.test.ts` to cover the new block FIRST, and watch it fail.** A second
   token block the audit does not read is not a theme, it is a fork that rots silently: every
   token added to `tokens.css` afterwards would inherit a warm value into a navy screen and
   nothing would fail.
5. Write `DESIGN.md`; create the Stitch project; upload; create the design system.
6. Build `[data-surface="outward"]` until the audit passes. Re-point `landing.css`'s colour
   variables at it.
7. Record the boundary in [`docs/design/decisions.md`](../../design/decisions.md): **outward-facing
   surfaces wear the brand; inward-facing tools wear the neutral working palette.** This turns
   "three visual registers and the staff app will have to pick a side" into a stated rule.

**Checkpoint — the user sees all eight screens re-skinned before anything is rearranged.**

### What Step 0 actually cost, recorded for the screens that follow

* **The captures are scripts, not screenshots.** `web/scripts/capture-parent.mjs` and
  `capture-signing.mjs` re-run after every screen's build, which is what makes step 7's
  "compare against the baseline" a comparison rather than a memory. Baselines are in
  `docs/design/captures/parent-baseline/`, the re-skin in `parent-outward/`.
* **The signing flow cannot be walked by clicking.** Fourteen health questions per child,
  three ת.ז. check-digit fields and a clause the server refuses unless it matches the
  answers. Each step is reached by satisfying the ones before it through the API
  (`satisfy-gates.mjs`) and photographed in the browser. Screen 3 should budget for this.
* **`/dev/sign-in-as` gives a refresh cookie, not a bearer.** Any in-page `fetch` must
  spend it on `POST /auth/refresh` first, or every studio-scoped route answers
  `no active studio` and a screen silently falls back to home.
* **Two defects were fixed rather than stepped around.** `readTokenBlock` matched
  selectors by substring, so `[data-theme="dark"]` also matched
  `[data-theme="dark"] [data-surface="outward"]` — the two palettes would have merged and
  both would have passed. And `THEME_COLOR` claimed to BE `--ground` with nothing
  enforcing it; the outward block made that false for the parent app's manifest and status
  bar. `GROUND_COLOR` is now per surface and asserted against the parsed stylesheet.
* **One structural token pair was added: `--emphasis` / `--on-emphasis`.** `--fg` was ink
  AND the emphasis fill at eighteen call sites, so re-colouring the controls would have
  re-coloured every word on the page. Equal to `--fg` on the inward surface, so the staff
  app and the dashboard do not move a pixel. Without it the re-skin was invisible: the
  first re-capture came back with a black primary button on a navy-warm ground.
* **Rubik stays.** `DESIGN.md` band 3 states why, and Stitch agreed.

---

## The per-screen loop

Run for each screen in order. Every screen stops at step 4.

1. Read the captured baseline; name the specific defects **in writing**.
2. Write the Stitch prompt — material and domain rules fixed, arrangement asked for.
3. `generate_screen_from_text`, then `generate_variants` for 2–3 arrangements.
4. **Checkpoint — show the user the variants. They pick.** Nothing is built before this.
5. Adjudicate in writing: a Provenance row in this file *and* in `parent-app-shell.md` —
   what Stitch contributed, what was rejected, why.
6. Build. Failing test first. i18n keys in the feature's own namespace, `he`/`en`/`ru`
   together. Logical CSS only.
7. Re-capture, compare against the baseline, `./scripts/lane-check.sh`, tick `state.yaml` in
   the same commit as the work.

### The prompt's fixed constraints

Every prompt carries these, because both previous generations broke the first two:

* **RTL.** Every row reads from the right edge.
* **`₪`, never `$`**, and never glued to digits by concatenation — an amount is its own element.
* **Ranges low-first** — `16:30–17:30`. Do not reverse.
* **Every tap target ≥ 44×44.** No affordance is a bare caption-sized link.
* **Never colour alone** — a status carries a word as well as a hue.
* No icon-only controls without a visible or assistive label.

---

## The eight screens

| # | Screen | Source | What the pass must settle |
|---|---|---|---|
| 1 | **Home + the shell** | `features/home/ParentHome.tsx`, `App.tsx`, `AppShell` · `TabBar` · `PageHeader` · `SectionHeader` | Where the family-filter layer goes (currently last on a screen titled *my children*). Whether the debt banner belongs on home when three surfaces show the same number. Whether the agenda row gains `2a`'s belt swatch and trailing status chip. The header row the other seventeen destinations inherit — `PageHeader` and `SectionHeader` exist in `@studio/ui` and the parent app uses neither. |
| 2 | **Sign-in** | `packages/ui/src/first-run/SignIn.tsx`, `gladiator-signin.css` | See below. |
| 3 | **The signing flow** | `features/privacy/ConsentGate.tsx`, `features/health/*`, `features/billing/PaymentSetup.tsx` | See below — the largest item in this spec. |
| 4 | **Student card** | `features/people/StudentCardSection.tsx` + five slot sections | `2c` is the richest parent artboard (8 accents, 4 bars). How five milestone-owned sections read as one card rather than five stacked boxes. |
| 5 | **Payments** | `features/billing/PaymentsSection.tsx`, `PaymentHistorySection.tsx` | Two stacked segmented pickers at 390px. The הוראת קבע double-charge warning — the only guard against paying twice, since recurring payments cannot be created programmatically and are marked paid by hand. D9.3: card rows get a receipt affordance; cash and transfer read as recorded **without implying a receipt exists**. |
| 6 | **Calendar** | `features/schedule/ChildCalendar.tsx` | Prev/next, month/week and the absence link in one band at 390px. The four-state day legend stays readable without colour alone. |
| 7 | **Inbox** | `features/comms/InboxScreen.tsx` | Read/unread: four i18n keys exist, two ship, the artboard draws none of it. Either the model has a read flag the design does not show, or the design has a resolved/outstanding axis the model does not have. This pass picks one. |
| 8 | **Profile** | `features/people/ProfileSection.tsx`, `ProfileAndLeave.tsx` | Titled **חניכים**, and its only per-child affordance is the destructive **עזיבת המועדון**. Needs the guardian's own identity block, payment method, notification state, theme control. |

### Screen 2 — sign-in, and the constraint on it

`SignIn.tsx` is not undesigned. Its header records a deliberate face:

> *The face is the Gladiator split screen (docs/design "Gladiator Login 5a", 2026-08-27):
> wordmark, red rule, role eyebrow, provider buttons over the sun-and-throw artwork.*

That is **four days older than the Stitch landing**. A parent's real sequence today is navy
Stitch landing → red split-screen sign-in → warm app: three looks in three taps. The screen is
the seam, which is the likely reason it reads wrong rather than anything about its layout.

**Open question, deliberately not answered here.** `SignIn` takes
`app: 'staff' | 'parent' | 'dashboard'` and lives in `@studio/ui`. It is one screen serving all
three apps, so restyling it moves the staff app and the dashboard sign-in — including the
dashboard the user is happy with. One face for all three, or a per-app face, is the user's
call, and it blocks nothing before screen 2. **Ask it against a real screenshot, not in the
abstract.**

### Screen 3 — the signing flow

The user's brief: *"All the data there is important. But the problem is too long to fill and
need to fill the same for the several kids. It should stay but should change. The privacy
policy and the payment can be links to watch if the user want to watch them. The health need
better design and pipeline for several kids."*

**Nothing is cut. The fix is to stop asking twice.**

#### What ships today

The gates nest three deep — `App.tsx:591–748`:

```
ConsentGate            ToS + privacy policy        — per PERSON, asked once ✓
 └ HealthGate          → AgreementFlow, PER CHILD:
    │                     1 registration   ~15 fields   ✗ repeats
    │                     2 health + signature          ✗ repeats
    │                     3 club תקנון + payment terms  — per PERSON, asked once ✓
    └ PaymentSetupGate    plan per child, payment method, summary
       └ the app
```

**Two of the three repeats are already solved.** `ClubTermsStep`'s own header: *"keyed to the
SIGNING PERSON rather than the student — which is also why a second child in the same family
never sees this step."* `ConsentGate` is per-person too. **Only registration repeats**, which
makes this one step to fix rather than three.

#### The grouping bug

Of `RegistrationStep`'s fifteen fields, **exactly two are genuinely per-child** — the child's
ת.ז. and their grade. Thirteen are household facts, and five of them sit under a card headed
`health.registration.student`:

| Card heading | Fields | Actually |
|---|---|---|
| `student` | address · city · home phone · mobile · email | **household** |
| `parents` | signer ת.ז. · aliyah year · other parent name ×2 · their ת.ז. · their mobile | household |
| `pickup` | pickup contacts | household by default, editable per child |

For a three-child family that is **45 field entries where 19 would do**.

#### The work

1. **Split registration** into a household block asked once and a child block of two fields
   per child. Child two and three become confirm-and-sign, not re-type.
2. **Policy and payment terms behind links** — tap to read if you want to. A presentation
   change only: the `consent_record`, the version echo and the 409-on-drift guard are
   untouched. That is the half that matters legally and it survives intact.
3. **Health redesign plus a real multi-child pipeline** — "child 2 of 3", carried forward,
   not restarted. The one-tap answer for a healthy child already landed (`0026729`).
4. **The payment step stays** and is redesigned rather than cut, per the user's decision.
   Note for the record: `SPEC.md:1322` says *"No payment step… there is nothing to decide up
   front"* and *"Steps 5 and 6 are the only hard gates."* Keeping `PaymentSetupGate` blocking
   therefore requires **amending SPEC.md**, which this work must do rather than leave the two
   in contradiction.

#### The validation workstream

Raised by the user: *"there is no checking for inputs. Age can be read as string like hello and
not real age. Class can be not something real."* Confirmed on **both** sides — the national ID
is the only field in the form that cannot be faked.

| Field | Client | Server (`app/schemas/agreement.py`) |
|---|---|---|
| child / signer / other-parent ת.ז. | checksum ✓ | checksum → 422 ✓ |
| address, city | non-empty | `min_length=1` |
| כיתה | non-empty | `min_length=1` |
| **mobile phone** | none | `max_length=32` only |
| **home phone** | none | `max_length=32` only |
| **email** | none | `max_length=320` — not `EmailStr` |
| שנת עליה | none | `max_length=8` |
| **pickup contact phone** | none | `max_length=32` only |

`inputMode="tel"` is a **keyboard hint**; it constrains neither typing nor pasting.

**Fix phone and email on both sides.** They are how the club reaches a guardian about a child,
on the same form that carries a health declaration, and they are validated nowhere.

**Leave כיתה and שנת עליה as free text** — both are documented deliberate choices (*"`ג'` and
`גן חובה` are both answers the paper form accepts"*). The user's point still stands for them;
the answer there is a picker with an "other" escape, not a regex, and it is optional to this
spec.

**Refuse rather than accept.** Per `CLAUDE.md`: a write that succeeds and then fails a
downstream check leaves a user repeating themselves. A 422 that names the problem costs one
round trip — and here the round trip happens *after a signature*, which is worse.

---

## Guardrails — non-negotiable whatever Stitch returns

* RTL, logical properties only (`margin-inline-start`, never `margin-left`)
* WCAG 2.0 AA / IS 5568 — 4.5:1, accessible name on every control, visible focus
* 44px minimum tap target
* No inline strings; `he` / `en` / `ru` together; `packages/i18n/index.ts` is never edited
* Money in agorot through `MoneyDisplay`; ranges through `RangeText`
* Timestamps UTC, rendered Asia/Jerusalem
* Never colour alone
* No new UI dependency without asking
* **No new artboard** — the canvas contract holds at 61
* Health declaration contents are never logged (§11.1, `CLAUDE.md` §Gotchas)

## Risks

| Risk | Mitigation |
|---|---|
| A second token block the audit does not read becomes a silent fork | Step 0.4 — the audit gate lands **before** the values, and fails first |
| Navy defined in two files drifts | Step 0.6 — `landing.css` re-points at the token layer |
| Three visual registers; the staff app has no stated side | Step 0.7 — the boundary rule in `decisions.md` |
| Restyling `SignIn` moves the dashboard the user is happy with | Screen 2's open question, asked against a screenshot |
| `parent-app-shell.md` left describing a product that no longer exists | Updated in the same commit as each screen, same discipline as `state.yaml` |
| Keeping the payment gate contradicts `SPEC.md` | Screen 3 amends `SPEC.md:1322` rather than leaving both standing |

## Open questions

1. **Sign-in: one face or three?** Screen 2. Ask against a screenshot.
2. **Does the debt banner belong on home at all?** Screen 1, for Stitch.
3. **Read/unread — flag or axis?** Screen 7, for Stitch.
4. **Pickup contacts: household or per-child?** Screen 3. Default household, editable per
   child, unless the capture shows otherwise.
