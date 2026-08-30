---
name: feature
description: Use when adding a capability that does not exist yet — a new endpoint, screen, model, worker, or vertical slice
argument-hint: <feature name or SPEC.md section>
---
Build: $ARGUMENTS

Every Python command is `.venv/bin/…`. A bare `pytest`/`mypy` resolves to a 3.8
interpreter earlier on PATH, and its green means nothing.

## 1. Locate it before writing anything

- **Which SPEC.md section** defines it. Ambiguous spec → ask, do not guess.
- **Which piece** in `docs/plan/state.yaml`. Not there → say so before coding.
- **Which vertical** it lands in: `identity` `structure` `people` `attendance` `health`
  `billing` `events` `belts` `comms` `reports` `privacy` `core`. That name is the
  argument to `lane-check.sh`, so pick it now, not at the end.

Then state the files you will create or change, and what is explicitly out of scope.

## 2. Stop if this needs a contract change

A lane never authors these. They land on `main`, one revision per wave, in that wave's
contract commit:

- a new column, table, index — anything needing `alembic revision`
- a new i18n namespace (`web/packages/i18n/index.ts` is authored once, never by a lane)
- a change to a schema another vertical reads

Hit one → stop and report it. Guessing here is the most expensive mistake available in
this repo: two lanes invent two versions of the same seam, and the contract exists to
prevent exactly that.

## 3. Failing tests first

From the spec's acceptance criteria and the edge cases it names — not from the
implementation you are about to write.

## 4. Implement

Wiring the repo already does for you:

- Routers and models mount by **discovery**. Adding `app/routers/x.py` mounts it.
  Never edit `app/main.py` or `app/models/__init__.py` to register something.
- Business logic lives in `services/`. Routers parse, call a service, return.

`.claude/rules/` already covers API shape and RTL/a11y by path glob. These are the rest:

- **Tenancy** — `TenantMixin` on the model, `TenantSessionDep` in the route. It fails
  closed: no studio in context raises rather than returning every studio's rows.
- **Health and minor data** — `EncryptedJSON`, and never in a log message or an audit
  `diff`. Log payloads as `extra=`; an f-string has no key for the scrubber to match.
- **Audit** — `AuditService.record(...)` for anything that changes a person's record.
- **Clock** — `app.core.clock.now()` is the only one. A test fails the build on any
  other `datetime.now()` in `app/`.
- Money in agorot, integers, never floats. Timestamps stored UTC, rendered
  Asia/Jerusalem.
- Hebrew strings in `web/packages/i18n/he/<namespace>.ts`, mirrored in `en/` and `ru/`.
  Never inline a string in a component.

## 5. Gate

```
./scripts/lane-check.sh <vertical>
```

If your new router, worker, or feature directory does not follow the
`app/{services,routers,models}/<vertical>` convention, **add it to that script's `case`
branch**. Every explicit path in that file is there because a gate once went green over
code it never reached. A silently skipped gate reads as covered, which is worse than red.

## 6. Land it

Tick the piece in `docs/plan/state.yaml` **in the same commit as the work** — a piece
finished but not ticked is progress nobody can see. Never write anything measurable
there: no test results, no branch, no environment health. Those are computed.

Stage by explicit path. Other sessions commit to this repo concurrently, so `git add -A`
sweeps up their work.

## Report

What you built, what you skipped and why, and the commands you ran with their output.
No success claim without the output.
