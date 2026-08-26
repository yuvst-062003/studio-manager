# W3 Lane ATTENDANCE (M5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build §5.7's attendance vertical end to end — the coach's roster and bulk mark,
the parent's pre-report, and §10's offline queue, sync and cross-actor conflict handling.

**Architecture:** Backend is a `TenantSession`-scoped `AttendanceService` behind two thin
routers (`attendance.py`, `sync.py`). Every write is idempotent on a client-generated
`client_mark_id` and resolves conflicts on `device_marked_at`, except a parent pre-report,
which a bulk action never overwrites. Frontend is a new `@studio/core` sub-package,
`src/offline/`, holding a **four-state** network machine, a `pending_ops` queue that is
never dropped and never evicted, a two-day cache with oldest-first eviction, and a flusher
that turns rejections into conflict cards. The staff roster is the `roster-row` **container**
— it renders `useSlot('roster-row')` and knows none of its sections by name.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Pydantic v2 (Python 3.14) · React 19 + TypeScript
+ Vitest · no new npm dependency (see Global Constraints).

**Spec:** `SPEC.md` §5.7, §5.13, §5.14, §6.1, §6.5, §10.1–§10.6; lane brief in
`docs/plan/prompts/w3-lanes.md` § `lane/attendance` — M5 and `docs/plan/milestone-plan.md`
§ W3 · Lane ATTENDANCE — M5. Artboard specs: `docs/design/specs/{1c,9f,9g,2d,2a,12a,4c,1e}-*.md`.

## Global Constraints

- **Never run `alembic revision`.** `main` owns `alembic/versions/**`. Missing schema is a
  stop-and-tell, not a workaround.
- **Never edit** `app/main.py`, `app/models/__init__.py`, `web/packages/i18n/index.ts`.
  The first two mount by discovery; the third is authored once.
- **Never open** `web/apps/staff/src/features/health/**` or any other M4 file.
- **No new npm dependency.** `dexie` and `fake-indexeddb` are absent from `web/package.json`
  and adding either edits the workspace root and the lockfile — shared files the health lane
  also holds. `src/offline/` therefore defines its own `OfflineStore` port with a
  hand-written IndexedDB adapter and an in-memory adapter for tests.
- All money in agorot (integers). `RosterEntry` carries none and must never learn to
  (SPEC §13 invariant 3 — the roster is the most coach-reachable payload in the product).
- All timestamps stored UTC, rendered Asia/Jerusalem. `app.core.clock.now()` is the **only**
  clock in `app/`; a restriction test fails the build on any other `datetime.now()`.
- Hebrew strings only in `web/packages/i18n/he/attendance.ts`; the file already exists and
  is complete. Never inline a string in a component.
- Every model inherits `TenantMixin`; every service is written against `TenantSession`,
  which fails closed.
- `unmarked` is a real, storable state (§5.14). Never collapse it into `absent`.
- **Nothing on the mat is blocked by a missing health declaration** (§5.5). The roster shows
  ⚠ and the coach can still mark the student present. There is no
  `block_attendance_without_health` setting and none may be added.
- Commit to `lane/attendance` only. Never push, never merge, never touch `main`.
- Tick M5's pieces in `docs/plan/state.yaml` in the same commit as the work; nothing
  measurable goes in that file.
- Gate: `./scripts/lane-check.sh attendance` green is a **precondition** for reporting done.

## File Structure

### Backend

