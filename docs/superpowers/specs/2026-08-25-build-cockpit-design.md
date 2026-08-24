# The build cockpit — design

**Date:** 2026-08-25
**Status:** Approved for planning. No implementation has started.
**Layout:** [Build Cockpit Directions](https://claude.ai/code/artifact/52677a4f-62b1-4c1d-b94b-027c1a6a0a75)
— four artboards. The two that ship are *Laptop — the Console* and *Phone — read-only*.

---

## 1. What this is, and what it is not

Two surfaces over one state file, answering three questions between agent sessions: where am
I, what is holding me back, what do I run next.

| | Laptop | Phone |
|---|---|---|
| Address | `http://127.0.0.1:7317` | a real HTTPS URL on Railway |
| Reach | this machine only | anywhere |
| Auth | per-process token in the page | one-time secret link → signed cookie |
| Powers | read **and** run commands | read only |
| Data | local disk, git, health probes | GitHub API, Actions, health probes |
| Needs the laptop awake | yes, it *is* the laptop | **no** |

It is **not** SPEC §6.4's manager dashboard. That one is a product surface for club managers,
is Hebrew and RTL, and is built in a later wave. This one is a developer tool and is English
and LTR. In this document *cockpit* always means the developer tool, and *dashboard* always
means `web/apps/dashboard/`.

### 1.1 The governing constraints

**The laptop surface must boot when the thing it reports on does not.** So it never imports
`app/`, is not in the npm workspace, has no build step, and its only third-party import is
PyYAML, already in `requirements-dev.txt`. A broken model, a bad migration or a missing env
var must not stop it rendering.

**The phone surface must work when the laptop is asleep.** So it is **stateless**: it holds
no database, receives nothing from the laptop, and derives everything from sources that are
up independently — the GitHub API and the three environments' own health endpoints. There is
no ingest endpoint, and therefore no ingest credential and no "stale push" state to reason
about.

Where a decision trades capability for either property, the trade is stated.

---

## 2. Decisions taken

Recorded so a later session does not silently re-litigate them.

| # | Decision | Rejected alternative, and why |
|---|---|---|
| K1 | **Build progress is primary; runtime health is a strip.** | A runtime-ops board. Production is not deployed; milestone position is the daily question. |
| K2 | **Hybrid truth: one authored state file, plus computed live signals.** | (a) Parsing `next-session.md` prose — heuristic, and silently wrong when a blockquote is reworded. (b) Declaring everything including test results — stale status is worse than none. |
| K3 | **Allowlisted commands only. No free-text shell, no agent launching.** | A terminal pane. The allowlist makes the blast radius a design decision rather than a runtime accident. |
| K4 | **Standalone tool in `tools/cockpit/`.** | (a) A fourth Vite app — needs the workspace to boot, lands in every lane's blast radius. (b) Folding into `/dev` — couples the cockpit to product runtime and tenancy, and dies when `app/` will not import. |
| K5 | **Four holdback kinds, split into declared and live.** | One flat list. Mixing authored facts with measurements lets a stale declaration masquerade as a measurement. |
| K6 | **Env status from each environment's own health endpoint.** | The Railway GraphQL API — needs a token, and reports what Railway believes rather than whether the app answers. |
| K7 | **`state.yaml`, not `state.json`.** | JSON needs zero third-party imports, but PyYAML is already a declared dev dependency, so YAML costs nothing and is far better to hand-edit. |
| K8 | **Two surfaces, not one stretched to fit.** | A single surface tunnelled to the phone (Tailscale). Full data and no deploy, but dead whenever the laptop sleeps — precisely when a phone gets reached for. |
| K9 | **The phone is read-only.** | Commands from the phone. A reachable surface that executes is a different risk class, and running `alembic upgrade head` from a train is not a real need. |
| K10 | **Phone reads GitHub; the laptop pushes nothing.** | A laptop→remote push channel carrying local gate runs and dirty-tree state. Adds an ingest credential, a second thing that goes stale, and a blank page before the first push. |
| K11 | **Agents tick `state.yaml` in the same commit as the work.** | Inferring piece completion from commit messages. The mapping from `fix(dev): X-Dev-Now` to "piece 2 of 8" is a guess, and a wrong guess is the silent inaccuracy K2 exists to prevent. |
| K12 | **No per-piece commit sha in `state.yaml`.** | Recording the work commit beside each piece. **It is circular** — a commit's own sha cannot be written inside that commit. Attribution comes from §5.2's activity list instead. |

---

## 3. Architecture

```
studio-manager/
  app/                          product API      — never imported by either surface
  web/                          product apps     — never entered by either surface
  tools/
    cockpit/
      __init__.py
      state.py                  read/write docs/plan/state.yaml   ← shared
      derive.py                 progress, grouping, staleness     ← shared
      envs.py                   concurrent health probes          ← shared
      render.py                 the shared markup vocabulary      ← shared
      local/
        server.py               http.server, routes, SSE          — laptop only
        commands.py             the allowlist, as data            — laptop only
        signals.py              git, run history, alembic head    — laptop only
        static/index.html       the Console, one file, no build
        runs/                   gitignored run records
      web/
        server.py               the read-only service             — phone only
        github.py               contents, commits, Actions        — phone only
        auth.py                 secret link → signed cookie       — phone only
        static/                 the phone page, manifest, sw.js, icons
      Dockerfile                builds the phone service only
  scripts/cockpit.sh            ./scripts/cockpit.sh → 127.0.0.1:7317
  docs/plan/state.yaml          the authored truth, committed
```

Four modules are genuinely shared — the state schema, the derivations, the env prober and the
markup vocabulary. Everything that differs between the surfaces lives under `local/` or
`web/`, so neither can accidentally acquire the other's powers: `commands.py` is not importable
from the phone service's package, and the phone's `Dockerfile` copies only what `web/` needs.

Both use `http.server.ThreadingHTTPServer`. Threading is required on the laptop because an SSE
stream holds a connection open for the length of a run.

The laptop port is `7317`, overridable with `COCKPIT_PORT`. `cockpit.sh` runs
`.venv/bin/python -m tools.cockpit.local.server` — the `.venv/bin/` prefix per CLAUDE.md
§Commands, because a bare `python3` resolves to an old 3.8 interpreter earlier on PATH.

---

## 4. `docs/plan/state.yaml` — the authored truth

Lives beside `milestone-plan.md` because it is plan data: versioned, and reviewed in a diff
like any other plan change. Committing it is what publishes it to the phone.

### 4.1 Schema

The `#` annotations below are for *this document*. The file itself carries none — see rule 2
in §4.2.

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
    opened: 2026-08-24            # bounds the activity list in §5.2
    pieces:
      - id: M0.1
        title: Corrections, skeleton, install layer
        status: shipped           # pending | active | shipped
        on: 2026-08-24
      - id: M0.4
        title: The demo studio and the dev bar
        status: active
        opened: 2026-08-25
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

1. **Nothing measurable may be declared here.** No test results, no environment health, no git
   state, no "gates green". If either surface can compute it, this file is forbidden from
   claiming it. This is what stops the file rotting into a lie.
2. **No free-floating YAML comments.** PyYAML does not preserve comments across a round-trip,
   and the laptop surface writes this file. Every explanation goes in a field — that is what
   `why:` and `source:` are for. The writer emits a generated header saying so.
3. Progress is **derived**, never stored: a piece's `done/of` comes from counting `items`; a
   wave's from counting `pieces`. No counter to forget to increment.
4. **No commit shas.** See K12 — they cannot be written correctly. Attribution is §5.2's job.
5. The writer uses `sort_keys=False`, `allow_unicode=True`, `default_flow_style=False`, so a
   machine write produces a reviewable diff rather than a reordered file.

### 4.3 The workflow rule

**An agent that finishes a piece ticks it in `state.yaml` in the same commit as the work.**

This goes in CLAUDE.md §Workflow and in the lane opening prompts in `lanes.md`. It is the only
discipline the design asks for, and it is what makes the phone accurate to the last commit
rather than to the last time someone remembered.

Not enforced by a hook. A hook that fails commits touching `app/` without touching
`state.yaml` was considered and rejected for now: it fires on refactors, reverts and
docs-adjacent work, and a gate that cries wolf gets disabled. §5.3's staleness banner is the
softer mitigation; if it proves insufficient, the hook is the escalation.

### 4.4 Seeding

The initial file is transcribed by hand from `milestone-plan.md` Part 2 and Part 3, SPEC §15's
prerequisites, Part 5's C1–C9, and the Railway runbook's open item. That transcription is a
task in the implementation plan, not a runtime feature — neither surface ever parses the prose
documents.

---

## 5. Live signals — computed, never authored

### 5.1 By surface

| Signal | Laptop source | Phone source |
|---|---|---|
| waves · milestones · holdbacks | `docs/plan/state.yaml` on disk | the same file via GitHub contents API at `main` |
| branch · dirty · HEAD · worktrees | `git` | **not available** — and not faked |
| last gate run | `tools/cockpit/local/runs/*.json` | **not available** — CI stands in for it |
| CI green/red, failing job | — | GitHub Actions API, latest run on `main` |
| activity — what the agent did | `git log` | GitHub commits API |
| env reachable · revision · uptime | health probe | the same health probe |
| local alembic head | `alembic heads` | **not available** |

Where a signal is unavailable, the surface omits the tile. It never renders an empty or grey
version of something it cannot know — an absent tile reads as "not here"; a grey one reads as
"broken".

### 5.2 The activity list — "what the agent did"

The commits on `main` since the **active piece's** `opened:` date — falling back to the wave's
when the piece carries none — newest first, with short sha, subject and relative time. One API
call (`GET /repos/{owner}/{repo}/commits?sha=main&since=<opened>`), no interpretation, no mapping
to pieces.

This is deliberately dumber than tying commits to pieces, and that is the point: the commit
subject is written by the agent as a side effect of working, so it is accurate for free. Done
and Left come from `state.yaml`; Activity is the independent record you can check them against.
When the two disagree, the disagreement is the useful signal.

### 5.3 Staleness

Both surfaces compare `state.yaml`'s `updated:` against the newest commit on `main`. If the
newest commit is more recent, a banner says so — *"state last updated 3 commits ago"* — and the
progress numbers are shown with that caveat rather than presented as current. A hybrid design
is only as good as its authored half; this is the design admitting when its authored half has
fallen behind.

### 5.4 The environment probe

Targets come from `infra/railway/domains.json`, which the runbook already establishes as the
only place a hostname is written. The phone service reads it from GitHub alongside
`state.yaml`, so a hostname change needs no redeploy.

Probes run **concurrently**, each with a 2-second hard cap, **off the page-load path**: the page
paints from local/GitHub sources and the env bar fills in from a separate request. A hung
Railway can slow the bar and nothing else. Results are cached in memory with a last-seen
timestamp, so a failed probe degrades to "unknown · last seen 09:04" rather than blanking a bar
that was populated a minute ago.

Two targets have honest special cases:

- **production** currently reads `https://PENDING-production-services`. A target that does not
  parse as a real host renders as **not deployed**, never as an error.
- **dev** is `http://localhost:8000`. The laptop can reach it; the phone cannot, and says
  *"local — not reachable"* rather than showing a false red dot.

### 5.5 The product-code change this requires

`HealthResponse` in `app/routers/health.py` returns `{status, env}`. The env bar needs two more
fields:

- `revision` — the alembic revision the running **database** is at.
- `started_at` — process start, UTC, rendered as an age.

This is the **only** product code the cockpit work touches, and it is a deliberate, acknowledged
exception to §1.1. It stands on its own merits — a health endpoint reporting its schema revision
is how you catch an environment running last week's migrations — but it is a change to shipped
code and must be tested as such. Two constraints: the endpoint stays unauthenticated and
tenant-free, per its existing docstring; and `revision` is read from the database, not the local
filesystem, or it reports what the image contains rather than what the database is at.

---

## 6. The command runner — laptop only

### 6.1 The allowlist, as data

`local/commands.py` holds a table. The page can only ask for an entry by id.

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

The vertical enum is `core · identity · structure · schedule · people · health · attendance ·
billing · events · belts · comms · reports · privacy` — every value taken from an actual
`lane-check.sh <vertical>` invocation in the milestone plan, not inferred from milestone names.
Two traps that list avoids: M6's lane is called MONEY but its vertical, its i18n namespace and
its check argument are all **`billing`**; and M1 checks as two verticals, `identity` and
`structure`, not one. The value is validated against the enum before it reaches argv; anything
else is a 400, never a command.

This table deliberately mirrors what `.claude/settings.json` already allows, with one exception
carried from that file's deny list: **`alembic downgrade` is absent and must stay absent.**

### 6.2 Execution

- `subprocess.Popen` with an **argv list** and `shell=False`. There is no shell string, so there
  is nothing to inject into.
- `cwd` pinned to the repository root, resolved from `__file__`, never from the caller's cwd.
- **One run at a time.** A second request while a run is in flight returns 409 and is refused,
  not queued — two concurrent `alembic upgrade head` calls is not a state worth supporting.
- Output streams line-by-line over SSE and is simultaneously written to
  `tools/cockpit/local/runs/<timestamp>-<id>.json` with argv, exit code, duration and output, so
  gate tiles survive a restart.
- `db-reset` drops the Postgres volume, so it cannot start on one request: `POST /api/run`
  returns `409 confirm_required` with a single-use nonce instead of launching, and the run begins
  only when that nonce is posted back. The nonce dies with the process.

---

## 7. Security

Two surfaces, two models. They share no code path, which is the point.

### 7.1 Laptop

The laptop surface is unauthenticated in the identity sense and runs commands. Three things keep
that from being a foothold:

1. It binds `127.0.0.1` explicitly — never `0.0.0.0`.
2. A random per-process token is embedded in the served page and required as a header on every
   `/api/*` request. A page on another origin cannot read it, so it cannot forge a request the
   cockpit will honour.
3. No CORS headers are ever sent, and requests carrying a cross-origin `Origin` are rejected.

None of this defends against someone with a shell on the machine — and it does not need to. They
already have the shell.

### 7.2 Phone

- `COCKPIT_KEY` — 64 random characters, a Railway secret, never in the repo.
- `GET /auth?k=<key>` compares in constant time. On a match it sets
  `Set-Cookie: ck=<hmac(COCKPIT_KEY, "v1")>; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000;
  Path=/` and 302s to `/`, which strips the key from the address bar and from history.
- Every other route requires that cookie. Without it the response is **404**, not 401 — an
  unauthenticated visitor learns nothing about what is hosted here.
- Because the cookie is derived from `COCKPIT_KEY`, **rotating that one variable invalidates
  every issued cookie.** That is the whole revocation story.
- The `/auth` response is a bare 302 with **no body**, so no subresource request is ever issued
  from a URL containing the key — there is no `Referer` header anywhere that could carry it. The
  page itself loads exactly one external resource, the Google Fonts stylesheet, and only ever
  from `/`, after the key is gone.

**The honest limit:** this is a capability secret, not an identity check. Whoever holds the key
gets in. It is right-sized for a single-user private dashboard, and when SPEC §15 item 5's stable
domain lands, putting Cloudflare Access in front of it is the natural upgrade — at which point
this layer can stay as defence in depth or be removed.

### 7.3 The GitHub token

`GITHUB_TOKEN` is a fine-grained PAT, a Railway secret, scoped to **this repository only**, with
**read** access to Contents and Actions and nothing else. It cannot write, cannot reach other
repositories, and cannot administer anything.

This is new risk that did not exist in the local-only design and is accepted knowingly: a
credential that can read this source now lives in an internet-facing service gated by a shared
secret. The mitigations are the narrow scope, the read-only grant, and that rotating it is a
one-variable change. Responses are cached in memory for 60 seconds, which also keeps usage
far inside GitHub's 5,000/hour authenticated limit.

---

## 8. HTTP surfaces

**Laptop** — `http://127.0.0.1:7317`

| Route | Purpose |
|---|---|
| `GET /` | the Console — one file, inline CSS and JS |
| `GET /api/state` | state.yaml merged with git and run-history signals; never touches the network |
| `GET /api/envs` | the environment probes; the only route that can be slow |
| `POST /api/run` | start an allowlisted command; returns a run id, 409 if one is running |
| `GET /api/run/<id>/stream` | SSE — output lines, then exit code |
| `POST /api/state` | the task actions: set a piece's status, open or close a holdback, add one |

**Phone** — HTTPS on Railway

| Route | Purpose |
|---|---|
| `GET /auth?k=` | the one-time exchange; sets the cookie, redirects to `/` |
| `GET /` | the phone page |
| `GET /api/state` | state.yaml + activity + CI, from GitHub, 60s cache |
| `GET /api/envs` | the environment probes |
| `GET /manifest.webmanifest`, `GET /sw.js`, `GET /icons/*` | the install layer |

There is **no** write route and **no** ingest route on the phone surface. That absence is the
security property; it is not an omission to be filled in later without revisiting §7.

---

## 9. Layouts

Both settled on the canvas, both using the project's own token layer
(`web/packages/ui/src/tokens.css`), Rubik, and D4's light/dark. Both are English and LTR — this
is yours, not the club's.

**Laptop — the Console.** Top chrome (project, branch, dirty state, HEAD, worktree count,
refresh age); a full-width environment bar of its own; then three columns — wave rail left,
summary tiles and holdback board centre, command buttons and streaming output right.

**Phone — read-only.** Single column: current milestone with progress, Done, Left, Activity,
Environments, CI, Holdbacks, and a footer stating that commands live on the laptop. Every
tappable row is at least 44px. Installable to the home screen via a manifest and a service
worker — a separate origin and scope from the three product apps, so no conflict with §6.5.

---

## 10. Testing

`tests/cockpit/`, pure functions only.

**Shared**
- `state.py` — parse a known-good file; reject an unknown `kind` or `status`; round-trip a write
  and assert key order and unicode survive.
- `derive.py` — `done/of` from `items`, wave progress from `pieces`, with the empty and
  all-shipped edges; the staleness comparison in §5.3.
- `envs.py` — parse a health response; handle a timeout, a connection error, a non-JSON body, the
  `PENDING-production-services` placeholder, and the unreachable-localhost case, each producing a
  distinct state.

**Laptop**
- `commands.py` — **the load-bearing test.** An id not in the table is refused. A vertical not in
  the enum is refused. A vertical containing a shell metacharacter, a path traversal or a space is
  refused. Assert `alembic downgrade` is unreachable through any input.

**Phone**
- `auth.py` — a request without the cookie gets 404, not 401; a wrong key is rejected; comparison
  is constant-time; changing `COCKPIT_KEY` invalidates a previously valid cookie.
- `github.py` — decode a contents response; handle 404, 403 rate-limit and a network error, each
  distinctly; the activity window respects `opened:`.
- **An import test asserting the phone service package cannot reach `commands.py`.** This is what
  keeps K9 true as the code grows, rather than true only on the day it was written.

No browser test on either surface. For a single-user tool the maintenance cost outweighs it.

**`lane-check.sh` must be amended** so these tests run at all. Its `core` case scopes to
`tests/core` and `tests/config`; without adding `tests/cockpit`, the tests exist and no gate
executes them — the exact "green that verified nothing" failure that script's own header warns
about. This is a change to a shared file owned by `main`; it is legal here because this work is
sequential on `main`, and it must land before the first cockpit test.

---

## 11. Deployment — phone surface only

A **new Railway service** in the existing project, built from `tools/cockpit/Dockerfile`, which
copies only `tools/cockpit/{__init__,state,derive,envs,render}.py` and `tools/cockpit/web/`. It
does not copy `local/`, so the command runner is not merely unreachable in production — it is not
in the image.

| Variable | Purpose |
|---|---|
| `COCKPIT_KEY` | the shared secret; rotating it revokes every session |
| `GITHUB_TOKEN` | fine-grained PAT, this repo, read Contents + Actions |
| `GITHUB_REPO` | `owner/name` |
| `PORT` | supplied by Railway |

It is **not** added to `docker-compose.yml`, not added to `ci-local.sh`, and not part of the
product's CI gates beyond `tests/cockpit` running under `lane-check.sh core`. It carries no
database, no migrations and no Alembic wiring, so it cannot participate in the two-role schema
model and does not need to.

Recorded in the Railway runbook alongside the existing services.

---

## 12. Non-goals

- Launching agent sessions or creating lane worktrees.
- A free-text terminal on either surface.
- **Any write or execute capability on the phone surface.** No ingest endpoint, no state editing,
  no command buttons.
- Deploying the **laptop** surface. It stays on `127.0.0.1`, out of the Dockerfile, out of
  `docker-compose.yml`, out of the npm workspace.
- Writing to `SPEC.md`, `milestone-plan.md`, `next-session.md` or any other prose document. Prose
  stays hand-authored; only `state.yaml` is machine-written.
- Multi-user anything. One person, one key.

---

## 13. Assumptions and risks

| # | Assumption | If it is wrong |
|---|---|---|
| A1 | Agents tick `state.yaml` in the same commit as the work (§4.3). | The phone under-reports progress. Mitigations: §5.3's staleness banner, and §5.2's activity list, which is authored by the agent for free and can be read against the checklist. If it still drifts, the rejected commit hook in §4.3 is the escalation. |
| A2 | Commit cadence is granular enough that "as of the last commit" is fresh enough. | The phone lags mid-session. The repository's own history supports the assumption — M0.4 produced six commits — but a long uncommitted stretch is genuinely invisible, and that is the accepted cost of K10. |
| A3 | The health URLs in `domains.json` stay current. | The bar reads "unknown", which is correct and honest. No further mitigation needed. |
| A4 | A capability secret is adequate auth for a single-user dashboard. | Whoever holds the key gets in. Rotation is one variable; Cloudflare Access is the upgrade path once the domain lands. |
| A5 | One command at a time is enough on the laptop. | If parallel waves make this painful, a queue is a later change; the 409 makes the limit explicit rather than surprising. |

The largest real risk is **A1**, and it is the same one the original local-only design carried —
a hybrid design is only as good as its authored half. What changed is that the authored half is
now visible from a phone, where a wrong number is more likely to be believed and less likely to
be checked. §5.2 and §5.3 exist specifically to make disagreement visible rather than silent.
