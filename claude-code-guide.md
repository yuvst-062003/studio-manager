# Claude Code, Properly — The Complete Guide
### Learning agentic engineering by rebuilding Studio Manager (Python + React) from scratch in 3 days

Compiled from Anthropic's official Claude Code docs and engineering blog, the "How Anthropic teams use Claude Code" case study, and practitioner write-ups (ClaudeLog, DataCamp, marmelab, chudi.dev, obra/superpowers, wshobson/agents, GitHub Spec Kit). Every part carries its own source list.

---

## Contents

**Part 1 — The Five Primitives**
What skills, rules, subagents, hooks, and permissions actually are, what to create for each, recommended starter sets, and which GitHub collections to steal from.

**Part 2 — The 3-Day Course**
Mental model → Day 0 setup → Day 1 spec and verification loop → Day 2 parallelism → Day 3 hardening and CI. With drills and an honest scope calibration.

**Part 3 — How Claude Actually Remembers Your Codebase**
Why "Claude re-reads every file" is half wrong, what the two-layer index is, auto memory, LSP, and the 20-minute setup that removes the re-explaining tax.

**Part 4 — Building Multiple Features Simultaneously**
Worktrees, agent view, agent teams, fan-out — how to split three features safely and why your review bandwidth is the real ceiling.

**Part 5 — The Starter Kit**
Copy-paste CLAUDE.md, rules, skills, subagents, settings.json, hooks, GitHub Actions, and prompt templates for this project.

---

## If you read nothing else

1. **Context is the constraint.** Every message, file read, and command output stays in the conversation and gets re-sent every turn. Quality degrades as the window fills. Nearly every practice below derives from this.
2. **Give Claude a check it can run.** Tests, a build exit code, a screenshot diff. Without one, "looks done" is the only signal available and you become the verification loop.
3. **Explore → plan → implement → verify → commit.** Skip the plan only when you could describe the diff in one sentence.
4. **Instructions are requests; hooks and permissions are enforcement.** "Never do X" in CLAUDE.md will fail exactly when it matters.
5. **Never accept "done" without evidence** — the command that was run and what it returned.

---
---

# PART 1 — The Five Primitives


Skills, rules, agents, hooks, permissions. Each answers a different question. Pick by **when it loads** and **how much authority it carries**, not by what feels tidiest.

| | Skills | Rules | Subagents | Hooks | Permissions |
|---|---|---|---|---|---|
| **Question it answers** | "how do we do X?" | "what must be true of these files?" | "who does this side job?" | "what must happen every time?" | "what must never happen?" |
| **Lives in** | `.claude/skills/<name>/SKILL.md` | `.claude/rules/*.md` | `.claude/agents/*.md` | `settings.json` | `settings.json` |
| **Loads** | description at start, body on invoke | at start, or when matching files are read | name+description at start, body on call | never (runs outside context) | never |
| **Context cost** | low | medium (zero if path-scoped and unmatched) | zero until called | zero | zero |
| **Authority** | advisory | advisory | advisory | **deterministic** | **deterministic** |
| **Survives compaction** | re-injected up to a shared budget | unscoped yes; path-scoped only on re-match | n/a | bypasses compaction | n/a |

The single most important line in that table: **skills and rules are requests; hooks and permissions are enforcement.** A rule saying "never edit .env" will be followed most of the time and fail exactly when it matters — a long session, an ambiguous moment, or content injected from a file Claude read.

---

## 1. Skills — procedures and reference knowledge

A skill is a folder with a `SKILL.md`: YAML frontmatter (`name`, `description`, optional `argument-hint`, `tools`, `model`, `disable-model-invocation`) plus a markdown body. Only name + description load at session start; the body loads when you type `/name` or when Claude matches your task to the description. That's progressive disclosure, and it's why skills are the right home for anything long.

**Create a skill when:** you've pasted the same multi-step procedure into chat a third time, or you have reference material Claude only needs sometimes.
**Don't:** put a 30-line procedure in CLAUDE.md. Anthropic's guidance is explicit — CLAUDE.md is for facts, skills are for procedures.

### Recommended starter set (5)
| Skill | Type | Why |
|---|---|---|
| `feature` | action | your standard explore→plan→test→implement→self-review loop |
| `ship-check` | action, `disable-model-invocation: true` | pre-merge gate: tests, types, lint, migrations, security, a11y |
| `debug` | action | reproduce→isolate→failing test→fix→verify, so debugging doesn't devolve into guessing |
| `payments` | reference | domain rules that must never be re-derived (uPay flows, idempotency, manual recurring) |
| `db-migration` | action | alembic revision → review → upgrade → rollback plan |

Plus the bundled ones you get free: `/code-review`, `/security-review`, `/debug`, `/batch`.

**Frontmatter tip:** write the description in the words a request would actually contain — "reviewing or writing tests in the payments module", not "payment quality assurance helper". Claude matches on that string.

**Where to steal from on GitHub:**
- `anthropics/skills` — official example and document skills
- `obra/superpowers` — composable skills framework with TDD enforcement, Socratic brainstorming, and automatic review between tasks; now an official plugin in Anthropic's marketplace
- `wshobson/agents` — a marketplace with 181 skills and 105 commands, installable as plugin bundles
- `wshobson/commands` — 57 slash commands, including multi-agent workflows
- `github/spec-kit` — Constitution → Specify → Plan → Tasks → Implement, tool-agnostic

---

## 2. Rules — constraints bound to specific files

Markdown files in `.claude/rules/`, discovered recursively. With a `paths:` frontmatter glob they load only when Claude touches matching files; without it they're mechanically identical to pasting the content into CLAUDE.md — always loaded, always costing tokens.

```markdown
---
paths:
  - "app/routers/**"
  - "**/*.handler.py"
---
All API handlers validate input with Pydantic before processing.
```

**Create a rule when:** the constraint applies to a cross-cutting concern that appears in several corners of the codebase but not all of them. If it's tied to one directory only, a nested `CLAUDE.md` in that directory does the same job.

**Compaction gotcha worth knowing:** root CLAUDE.md is re-read after `/compact`. Path-scoped rules and nested CLAUDE.md files are **not** re-injected — they reload only the next time a matching file is read. If a constraint disappeared mid-session, this is usually why.

### Recommended starter set (4, all path-scoped)
| File | Paths | Content |
|---|---|---|
| `api.md` | `app/routers/**`, `app/schemas/**` | validation, response_model, error shape, club_id scoping |
| `ui.md` | `web/src/**` | RTL logical properties, i18n only, WCAG 2.0 AA / IS 5568 |
| `tests.md` | `**/test_*.py`, `**/*.test.ts` | naming, no network, factories over fixtures |
| `migrations.md` | `alembic/versions/**` | append-only, never edit an applied migration, always reversible |

Keep the total under ~5. Rules are cheap only while they're scoped.

---

## 3. Subagents — isolated workers

Markdown in `.claude/agents/`: frontmatter (`name`, `description`, `tools`, `model`, optional `memory`) and a body that becomes that agent's system prompt. It runs in a **fresh context window** — it gets CLAUDE.md and git status but *not* your conversation — and only its final message comes back.

**Create an agent when:** a job produces output you'll never look at again (a log pass, a dependency audit, a broad search), or when you want a reviewer that isn't biased by having written the code.

**The model tier idea is worth copying** — the big GitHub collections all route agents to haiku / sonnet / opus by task complexity. A log-reading agent on Opus is pure waste; a security reviewer on Haiku is false comfort.

