# The parent app's redesign — paste this into a new session

Repo: `/Users/yuvalstolin/Desktop/studio-manager` (branch `main`, spec at `3fe3094`)
Read `CLAUDE.md` first. Python tooling is in `.venv` — always use the `.venv/bin/` prefix.

## Goal

Make the parent app look and feel as good as the landing page, across eight screens, using
Google Stitch for composition — and cut the signing flow's repetition without dropping any
of the data it collects.

**Done means:** all eight screens re-skinned and rearranged, each one adjudicated in writing,
`./scripts/lane-check.sh` green, and a three-child family filling nineteen registration
fields instead of forty-five.

## The driver

Everything is in one spec. Read it before doing anything else:

```
docs/superpowers/specs/2026-08-31-parent-app-stitch-redesign-design.md
```

It carries the three decisions already made by the user (full Stitch look · a companion design
system · eight screens), the approach, Step 0, the per-screen loop, and the eight screens with
what each pass must settle. Do not re-litigate the decisions — they were made on 2026-08-31
and the spec records who made them and why.

Two files it depends on and you should read alongside it:

| File | Why |
|---|---|
| `docs/design/proposals/parent-app-shell.md` | The four open composition questions and the measured deltas. Its Provenance row for Stitch says `NOT RUN` — filling that row is this work. |
| `docs/design/proposals/landing-page.md` | The precedent. The user rejected a token-dressed landing and chose the full Stitch look; the same rule applies here. |

## Start here

Work through **Step 0** of the spec in order. It ends at a checkpoint where the user sees all
eight screens re-skinned before anything is rearranged. Do not start screen 1 before that.

The one step people get wrong: **extend `tokens.audit.test.ts` to cover the new
`[data-surface="outward"]` block BEFORE writing any values into it, and watch it fail.** A
token block the audit does not read is not a theme, it is a fork that rots silently.

## The checkpoint discipline — this is the point of the whole thing

Every screen stops at step 4 of the loop and waits.

```
capture → prompt → variants → ►► USER PICKS ◄◄ → adjudicate → build → re-capture
```

**Never build a screen the user has not picked a variant for.** The two previous Stitch passes
both produced output that had to be partly rejected, and the first landing pass was rejected
outright — *"the design is completely different from the one of Stitch."* The checkpoint is
what makes that cheap instead of expensive.

Adjudication is written down, in both the spec and `parent-app-shell.md`: what Stitch
contributed, what was rejected, why. A pass that builds without recording this cannot be
re-run or compared, which is the defect this whole file exists to correct.

## Traps, each one paid for already

* **Other sessions commit to `main` while you work.** Stage by explicit path. Never `git add -A`.
* **Use a worktree with its own database.** Per-worktree DB in the same container; environment
  variables beat the dotenv file.
* **`verify-types.sh` misfires in worktrees** — a fake `tsc: command not found`. Typecheck from
  `web/` at the repo root instead.
* **Seed and capture in one run.** The dev database is shared and `pytest` reads
  `settings.DATABASE_URL` directly, so data seeded in one run can be gone by the next. This bit
  the 2026-08-27 audit three times.
* **Build one scenario, not two.** A second `buildScenario` activates a second training year,
  which closes the first (`uq_training_year_one_active`), after which every student screen
  goes empty.
* **Scope test runs to what the diff can reach.** Do not re-run a suite that already passed.
* **Kill the dev backend before running E2E**, or the booking rate limit will lie to you.

## What must not move, whatever Stitch returns

RTL and logical properties only · WCAG 2.0 AA at 4.5:1 · 44px minimum tap targets · no inline
strings, `he`/`en`/`ru` together, `packages/i18n/index.ts` never edited · money in agorot
through `MoneyDisplay` · ranges through `RangeText`, low value first · `₪` never `$` · never
colour alone · no new UI dependency without asking · **no new artboard** (the canvas contract
holds at exactly 61) · health declaration contents are never logged.

## Two things the user still has to answer

Do not guess these. Ask when you reach them, with a screenshot in hand:

1. **Sign-in — one face or three?** `SignIn.tsx` lives in `@studio/ui` and serves the parent
   app, the staff app and the dashboard. Restyling it moves the dashboard the user is happy
   with. Blocks nothing before screen 2.
2. **Pickup contacts — household or per-child?** Default to household, editable per child,
   unless the Step 0 capture shows a reason not to.

## The one contradiction this work has to resolve

The user decided the payment step stays and gets redesigned rather than cut. `SPEC.md:1322`
says *"No payment step… there is nothing to decide up front"* and *"Steps 5 and 6 are the only
hard gates."* Screen 3 must **amend `SPEC.md`** to match what ships, rather than leaving the
spec and the product contradicting each other.

## When you finish a piece

Tick it in `docs/plan/state.yaml` **in the same commit as the work**, and update
`parent-app-shell.md` in that same commit so it never describes a product that no longer
exists. Write nothing measurable into `state.yaml` — no test results, no branch, no
environment health. Those are computed.
