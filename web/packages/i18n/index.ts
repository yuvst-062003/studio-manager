import { DIRECTION, LOCALES, NAMESPACES, REFERENCE_LOCALE } from './types'
import type { Bundle, Locale, Namespace } from './types'

import { common as heCommon } from './he/common'
import { schedule as heSchedule } from './he/schedule'
import { people as hePeople } from './he/people'
import { health as heHealth } from './he/health'
import { attendance as heAttendance } from './he/attendance'
import { billing as heBilling } from './he/billing'
import { events as heEvents } from './he/events'
import { comms as heComms } from './he/comms'
import { reports as heReports } from './he/reports'

import { common as enCommon } from './en/common'
import { schedule as enSchedule } from './en/schedule'
import { people as enPeople } from './en/people'
import { health as enHealth } from './en/health'
import { attendance as enAttendance } from './en/attendance'
import { billing as enBilling } from './en/billing'
import { events as enEvents } from './en/events'
import { comms as enComms } from './en/comms'
import { reports as enReports } from './en/reports'

import { common as ruCommon } from './ru/common'
import { schedule as ruSchedule } from './ru/schedule'
import { people as ruPeople } from './ru/people'
import { health as ruHealth } from './ru/health'
import { attendance as ruAttendance } from './ru/attendance'
import { billing as ruBilling } from './ru/billing'
import { events as ruEvents } from './ru/events'
import { comms as ruComms } from './ru/comms'
import { reports as ruReports } from './ru/reports'

export const bundles: Record<Locale, Record<Namespace, Bundle>> = {
  he: {
    common: heCommon,
    schedule: heSchedule,
    people: hePeople,
    health: heHealth,
    attendance: heAttendance,
    billing: heBilling,
    events: heEvents,
    comms: heComms,
    reports: heReports,
  },
  en: {
    common: enCommon,
    schedule: enSchedule,
    people: enPeople,
    health: enHealth,
    attendance: enAttendance,
    billing: enBilling,
    events: enEvents,
    comms: enComms,
    reports: enReports,
  },
  ru: {
    common: ruCommon,
    schedule: ruSchedule,
    people: ruPeople,
    health: ruHealth,
    attendance: ruAttendance,
    billing: ruBilling,
    events: ruEvents,
    comms: ruComms,
    reports: ruReports,
  },
}

/**
 * `t('he', 'common.hello')`. Missing keys fall back to the reference locale; a key
 * missing everywhere returns itself rather than throwing, so a missing translation
 * degrades to a visible key instead of a blank screen.
 */
/**
 * The lookup rule, separated from the shipped bundles so it can be tested against
 * synthetic ones.
 *
 * It is separate for a reason worth keeping: the fallback test used to assert
 * `t('ru', 'common.appName.staff') === t('he', ...)`, which passed only because that key
 * happened to be untranslated. Completing the Russian translation turned it red. A test
 * of the fallback rule must not depend on which translations are currently missing —
 * otherwise it stops testing anything the moment a locale is finished.
 */
export function translate(
  source: Record<Locale, Record<Namespace, Bundle>>,
  locale: Locale,
  key: string,
): string {
  const dot = key.indexOf('.')
  if (dot === -1) return key
  const ns = key.slice(0, dot) as Namespace
  const rest = key.slice(dot + 1)
  return source[locale]?.[ns]?.[rest] ?? source[REFERENCE_LOCALE]?.[ns]?.[rest] ?? key
}

export function t(locale: Locale, key: string): string {
  return translate(bundles, locale, key)
}

/**
 * A count-bearing string, with a real plural rule (register §9 — `'{{count}} שיעורים'`
 * read "1 שיעורים" because nothing ever branched on `count`).
 *
 * `key` names the "other" form exactly as it exists today (`schedule.today.sessionCount`);
 * a `.one` sibling (`schedule.today.sessionCount.one`) is looked up first and used verbatim
 * — Hebrew's singular has its own word order ("שיעור אחד"), not a template with `1`
 * substituted in. When no `.one` variant is defined for the locale, `key` falls back
 * through the same he-is-reference chain `translate` already uses, so a locale that hasn't
 * added a singular form yet degrades to its ordinary (grammatically fine for 0, 2+) form
 * rather than a missing-key literal.
 *
 * Only `.one` is supported, not `.two`/`.few`/`.many` — the register's complaint is about
 * `count === 1` specifically, and Hebrew's `.two` is optional flourish ("2 שיעורים" is
 * correct, "שני שיעורים" only nicer) rather than a defect to fix here.
 */
export function translatePlural(
  source: Record<Locale, Record<Namespace, Bundle>>,
  locale: Locale,
  key: string,
  count: number,
  params: Record<string, string | number> = {},
): string {
  const category = new Intl.PluralRules(locale).select(count)
  const singularKey = `${key}.one`
  const singular = translate(source, locale, singularKey)
  const template = category === 'one' && singular !== singularKey ? singular : translate(source, locale, key)
  return Object.entries({ count, ...params }).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    template,
  )
}

export function plural(
  locale: Locale,
  key: string,
  count: number,
  params: Record<string, string | number> = {},
): string {
  return translatePlural(bundles, locale, key, count, params)
}

export { DIRECTION, LOCALES, NAMESPACES, REFERENCE_LOCALE }
export type { Bundle, Locale, Namespace }
