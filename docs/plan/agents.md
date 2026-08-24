# Agents — the multi-agent environment

Companion to [milestone-plan.md](milestone-plan.md) and [lanes.md](lanes.md). What runs in a
subagent, what runs in a worktree, what should not be an agent at all, and why the roster stops
at five.

---

## 1. The constraint that decides everything here

> **"Do not clone a 100-agent mega-pack into `~/.claude/agents/`.** Every model-invocable
> agent's name, description, and tool list loads at *every* session start. A hundred of them is
> a permanent context tax plus a selection problem — overlapping descriptions make Claude pick
> the wrong specialist. **Five to eight active agents is a healthy ceiling for a solo project.**"
> — [claude-code-guide.md](../../claude-code-guide.md) Part 1 §3

Three agents exist. This plan adds **two**. Final roster: **five** — the low end of the healthy
band, which leaves room to add a sixth when a real trigger appears rather than pre-emptively.

Every wave runs three concurrent sessions, and each of them pays the description tax
independently. A sixth agent added "just in case" costs context in all three, every wave, for
the whole project.

---

## 2. The roster

| Agent | Model | Status | Job |
|---|---|---|---|
| `log-digger` | haiku | **exists** | Reads long output, returns only the failure + root cause + `file:line` |
| `spec-auditor` | sonnet | **exists** | Checks a diff against SPEC.md, reports gaps only |
| `security-reviewer` | opus | **exists** | Payment callbacks, authz, personal data, injection |
| `test-writer` | sonnet | **add** | Writes failing tests from acceptance criteria before implementation |
| `canvas-porter` | sonnet | **add** | Extracts one artboard's structure from the 856 KB canvas without it entering the main context |

**Model tiers are not decoration.** Per the guide: *"a log-reading agent on Opus is pure waste;
a security reviewer on Haiku is false comfort."* The existing three are already tiered
correctly. Both additions are sonnet: `test-writer` needs real judgment about what to assert
but not opus-grade reasoning; `canvas-porter` needs to read markup and summarise structure —
haiku would fumble the RTL and token extraction, opus would be waste.

---

## 3. What to add

### 3.1 `test-writer` — the obvious gap

The plan is TDD end to end. §13 mandates it, CLAUDE.md mandates it, every lane prompt in
[lanes.md](lanes.md) says *"failing test, confirm it fails, minimal implementation, green,
commit."* There is currently no agent that writes tests, which means the same session that will
implement the feature also decides what "correct" means — and it will write the test that its
intended implementation passes.

A separate context writing the test from the acceptance criteria, before the implementation
exists, is the whole point.

`.claude/agents/test-writer.md`:

```markdown
---
name: test-writer
description: Writes failing tests from acceptance criteria before any implementation exists
tools: Read, Grep, Glob, Write, Bash
model: sonnet
---
You write tests that fail for the right reason, before the implementation exists.

You are given acceptance criteria and a target file path. You write the test and
nothing else. You never write implementation code, and you never modify a test that
already passes.

Rules:
- Python tests use pytest and live in `tests/<vertical>/`. Frontend tests use vitest
  + Testing Library and live beside the component as `*.test.tsx`.
- Always use the `.venv/bin/` prefix for Python tooling. A bare `pytest` resolves to
  an old 3.8 interpreter earlier on PATH and will fail confusingly.
- Run the test after writing it and confirm it fails, and that it fails with a
  missing-symbol or wrong-value error — not an import error, a fixture error or a
  syntax error. A test that fails for the wrong reason is worse than no test,
  because it goes green for the wrong reason too.
- Assert on behaviour and on the specific value, never on "no exception raised".
- One behaviour per test. Name it for the behaviour, not the function.
- Cover the stated criteria and the edge cases the criteria imply. Do not invent
  requirements, and do not write tests for cases the code cannot reach.

This codebase's standing invariants — assert these wherever they are in scope:
- Money is integer agorot. Never assert on a float or a Decimal.
- Timestamps are stored UTC and rendered Asia/Jerusalem. Assert both, separately.
- Every tenant-scoped query is filtered by studio_id. A test that passes with the
  filter removed is not testing tenancy.
- Health declaration contents never appear in log output.
- Components render in both `he` (RTL) and `en` (LTR).

Return: the test file path, the command that runs it, and the actual failure
output. If the criteria are ambiguous enough that two different implementations
would both satisfy them, say so and stop — do not pick one.
```

