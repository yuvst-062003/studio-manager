// §6.5's blocking warning, and the trade it is managing.
//
// §10.6 requires `pending_ops` to be exempt from eviction under all circumstances. §6.5 is
// honest that the platform cannot promise that:
//
//   "A home-screen web app on iOS is exempt from Safari's 7-day script-storage cap, but iOS
//   may still evict under storage pressure — a guarantee a native container would have
//   given. Coaches are a small, known group, so this is managed rather than engineered
//   around: the staff app requires standalone mode, calls `navigator.storage.persist()`,
//   and shows a **blocking** warning when unsynced work has been queued for more than one
//   session."
//
// **Blocking, not advisory, and that word is the whole design.** A banner a coach can
// scroll past is not managing the trade; it is noticing it. The only thing that reliably
// converts "your marks may be lost" into "your marks were not lost" is a person walking to
// somewhere with signal, and a dismissible notice does not cause that.
//
// The threshold is a day rather than a lesson: a coach who teaches at 17:00 and syncs the
// next morning is normal, and a warning that fired every evening would be ignored by the
// end of the first week — at which point the real one is invisible too.
import { listPending, oldestQueuedAt, pendingCount } from './pendingOps'
import type { OfflineStore } from './types'

/** "More than one session" (§6.5), read as more than a day. See the module docstring for
 *  why it is not the literal ninety minutes. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export type StaleQueueWarning = {
  /** §6.5's word. The caller renders this **instead of** the app, not above it. */
  blocking: boolean
  count: number
  oldestQueuedAt: string | null
}

export async function staleQueueWarning(
  store: OfflineStore,
  nowIso: string,
): Promise<StaleQueueWarning> {
  const oldest = await oldestQueuedAt(store)
  if (oldest === null) return { blocking: false, count: 0, oldestQueuedAt: null }
  return {
    // Measured from the OLDEST op. A device that has been queuing for three days and took a
    // mark five minutes ago is still three days behind; reading the newest would silence
    // the warning permanently on exactly the device that most needs it.
    blocking: Date.parse(nowIso) - Date.parse(oldest) > STALE_AFTER_MS,
    count: await pendingCount(store),
    oldestQueuedAt: oldest,
  }
}

/** What the queue-detail sheet lists when a coach taps `{{count}} סימונים ממתינים לסנכרון`.
 *  §10.6 item 7: "A visible badge always shows outstanding queue depth, tappable for
 *  detail." Re-exported here so a screen showing the warning and a screen showing the list
 *  import from one place. */
export { listPending as queuedOperations }
