import { describe, expect, it } from 'vitest'
import {
  STUDIO_TIMEZONE,
  formatDateInStudioZone,
  formatMonthLabel,
  formatSessionWhen,
  formatTimeInStudioZone,
  studioDayKey,
  studioWallTimeToUtc,
} from './datetime'

/**
 * G3 / SPEC §8.3, §9 — "Timestamps are **always** stored UTC `timestamptz`; rendered in
 * `Asia/Jerusalem` **regardless of locale**."
 *
 * The "regardless of locale" half is the one that gets lost. It is easy to render dates
 * with `toLocaleString(locale)` and believe the job is done — that formats in the *host's*
 * zone, so a manager checking the roster from abroad sees a class at the wrong hour, and a
 * Russian-speaking parent in Israel sees a different time from a Hebrew-speaking one.
 */
describe('formatTimeInStudioZone', () => {
  // 17:30 Israel Standard Time (UTC+2) in January.
  const winterClass = '2026-01-14T15:30:00Z'
  // 17:30 Israel Daylight Time (UTC+3) in June.
  const summerClass = '2026-06-14T14:30:00Z'

  it('renders the studio wall-clock time, not the host zone', () => {
    expect(formatTimeInStudioZone(winterClass, 'he')).toBe('17:30')
  })

  it('handles Israel daylight time', () => {
    // The same wall-clock hour, a different UTC instant. A fixed +2 offset would render
    // this as 16:30 and put every summer class an hour early.
    expect(formatTimeInStudioZone(summerClass, 'he')).toBe('17:30')
  })

  /**
   * **The test G3 is actually about.** One instant, three locales, one wall clock.
   *
   * Locale may change numerals, separators and word order. It must never change the hour.
   */
  it('renders the same hour in every locale', () => {
    const he = formatTimeInStudioZone(winterClass, 'he')
    const en = formatTimeInStudioZone(winterClass, 'en')
    const ru = formatTimeInStudioZone(winterClass, 'ru')
    expect(he).toBe('17:30')
    expect(en).toBe('17:30')
    expect(ru).toBe('17:30')
  })

  it('does not follow the host timezone', () => {
    // Vitest runs in whatever zone the machine is in. Rendering must be identical either
    // way, which is what pinning `timeZone` in the formatter guarantees.
    const original = process.env.TZ
    try {
      process.env.TZ = 'America/New_York'
      expect(formatTimeInStudioZone(winterClass, 'he')).toBe('17:30')
      process.env.TZ = 'Asia/Tokyo'
      expect(formatTimeInStudioZone(winterClass, 'he')).toBe('17:30')
    } finally {
      process.env.TZ = original
    }
  })
})

