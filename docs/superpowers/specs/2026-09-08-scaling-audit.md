# Scaling audit — where this system breaks, and in what order to fix it

> Audit run 2026-09-08. **Verification only** — nothing in this document is implemented,
> and no application code was changed while producing it.
>
> Every number below was measured against the running development database, not
> estimated. The measurements are reproducible: each finding names the command or the
> query that produced it. Where a figure is arithmetic rather than measurement, it says so.

## 1. What this is

A scan of the API, the workers and the three PWAs for behaviour that is correct at one
studio with fifty students and wrong at a hundred studios with three hundred each.

The development database turned out to be an unusually good fixture for this: it holds
**42,959 active non-demo studios**, 83,059 sessions and 79,455 people, accumulated from
test runs that never clean up. That made several projections into measurements.

**No vertical.** This document is an audit, not a feature. Its findings belong to the
verticals they name.

## 2. The scaling model

Two axes grow independently, and almost every finding sits on exactly one of them.

| Axis | What it drives |
|---|---|
| **M — students in one studio** | The request-path failures. Query multipliers, page-size truncation, the infinite loop. |
| **N — studios in the system** | The worker failures. Blast radius, cross-tenant scans. |
| **U — people using the app** | Unbounded table growth, independent of both. |

The single most important consequence: **the first thing to break is driven by M, not N.**
A product with one club of 250 students hits finding F1 before a product with fifty clubs
of 40 students hits anything at all.

### 2.1 Thresholds, stated once

| Threshold | Finding | Consequence |
|---|---|---|
| **201 open charges in one studio** | F1 | Dashboard enters an unbounded request loop |
| **201 open charges in one studio** | F4 | Debt badge silently under-counts |
| **201 students in one studio** | F5 | 601 database queries per roster page |
| **~500 students in one studio** | F6 | 500 HTTP requests from a single screen |
| **Studio number 2** | F2 | One studio's bad row silently skips the rest |
| **>15 concurrent requests, system-wide** | F3 | 30-second wait, then HTTP 500 |
| **~5,000 queued notifications** | F7 | Overlapping cron runs double-send |

A club billing 200 students monthly crosses the first two of these in its first month.

## 3. Findings, in fix order

Ordered by `(damage × imminence) ÷ cost`. The ordering is the deliverable; the findings
themselves are secondary to it.

---

### P1 — Land these first. They are nearly free.

---

#### F1 · The dashboard hangs in an infinite loop above 200 open charges

**Severity:** critical · **Trigger:** 201 open charges in any one studio · **Cost:** one word

`web/apps/dashboard/src/features/people/StudentsScreen.tsx:89` pages through open charges
with `params.set('cursor', cursor)`. `app/routers/billing.py:616` declares that parameter
as `after`. FastAPI silently discards undeclared query parameters, so the page marker never
reaches the server, `next_cursor` comes back unchanged, and the `do…while` loop re-requests
page one forever.

**Evidence.** Reproduced against a minimal FastAPI app with the same signature:

```
client sends ?cursor=… : {'after_seen': 'None',  'limit': 200}
client sends ?after=…  : {'after_seen': '91b0…', 'limit': 50}
```

**Root cause is a missing convention, not a typo.** The API is split: **20 list endpoints
name the parameter `after`** (`students`, `billing`, `comms`, `events`, `payments`,
`belts`, `trial_bookings`) and **9 name it `cursor`** (`sessions`, `schedule`, `structure`,
`attendance`, `coach_constraints`). Nothing enforces which, so this will recur.

**Required change.**
1. `StudentsScreen.tsx:89` — send `after`.
2. A contract test that reads the OpenAPI document and asserts every paginated endpoint
   names its cursor parameter identically. Renaming the nine is the cleaner fix if the
   clients can be updated in the same wave; the test is what makes either choice hold.

**Acceptance.** A studio seeded with 250 open charges renders the students screen with a
finite number of requests, and the debt map covers all 250.

---

#### F2 · One studio's bad data silently skips every studio after it

**Severity:** critical · **Trigger:** studio number 2 · **Cost:** ~3 lines × 6 files

Every worker shares one shape: select the active studios, then loop, opening a
`TenantSession` per studio. **Not one wraps the loop body in `try`/`except`.**

