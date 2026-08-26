// §6.1's offline priming — the fetch first launch **blocks** on.
//
// "A coach whose very first session is in a basement with no signal must already have the
// roster. The first launch blocks on this fetch with a short progress indicator, and it
// re-runs on every foreground resume."
//
// Two things follow, and both are why `primeOfflineCache` returns a state rather than
// resolving quietly:
//
//   * a failure must be **distinguishable**. A prime that resolved either way would let the
//     app fall through to Today with an empty cache, which is the exact failure the
//     blocking exists to prevent.
//   * a failed re-prime must **leave the previous cache alone**. A foreground resume in a
//     lift must not empty a roster the coach is about to need.
import { STUDIO_TIMEZONE } from '../datetime'
import { requestPersistentStorage } from '../persistentStorage'
import { evict, watermark, writeWindow } from './cache'
import type { BootstrapPayload, OfflineStore } from './types'

/** §10.4 — "If the cached window is older than 24 hours the roster header shows
 *  `נתונים מ-<time>` and a refresh is attempted on every app open and foreground resume." */
export const PRIME_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PrimeState = 'idle' | 'priming' | 'ready' | 'failed'

/**
 * §6.1's window: **today and tomorrow**, in the studio's calendar.
 *
 * The studio's and not the device's. 22:30 UTC is already tomorrow in Jerusalem, so a
 * device computing its own "today" would fetch the wrong day — and a coach would reach
 * Today with an empty roster having watched a progress indicator that reported success.
 */
export function primeWindow(nowIso: string): { from: string; to: string } {
  const from = new Date(nowIso).toLocaleDateString('en-CA', { timeZone: STUDIO_TIMEZONE })
  const tomorrow = new Date(`${from}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return { from, to: tomorrow.toISOString().slice(0, 10) }
}

/**
 * Whether §6.1's blocking gate has to run.
 *
 * `true` for a store that has never been primed **and** for one whose window is older than
 * §10.4's 24 hours. The two are the same answer here and different screens above: a first
 * launch shows `priming.title`, a stale resume shows the roster with `stale.title` over it.
 */
export async function needsPriming(store: OfflineStore, nowIso: string): Promise<boolean> {
  const at = await watermark(store)
  if (at === null) return true
  return Date.parse(nowIso) - Date.parse(at) > PRIME_MAX_AGE_MS
}

export async function primeOfflineCache(deps: {
  store: OfflineStore
  getBootstrap: (window: { from: string; to: string }) => Promise<BootstrapPayload>
  now: () => string
}): Promise<PrimeState> {
  const nowIso = deps.now()
  // §6.5 — "the staff app requires standalone mode, calls `navigator.storage.persist()`,
  // and shows a blocking warning when unsynced work has been queued for more than one
  // session." The call belongs here because priming is the one moment guaranteed to happen
  // before any mark is ever taken, and a persist() requested after the first offline mark
  // is a persist() requested too late.
  //
  // Its result is deliberately not awaited into a decision: a refusal does not stop a coach
  // marking a register. M0's `requestPersistentStorage` records the answer for M8's
  // install report, which is where a refusal actually needs to be visible.
  void requestPersistentStorage()

  try {
    const payload = await deps.getBootstrap(primeWindow(nowIso))
    await writeWindow(deps.store, payload)
  } catch {
    // Nothing was written, so the previous window is exactly as it was. Reporting `failed`
    // rather than throwing keeps §6.1's gate a branch in the caller rather than an error
    // boundary around the whole app.
    return 'failed'
  }
  // Bounded on the way through. Without this a device resuming twice a day for a term
  // accumulates a term of rosters — and on iOS an oversized cache is precisely what creates
  // the storage pressure §6.5 warns can evict `pending_ops`.
  await evict(deps.store, nowIso)
  return 'ready'
}
