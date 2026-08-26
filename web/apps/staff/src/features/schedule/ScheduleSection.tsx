// The staff schedule vertical's container, and the reason `App.tsx` needs exactly one
// route branch rather than two.
//
// `web/apps/staff/src/App.tsx` is a file lane PEOPLE also has to edit this wave, so the
// diff there is one NAV href, one hash hook and a single `{route === 'schedule' ? … : …}`.
// Which of 9a/1d or 9b to draw, and how a coach gets from one to the other, is this lane's
// business and lives in this lane's folder.
//
// Routing is `location.hash`, matching the dashboard: real `<a href>` links that survive
// the back button and open-in-new-tab, with no router dependency —
// `.claude/rules/ui-rtl-a11y.md` says not to add one without asking.
import { useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DatePickerScreen } from './DatePickerScreen'
import { TodayScreen } from './TodayScreen'
import type { CoachOption } from './TodayScreen'
import type { StaffScheduleClient } from './client'

const openPickerStyle: CSSProperties = {
  display: 'inline-block',
  marginBlockEnd: 'var(--space-3)',
  fontSize: 'var(--text-label)',
}

export type StaffScheduleView = 'today' | 'date'

/** `#/schedule` → 9a/1d · `#/schedule/date` → 9b. Anything else is היום. */
export function staffScheduleRoute(hash: string): StaffScheduleView {
  return hash.replace(/^#\/?/, '') === 'schedule/date' ? 'date' : 'today'
}

export function ScheduleSection({
  locale,
  client,
  hash,
  today,
  coaches = [],
  viewerPersonId,
  viewerIsCoach = false,
}: {
  locale: Locale
  client: StaffScheduleClient
  hash: string
  /** An ISO instant. A prop, not `new Date()`, all the way down. */
  today: string
  coaches?: CoachOption[]
  viewerPersonId?: string
  viewerIsCoach?: boolean
}) {
  const [picked, setPicked] = useState<string | null>(null)

  // 9b hands back a range; היום shows one day, so the range's start is the day to open on.
  // Kept in state rather than pushed into the hash: a coach who picks 10 November and then
  // presses back wants the picker again, not a URL they have to clear by hand.
  const onSelect = useCallback((range: { from: string; to: string }) => {
    setPicked(range.from)
    if (globalThis.location) globalThis.location.hash = '#/schedule'
  }, [])

  if (staffScheduleRoute(hash) === 'date') {
    return <DatePickerScreen locale={locale} client={client} today={today} onSelect={onSelect} />
  }

  return (
    <>
      {/* 9b is reachable or it is not delivered. A real <a href> rather than a button, so
          it survives the back button and open-in-new-tab — the same reason the whole
          vertical routes on the hash. */}
      <a href="#/schedule/date" data-testid="open-date-picker" style={openPickerStyle}>
        {t(locale, 'schedule.datePicker.title')}
      </a>
      <TodayScreen
        locale={locale}
        client={client}
        // A day chosen in 9b wins over the clock until the coach navigates away, which is
        // what "קפיצה" on that screen is for.
        today={picked ? `${picked}T12:00:00Z` : today}
        coaches={coaches}
        viewerPersonId={viewerPersonId}
        viewerIsCoach={viewerIsCoach}
      />
    </>
  )
}
