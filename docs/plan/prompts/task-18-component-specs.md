# Task 18 — component specs for the M2–M9 artboards

Ready-to-paste opening prompt for the session that finishes
`docs/superpowers/plans/2026-08-25-foundations-w2-w5-contracts.md`.

Written 2026-08-25 by the session that carried the plan from Task 13 to Task 20 and stopped
short of 18 deliberately — the plan's own instruction is that it is "far larger than the rest"
and should be started fresh rather than rushed.

---

## Where this work stands

**Branch `feat/foundations-contracts`, in the worktree at `../studio-manager-foundations`.**

**Tasks 1–17, 19 and 20 are done and committed.** Task 18 is the only one left; when it lands,
this plan is complete. The § Session log carries every deviation, and Task 20 records the
measured verification result.

## What Task 18 actually is

53 short Markdown files under `docs/design/specs/`, one per artboard, plus a `README.md` index.
Each records **structure, states, tokens by role, RTL behaviour, and which existing primitives
and i18n keys it uses** — prose and structure, never copy-pasted canvas CSS.

The point is leverage: a lane developer opens one 60-line spec instead of a 300 KB `.dc.html`.
A spec that just paraphrases the picture is worth nothing; a spec that names the primitive, the
token role and the i18n key is worth the whole task.

## The thing that will bite you if you skip it

**Do not open the `.dc.html` files yourself.** They are ~654 KB across three exports and will
swamp the session's context in a single Read. `.claude/agents/canvas-porter.md` exists for
exactly this: it reads one artboard with bounded `offset`/`limit` and returns structure, verbatim
text, states, tokens and a component breakdown — never raw HTML. Use it, one artboard per
invocation, and run several concurrently.

`docs/design/canvas/INVENTORY.md` maps every ID to a surface, a title and its dimensions. Read
that when planning.

## Four things that landed after the plan was written, and change what a good spec says

1. **18 primitives already exist** in `web/packages/ui/src/primitives/`: `Alert`,
   `AttendanceMark`, `BeltBar`, `Button`, `Card`, `Checkbox`, `DateRangePicker`, `EmptyState`,
   `MoneyDisplay`, `ProgressBar`, `Radio`, `SegmentedControl`, `StatusChip`, `StudentRow`,
   `Switch`, `TextField`, `ThemeControl`, `Toast`. A spec should **name the primitive**, not
   describe a chip from scratch. Inventing a second status chip is the failure this task exists
   to prevent.
2. **All nine i18n namespaces now hold real keys** — `schedule`, `people`, `health`,
   `attendance`, `billing`, `events` (belts under `belt.*`), `comms`, `reports` (privacy under
   `privacy.*`), plus `common`. A spec should cite the **actual key** (`billing.openDebts.total`),
   not invent one. Where a string an artboard shows has no key yet, say so explicitly — that is
   a finding the lane needs.
3. **Five slot ids exist** in `web/packages/ui/src/slots.ts`: `student-card`, `roster-row`,
   `alert-centre`, `setup-wizard`, `dev-bar`. The five composite artboards (`2c`, `1c`/`9f`,
   `6c`, `5c`–`5f`, the dev bar) are containers whose sections belong to *different* lanes.
   Their specs must name the container's owner and each section's owner, or two lanes will edit
   one file.
