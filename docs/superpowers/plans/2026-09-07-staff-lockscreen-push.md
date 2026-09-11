# Staff Lockscreen Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Web Push messages the server already sends actually render on a coach's
lockscreen, and make a tap on the unmarked-attendance notice open that session's register.

**Architecture:** The staff app switches from `vite-plugin-pwa`'s generated service worker to
`injectManifest`, so the app owns a `sw.ts` that can carry a `push` and a `notificationclick`
listener. All decision logic — parsing the push envelope, choosing the destination hash —
lives in a plain, worker-global-free module (`swPush.ts`) that vitest can exercise directly;
`sw.ts` is thin wiring plus the precache the generated worker used to provide. The server
gains one field: `kind` travels in the push envelope so the worker knows where a tap should
land.

**Tech Stack:** TypeScript, `vite-plugin-pwa` ^1.3.0 (injectManifest), `workbox-precaching`,
`workbox-routing`, vitest (jsdom), FastAPI, `pywebpush`, pytest.

**Spec:** [SPEC.md](../../../SPEC.md) §5.11 (the two levels — "Buzzes and shows on the lock
screen even when the app is closed", SPEC.md:1095) and §6.5 (Distribution, SPEC.md:1437).
Defect history: [2026-09-02-completion-findings-register.md](../specs/2026-09-02-completion-findings-register.md)
§2.1, whose close notes *"no service worker acks a `push` event back to the server"* — the
gap this plan fills.

## Global Constraints

- **Vertical: `comms`.** Every gate run is `./scripts/lane-check.sh comms`.
- **Python is always `.venv/bin/…`.** A bare `pytest`/`mypy` resolves to a 3.8 interpreter
  earlier on PATH and its green means nothing.
- **No Alembic revision in this work.** `notification_delivery.status` already permits
  `'delivered'` and `Notification.kind` already exists. If a task appears to need a column,
  stop — that is a contract change and belongs on `main` in a wave's contract commit.
- **Never edit `web/packages/i18n/index.ts`.** The `comms` namespace already exists and is
  registered; this plan only adds keys inside it.
- **Hebrew strings live in `web/packages/i18n/he/<namespace>.ts`, mirrored in `en/` and
  `ru/`.** Never inline a user-facing string — including in the service worker.
- **Never log notification titles, bodies or payloads** (§18.3). Push content is in the
  "never logged" column, and `kind` is the only part of it safe to record.
- **`app.core.clock.now()` is the only clock.** A test fails the build on any other
  `datetime.now()` in `app/`.
- **Stage by explicit path.** Other sessions commit to this repo concurrently; `git add -A`
  sweeps up their work. As of 2026-09-07 a concurrent session is actively editing
  `web/packages/ui/src/tokens.css` and `tokens.roles.ts` — do not touch either.

## Out of scope, and why

- **A real lockscreen widget.** WidgetKit (iOS) and App Widgets (Android) need a native
  binary. §6.5 ships installable PWAs with no App Store build and no Play listing. A widget
  is a spec change, not a feature.
- **A delivery ack (`status = 'delivered'`).** The access token is a module-scoped JS
  variable — *"Not localStorage, not sessionStorage, not IndexedDB"*
  ([session.ts:3](../../../web/packages/core/src/identity/session.ts#L3)) — so a service
  worker cannot present a Bearer token, and when a push arrives the page may not be running
  at all. An ack would have to authenticate off the httpOnly refresh cookie alone, which is a
  §11.7 security decision and not a small addition. Recorded as an open question below.
- **The parent and dashboard apps.** Their pushes are equally invisible and the fix is the
  same shape, but the staff app is the one with the attendance ask and the one already gated
  into standalone mode. Task 6 records the follow-up.
- **Notification action buttons.** Android renders them on the lockscreen; iOS hides them
  behind an expand, so they buy little for a coach and they need per-kind copy. Revisit once
  the plain notification is proven on a device.

## File Structure

| File | Responsibility |
|---|---|
| `app/services/comms/push.py` | `PushSender.send` gains a `kind` keyword; both senders forward it. Modify. |
| `app/workers/notify.py` | `_send_to_any` passes `note.kind`. Modify (~line 187). |
| `tests/comms/test_the_push_transport.py` | `kind` reaches the encrypted envelope. Modify. |
| `web/packages/i18n/he/comms.ts` + `en/` + `ru/` | Two fallback strings for an unreadable push. Modify. |
| `web/apps/staff/src/features/comms/swPush.ts` | **Create.** Pure logic: parse the envelope, choose the hash. No worker globals, so vitest reads it in jsdom. |
| `web/apps/staff/src/features/comms/swPush.test.ts` | **Create.** The whole behavioural surface. |
| `web/apps/staff/src/sw.ts` | **Create.** Worker wiring only: precache + two listeners. |
| `web/apps/staff/tsconfig.sw.json` | **Create.** `lib: ["ES2023", "WebWorker"]` for the one file that needs it. |
| `web/apps/staff/vite.config.ts` | `strategies: 'injectManifest'`. Modify (~line 21). |
| `web/tsconfig.json` | Exclude `apps/*/src/sw.ts` from the DOM-lib project. Modify. |
| `web/package.json` | `typecheck` also runs the sw project; add two workbox deps. Modify. |

**Why the logic/wiring split.** A service worker file cannot be imported by a jsdom test —
it references `ServiceWorkerGlobalScope`, and importing it registers listeners against a
`self` that is not a worker. Keeping every decision in `swPush.ts` means the behaviour is
tested normally and `sw.ts` holds nothing worth a test but the precache, which
`sw-precache.test.ts` already asserts against built output.

---

### Task 1: `kind` travels in the push envelope

The worker cannot route a tap without knowing what kind of notice it is. `Notification.kind`
already exists in the database; it just never reaches the device — `_send_to_any` sends
`title`, `body` and `payload` only.

**Files:**
- Modify: `app/services/comms/push.py` (the `PushSender` Protocol, `RecordingPushSender.send`, `WebPushSender.send`)
- Modify: `app/workers/notify.py:187-205` (`_send_to_any`)
- Test: `tests/comms/test_the_push_transport.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the JSON envelope pushed to a device becomes
  `{"title": str, "body": str, "kind": str, "payload": dict}`. Task 3's
  `parsePushEnvelope` parses exactly this shape.

- [ ] **Step 1: Write the failing test**

Append to `tests/comms/test_the_push_transport.py`:

```python
def test_the_kind_reaches_the_device_so_a_tap_knows_where_to_go():
    """Without `kind` on the wire the service worker can only open the app's home screen.

    Asserted on the ENCRYPTED call's input rather than on a mocked sender, so a `kind`
    dropped between `_send_to_any` and the envelope fails here.
    """
    captured: dict = {}

    def fake_post(*args, **kwargs):
        captured["data"] = kwargs.get("data") or (args[1] if len(args) > 1 else None)

        class _Response:
            status_code = 201
            headers: dict[str, str] = {}
            text = ""

        return _Response()

    sender = WebPushSender(private_key=_PRIVATE_KEY, subject="mailto:ops@example.invalid")
    with patch("pywebpush.webpush") as spy:
        spy.side_effect = lambda **kw: _capture_and_ok(captured, kw)
        sender.send(
            token=json.dumps(_subscription()),
            title="נוכחות טרם נרשמה",
            body="יש שיעור שממתין לסימון נוכחות.",
            kind="attendance.reminder_unmarked",
            payload={"session_id": "0f9c1b2e-1111-4222-8333-444455556666"},
        )
    envelope = json.loads(captured["envelope"])
    assert envelope["kind"] == "attendance.reminder_unmarked"
    assert envelope["payload"]["session_id"] == "0f9c1b2e-1111-4222-8333-444455556666"


def _capture_and_ok(captured: dict, kwargs: dict):
    captured["envelope"] = kwargs["data"]

    class _Response:
        status_code = 201
        headers: dict[str, str] = {}
        text = ""

    return _Response()
```

Add to the same file's imports if absent: `import json` (already present at the top).

- [ ] **Step 2: Run it and watch it fail**

```
.venv/bin/pytest tests/comms/test_the_push_transport.py::test_the_kind_reaches_the_device_so_a_tap_knows_where_to_go -q
```

Expected: `TypeError: send() got an unexpected keyword argument 'kind'`.

- [ ] **Step 3: Add `kind` to the sender protocol and both implementations**

In `app/services/comms/push.py`, the Protocol:

```python
    def send(
        self, *, token: str, title: str, body: str, kind: str, payload: dict[str, Any]
    ) -> str: ...
```

`RecordingPushSender.send` — same signature; it still stores only the token prefix and the
message id, and neither title nor body (§18.3):

```python
    def send(
        self, *, token: str, title: str, body: str, kind: str, payload: dict[str, Any]
    ) -> str:
        message_id = f"rec-{uuid.uuid4().hex}"
        # `kind` joins the tuple because it is the one part of a notification that is safe
        # to keep -- an enum the product chose, not a word about a child. It is what lets a
        # test assert WHICH notice was sent without the body appearing in the assertion.
        self.sent.append((token, message_id))
        self.kinds.append(kind)
        return message_id
```

Add `self.kinds: list[str] = []` beside `self.sent` in `RecordingPushSender.__init__`.

`WebPushSender.send` — the envelope grows one key:

```python
    def send(
        self, *, token: str, title: str, body: str, kind: str, payload: dict[str, Any]
    ) -> str:
```

and inside the `webpush(...)` call:

```python
                # `kind` rides on the envelope rather than inside `payload` so a notice whose
                # payload happens to carry its own "kind" cannot shadow the routing key. The
                # service worker reads it to choose a destination; see swPush.ts.
                data=json.dumps({"title": title, "body": body, "kind": kind, "payload": payload}),
```

- [ ] **Step 4: Pass `note.kind` at the call site**

In `app/workers/notify.py`, inside `_send_to_any`'s loop:

```python
            return sender.send(
                token=token,
                title=note.title,
                body=note.body,
                kind=note.kind,
                payload=note.payload,
            ), None
```

- [ ] **Step 5: Run the comms suites**

```
.venv/bin/pytest tests/comms/test_the_push_transport.py tests/comms/test_the_notify_worker.py -q
```

Expected: all pass. Any other `sender.send(` call site the type checker finds must be
updated; run `.venv/bin/mypy app` to be sure there are none left.

- [ ] **Step 6: Commit**

```bash
git add app/services/comms/push.py app/workers/notify.py tests/comms/test_the_push_transport.py
git commit -m "feat(comms): the notification kind travels to the device

A tap on a lockscreen notice can only open the app's home screen unless the
worker knows what kind of notice it was. kind rides on the envelope beside
title and body rather than inside payload, so a notice carrying its own
'kind' key cannot shadow the routing key.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The fallback strings

Chrome subscribes with `userVisibleOnly: true`, which obliges the worker to show a
notification for **every** push it receives. A push whose body will not parse must therefore
still produce something, or the browser substitutes *"This site has been updated in the
background"* and, after repeats, revokes the permission.

**Files:**
- Modify: `web/packages/i18n/he/comms.ts`, `web/packages/i18n/en/comms.ts`, `web/packages/i18n/ru/comms.ts`

**Interfaces:**
- Produces: `comms['push.fallbackTitle']` and `comms['push.fallbackBody']`, imported by
  Task 3's `swPush.ts`.

- [ ] **Step 1: Add the keys to Hebrew, the reference locale**

In `web/packages/i18n/he/comms.ts`, inside the `comms` object, beside the existing
`pushDisabled.*` family:

```ts
  // -- the service worker's last resort ------------------------------------------
  // Shown only when a push arrives that will not parse. `userVisibleOnly: true` obliges
  // the worker to render SOMETHING for every push, and the browser's own substitute
  // ("this site has been updated in the background") is worse than a vague Hebrew line:
  // it looks like a website, not the club, and repeated often enough Chrome withdraws
  // the permission. Deliberately says nothing about a child -- an unparseable envelope
  // is exactly the case where the worker does not know who it concerns.
  'push.fallbackTitle': 'עדכון חדש',
  'push.fallbackBody': 'פתחו את האפליקציה כדי לראות.',
```

- [ ] **Step 2: Mirror in `en/comms.ts`**

```ts
  'push.fallbackTitle': 'New update',
  'push.fallbackBody': 'Open the app to see it.',
```

- [ ] **Step 3: Mirror in `ru/comms.ts`**

```ts
  'push.fallbackTitle': 'Новое обновление',
  'push.fallbackBody': 'Откройте приложение, чтобы посмотреть.',
```

- [ ] **Step 4: Run the parity check**

```
cd web && node scripts/i18n-parity.mjs comms
```

Expected: exit 0, no gap reported. A missing mirror fails here.

- [ ] **Step 5: Commit**

```bash
git add web/packages/i18n/he/comms.ts web/packages/i18n/en/comms.ts web/packages/i18n/ru/comms.ts
git commit -m "feat(comms): a fallback line for a push that will not parse

userVisibleOnly obliges the worker to render something for every push. The
browser's own substitute looks like a website rather than the club, and
repeated often enough Chrome withdraws the permission.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The decision logic, tested in jsdom

Everything the worker decides, in a module with no worker globals — so it can be tested like
any other file rather than through a service-worker harness.

**Files:**
- Create: `web/apps/staff/src/features/comms/swPush.ts`
- Test: `web/apps/staff/src/features/comms/swPush.test.ts`

**Interfaces:**
- Consumes: Task 1's envelope shape; Task 2's `push.fallbackTitle` / `push.fallbackBody`.
- Produces:
  - `type PushNotice = { title: string; body: string; url: string }`
  - `parsePushEnvelope(raw: string | null): PushNotice`
  - `routeForKind(kind: string | null, payload: Record<string, unknown>): string`
  Task 4's `sw.ts` imports both.

- [ ] **Step 1: Write the failing tests**

Create `web/apps/staff/src/features/comms/swPush.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parsePushEnvelope, routeForKind } from './swPush'

const SESSION = '0f9c1b2e-1111-4222-8333-444455556666'

describe('routeForKind', () => {
  it('sends an unmarked-attendance notice to that session’s register', () => {
    expect(routeForKind('attendance.reminder_unmarked', { session_id: SESSION }))
      .toBe(`#/attendance/${SESSION}`)
  })

  it('falls back to the app root when the kind names a session but the id is missing', () => {
    // A malformed payload must not build `#/attendance/undefined`, which App.tsx would
    // read as a real session id and render an empty register against.
    expect(routeForKind('attendance.reminder_unmarked', {})).toBe('#/')
  })

  it('falls back to the app root when the id is not a string', () => {
    expect(routeForKind('attendance.reminder_unmarked', { session_id: 42 })).toBe('#/')
  })

  it('sends an unknown kind to the app root rather than inventing a route', () => {
    expect(routeForKind('belts.promoted', { student_id: SESSION })).toBe('#/')
  })

  it('sends a null kind to the app root', () => {
    expect(routeForKind(null, {})).toBe('#/')
  })
})

describe('parsePushEnvelope', () => {
  it('reads title, body and destination from a well-formed envelope', () => {
    const notice = parsePushEnvelope(JSON.stringify({
      title: 'נוכחות טרם נרשמה',
      body: 'יש שיעור שממתין לסימון נוכחות.',
      kind: 'attendance.reminder_unmarked',
      payload: { session_id: SESSION },
    }))
    expect(notice.title).toBe('נוכחות טרם נרשמה')
    expect(notice.body).toBe('יש שיעור שממתין לסימון נוכחות.')
    expect(notice.url).toBe(`#/attendance/${SESSION}`)
  })

  it('renders the fallback rather than nothing when the body is not JSON', () => {
    // userVisibleOnly: true — a push that shows no notification costs the permission.
    const notice = parsePushEnvelope('not json at all')
    expect(notice.title).toBe('עדכון חדש')
    expect(notice.body).toBe('פתחו את האפליקציה כדי לראות.')
    expect(notice.url).toBe('#/')
  })

  it('renders the fallback for an empty push', () => {
    expect(parsePushEnvelope(null).title).toBe('עדכון חדש')
  })

  it('renders the fallback title when the envelope parses but names no title', () => {
    const notice = parsePushEnvelope(JSON.stringify({ kind: 'x', payload: {} }))
    expect(notice.title).toBe('עדכון חדש')
  })

  it('ignores a non-string title rather than rendering "[object Object]"', () => {
    const notice = parsePushEnvelope(JSON.stringify({ title: { a: 1 }, body: 'ok' }))
    expect(notice.title).toBe('עדכון חדש')
    expect(notice.body).toBe('ok')
  })

  it('survives a payload that is not an object', () => {
    const notice = parsePushEnvelope(JSON.stringify({
      title: 'a', body: 'b', kind: 'attendance.reminder_unmarked', payload: 'nope',
    }))
    expect(notice.url).toBe('#/')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```
cd web && npx vitest run apps/staff/src/features/comms/swPush.test.ts --reporter=dot
```

Expected: FAIL — `Failed to resolve import "./swPush"`.

- [ ] **Step 3: Write the module**

Create `web/apps/staff/src/features/comms/swPush.ts`:

```ts
// What the service worker decides, kept out of the service worker.
//
// `sw.ts` cannot be imported by a jsdom test — it references ServiceWorkerGlobalScope and
// registering its listeners against a non-worker `self` proves nothing. So every decision
// lives here, in a module with no worker globals, and `sw.ts` is wiring with nothing left
// in it worth a test.
//
// The deep relative import is deliberate. `@studio/i18n` resolves to the barrel, which
// pulls all three locales and all ten namespaces; a service worker is precached and starts
// on every push, so it takes the one namespace it needs and nothing else. The cost is that
// the fallback is Hebrew-only — acceptable because it appears only when an envelope will
// not parse, and the worker has no locale to consult at that moment anyway.
import { comms } from '../../../../../packages/i18n/he/comms'

// `Bundle` is `Record<string, string>` and tsconfig.base.json sets
// `noUncheckedIndexedAccess`, so an index read is `string | undefined`. `!` and not a `??`
// default: a default would be a second, untranslated copy of the string living in a .ts
// file, and `scripts/i18n-parity.mjs comms` already fails the build if the key is missing.
const FALLBACK_TITLE = comms['push.fallbackTitle']!
const FALLBACK_BODY = comms['push.fallbackBody']!

export type PushNotice = {
  title: string
  body: string
  /** A hash route, always starting `#/`. Passed to `client.navigate` on a tap. */
  url: string
}

const HOME = '#/'

/**
 * Where a tap on this notice should land.
 *
 * A kind that is not named here goes home rather than to a guessed route: §5.11's trigger
 * list grows every milestone, and a worker is precached — a coach running last week's
 * worker would follow a route this week's app does not have.
 */
export function routeForKind(
  kind: string | null,
  payload: Record<string, unknown>,
): string {
  if (kind === 'attendance.reminder_unmarked') {
    const sessionId = payload.session_id
    // The type guard is load-bearing, not defensive dressing: `#/attendance/undefined`
    // is a route App.tsx accepts — `attendanceParts[0]` would be the string "undefined"
    // — and it renders an empty register rather than failing.
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      return `#/attendance/${sessionId}`
    }
  }
  return HOME
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Turn a push body into something showable. NEVER throws and never returns null: the
 * subscription is `userVisibleOnly: true`, so a push that renders no notification is a
 * push the browser renders itself — "this site has been updated in the background" — and
 * enough of those cost the permission outright.
 */
export function parsePushEnvelope(raw: string | null): PushNotice {
  const fallback: PushNotice = { title: FALLBACK_TITLE, body: FALLBACK_BODY, url: HOME }
  if (raw === null || raw.length === 0) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }

  const envelope = asRecord(parsed)
  const payload = asRecord(envelope.payload)
  return {
    title: asString(envelope.title) ?? fallback.title,
    body: asString(envelope.body) ?? fallback.body,
    url: routeForKind(asString(envelope.kind), payload),
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```
cd web && npx vitest run apps/staff/src/features/comms/swPush.test.ts --reporter=dot
```

Expected: 12 passed.

- [ ] **Step 5: Typecheck**

```
cd web && npm run typecheck
```

Expected: clean. Note `Bundle` is `Record<string, string>` and `noUncheckedIndexedAccess` is
on, so the two `!` assertions at the top of the module are load-bearing — without them the
reads are `string | undefined` and `PushNotice.title` will not accept them. Do not widen
`Bundle` to fix this; it is shared by every namespace.

- [ ] **Step 6: Commit**

```bash
git add web/apps/staff/src/features/comms/swPush.ts web/apps/staff/src/features/comms/swPush.test.ts
git commit -m "feat(comms): the service worker's routing decisions, in a testable module

sw.ts cannot be imported by a jsdom test, so every decision lives here and the
worker keeps only wiring. An unknown kind goes home rather than to a guessed
route: a precached worker outlives the app build that taught it the routes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The service worker itself

The switch from `generateSW` to `injectManifest`, and the two listeners that are the whole
point of this plan. The precache behaviour must survive unchanged — `sw-precache.test.ts`
asserts against built output and is the gate for that.

**Files:**
- Create: `web/apps/staff/src/sw.ts`
- Create: `web/apps/staff/tsconfig.sw.json`
- Modify: `web/apps/staff/vite.config.ts:21-38`
- Modify: `web/tsconfig.json` (add an `exclude` entry)
- Modify: `web/package.json` (`typecheck` script; two dependencies)

**Interfaces:**
- Consumes: `parsePushEnvelope`, `routeForKind` from Task 3; `kind` on the envelope from
  Task 1.
- Produces: a built `dist/sw.js` carrying the same precache manifest as before, plus `push`
  and `notificationclick` handling.

- [ ] **Step 1: Add the workbox dependencies**

`injectManifest` compiles a worker that imports workbox itself, so these become real
dependencies rather than transitive ones the plugin happened to carry.

```bash
cd web && npm i -D workbox-precaching workbox-routing
```

- [ ] **Step 2: Write the worker**

Create `web/apps/staff/src/sw.ts`:

```ts
/// <reference lib="webworker" />
//
// The staff app's service worker. Until 2026-09, vite-plugin-pwa GENERATED this file, and a
// generated worker has no `push` listener — so every push the server signed, encrypted and
// successfully handed to Apple or Google arrived at a coach's phone and was dropped. The
// 2026-09-02 findings register's §2.1 closed the transport half and said so in passing:
// "no service worker acks a `push` event back to the server". This is the missing half.
//
// Everything decidable lives in features/comms/swPush.ts so it can be tested; what is left
// here is the precache the generated worker used to provide, and two listeners.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { parsePushEnvelope } from './features/comms/swPush'

declare const self: ServiceWorkerGlobalScope & typeof globalThis

// -- precache: what generateSW did, restated -----------------------------------------
// §6.1 primes offline on the assumption Rubik is already cached before a coach walks into
// a basement. sw-precache.test.ts asserts all four subsets survive this switch.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// -- the doorbell --------------------------------------------------------------------
self.addEventListener('push', (event) => {
  // `event.data.text()` and not `.json()`: `.json()` throws on a malformed body, and a
  // throw here means no notification at all, which under userVisibleOnly costs the
  // permission. parsePushEnvelope handles the malformed case by design.
  const notice = parsePushEnvelope(event.data ? event.data.text() : null)
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      // The maskable icon is the one shaped for a notification shade; icon-192 is the
      // size Android renders there and iOS ignores in favour of the home-screen icon.
      icon: 'icons/icon-192.png',
      badge: 'icons/maskable-192.png',
      dir: 'rtl',
      lang: 'he',
      // One notice per destination. A coach who has not marked three registers wants
      // three lines, not one that overwrites the others — but a redelivery of the SAME
      // session must not stack, and the url is exactly that identity.
      tag: notice.url,
      data: { url: notice.url },
    }),
  )
})

// -- the tap -------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data as { url?: unknown } | undefined
  const hash = typeof data?.url === 'string' ? data.url : '#/'
  event.waitUntil(openApp(hash))
})

/**
 * Focus the running app if there is one, otherwise launch it — and in both cases land on
 * `hash`.
 *
 * Reusing an open window rather than always calling openWindow matters more here than it
 * looks: §10.6 requires `pending_ops` is never reclaimed, and a coach who marked a register
 * offline has unsynced writes in the tab they already have open. A second window would not
 * lose them, but it would leave them behind a tab nobody is looking at.
 */
async function openApp(hash: string): Promise<void> {
  const scope = new URL(self.registration.scope)
  const target = `${scope.pathname}${hash}`
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of windows) {
    if (new URL(client.url).origin !== scope.origin) continue
    await client.focus()
    // `navigate` is absent on older WebKit; focusing alone is still the right outcome —
    // the coach is in the app, one screen from the register, rather than nowhere.
    if ('navigate' in client) await client.navigate(target).catch(() => undefined)
    return
  }
  await self.clients.openWindow(target)
}
```

- [ ] **Step 3: Give the worker its own TypeScript project**

`web/tsconfig.json` compiles with `lib: ["ES2023", "DOM", "DOM.Iterable"]` and no
`WebWorker`, so `ServiceWorkerGlobalScope` does not exist there — and adding `WebWorker` to
the shared base would collide with `DOM` across the whole app.

Create `web/apps/staff/tsconfig.sw.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "WebWorker"],
    "types": ["vite-plugin-pwa/client"]
  },
  "include": ["src/sw.ts", "src/features/comms/swPush.ts"]
}
```

In `web/tsconfig.json`, add to `exclude`:

```json
  "exclude": [
    "**/dist/**",
    "**/node_modules/**",
    "apps/*/src/sw.ts"
  ],
