/**
 * A read-only, capped list of short values (A7).
 *
 * `SlotChips` is a radio group and cannot serve a read-only list — `StaffScreen`
 * hand-rolled `chipRowStyle`/`chipStyle` for ten permission pills per row, and its
 * `קבוצות` column joined nine group names with `' · '` into a five-line run-on string.
 * Per Setproduct's rule, a table cell shows two or three values and a count, never the
 * whole list.
 *
 * The overflow chip carries the remainder as both `title` (a mouse user gets it on
 * hover) and `aria-label` (a screen reader hears the actual names, not just a count).
 * Its visible glyph comes from `moreLabel`, which the caller owns — this primitive
 * inlines no string.
 */
export function ChipList({
  items,
  max = 3,
  moreLabel,
}: {
  items: string[]
  /** How many chips render before the rest collapse into one "+N" chip. */
  max?: number
  /**
   * The overflow chip's visible text. `t()` performs no interpolation — the caller
   * fills the count with `@studio/core`'s `fill()`, e.g.
   * `(n) => fill(t(locale, 'common.chips.more'), { count: n })`.
   */
  moreLabel: (n: number) => string
}) {
  if (items.length === 0) return null

  const visible = items.slice(0, max)
  const rest = items.slice(max)
  const remainder = rest.join(', ')

  return (
    <ul className="studio-chip-list">
      {visible.map((item, index) => (
        <li className="studio-chip-list__chip" key={`${index}-${item}`}>
          {item}
        </li>
      ))}
      {rest.length > 0 ? (
        <li
          aria-label={remainder}
          className="studio-chip-list__chip studio-chip-list__chip--more"
          title={remainder}
        >
          {moreLabel(rest.length)}
        </li>
      ) : null}
    </ul>
  )
}
