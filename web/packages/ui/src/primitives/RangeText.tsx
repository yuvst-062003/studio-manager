/**
 * Two values and the dash between them, as **one left-to-right island**.
 *
 * A range is the single most reliable way to ship a bidi bug in this product, and it has
 * now been shipped three times:
 *
 * - `YearStep` interpolated `` `${starts_on} – ${ends_on}` `` into an RTL paragraph and
 *   printed `2027-09-01 – 2026-09-01` on staging.
 * - The manager home's first draft used two sibling `<bdi>` ends — each internally
 *   correct, and still laid out end-then-start by the row around them.
 * - The Stitch generation of that same screen produced `17:00 – 16:00` and `$14,250-`.
 *
 * The cause is the same every time: digits are a left-to-right run, the dash between them
 * is directionally neutral, and an RTL paragraph is free to reorder the whole sequence.
 * Neither `<bdi>` per end nor a template literal prevents it. **One** element, explicitly
 * `dir="ltr"`, holding both ends and the separator, does — and `<bdi>` isolates that
 * island so it cannot disturb the Hebrew around it either.
 *
 * Dates, times, capacities, page counts: anything of the shape `a – b`.
 */
export function RangeText({
  from,
  to,
  separator = '–',
  className,
}: {
  from: string
  to: string
  /** En dash by default. A caller wanting `to` or `→` passes it; nobody passes a hyphen. */
  separator?: string
  className?: string
}) {
  return (
    <bdi className={className ? `studio-range ${className}` : 'studio-range'} dir="ltr">
      {from}
      {separator}
      {to}
    </bdi>
  )
}
