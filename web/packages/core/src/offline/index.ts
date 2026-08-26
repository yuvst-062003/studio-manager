// §10's offline layer. Owned by lane ATTENDANCE (M5) — the only lane in the plan that owns
// anything under `web/packages/core`.
//
// Re-exported from `../index.ts` so an app writes `from '@studio/core'` like every other
// helper. The sub-barrel exists so this directory has one door: `queueMark` below is the
// only way a lane writes to `pending_ops`, and a lane reaching past it into `pendingOps.ts`
// would be a lane that could forget `queueChanged()` and leave the badge stuck.
export { memoryStore, indexedDbStore } from './store'
export {
  CONSECUTIVE_SUCCESSES_TO_RECOVER,
  PROBE_INTERVAL_MS,
  SLOW_THRESHOLD_MS,
  SLOW_TIMEOUT_MS,
  initialState,
  isOfflinePath,
  makeMonitor,
  probeFrom,
  reduce,
} from './network'
export type { NetState, NetworkMonitor, Probe } from './network'
export {
  enqueue,
  listPending,
  markSynced,
  oldestQueuedAt,
  pendingCount,
  recordAttempt,
} from './pendingOps'
export {
  CACHE_WINDOW_DAYS,
  cachedSessions,
  discardCache,
  evict,
  readRoster,
  readSession,
  watermark,
  writeWindow,
} from './cache'
export { dismissConflict, flush, listConflicts } from './sync'
export type { FlushDeps, FlushResult } from './sync'
export { PRIME_MAX_AGE_MS, needsPriming, primeOfflineCache, primeWindow } from './priming'
export type { PrimeState } from './priming'
export { STALE_AFTER_MS, staleQueueWarning } from './staleQueue'
export type { StaleQueueWarning } from './staleQueue'
export { forcedMode, onForcedModeChange, setForcedMode } from './devTools'
export {
  flushNow,
  networkMonitor,
  offlineStore,
  queueChanged,
  setOfflineStore,
  useConflicts,
  useNetworkMode,
  useNetworkMonitor,
  usePendingCount,
  useQueuedOperations,
  useStaleQueueWarning,
} from './useOffline'
export { queueMark } from './queueMark'
export type {
  BootstrapPayload,
  CachedSession,
  ConflictCard,
  ConflictKind,
  NetworkMode,
  OfflineStore,
  PendingOp,
  PendingOpKind,
  RosterRow,
  TableName,
} from './types'
