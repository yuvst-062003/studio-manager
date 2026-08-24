# Session-opening prompt — parallel milestone plan

Paste everything in the block below into a fresh Claude Code session.

---

```
Read, in this order:
  @SPEC.md                            — especially §13 Testing strategy, §14 Delivery plan
  @docs/architecture.html             — the architecture atlas, 24 sections
  @CLAUDE.md                          — stack, layout, conventions, gotchas
  @docs/design/decisions.md           — D1-D10, binding design decisions
  @docs/design/canvas-review.md       — canvas audit, 5 findings + contrast audit
  @docs/design/canvas/INVENTORY.md    — all 61 artboards, by surface
  Part 4 of @claude-code-guide.md     — parallel work mechanisms

DO NOT open docs/design/canvas/*.dc.html. They are ~856 KB of inline-styled HTML
and will swamp your context. INVENTORY.md lists every artboard with a stable ID;
that is what you plan against. The HTML is for humans to open in a browser.

From @docs/architecture.html the sections that most affect sequencing are:
"Where each job lives", "Four network states, not two", "Offline scope per
client", "Authentication while offline - the one that bites", "Cross-actor
conflicts", "The dev bar", "The four tools, and what each makes testable", and
"Blocked on you". Offline behaviour in particular is cross-cutting and is the
most likely thing to break a naive parallel split.

GOAL — produce a milestone plan, not code. Write no implementation this session.

SPEC.md §14 already defines M0–M11. Do not invent new milestones. Your job is to
RE-CUT that existing plan into a parallel execution plan: who builds what, at the
same time, in which worktree, verified how.

## What the plan must satisfy

1. All three surfaces advance together. Parent PWA, staff PWA and manager
   dashboard must progress in the same milestone — never "finish the backend,
   then do the apps one at a time".

2. Core logic first, then fan out. Identify the sequential core that everything
   depends on (tenancy, identity, models, migrations, shared contracts, the
   design token layer). That is one lane on main. Only after it lands do
   parallel lanes start.

3. Parallel only where genuinely uncoupled. Prove it, don't assume it.

## Step 0 — dependency analysis, before you split anything

Follow Part 4's Step 0 of @claude-code-guide.md. For every candidate lane pair,
report: which files both touch, whether they share DB tables or migrations, and
which shared types or API contracts must exist first. Then give a build order —
what must be sequential, what can be parallel, and where the seams are.

Apply Part 4's three rules explicitly:
  - Migrations serialize. One lane owns the schema.
  - Shared types land on main BEFORE lanes start.
  - One owner per file. Assign directories, not tasks.

## A hypothesis to verify or refute — do not accept it uncritically

Splitting lanes by SURFACE (parent / staff / dashboard) looks like the obvious
answer and is probably wrong: all three share app/models/, app/services/ and
web/src/components/, so three surface-lanes would collide on every shared file.

Splitting by FEATURE VERTICAL (attendance / health / money) appears better —
each vertical touches all three surfaces at once, which is both what "advance
all three together" means and how §14 is already sliced.

Verify this against the actual file layout in CLAUDE.md §Layout and the §4.3
schema. If the evidence says otherwise, say so and propose the better cut.

## Constraints from the guide — honour them

- TWO OR THREE LANES MAXIMUM. Part 4 is explicit that parallelism multiplies
  review load, not output, and that five lanes is a fantasy for a solo dev.
- Every lane needs its own runnable check, or the human becomes the test suite.
- Prefer parallel VERIFICATION over parallel BUILDING.
- Review each lane before merging, never after.

## Constraints from this project

- Python tooling is in .venv/ — always the .venv/bin/ prefix (CLAUDE.md).
- Money in agorot, integers. Timestamps UTC, rendered Asia/Jerusalem.
- Hebrew strings only in web/src/i18n/he.ts.
- No automated recurring billing — הוראת קבע is reconciled manually (§12).
- Health declarations contain minors' data — never logged.
- D7–D10 in docs/design/decisions.md are binding: belt bars get a 1px ring,
  #6f6b62 is the text-token floor, three artboard scope cuts, and an ESLint rule
  banning physical CSS properties must exist before the first component.
- M0 must start the Google Play closed test on day one — 12 testers, 14
  consecutive days of wall-clock that cannot be compressed (§14, §15).

## Deliverables

Write these files. Use the superpowers:writing-plans skill.

1. docs/plan/milestone-plan.md
   For each milestone M0-M11: which lanes run, what each owns (as directory
   globs), what lands on main first, the per-lane verification command, and the
   merge/integration order. Mark explicitly which milestones are sequential-only
   and why.

   Every milestone must also list the ARTBOARD IDs it delivers, from
   docs/design/canvas/INVENTORY.md - e.g. "M5 Attendance: staff 1c, 9f, 2d;
   dashboard 4c; parent 12a". This is what makes "all three surfaces advance
   together" checkable rather than aspirational: if a milestone lists artboards
   for only one surface, the cut is wrong.

   Every one of the 61 artboards must be assigned to exactly one milestone, or
   explicitly listed as cut. Three are already cut by D9 (2b, 7c, 12f) - account
   for them and do not silently drop any others.

2. docs/plan/lanes.md
   The worktree setup: exact `git worktree add` commands, the directory each
   lane owns, and a copy-pasteable opening prompt per lane. Every lane prompt
   must carry Part 4's "stop and tell me" clause — if a lane needs a file it
   does not own, it halts and reports rather than editing.

3. docs/plan/agents.md
   The multi-agent environment. .claude/agents/ already has log-digger,
   security-reviewer and spec-auditor. Per Part 4 and Part 1 §3, say which
   additional agents are worth adding (test-writer is the obvious gap), at which
   model tier, and — importantly — which are NOT worth adding. The guide warns
   that every agent's description loads at every session start and that five to
   eight active agents is the ceiling. Respect it.
   Also specify where subagents fit versus worktrees: subagents for research
   fan-out and review, worktrees for building. Do not propose agent teams as
   critical path — the guide calls them experimental and disabled by default.

## Before you write

Ask me clarifying questions one at a time if the dependency analysis surfaces a
real fork. Do not ask permission to begin.

Flag any place where SPEC.md §14's milestone contents conflict with a parallel
cut — I would rather amend the spec than paper over it.
```
