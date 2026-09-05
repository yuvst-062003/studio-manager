Redesign the parent app itself — the four tabs a family lives in after they have joined.

## Start here

1. **`/goals`** — open a goal for this work and keep it current, so nothing is left half-done
   and the state survives a session ending. (If the command is not available, the `ruflo-goals`
   plugin needs enabling and its `claude-flow` MCP server needs connecting first. Say so rather
   than silently working without it.)
2. **Ask before building.** Use the **AskUserQuestion** tool for anything unclear — and read §4
   below, which lists what is already decided so you do not re-ask it. Do not guess at a screen.
3. **Then build, one screen at a time, with a comparison screenshot each time.**

## 1 · The method that worked, and why to repeat it

The previous session rebuilt the four-step join wizard and the owner accepted every screen. What
made that work was not cleverness:

**The owner's own React prototype was the source of truth, and it was read directly.** Not
described, not summarised, not reconstructed from a screenshot — opened and read, file by file,
and ported markup-first with the Tailwind classes kept as written. When a value was needed that
the prototype did not have, the code degraded visibly rather than inventing one.

**Every screen was rendered and looked at before the next was started.** Both apps ran side by
side, each screen was captured at 420×900 RTL, the two were composed into one image, and the
owner said yes before anything else was built.

**The prototype's defects were ported knowingly or not at all.** Reading the code closely turned
up a pre-ticked consent box, a health form that arrived pre-answered, fake identity data that
passed validation, a national id printed on a child's card, and a signature nothing required.
Each was fixed and the fix was explained. A faithful port is not a literal one.

An earlier attempt at the same wizard — five parallel agents working from a written spec, every
gate green — was rejected outright. The difference was looking at screens.

**Do all of that again here.**

## 2 · The source

`~/Desktop/מועדון-ג'ודו-גלדיאטור-2` — the owner's AI Studio prototype of the parent app. 9,125
lines, Vite + React 19 + Tailwind v4 + `lucide-react`, Hebrew RTL, `max-w-md`.

Read it. Do not ask for exports or screenshots.

| Screen | Lines | What it is |
|---|---|---|
| `HomeScreen.tsx` | 1,620 | Club header, urgent banner (debt + missing declaration), per-child chips, 7-day strip, monthly calendar modal, session cards with absence reporting and per-session calendar reminders |
| `ProfileScreen.tsx` | 1,443 | Language and theme, contact club, **billing and debt**, attendance summary, purchase history, trainee cards → student card modal, dojo branch |
| `UpdatesScreen.tsx` | 841 | Urgent actions, club announcements, personal updates; signature, tournament, exam, schedule and receipt modals |
| `GearScreen.tsx` | 719 | Club shop: order tracker, category chips, product grid, customiser, cart, checkout, success |
| `BottomNavigation.tsx` | 120 | The four tabs |

Plus `ThemeLanguageContext.tsx` (light/dark/auto, he/en/ru) and a 524-line translations file.

## 3 · What exists today, and the gap

The parent app already has four tabs — **home · payments · messages · profile** — *plus a side
drawer* carrying seven more destinations (`myChildren`, `calendar`, `announcements`, `events`,
`shop`, `addChild`) and a footer with privacy, language, theme, sign-out and the studio switcher.

The redesign **deletes the drawer** and changes two tabs. Everything in that drawer has to land
somewhere.

## 4 · Already decided — do not re-ask

Taken with the owner on 2026-09-05:

- **Four tabs, no side menu:** בית · חנות המועדון · עדכונים · פרופיל.
- **Tab 2 becomes the shop.** Money moves into Profile: balance, payment method, history. Debt
  surfaces on Home's urgent banner.
- **Events get no dedicated surface** — they appear in Home alongside every other session.
- **Everything else follows the prototype** for where the old drawer's destinations go: calendar
  is a modal inside Home; language, theme, contact and account controls live in Profile.

## 5 · What is already in place

**Tailwind is installed and scoped.** `web/apps/parent/src/tailwind.css` imports theme and
utilities but *not* preflight; an equivalent reset is scoped to `.tw-scope`. Eight tests in
`tailwind.isolation.test.ts` hold that contract. Use `.tw-scope` on every ported subtree.

**Ten CSS variables are shared between Tailwind's theme and the design system**
(`--font-sans`, four `--leading-*`, five `--radius-*`). `tokens.css` is unlayered so it wins at
`:root`; Tailwind's nine are restored inside `.tw-scope`. Do not "tidy" this — read the comment
first.

**`lucide-react` is available.** The wizard under `features/onboarding/wizard/` is the worked
example of the house style for ported screens: a `content.ts` for strings, a `useDialog` hook
giving every modal a focus trap and an Escape key, real radio inputs instead of clickable divs.

## 5.1 · Who does what

**Opus plans, reviews and owns every checkpoint. Sonnet writes the code.**

Dispatch Sonnet file-to-file: a named source in the prototype, a named target in this repo, and
a task statable in one sentence — "port this component's markup into that file, replace these
constants with these props, keep every class". That handoff is safe because the source is code
Sonnet can read, not prose it has to interpret.

**Never hand Sonnet a screen to build from a description.** That is the handoff that failed: the
earlier wizard attempt dispatched five agents from a written spec and every screen came back
wrong while every gate stayed green.

Opus reads every diff before it lands, runs the verification itself, composes the comparison
images and looks at them. A green subagent report is not evidence — only a rendered screen is.

## 6 · Order

One tab per checkpoint. Suggested order, but ask if you disagree:

1. **The shell** — the four-tab bar, the removal of the drawer, and where each drawer destination
   went. This is the structural decision; get it looked at before building screens onto it.
2. **בית** — the largest and the one a family opens every day.
3. **עדכונים**
4. **חנות המועדון**
5. **פרופיל** — biggest surface area, and where money now lives.
6. **Strings into `web/packages/i18n`**, mirrored into `en/` and `ru/`. Last, so nothing is
   translated twice.

## 7 · Rules that will bite you

- **Verify from `web/`, never from a subdirectory** — `npm run typecheck` and `npm run lint`
  resolve the wrong tsconfig inside `apps/parent`.
- **No string inlined in a component.** A lint rule enforces it.
- **No new UI dependency without asking** (`.claude/rules/ui-rtl-a11y.md`).
- **Money is integer agorot.** Never a float, never a division by 100 outside a formatter.
- **Health data never reaches a log line or an `audit_log.diff`.**
- **RTL is the default and logical properties are required** — `margin-inline-start`, never
  `margin-left`. The prototype uses physical ones in places; fix them on the way past.
- **Screenshots go in `docs/screenshots/parent-app-checkpoints/<tab>/`** — composed comparison at
  the top, raw captures under `raw/`, named by what they show. Never leave PNGs in the repo root;
  Playwright writes to the working directory, so move them after capturing.
- Other sessions commit to this repo. Stage by explicit path, never `-A`.

## 8 · Done means

All four tabs run the new design, the drawer is gone and every one of its destinations has a
home, strings are in `@studio/i18n` with Hebrew, English and Russian, and each tab has been
looked at as a rendered screen beside the prototype and accepted.

Before claiming any of that, invoke **`superpowers:verification-before-completion`**: run the
checks, show the output, then make the claim. If an item is outstanding, do not say the redesign
is finished — say which remain and what blocks each.

## 9 · Related work

The join wizard is a separate, earlier piece — `docs/plan/prompts/finish-join-wizard.md` and its
two specs. The two touch the same app but not the same screens. If both are in flight, the wizard
owns `features/onboarding/`, this work owns everything else.
