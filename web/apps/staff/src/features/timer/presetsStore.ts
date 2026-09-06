// Where a coach's own presets live. §4.5: "Storage is IndexedDB, not `localStorage`, so it
// sits with the offline machinery already here. That is the one deliberate departure from
// the prototype's implementation" — the prototype keys `gladiator_custom_timer_templates`
// straight into `localStorage`; this reads and writes the `timer_presets` table through
// `@studio/core`'s `OfflineStore` port instead, the same port `pending_ops` and the
// session/roster cache already go through.
//
// `timer_presets` is NOT in `cache.ts`'s `EVICTABLE` list — see that table's own comment in
// `packages/core/src/offline/types.ts`. A coach's saved workouts are not part of the
// two-day session cache §10.6 bounds, and must survive both ordinary eviction and
// `discardCache()`'s "the device has been offline a week" reset exactly as `pending_ops`
// does.
import { offlineStore } from '@studio/core'
import type { OfflineStore } from '@studio/core'
import type { CustomTimerPreset } from './types'

const TABLE = 'timer_presets' as const

/** Every custom preset a coach has saved, oldest first.
 *
 * **Sorted on `createdAt`, not on the store's key order**, and that is a correction rather
 * than a preference. `OfflineStore.all` is key-sorted, and an earlier version of this file
 * relied on that — the comment here read "key order is creation order". It was not:
 *
 *   * `saveCustomPreset` appends a random suffix to the id (it has to; see below), so two
 *     presets saved in the same millisecond sort by that random suffix. The test asserting
 *     oldest-first passed or failed roughly one run in two, which is how this was found.
 *   * Key order is also LEXICOGRAPHIC, so `custom-1000…` would sort before `custom-999…`.
 *     Millisecond timestamps do not change digit count for another few centuries, so that
 *     one is theoretical — but it is the same mistake, and relying on a key's spelling to
 *     carry a meaning it never promised is what produced the first bug.
 *
 * `createdAt` is stored on every preset and is what "oldest" actually means. The id breaks
 * ties, so the order is total and stable rather than whatever the sort happened to do.
 *
 * `store` is injectable so a test never opens a real IndexedDB connection. */
export async function loadCustomPresets(store: OfflineStore = offlineStore()): Promise<CustomTimerPreset[]> {
  const rows = await store.all<CustomTimerPreset>(TABLE)
  return rows
    .map((row) => row.value)
    .sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1))
}

/** Save one preset — a coach's current work/rest/rounds/sets/prep/set-rest, named.
 *
 * The id is `custom-<timestamp>-<random>`, not the prototype's bare `custom-<timestamp>`:
 * the prototype appends to a plain `localStorage` array, where two saves in the same
 * millisecond are merely two entries that happen to share an `id` field. Here the
 * timestamp IS the store key (`OfflineStore.all` sorts by it for a stable save order), so
 * a bare millisecond collision — a coach double-tapping "save", or a fast test — would
 * silently overwrite one preset with another instead of keeping both. */
/** A millisecond clock that never repeats itself.
 *
 * `Date.now()` does: a coach double-tapping save, or a test saving twice in a row, gets the
 * same millisecond twice. That collided the store key (one preset silently overwrote the
 * other) and, once a random suffix fixed the key, it collided `createdAt` instead — leaving
 * "oldest first" decided by that random suffix. The ordering test then passed about one run
 * in two, which is worse than failing, because a suite that is green half the time teaches
 * people to re-run it.
 *
 * Advancing by one on a repeat costs nothing — a saved preset's `createdAt` may be a
 * millisecond later than the wall clock, which no one can perceive and nothing compares
 * against another source — and makes both the key and the order total. */
let lastStamp = 0
function monotonicNow(): number {
  const now = Date.now()
  lastStamp = now > lastStamp ? now : lastStamp + 1
  return lastStamp
}

export async function saveCustomPreset(
  preset: Omit<CustomTimerPreset, 'id' | 'isCustom' | 'createdAt'> & { name: string },
  store: OfflineStore = offlineStore(),
): Promise<CustomTimerPreset> {
  const stamp = monotonicNow()
  const saved: CustomTimerPreset = {
    ...preset,
    id: `custom-${stamp}`,
    isCustom: true,
    createdAt: new Date(stamp).toISOString(),
  }
  await store.put<CustomTimerPreset>(TABLE, saved.id, saved)
  return saved
}

/** Delete one custom preset. Built-ins are never passed here — the screen never offers a
 *  delete control for one, matching the prototype's own `deleteCustomTemplate`, which is
 *  only ever wired to a preset's own trash icon and that icon only renders `tmpl.isCustom`. */
export async function deleteCustomPreset(id: string, store: OfflineStore = offlineStore()): Promise<void> {
  await store.delete(TABLE, id)
}
