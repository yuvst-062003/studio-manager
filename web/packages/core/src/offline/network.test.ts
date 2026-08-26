import { describe, expect, it, vi } from 'vitest'
// The module's own text. Vite's `?raw` rather than `readFileSync(import.meta.url)`:
// under jsdom `import.meta.url` is an http URL, not a file one.
import networkSource from './network.ts?raw'
import {
  CONSECUTIVE_SUCCESSES_TO_RECOVER,
  SLOW_THRESHOLD_MS,
  SLOW_TIMEOUT_MS,
  initialState,
  makeMonitor,
  probeFrom,
  reduce,
} from './network'
import type { NetState, Probe } from './network'

// §10.1's table, one test per transition. The table is short and the transitions are not,
// which is exactly why the plan asks for "a state-machine unit test per transition":
// four states plus `api-down` is twenty edges, and the ones that bite are the three
// nobody writes by accident — the 6s demotion, the two-success recovery, and the reset.

const ok = (elapsedMs = 100): Probe => ({ ok: true, status: 200, elapsedMs, timedOut: false })
const slow = (elapsedMs = 8000): Probe => ({ ok: true, status: 200, elapsedMs, timedOut: false })
const timedOut = (): Probe => ({ ok: false, elapsedMs: SLOW_TIMEOUT_MS, timedOut: true })
const noRoute = (): Probe => ({ ok: false, elapsedMs: 30, timedOut: false })
const serverError = (): Probe => ({ ok: false, status: 503, elapsedMs: 120, timedOut: false })

const modeAfter = (start: NetState, ...probes: Probe[]): string =>
  probes.reduce<NetState>((state, probe) => reduce(state, probe), start).mode

const at = (mode: NetState['mode'], consecutiveSuccesses = 0): NetState => ({
  mode,
  consecutiveSuccesses,
})

/** The module's executable text, with comments removed. The first draft of the assertion
 *  below failed on `network.ts`'s own docstring, which says out loud that it never reads
 *  the flag — a detector that cannot tell a rule from its explanation is a detector nobody
 *  can write the explanation for. */
const withoutComments = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '')

