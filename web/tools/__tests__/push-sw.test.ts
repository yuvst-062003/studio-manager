// The push half of the service worker, run for real.
//
// Every defect this file guards is silent on a phone. A handler that throws shows nothing; a
// route that does not exist in the app's router shows the home screen, which looks exactly
// like the tap having done nothing; a push with no data that shows no notification spends
// the `userVisibleOnly` promise and eventually costs the permission itself. None of it
// appears in a log anyone reads, so all of it is asserted here instead.
//
// The source is EVALUATED rather than imported: it is not a module, it is bytes served to a
// browser and run in a worker global. `node:vm` is the closest thing to that available in a
// test, and it means these specs run against the same string the plugin emits — a
// hand-rewritten copy of the handler would pass while the shipped file was broken.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { PUSH_ROUTING, pushServiceWorkerSource } from '../push-sw.mjs'
import type { PushApp } from '../push-sw.mjs'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCOPE = 'https://app.example.invalid/'

type Shown = { title: string; options: Record<string, unknown> }

/** `noUncheckedIndexedAccess` is on: say out loud that the notification exists. */
function only(shown: Shown[], index = 0): Shown {
  const found = shown[index]
  if (!found) throw new Error(`expected a notification at ${index}, saw ${shown.length}`)
  return found
}
type FakeWindow = { url: string; focused: boolean; navigatedTo: string | null }

/** A ServiceWorkerGlobalScope with just enough of the API for the handler to run in. */
function bootWorker(
  app: PushApp,
  openWindows: string[] = [],
  { focusRefuses = false }: { focusRefuses?: boolean } = {},
) {
  const listeners: Record<string, (event: unknown) => void> = {}
  const shown: Shown[] = []
  const opened: string[] = []
  const subscribed: Record<string, unknown>[] = []
  const windows: FakeWindow[] = openWindows.map((url) => ({ url, focused: false, navigatedTo: null }))

  const self = {
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners[type] = fn
    },
    registration: {
      scope: SCOPE,
      showNotification(title: string, options: Record<string, unknown>) {
        shown.push({ title, options })
        return Promise.resolve()
      },
      pushManager: {
        getSubscription: () => Promise.resolve(null),
        subscribe(options: Record<string, unknown>) {
          subscribed.push(options)
          return Promise.resolve({ options })
        },
      },
    },
  }

  const clients = {
    matchAll: () =>
      Promise.resolve(
        windows.map((w) => ({
          get url() {
            return w.url
          },
          focus() {
            if (focusRefuses) {
              return Promise.reject(new Error('InvalidAccessError: Not allowed to focus a window.'))
            }
            w.focused = true
            return Promise.resolve(this)
          },
          navigate(url: string) {
            w.navigatedTo = url
            return Promise.resolve(this)
          },
        })),
      ),
    openWindow(url: string) {
      opened.push(url)
      return Promise.resolve({ url })
    },
  }

  const context = createContext({ self, clients, URL, Promise, console, JSON })
  runInContext(pushServiceWorkerSource(app), context)

  /** Deliver an event and wait for whatever it passed to `waitUntil`. */
  async function deliver(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve()
    const listener = listeners[type]
    if (!listener) throw new Error(`the handler registered no "${type}" listener`)
    listener({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) })
    await pending
  }

  return { listeners, shown, opened, subscribed, windows, deliver }
}

/** What `WebPushSender.send` puts on the wire, as the browser hands it to the handler. */
function pushEvent(message: unknown) {
  return { data: message === undefined ? null : { json: () => message } }
}

describe('the push handler', () => {
  it('draws the notification the server sent, in Hebrew and right to left', async () => {
    const worker = bootWorker('parent')

    await worker.deliver(
      'push',
      pushEvent({
        title: 'חגורה חדשה!',
        body: 'נועה עלתה לחגורה צהובה',
        kind: 'belt.awarded',
        payload: { student_id: 's-1' },
      }),
    )

    expect(worker.shown).toHaveLength(1)
    expect(only(worker.shown).title).toBe('חגורה חדשה!')
    expect(only(worker.shown).options.body).toBe('נועה עלתה לחגורה צהובה')
    // The OS shell has no <html dir> to inherit — unsaid, a Hebrew body lays out backwards.
    expect(only(worker.shown).options.dir).toBe('rtl')
    expect(only(worker.shown).options.lang).toBe('he')
  })

  it('still shows something when the push carries no data at all', async () => {
    // `userVisibleOnly: true` is a promise to the browser, and a push service may legally
    // wake a worker with an empty message. Showing nothing here is what makes Chrome
    // substitute "This site has been updated in the background" and, eventually, revoke.
    const worker = bootWorker('parent')

    await worker.deliver('push', pushEvent(undefined))

    expect(worker.shown).toHaveLength(1)
    expect(only(worker.shown).title).toBe('עדכון חדש')
  })

  it('still shows something when the message is not readable JSON', async () => {
    const worker = bootWorker('parent')

    await worker.deliver('push', {
      data: {
        json() {
          throw new Error('not json')
        },
      },
    })

    expect(worker.shown).toHaveLength(1)
  })

  it('never collapses two notifications into one', async () => {
    // A `tag` would fold a second child's belt award into the first and the second would
    // never be seen. §5.11 fans out per person and per event.
    const worker = bootWorker('parent')

    await worker.deliver('push', pushEvent({ title: 'a', body: 'b', kind: 'belt.awarded', payload: {} }))

    expect(only(worker.shown).options.tag).toBeUndefined()
  })
})