| File | Responsibility |
|---|---|
| `app/services/attendance/__init__.py` | Public surface: `AttendanceService`, `NotFoundError`, `ConflictKind`, `MarkOutcome` |
| `app/services/attendance/errors.py` | `NotFoundError`, `ForbiddenError`, `PreconditionError` |
| `app/services/attendance/resolve.py` | **Pure** conflict resolution: `resolve_mark()` — §10.5's four rows, no session, no I/O |
| `app/services/attendance/roster.py` | Roster assembly: who is *expected* (C12) vs merely enrolled, current mark, absence report, the two seam fields |
| `app/services/attendance/service.py` | `AttendanceService` — the DB-facing methods routers call |
| `app/services/attendance/bootstrap.py` | §6.1's one-round-trip offline payload, bounded to a two-day window |
| `app/routers/attendance.py` | `GET /sessions/{id}/attendance`, `POST /attendance/batch`, `POST /sessions/{id}/attendance/bulk-present`, `POST /absence-reports`, `GET /students/{id}/attendance` |
| `app/routers/sync.py` | `GET /sync/bootstrap?from&to` |
| `tests/attendance/test_resolve.py` | §10.5's rows, unit, one test per row |
| `tests/attendance/test_roster.py` | expected-vs-enrolled, the seam fields, no money |
| `tests/attendance/test_marking.py` | batch idempotency, `unmarked` survives, cancelled-session conflict |
| `tests/attendance/test_bulk_present.py` | §5.7's bulk rule and the pre-report protection |
| `tests/attendance/test_absence_reports.py` | §5.7's parent pre-report, §10.2's connection requirement's server half |
| `tests/attendance/test_bootstrap.py` | §6.1's payload, the two-day bound, tenancy |
| `tests/attendance/test_permissions.py` | §3.2's matrix per route, plus the other-studio 404 |

`app/models/attendance.py` already exists at revision `0007` and is complete. Do not extend it.

### Frontend — `web/packages/core/src/offline/**` (this lane's only `packages/core` claim)

| File | Responsibility |
|---|---|
| `types.ts` | `NetworkMode`, `PendingOp`, `ConflictCard`, `CachedSession`, `RosterRow`, `OfflineStore` |
| `store.ts` | The `OfflineStore` port + `memoryStore()` |
| `indexedDbStore.ts` | The hand-written IndexedDB adapter (no Dexie) |
| `network.ts` | §10.1's **four**-state machine — pure reducer + `NetworkMonitor` |
| `pendingOps.ts` | The queue. Enqueue never touches the network or the token; nothing dequeues on failure |
| `cache.ts` | §10.6's two-day bound, oldest-first eviction, `pending_ops` exempt |
| `sync.ts` | The flusher: refresh → flush → conflicts. Auth outcomes per §10.3 |
| `priming.ts` | §6.1's blocking first-launch prime |
| `staleQueue.ts` | §6.5's blocking warning when unsynced work outlives a session |
| `useOffline.ts` | The React surface: `useNetworkMode`, `usePendingCount`, `useConflicts` |
| `devTools.ts` | The offline/slow **overrides** the dev bar toggles drive (no React here) |
| `index.ts` | The sub-barrel `web/packages/core/src/index.ts` re-exports (one line, added by this lane) |

### Frontend — feature directories

| File | Responsibility |
|---|---|
| `web/apps/staff/src/features/attendance/RosterRow.tsx` | **The `roster-row` container.** Renders `useSlot('roster-row')` |
| `web/apps/staff/src/features/attendance/RosterScreen.tsx` | Artboards `1c`/`9f` — counts, bulk bar, list, sync banner |
| `web/apps/staff/src/features/attendance/SessionSummary.tsx` | Artboard `9g` |
| `web/apps/staff/src/features/attendance/StudentCardScreen.tsx` | Artboard `2d` — the `student-card` slot host on the staff surface |
| `web/apps/staff/src/features/attendance/AttendanceStrip.tsx` | The `student-card` slot entry this lane fills |
| `web/apps/staff/src/features/attendance/ConflictSection.tsx` | The `alert-centre` slot entry this lane fills |
| `web/apps/staff/src/features/attendance/devbar.tsx` | The `dev-bar` offline/slow toggles |
| `web/apps/staff/src/features/attendance/client.ts` | The staff app's view of the attendance API |
| `web/apps/staff/src/features/attendance/index.ts` | Feature barrel; the one place registrations happen |
| `web/apps/parent/src/features/absence/AbsenceScreen.tsx` | Artboard `12a` |
| `web/apps/parent/src/features/absence/client.ts`, `index.ts` | |
| `web/apps/dashboard/src/features/attendance/AttendanceReport.tsx` | Artboard `4c` |
| `web/apps/dashboard/src/features/attendance/QuickViewRoster.tsx` | Artboard `1e`'s popover roster |
| `web/apps/dashboard/src/features/attendance/client.ts`, `index.ts` | |

---

## Task 1: §10.5's conflict rules, as a pure function

The hardest rules in the lane, with no database in the way. Everything later reads through this.

**Files:**
- Create: `app/services/attendance/errors.py`, `app/services/attendance/resolve.py`,
  `app/services/attendance/__init__.py`