```

In `web/package.json`, the `typecheck` script must cover both projects — a second `tsc`
invocation, because the worker's lib set is incompatible with the app's:

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p apps/staff/tsconfig.sw.json",
```

- [ ] **Step 4: Switch the plugin to injectManifest**

In `web/apps/staff/vite.config.ts`, replace the `VitePWA({...})` call. The workbox options
move from `workbox` to `injectManifest`, and `navigateFallback`/`cleanupOutdatedCaches` move
into `sw.ts` (they are generateSW-only options and are silently ignored under
injectManifest — which is exactly how a precache regression would go unnoticed):

```ts
    VitePWA({
      registerType: 'prompt',
      manifest,
      // injectManifest and not generateSW: a GENERATED worker cannot carry a `push`
      // listener, and without one every push the server sends is dropped on arrival.
      // src/sw.ts is that worker; the precache below is what generateSW used to build.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // woff2 is the load-bearing entry: §6.1 primes offline on the assumption
        // that Rubik is already cached before a coach walks into a basement.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // The iOS launch screens are ~800KB of PNG that the app itself never requests —
        // only iOS reads them, from its own cache, before the page exists. Precaching them
        // would spend most of the offline budget §6.1 reserves for the font on images no
        // offline session can use.
        globIgnores: ['**/splash/*.png'],
      },
      devOptions: { enabled: false },
    }),
```