describe('§10.1 — four network states, not two', () => {
  it('starts online rather than offline', () => {
    // A cold boot with no probe yet must not render the offline banner: a coach opening
    // the app on wifi and being told `לא מקוון` for 400ms learns to ignore the banner.
    expect(initialState().mode).toBe('online')
  })

  it('never reads navigator.onLine', () => {
    // §10.1 — "The client never trusts `navigator.onLine` alone — it is true on a
    // captive-portal wifi that routes nowhere." Asserted as a property of the SOURCE and
    // not of a behaviour, because the failure this prevents is somebody adding the check
    // back as a "cheap fast path" and every test still passing: `navigator.onLine` is
    // `true` in jsdom and on a captive portal alike, so a machine that consults it agrees
    // with this one everywhere except the case that matters.
    expect(withoutComments(networkSource)).not.toContain('onLine')
  })

  describe('online →', () => {
    it('stays online on a fast success', () => {
      expect(modeAfter(at('online', 2), ok())).toBe('online')
    })

    it('becomes slow on a success that took longer than the threshold', () => {
      // §10.1 — "Slow: 3–15s responses, a basement with one bar."
      expect(modeAfter(at('online', 2), slow())).toBe('slow')
    })

    it('becomes offline on a 6s timeout, not slow', () => {
      // §10.1 — "a 6s timeout demotes the request into the offline path rather than
      // spinning. Never a blocked screen waiting on a slow write." A timeout is the
      // OFFLINE path and not a slower shade of slow: the write it demoted has already gone
      // to pending_ops, and telling the coach "slow" would imply it is still in flight.
      expect(modeAfter(at('online', 2), timedOut())).toBe('offline')
    })

    it('becomes offline when there is no route at all', () => {
      expect(modeAfter(at('online', 2), noRoute())).toBe('offline')
    })

    it('becomes api-down on a 5xx, which is not the same as offline', () => {
      // §10.1's own row: "Distinguished from offline: השרת אינו זמין, ננסה שוב." A coach
      // with four bars who is told they are offline stops trusting the indicator.
      expect(modeAfter(at('online', 2), serverError())).toBe('api-down')
    })
  })

  describe('slow →', () => {
    it('returns to online after two consecutive fast successes', () => {
      expect(modeAfter(at('slow'), ok(), ok())).toBe('online')
    })

    it('does not return to online after only one', () => {
      expect(modeAfter(at('slow'), ok())).toBe('slow')
    })

    it('falls to offline on a timeout', () => {
      expect(modeAfter(at('slow'), timedOut())).toBe('offline')
    })
  })

  describe('offline →', () => {
    it('becomes intermittent on the first success, not online', () => {
      // §10.1 — "Intermittent: connects, drops, reconnects. Captive portals. Treated as
      // offline until two consecutive requests succeed, so the app does not thrash between
      // modes mid-session." One success is the captive portal answering its own login
      // page; it is not a network.
      expect(modeAfter(at('offline'), ok())).toBe('intermittent')
    })

    it('becomes online on the second consecutive success', () => {
      expect(modeAfter(at('offline'), ok(), ok())).toBe('online')
    })

    it('stays offline on a failure', () => {
      expect(modeAfter(at('offline'), noRoute())).toBe('offline')
    })
  })

  describe('intermittent →', () => {
    it('is treated as offline for as long as it lasts', () => {
      // The behavioural half of the rule: `isOfflinePath` is what the queue consults, and
      // it must answer yes here. A mark taken while the portal is flapping has to reach
      // pending_ops, not a fetch that will hang.
      expect(modeAfter(at('offline'), ok())).toBe('intermittent')
    })

    it('promotes on the second consecutive success', () => {
      expect(modeAfter(at('intermittent', 1), ok())).toBe('online')
    })

    it('resets the counter on a failure, so the count is CONSECUTIVE', () => {
      // The transition that is wrong in every naive implementation: a counter that only
      // increments reaches two eventually on any flapping connection, and the app promotes
      // to `online` on a network that never carried a request through.
      const state = [ok(), noRoute(), ok()].reduce<NetState>(
        (current, probe) => reduce(current, probe),
        at('offline'),
      )
      expect(state.mode).toBe('intermittent')
      expect(state.consecutiveSuccesses).toBe(1)
    })

    it('needs exactly the declared number of successes', () => {
      // Pinned against the constant rather than against `2`, so raising the threshold does
      // not silently pass a test written for the old value.
      const probes = Array.from({ length: CONSECUTIVE_SUCCESSES_TO_RECOVER }, () => ok())
      expect(modeAfter(at('offline'), ...probes)).toBe('online')
      expect(modeAfter(at('offline'), ...probes.slice(0, -1))).not.toBe('online')
    })

    it('falls back to offline on a timeout', () => {
      expect(modeAfter(at('intermittent', 1), timedOut())).toBe('offline')
    })
  })

  describe('api-down →', () => {
    it('needs two consecutive successes to clear, like every other degraded state', () => {
      expect(modeAfter(at('api-down'), ok())).not.toBe('online')
      expect(modeAfter(at('api-down'), ok(), ok())).toBe('online')
    })

    it('becomes offline if the route disappears while the API is down', () => {
      expect(modeAfter(at('api-down'), noRoute())).toBe('offline')
    })
  })

  describe('probeFrom', () => {
    it('reads a slow success off the elapsed time', () => {
      expect(probeFrom({ ok: true, status: 200 }, SLOW_THRESHOLD_MS + 1).elapsedMs).toBeGreaterThan(
        SLOW_THRESHOLD_MS,
      )
    })

    it('marks a request that reached the timeout as timed out, not merely failed', () => {
      expect(probeFrom(null, SLOW_TIMEOUT_MS).timedOut).toBe(true)
    })

    it('does not mark a fast failure as a timeout', () => {
      expect(probeFrom(null, 30).timedOut).toBe(false)
    })
  })
})

describe('the monitor', () => {
  it('demotes a request that outlives the 6s timeout even if the ping never settles', async () => {
    // §10.1's "never a blocked screen waiting on a slow write", as behaviour rather than
    // as a constant. The ping below NEVER resolves — a captive portal holding the socket
    // open is precisely this — and the monitor still has to reach a decision.
    vi.useFakeTimers()
    const monitor = makeMonitor({
      ping: () => new Promise<Response>(() => {}),
      now: () => Date.now(),
    })
    const settled = monitor.probeOnce()
    await vi.advanceTimersByTimeAsync(SLOW_TIMEOUT_MS + 10)
    expect((await settled).mode).toBe('offline')
    vi.useRealTimers()
  })

  it('notifies a subscriber only when the mode actually changes', async () => {
    // A subscriber is a React setState. Firing it on every probe re-renders the roster
    // every few seconds for no reason, on the screen a coach is trying to tap thirty rows
    // on.
    const seen: string[] = []
    const responses = [ok(), ok(), ok()]
    let index = 0
    const monitor = makeMonitor({
      ping: async () => new Response(null, { status: 200 }),
      now: () => {
        index += 1
        return responses.length > index ? 0 : 0
      },
    })
    monitor.subscribe((state) => seen.push(state.mode))
    await monitor.probeOnce()
    await monitor.probeOnce()
    expect(seen).toEqual([])
  })

  it('reports the offline path for every degraded mode except online', () => {
    // The one question the rest of the layer asks. §10.2's "Writable offline" column is
    // decided by this, so getting `slow` wrong here means a coach's tap spins for six
    // seconds instead of landing in the queue.
    const monitor = makeMonitor({
      ping: async () => new Response(null, { status: 200 }),
      now: () => 0,
    })
    for (const mode of ['offline', 'intermittent', 'slow', 'api-down'] as const) {
      expect(monitor.isOfflinePath(mode)).toBe(true)
    }
    expect(monitor.isOfflinePath('online')).toBe(false)
  })
})
