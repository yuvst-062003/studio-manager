// Where "I greeted this child" lives — the one piece of state this checkpoint's birthday
// section owns.
//
// **Plain `localStorage`, not `@studio/core`'s offline store.** §10's `OfflineStore` is a
// real IndexedDB database with a fixed `TableName` union and a version number
// (`store.ts`'s `DB_VERSION`) that lane ATTENDANCE (M5) owns; adding a table means bumping
// that version for every coach's device, the same way `timer_presets` did. A birthday tick
// does not need what that machinery buys: it is not part of the two-day session cache
// (`cache.ts`'s `EVICTABLE` list), nothing needs to sync it to the server, and it does not
// have to survive `discardCache()`'s "device offline a week" reset the way `pending_ops`
// must. It only has to survive an ordinary reload, which `localStorage` already does. A
// second table added to a shared, versioned database for a courtesy checkbox would be the
// wrong tool for what this is.
//
// **Keyed by student AND the specific birthday year**, not by student alone — a greeting
// ticked for this year's birthday must not silently hide the same child's row next year.
// `useBirthdays.ts` builds that composite key from `BirthdayRow.occursYear`.
//
// **Namespaced per signed-in person.** A studio's coaches often share one device at the
// front desk; without this, one coach's tick would read as "already greeted" to the next
// coach who opens the same tab, which is a false claim exactly like the one §4.9's rule 2
// already forbids for WhatsApp "sent" toasts — this is a *local* claim ("I marked it"),
// and it must stay local to the person who made it.
const STORAGE_PREFIX = 'studio-manager.staff.birthdayGreetings.'

function storageKey(personKey: string): string {
  return `${STORAGE_PREFIX}${personKey}`
}

/** Every read and write is wrapped: private browsing, a full quota, or a disabled storage
 *  API must never throw out of a render — the honest fallback is "nothing marked greeted
 *  yet", not a broken screen. */
function readIds(personKey: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(personKey))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeIds(personKey: string, ids: string[]): void {
  try {
    globalThis.localStorage?.setItem(storageKey(personKey), JSON.stringify(ids))
  } catch {
    // A failed write leaves the tick optimistic-only for this tab — acceptable for a
    // courtesy reminder, and nothing here surfaces storage failure as a user-facing error.
  }
}

/** `studentId:occursYear` — see this file's own header for why the year is part of it. */
export function greetedKey(studentId: string, occursYear: number): string {
  return `${studentId}:${occursYear}`
}

export function loadGreeted(personKey: string): Set<string> {
  return new Set(readIds(personKey))
}

/** Toggles one key and persists the result, returning the new set so a caller can setState
 *  with it directly rather than re-reading storage. */
export function toggleGreeted(personKey: string, key: string): Set<string> {
  const current = loadGreeted(personKey)
  if (current.has(key)) {
    current.delete(key)
  } else {
    current.add(key)
  }
  writeIds(personKey, [...current])
  return current
}
