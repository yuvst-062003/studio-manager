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
export function t(locale: Locale, key: string): string {
  const dot = key.indexOf('.')
  if (dot === -1) return key
  const ns = key.slice(0, dot) as Namespace
  const rest = key.slice(dot + 1)
  return bundles[locale]?.[ns]?.[rest] ?? bundles[REFERENCE_LOCALE]?.[ns]?.[rest] ?? key
}

export { DIRECTION, LOCALES, NAMESPACES, REFERENCE_LOCALE }
export type { Bundle, Locale, Namespace }
