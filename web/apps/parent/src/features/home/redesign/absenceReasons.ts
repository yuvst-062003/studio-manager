// The six reasons the prototype's absence sheet offers.
//
// What is here is what is NOT a string: the key, the emoji and the tint. Every word lives
// in `attendance.reason.<key>.*` — this file used to carry Hebrew labels inline, which is
// the arrangement §Conventions exists to prevent.
//
// **The label is also the payload.** `POST /absence-reports` has one free-text `reason`
// column and no enum, and a coach reads the value on the mat. So a sheet renders the
// PARENT's locale and sends the Hebrew one: `reasonForWire` below is `t('he', ...)` and
// nothing else. A Russian-speaking family choosing 'Болезнь' must not put a word the coach
// cannot read into the register.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type ReasonKey = 'sick' | 'family' | 'school' | 'injury' | 'vacation' | 'other'

export const ABSENCE_REASONS: readonly { key: ReasonKey; icon: string; bg: string }[] = [
  { key: 'sick', icon: '🤒', bg: 'bg-amber-50 dark:bg-amber-400/15' },
  { key: 'family', icon: '🎉', bg: 'bg-purple-50 dark:bg-purple-400/15' },
  { key: 'school', icon: '📚', bg: 'bg-sky-50 dark:bg-sky-400/15' },
  { key: 'injury', icon: '🩹', bg: 'bg-rose-50 dark:bg-rose-400/15' },
  { key: 'vacation', icon: '✈️', bg: 'bg-emerald-50 dark:bg-emerald-400/15' },
  { key: 'other', icon: '💬', bg: 'bg-slate-100 dark:bg-slate-700' },
]

/** What the parent reads. */
export function reasonLabel(key: ReasonKey, locale: Locale): string {
  return t(locale, `attendance.reason.${key}.label`)
}

/** The one-line hint under it. */
export function reasonSub(key: ReasonKey, locale: Locale): string {
  return t(locale, `attendance.reason.${key}.sub`)
}

/**
 * What the CLUB reads, composed with the parent's free-text note.
 *
 * Deliberately `'he'` and not the parent's locale — see the note at the top of this file.
 * The note itself stays in whatever the parent typed, because that is theirs and no
 * translation of it exists.
 */
export function reasonForWire(key: ReasonKey | null, note: string): string {
  const label = key === null ? '' : t('he', `attendance.reason.${key}.label`)
  const trimmed = note.trim()
  return trimmed ? `${label} — ${trimmed}` : label
}