4. **W5's models settled two things a spec may show**: `notification_delivery` distinguishes
   `no_token` / `denied` / `failed` (that is what artboard `4f`'s delivery report renders), and
   `data_export_request` has an `expired` state distinct from `failed` (artboard `4g`).

## Corrections to bake in, not to re-litigate

| Correction | Where |
|---|---|
| **D9.1** — `2b` keeps the `עדכוני מועדון` inbox; `שיחה עם המשרד` is **cut**. §2.3 has no two-way chat. | `2b` |
| **D9.2** — `7c`'s `משקל / קטגוריה` column is **cut**. Weight categories are v2. | `7c` |
| **D9.3** — `12f` is titled **`תשלומים`**, not `קבלות ותשלומים`, and the email affordance is **card rows only**. | `12f` |
| **D12** — `4h` draws the `בוטל` chip in `#7a766d`, the one retired grey. `--cancelled` supersedes it. | anywhere a cancelled chip appears |
| **D8** — `#a8a49a` and `#8f8b82` are **dark-mode only**; `#7a766d` is retired outright; `#6f6b62` is the light-mode floor. | every token note |
| **D7** — every belt bar carries a 1px ring in the current foreground colour. No fill-only variant. | `5b`, `5d`, `12d`, `2c` |
| **D10** — logical properties only. The dashboard export carries 14 physical CSS declarations and zero logical ones. | every spec |

The canvas still shows the pre-D9 state. That is `HB-c9-canvas`, and it is **already mitigated
in code** — `tests/contracts/test_w5_models.py` fails on a reply/thread column, and the `events`
and `billing` namespaces carry no weight/category key and the corrected `12f` title. The specs
are the last place the stale picture could mislead someone, so each affected spec should carry
a ▲ line saying what the canvas shows and what ships.

## The 53, in the plan's four batches

- **W2 (21):** `9a` `9b` `1d` `3a` `6a` `4b` `12b` · `13a` `13b` `13c` `12j` `12g` `12i` `2c`
  `11b` `9c` `9h` `3b` `3c` `4a` `6c`
- **W3 (10):** `2a` `12a` `1c` `9f` `9g` `2d` `4c` `1e` `12c` `4e`
- **W4 (19):** `1b` `12e` `12f` `11a` `3e` `5a` `5e` · `12d` `12h` `7d` `9d` `9i` `7a` `7b` `7c`
  `6b` `4d` `5b` `5d`
- **W5 (3):** `2b` `4f` `4g`

`4h` is **not** in the list — M0.3 already ported it into the token and primitive layer. `1a`,
`2e`, `9e`, `3d`, `3f`, `5c`, `5f` are M1's and are also out of scope here.

## Practical notes

- `.venv` is a **symlink** to `../studio-manager/.venv`. The `.venv/bin/` prefix is mandatory.
- Task 18 is documentation only, so no gate should move. Confirm that rather than assume it:
  the scoped suite is **433 passed, 1 skipped**, vitest from `web/` is **674 passed**, and the
  full suite is **38 red** — 14 failed, 24 errored — all enumerated in Task 20.
- Commit after each wave batch rather than once at the end, so a long session's progress
  survives. Tick that step's checkbox in the same commit.
- When the last batch lands, add a § Session log entry and note that the plan is complete.

---

## The prompt

```
Read @docs/superpowers/plans/2026-08-25-foundations-w2-w5-contracts.md — its
Global Constraints, § Session ownership boundary, Task 18, and both § Session log
sections. Read @docs/plan/prompts/task-18-component-specs.md in full: it carries
four things that landed after the plan was written and change what a good spec
says. Read @docs/design/decisions.md — D1, D2, D3, D7, D8, D9, D10, D12. Read
@CLAUDE.md.

You are in the worktree ../studio-manager-foundations, on branch
feat/foundations-contracts. Stay there. A concurrent session owns W1 · M1 in the
studio-manager tree and has uncommitted work in web/apps/**.

This session is the CONTRACT AUTHOR, never a lane. You own docs/design/specs/**
and nothing else this session. Never touch web/apps/**, alembic/versions/**,
web/packages/i18n/index.ts, web/packages/ui/src/slots.ts, app/main.py,
app/models/__init__.py, or docs/plan/state.yaml.

Tasks 1-17, 19 and 20 are done and committed. TASK 18 IS THE ONLY ONE LEFT.
Write 53 component specs plus a README index, in the plan's four wave batches.

DO NOT OPEN THE .dc.html FILES YOURSELF. They are ~654 KB and one Read will
swamp this session. Use the canvas-porter agent — one artboard per invocation,
several concurrently — and plan from docs/design/canvas/INVENTORY.md.

Each spec is prose and structure, never copy-pasted canvas CSS, and records:
  - the artboard's regions, their order and nesting
  - every state the screen has, including empty, loading and error
  - tokens BY ROLE (ground, ink, secondary, semantic status, belt), never a hex
  - RTL behaviour, and anything that must not mirror
  - which EXISTING primitive each part is — 18 already exist in
    web/packages/ui/src/primitives/, so name them rather than describing a chip
    from scratch
  - which REAL i18n key each string uses; all nine namespaces now hold real keys.
    If a string has no key yet, say so — that is a finding the lane needs.
  - for the five composite artboards, the container's owner and each section's
    owner by lane

Bake in D9.1 (2b chat cut), D9.2 (7c weight column cut), D9.3 (12f retitled,
email on card rows only) and D12 (4h's בוטל chip uses --cancelled). The canvas
still shows the pre-D9 state, so each affected spec carries a ▲ line naming what
the canvas shows and what ships.

Commit after each wave batch, ticking that step's checkbox in the same commit.

Two standing rules, both learned the expensive way on this branch:

  * The full suite is 38 red and CANNOT go green here — no Alembic revision can
    be created on this branch. Task 20 enumerates the residue exactly. This task
    is documentation only, so nothing should move: confirm the scoped gate is
    still 433 passed / 1 skipped and vitest from web/ still 674 passed.

  * If a shared gate under tests/invariants/, tests/restrictions/ or
    tests/structure/ blocks you, STOP AND ASK rather than editing it.

Run tests as: .venv/bin/pytest <paths> -q   and   cd web && npx vitest run
(vitest from web/, NOT the repo root — it resolves fixture paths from cwd).

When the last batch lands, add a § Session log entry and record that the plan is
complete.
```
