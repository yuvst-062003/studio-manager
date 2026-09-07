Merge three streams of parallel work in `/Users/yuvalstolin/Desktop/studio-manager`.
Read `CLAUDE.md` first. Nothing below is guessed — it was measured with `git merge-tree`.

## What exists

- **`feat/join-wizard-redesign`** — the main checkout, 22 commits past the fork, 0 behind
  `main`. Two sessions are already interleaved here: the **onboarding wizard** rebuild, and
  a self-contained **judo technique library** (5 commits, `feat(techniques)` /
  `docs(techniques)`).
- **`feat/parent-app-redesign`** — worktree at `.claude/worktrees/parent-redesign`, 10
  commits past the same fork. It **rewrote the parent app shell to four tabs and removed
  the drawer**, and added `alembic/versions/0021` + `0022`.
- Fork point: `2f6ebd5`.

## The conflict surface is exactly three files

| File | What to do |
|---|---|
| `web/apps/parent/src/App.tsx` | The **only real conflict**. Both sides rewrote the shell. Resolve by hand. |
| `openapi.json` | **Generated.** Do not hand-merge. |
| `web/packages/api-client/src/schema.d.ts` | **Generated.** Do not hand-merge. |

For the two generated files: take either side to get past the merge, then regenerate with
`npm run generate:api-client` from `web/` and commit the result. A hand-merged schema that
disagrees with the backend passes review and fails at runtime.

**No migration collision** — only `parent-app-redesign` adds migrations, so `0021` and
`0022` come across cleanly. Verify with `.venv/bin/alembic upgrade head` anyway.

## Before you start

The `parent-redesign` worktree has **uncommitted changes, including deletions**. Commit or
stash them in that worktree first — merging around them loses work silently.

## One thing that will look fine and be wrong

The technique library is **deliberately mounted nowhere**, which is why it caused no
conflicts. Its wiring notes in `web/apps/parent/src/features/techniques/index.tsx` describe
adding a fifth tab plus a `NAV` drawer entry — **those instructions predate the shell
rewrite and the drawer no longer exists.** Read the merged `App.tsx` and decide where the
techniques tab belongs before following them. The feature exports everything the wiring
needs (`TechniquesScreen`, `TechniqueDetail`, `matchTechniquesPath`, `techniquesTab`); only
the placement advice is stale.

Its three follow-ups still stand: promote `features/techniques/strings.ts` into
`packages/i18n/{he,en,ru}/techniques.ts` (registering the namespace in that package's
`types.ts` and `index.ts`), move `TechniqueIcon` into `packages/ui`'s `Icon.tsx`, and check
the tab label at a 360px viewport.

## Order

1. Commit or stash the worktree's uncommitted changes.
2. Merge the two branches. Say which direction you chose and why before you run it.
3. Resolve `App.tsx` by hand — **both sides matter**: the wizard's routes and gates, and
   the redesign's four-tab shell. Neither side wins wholesale.
4. Regenerate the two generated files; do not keep the merged versions.
5. Wire the techniques tab into the merged shell.

## Verify before claiming anything is done

From `web/`: `npx tsc --noEmit`, `npm run test`, `npx eslint .`, `npx stylelint "**/*.css"`.
From the root: `.venv/bin/pytest -q`, `.venv/bin/mypy app`, `.venv/bin/alembic upgrade head`.

`web/apps/parent/src/routes.reachable.test.ts` reads its route table out of `App.tsx` — if
you mount the techniques tab, that test starts guarding it, and a screen reachable from
nowhere fails there. That is the point of it.

Report what actually ran and what it said. If a suite was already failing before the merge,
get that baseline **once** on `main`, not on both branches.