| Worker | Loop |
|---|---|
| `app/workers/billing.py` | `:317` |
| `app/workers/at_risk.py` | `:306` |
| `app/workers/followups.py` | `:371` |
| `app/workers/health_reminders.py` | `:243` |
| `app/workers/notify.py` | `:267` |
| `app/workers/plan_changes.py` | `:76` |

`app/core/jobs.py::record_run` re-raises, so the process exits non-zero and the remaining
studios are never processed. There is no retry before the next cron firing — 24 hours for
the five daily jobs.

**Why this is worse than it looks.** The damage scales with customer count while the signal
does not. At 100 studios, a failure at studio 37 leaves 63 clubs unbilled, unchased and
unnotified, and the operator sees exactly one red row that says `billing-run failed`.
Nothing anywhere states how many tenants were skipped.

**Required change.** Wrap each per-studio block; on failure, roll back that studio's
session, count it, and continue. The run's `detail` dict gains a `studios_failed` count so
the heartbeat carries the number — a partial run must not report as a clean one.

**Acceptance.** A test that makes studio 2 of 3 raise, and asserts studios 1 and 3 are
still processed and that the recorded detail names one failure.

---

#### F3 · The whole API can do 15 database-touching requests at once

**Severity:** high · **Trigger:** concurrency, not data volume · **Cost:** two config lines

`app/core/db.py:22` builds the engine with no pool arguments, so SQLAlchemy's defaults
apply. `Dockerfile:42` runs bare `uvicorn` — one process, one event loop.

**Measured:**

```
pool class    : QueuePool
pool_size     : 5      max_overflow : 10
hard ceiling  : 15 concurrent connections per process
pool_timeout  : 30 s  → TimeoutError → HTTP 500
pool_recycle  : -1 (never)
```

**290 of the ~295 route handlers are sync `def`**, so FastAPI runs them in Starlette's
40-thread pool. Forty threads contend for fifteen connections; request sixteen waits up to
thirty seconds and then fails.

This is the ceiling F5 and F6 collide with, and raising it is pure configuration.

**Required change.** Explicit `pool_size`, `max_overflow`, `pool_recycle` and
`pool_timeout` on the engine, sized against the database plan's own connection limit and
the worker count; `--workers` on the uvicorn command. `pool_recycle` matters independently
of the ceiling — Railway's network drops idle connections and today only `pool_pre_ping`
catches that, one failed round trip at a time.

**Acceptance.** The values are read from settings, and a test asserts
`pool_size × workers` stays under the configured database connection limit.

---

### P2 — Before onboarding a club over ~150 students.

---

#### F4 · Screens silently show wrong numbers above 200 rows

**Severity:** high · **Trigger:** 201 rows in any capped list · **Cost:** medium

**22 client call sites hardcode `limit=200` or `limit=100`. Three follow `next_cursor`.**
The API's cursor pagination is correctly built; the clients treat `MAX_PAGE_SIZE` as "all".

This is the only finding that produces *quietly incorrect data* rather than slowness or a
crash, which is why it leads P2:

| Screen | Call | What goes wrong |
|---|---|---|
| Sidebar debt badge | `App.tsx:316` | Counts distinct payers across the first 200 open charges only |
| Sidebar documents badge | `/health-declarations/summary` (default 200, max 500) | Under-counts unsigned declarations |
| Billing section | `BillingSection.tsx:119` | Open-charge list truncates |
| Billing alerts | `BillingAlertSection.tsx:40-42` | Mismatched and pending orders truncate |
| Students screen | `BillingSection.tsx:126` | Name lookup map misses students past 200 |

In a product whose stated goal is "a manager knows exactly who owes money", a debt figure
that is confidently wrong is worse than one that fails to load.

**Required change.** Either the client pages to exhaustion, or — better for the two badges —
the API answers the question directly. A badge that needs a count should call an endpoint
that returns a count, not 200 rows the client reduces.

**Acceptance.** Seeded above the cap, each badge reports the true total.

---

#### F5 · The students list costs 3N + 1 queries

**Severity:** high · **Trigger:** grows with M, no threshold · **Cost:** medium

`app/services/people/students.py:388` — `_project()` runs per row and issues three further
queries each (groups, guardians, an attendance aggregate), four when the student is frozen.

**Measured** against the largest studio in the development database:

```
limit=10  rows=10  statements=31   → 3.1 queries/row
limit=31  rows=31  statements=94   → 3.0 queries/row   (60.5 ms, loopback)

  31x  SELECT "group".name …
  31x  SELECT person.first_name, person.last_name …
  31x  SELECT attendance.status, count(*) …
   1x  SELECT student … LIMIT 32
```