**Where it fires:** at the start of every task in every build lane. It is the single
highest-frequency agent in the plan.

### 3.2 `canvas-porter` — a project-specific gap worth filling

`docs/design/canvas/` is ~856 KB of inline-styled HTML across 61 artboards. Every lane prompt
in [lanes.md](lanes.md) says *do not open these files* — because one of them would swamp a
session's context. But a lane building `9f` genuinely needs to know what is on `9f`.

That is the guide's exact trigger for a subagent: *"a job produces output you'll never look at
again"* and *"a side task floods your conversation with output."* Today the workaround is a
human opening a browser and describing the screen back. An agent that greps one artboard by ID
and returns a structural summary removes that step without the HTML ever entering the main
context.

`.claude/agents/canvas-porter.md`:

```markdown
---
name: canvas-porter
description: Extracts one canvas artboard's structure and returns a component spec, never the raw HTML
tools: Read, Grep, Glob
model: sonnet
---
You read exactly one artboard out of the design canvas and return a description of
it. You never return raw HTML, and you never return more than one artboard.

The canvas is three `.dc.html` exports in `docs/design/canvas/`, roughly 856 KB
total. Reading a whole file would be useless to the caller and would waste your own
context.

Method:
1. `docs/design/canvas/INVENTORY.md` maps every artboard ID to a surface and a
   title. Start there.
2. Locate the artboard's markup with `grep -n` on its ID or its Hebrew title in the
   relevant `.dc.html`. Read a bounded range around the match with Read's `offset`
   and `limit`. Never read a `.dc.html` without both.
3. If the range you read does not clearly contain the whole artboard, extend it
   once. If it still does not, say so rather than guessing.

Return, and only this:
- The artboard's layout: regions, their order, and their nesting.
- Every piece of text, verbatim, in the original language, with a note on what it
  labels. The caller needs these for the i18n namespace file.
- Every interactive element: what it is, its label, and its apparent states.
- Which design tokens the artboard uses, by role — ground, ink, secondary text,
  semantic status, belt colour. Report the hex values you find AND flag any that
  D8 retired: `#a8a49a`, `#8f8b82`, `#7a766d` are invalid in light mode.
- Any belt bar, so the caller remembers D7's 1px ring.
- A proposed component breakdown: which parts are reusable primitives that likely
  already exist in `web/packages/ui`, and which are feature-specific.

Never return:
- Raw HTML or raw CSS. The exported CSS is a visual reference only and must never
  be copy-pasted into a component (D10). The dashboard export in particular carries
  14 physical CSS properties and zero logical ones — reporting them as-is invites
  exactly the RTL bug the rule exists to prevent.
- More than one artboard per invocation.

