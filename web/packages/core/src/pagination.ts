/**
 * G16 / SPEC §8.3 — "Every list endpoint is cursor-paginated."
 *
 * The client half of `app/schemas/_pagination.py`. The field names are the wire names
 * (`next_cursor`, `has_more`, snake_case) on purpose: the generated `api-client` type and
 * this helper's type are then the *same* type, and no call site has to map between two
 * spellings of the same page.
 *
 * **Why a cursor rather than an offset**, restated here because it is what `appendPage`'s
 * dedupe exists for: §5.14's rosters and §5.10's charge lists are written to while they are
 * being read. A coach marks attendance during the same minute a manager pages through the
 * register, rows shift under the read, and `LIMIT/OFFSET` responds by skipping or repeating
 * them. A keyset cursor names a position instead of a count, so it cannot skip — but a row
 * can still arrive in two pages if it moved, and rendering the same student twice on a
 * roster is worse than an off-by-one. Hence the dedupe.
 *
 * **This module never reorders.** The server sorts (by belt rank, by due date, by name);
 * the client only concatenates. Sorting here would silently replace the server's order
 * with id order.
 */

/** Mirrors `CursorPage[T]` in `app/schemas/_pagination.py`. */
export interface CursorPage<T> {
  items: T[]
  next_cursor: string | null
  has_more: boolean
}

/** Anything with a stable identity. Every §4.3 row has a UUID `id`. */
interface Identified {
  id: string
}

/**
 * Whether to offer a "load more" affordance.
 *
 * Reads `has_more` rather than inferring it from `next_cursor != null`. The server carries
 * both explicitly because an infinite scroll needs to decide whether to render a spinner
 * *before* it has decided what to request next.
 */
export function hasNextPage<T>(page: CursorPage<T>): boolean {
  return page.has_more
}

/**
 * Concatenate `next` onto `previous`, dropping any row that appears in both.
 *
 * The later page wins on a collision: it is the fresher read, so a student renamed between
 * the two requests renders under the new name. Order follows first appearance, so the
 * server's sort survives.
 */
export function appendPage<T extends Identified>(
  previous: CursorPage<T>,
  next: CursorPage<T>,
): CursorPage<T> {
  const byId = new Map<string, T>()
  const order: string[] = []

  for (const item of [...previous.items, ...next.items]) {
    if (!byId.has(item.id)) {
      order.push(item.id)
    }
    // Set unconditionally: last write wins, so the fresher page's copy is kept, while
    // `order` preserves the position of the first appearance.
    byId.set(item.id, item)
  }

  return {
    items: order.map((id) => byId.get(id) as T),
    next_cursor: next.next_cursor,
    has_more: next.has_more,
  }
}

/**
 * Fold a whole sequence of pages into one.
 *
 * An empty sequence returns an empty page rather than throwing: "no pages fetched yet" is
 * the initial state of every list screen in the product, not an error.
 */
export function mergeCursorPages<T extends Identified>(
  pages: readonly CursorPage<T>[],
): CursorPage<T> {
  const empty: CursorPage<T> = { items: [], next_cursor: null, has_more: false }
  return pages.reduce(appendPage, empty)
}
