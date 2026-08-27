/**
 * G3 / SPEC §8.3, §9 — timestamps are stored UTC and rendered in `Asia/Jerusalem`
 * **regardless of locale**.
 *
 * **Every formatter here pins `timeZone` explicitly**, and that is the whole point of the
 * module. The obvious `new Date(iso).toLocaleTimeString(locale)` formats in the *host's*
 * zone: a manager checking tomorrow's roster from abroad would see every class at the
 * wrong hour, and the bug is invisible to anyone developing in Israel.
 *
 * The zone is `Asia/Jerusalem` rather than a fixed `+02:00` because Israel observes
 * daylight time. A fixed offset renders every summer class an hour early — and a judo
 * club's classes are overwhelmingly in the evening, where that error is most visible.
 *
 * **`studioDayKey` is separate from `formatDateInStudioZone` on purpose.** One is a key,
 * one is a label. Grouping sessions into days is a data operation that must be identical
 * in every locale; showing the user a date is a presentation operation that should not be.
 * Conflating them is how a parent app ends up grouping by language.
 */

/** SPEC §4.3 — the studio's timezone. No call site writes the literal. */
export const STUDIO_TIMEZONE = 'Asia/Jerusalem'

/** Matches `@studio/i18n`'s `Locale` without importing it — this package stays dependency-free. */
export type Locale = 'he' | 'en' | 'ru'

/**
 * `Intl.DateTimeFormat` is expensive to construct and these are called per row of a
 * roster. One instance per (locale, kind) pair, built once.
 */
const timeFormatters = new Map<string, Intl.DateTimeFormat>()
const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function timeFormatter(locale: Locale): Intl.DateTimeFormat {
  let formatter = timeFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: STUDIO_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      // 24-hour everywhere. Israel uses a 24-hour clock, and `hour12` left to the locale
      // would render `5:30 PM` for `en` — a different string for the same class, in a
      // product where a manager and a coach may be reading different languages.
      hour12: false,
    })
    timeFormatters.set(locale, formatter)
  }
  return formatter
}

function dateFormatter(locale: Locale): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: STUDIO_TIMEZONE,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    dateFormatters.set(locale, formatter)
  }
  return formatter
}

function toDate(iso: string | Date): Date {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`invalid timestamp: ${JSON.stringify(iso)}`)
  }
  return date
}

/**
 * A UTC instant → the studio's wall-clock time, e.g. `'17:30'`.
 *
 * The hour is identical in every locale by construction — only numerals and separators may
 * differ, and with `hour12: false` and 2-digit fields, in practice not even those.
 */
export function formatTimeInStudioZone(iso: string | Date, locale: Locale): string {
  return timeFormatter(locale).format(toDate(iso))
}

/** A UTC instant → a localized date label, still in the studio's zone. */
export function formatDateInStudioZone(iso: string | Date, locale: Locale): string {
  return dateFormatter(locale).format(toDate(iso))
}

/**
 * A UTC instant → the Jerusalem calendar day it falls on, as `YYYY-MM-DD`.
 *
 * **This is a key, not a label.** It sorts lexicographically and is safe as a `Map` key,
 * and it is deliberately locale-independent: the parent day strip (`2a`) and the staff
 * Today screen (`9a`) group sessions with it, and grouping must not change with language.
 *
 * The failure it prevents: `2026-03-14T22:30:00Z` is already **15 March** in Jerusalem.
 * Grouping by the UTC date would file an evening class under the previous day — and in a
 * judo club almost every class is in the evening.
 *
 * Built from `formatToParts` with `en-CA`-independent field access rather than string
 * slicing, so it cannot be broken by a locale that reorders the parts.
 */
export function studioDayKey(iso: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(toDate(iso))

  const field = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${field('year')}-${field('month')}-${field('day')}`
}

/** The Jerusalem wall-clock rendering of a UTC instant, as `YYYY-MM-DDTHH:mm`. */
function studioWallClock(instantMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs))
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${field('year')}-${field('month')}-${field('day')}T${field('hour')}:${field('minute')}`
}

/**
 * A Jerusalem wall time → the UTC instant it names, as an ISO string.
 *
 * The inverse of `formatTimeInStudioZone`, needed the moment a manager TYPES a time
 * (moving a session, creating an ad-hoc one): the form field holds a wall clock and the
 * API takes UTC. Iterative because a zone offset depends on the instant it is applied
 * to: guess the offset, render the guess back through the zone, correct by the
 * difference. Two rounds settle every DST case; a wall time that does not exist (the
 * spring-forward gap) lands on the instant the clock actually showed next.
 */
export function studioWallTimeToUtc(dayKey: string, time: string): string {
  const target = Date.parse(`${dayKey}T${time}:00Z`)
  let guess = target
  for (let round = 0; round < 2; round += 1) {
    const shown = Date.parse(`${studioWallClock(guess)}:00Z`)
    guess += target - shown
  }
  return new Date(guess).toISOString()
}
