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
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { forcedMode, onForcedModeChange } from './devTools'
import { makeMonitor } from './network'
import type { NetState, NetworkMonitor } from './network'
import { listPending, pendingCount } from './pendingOps'
import { indexedDbStore } from './store'
import { staleQueueWarning } from './staleQueue'
import type { StaleQueueWarning } from './staleQueue'
import { dismissConflict, flush, listConflicts } from './sync'
import type { FlushDeps, FlushResult } from './sync'
import type { ConflictCard, NetworkMode, OfflineStore, PendingOp } from './types'

let store: OfflineStore | null = null
let monitor: NetworkMonitor | null = null

/** The device's store. Created once, lazily, so importing this module in a test that never
 *  renders does not open an IndexedDB connection. */
export function offlineStore(): OfflineStore {
  store ??= indexedDbStore()
  return store
}

/** Tests only — the same escape hatch `clearSlot` gives the slot registry. Module-level
 *  state outlives a test file without it. */
export function setOfflineStore(replacement: OfflineStore | null): void {
  store = replacement
  queueVersion += 1
  notifyQueue()
}

export function networkMonitor(): NetworkMonitor {
  monitor ??= makeMonitor({
    // A HEAD against the liveness probe. §10.1: "Mode is derived from actual request
    // outcomes against a lightweight ping" — `GET /api/v1/health` is core's, it touches no
    // studio data, and it is the one endpoint that answers the question being asked.
    ping: () => fetch('/api/v1/health', { method: 'HEAD', cache: 'no-store' }),
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

/** §6.5's blocking warning. `null` while it is still being read, so a caller can tell "we
 *  do not know yet" from "nothing is wrong" and not flash the block on every mount. */
export function useStaleQueueWarning(nowIso: string): StaleQueueWarning | null {
  const version = useQueueVersion()
  const [warning, setWarning] = useState<StaleQueueWarning | null>(null)
  useEffect(() => {
    let live = true
    void staleQueueWarning(offlineStore(), nowIso).then((next) => {
      if (live) setWarning(next)
    })
    return () => {
      live = false
    }
  }, [version, nowIso])
  return warning
}

/** Flush against the device's store, then tell everything that renders queue depth. */
export async function flushNow(deps: Omit<FlushDeps, 'store'>): Promise<FlushResult> {
  const result = await flush({ ...deps, store: offlineStore() })
  queueChanged()
  return result
}