### Recommended starter set (5)
| Agent | Model | Job |
|---|---|---|
| `log-digger` | haiku | reads long output, returns only the failure + root cause + file:line |
| `explorer` | haiku/sonnet | read-only codebase survey; returns a map, not file contents |
| `spec-auditor` | sonnet | checks a diff against SPEC.md; reports gaps only |
| `test-writer` | sonnet | writes failing tests from acceptance criteria before implementation |
| `security-reviewer` | opus | payment callbacks, authz, personal data, injection |

Built-ins already exist: an **Explore** agent (read-only, fast model, reads excerpts rather than whole files) and a general-purpose worker.

**Persistent agent memory:** subagents support a `memory:` frontmatter field giving each agent its own knowledge store that accumulates across invocations. A reviewer that records recurring issues in your codebase genuinely gets better over weeks. First 200 lines of its `MEMORY.md` are injected at startup.

**Where to steal from on GitHub** — and the caveat that matters:
- `wshobson/agents` — the big one: 92 plugins, 202 agents, 181 skills, with model tiers assigned
- `VoltAgent/awesome-claude-code-subagents` — 100+ agents, clean frontmatter conventions worth copying
- `0xfurai/claude-code-subagents`, `davepoon/claude-code-subagents-collection`, `vijaythecoder/awesome-claude-agents`, `iannuttall/claude-agents`, `hesreallyhim/awesome-claude-code-agents`
- `zhsama/claude-sub-agent` — phase-based workflow system

**Caveat: do not clone a 100-agent mega-pack into `~/.claude/agents/`.** Every model-invocable agent's name, description, and tool list loads at *every* session start. A hundred of them is a permanent context tax plus a selection problem — overlapping descriptions make Claude pick the wrong specialist. Install the two or three plugin bundles you need. Five to eight active agents is a healthy ceiling for a solo project.

---

## 4. Hooks — the only thing that's guaranteed

Handlers that fire on lifecycle events. Five types: `command` (shell), `http`, `mcp_tool`, `prompt`, and `agent` — the first three are deterministic, the last two use a model call in a separate window. Registered in `settings.json`, managed policy, or skill/agent frontmatter.

Key events: `PreToolUse` (can block — exit code 2 denies and stderr tells Claude why), `PostToolUse`, `SessionStart`, `Stop`, `SubagentStop`, `PreCompact`, `UserPromptSubmit`, `InstructionsLoaded`.

**Create a hook when:** you've written "always" or "never" in CLAUDE.md. That sentence is the signal. The model *choosing* to run a formatter is a different thing from the formatter running.

### Recommended starter set (4)
| Event | Hook | Why |
|---|---|---|
| `PostToolUse` on Edit/Write | ruff format + ruff check --fix / prettier | zero-thought correctness, and the output feeds back so Claude sees its own errors |
| `PreToolUse` on Edit/Write | block `.env*`, `alembic/versions/*`, `dist/`, `node_modules/` | the guardrail a CLAUDE.md line can't give you |
| `PreToolUse` on Bash | block `rm -rf`, `git push --force`, `alembic downgrade` | blast-radius control |
| `Stop` | run the test suite; block the turn from ending until green | turns "looks done" into "is done" — add once your suite is fast |

Optional, genuinely useful later: `PreCompact` to back up the transcript before it's rewritten; `SessionStart` to print current branch + open PRs; a `PostToolUse` hook that rewrites noisy commands so only relevant lines return.

You don't have to write these by hand. *"Write a hook that runs ruff format after every Python file edit"* works, and `/hooks` shows you what actually registered.

**Where to look:** `shanraisshan/claude-code-best-practice` (and its companion hooks repo) documents patterns including a `Stop` hook that nudges Claude to verify its work at end of turn. `FlorianBruniaux/claude-code-ultimate-guide` and `luongnv89/claude-howto` both carry copy-paste hook templates.

---

## 5. Permissions — the boundary

Three layers, increasing strength:

1. **Allowlist / denylist** in `settings.json` — `allow` pre-approves safe commands so you stop clicking through prompts; `deny` blocks unconditionally and cannot be talked around.
2. **Sandboxing** — OS-level filesystem and network isolation, so Claude can work freely inside defined bounds.
3. **Permission modes** — `plan` (read-only, the default for anything unscoped), `manual` (asks before every mutation), `auto` (a classifier model reviews actions and blocks what looks risky).

**Worth knowing about auto mode:** Anthropic published its own numbers — it blocks roughly 0.4% of benign commands, and about 17% of overeager actions get through. They describe it as one layer of defense-in-depth inside a sandbox, not a substitute for one. Treat it as convenience, not containment.

### Recommended starter set
```json
{
  "permissions": {
    "allow": ["Bash(pytest:*)", "Bash(ruff:*)", "Bash(npm run lint)",
              "Bash(npx vitest run:*)", "Bash(git add:*)", "Bash(git commit:*)",
              "Bash(git diff:*)", "Bash(gh pr:*)"],
    "deny":  ["Read(./.env)", "Read(./.env.*)", "Bash(rm -rf:*)",
              "Bash(git push --force:*)", "Bash(alembic downgrade:*)"]
  }
}
```
Rule of thumb: **allow the things you'd approve on autopilot anyway; deny anything irreversible.** The deny list is the one you should be able to justify line by line.

---

## Build order (don't do all five on day one)

Anthropic's own framing is trigger-driven, and it's the right instinct:

| Trigger | Add |
|---|---|
| Claude gets a convention wrong twice | line in CLAUDE.md |
| That convention only applies to some files | path-scoped rule |
| You've pasted the same procedure three times | skill |
| A side task floods your conversation with output | subagent |
| You want it to happen every time, no exceptions | hook |
| It must never happen | permission deny + PreToolUse hook |
| A second repo needs the same setup | package as a plugin |

The same triggers tell you when to *update* what exists. A repeated mistake is a config edit, not a one-off correction in chat.

---
---

# PART 2 — The 3-Day Course

### Target: rebuild Studio Manager from scratch while learning agentic engineering

Part 1 covered *what* each primitive is. This part is the *when* — a day-by-day plan that introduces each one at the moment you feel the need for it.

---

## Part 0 — The mental model (read this once, it explains everything else)

**One constraint drives ~90% of Claude Code practice: the context window fills fast, and output quality degrades as it fills.** Every message, every file read, every command output stays in the conversation and gets re-sent on every subsequent turn. A session that greps around blindly is both slower and dumber than one that was pointed at the right two files.

Everything below is a consequence of that:

| Symptom | Real cause | Fix |
|---|---|---|
| Claude "forgets" your rules mid-session | context filled, early instructions lose weight | `/clear`, shorter CLAUDE.md |
| Plausible code that doesn't work | no verification loop | give it a test/build it can run |
| Same correction three times | polluted context | `/clear` and rewrite the prompt |
| Slow, expensive sessions | re-reading a bloated conversation | `@`-mention files, quiet flags, subagents |

**The second big idea: put each instruction in the layer that matches its authority.**

| Layer | Loads | Use for | Guarantee |
|---|---|---|---|
| `CLAUDE.md` | every session | facts: build commands, layout, conventions | advisory |
| `.claude/rules/*.md` | session start, or path-scoped | constraints tied to specific files | advisory |
| `.claude/skills/*/SKILL.md` | on demand (`/name` or auto) | procedures: deploy, release, review checklists | advisory |
| `.claude/agents/*.md` | when called | isolated side work; only a summary returns | advisory |
| Hooks (`settings.json`) | on lifecycle events | anything that MUST happen every time | **deterministic** |
| Permissions / sandbox | always | anything that must NEVER happen | **deterministic** |

