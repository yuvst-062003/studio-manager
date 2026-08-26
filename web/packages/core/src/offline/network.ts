// §10.1 — four network states, not two.
//
// **`navigator.onLine` appears nowhere in this file, and `network.test.ts` asserts that by
// reading the source.** §10.1: "The client never trusts `navigator.onLine` alone — it is
// true on a captive-portal wifi that routes nowhere." A behavioural test cannot catch its
// return: in jsdom and on a captive portal alike the flag is `true`, so a machine that
// consults it agrees with this one everywhere except the one case the rule exists for.
//
// Mode is derived from **request outcomes against a lightweight ping**, which is the only
// evidence that distinguishes "there is a network" from "there is a network that carries
// our requests".
//
// The two transitions that are wrong in every naive implementation:
//
//   * a **6s timeout is the offline path**, not a slower shade of slow. The write it
//     demoted has already gone to `pending_ops`; telling the coach "slow" implies it is
//     still in flight.
//   * recovery needs **two consecutive** successes, and a failure resets the count to
//     zero. A counter that only ever increments reaches two on any flapping connection,
//     and the app promotes itself to `online` on a network that never carried a request
//     through.
import type { NetworkMode } from './types'

export type { NetworkMode }

/** §10.1 — "a 6s timeout demotes the request into the offline path rather than spinning." */
export const SLOW_TIMEOUT_MS = 6000

/** §10.1 — "Slow: 3–15s responses, a basement with one bar." The lower bound: anything
 *  above this and below the timeout is a real response that took too long to wait on. */
export const SLOW_THRESHOLD_MS = 3000

/** §10.1 — "Treated as offline until two consecutive requests succeed, so the app does not
 *  thrash between modes mid-session." */
export const CONSECUTIVE_SUCCESSES_TO_RECOVER = 2

/** How often the monitor probes when it is not being driven by real traffic. Deliberately
 *  not aggressive: the probe is a fallback for an idle app, and every real request already
 *  feeds `reduce` through `observe`. */
export const PROBE_INTERVAL_MS = 15_000

/**
 * The outcome of one request, as the machine sees it.
 *
 * `timedOut` is separate from `ok: false` because §10.1 gives them different destinations:
 * a fast failure is "no route" and a timeout is "we waited six seconds and stopped", and
 * only the second is a statement about a network that is *there*.
 */
export type Probe = {
  ok: boolean
  status?: number
  elapsedMs: number
  timedOut: boolean
}

export type NetState = {
  mode: NetworkMode
  /** Reset to zero by any failure. That reset is the whole meaning of "consecutive". */
  consecutiveSuccesses: number
}

export function initialState(): NetState {
  // Optimistic, deliberately. A cold boot has no evidence either way, and rendering
  // `לא מקוון` for the 400ms before the first probe teaches a coach to ignore the banner.
  return { mode: 'online', consecutiveSuccesses: CONSECUTIVE_SUCCESSES_TO_RECOVER }
}

/** Every mode except `online` routes writes through the queue (§10.2's "Writable offline"
 *  column). `slow` is in the list because §10.1 says a slow write must never block a
 *  screen — the tap lands in `pending_ops` and the flusher deals with the network. */
export function isOfflinePath(mode: NetworkMode): boolean {
  return mode !== 'online'
}

/**
 * The whole machine.
 *
 * A pure reducer rather than a class with fields, so `network.test.ts` can state each of
 * §10.1's transitions as one line and so a future mode is a branch here rather than a new
 * object graph.
 */
export function reduce(state: NetState, probe: Probe): NetState {
  if (!probe.ok) {
    // A 5xx is the API, not the network. §10.1 gives it its own row precisely so the app
    // says `השרת אינו זמין, ננסה שוב` instead of claiming a phone with four bars is
    // offline — and a coach told the wrong thing once stops reading the indicator.
    //
    // A TIMEOUT is not an api-down signal even if the server is what is slow: from the
    // device's side, six seconds with no answer is indistinguishable from no route, and
    // §10.1 sends both down the offline path.
    const isServerFault = !probe.timedOut && probe.status !== undefined && probe.status >= 500
    return { mode: isServerFault ? 'api-down' : 'offline', consecutiveSuccesses: 0 }
  }

  const successes = state.consecutiveSuccesses + 1

  if (probe.elapsedMs >= SLOW_THRESHOLD_MS) {
    // A slow success is still a success, but it must not count toward recovery: two slow
    // responses in a row are a basement, not a recovered network.
    return { mode: 'slow', consecutiveSuccesses: 0 }
  }

  if (state.mode === 'online') {
    return { mode: 'online', consecutiveSuccesses: successes }
  }

  if (successes >= CONSECUTIVE_SUCCESSES_TO_RECOVER) {
    return { mode: 'online', consecutiveSuccesses: successes }
  }

  // One success is not a network. On a captive portal it is the portal answering its own
  // login page, which is exactly the case §10.1 names. `slow` and `api-down` hold their own
  // identity while they wait for the second success; `offline` becomes `intermittent`,
  // because a connection that just answered once is by definition flapping rather than
  // absent — and §10.1 says intermittent is *treated as* offline, which `isOfflinePath`
  // is what enforces.
  return {
    mode: state.mode === 'offline' ? 'intermittent' : state.mode,
    consecutiveSuccesses: successes,
  }
}

