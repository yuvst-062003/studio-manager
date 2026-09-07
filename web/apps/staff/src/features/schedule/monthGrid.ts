// One month as a Sunday-first grid, and the ISO bounds that fetch it.
//
// These two were the only part of `DatePickerScreen` (artboard 9b) worth keeping when that
// screen was deleted on 2026-09-07 — the month calendar (§4.7) had imported them from there
// since it was written, so removing the screen without moving them would have taken the
// calendar down with it.
//
// **Sunday-first, like everything else in this lane.** `group_schedule_rule.weekday` is
// Sunday-first, the week board is, the day strip is; a Monday-first grid would be a daily
// papercut in an Israeli club and would disagree with the screen it navigates.
const pad = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DD` for a calendar day, built without a Date so no zone can shift it. */
const dayKey = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`

/**
 * One month as a flat Sunday-first grid, padded to whole weeks with `''`.
 *
 * `Date.UTC` is used only to ask which weekday the first of the month is and how long the
 * month is — both calendar facts, not instants, so UTC is exact and the studio zone would
 * add nothing but a chance to slip a day.
 */
export function monthGrid(year: number, month: number): string[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: string[] = Array.from({ length: firstWeekday }, () => '')
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(dayKey(year, month, day))
  while (cells.length % 7 !== 0) cells.push('')
  return cells
}

/** Exported for the month calendar (§4.7, checkpoint C11) — one leap-year-safe place to
 *  turn a `(year, month)` into the `from`/`to` pair `listSessions` takes. */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: dayKey(year, month, 1), to: dayKey(year, month, daysInMonth) }
}
