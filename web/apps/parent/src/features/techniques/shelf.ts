/** "My throws", and where a child starts each video.
 *
 * `localStorage`, per device, per browser. Deliberately NOT a server table for now: a
 * favourite is a preference, not a record the club needs, and a table would mean a
 * migration, an endpoint, a tenant column and a generated client for something whose
 * whole value is that it is instant. When it should follow a child to a new phone, this
 * module is the seam to move behind an API — nothing else in the feature reads the key.
 *
 * **Tokui-waza** (得意技) is judo's own word for the technique you make your own. It is
 * the right name for this list, and it is what the screen calls it.
 *
 * Every read and write is guarded. `localStorage` is not merely empty in a private
 * window or with site data blocked — the accessor itself throws, and an uncaught throw
 * here would take down the whole library over a saved favourite.
 */
const KEY = 'techniques-shelf:v1'

export type Shelf = {
  /** Slugs, in the order they were added. Order is the child's, not ours. */
  favourites: string[]
  /** Where this child wants each video to begin, in whole seconds. A demonstration often
   *  opens with a title card or a bow; the useful part starts later, and where that is
   *  differs per technique. Nobody has annotated the Kodokan's videos, so rather than
   *  invent timestamps we let the person watching set their own. */
  startAt: Record<string, number>
}

const EMPTY: Shelf = { favourites: [], startAt: {} }

export function loadShelf(): Shelf {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<Shelf>
    return {
      favourites: Array.isArray(parsed.favourites) ? parsed.favourites.filter((s) => typeof s === 'string') : [],
      startAt: typeof parsed.startAt === 'object' && parsed.startAt !== null ? parsed.startAt : {},
    }
  } catch {
    // Unreadable, unparseable, or storage denied. An empty shelf is always a correct
    // screen; a thrown error is never one.
    return EMPTY
  }
}

export function saveShelf(shelf: Shelf): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(shelf))
  } catch {
    // Quota, or a browser refusing site data. The screen keeps working from the state it
    // already holds — it just will not be there next time, which is a smaller failure
    // than refusing to star anything at all.
  }
}

export function toggleFavourite(shelf: Shelf, slug: string): Shelf {
  const favourites = shelf.favourites.includes(slug)
    ? shelf.favourites.filter((s) => s !== slug)
    : [...shelf.favourites, slug]
  return { ...shelf, favourites }
}

export function setStartAt(shelf: Shelf, slug: string, seconds: number | null): Shelf {
  const startAt = { ...shelf.startAt }
  // Zero is the default, not a saved preference — storing it would grow the key forever
  // with entries that change nothing.
  if (seconds === null || seconds <= 0) delete startAt[slug]
  else startAt[slug] = Math.floor(seconds)
  return { ...shelf, startAt }
}

/** `1:07`. Minutes and seconds, never a bare count — "67" is not a time to a child. */
export function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = Math.floor(total % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
