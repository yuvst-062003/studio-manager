# The completion run — paste this into a new session

One autonomous session, Fable 5, running until all four surfaces are finished.

**What it drives.** Four specs written 2026-08-27, each from a probe of the working tree
rather than from a document:

| Spec | Surface | Workstreams |
|---|---|---|
| `docs/superpowers/specs/2026-08-27-dashboard-completion-design.md` | `web/apps/dashboard/` | `F0`–`F13` |
| `docs/superpowers/specs/2026-08-27-parent-completion-design.md` | `web/apps/parent/` | `P0`–`P12` |
| `docs/superpowers/specs/2026-08-27-staff-completion-design.md` | `web/apps/staff/` | `S0`–`S12` |
| `docs/superpowers/specs/2026-08-27-landing-completion-design.md` | `/t/<slug>` landing | `L0`–`L8` |

**Before you paste it,** decide whether the session may push and open PRs, or should stop at
local commits. The prompt below assumes **local commits only** — change that line if you want
otherwise.

---

````
You are finishing four surfaces of Studio Manager against four written specs. Work until
every one is done. You choose how — branches, git worktrees, running work in parallel,
whatever gets there. Nothing below constrains your approach; it constrains what "done" means.

## Read first, in this order

@CLAUDE.md — the repo's rules. They override anything you infer from the code.
@docs/superpowers/specs/2026-08-27-dashboard-completion-design.md
@docs/superpowers/specs/2026-08-27-parent-completion-design.md
@docs/superpowers/specs/2026-08-27-staff-completion-design.md
@docs/superpowers/specs/2026-08-27-landing-completion-design.md

Each spec opens with a "documents around this one" table naming the audit and the
per-artboard design specs for that surface. Open the artboard's own spec in
docs/design/specs/ before building any screen — it carries the regions, the states
(including empty, loading and error), the token roles, which of the 18 primitives each part
is, and the real i18n key for every string. Do not invent a string, a colour, or a
component that already exists.

Never read docs/design/canvas/**/*.dc.html as text. Each is ~180 KB of inline styles and
will swamp your context. The per-artboard specs and docs/design/canvas/INVENTORY.md exist
for that.

## Start every surface with its re-verify workstream

F0, P0, S0 and L0 are not warm-ups. The specs were written on 2026-08-27 and each one lists
findings from its own audit that code had already overtaken — an endpoint that used to 404
and now ships, a warning that was deliberately removed, a page measured in its empty state
and filed as a shell. The same drift will have continued since. Re-check each claim against
the tree before you build against it, and record in that surface's log anything that no
longer holds.

If a spec is wrong, say so plainly in the log and do the right thing instead. The specs are
the best map available, not an authority over what you can see in the code.

## Order, and why

1. **Shared foundations, before any surface.** Three things are named by more than one spec
   and must be built exactly once, in web/packages/ui/src/primitives/:
   - `LoadFailed` with a required `onRetry` (dashboard F1a; adopted by parent P8 and staff
     S11). Recovery today: dashboard 3 of 43 screens, parent 1 of 19, staff 0 of 14.
   - `Table` with explicit column widths and a card fallback below 768px (F1b, F11).
   - The attendance-strip primitive, and `BeltBar` usage with its D7 ring (parent P10,
     staff S11).
   Whichever surface would reach one first, build it here instead.

2. **Staff S1 next, ahead of everything else.** It is a safety fix. The staff app calls one
   of its three slot-registration functions, so `HealthBadge` never registers and a coach
   taking a register sees no warning that a child on the mat has asthma or an allergy. Its
   guard tests — a barrel exporting an uncalled `register*`, and a `registerSlot` target
   with no `useSlot` container in the same bundle — protect all three apps and should land
   with it.