The rule that matters: **"never do X" and "always do Y" do not belong in CLAUDE.md.** An instruction is a request; a `PreToolUse` hook or a deny rule is enforcement. Under a long session or an ambiguous situation, prompted rules get dropped. Hooks don't.

---

## Day 0 — Setup (2 hours, do this before Day 1 starts)

### 0.1 Install and orient
```bash
curl -fsSL https://claude.ai/install.sh | bash
claude          # start a session in your repo
```
Also install `gh` (GitHub CLI). Claude uses it natively for issues and PRs and it is far more context-efficient than raw API calls.

### 0.2 The three commands you run at the start of every session
```
/model      # pick it deliberately — switching mid-session busts the prompt cache
/effort     # same; both remember your last choice
/context    # shows exactly what is loaded before you type anything
```
`/context` is the single most underused command. Run it on a fresh session and look at what CLAUDE.md and any MCP servers are costing you. Cut anything you don't need.

### 0.3 Scaffold your `.claude/` directory
Copy from **Part 5 — The Starter Kit** below. You want, before writing any app code:
- `CLAUDE.md` — under 150 lines, facts only
- `.claude/rules/` — path-scoped constraints (API validation, RTL/a11y)
- `.claude/skills/` — your procedures
- `.claude/agents/` — spec-auditor, security-reviewer, log-digger
- `.claude/settings.json` — permissions + hooks
- `.github/workflows/claude-review.yml` — automated PR review

### 0.4 Permission mode
Start in **plan mode** (`Shift+Tab` until `⏸ plan mode on`) for anything you don't fully scope. Use auto mode for grunt work inside a sandbox. Never run wide-open permissions on a repo with real credentials.

**Drill 0:** Run `/context`, then ask Claude: *"Read my CLAUDE.md and tell me which lines you would already do correctly without being told. Suggest deletions."* Delete what it names. Do this again on Day 3.

---

## Day 1 — Spec, skeleton, and the verification loop

Goal by end of day: a running app skeleton with auth, one real vertical slice (students CRUD), and a test suite Claude can run unattended.

### 1.1 Let Claude interview you (45 min)
Do not write the spec yourself. Start a fresh session and paste:

> I want to build a judo club management app: student enrollment, attendance tracking, payments, health declarations, monthly reports. Python backend, React frontend, Hebrew/RTL UI, Google auth.
>
> Interview me in detail using the AskUserQuestion tool. Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs. Don't ask obvious questions — dig into the hard parts I might not have considered. Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.

This is the highest-leverage 45 minutes of the three days. You already know this domain from the existing app, so you can answer fast and precisely — that's your unfair advantage over building something unfamiliar.

**A good spec names the files and interfaces involved, states what is out of scope, and ends with an end-to-end verification step that proves the feature works.** Push back until yours does.

Then: `/clear`. Start implementation in a fresh session with clean context and SPEC.md on disk.

### 1.2 The core loop — memorize this
```
Explore  → plan mode; read the relevant code, answer questions, change nothing
Plan     → "create a detailed implementation plan"; Ctrl+G to edit it yourself
Implement→ exit plan mode; "implement the plan, write tests, run them, fix failures"
Verify   → fresh-context reviewer checks the diff against the plan
Commit   → "commit with a descriptive message and open a PR"
```
Skip the plan only when you could describe the diff in one sentence.

**Review the plan properly.** Don't say "looks good" — read it. This is where you catch a misunderstood requirement for free instead of after 400 lines of code.

### 1.3 Build the verification loop first
Before features: get `pytest` and `vitest` running, plus lint and typecheck, and put the exact commands in CLAUDE.md **with quiet flags**:
```
- Run one test file: npx vitest run <file> --reporter=dot
- Backend tests: pytest -q
- Typecheck: npm run typecheck && mypy app
```
Quiet flags matter more than they look. A test runner printing 400 passing lines puts 400 lines into every remaining turn of the session.

Once a check exists, decide how hard it gates:
- **in one prompt** — "run the tests after implementing" (works today, any task)
- **`/goal`** — a separate evaluator re-checks after every turn until the condition holds
- **Stop hook** — blocks the turn from ending until your script passes
- **subagent reviewer** — a fresh model tries to refute the result

### 1.4 Prompting that actually works
Four patterns, all the same idea — replace vagueness with a file, a scenario, and a definition of done:

| Instead of | Write |
|---|---|
| "add tests for attendance.py" | "write a test for attendance.py covering the case where a student is marked present twice in one session. avoid mocks." |
| "fix the login bug" | "users report login fails after session timeout. check src/auth/, especially token refresh. write a failing test that reproduces it, then fix it" |
| "add a payments page" | "look at how StudentsPage is implemented to understand our patterns. follow it to build a PaymentsPage. no new libraries." |
| "make the dashboard look better" | "[screenshot] implement this design. screenshot the result, compare to the original, list differences and fix them" |

And: **`@`-mention files instead of naming them.** `@src/auth/session.py` attaches the file to your message directly — no Read call, no search. Mention it once per conversation; it stays.

**Drill 1:** Build the students CRUD slice twice — once by vibe-prompting, once through explore→plan→implement→review. Compare the diffs and the number of corrections you had to make.

---

## Day 2 — Parallelism, subagents, and agent teams

Goal: attendance, health declarations, and the payments module built in parallel, each verified independently.

### 2.1 Subagents: the context escape hatch
When Claude researches a codebase it reads many files, and all of them land in *your* context. A subagent runs in its own window and returns only a summary.

```
Use subagents to investigate how our attendance model handles make-up
sessions, and whether any existing utilities do date-range grouping.
```

Rule of thumb: **reach for a subagent when the intermediate output is something you'll never look at again** — a log pass, a dependency audit, a broad search. Give recurring noisy jobs their own definition with `model: haiku` so they don't run on your expensive main model.

Trade-off to know: a subagent doesn't have your conversation, so it sometimes re-reads things you already had. For a small job it's pure overhead.

### 2.2 Writer / Reviewer — the quality pattern
Two sessions, two contexts. A fresh context reviews better because it isn't biased toward code it just wrote.

| Session A (writer) | Session B (reviewer) |
|---|---|
| implement the payment webhook handler | review `@src/payments/webhook.py` for race conditions, replay handling, and consistency with our existing handlers |
| "here's the review feedback: […] address these" | |

Same trick with tests: one Claude writes the tests, another writes code to pass them.

### 2.3 Adversarial review before "done"
```
Use a subagent to review the payments diff against SPEC.md. Check that every
requirement is implemented, the listed edge cases have tests, and nothing
outside the task's scope changed. Report gaps, not style preferences.
```
Built-in shortcut: `/code-review` reviews the current diff in a fresh subagent.

**Important calibration:** a reviewer told to find gaps will find some, even when the work is sound. Chasing every finding produces over-engineering — extra abstraction, defensive code, tests for impossible cases. Tell it to flag only what affects correctness or the stated requirements; treat the rest as optional.

### 2.4 Worktrees and parallel sessions
```bash
git worktree add ../sm-attendance -b feat/attendance
git worktree add ../sm-payments   -b feat/payments
# run `claude` in each; edits can't collide
```
Or the desktop app, which manages parallel sessions with git isolation visually. Name sessions with `/rename` and treat them like branches — `payments-webhook`, `attendance-ui`.

### 2.5 Agent teams (the advanced tier)
Agent teams are multiple independent Claude Code sessions that message each other and share a task list, rather than one lead delegating to subagents. Higher token cost — each teammate is a full instance — but they can discuss, challenge each other, and each own a piece.

