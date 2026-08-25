import { describe, expect, it } from 'vitest'
import { appendPage, hasNextPage, mergeCursorPages } from './pagination'
import type { CursorPage } from './pagination'

/**
 * G16 / SPEC §8.3 — "Every list endpoint is cursor-paginated."
 *
 * The shape mirrors `app/schemas/_pagination.py`'s `CursorPage`: `items`, `next_cursor`,
 * `has_more`. Keeping the field names identical to the wire format means the generated
 * client's type and this helper's type are the same type.
 */

type Row = { id: string; name: string }

const page = (items: Row[], next: string | null, more: boolean): CursorPage<Row> => ({
  items,
  next_cursor: next,
  has_more: more,
})

describe('appendPage', () => {
  it('appends the next page in order', () => {
    const first = page([{ id: 'a', name: 'Dana' }], 'a', true)
    const second = page([{ id: 'b', name: 'Yossi' }], null, false)
    expect(appendPage(first, second).items.map((r) => r.id)).toEqual(['a', 'b'])
  })

  /**
   * **The reason a cursor was chosen over an offset.** §5.14's rosters and §5.10's charge
   * lists are written to while they are being read — a coach marks attendance during the
   * same minute a manager pages through the register. A row that shifts across the page
   * boundary arrives twice, and rendering the same student twice on a roster is worse
   * than an off-by-one.
   */
  it('dedupes a row that arrives in two pages', () => {
    const first = page([{ id: 'a', name: 'Dana' }, { id: 'b', name: 'Yossi' }], 'b', true)
    const second = page([{ id: 'b', name: 'Yossi' }, { id: 'c', name: 'Noa' }], null, false)
    expect(appendPage(first, second).items.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps the newer copy of a duplicated row', () => {
    // The later page is the fresher read. A student renamed between the two requests
    // should render under the new name, not the stale one.
    const first = page([{ id: 'a', name: 'Dana' }], 'a', true)
    const second = page([{ id: 'a', name: 'Dana Cohen' }], null, false)
    expect(appendPage(first, second).items).toEqual([{ id: 'a', name: 'Dana Cohen' }])
  })

  it('never reorders rows the server sent in order', () => {
    // The server sorts; the client must not resort. A roster ordered by belt rank would
    // otherwise silently become ordered by id.
    const first = page([{ id: 'c', name: 'Noa' }, { id: 'a', name: 'Dana' }], 'a', true)
    const second = page([{ id: 'b', name: 'Yossi' }], null, false)
    expect(appendPage(first, second).items.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('carries the newer page’s cursor and has_more', () => {
    const merged = appendPage(page([], 'a', true), page([], 'z', true))
    expect(merged.next_cursor).toBe('z')
    expect(merged.has_more).toBe(true)
  })
})

describe('mergeCursorPages', () => {
  it('merges a whole sequence', () => {
    const merged = mergeCursorPages([
      page([{ id: 'a', name: 'Dana' }], 'a', true),
      page([{ id: 'b', name: 'Yossi' }], 'b', true),
      page([{ id: 'c', name: 'Noa' }], null, false),
    ])
    expect(merged.items.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(merged.has_more).toBe(false)
  })

  it('returns an empty page for an empty sequence rather than throwing', () => {
    const merged = mergeCursorPages<Row>([])
    expect(merged.items).toEqual([])
    expect(merged.has_more).toBe(false)
    expect(merged.next_cursor).toBeNull()
  })
})

describe('hasNextPage', () => {
  it('reads has_more rather than inferring it from the cursor', () => {
    // The server carries both explicitly (see `_pagination.py`), because an infinite
    // scroll needs to know whether to show a spinner before it decides what to request.
    expect(hasNextPage(page([], 'a', true))).toBe(true)
    expect(hasNextPage(page([], 'a', false))).toBe(false)
    expect(hasNextPage(page([], null, false))).toBe(false)
  })
})
