# The build cockpit — design

**Date:** 2026-08-25
**Status:** Approved for planning. No implementation has started.
**Layout:** [Build Cockpit Directions](https://claude.ai/code/artifact/52677a4f-62b1-4c1d-b94b-027c1a6a0a75)
— three artboards; the chosen one is *The Cockpit*.

---

## 1. What this is, and what it is not

A local-only dashboard for **the person building Studio Manager**, answering three
questions between agent sessions: where am I, what is holding me back, what do I run next.

It is **not** SPEC §6.4's manager dashboard. That one is a product surface for club
managers, ships to Railway, is Hebrew and RTL, and is built in a later wave. This one is a
developer tool, is English and LTR, and never leaves `127.0.0.1`. The name collision is
unfortunate and worth remembering: in this document *cockpit* always means the developer
tool, and *dashboard* always means `web/apps/dashboard/`.

### 1.1 The governing constraint

The cockpit's job is to tell you the truth when something is broken. So it must boot when
the thing it reports on does not. Concretely:

- It never imports `app/`. A broken model, a bad migration or a missing env var must not
  stop the cockpit from rendering.
- It is not part of the npm workspace and needs no `npm install` to run.
- It has no build step. The page is one file of HTML with inline CSS and JS.
- Its only third-party import is PyYAML, already declared in `requirements-dev.txt`.

Every design decision below follows from this constraint. Where a decision trades
capability for that property, the trade is stated.

---

## 2. Decisions taken

Each of these was chosen deliberately; the rejected alternative is recorded so a later
session does not silently re-litigate it.

| # | Decision | Rejected alternative, and why |
|---|---|---|
| K1 | **Build progress is primary; runtime health is a strip.** | A runtime-ops board. The user is not operating a live service yet — production is not deployed. Milestone position is the daily question. |
| K2 | **Hybrid truth: one authored state file, plus computed live signals.** | (a) Parsing `next-session.md` prose to infer status — heuristic, and wrong silently when a blockquote is reworded. (b) Declaring everything including test results — stale status is worse than no status. |
| K3 | **Allowlisted commands only. No free-text shell, no agent launching.** | A terminal pane. An unauthenticated local page that runs arbitrary commands is a foothold for any browser tab that can reach the port. The allowlist makes the blast radius a design decision rather than a runtime accident. |
| K4 | **Standalone tool in `tools/cockpit/`.** | (a) A fourth Vite app in `web/apps/` — needs the workspace to boot, and lands in every lane's blast radius. (b) Folding into the `/dev` router — couples the build cockpit to product runtime and tenancy, and dies when `app/` will not import. |
| K5 | **Four holdback kinds, split into declared and live.** | One flat list. Three kinds are authored facts (external prerequisites, spec conflicts, carried debt); the fourth (failing gates) is measured. Mixing them lets a stale declaration masquerade as a measurement. |
| K6 | **Env status from each environment's own health endpoint.** | The Railway GraphQL API. That needs a token in local env, and it reports what Railway believes rather than whether the app answers. |
| K7 | **`state.yaml`, not `state.json`.** | JSON needs zero third-party imports, but PyYAML is already a declared dev dependency, so YAML costs nothing and is far better to hand-edit. |

---

## 3. Architecture

```
studio-manager/
  app/                          product API            — never imported by the cockpit
  web/                          product apps           — never entered by the cockpit
  tools/
    cockpit/
      __init__.py
      server.py                 http.server, routes, SSE
      state.py                  read/write docs/plan/state.yaml
      signals.py                git, run history, alembic head
      envs.py                   concurrent health probes
      commands.py               the allowlist, as data
      static/
        index.html              one file, inline CSS + JS, no build step
      runs/                     gitignored run records
  scripts/cockpit.sh            ./scripts/cockpit.sh  →  http://127.0.0.1:7317
  docs/plan/state.yaml          the authored truth
```

`server.py` uses `http.server.ThreadingHTTPServer`. Threading is required: an SSE stream
holds a connection open for the length of a run, and the page must keep polling other
routes meanwhile.

The port is `7317`, overridable with `COCKPIT_PORT`. `cockpit.sh` runs
`.venv/bin/python -m tools.cockpit.server` — the `.venv/bin/` prefix per CLAUDE.md §Commands,
because a bare `python3` resolves to an old 3.8 interpreter earlier on PATH.

---

## 4. `docs/plan/state.yaml` — the authored truth

It lives beside `milestone-plan.md` because it is plan data: versioned, and reviewed in a
diff like any other plan change.

### 4.1 Schema

The `#` annotations below are for *this document*. The file itself carries none — see
rule 2 in §4.2.

```yaml
version: 1
updated: 2026-08-25

waves:
  - id: W0
    milestone: M0                 # display label; "M2 ∥ M3" for a parallel wave
    title: Foundations
    mode: sequential              # sequential | parallel
    lanes: []                     # lane ids for parallel waves, e.g. [SCHEDULE, PEOPLE]
    exit_gate: lane-check core green · three apps install and launch standalone
    status: active                # pending | active | shipped
    pieces:
      - id: M0.1
        title: Corrections, skeleton, install layer
        status: shipped           # pending | active | shipped
        on: 2026-08-24
      - id: M0.4
        title: The demo studio and the dev bar
        status: active
        items:                    # optional sub-checklist
          - { title: /dev router, conditionally mounted, status: shipped }
          - { title: Demo studio from a versioned fixture set, status: pending }

holdbacks:
  - id: HB-upay
    kind: external                # external | conflict | carried
    title: uPay merchant account not confirmed live
    why: Third-party turnaround is not yours to control, and the money lane sits behind it.
    blocks: W4                    # a wave id, a milestone id, or free text like "M0 exit"
    status: open                  # open | closed
    opened: 2026-08-24
    closed: null
    source: SPEC §15 item 2       # optional provenance
```

### 4.2 Rules

1. **Nothing measurable may be declared here.** No test results, no environment health, no
   git state, no "gates green". If the cockpit can compute it, this file is forbidden from
   claiming it. This is what stops the file from rotting into a lie.
2. **No free-floating YAML comments.** PyYAML does not preserve comments across a
   round-trip, and the cockpit writes this file. Every explanation goes in a field — that is
   what `why:` and `source:` are for. The writer emits a generated header saying so.
3. Progress is **derived**, never stored: a piece's `done/of` comes from counting `items`;
   a wave's progress comes from counting `pieces`. No counter to forget to increment.
4. The writer uses `sort_keys=False`, `allow_unicode=True`, `default_flow_style=False`, so
   a machine write produces a reviewable diff rather than a reordered file.

### 4.3 Seeding

The initial file is authored by hand from `milestone-plan.md` Part 2 and Part 3, the SPEC
§15 prerequisites, Part 5's C1–C9, and the Railway runbook's open item. That transcription
is a task in the implementation plan, not a runtime feature — the cockpit never parses the
prose docs.

---

## 5. Live signals — computed, never authored

| Signal | Source | When it cannot answer |
|---|---|---|
| branch · dirty · HEAD · open worktrees | `git` | never — local and always available |
| last gate run per command | `tools/cockpit/runs/*.json` | "not run in this checkout" |
| env reachable · revision · uptime | `GET <api>/api/v1/health` per environment | "unknown · last seen HH:MM" |
| local alembic head | `.venv/bin/alembic heads` | "unknown" if the venv is broken |

### 5.1 The environment probe

Targets come from `infra/railway/domains.json`, which the runbook already establishes as the
only place a hostname is written. Production currently reads `https://PENDING-production-services`;
a target that does not parse as a real host renders as **not deployed**, never as an error.

Probes run **concurrently**, each with a 2-second hard cap, and **off the page-load path**:
`GET /api/state` returns immediately from local sources, the page paints, and the env bar
fills in from a separate `GET /api/envs`. A hung Railway can slow the bar and nothing else.

Results are cached in memory with a last-seen timestamp, so a failed probe degrades to
"unknown · last seen 09:04" rather than blanking a bar that was populated a minute ago.

### 5.2 The product-code change this requires

`HealthResponse` in `app/routers/health.py` returns `{status, env}`. The env bar needs two
more fields:

- `revision` — the alembic revision the running database is actually at.
- `started_at` — process start, in UTC, which the page renders as an age.

This is the **only** product code the cockpit work touches, and it is a deliberate,
acknowledged exception to §1.1. It stands on its own merits — a health endpoint that reports
its schema revision is how you catch an environment running last week's migrations — but it
is a change to shipped code and must be tested as such: the endpoint stays unauthenticated
and tenant-free (SPEC's existing constraint), and `revision` must be read from the database,
not from the local filesystem, or it reports what the image contains rather than what the
database is at.

---

## 6. The command runner

### 6.1 The allowlist, as data

`commands.py` holds a table. The page can only ask for an entry by id.

| id | argv | argument |
|---|---|---|
| `lane-check` | `./scripts/lane-check.sh <vertical>` | vertical, from a fixed enum |
| `ci-local` | `./scripts/ci-local.sh` | none |
| `pytest` | `.venv/bin/pytest -q` | none |
| `mypy` | `.venv/bin/mypy app scripts` | none |
| `ruff` | `.venv/bin/ruff check app scripts tests` | none |
| `typecheck-web` | `npm run typecheck` (cwd `web/`) | none |
| `i18n-parity` | `node web/scripts/i18n-parity.mjs` | none |
| `db-up` | `./scripts/dev-db.sh up` | none |
| `db-reset` | `./scripts/dev-db.sh reset` | none — **confirm required** |
| `alembic-head` | `.venv/bin/alembic upgrade head` | none |
| `alembic-current` | `.venv/bin/alembic current` | none |
| `alembic-check` | `.venv/bin/alembic check` | none |

The vertical enum is `core · identity · structure · schedule · people · health ·
attendance · billing · events · belts · comms · reports · privacy` — every value taken from
an actual `lane-check.sh <vertical>` invocation in the milestone plan, not inferred from
milestone names. Two traps that list avoids: M6's lane is called MONEY but its vertical, its
i18n namespace and its check argument are all **`billing`**; and M1 checks as two verticals,
`identity` and `structure`, not one. The value is validated against the enum before it
reaches argv; anything else is a 400, never a command.

This table deliberately mirrors what `.claude/settings.json` already allows, with one
exception carried from that file's deny list: **`alembic downgrade` is absent and must
stay absent.**

### 6.2 Execution

- `subprocess.Popen` with an **argv list** and `shell=False`. There is no shell string, so
  there is nothing to inject into.
- `cwd` pinned to the repository root, resolved from `__file__`, not from the caller's cwd.
- **One run at a time.** A second request while a run is in flight returns 409 and is
  refused, not queued — two concurrent `alembic upgrade head` calls is not a state worth
  supporting.
- Output is streamed line-by-line over SSE and simultaneously written to
  `tools/cockpit/runs/<timestamp>-<id>.json` with the argv, exit code, duration and output,
  so gate tiles survive a cockpit restart.
- `db-reset` drops the Postgres volume, so it cannot start on one request: `POST /api/run`
  returns `409 confirm_required` with a single-use nonce instead of launching, and the run
  begins only when that nonce is posted back. The nonce dies with the process. Nothing else
  requires confirmation.

### 6.3 The security model

The cockpit is an unauthenticated local process that runs commands. Three things keep that
from being a foothold:

1. It binds `127.0.0.1` explicitly — never `0.0.0.0`.
2. A random per-process token is embedded in the served page and required as a header on
   every `/api/*` request. A page on another origin cannot read it, so it cannot forge a
   request that the cockpit will honour.
3. No CORS headers are ever sent, and requests carrying a cross-origin `Origin` are rejected
   outright.

None of this defends against someone with a shell on the machine — and it does not need to.
They already have the shell.

---

## 7. HTTP surface

| Route | Purpose |
|---|---|
| `GET /` | the page — one file, inline CSS and JS |
| `GET /api/state` | state.yaml merged with git and run-history signals; never touches the network |
| `GET /api/envs` | the environment probes; the only route that can be slow |
| `POST /api/run` | start an allowlisted command; returns a run id, or 409 if one is running |
| `GET /api/run/<id>/stream` | SSE — output lines, then exit code |
| `POST /api/state` | the task actions: set a piece's status, open or close a holdback, add one |

---

## 8. Layout

Settled on the canvas. Three columns under a full-width environment bar:

- **Top chrome** — project, branch, dirty state, HEAD, worktree count, refresh age.
- **Environment bar** — its own full-width row, not compressed into the chrome. Per
  environment: reachable dot, migration revision, deploy age. The staging superuser debt is
  stated in place rather than left in a runbook.
- **Left** — the wave rail: W0–W7, current wave expanded to its milestones.
- **Centre** — four summary tiles, then the holdback board grouped by kind, with resolved
  items collapsed beneath.
- **Right** — the command allowlist as buttons, and the streaming output pane below it.

It uses the project's own token layer (`web/packages/ui/src/tokens.css`), Rubik, and D4's
light/dark. It is English and LTR — it is yours, not the club's — so D10's physical-property
ban does not apply to it, though the mockups honour it anyway out of habit.

---

## 9. Testing

`tests/cockpit/`, pure functions only:

- `state.py` — parse a known-good file; reject a file with an unknown `kind` or `status`;
  round-trip a write and assert key order and unicode survive.
- Derivation — `done/of` from `items`, wave progress from `pieces`, with the empty and
  all-shipped edges.
- `envs.py` — parse a health response; handle a timeout, a connection error, a non-JSON
  body, and the `PENDING-production-services` placeholder, each producing a distinct state.
- `commands.py` — **the load-bearing test.** An id not in the table is refused. A vertical
  not in the enum is refused. A vertical containing a shell metacharacter, a path traversal
  or a space is refused. Assert `alembic downgrade` is unreachable through any input.

No browser test. For a single-user local tool the maintenance cost outweighs it.

**`lane-check.sh` must be amended** so these tests actually run. Its `core` case scopes to
`tests/core` and `tests/config`; without adding `tests/cockpit` the tests exist and no gate
executes them — the exact "green that verified nothing" failure that script's own header
warns about. This is a change to a shared file owned by `main`; it is legal here because
this work is sequential on `main`, and it must land before the first cockpit test.

---

## 10. Non-goals

- Launching agent sessions or creating lane worktrees.
- A free-text terminal.
- Deployment of any kind: not in the Dockerfile, not in `docker-compose.yml`, not in CI, not
  in the npm workspace, not on Railway.
- Writing to `SPEC.md`, `milestone-plan.md`, `next-session.md` or any other prose document.
  Prose stays hand-authored; only `state.yaml` is machine-written.
- Multi-user anything. One person, one machine, one process.

---

## 11. Assumptions and risks

| # | Assumption | If it is wrong |
|---|---|---|
| A1 | `state.yaml` gets updated when work lands. | The cockpit reports a stale milestone. Mitigation: the wave rail shows `updated:` age, and a state file older than the newest commit on `main` is flagged in the UI rather than trusted silently. |
| A2 | The staging health URL in `domains.json` stays current. | The bar reads "unknown", which is correct and honest. No further mitigation needed. |
| A3 | One command at a time is enough. | If parallel waves make this painful, the queue is a later change; the 409 makes the limit explicit rather than surprising. |
| A4 | English/LTR is right for this tool. | Cheap to revisit; it shares no i18n machinery with the product, so the change is local. |

The largest real risk is **A1**: a hybrid design is only as good as its authored half. The
mitigation is that the authored half is small, holds nothing measurable, and is visibly
timestamped.