Use them when teammates genuinely need to coordinate: parallel code review from three angles at once, or a feature where each teammate owns a separate layer. **They're experimental and off by default.** For a 3-day solo sprint, worktrees + subagents will carry you further; try agent teams on Day 3 as a learning exercise, not as the critical path.

### 2.6 Fan-out for repetitive work
For migrations or bulk edits across many files:
```bash
for file in $(cat files.txt); do
  claude -p "Migrate $file to the new session API. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)"
done
```
Test on 2–3 files, fix the prompt, then run the full set.

**Drill 2:** Run one feature entirely through the Writer/Reviewer pattern in two worktrees. Then run `/code-review` on the merged diff and count what the reviewer caught that you didn't.

---

## Day 3 — Hardening, automation, and shipping

### 3.1 Deterministic guardrails
Convert your most-repeated corrections into hooks. Anything you've told Claude twice is a candidate:
- `PostToolUse` on Edit/Write → run ruff/prettier + typecheck
- `PreToolUse` → block writes to `.env`, `migrations/`, `dist/`
- `Stop` → block the turn from ending until tests pass

Claude will write these for you: *"Write a hook that runs ruff format after every Python file edit"* / *"Write a hook that blocks any write to the migrations folder."*

### 3.2 Security review
```
/security-review          # reviews all pending changes
```
Plus the GitHub Action, which reads the diff on every PR and posts findings as comments — it reasons about data flow rather than matching patterns, so it catches broken access control and auth-bypass-through-odd-state-machine issues that SAST tools miss.

For this app specifically, the highest-risk surfaces are the payment callback (order-reference matching, replay, idempotency) and personal data on minors (health declarations). Point the reviewer at those explicitly.

### 3.3 CI/CD
```
/install-github-app       # guided setup of the GitHub app + secrets
```
Then wire the workflows from the starter kit: automatic PR review, `@claude` mentions in comments, and CI-failure analysis. Use a **separate API key for CI** from your dev key so you can track and rotate independently, and always via GitHub secrets — never a literal in the YAML.

One caution worth knowing: agentic CI has a real attack surface. Prompt injection through issue/PR content into a runner holding secrets is a documented class of problem. Keep CI permissions minimal (`contents: read`, `pull-requests: write`), and don't run the agent on unreviewed fork PRs.

### 3.4 Compaction and long-haul sessions
- `/clear` between unrelated tasks (cheapest, most effective habit)
- `/compact <instructions>` when the early part of the *same* task is done — e.g. `/compact focus on the payment webhook decisions`
- `/rewind` instead of `/compact` if the last few turns went somewhere you don't want — rewinding costs nothing, compaction always costs something
- Add a "Compact instructions" section to CLAUDE.md if you always want the same things preserved
- `/compact` before a break — the prompt cache expires after an hour, and summarizing is much cheaper while the conversation is still cached

### 3.5 The five failure patterns — recognize them fast

1. **Kitchen-sink session** — unrelated tasks piled in one context. → `/clear`.
2. **Correcting over and over** — after two failed corrections the context is full of failed approaches. → `/clear`, rewrite the prompt with what you learned.
3. **Over-specified CLAUDE.md** — too long, so half of it gets ignored. → prune ruthlessly, or convert rules to hooks.
4. **Trust-then-verify gap** — plausible code, unhandled edges. → if you can't verify it, don't ship it.
5. **Infinite exploration** — unscoped "investigate X" reads hundreds of files. → scope it, or send it to a subagent.

**Drill 3:** Take the three corrections you repeated most over Days 1–2 and convert each into either a hook, a path-scoped rule, or a line in CLAUDE.md — deliberately choosing which layer, and being able to say why.

---

## Part 4 — Honest calibration on the 3 days

Rebuilding this app from scratch is a strong learning project: you know the domain cold, so you can spec fast and judge output accurately — which is exactly the skill being trained.

Three days is realistic for: full agentic setup, auth, students, attendance, health declarations, reports, a deployed staging environment, and CI review running. It is **not** realistic for payments and compliance at production quality — the uPay one-time flow (unique link per order, server callback matched by order reference) plus the manual-marking path for recurring and bank transfers involves money, reconciliation, and real-world testing against a third party you don't control. Plan to stub the payment provider behind an interface on Day 2 and treat live integration as Week 2.

Set the 3-day bar at **"working vertical slices, verified, deployed to staging"** rather than "production-ready." Then measure yourself on the thing that actually matters: how many corrections per feature you needed on Day 3 versus Day 1.

---

## Part 5 — Quick reference card

**Session start:** `/model` · `/effort` · `/context`
**During:** `@file` · `Esc` to interrupt · `Esc Esc` or `/rewind` · `/clear` between tasks · `/btw` for side questions that shouldn't enter history
**Delegate:** "use subagents to investigate X" · `/code-review` · `/security-review`
**Automate:** `claude -p "..."` · `--output-format json` · `--allowedTools`
**Debug your setup:** `/context` · `/doctor` · `/hooks` · `/mcp`

**Where does this instruction go?**
- A fact Claude needs every time → `CLAUDE.md`
- A constraint on specific files → path-scoped rule
- A 30-line procedure → skill
- Work whose intermediate output you'll never read → subagent
- Must happen every time → hook
- Must never happen → permission deny rule / hook

---

## Sources for Part 2

**Official**
- Best practices for Claude Code — https://code.claude.com/docs/en/best-practices
- Full docs index — https://code.claude.com/docs/llms.txt
- Extend Claude Code (feature comparison) — https://code.claude.com/docs/en/features-overview
- Steering Claude Code: CLAUDE.md, skills, hooks, rules, subagents — https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- Maximizing the value of your Claude Code sessions — https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions
- Automate security reviews with Claude Code — https://claude.com/blog/automate-security-reviews-with-claude-code
- How Anthropic teams use Claude Code — https://www.anthropic.com/news/how-anthropic-teams-use-claude-code
- Code Review docs — https://code.claude.com/docs/en/code-review
- GitHub Actions docs — https://code.claude.com/docs/en/github-actions
- Agent teams — https://code.claude.com/docs/en/agent-teams
- `anthropics/claude-code-action` · `anthropics/claude-code-security-review`
- Free course: Anthropic Academy — "Claude Code in Action"

**Community**
- ClaudeLog — https://claudelog.com
- shanraisshan/claude-code-best-practice (Boris Cherny + Anthropic staff tips)
- DataCamp: Claude Code best practices; Spec-driven development with Claude Code
- marmelab: Claude Code tips I wish I'd had from day one
- chudi.dev: Claude Code best practices 2026
- Frameworks: obra/superpowers · github/spec-kit · BMAD-METHOD · awesome-claude-code
- Microsoft Security: Securing CI/CD in an agentic world (Claude Code Action case)

---
---

# PART 3 — How Claude Actually Remembers Your Codebase


## First: the premise is half wrong, and the correction matters

**Claude does not re-read every file on every turn.** Here's what actually happens:

Within one session, a file Claude reads is appended to the conversation once. Every following turn re-*sends* that conversation to the model — but the prefix is served from the prompt cache at roughly a tenth of the input price. Nothing is re-read from disk. The real cost isn't re-reading; it's **occupancy**: that file now takes up room in the window the model has to reason around, on every remaining turn, whether it's still relevant or not.

Across sessions, each new session starts with an empty context window. *That's* the "re-explaining tax" you're feeling.