/**
 * Turn a settled (or unsettled) request into a `Probe`.
 *
 * `response === null` means it never arrived. Whether that is a timeout is decided by the
 * elapsed time against `SLOW_TIMEOUT_MS`, rather than by which branch of a `try` we are in:
 * an aborted fetch and a `TypeError: Failed to fetch` are the same fact to a coach, and
 * only the clock separates "no route" from "we stopped waiting".
 */
export function probeFrom(
  response: { ok: boolean; status: number } | null,
  elapsedMs: number,
): Probe {
  if (response === null) {
    return { ok: false, elapsedMs, timedOut: elapsedMs >= SLOW_TIMEOUT_MS }
  }
  return { ok: response.ok, status: response.status, elapsedMs, timedOut: false }
}

export type NetworkMonitor = {
  state: () => NetState
  /** Feed a real request's outcome in. Every fetch the app makes is evidence, and evidence
   *  is cheaper and more honest than a synthetic ping. */
  observe: (probe: Probe) => NetState
  /** Run the lightweight ping once and fold the result in. */
  probeOnce: () => Promise<NetState>
  start: () => () => void
  subscribe: (listener: (state: NetState) => void) => () => void
  isOfflinePath: (mode?: NetworkMode) => boolean
}

/**
 * The monitor: a `NetState`, a ping, and a subscriber list.
 *
 * `ping` and `now` are injected because §10.1's rules are about *time*, and a module that
 * read `Date.now()` and `fetch` directly could only be tested by waiting six real seconds.
 */
export function makeMonitor(deps: {
  ping: () => Promise<Response>
  now: () => number
  /** Injected so the dev bar's `📴 offline` toggle (§19.4) can pin a mode without
   *  monkey-patching fetch. Returning a mode overrides everything the probes say. */
  forced?: () => NetworkMode | null
}): NetworkMonitor {
  let state = initialState()
  const listeners = new Set<(next: NetState) => void>()

  const commit = (next: NetState): NetState => {
    const changed = next.mode !== state.mode
    state = next
    // Only on an actual mode change. A subscriber is a React `setState`, and firing it on
    // every probe re-renders the roster every fifteen seconds on the screen a coach is
    // trying to tap thirty rows on.
    if (changed) for (const listener of listeners) listener(state)
    return state
  }

  const observe = (probe: Probe): NetState => {
    const forced = deps.forced?.() ?? null
    if (forced !== null) return commit({ mode: forced, consecutiveSuccesses: 0 })
    return commit(reduce(state, probe))
  }

  const probeOnce = async (): Promise<NetState> => {
    const started = deps.now()
    // `Promise.race` against a timer rather than `AbortSignal.timeout`: the point of §10.1
    // is that the app STOPS WAITING at six seconds, and an abort still leaves the caller
    // waiting for the abort to propagate through whatever the platform does with a socket a
    // captive portal is holding open.
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), SLOW_TIMEOUT_MS)
    })
    try {
      const response = await Promise.race([
        deps.ping().then(
          (r) => ({ ok: r.ok, status: r.status }),
          () => null,
        ),
        timeout,
      ])
      const elapsed = Math.max(deps.now() - started, response === null ? SLOW_TIMEOUT_MS : 0)
      return observe(probeFrom(response, elapsed))
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  return {
    state: () => state,
    observe,
    probeOnce,
    start: () => {
      const handle = setInterval(() => void probeOnce(), PROBE_INTERVAL_MS)
      return () => clearInterval(handle)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isOfflinePath: (mode) => isOfflinePath(mode ?? state.mode),
  }
}
