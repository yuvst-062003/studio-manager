// The React surface over §10's offline layer.
//
// Everything below this file is plain functions taking an `OfflineStore` — deliberately, so
// the rules are testable without a renderer. This module is the only place that knows about
// hooks, and it is thin on purpose: a rule that lived in a `useEffect` would be a rule no
// unit test could reach.
//
// **One shared store and one shared monitor per app.** Two `indexedDbStore()` instances are
// two IndexedDB connections over the same data, and two monitors are two ping loops
// disagreeing about the mode. `OfflineProvider` is not a context — it is a module-level
// singleton, because a coach's queue is a property of the *device*, not of a React subtree.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { apiUrl } from '../identity/session'
import { forcedMode, onForcedModeChange } from './devTools'
import { makeMonitor } from './network'
import type { NetState, NetworkMonitor } from './network'
import { listPending, pendingCount } from './pendingOps'
import { indexedDbStore, memoryStore } from './store'
import { staleQueueWarning } from './staleQueue'
import type { StaleQueueWarning } from './staleQueue'
import { dismissConflict, flush, listConflicts } from './sync'
import type { FlushDeps, FlushResult } from './sync'
import type { ConflictCard, NetworkMode, OfflineStore, PendingOp } from './types'

let store: OfflineStore | null = null
let monitor: NetworkMonitor | null = null
let durable = true

/**
 * The device's store. Created once, lazily, so importing this module in a test that never
 * renders does not open an IndexedDB connection.
 *
 * **Falls back to memory where IndexedDB does not exist**, and records that it did.
 * §10.6 wants `pending_ops` durable and an in-memory queue is not — but the alternative is
 * an exception thrown inside a tap handler on the mat, and §10.3 item 1 is absolute that a
 * local write never fails. So the mark still lands, and `offlineStorageIsDurable()` is how
 * the staff app knows to show §6.5's blocking warning immediately rather than after a day:
 * on this device, unsynced work really will not survive a reload.
 */
export function offlineStore(): OfflineStore {
  if (store === null) {
    if (globalThis.indexedDB === undefined) {
      durable = false
      store = memoryStore()
    } else {
      store = indexedDbStore()
    }
  }
  return store
}

/** Whether the queue is on durable storage. `false` means §6.5's warning applies from the
 *  first mark rather than after a day, because nothing here survives a reload. */
export function offlineStorageIsDurable(): boolean {
  return durable
}

/** Tests only — the same escape hatch `clearSlot` gives the slot registry. Module-level
 *  state outlives a test file without it. */
export function setOfflineStore(replacement: OfflineStore | null): void {
  store = replacement
  durable = true
  queueVersion += 1
  notifyQueue()
}

export function networkMonitor(): NetworkMonitor {
  monitor ??= makeMonitor({
    // A HEAD against the liveness probe. §10.1: "Mode is derived from actual request
    // outcomes against a lightweight ping" — `GET /api/v1/health` is core's, it touches no
    // studio data, and it is the one endpoint that answers the question being asked.
    ping: () => fetch(apiUrl('/api/v1/health'), { method: 'HEAD', cache: 'no-store' }),
    now: () => Date.now(),
    forced: forcedMode,
  })
  return monitor
}

/**
 * §10.1's mode, as a subscription.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the monitor is genuinely
 * external state, and the effect form tears — two components can render one frame apart
 * with different modes, which on this screen means the offline banner and the sync footer
 * disagreeing with each other.
 */
export function useNetworkMode(): NetworkMode {
  const instance = networkMonitor()
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const unsubscribeMonitor = instance.subscribe(() => onChange())
        const unsubscribeForced = onForcedModeChange(() => onChange())
        return () => {
          unsubscribeMonitor()
          unsubscribeForced()
        }
      },
      [instance],
    ),
    () => forcedMode() ?? instance.state().mode,
    () => 'online' as const,
  )
}

/** Start the probe loop for as long as a component is mounted. Mounted once, at the app
 *  shell — a second caller would be a second interval. */
