import { describe, expect, it } from 'vitest'
import {
  STUDIO_TIMEZONE,
  formatDateInStudioZone,
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