So the problem to solve isn't "make Claude re-read faster." It's two separate problems:

| Problem | Solution family |
|---|---|
| Claude wastes turns *finding* the right code | navigation: LSP, repo map, good CLAUDE.md pointers |
| Claude starts every session knowing nothing | persistence: CLAUDE.md hierarchy, auto memory, docs in repo |

## Second: the "neural network of files" you're imagining already exists — and it isn't a neural network

There's no vector database, no embeddings index, no RAG over your repo. What Claude Code actually uses is simpler and, for this purpose, better: **a two-layer index.** A small file that always loads and points at bigger files that load only when needed.

That single pattern — progressive disclosure — is how *every* memory mechanism in Claude Code works:

```
always loaded (small)          →  loaded on demand (large)
────────────────────────────────────────────────────────────
CLAUDE.md (root)               →  nested CLAUDE.md in subdirs
rule descriptions              →  path-scoped rule bodies
skill names + descriptions     →  SKILL.md bodies
MEMORY.md index                →  auto-memory topic files
CLAUDE.md pointers to docs/    →  docs/architecture.md, ADRs
```

Most of what you want an agent to remember about a codebase is small, structured and explicit. A directory of markdown files with an index on top is the right shape. Build that, not a graph database.

---

## The five layers, in the order you should set them up

### Layer 1 — CLAUDE.md hierarchy (structure)

Claude walks **up** the directory tree from where you launched, loading every `CLAUDE.md` and `CLAUDE.local.md` it finds, concatenated root-first so the file closest to your working directory is read last. Files in **sub**directories are discovered too, but load on demand — `app/payments/CLAUDE.md` enters context when Claude reads a file under `app/payments/`, not at launch.

That gives you a free two-tier structure:

```
CLAUDE.md                    # ~120 lines: stack, commands, layout, hard rules, pointers
app/payments/CLAUDE.md       # ~25 lines: only loads when working on payments
app/attendance/CLAUDE.md     # ~20 lines
web/src/CLAUDE.md            # ~25 lines: RTL/i18n specifics
```

Two traps:
- **`@path` imports don't save context.** `@docs/architecture.md` expands and loads at launch, same as pasting it in. To make a doc *optional*, mention the path in plain text instead: `See docs/architecture.md for the module map` — Claude reads it when it needs it. That distinction is the whole game.
- **Nested CLAUDE.md files are not re-injected after `/compact`.** They reload when that directory is next touched.