describe('studioDayKey', () => {
  /**
   * **The bug this function exists to prevent.**
   *
   * A 22:30 UTC instant in March is already the *next day* in Jerusalem. A day strip
   * (parent `2a`, staff `9a`) that grouped sessions by the UTC date would show a class on
   * the wrong day — and only for evening classes, which is most of them in a judo club.
   */
  it('uses the Jerusalem calendar day, not the UTC one', () => {
    expect(studioDayKey('2026-03-14T22:30:00Z')).toBe('2026-03-15')
  })

  it('agrees with the UTC day when they are the same', () => {
    expect(studioDayKey('2026-03-14T09:00:00Z')).toBe('2026-03-14')
  })

  it('is stable across the DST boundary', () => {
    // Israel moves to daylight time on the Friday before the last Sunday of March. Both
    // sides of it must still key to their own Jerusalem day.
    expect(studioDayKey('2026-03-26T21:30:00Z')).toBe('2026-03-26') // 23:30 IST (+2)
    expect(studioDayKey('2026-03-29T21:30:00Z')).toBe('2026-03-30') // 00:30 IDT (+3)
  })

  it('is locale-independent, because it is a key and not a label', () => {
    // ISO `YYYY-MM-DD`, so it sorts lexicographically and can be a Map key. A localized
    // date string here would make the parent app's grouping differ by language.
    expect(studioDayKey('2026-03-14T22:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatDateInStudioZone', () => {
  it('renders a localized date, still in the studio zone', () => {
    // The label MAY differ by locale — this is the half that is allowed to change.
    const he = formatDateInStudioZone('2026-03-14T22:30:00Z', 'he')
    const en = formatDateInStudioZone('2026-03-14T22:30:00Z', 'en')
    // …but both must name the 15th, because that is the Jerusalem day.
    expect(he).toContain('15')
    expect(en).toContain('15')
  })
})

/**
 * B1.1 — the dashboard's unmarked-session row used to render weekday, date and time as
 * three separate siblings (a `<span>` for the time, a `<bdi>` for the group name between
 * them, a `<span>` for the date). In an RTL paragraph that is three independently
 * reorderable fragments, and the owner's screenshot showed exactly the failure
 * `RangeText`'s docstring already names three times: `16:00קבוצה 14 בספטמבר 2026` — the
 * time jumped across the group name and glued itself to the date.
 *
 * `formatSessionWhen` composes weekday, date and time into ONE string, so the caller has
 * exactly one thing to hand a single `<bdi dir="ltr">` rather than three.
 */
describe('formatSessionWhen', () => {
  // Monday 14 September 2026, 16:00 Israel Daylight Time (UTC+3) — the exact session the
  // proposal's mock-up draws: "יום שני, 14 בספטמבר · 16:00".
  const session = '2026-09-14T13:00:00Z'

  it('renders weekday, date and time as one string, in that order', () => {
    expect(formatSessionWhen(session, 'he')).toBe('יום שני, 14 בספטמבר · 16:00')
  })

  it('renders the studio wall-clock time, not the host zone, in every locale', () => {
    // Same instant, three locales — the hour must never move, only the words around it.
    expect(formatSessionWhen(session, 'he')).toContain('16:00')
    expect(formatSessionWhen(session, 'en')).toContain('16:00')
    expect(formatSessionWhen(session, 'ru')).toContain('16:00')
  })

  it('carries the weekday and the day-of-month in every locale', () => {
    expect(formatSessionWhen(session, 'en')).toContain('Monday')
    expect(formatSessionWhen(session, 'en')).toContain('14')
  })

  it('does not follow the host timezone', () => {
    // Same guard `formatTimeInStudioZone` carries: vitest runs in whatever zone the
    // machine is in, and pinning `timeZone` in the formatter is what makes that not matter.
    const original = process.env.TZ
    try {
      process.env.TZ = 'America/New_York'
      expect(formatSessionWhen(session, 'he')).toBe('יום שני, 14 בספטמבר · 16:00')
      process.env.TZ = 'Asia/Tokyo'
      expect(formatSessionWhen(session, 'he')).toBe('יום שני, 14 בספטמבר · 16:00')
    } finally {
      process.env.TZ = original
    }
  })
})

describe('formatMonthLabel', () => {
  it('names the month in the reader\'s language rather than as an ISO key', () => {
    // The parent calendar (`12b`) printed its heading as `${year}-${pad(month)}` — a
    // Hebrew-speaking parent read "2026-08" where every other date on the screen is words.
    expect(formatMonthLabel(2026, 8, 'he')).toContain('אוגוסט')
    expect(formatMonthLabel(2026, 8, 'he')).toContain('2026')
    expect(formatMonthLabel(2026, 8, 'en')).toContain('August')
    expect(formatMonthLabel(2026, 8, 'ru')).toContain('2026')
  })

  it('takes a 1-based month, matching every other month value in this codebase', () => {
    // `charge.period_month`, `group_schedule_rule` and the calendar's own state are all
    // 1-based; JS `Date` months are not, and that mismatch is the bug this signature exists
    // to make impossible.
    expect(formatMonthLabel(2026, 1, 'en')).toContain('January')
    expect(formatMonthLabel(2026, 12, 'en')).toContain('December')
  })

  it('does not slip a month at the studio-zone boundary', () => {
    // Built at midday rather than midnight: a UTC-midnight instant for the 1st is still the
    // previous month in some zones, and the label must never disagree with the grid.
    expect(formatMonthLabel(2026, 3, 'en')).toContain('March')
    expect(formatMonthLabel(2027, 1, 'en')).toContain('January')
  })
})

describe('STUDIO_TIMEZONE', () => {
  it('is Asia/Jerusalem and is exported so no call site writes the literal', () => {
    expect(STUDIO_TIMEZONE).toBe('Asia/Jerusalem')
  })
})

describe('studioWallTimeToUtc', () => {
  it('is the inverse of the studio day key + wall clock in winter (UTC+2)', () => {
    expect(studioWallTimeToUtc('2026-12-15', '17:00')).toBe('2026-12-15T15:00:00.000Z')
  })

  it('handles summer time (UTC+3)', () => {
    expect(studioWallTimeToUtc('2026-07-15', '17:00')).toBe('2026-07-15T14:00:00.000Z')
  })

  it('round-trips through studioDayKey and the wall clock', () => {
    const iso = studioWallTimeToUtc('2026-03-14', '22:30')
    expect(studioDayKey(iso)).toBe('2026-03-14')
  })
})