Default page (50) is **151 queries**. The page size the dashboard actually sends is 200,
which is **601 queries** — issued sequentially, so network latency multiplies by 601.

The attendance aggregate additionally has **no time bound**: it counts a student's entire
history every time the roster renders, so the same fifty students get slower every year.

**Required change.** Batch the three lookups over the page's student ids, the way
`app/services/attendance/roster.py` already does — that module is the reference
implementation and it lives in the same codebase. Bound the attendance aggregate to a
window, or precompute it.

**Acceptance.** A page of 50 students emits a bounded number of statements — target ≤ 6 —
asserted by a statement-counting test, not by timing.

---

#### F6 · The rollover screen fires one HTTP request per student

**Severity:** high · **Trigger:** ~500 students · **Cost:** needs a new endpoint

`web/apps/dashboard/src/features/rollover/client.ts:307` pages the entire active roster,
then issues `GET /enrollments?student_id=…` for each student inside a `Promise.all`.

The code documents the trade deliberately, and its stated bound is wrong: the comment says
the roster is "bounded by `MAX_BULK_ROWS` (500)", but the `do…while (after)` loop above it
runs until the cursor is exhausted, so the bound is the number of active students.

At 500 students that is 500 requests against a fifteen-connection API. One manager opening
one screen can starve every other tenant.

**Required change.** The endpoint the comment says does not exist: a studio-scoped
enrollment list. Then one request replaces N.

**Acceptance.** The rollover screen's request count is independent of roster size.

---

### P3 — Before roughly six months of real usage.

---

#### F7 · The push drain re-sends on crash, and double-sends under load

**Severity:** high · **Trigger:** any crash today; ~5,000 queued at scale · **Cost:** small

`app/workers/notify.py:155-184` selects **every** `queued` push delivery — no `LIMIT`, no
`SELECT … FOR UPDATE SKIP LOCKED` — sends them one at a time synchronously to the provider,
and commits **only after the entire loop**.

Two distinct failures:

- **Today, at any size.** A crash at message 150 of 200 rolls back all 150 status updates.
  Every one is sent again on the next run. This needs no scale at all, only a crash.
- **At scale.** The cron is `*/15`. Once a drain exceeds fifteen minutes — roughly 5,000
  deliveries at typical provider latency — Railway starts an overlapping run against the
  same unlocked rows, and a parent's phone buzzes twice.

There is also an N+1: `PushToken` is queried per delivery rather than batched.

**Required change.** `LIMIT` the batch, claim rows with `FOR UPDATE SKIP LOCKED`, commit
per batch, and batch the token lookup.

**Acceptance.** Two drains running concurrently against the same queue deliver each message
exactly once.

---

#### F8 · Two auth tables grow forever with no reaper

**Severity:** medium · **Trigger:** time and usage, not data shape · **Cost:** small worker

`app/services/identity/refresh.py:211` rotates a refresh token by inserting a **new row**
and revoking the old one — which is correct, since the revoked row is how token theft is
detected. What is missing is anything that ever deletes them. No worker touches these
tables and `infra/railway/jobs.json` declares no retention job. §11.5's planned retention
work covers personal data, not these.

**The rule: one row per user per fifteen minutes of app use, kept permanently.**

| Table | Development database today |
|---|---|
| `refresh_token` | 63,194 rows · **27 MB** |
| `oauth_transaction` | 32,223 rows · **13 MB** — single-use, expires in minutes, kept forever |

Arithmetic, at 100 studios averaging 200 students (~21,000 accounts, ~6,000 daily active,
~4 rotations each): **~24,000 rows/day**, **~9 million rows/year**, on a table read at
every token refresh.

**Required change.** A pruning job: delete revoked or expired refresh tokens past the
family's retention need, and consumed or expired OAuth transactions. Declared in
`jobs.json` with its own `max_silence_minutes` like every other job.

**Acceptance.** The job exists, is declared, writes a heartbeat, and a test asserts it
deletes expired rows and preserves live ones.

---

### P4 — Before the data itself gets big.

---

#### F9 · The hourly session-completion job sequentially scans every session

**Severity:** medium · **Cost:** one index

`app/workers/schedule.py:59` runs `ends_at <= at AND status = 'scheduled'` across all
tenants, hourly, and loads each match as a full ORM object.