describe('where a tap lands', () => {
  it('deep-links to the child the notification is about', async () => {
    const worker = bootWorker('parent')

    await worker.deliver(
      'push',
      pushEvent({ title: 'a', body: 'b', kind: 'belt.awarded', payload: { student_id: 's-7' } }),
    )

    expect(only(worker.shown).options.data).toEqual({ url: '#/student/s-7' })
  })

  it('falls back to the inbox when the payload has no id to link with', async () => {
    // `#/student/undefined` is a dead screen. The inbox always holds the message, so it is
    // the one target that can never be wrong.
    const worker = bootWorker('parent')

    await worker.deliver('push', pushEvent({ title: 'a', body: 'b', kind: 'belt.awarded', payload: {} }))

    expect(only(worker.shown).options.data).toEqual({ url: '#/announcements' })
  })

  it('falls back to the inbox for a kind nothing routes yet', async () => {
    // §5.11's trigger table grows every milestone. An unrouted kind must reach the inbox,
    // not throw — `kinds.py` makes the same choice for the same reason.
    const worker = bootWorker('parent')

    await worker.deliver('push', pushEvent({ title: 'a', body: 'b', kind: 'something.new', payload: {} }))

    expect(only(worker.shown).options.data).toEqual({ url: '#/announcements' })
  })

  it('focuses an app that is already open and takes it to the right screen', async () => {
    const worker = bootWorker('parent', [`${SCOPE}#/payments`])

    await worker.deliver('notificationclick', {
      notification: { close() {}, data: { url: '#/student/s-7' } },
    })

    expect(worker.windows[0]?.focused).toBe(true)
    // Navigated, not left where it was: a parent who tapped a belt notification asked for
    // the belt, not for the payments screen they were on an hour ago.
    expect(worker.windows[0]?.navigatedTo).toBe(`${SCOPE}#/student/s-7`)
    expect(worker.opened).toEqual([])
  })

  it('still navigates when the browser refuses to focus the window', async () => {
    // **A real Chrome refused.** `WindowClient.focus()` needs user activation and throws
    // `InvalidAccessError: Not allowed to focus a window` without it — which happens for
    // real, not only under a test harness. The handler used to chain
    // `focus().then(navigate)`, so that rejection skipped the navigation and a tapped
    // notification did nothing at all. Focus is a nicety; arriving on the right screen is
    // the whole feature, so it must not depend on the nicety succeeding.
    const worker = bootWorker('parent', [`${SCOPE}#/payments`], { focusRefuses: true })

    await worker.deliver('notificationclick', {
      notification: { close() {}, data: { url: '#/student/s-7' } },
    })

    expect(worker.windows[0]?.navigatedTo).toBe(`${SCOPE}#/student/s-7`)
    expect(worker.opened, 'a second window was opened instead of reusing the one open').toEqual([])
  })

  it('opens a window when the app is not running', async () => {
    const worker = bootWorker('parent')

    await worker.deliver('notificationclick', {
      notification: { close() {}, data: { url: '#/announcements' } },
    })

    expect(worker.opened).toEqual([`${SCOPE}#/announcements`])
  })

  it('ignores a window belonging to a different app on the same device', async () => {
    // A coach who is also a parent has BOTH apps installed (§6.1), and they are separate
    // origins. Focusing the wrong one would show the wrong person's screen.
    const worker = bootWorker('parent', ['https://other.example.invalid/#/'])

    await worker.deliver('notificationclick', {
      notification: { close() {}, data: { url: '#/announcements' } },
    })

    expect(worker.windows[0]?.focused).toBe(false)
    expect(worker.opened).toEqual([`${SCOPE}#/announcements`])
  })
})

describe('a rotated subscription', () => {
  it('re-subscribes with the key the old subscription was made with', async () => {
    // The worker cannot tell our server (it holds no access token — see the handler). All it
    // can do is keep a live subscription in the browser for the page to find and re-post.
    const worker = bootWorker('parent')

    await worker.deliver('pushsubscriptionchange', {
      oldSubscription: { options: { applicationServerKey: 'KEY-BYTES' } },
    })

    expect(worker.subscribed).toEqual([{ userVisibleOnly: true, applicationServerKey: 'KEY-BYTES' }])
  })

  it('does not throw when the browser gives it nothing to re-subscribe with', async () => {
    const worker = bootWorker('parent')

    await worker.deliver('pushsubscriptionchange', {})

    expect(worker.subscribed).toEqual([])
  })
})

describe('the route table', () => {
  // The claim in tools/push-sw.mjs is that every route was read off the app's own router.
  // Unchecked, a renamed screen turns every notification of that kind into a tap that opens
  // the home screen — which is indistinguishable from the notification being broken.
  const apps: PushApp[] = ['parent', 'staff']
  for (const app of apps) {
    it(`names only routes the ${app} app's hash router actually matches`, () => {
      const router = readFileSync(resolve(WEB, `apps/${app}/src/App.tsx`), 'utf-8')
      const { routes, fallback } = PUSH_ROUTING[app]
      for (const template of [...Object.values(routes), fallback]) {
        // `#/student/:student_id` is matched by the router as the prefix `#/student/`.
        const literal = template.includes('/:') ? `${template.split('/:')[0]}/` : template
        if (literal === '#/') continue // every router treats the bare hash as home
        expect(router, `${app}: ${template}`).toContain(`'${literal}`)
      }
    })
  }
})