- Test: `tests/attendance/test_resolve.py`

**Interfaces:**
- Consumes: `app.schemas.attendance.AttendanceStatus`, `AttendanceSource`
- Produces:
  ```python
  @dataclass(frozen=True)
  class ExistingMark:
      status: str
      source: str
      device_marked_at: datetime
      client_mark_id: uuid.UUID

  @dataclass(frozen=True)
  class IncomingMark:
      status: str
      source: str
      device_marked_at: datetime
      client_mark_id: uuid.UUID

  class Decision(StrEnum):
      APPLY = "apply"          # no existing row, or the incoming mark wins
      REPLAY = "replay"        # same client_mark_id — a no-op, not a conflict
      KEEP_EXISTING = "keep_existing"

  def resolve_mark(existing: ExistingMark | None, incoming: IncomingMark) -> Decision: ...
  ```

- [ ] **Step 1: Write the failing tests — one per §10.5 row**

```python
# tests/attendance/test_resolve.py
def test_a_replay_of_the_same_client_mark_id_is_a_no_op(): ...
def test_two_coaches_resolve_by_device_marked_at(): ...
def test_a_bulk_action_never_overwrites_a_parent_pre_report(): ...
def test_a_coachs_explicit_tap_may_override_a_parent_pre_report(): ...
def test_an_unmarked_row_is_never_the_winner_over_a_real_mark_at_the_same_instant(): ...
```

- [ ] **Step 2:** `.venv/bin/pytest tests/attendance/test_resolve.py -q` → FAIL (ImportError)
- [ ] **Step 3:** Implement `resolve.py`. The `source == "bulk"` vs `existing.source == "parent"`
      branch is checked **before** the timestamp comparison — that is what "regardless of
      timestamp" means.
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(attendance): §10.5's conflict rules as a pure resolver`

---

## Task 2: The roster — expected vs merely enrolled

**Files:**
- Create: `app/services/attendance/roster.py`
- Test: `tests/attendance/test_roster.py`

**Interfaces:**
- Consumes: `app.services.people.attendance_pattern.is_expected`,
  `app.services.people.group_days.studio_weekday`, `ScheduleService`
- Produces:
  ```python
  @dataclass(frozen=True)
  class RosterRowRaw:
      student_id: uuid.UUID
      display_name: str
      health_status: str
      derived_flags: dict[str, bool]
      status: str
      source: str | None
      has_absence_report: bool
      absence_reason: str | None
      expected: bool

  def build_roster(session: OrmSession, session_id: uuid.UUID) -> tuple[SessionRow, list[RosterRowRaw]]
  ```

- [ ] **Step 1:** Failing tests — an enrolled student appears; a student whose
      `attends_weekdays` excludes this session's weekday appears with `expected=False`;
      the two seam fields come off `student.health_status` and are never fetched from a
      health service; a `RosterEntry` carries no financial field.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(attendance): the roster, expected students separated from merely enrolled`

---

## Task 3: `AttendanceService` — marking, batch, idempotency

**Files:**
- Create: `app/services/attendance/service.py`
- Test: `tests/attendance/test_marking.py`

**Produces:**
```python
class AttendanceService:
    def __init__(self, session: OrmSession) -> None
    def session_roster(self, session_id) -> SessionRosterOut
    def apply_batch(self, body: BatchAttendanceIn, *, actor_person_id, at) -> BatchResult
    def bulk_present(self, session_id, body: BulkPresentIn, *, actor_person_id, at) -> BatchResult
    def report_absence(self, body: AbsenceReportIn, *, reporter_person_id, at) -> AbsenceReport
    def student_history(self, student_id, *, cursor, limit) -> tuple[list[Attendance], uuid.UUID | None]
```
`BatchResult` carries `applied: list[Attendance]`, `replayed: int`, `conflicts: list[ConflictOut]`.

- [ ] **Step 1:** Failing tests — a replayed `client_mark_id` is a no-op and does not raise;
      a mark against a **cancelled** session is **stored and flagged**, never dropped and
      never silently applied; a mark for a student unenrolled meanwhile is stored and
      flagged; `unmarked` round-trips as a stored status.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement using `resolve_mark`. Audit each accepted batch with
      `AuditService.record(action="attendance.batch", …)` — counts only, never a child's name.
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(attendance): batch marking, idempotent on client_mark_id`

