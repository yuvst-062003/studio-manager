// §10.3's queue, drained.
//
// **`flush` was built, unit-tested, exported — and called by nobody.** `sync.ts` handles
// the whole replay: one request per session rather than one per tap, a token refresh when
// the fifteen-minute access token has expired mid-register, `client_mark_id` idempotency so
// a repeat is a no-op, and §10.5's conflict cards for marks another coach owns. All of it
// reachable only through `flushNow`, and `grep -rn flushNow web/apps web/packages` returned
// its own definition and its own export line.
//
// So every mark a coach took went into `pending_ops` and stayed there. The badge counted
// up, the roster looked right, and the register never reached the server. §17.1 calls
// offline-first attendance the feature "that decides whether coaches use the app at all",
// and it was write-only.
//
// The policy lives in the app rather than in `packages/core` deliberately: WHEN to sync is
// a product decision — the parent app has no queue and the dashboard has no business
// draining one — and core already offers the mechanism. `queueMark`'s own comment says
// "`flush` drains the queue whenever the network allows", which is the sentence this file
// makes true.
import { useEffect } from 'react'
import { apiFetch, flushNow, refresh, usePendingCount } from '@studio/core'

/** §10.1's recovery probe interval. Long enough not to hammer a bad connection, short
 *  enough that a coach who walks upstairs does not stand there watching a badge. */
const RETRY_MS = 15_000

export function useQueueFlusher(currentPersonId: string | null): void {
  // Writes to `pending_ops` bump a version every subscriber re-reads, so this is the
  // queue telling the flusher it has something — rather than the flusher finding out on
  // its next tick. Without it a mark taken on a working connection still waited for the
  // timer, and a coach watching the dashboard wondered why their register was empty.
  const pending = usePendingCount()

  useEffect(() => {
    let alive = true

    const drain = () => {
      if (!alive) return
      void flushNow({
        post: (path, body) =>
          apiFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        // §10.3 item 3 — a device offline for over a month comes back with a refresh token
        // that has expired too. `flush` treats `false` as "defer, do not discard".
        refresh: async () => {
          // `refresh()` answers with the new session, or `null`/`false` when the
          // refresh token is gone. `flush` wants the boolean, and the distinction it
          // cares about is only 'may I retry'.
          try {
            return Boolean(await refresh())
          } catch {
            return false
          }
        },
        // Read at flush time, not captured: §19.4's persona switcher changes who is signed
        // in without a reload, and §10.5 partitions the queue by owner. A stale answer here
        // would replay one coach's marks as another's.
        currentPersonId: () => currentPersonId,
      }).catch(() => undefined)
    }

    // Four triggers, because one is never enough. The queue's own version covers a mark
    // just taken; `online` fires when the OS says a network exists, which §10.1 is explicit
    // is not the same as the API being reachable; the timer covers the case where it lied;
    // and the mount covers a queue left behind by a previous launch.
    drain()
    globalThis.addEventListener('online', drain)
    const timer = globalThis.setInterval(drain, RETRY_MS)

    return () => {
      alive = false
      globalThis.removeEventListener('online', drain)
      globalThis.clearInterval(timer)
    }
  }, [currentPersonId, pending])
}