Finally, check the artboard against the scope decisions in
`docs/design/decisions.md` D9 and say plainly if what you are looking at was
reduced: `2b` loses `שיחה עם המשרד` and keeps the `עדכוני מועדון` inbox; `7c` loses
the `משקל / קטגוריה` column; `12f` is retitled `תשלומים` with the email affordance
scoped to card rows. These are decided but NOT YET APPLIED to the canvas, so the
markup will still show the old version. The decision wins. Say so every time.
```

**Where it fires:** at the start of each artboard's implementation task, in every build lane.

> **The last paragraph is doing real work.** Conflict **C9** in the milestone plan notes the D9
> edits are recorded but not applied to the canvas. Until they are, every artboard read is a
> chance to build a cut feature. Putting the correction in the agent's own system prompt means
> it fires on every read, in every lane, without anyone remembering to say it.

---

## 4. What NOT to add, and why

This half matters more than the previous one. Each of these is a plausible agent that would
cost context at every session start in all three concurrent sessions, and each is better served
by something cheaper.

| Candidate | Verdict | Why |
|---|---|---|
| `explorer` | **no** | The built-in **Explore** agent already does this — read-only, fast model, reads excerpts rather than whole files. Adding a second one creates the overlapping-description problem the guide warns about, where Claude picks the wrong specialist because two of them claim the same job. |
| `rtl-a11y-reviewer` | **no — make it a hook and a rule** | D10 bans physical CSS properties; D8 sets the text-token floor; §9 requires logical properties everywhere. These are *"always"* and *"never"* statements, and the guide's build-order table is explicit: *"You want it to happen every time, no exceptions → hook."* An ESLint rule plus `.claude/rules/ui-rtl-a11y.md` (re-scoped per conflict **C1**) runs deterministically on every file. A model deciding whether to check is strictly worse than a linter that always does. |
| `migration-reviewer` | **no — already a hook** | [`block-protected.sh`](../../.claude/hooks/block-protected.sh) denies any write to `*/alembic/versions/*` with exit code 2. Migrations are authored on `main` in the contract commit and reviewed by a human. An agent adds a second opinion on something no lane can touch. |
| `i18n-auditor` | **no — already a CI check** | §9 already specifies *"a CI check that lists untranslated keys per locale."* M0 delivers `scripts/i18n-parity.mjs`, which runs inside every lane's own `lane-check.sh`. Deterministic, scoped to one namespace, no model call. |
| `offline-sync-reviewer` | **no — a prompt, not an agent** | The offline path is the highest-risk code in the project, but it lives in exactly one lane in exactly one wave. A permanent agent taxes every session for the whole project to serve one week. [lanes.md](lanes.md)'s review-session prompt handles it: three independent reviews from different angles — auth expiry, cross-actor conflict, cache eviction — dispatched at W3. Perspective diversity is what catches these, and you get it from three differently-worded dispatches of the general-purpose worker. |
| `upay-adversary` | **no — `security-reviewer` already covers it** | Its description is already *"payment callbacks, authz, personal data, injection"*, and it is on opus. A second payments-flavoured reviewer splits the selection and halves the chance the right one is picked. The `payments` skill supplies the domain knowledge. |
| `architect` / `planner` | **no** | `superpowers:writing-plans` and `superpowers:brainstorming` are skills, invoked in the main context where the decisions need to be visible to you. Planning in a subagent means the reasoning is thrown away and only the conclusion returns — the opposite of what you want from a plan. |
| `doc-writer` | **no** | Nothing in M0–M11 produces documentation at a volume that floods a conversation. If M11's store listings in three languages turn out to, that is the trigger to reconsider — not now. |
| a `test-runner` agent | **no** | `lane-check.sh` is one command. `log-digger` (haiku) already handles the case where its output is too long to read. |

**The pattern:** an agent earns its slot when the job produces output you will never look at
again, or when you need a reviewer unbiased by having written the code. If the job is
*deterministic*, it wants a hook, a lint rule or a CI check — all of which are cheaper, always
run, and cannot be talked around.

---

## 5. Subagents versus worktrees

The five mechanisms in Part 4, ranked weakest coupling to strongest, mapped onto this plan.

| Mechanism | Used for | Not used for |
|---|---|---|
| **1 · Subagents** | Research fan-out before a lane starts · every review pass · `canvas-porter` per artboard · `test-writer` per task · `log-digger` on any noisy output | **Building.** They cannot hold a long build each, and — decisively for this plan — **they all write into your one working tree**, which is exactly the file collision the worktree split exists to prevent. |
| **2 · Git worktrees** | **All feature building.** Two per wave, W2–W5. Separate checkouts, separate branches, separate directories — edits physically cannot collide | Research. Spinning up a worktree to answer a question is slower than a subagent and leaves a branch to clean up. |
| **3 · Agent view** | Optional. Once three sessions are running, it shows which is waiting on you. The practical pattern is to work the review queue rather than any single lane | Nothing in the plan depends on it. |
| **4 · Agent teams** | **Nothing. Deliberately.** See §5.1 | Anything on the critical path. |
| **5 · Fan-out / dynamic workflows** | **M10 Stage B only** — the mechanical a11y/RTL/token sweep across all 61 artboards' components, with `--allowedTools` scoping the loop. This is the guide's stated fit: *"anything repetitive across many files"* | The four parallel waves. Two features are not bulk work; a fan-out over them is a worse worktree. |

**The division in one line:** *subagents for research and review, worktrees for building.*

### 5.1 Why agent teams are not in this plan

The guide is direct: agent teams are **still experimental and disabled by default**, and *"for
a 3-day solo sprint, treat this as a Day 3 experiment, not the critical path — worktrees give
you 90% of the parallelism with none of the coordination risk."*

The transition signal is specific, and this plan does not meet it: *"you're running parallel
subagents and either hitting context limits or finding they need to talk to each other."* The
lanes here are designed **not** to need to talk to each other — that is what the contract commit
and the four seam mechanisms in [milestone-plan.md](milestone-plan.md) §1.3 buy. If two lanes
found themselves needing to negotiate, that would be a signal the cut was wrong, not that teams
were needed.

Teams also cost more: each teammate is a separate full instance. Spending that on coordination
between two lanes that have been engineered not to require coordination is the wrong purchase.

**If you want to try them:** W6, on the M10 polish sweep, where a bad outcome costs a revert of
mechanical changes rather than a wave.

### 5.2 Where each agent fires, by wave

| Wave | Agents in play |
|:--:|---|
| W0 · M0 | `canvas-porter` on `4h` (the component library — the highest-value artboard for the port) · `test-writer` for the `tests/invariants/` suite · `security-reviewer` on the encryption envelope and the audit-log DB grants |
| W1 · M1 | `security-reviewer` on the OAuth flow, JWT claims, refresh rotation and reuse detection, and the two refusal paths · `test-writer` throughout |
| W2 | `canvas-porter` + `test-writer` in both lanes · `spec-auditor` on each diff before merge |
| W3 | as W2, plus **three independent reviews of the offline path** from different angles (auth expiry · cross-actor conflict · cache eviction) · `security-reviewer` on the health encryption and the audit-logged read path |
| W4 | as W2, plus **`security-reviewer` on the entire uPay diff before merge** — the one review in the project where a miss costs real money |
| W5 | as W2, plus `security-reviewer` on break-glass, the anonymization job and the unauthenticated ICS token endpoints |
| W6 · M10 | fan-out loop, not agents · `log-digger` on the sweep output |
| W7 · M11 | `spec-auditor` against §6.5 and §12's store guidelines before submission |

### 5.3 The Writer/Reviewer split

Part 4's pattern, and the reason the third session in every wave reviews rather than builds:

> *"A fresh context reviews better because it isn't attached to code it just wrote. And a
> reviewer told to find gaps will find some even in sound work — tell it to flag only what
> affects correctness or the stated requirements, or you'll spend the afternoon adding
> defensive code for cases that can't happen."*

Both halves are in the review-session prompt in [lanes.md](lanes.md): audit for gaps, and
report only what affects correctness or a stated requirement.

The one thing that prompt asks a human-driven session to do rather than an agent is check the
**lane boundary** — `git diff --name-only main...<branch>` against the ownership list. An agent
will audit the code and never think to ask whether the lane was allowed to write it.

---

## 6. What to add later, and the trigger for each

Three slots remain before the guide's ceiling. Do not fill them speculatively — the build-order
table in Part 1 is trigger-driven, and so is this.

| Trigger | Then add |
|---|---|
| The same offline-path bug class recurs across three review passes | `offline-reviewer`, sonnet, with `memory:` frontmatter so it accumulates this codebase's specific failure modes across invocations |
| A second club is onboarded and tenancy leaks appear in review more than once | `tenancy-auditor`, sonnet — but try a `tests/invariants/` addition first; if it is expressible as a test, it is not an agent |
| M11's store listings in three languages genuinely flood a session | `store-listing-writer`, sonnet |
| You paste the same procedure a third time | **a skill, not an agent** — the trigger table is explicit about this, and `feature`, `payments` and `ship-check` already exist |
| Claude gets a convention wrong twice | **a line in CLAUDE.md.** If it applies to only some files, **a path-scoped rule.** If it must happen every time, **a hook** |

**Persistent agent memory** is worth knowing about for the first row: subagents support a
`memory:` frontmatter field giving each its own knowledge store that accumulates across
invocations, with the first 200 lines of its `MEMORY.md` injected at startup. A reviewer that
records recurring issues genuinely improves over weeks. It is not worth it for the five agents
above — `test-writer` and `canvas-porter` are stateless by nature, and the three existing agents
have been fine without it — but it is the right tool the moment a reviewer starts finding the
same thing repeatedly.

---

## 7. Summary

- **Five agents**, at the low end of the 5–8 ceiling: `log-digger` (haiku), `spec-auditor`
  (sonnet), `security-reviewer` (opus), plus **`test-writer`** (sonnet) and **`canvas-porter`**
  (sonnet).
- **Eight plausible agents deliberately not added** — four of them because a hook, a lint rule
  or a CI check does the job deterministically and cannot be talked around.
- **Subagents research and review. Worktrees build.** Nothing in this plan builds a feature in a
  subagent, because subagents all write into one working tree.
- **Agent teams are not on the critical path** — experimental, disabled by default, and this
  plan's lanes are engineered not to need to talk to each other, which is the stated transition
  signal.
- **Fan-out is used exactly once**, on M10's mechanical sweep, which is what it is for.