---

## Task 4: §5.7's bulk rule

**Files:** Modify `app/services/attendance/service.py`; Test `tests/attendance/test_bulk_present.py`

- [ ] **Step 1:** Failing tests — bulk sets every `unmarked` **expected** row to `present`;
      it does **not** touch a row a coach already set; it does **not** touch an
      `absent_excused` row with `source='parent'`; it never touches the not-expected
      section; each row it writes gets a distinct `client_mark_id` derived from
      `client_mark_id_prefix` so a replayed bulk is still idempotent.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(attendance): the bulk rule, with the pre-report protection`

---

## Task 5: Parent absence pre-reports

**Files:** Modify `service.py`; Test `tests/attendance/test_absence_reports.py`

- [ ] **Step 1:** Failing tests — a guardian of the child may report; a guardian of a
      different child may not; a report writes both an `absence_report` and an
      `attendance` row at `absent_excused` / `source='parent'`; a second report for the
      same (student, session) is rejected as already reported; a report for a session that
      has already started is rejected (`too_late`) — §10.2's deadline is the server's, not
      the client's.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(attendance): the parent's advance notice`

---

## Task 6: `/sync/bootstrap` and the two routers

**Files:** Create `app/services/attendance/bootstrap.py`, `app/routers/attendance.py`,
`app/routers/sync.py`; Test `tests/attendance/test_bootstrap.py`, `tests/attendance/test_permissions.py`

- [ ] **Step 1:** Failing tests — the payload is one round trip carrying sessions **and**
      rosters; a window wider than two days is clamped (§10.6); `server_time` is
      `app.core.clock.now()` so `X-Dev-Now` moves it; another studio's session is a **404**,
      never a 403; §3.2's matrix per route; the routers are tagged `coach` and carry no
      money.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS, and
      `.venv/bin/pytest tests/invariants tests/restrictions -q` still green
- [ ] **Step 5:** Commit `feat(attendance): the roster, batch and bootstrap endpoints`

---

## Task 7: The offline store port

**Files:** Create `web/packages/core/src/offline/types.ts`, `store.ts`, `indexedDbStore.ts`;
Test `web/packages/core/src/offline/store.test.ts`

**Produces:**
```ts
export interface OfflineStore {
  get<T>(table: TableName, key: string): Promise<T | undefined>
  put<T>(table: TableName, key: string, value: T): Promise<void>
  delete(table: TableName, key: string): Promise<void>
  all<T>(table: TableName): Promise<{ key: string; value: T }[]>
  clear(table: TableName): Promise<void>
}
export type TableName = 'pending_ops' | 'sessions' | 'rosters' | 'meta' | 'conflicts'
export function memoryStore(): OfflineStore
export function indexedDbStore(name?: string): OfflineStore
```

- [ ] **Step 1:** Failing tests against `memoryStore()` — put/get/all/delete round-trip;
      `all` returns insertion-independent, key-sorted rows.
- [ ] **Step 2:** `(cd web && npx vitest run packages/core/src/offline/store.test.ts)` → FAIL
- [ ] **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(core): the offline store port, with no new dependency`

---

## Task 8: §10.1's four network states

**The single most-specified requirement in the lane. One test per transition.**

**Files:** Create `web/packages/core/src/offline/network.ts`;
Test `web/packages/core/src/offline/network.test.ts`

**Produces:**
```ts
export type NetworkMode = 'online' | 'slow' | 'intermittent' | 'offline' | 'api-down'
export type Probe = { ok: boolean; status?: number; elapsedMs: number; timedOut: boolean }
export type NetState = { mode: NetworkMode; consecutiveSuccesses: number }
export const SLOW_TIMEOUT_MS = 6000
export const CONSECUTIVE_SUCCESSES_TO_RECOVER = 2
export function initialState(): NetState
export function reduce(state: NetState, probe: Probe): NetState
export function makeMonitor(opts: { ping: () => Promise<Response>; now: () => number }): NetworkMonitor
```

- [ ] **Step 1:** Failing tests, one per transition:
  - online → slow: a success at 8000 ms with `timedOut=false`
  - online → offline: a 6000 ms timeout **demotes into the offline path**, never spins
  - offline → intermittent: **one** success is not enough
  - intermittent → online: the **second consecutive** success promotes
  - intermittent → intermittent: a success then a failure resets the counter to 0
  - online → api-down: a 503, distinguished from offline
  - api-down → online: two consecutive successes
  - **`navigator.onLine` is never read**: assert by grep — `network.ts` contains no
    `onLine` occurrence — because a captive portal reports `true` while routing nowhere
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(core): §10.1's four network states, derived from request outcomes`