3. **Then the surfaces**, each in its spec's own stated order. Two cross-surface
   dependencies are real and sequenced:
   - Staff S6.2 needs parent P1. A coach cannot see `הודיעו מראש` until a parent can file an
     absence report, and today nothing in the product can — `AbsenceScreen` is built, tested,
     wired to both its endpoints, and rendered by nothing.
   - Landing L5 needs parent P1. `13b`'s `הוספה ליומן` is `EventCalendarButtons`, another of
     the seven unreachable parent components.

## Rules that will bite

- Python tooling is in .venv (3.14). Always use the `.venv/bin/` prefix — a bare python3 or
  pytest resolves to an old 3.8 interpreter earlier on PATH.
- Money is agorot, integers, never floats. Timestamps stored UTC, rendered Asia/Jerusalem.
- No string inlined in a component. Hebrew lives in web/packages/i18n/he/<namespace>.ts,
  mirrored in en/ and ru/. Never edit web/packages/i18n/index.ts — it is authored once.
- Logical CSS only: padding-inline-start, never padding-left. Every surface runs RTL and LTR
  from the same rules.
- app/main.py and app/models/__init__.py mount by discovery. Adding app/routers/foo.py
  mounts it. Never edit either file to register something.
- app.core.clock.now() is the only clock. A test fails the build on any other
  datetime.now() in app/.
- New models inherit TenantMixin. TenantSession fails closed — no studio in context raises
  rather than returning every studio's rows. Keep that true.
- Health declaration contents are never logged and never rendered to a coach or manager. A
  coach sees derived_flags only, and per C10 a missing declaration warns but never blocks
  attendance.
- A coach never sees a price. The API redacts; do not reintroduce one by inference.
- The migrations directory belongs to main. If you believe a migration is needed, stop and
  say so before writing one. Lanes never run `alembic revision`.
- Do not build automated recurring billing. הוראת קבע cannot be created programmatically by
  the provider and is marked paid by hand.

## Definition of done

A workstream is done when its spec's own "Done when" holds — those are written to be
checkable, not aspirational. Beyond that, for the run as a whole:

```
./scripts/dev-db.sh up          # DB tests FAIL rather than skip without this
.venv/bin/pytest -q
cd web && npm run test
npm run typecheck && .venv/bin/mypy app
.venv/bin/ruff check app && .venv/bin/ruff format --check app && npm run lint
./scripts/lane-check.sh <vertical>   # for each vertical you touched
```

Green, with no skipped test standing in for a gate. If something cannot pass, that is a
result to report, not a thing to route around — say what failed and why.

Write a failing test before fixing a bug. Several workstreams ask for a guard test that
closes a whole class of defect rather than the one instance; those guards are the
deliverable, and the instances are the proof they work.

## Keep the record as you go

- Tick each finished piece in docs/plan/state.yaml **in the same commit as the work**. Never
  write anything measurable there — no test results, no branch, no environment health. Those
  are computed, and a declaration that contradicts a measurement is how a status board stops
  being trusted.
- Append to the surface's log — a `## Log` section, newest first, in
  docs/design/audit/{dashboard,parent,staff}.md and docs/design/landing-page-gap.md. Each
  entry: what was wrong, what you built, what you decided and why, and any claim in the
  document that turned out stale.
- Each spec names decisions it deliberately left to you — where class and location
  management lives, what happens to a group's only lead coach on deactivate, how a renewal
  interacts with the health gate, what becomes of the staff AtRiskAlert. Write each one down
  with its reasoning when you make it.

## Two things to raise rather than decide

- **Parent P11.** health_status is only missing|trial_signed|signed, and HealthGate blocks on
  anything but signed, wrapping every route. If M4.5's renewal flips a student back to
  missing, a routine annual renewal locks a long-standing family out of the whole parent app.
  Trace it, report what you find, and propose before you change behaviour.
- **Any migration.** See the rules above.

## Working style

Commit locally as you go, in coherent pieces. Do not push and do not open PRs. If you are on
main, branch first.

Report at each surface boundary: what landed, what the gates said, what you decided, and
anything you could not do. Then continue to the next surface without waiting.
````