export function useNetworkMonitor(): NetState {
  const instance = networkMonitor()
  const mode = useNetworkMode()
  useEffect(() => instance.start(), [instance])
  return { mode, consecutiveSuccesses: instance.state().consecutiveSuccesses }
}

// The queue has no natural change event — it is a store, not an emitter — so writes bump a
// version and subscribers re-read. Cheap, and it keeps `pendingOps.ts` free of React.
let queueVersion = 0
const queueListeners = new Set<() => void>()

function notifyQueue(): void {
  for (const listener of queueListeners) listener()
}

/** Call after any write to `pending_ops`. The one line a lane has to remember; everything
 *  that renders queue depth updates from it. */
export function queueChanged(): void {
  queueVersion += 1
  notifyQueue()
}

function useQueueVersion(): number {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => {
      queueListeners.add(onChange)
      return () => queueListeners.delete(onChange)
    }, []),
    () => queueVersion,
    () => 0,
  )
}

/** §10.6 item 7 — "A visible badge always shows outstanding queue depth". */
export function usePendingCount(): number {
  const version = useQueueVersion()
  const [count, setCount] = useState(0)
  useEffect(() => {
    let live = true
    void pendingCount(offlineStore()).then((next) => {
      if (live) setCount(next)
    })
    return () => {
      live = false
    }
  }, [version])
  return count
}

/** The detail behind the badge — "tappable to see what's queued" (§5.7). */
export function useQueuedOperations(): PendingOp[] {
  const version = useQueueVersion()
  const [ops, setOps] = useState<PendingOp[]>([])
  useEffect(() => {
    let live = true
    void listPending(offlineStore()).then((next) => {
      if (live) setOps(next)
    })
    return () => {
      live = false
    }
  }, [version])
  return ops
}

/** §10.5's cards, for the `alert-centre` slot this lane fills. */
export function useConflicts(): {
  cards: ConflictCard[]
  dismiss: (id: string) => Promise<void>
} {
  const version = useQueueVersion()
  const [cards, setCards] = useState<ConflictCard[]>([])
  useEffect(() => {
    let live = true
    void listConflicts(offlineStore()).then((next) => {
      if (live) setCards(next)
    })
    return () => {
      live = false
    }
  }, [version])
  return {
    cards,
    dismiss: async (id: string) => {
      await dismissConflict(offlineStore(), id)
      queueChanged()
    },
  }
}

/**
 * §6.5's blocking warning. `null` while it is still being read, so a caller can tell "we do
 * not know yet" from "nothing is wrong" and not flash the block on every mount.
 *
 * Takes the device **clock**, not an instant, and holds it in a ref rather than a
 * dependency. A caller writing `clock={() => new Date().toISOString()}` inline gives a new
 * function identity every render, and a function in the dependency array would re-run the
 * effect on each one — an effect loop on the screen a coach taps thirty times. The ref keeps
 * the latest clock without making it a trigger; the queue version is the only trigger, which
 * is also the only thing that can change the answer.
 */
export function useStaleQueueWarning(clock: () => string): StaleQueueWarning | null {
  const version = useQueueVersion()
  const clockRef = useRef(clock)
  // Written in an effect, not during render: react-hooks forbids touching `.current` while
  // rendering, and it is right to — a ref mutated in a render body is invisible to
  // concurrent rendering's bookkeeping. The effect below runs after, so the first read uses
  // the clock the hook was constructed with and every later one uses the latest.
  useEffect(() => {
    clockRef.current = clock
  }, [clock])
  const [warning, setWarning] = useState<StaleQueueWarning | null>(null)
  useEffect(() => {
    let live = true
    void staleQueueWarning(offlineStore(), clockRef.current()).then((next) => {
      if (live) setWarning(next)
    })
    return () => {
      live = false
    }
  }, [version])
  return warning
}

/** Flush against the device's store, then tell everything that renders queue depth. */
export async function flushNow(deps: Omit<FlushDeps, 'store'>): Promise<FlushResult> {
  const result = await flush({ ...deps, store: offlineStore() })
  queueChanged()
  return result
}