---

## Task 9: `pending_ops` — the queue that is never dropped

**Files:** Create `web/packages/core/src/offline/pendingOps.ts`;
Test `web/packages/core/src/offline/pendingOps.test.ts`

**Produces:**
```ts
export type PendingOp = {
  client_mark_id: string
  kind: 'attendance.mark' | 'attendance.bulk' | 'note.session' | 'note.student'
  session_id: string
  payload: unknown
  device_marked_at: string
  queued_at: string
  person_id: string | null
  attempts: number
}
export async function enqueue(store: OfflineStore, op: PendingOp): Promise<void>
export async function listPending(store: OfflineStore): Promise<PendingOp[]>
export async function markSynced(store: OfflineStore, ids: string[]): Promise<void>
export async function recordAttempt(store: OfflineStore, id: string): Promise<void>
export async function pendingCount(store: OfflineStore): Promise<number>
```

- [ ] **Step 1:** Failing tests — `enqueue` succeeds with **no token set and no network at
      all** (the local write is not an API call); enqueueing the same `client_mark_id` twice
      stores one row; `recordAttempt` increments and **never removes**; only `markSynced`
      removes; there is no exported function that clears the queue wholesale (assert by
      inspecting the module's exports).
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(core): pending_ops, written without a token and never dropped`

---

## Task 10: §10.6's cache budget, with `pending_ops` exempt

**Files:** Create `web/packages/core/src/offline/cache.ts`;
Test `web/packages/core/src/offline/cache.test.ts`

**Produces:**
```ts
export const CACHE_WINDOW_DAYS = 2
export async function writeWindow(store, payload: BootstrapPayload): Promise<void>
export async function evict(store: OfflineStore, nowIso: string): Promise<{ evicted: string[] }>
export async function readSession(store, sessionId): Promise<CachedSession | undefined>
export async function watermark(store): Promise<string | null>
```

- [ ] **Step 1:** Failing tests — a third day's session is evicted while the newest two stay;
      eviction is oldest-first; **`pending_ops` survives an eviction that empties every other
      table**, including one triggered while the queue references an evicted session.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(core): a two-day cache, with pending_ops exempt from eviction`

---

## Task 11: §10.3 — flushing, and the three auth outcomes

**Files:** Create `web/packages/core/src/offline/sync.ts`;
Test `web/packages/core/src/offline/sync.test.ts`

**Produces:**
```ts
export type ConflictCard = {
  id: string
  kind: 'session_cancelled' | 'student_unenrolled' | 'different_person' | 'rejected'
  session_id: string | null
  count: number
  raised_at: string
  dismissed: boolean
}
export type FlushResult = { flushed: number; deferred: number; conflicts: ConflictCard[] }
export async function flush(deps: {
  store: OfflineStore
  post: (path: string, body: unknown) => Promise<Response>
  refresh: () => Promise<boolean>
  currentPersonId: () => string | null
}): Promise<FlushResult>
export async function listConflicts(store): Promise<ConflictCard[]>
export async function dismissConflict(store, id: string): Promise<void>
```

- [ ] **Step 1:** Failing tests:
  - **expired access token** — the first POST 401s, `refresh()` succeeds, the flush
    retries and the queue empties
  - **expired refresh token** — `refresh()` returns `false`; the flush **defers** and
    `listPending()` is unchanged. Nothing is discarded
  - **a different person** — `currentPersonId()` differs from the op's `person_id`; the
    queue is **not** flushed and a `different_person` conflict card is raised
  - a `409` naming a cancelled session becomes a `session_cancelled` card, and the ops
    are removed only because the **server accepted and stored them**
  - a network failure mid-flush leaves every unflushed op in place
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(core): the flusher — §10.3's auth cases and §10.5's conflict cards`

---

## Task 12: §6.1's blocking prime and §6.5's blocking stale warning

**Files:** Create `web/packages/core/src/offline/priming.ts`, `staleQueue.ts`,
`useOffline.ts`, `devTools.ts`, `index.ts`; Modify `web/packages/core/src/index.ts`
(one re-export block); Test `priming.test.ts`, `staleQueue.test.ts`

**Produces:**
```ts
// priming.ts
export type PrimeState = 'idle' | 'priming' | 'ready' | 'failed'
export async function primeOfflineCache(deps: { store; getBootstrap; now }): Promise<PrimeState>
export function primeWindow(nowIso: string): { from: string; to: string }  // today + tomorrow
// staleQueue.ts
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000
export async function staleQueueWarning(store, nowIso): Promise<{ blocking: boolean; count: number; oldestQueuedAt: string | null }>
// devTools.ts
export function setForcedMode(mode: NetworkMode | null): void
export function forcedMode(): NetworkMode | null
```

- [ ] **Step 1:** Failing tests — `primeWindow` covers today **and tomorrow** in
      Asia/Jerusalem; a failed prime returns `'failed'` and never `'ready'`, so the caller
      cannot fall through to Today; `staleQueueWarning` is `blocking: true` once the oldest
      op has been queued longer than one session, `false` on an empty queue;
      `requestPersistentStorage()` (M0's, already in core) is called on prime.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(core): offline priming and the blocking stale-queue warning`

---

## Task 13: The `roster-row` container

**The one composite container this wave creates. M4 registers into it.**

**Files:** Create `web/apps/staff/src/features/attendance/RosterRow.tsx`, `client.ts`;
Test `RosterRow.test.tsx`

**Produces:**
```ts
export type RosterRowProps = {
  student_id: string
  display_name: string
  health_status: 'missing' | 'trial_signed' | 'signed'
  derived_flags: Record<string, boolean>
  status: 'unmarked' | 'present' | 'absent_excused' | 'absent_unexcused'
  source: 'coach' | 'parent' | 'bulk' | 'system' | null
  has_absence_report: boolean
  absence_reason: string | null
  belt_color_hex: string | null
  belt_name: string | null
  locale: Locale
  onCycle: () => void
}
```

- [ ] **Step 1:** Failing tests — the row renders every entry `useSlot('roster-row')`
      returns and **names none of them**; a tap cycles `unmarked → present →
      absent_unexcused → unmarked`; an `absent_excused` row with `source='parent'` renders
      `attendance.source.preReported` and does **not** cycle on a plain tap; the row is a
      `<button>`, not a div with `onClick`; a `health_status='missing'` row is **still
      markable present** (§5.5).
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement using `AttendanceMark` and `BeltBar`.
      Do not write a second status chip. · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(staff): the roster-row container, composed from slots`

---

## Task 14: Artboards `1c`/`9f` — the roster screen

**Files:** Create `web/apps/staff/src/features/attendance/RosterScreen.tsx`, `index.ts`;
Modify `web/apps/staff/src/App.tsx` (mount behind `#/attendance`);
Test `RosterScreen.test.tsx`

- [ ] **Step 1:** Failing tests — three count tiles (present · absent · unmarked) and the
      unmarked count excludes the not-expected section; the bulk button's copy states it
      will not overwrite a pre-report (`attendance.source.preReportedHint`) — `9f` finding 1;
      `1c`'s sync banner and offline hint render in every non-online mode (`9f` finding 2);
      the not-expected section renders collapsed beneath the roster and its rows are still
      markable.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(staff): the roster screen (1c/9f)`

---

## Task 15: The three slot fills

**Files:** Create `web/apps/staff/src/features/attendance/AttendanceStrip.tsx`,
`ConflictSection.tsx`, `devbar.tsx`; Modify the feature barrel;
Test `slots.test.tsx`

- [ ] **Step 1:** Failing tests — importing the barrel registers exactly three entries:
      `student-card` (the attendance strip), `alert-centre` (the conflict cards) and
      `dev-bar` (`offline` and `slow`, at `DEV_TOOL_ORDER`'s 10 and 20 so the placeholder
      erases itself); the conflict section renders one card per §10.5 kind and each is
      dismissible; the dev-bar toggles drive `setForcedMode`.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(staff): the three slots this lane fills`

---

## Task 16: Artboards `9g` and `2d`

**Files:** Create `SessionSummary.tsx`, `StudentCardScreen.tsx`; Test both

- [ ] **Step 1:** Failing tests — `9g` renders three read-only tiles and **no exam or belt
      affordance at all** (`9g` finding 8, deliberate); `2d` renders the `student-card`
      slot, an eight-mark history, and **no financial field anywhere** (§3.2, enforced by
      omission with a comment saying so — `2d` finding 10); the mark-present control binds
      `--accent`, never `--paid` (`2d` finding 6).
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(staff): the session summary and the coach's student card`

---

## Task 17: Artboard `12a` — the parent's absence report

**Files:** Create `web/apps/parent/src/features/absence/{AbsenceScreen.tsx,client.ts,index.ts}`;
Modify `web/apps/parent/src/App.tsx`; Test `AbsenceScreen.test.tsx`

- [ ] **Step 1:** Failing tests — **offline, the screen refuses and says so**
      (`attendance.absence.requiresConnection` + `requiresConnectionHint`), and the submit
      button is disabled rather than queuing (§10.2, `12a` finding 1); a past deadline
      renders `absence.tooLate`; a duplicate renders `absence.alreadyReported`; no
      `pending_ops` row is ever written by this screen (assert `pendingCount === 0` after a
      refused submit).
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(parent): the absence pre-report, which requires a connection on purpose`

---

## Task 18: Artboards `4c` and `1e` — the dashboard

**Files:** Create `web/apps/dashboard/src/features/attendance/{AttendanceReport.tsx,QuickViewRoster.tsx,client.ts,index.ts}`;
Modify `web/apps/dashboard/src/App.tsx`; Test both

- [ ] **Step 1:** Failing tests — `4c`'s sequence strip draws `unmarked` as its own
      treatment and the consecutive-absence count **skips** it (`4c` finding 1, and §5.14's
      whole reason `unmarked` exists); the screen states
      `reports.attendance.unmarkedExcluded` rather than only encoding it; `1e`'s popover
      roster is **scrollable**, not clipped (`1e` finding 2); its bulk action honours the
      pre-report rule.
- [ ] **Step 2:** Run → FAIL · **Step 3:** Implement · **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(dashboard): the attendance report and the week quick view`

---

## Task 19: Close the lane

- [ ] **Step 1:** `./scripts/lane-check.sh attendance` — every gate green
- [ ] **Step 2:** Tick M5's pieces in `docs/plan/state.yaml`
- [ ] **Step 3:** Commit `docs(plan): tick M5`

---

## Self-Review

**Spec coverage.** §5.7 states/transitions → Tasks 1–4. §5.7 expected-vs-enrolled → Task 2.
§5.7 bulk rule → Task 4. §5.7 parent pre-report → Task 5. §5.13 notes → the `note` column is
carried by `AttendanceIn` and the `note.session`/`note.student` `PendingOp` kinds (Task 9);
the composer is `9g` (Task 16). §5.14 `unmarked` → Tasks 3, 18. §6.1 priming → Task 12.
§6.5 standalone + `persist()` + blocking stale warning → Task 12 (`App.tsx` already gates
on standalone; `requestPersistentStorage` already exists in core). §10.1 → Task 8. §10.2 →
Tasks 5, 17. §10.3 → Task 11. §10.4 staleness watermark → Task 10's `watermark()`, rendered
in Task 14. §10.5 → Tasks 1, 3, 11. §10.6 → Tasks 10, 12.

**Deferred, and recorded as such.** §5.14's *at-risk sidebar* on `4c` is M9's data on an M5
screen — `4c` finding 2 says the contract must decide whether M5 renders it or W5 does, and
it does not. Task 18 builds the unmarked-sessions half and the group-percentage half and
leaves the sidebar to M9. `9g`'s **injury report** has no model, no key and no §-reference
(`9g` finding 1) and cannot be built from the artboard; Task 16 omits it.

**Placeholders:** none — every task names its files, its assertions and its commit.

**Type consistency:** `resolve_mark`/`Decision` (Task 1) are consumed by Task 3.
`OfflineStore`/`TableName` (Task 7) are the first parameter of every function in Tasks 9–12.
`PendingOp.client_mark_id` is the same string the backend's `AttendanceIn.client_mark_id`
parses as a UUID. `ConflictCard` (Task 11) is what Task 15's `ConflictSection` renders.
