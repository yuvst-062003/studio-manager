// The day-key formatters the parent home's headline, week strip and calendar grid read.
//
// The assertions are Hebrew-and-Russian on purpose. These replaced a hard-coded Hebrew
// `MONTH_NAME` array and a headline composed as `יום ${letter} • ${day} ב${month}` — the
// Hebrew is here to prove the replacement is byte-identical to what shipped, and the
// Russian to prove the thing the array could never have done: `25 августа`, genitive,
// which is a different word from the `август` a month-name table would have held.
import { describe, expect, it } from 'vitest'
import {
  formatDayAndMonth,
  formatDayHeadline,
  weekdayInitialOf,
  weekdayInitials,
} from './datetime'

describe('day-key formatters', () => {
  it('gives the seven initials Sunday first, in the schema order and not the locale one', () => {
    // `group_schedule_rule.weekday` is 0 for Sunday and every grid in this product is laid
    // out that way. `Intl`'s own first-day-of-week is Monday for ru and would silently
    // rotate the header row out of step with the cells under it.
    expect(weekdayInitials('he')).toEqual(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'])
    expect(weekdayInitials('en')).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
    expect(weekdayInitials('ru')[0]).toBe('В')
  })

  it('reads a day key at midday, so no offset can push it into the neighbouring date', () => {
    // The first of a month at midnight is still the previous month in a negative-offset
    // zone. This is the one that would have been a one-day-a-month bug.
    expect(formatDayAndMonth('2026-08-01', 'he')).toBe('1 באוגוסט')
    expect(weekdayInitialOf('2026-08-25', 'he')).toBe('ג׳')
  })

  it('declines the month where the language declines it', () => {
    expect(formatDayAndMonth('2026-08-25', 'he')).toBe('25 באוגוסט')
    expect(formatDayAndMonth('2026-08-25', 'ru')).toBe('25 августа')
    expect(formatDayAndMonth('2026-08-25', 'en')).toBe('August 25')
  })

  it('keeps the bullet the design asks for, where Intl would put a comma', () => {
    expect(formatDayHeadline('2026-08-25', 'he')).toBe('יום ג׳ • 25 באוגוסט 2026')
    expect(formatDayHeadline('2026-08-25', 'en')).toBe('Tue • August 25, 2026')
  })
})