- [ ] **Step 5: Typecheck, then build, then run the precache gate**

```
cd web && npm run typecheck
```

Expected: clean, both projects.

```
cd web && npm run build
```

Expected: succeeds, and emits `apps/staff/dist/sw.js`.

```
cd web && npx vitest run apps/staff/src/sw-precache.test.ts --reporter=dot
```

Expected: 5 passed. **This is the gate that the switch cost nothing.** If the Rubik
assertions fail, `globPatterns` did not carry over — fix the `injectManifest` block rather
than the test.

- [ ] **Step 6: Run the staff app's own suite**

```
cd web && npx vitest run apps/staff/src --reporter=dot
```

Expected: pass. `routes.reachable.test.ts` scans source for routed hashes; `sw.ts` and
`swPush.ts` introduce `#/attendance/` as a *destination*, which that test already exempts
(`'#/attendance'` is in its `EXEMPT` set) — if it fails, read its header before changing it.

- [ ] **Step 7: Commit**

```bash
git add web/apps/staff/src/sw.ts web/apps/staff/tsconfig.sw.json web/apps/staff/vite.config.ts web/tsconfig.json web/package.json web/package-lock.json
git commit -m "feat(comms): a service worker that renders the push

The generated worker had no push listener, so every push the server signed and
encrypted arrived at the phone and was dropped -- the half of the 2026-09-02
findings register's 2.1 that its close noted and left open.

injectManifest replaces generateSW; sw-precache.test.ts is the gate that the
switch cost none of 6.1's offline priming. The worker gets its own tsconfig
because WebWorker and DOM libs cannot share one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Prove it on a phone, and tick the plan

Everything above is tested in Node. None of it proves a phone buzzes. §"If it renders,
render it and look" applies: a notification is a rendered thing.

**Files:**
- Modify: `docs/plan/state.yaml`

- [ ] **Step 1: Run the lane gate**

```
./scripts/lane-check.sh comms
```

Expected: green. If the gate does not reach `web/apps/staff/src/features/comms/`, add that
path to the script's `comms` case branch — a silently skipped gate reads as covered.

- [ ] **Step 2: Check the environment can actually send**

VAPID keys must be set, or `default_push_sender` falls back to `RecordingPushSender` and
nothing leaves the server. Against staging (per
[railway-runbook.md](../../deploy/railway-runbook.md), `railway ssh --service api` is the
only shell that reaches it):

```bash
railway ssh --service api -- python -c "from app.core.config import settings; print(bool(settings.VAPID_PUBLIC_KEY), bool(settings.VAPID_PRIVATE_KEY), settings.VAPID_SUBJECT)"
```

Expected: `True True mailto:...`. Two `False`s mean the transport is the recording fallback
and no device test can succeed — stop and set the keys first.

- [ ] **Step 3: Install and subscribe on a real handset**

1. Open the staff app on a phone and install it to the home screen (iOS: Share → Add to Home
   Screen; the app refuses to run outside standalone mode, so this is forced anyway).
2. Launch from the home-screen icon and sign in as a coach.
3. Accept the notification permission when the pre-prompt offers it.
4. Confirm a row exists: `GET /api/v1/push-tokens` — or check `push_token` for that
   `person_id`.

- [ ] **Step 4: Trigger the real notice and look at the lockscreen**

Leave a session's register unmarked, lock the phone, and let the `*/15` cron reach
`ReminderService.remind_coach` ([reminders.py:205](../../../app/services/comms/reminders.py#L205))
— or invoke it directly against the studio. Note two gates that will silently swallow the
send: `in_quiet_hours` refuses everything between 21:00 and 08:00 Asia/Jerusalem, and the
per-`(kind, subject)` rate limit means a second attempt for the same session inside the
window produces nothing. Test in the morning, on a session you have not already used.

Check, in order, and write down which of these actually happened:
- The phone buzzed with the screen locked.
- The notification reads **נוכחות טרם נרשמה**, right-to-left, with the club icon.
- Tapping it opens the app **on that session's register**, not the schedule.
- With the app already open in the background, tapping focuses that window rather than
  opening a second one.
- `notification_delivery.status` for the row is `sent`.

- [ ] **Step 5: Tick the piece in state.yaml, in this commit**

Add the piece under the `comms` vertical. Record only what is not measurable — no test
counts, no branch, no environment health:

```yaml
        title: The service worker that renders a push, and the tap that opens the register