**`infra/railway/jobs.json` justifies the hourly cadence by stating the query runs "against
a composite index". There is no such index.** `session` carries `(studio_id, id)`,
`(studio_id, starts_at)`, `(group_id, starts_at)` and the primary key — nothing on `status`
or `ends_at`.

**Measured:**

```
Seq Scan on session  (actual time=0.070..34.441 rows=2904 loops=1)
  Filter: ((status = 'scheduled') AND (ends_at <= now()))
  Rows Removed by Filter: 80155
  Buffers: shared hit=1876
```

34 ms at 83,059 rows. A studio holds roughly 1,000 sessions a year, so 500 studios over
three years is about 1.5 million rows scanned every hour.

**Required change.** An index on `(status, ends_at)`, and **correct the `why:` text in
`jobs.json`** — a justification that describes a mechanism the schema does not have is
worse than none, because the next reader will trust it.

**Acceptance.** `EXPLAIN` shows an index scan, and a test asserts the index exists.

---

#### F10 · Name search cannot use an index

**Severity:** low · **Cost:** one extension plus one index

`app/services/people/students.py:352` matches names with `ILIKE '%q%'` against
`person.first_name` and `person.last_name`, plus the same over guardians. A leading
wildcard cannot use a btree, and there is no trigram index.

Measured: 5.3 ms for a 31-student studio — a nested loop probing every person in the club.
Linear in M, on every keystroke.

**Required change.** `pg_trgm` and a GIN index, or a generated normalised search column.

---

#### F11 · The attendance percentage has no time bound

**Severity:** low · **Cost:** folded into F5

Covered under F5. Recorded separately because it survives F5's batching fix if that fix
only removes the per-row round trip and keeps the unbounded aggregate.

---

#### F12 · `audit_log` has no retention or partitioning

**Severity:** low · **Cost:** planned for M9

Append-only by design and written on effectively every mutation; 26,997 rows and 11 MB in
development already. §11.5 plans the retention work. The note here is only that it should
land before the table is large enough that the first pass is itself an operation.

## 4. What holds up

Recorded because it is most of the system, and because a findings list read alone
misrepresents the codebase.

- **Tenancy fails closed** and is enforced at three layers. No query silently degrades to
  unscoped.
- **No encrypted column appears in a `WHERE` or `ORDER BY`** — checked across all seven.
  There are no accidental full-table decrypts.
- **Onboarding links are resolved by `token_hash`**, not by decrypting rows.
- **Indexing matches the query shapes** on `charge`, `notification_delivery`,
  `announcement`, `enrollment` and `person`.
- **`GET /sync/bootstrap` is clamped to two days**, so the largest coach-reachable payload
  is bounded by design.
- **`app/services/attendance/roster.py` batches correctly** — it is the pattern F5 needs.
- **The uPay IPN persists bytes before interpreting them** and leans on a unique constraint
  for duplicate delivery.
- **The in-process rate limiter** (`app/services/people/rate_limit.py`) is a genuine
  multi-replica limitation, and the module already states it precisely and names Redis as
  the fix. It is not a finding; it is a documented holdback.

## 5. Method

Read-only throughout. Static analysis over the AST for queries inside loops; `EXPLAIN
(ANALYZE, BUFFERS)` for query plans; a SQLAlchemy `before_cursor_execute` listener for
statement counts; `pg_indexes` and `pg_class` for schema and size. No application code was
modified and nothing was written to the database — every measurement is a `SELECT` or an
`EXPLAIN`.

### 5.1 The fixture

| Table | Rows | Size |
|---|---:|---:|
| `session` | 83,059 | 33 MB |
| `person` | 79,455 | 29 MB |
| `refresh_token` | 63,194 | 27 MB |
| `auth_identity` | 33,195 | 14 MB |
| `oauth_transaction` | 32,223 | 13 MB |
| `student` | 29,748 | 10 MB |
| `audit_log` | 26,997 | 11 MB |
| `charge` | 10,967 | — |
| `attendance` | 2,376 | — |

**Active non-demo studios: 42,959.** Largest studio: 31 students.

### 5.2 Worker loop cost

Measured at **4.58 ms per studio** (300-studio sample; four queries plus session
open/close, loopback). `_active_studios()` returned 42,959 rows in 186 ms.

**This is not a bottleneck and was not treated as one.** At 1,000 studios the loop skeleton
costs 4.6 seconds. The worker finding is F2 — error isolation — not runtime.