Target: root file under 200 lines (Anthropic's number); community practitioners run 60–150 and report better adherence. Boris Cherny's stated figure — frontier models reliably follow roughly 150–200 instructions, and Claude Code's own system prompt already spends about 50 of them — is the reason the ceiling exists at all.

Run `/doctor` — it proposes trims for a checked-in CLAUDE.md, specifically cutting things Claude can derive from the code (directory listings, dependency lists) and keeping the gotchas and rationale it can't.

### Layer 2 — Auto memory (the thing you're actually asking for)

This is on by default and most people never look at it. Claude keeps its own notes per repository at:

```
~/.claude/projects/<project>/memory/
├── MEMORY.md          # index — first 200 lines / 25KB load EVERY session
├── debugging.md       # topic file — read on demand
├── api-conventions.md
└── ...
```

`MEMORY.md` is the index; topic files are the depth. Claude writes to it during sessions — that's what "Saved 2 memories" / "Recalled 2 memories" means in the UI. Claude Code actively pushes back when the index grows: it warns near the 200-line limit and errors past it, telling Claude to keep one line per entry and move detail into topic files.

Scope detail that matters for your parallel work: the directory is derived from the **git repository**, so all worktrees of the same repo share one auto memory.

**Do this in your first session:**
```
/memory          # browse what's stored, confirm the auto-memory toggle is on
```
Then read `MEMORY.md` yourself. Everything is plain markdown — edit it, delete wrong entries, restructure the index. Stale memory is worse than no memory, and after enough sessions notes do accumulate contradictions.

You can also just tell Claude to remember something — *"remember that the payment callback tests need a local ngrok tunnel"* — and it lands in auto memory. If you want it in CLAUDE.md instead, say so explicitly.

### Layer 3 — Code intelligence / LSP (navigation, not memory)

By default Claude finds symbols the way you would in a terminal: grep, read the matches, guess which one you meant. Install a code intelligence plugin plus the language server binary for your language and it gets real operations instead — go-to-definition, find-references, call hierarchy, plus type diagnostics automatically after every edit, so it sees and fixes its own type errors in the same turn.

Net effect on context is usually *negative* — a symbol lookup replaces reading three files.

**The catch, and it's a real one:** Claude Code's system prompt tells the model to use Grep for content search and Glob for file search, and that instruction is stronger than a CLAUDE.md preference. One practitioner measured 12 LSP calls out of 1,082 navigation calls after installing it. So be explicit and narrow:

```markdown
For symbol lookups (definition, references, callers), use the LSP tools.
Use grep only for string literals, comments, and config values.
```

For a Python + TypeScript project this is worth the 20 minutes on Day 0.

### Layer 4 — Written architecture in the repo

Auto memory is machine-local and not shared across machines or with teammates. Anything that should outlive your laptop goes in the repo as real docs:

```
docs/
├── architecture.md      # module map, data flow, why the boundaries are where they are
├── decisions/           # short ADRs: context → decision → consequences
│   ├── 001-money-in-agorot.md
│   └── 002-manual-recurring-payments.md
└── domain.md            # judo-club vocabulary: חוג, מנוי, הוראת קבע, מחזור
```

Reference them as **pointers** from CLAUDE.md, never `@imports`. Then:

> After fixing a bug that came from a wrong assumption, update `docs/decisions/` with what the real behaviour is before fixing the code.

That habit is the highest-value one in this whole document. Claude has no memory between sessions; the docs do — and they're useful to you and to Levi too.

### Layer 5 — Task state across sessions

For work spanning several sessions, keep three small files at the repo root or in `.claude/work/`:

- `plan.md` — the approved plan (written in plan mode, reviewed by you)
- `context.md` — decisions made, dead ends already ruled out, constraints discovered
- `tasks.md` — checklist with status

This is the community "dev docs" pattern, and it exists for a specific reason: when a long session hits auto-compaction, the summary may drop things. Files on disk don't compact. `/clear`, then `read @plan.md @tasks.md and continue from the first unchecked item` costs a few thousand tokens and restores full working state.

Reinforce it in CLAUDE.md:
```markdown
## Compact instructions
When compacting, preserve: modified files, the current tasks.md item, and any
test commands established this session.
```

---

## What to keep OUT

- `.gitignore` + a deny rule for build artifacts, `node_modules`, lock files, generated migrations output. Every token spent reading `dist/` is a token unavailable for real code.
- Launch sessions from the **subdirectory** you're working in when the task is local to it. Scope beats configuration.
- `/mcp` off any server you don't need this session. Run `/context` and look at the numbers.

---

## 20-minute setup checklist

- [ ] `/init` to generate the root CLAUDE.md, then delete everything Claude could infer from the code
- [ ] Add a nested `CLAUDE.md` to each of `app/payments/`, `app/attendance/`, `web/src/`
- [ ] `/memory` — confirm auto memory is on; read `MEMORY.md`
- [ ] Install the code intelligence plugin for Python and TypeScript + language server binaries
- [ ] Add the explicit LSP-vs-grep line to CLAUDE.md
- [ ] Create `docs/architecture.md` and `docs/decisions/` — ask Claude to write the first draft, then correct it yourself
- [ ] Add pointer lines (not `@imports`) to CLAUDE.md
- [ ] Add the "Compact instructions" section
- [ ] `/context` — verify what loaded and what it costs

**Verify it worked:** start a completely fresh session and ask *"How does attendance handle make-up sessions, and where is that logic?"* If it answers without grepping half the repo, your index is doing its job.

---

## Sources for Part 3
- How Claude remembers your project (CLAUDE.md scopes, auto memory, `.claude/rules/`, compaction behaviour) — https://code.claude.com/docs/en/memory
- Set up Claude Code in a monorepo or large codebase — https://code.claude.com/docs/en/large-codebases
- How Claude Code works in large codebases — https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start
- Maximizing the value of your Claude Code sessions (prompt caching, what re-sends) — https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions
- Explore the context window — https://code.claude.com/docs/en/context-window
- LSP in practice: amazingcto.com/lsp-in-claude · scottspence.com/posts/enable-lsp-in-claude-code · circleci.com/blog/claude-code-lsp
- Auto memory write-ups: claudefa.st/blog/guide/mechanics/auto-memory · claudedirectory.org/blog/claude-code-auto-memory-guide
- Dev-docs pattern: dev.to "Claude Code is a Beast — Tips from 6 Months of Hardcore Use" · chudi.dev
- `LuciferForge/claude-code-memory` · `luongnv89/claude-howto` (memory templates)

---
---

# PART 4 — Building Multiple Features Simultaneously


## Step 0 — Decide what can actually run in parallel

This is the step people skip, and it's where parallel work goes wrong. Two features can run in parallel only if they don't fight over the same files. Before splitting anything, run this once:

```
Read @SPEC.md. I want to build these features in parallel: [A, B, C].
For each pair, tell me: which files they both touch, whether they share DB
tables or migrations, and which shared types or API contracts must exist first.
Then give me a build order: what must be sequential, what can be parallel,
and what the seams are. Don't write code.
```

Three rules that come out of this almost every time:

1. **Migrations serialize.** One lane owns the schema. Two agents writing Alembic revisions in parallel produces two heads and a merge you'll do by hand at midnight.
2. **Shared types go first, on main.** Commit the Pydantic schemas and TypeScript types every lane depends on *before* the lanes start. Now each lane codes against a contract instead of inventing one.
3. **One owner per file.** Assign directories, not tasks. Lane A owns `app/attendance/**` and `web/src/pages/Attendance*`. If two lanes need the same file, that's a sequencing problem, not a parallelism opportunity.

Ten minutes here saves a day of merge conflicts.

---

## The five mechanisms, weakest coupling to strongest

### 1. Subagents — parallel *inside* one session
Best for research and review, not for building features. Each runs in its own context window; only a summary returns.

```
Use subagents to investigate, in parallel: (a) how our auth middleware resolves
club_id, (b) whether any existing utility does date-range grouping, (c) what
the current notification sending path looks like. Report findings separately.
```
Three explorations, none of which fill your main context. Subagents can also nest up to five levels deep, and they run in the background by default.

**Use for:** research fan-out, parallel review from different angles, log analysis.
**Don't use for:** building two features at once — they can't hold a long build each, and they all write into your one working tree.

### 2. Git worktrees — the workhorse for parallel features
Separate checkouts, separate branches, separate directories. Edits physically cannot collide.

```bash
git worktree add ../sm-attendance  -b feat/attendance
git worktree add ../sm-health      -b feat/health-declarations
git worktree add ../sm-reports     -b feat/monthly-reports

# one terminal per worktree
cd ../sm-attendance && claude
```

Claude Code also has a `--worktree` flag and a `.worktreeinclude` mechanism for carrying gitignored files (like `.env.local`) into new worktrees. Name each session with `/rename` — `attendance`, `health`, `reports` — so `claude --resume` is navigable a day later.

Useful detail: **all worktrees of one repo share the same auto-memory directory**, so what one lane learns about the codebase is available to the others. Your `.env` and `node_modules` are not shared — each worktree needs its own install, or symlink them.

**This is where you should spend your Day 2.** Two or three lanes is the sweet spot for one person.

### 3. Agent view — managing many sessions from one screen
Once you have three or more sessions, tracking which one is waiting on you becomes the bottleneck. Agent view dispatches and displays every session's status in one place, showing which ones need input. The desktop app does the same thing visually with git isolation per session; the mobile app can monitor and steer running sessions.

Practical pattern: start three lanes in the morning, work the review queue rather than any single lane.

### 4. Agent teams — independent sessions that talk to each other
Multiple full Claude Code sessions with peer-to-peer messaging and a shared task list, coordinated by a team lead rather than by you. Higher token cost — each teammate is a separate instance — but they can challenge each other and hand work across.

Best fits, per Anthropic's own framing: parallel research with competing hypotheses, parallel code review from several angles at once, and new feature development where each teammate owns a distinct piece.

**Still experimental and disabled by default.** For a 3-day solo sprint, treat this as a Day 3 experiment, not the critical path — worktrees give you 90% of the parallelism with none of the coordination risk.

The transition signal is specific: you're running parallel subagents and either hitting context limits or finding they need to talk to each other. Until that happens, you don't need teams.

### 5. Fan-out and dynamic workflows — bulk mechanical work
For anything repetitive across many files:

```bash
claude -p "list every component under web/src that still uses margin-left/right \
  instead of logical properties, save to files.txt"

for file in $(cat files.txt); do
  claude -p "Convert $file to CSS logical properties. Run the tests for it. \
    Return OK or FAIL." --allowedTools "Edit,Bash(npx vitest run *)"
done
```
Test on two or three files, fix the prompt, then run the full set. `--allowedTools` matters here — it's the only thing scoping an unattended loop.

**Dynamic workflows** are the scaled version: Claude writes a script that orchestrates tens to hundreds of background subagents, keeping the orchestration plan and intermediate results in script variables rather than in the context window. Reach for it on codebase audits and large migrations, not on three features.

---

## A concrete 3-lane plan for your rebuild

**Before splitting (main branch, sequential — ~2 hours):**
1. Project skeleton, auth, DB connection, base test harness
2. Core models + the initial migration
3. Shared Pydantic schemas and TS types for Student, Session, Payment
4. `SPEC.md` sections written for all three features
5. Commit and push. This is the contract.

**Then three worktrees:**

| Lane | Owns | Verification |
|---|---|---|
| A — attendance | `app/attendance/**`, `web/src/pages/Attendance*` | pytest on the module + a vitest component test |
| B — health declarations | `app/health/**`, `web/src/pages/Health*` | pytest + a form-validation test |
| C — payments (stubbed) | `app/payments/**`, provider behind an interface | pytest against a fake provider; no live calls |

Each lane's opening prompt:
```
Read @SPEC.md section "[Feature]" and @docs/architecture.md.
You own only [directories]. Do not modify shared schemas, migrations, or
anything under [other lanes' directories] — if you need a change there, stop
and tell me instead.
Plan first. Then write failing tests from the acceptance criteria, implement,
and run them. Show me the test output.
```

That "stop and tell me" clause is what keeps lanes from silently reaching into each other.

**Integration (sequential, you drive):**
Merge one lane at a time, run the full suite after each, `/code-review` on the accumulated diff. Merging three branches at once and then debugging is the worst version of this.

---

## The Writer/Reviewer split, applied across lanes

Once lanes are running, a fourth session does nothing but review:

| Lane sessions | Review session |
|---|---|
| build | `Review the attendance diff on feat/attendance against SPEC.md. Report gaps, not style.` |
| build | `Now review feat/health-declarations the same way.` |

A fresh context reviews better because it isn't attached to code it just wrote. And a reviewer told to find gaps will find some even in sound work — tell it to flag only what affects correctness or the stated requirements, or you'll spend the afternoon adding defensive code for cases that can't happen.

---

## The honest constraint

Parallelism doesn't multiply your output. It multiplies your **review load**, and your review bandwidth is fixed.

The point practitioners running agents at scale keep landing on is worth internalising: at human coding speed, mistakes surface slowly enough that pain forces correction early. With several agents running, small errors compound faster than one person can catch them. Three lanes producing plausible-looking code is three times the diff to actually read.

So:
- **Two or three lanes maximum** as a solo developer. Five is a fantasy unless the work is mechanical.
- **Every lane needs its own runnable check**, or you become the test suite for all three.
- **Review each lane before merging**, never after. A bad merge contaminates the other lanes' baseline.
- **Prefer parallel *verification* to parallel *building*.** Three reviewers on one feature is almost always higher value than three builders on three features — and it's the pattern Anthropic's docs point at most consistently.

If you only take one structural habit from this file: **spend Day 2's parallelism budget on lanes that can be verified independently.** Anything you can't verify without reading it yourself shouldn't be running in parallel.

---

## Sources for Part 4
- Best practices: Run multiple Claude sessions, fan out across files, adversarial review — https://code.claude.com/docs/en/best-practices
- Run agents in parallel (subagents vs agent view vs teams vs workflows) — https://code.claude.com/docs/en/agents
- Run parallel sessions with worktrees — https://code.claude.com/docs/en/worktrees
- Orchestrate teams of Claude Code sessions — https://code.claude.com/docs/en/agent-teams
- Dynamic workflows — https://code.claude.com/docs/en/workflows
- Manage multiple agents with agent view — https://code.claude.com/docs/en/agent-view
- Extend Claude Code (subagent vs agent team comparison) — https://code.claude.com/docs/en/features-overview
- marmelab: Claude Code tips I wish I'd had from day one — https://marmelab.com/blog/2026/04/24/claude-code-tips-i-wish-id-had-from-day-one.html
- dev.to: How I use sub-agents to build entire features in parallel

---
---

# PART 5 — The Starter Kit


Drop-in templates. Fastest way to apply them: save this guide into the repo, open Claude Code, and say
*"Read Part 5 of @claude-code-guide.md and create every file it defines at the paths given. Don't add anything extra."*

Target layout:
```
CLAUDE.md
SPEC.md                       # generated on Day 1 by the interview prompt
.claude/
  settings.json
  rules/api.md
  rules/ui-rtl-a11y.md
  skills/feature/SKILL.md
  skills/ship-check/SKILL.md
  skills/payments/SKILL.md
  agents/spec-auditor.md
  agents/security-reviewer.md
  agents/log-digger.md
  hooks/block-protected.sh
.github/workflows/claude-review.yml
```

---

## 1. `CLAUDE.md`

Keep it under ~150 lines. Facts only — things Claude cannot infer by reading the code. If Claude already gets something right without the line, delete the line.

```markdown
# Studio Manager

Judo club management: enrollment, attendance, payments, health declarations, monthly reports.
Users are club admins and parents. UI is Hebrew, RTL, mobile-first.

## Stack
- Backend: Python (FastAPI), SQLAlchemy, Alembic migrations, PostgreSQL
- Frontend: React + TypeScript + Vite
- Auth: Google OAuth
- Payments: uPay

## Commands
- Dev (backend): `uvicorn app.main:app --reload`
- Dev (frontend): `npm run dev`
- Backend tests: `pytest -q`
- One frontend test file: `npx vitest run <file> --reporter=dot`
- Typecheck: `npm run typecheck && mypy app`
- Lint/format: `ruff check --fix app && ruff format app && npm run lint`
- Migration: `alembic revision --autogenerate -m "<msg>"` then `alembic upgrade head`

## Layout
- `app/` FastAPI: `routers/`, `services/`, `models/`, `schemas/`
- `web/src/` React: `pages/`, `components/`, `api/`, `hooks/`
- Business logic lives in `services/`. Routers stay thin — parse, call a service, return.

## Conventions
- All money is stored in agorot (integers). Never floats.
- All timestamps stored UTC; render in Asia/Jerusalem.
- Hebrew user-facing strings live in `web/src/i18n/he.ts` — never inline in components.
- New API endpoints are versioned under `/api/v1/`.

## Gotchas
- Recurring payments (הוראת קבע) cannot be created programmatically by our provider.
  They are marked paid manually in-app, same flow as bank transfers. Do not build
  automated recurring billing.
- Health declarations contain personal data about minors. Never log their contents.

## Workflow
- Write a failing test before fixing a bug.
- Typecheck and lint after a series of edits.
- Prefer running a single test file over the whole suite.

## Compact instructions
When compacting, always preserve: the list of modified files, the current plan or
SPEC.md section being implemented, and any test commands established this session.
```

---

## 2. Path-scoped rules

Rules only load when Claude touches matching files, so they cost nothing during unrelated work.

**`.claude/rules/api.md`**
```markdown
---
paths:
  - "app/routers/**"
  - "app/schemas/**"
---
- Every request body and query param is validated by a Pydantic schema. No raw dicts.
- Every endpoint declares an explicit `response_model`.
- Authorization is checked in the router via a dependency, never inside a service.
- Errors return our `ApiError` shape: `{code, message, details?}`. Never leak stack traces.
- Any endpoint touching student data must filter by the caller's club_id.
```

**`.claude/rules/ui-rtl-a11y.md`**
```markdown
---
paths:
  - "web/src/**"
---
- The app is RTL. Use logical CSS properties (margin-inline-start, not margin-left).
- No hardcoded Hebrew or English strings in components — use the i18n module.
- Target WCAG 2.0 AA (IS 5568): every interactive element has an accessible name,
  visible focus state, and 4.5:1 contrast minimum.
- Forms: every input has an associated <label>; errors are linked via aria-describedby.
- Do not add a new UI dependency without asking first.
```

---

## 3. Skills (procedures)

**`.claude/skills/feature/SKILL.md`** — your standard build loop
```markdown
---
name: feature
description: Build a feature end to end from SPEC.md — plan, implement, test, self-review
argument-hint: <feature name or SPEC.md section>
---
Build the feature: $ARGUMENTS

1. Read the relevant section of @SPEC.md. If it is ambiguous, ask before coding.
2. List the files you will create or change, and what is explicitly out of scope.
3. Write failing tests first, covering the acceptance criteria and the edge cases
   named in the spec.
4. Implement until the tests pass. Run `pytest -q` and the relevant vitest file.
5. Run lint and typecheck.
6. Use a subagent to review your diff against the spec section. Report gaps only —
   correctness and stated requirements, not style preferences.
7. Fix real gaps, then summarize what you built, what you skipped, and why.

Show evidence: the commands you ran and their output. Do not claim success without it.
```

**`.claude/skills/ship-check/SKILL.md`** — the gate before a PR
```markdown
---
name: ship-check
description: Pre-merge checklist — tests, types, lint, migrations, security, a11y
disable-model-invocation: true
---
Run every step and report PASS/FAIL per line with the actual output. Stop at the first FAIL.

1. `pytest -q`
2. `npm run test -- --reporter=dot`
3. `npm run typecheck && mypy app`
4. `ruff check app && npm run lint`
5. Migrations: if models changed, confirm a migration exists and `alembic upgrade head` runs clean
6. `/security-review` on the pending diff
7. Confirm no new hardcoded strings in `web/src/**` outside the i18n module
8. Confirm no secrets, keys, or student data in the diff or in any added log statement

Then produce a PR description: what changed, why, how it was verified, what was not covered.
```

**`.claude/skills/payments/SKILL.md`** — reference skill, loads only when relevant
```markdown
---
name: payments
description: How payments work in this app — uPay flows, callbacks, reconciliation rules
---
# Payment model

Two paths, deliberately different:

## One-time payments (automated)
1. App creates a unique payment link per order via the provider.
2. Order reference is stored locally with status `pending`.
3. Provider calls our server callback on completion.
4. Callback handler matches on order reference, verifies the payload, sets status `paid`.

Rules:
- The callback must be idempotent. The same notification can arrive more than once.
- Store only non-sensitive metadata. Never card data.
- Never trust an amount from the client — compare against the stored order.
- A callback for an unknown reference is logged and rejected, not auto-created.

## Recurring (הוראת קבע) — manual
The provider cannot create per-customer recurring links programmatically, and a shared
link gives no way to tell who paid. So recurring is tracked in-app by an admin marking
a month as paid — identical flow to bank transfers.

Do not build automated recurring billing. Do not attempt to parse a shared link's
notifications into per-customer records.
```

---

## 4. Subagents (isolated workers)

**`.claude/agents/spec-auditor.md`**
```markdown
---
name: spec-auditor
description: Reviews a diff against SPEC.md and reports missing requirements and untested edge cases
tools: Read, Grep, Glob, Bash
model: sonnet
---
You audit implementations against a written specification.

Given a diff and a spec section:
1. List every requirement in the spec and mark it implemented / partial / missing.
2. List every edge case the spec names and whether a test covers it.
3. Flag anything changed that the spec did not ask for.

Report gaps that affect correctness or stated requirements. Do not report style
preferences, naming opinions, or speculative refactors. If the work is complete,
say so plainly rather than manufacturing findings.
```

**`.claude/agents/security-reviewer.md`**
```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities with line references and fixes
tools: Read, Grep, Glob, Bash
model: opus
---
You are a senior application security engineer reviewing a diff.

Priorities for this codebase, in order:
1. Payment callback handling — replay, idempotency, amount tampering, unverified payloads
2. Authorization — any path that returns student data without a club_id filter
3. Personal data on minors — health declarations appearing in logs, errors, or responses
4. Injection (SQL, XSS, command), auth/session flaws, secrets in code
5. Insecure direct object references in REST paths

Give specific line references and a concrete fix for each finding. Rank by exploitability.
```

**`.claude/agents/log-digger.md`**
```markdown
---
name: log-digger
description: Reads long logs, test output, or traces and returns only the relevant findings
tools: Read, Grep, Glob, Bash
model: haiku
---
You analyze noisy output so it never enters the main conversation.

Return: the failure(s), the smallest relevant excerpt, the likely root cause, and the
file:line to look at. Never paste the full log. If there is nothing notable, say so in
one line.
```

---

## 5. `.claude/settings.json` — permissions + hooks

```json
{
  "permissions": {
    "allow": [
      "Bash(pytest:*)",
      "Bash(ruff:*)",
      "Bash(npm run lint)",
      "Bash(npm run typecheck)",
      "Bash(npx vitest run:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(gh pr:*)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(alembic downgrade:*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_FILE_PATH\" | grep -q '\\.py$'; then ruff format \"$CLAUDE_TOOL_FILE_PATH\" && ruff check --fix \"$CLAUDE_TOOL_FILE_PATH\"; fi"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/block-protected.sh" }
        ]
      }
    ]
  }
}
```

**`.claude/hooks/block-protected.sh`** (`chmod +x`)
```bash
#!/usr/bin/env bash
# Exit 2 = deny the tool call. stderr is shown to Claude so it knows why.
path="${CLAUDE_TOOL_FILE_PATH:-}"
case "$path" in
  *.env|*.env.*|*/migrations/versions/*|*/dist/*|*/node_modules/*)
    echo "Blocked: $path is protected. Ask the user before touching it." >&2
    exit 2
    ;;
esac
exit 0
```

> Hook input fields and env vars have changed across versions. If a hook silently
> doesn't fire, run `/hooks` to see what loaded and ask Claude:
> *"Read the current hooks reference and fix this hook to match."* That is faster
> than guessing — and a good habit generally: let Claude read its own current docs.

Optional **Stop hook** — refuses to end the turn until tests pass. Powerful and
occasionally infuriating; add it once your suite is fast:
```json
"Stop": [
  { "hooks": [ { "type": "command", "command": "pytest -q" } ] }
]
```

---

## 6. `.github/workflows/claude-review.yml`

Easiest path is `/install-github-app` inside Claude Code, which sets up the app and secrets for you. Manual version:

```yaml
name: Claude PR Review
on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY_CI }}
          prompt: |
            Review this PR. Focus on:
            - payment callback correctness (idempotency, replay, amount verification)
            - authorization: any query returning student data without a club_id filter
            - personal data on minors appearing in logs or responses
            - missing tests for stated acceptance criteria
            Report only issues affecting correctness or security. Be concise.
```

Notes that matter:
- Use a **separate CI API key** (`ANTHROPIC_API_KEY_CI`) from your dev key, so you can track spend and rotate independently.
- The `if:` condition skips fork PRs. Running an agent with repo secrets on unreviewed external content is the main injection risk in agentic CI.
- Check the action's README for current input names before copying — this one moves.

Also worth adding: `anthropics/claude-code-security-review` as a second workflow for diff-aware vulnerability scanning.

---

## 7. Prompt templates

**Spec interview (Day 1, fresh session)**
```
I want to build [description]. Interview me in detail using the AskUserQuestion tool.
Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs.
Don't ask obvious questions — dig into the hard parts I might not have considered.
Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.
```

**Scoped investigation (never let it roam)**
```
Use subagents to investigate [narrow question]. Report only: the relevant files,
how it currently works, and anything that would block [my planned change].
```

**Adversarial review**
```
Use a subagent to review the [X] diff against SPEC.md. Check that every requirement
is implemented, the listed edge cases have tests, and nothing outside scope changed.
Report gaps, not style preferences.
```

**Bug fix (root cause, not symptom)**
```
[symptom]. Check @path/to/likely/file. Write a failing test that reproduces it first,
then fix it. Address the root cause — don't suppress the error. Show me the test
output before and after.
```

**Onboarding yourself to the new codebase (Day 3, useful even though you wrote it)**
```
How does attendance handle make-up sessions? Walk me through the flow from the API
call to the database write, naming files and line numbers.
```

**Turning a repeated correction into config**
```
I've corrected you three times about [X]. Decide where this belongs: CLAUDE.md,
a path-scoped rule, a skill, or a hook — and explain which and why. Then write it.
```

---

## 8. First-hour checklist

- [ ] `claude` runs in the repo; `gh` installed and authenticated
- [ ] `/context` shows CLAUDE.md loaded and nothing unexpected
- [ ] `/model` and `/effort` set deliberately
- [ ] `.claude/` scaffolded from this file; `chmod +x .claude/hooks/*.sh`
- [ ] `/hooks` confirms your hooks are registered
- [ ] Test, lint, and typecheck commands actually run — and are in CLAUDE.md with quiet flags
- [ ] `.env` in `.gitignore` and in the permissions deny list
- [ ] SPEC.md generated from the interview, and you have read it end to end
