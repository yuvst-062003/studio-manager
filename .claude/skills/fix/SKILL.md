---
name: fix
description: Use when a behavior already exists and is wrong, incomplete, or needs to change — a bug, a regression, or a change to a shipped flow
argument-hint: <what is wrong, or what should change>
---
Change: $ARGUMENTS

Every Python command is `.venv/bin/…`. A bare `pytest`/`mypy` resolves to a 3.8
interpreter earlier on PATH, and its green means nothing.

## 1. Reproduce before you diagnose

Write the failing test **first** — the one that shows the current behavior is wrong. It
is the only proof that you found the right thing, and later, the only proof that you
fixed it.

Cannot reproduce it in a test? Say so and ask, rather than fixing what you assume.

## 2. Find the cause, not the symptom

Read the surrounding code and `git log -p <file>` before editing. Much of what looks
wrong in this repo is deliberate and says so in a comment — `scripts/lane-check.sh` and
`.claude/hooks/block-protected.sh` are mostly reasoning, not code. Assume the strange
line has a reason until you have found the reason it does not.

Name the cause out loud before editing. A change that makes the test pass without an
explanation of *why it was failing* is a guess wearing a green check.

## 3. Hold the scope

Fix what was asked. Adjacent problems get **reported**, not fixed — an unrelated change
riding along in the diff is a change nobody reviewed.

Stop and escalate if the fix needs any of these. They are contract changes owned by
`main`, one revision per wave, and a lane never authors them:

- a schema change — anything needing `alembic revision`
- a new i18n namespace (`web/packages/i18n/index.ts` is authored once, never by a lane)
- a change to a schema another vertical reads

## 4. Gate — scoped to the blast radius

Name the vertical the change lands in, then:

```
./scripts/lane-check.sh <vertical>
```

That runs `tests/invariants` and `tests/restrictions` unscoped every time, plus this
vertical's backend, types, frontend, lint, CSS and i18n gates. Run a second vertical's
check only if the change actually reaches it — a full-suite re-run is not extra safety,
it is a slower way to learn the same thing.

Touched a shared package under `web/packages/`? Add `npm run typecheck` — a lane check
type-checks Python, not TypeScript across app boundaries.

## 5. The failing test stays

It is the regression guard. Deleting it once the fix is in leaves the bug free to come
back unnoticed, and the next person with no evidence it was ever fixed.

## 6. Land it

`docs/plan/state.yaml` usually does **not** change — a bugfix is not a piece. Tick a
piece only if this change is what completes it.

Stage by explicit path. Other sessions commit to this repo concurrently, so `git add -A`
sweeps up their work.

## Report

The cause, the change, the test that proves it, and the gate output. If something
adjacent is still broken, name it here instead of fixing it.