```

- [ ] **Step 6: Commit**

```bash
git add docs/plan/state.yaml
git commit -m "feat(comms): tick the lockscreen push piece

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Record what this leaves open

Not code. These are the three things a reader of this plan will otherwise rediscover.

- [ ] **Step 1: Append to the findings register**

In `docs/superpowers/specs/2026-09-02-completion-findings-register.md`, under §2.1's
resolution note:

```markdown
**Worker half resolved 2026-09-07 (staff app only).** `web/apps/staff/src/sw.ts` now renders
every push and routes a tap; `swPush.ts` holds the decisions and is tested. Three things stay
open and are deliberate, not forgotten:

1. **The parent and dashboard apps still drop every push.** Same defect, same fix, not done
   here. A parent's payment and health-declaration notices remain invisible — which is the
   larger share of §5.11's traffic. `usePushRegistration.ts`'s header explains why the two
   registration hooks were never shared (`packages/core` belongs to no lane); the same
   argument applies to the worker, and the same answer — a shared module — is the right one
   when a wave owns `core`.
2. **`received_count` is still 0.** A `delivered` ack needs the worker to call the API, and
   the access token is a module-scoped variable a worker cannot read (`session.ts:3`). The
   only credential a worker can present is the httpOnly refresh cookie, so an ack endpoint
   means authenticating off refresh alone — a §11.7 decision, not a small addition.
3. **The fallback line is Hebrew in every locale.** `sw.ts` imports one namespace to stay
   small, and an unparseable envelope carries no locale to consult anyway.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-02-completion-findings-register.md
git commit -m "docs(comms): what the worker half leaves open

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage.** §5.11's "shows on the lock screen" is Tasks 1–4; its "↓ tap" arrow into
  the app is Task 4's `notificationclick`. §6.5's PWA-only constraint is respected — nothing
  here needs a native shell. §6.1's offline priming is preserved by Task 4 Step 5's precache
  gate, which is the one thing the `generateSW` → `injectManifest` switch could plausibly
  break.
- **Type consistency.** `parsePushEnvelope` and `routeForKind` are named identically in Task
  3's tests, Task 3's module and Task 4's worker. The envelope key is `kind` at the top level
  in Task 1's Python, Task 1's test and Task 3's parser.
- **Known risk, stated rather than hidden.** Task 4 Step 4 moves options between two config
  keys that the plugin does not validate against each other: `navigateFallback` and
  `cleanupOutdatedCaches` are generateSW-only and are *silently ignored* under
  injectManifest. That is precisely why they move into `sw.ts` by hand and why Step 5 runs
  the precache suite against built output rather than trusting the config.
