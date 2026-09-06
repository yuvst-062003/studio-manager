// The per-session calendar reminder, ported from the prototype's `CalendarReminderModal.tsx`
// and `utils/calendarUtils.ts`.
//
// THREE DEFECTS IN THE SOURCE, NOT PORTED:
//
//  1. AN INVENTED ADDRESS. `generateIcsContent` writes
//     `מועדון ג'ודו גלדיאטור, רחוב ויצמן 42, כפר סבא` into every LOCATION field. That is one
//     club's address hardcoded into a multi-tenant product, and it does not even match the
//     address the prototype's own Profile screen prints. Ours writes the session's
//     `locationName` and nothing when there is none.
//  2. TIMES PARSED IN THE DEVICE'S ZONE. It builds `new Date(y, m-1, d, hh, mm)` from a
//     date string and a time string, which is midnight-to-midnight in whatever zone the
//     phone is set to, and then formats the result as UTC. A parent travelling would get a
//     reminder at the wrong hour. Ours never parses a wall clock: `startsAt` and `endsAt`
//     are already UTC instants from the API, and go into the file as they are.
//  3. NO ESCAPING. RFC 5545 requires `,`, `;`, `\` and newlines to be escaped inside a text
//     value. A group called `קבוצה 4, בוגרים` would truncate the SUMMARY at the comma in a
//     strict client.
//
// The prototype's Google Calendar button is not ported either: it is a third way to do what
// the .ics already does, and §5.12's `CalendarSync` is this product's answer for parents who
// want the whole schedule rather than one lesson.
import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { formatSessionWhen } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useDialog } from '../../onboarding/wizard/useDialog'
import type { HomeSession } from './types'

export type LeadTime = '15min' | '30min' | '1hour' | '2hours' | '1day'

export const LEAD_MINUTES: Record<LeadTime, number> = {
  '15min': 15,
  '30min': 30,
  '1hour': 60,
  '2hours': 120,
  '1day': 1440,
}

const STORAGE_KEY = 'parent.home.reminders'

/** Which sessions this device already has a reminder for. Per-device on purpose — the file
 *  went into THIS phone's calendar, and the club has no record of it. */
export function readReminders(): Record<string, LeadTime> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, LeadTime>) : {}
  } catch {
    // A private window, cleared site data, or a browser refusing storage. An empty map is
    // the correct answer in every one of those, and none is worth an error on this screen.
    return {}
  }
}

export function writeReminder(key: string, lead: LeadTime): Record<string, LeadTime> {
  const next = { ...readReminders(), [key]: lead }
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Same as above. The download still happens; only the tick beside the button is lost.
  }
  return next
}

/** RFC 5545 §3.3.11 — the four characters a TEXT value may not carry raw. */
function escapeText(value: string): string {
  return value.replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n')
}

/** A UTC instant → `YYYYMMDDTHHMMSSZ`. */
function icsStamp(iso: string): string {
  return `${new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

export function buildIcs(
  session: HomeSession,
  lead: LeadTime,
  clubName: string,
  locale: Locale,
): string {
  const summary = `${clubName}: ${session.studentName} — ${session.groupName}`
  const details = [
    `${t(locale, 'schedule.reminder.icsChild')} ${session.studentName}`,
    `${t(locale, 'schedule.reminder.icsGroup')} ${session.groupName}`,
    session.coachName ? `${t(locale, 'schedule.reminder.icsCoach')} ${session.coachName}` : null,
    session.locationName
      ? `${t(locale, 'schedule.reminder.icsWhere')} ${session.locationName}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//studio-manager//parent//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable across re-downloads: the same lesson for the same child is the same event, so
    // saving twice updates one entry instead of leaving two in the parent's calendar. The
    // prototype puts `Date.now()` in the UID, which guarantees a duplicate every time.
    `UID:session-${session.id}-${session.studentId}@studio-manager`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(session.startsAt)}`,
    ...(session.endsAt ? [`DTEND:${icsStamp(session.endsAt)}`] : []),
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(details)}`,
    ...(session.locationName ? [`LOCATION:${escapeText(session.locationName)}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    `TRIGGER:-PT${LEAD_MINUTES[lead]}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function ReminderSheet({
  session,
  locale,
  current,
  clubName = 'Studio',
  onChoose,
  onClose,
}: {
  session: HomeSession
  locale: Locale
  current: LeadTime | null
  clubName?: string
  onChoose: (lead: LeadTime) => void
  onClose: () => void
}) {
  const dialogRef = useDialog(true, onClose)
  const [lead, setLead] = useState<LeadTime>(current ?? '30min')

  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(session, lead, clubName, locale))}`

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
        tabIndex={-1}
        data-testid="home-reminder-sheet"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 flex items-center justify-center shadow-xs">
              <Bell className="w-5 h-5" />
            </div>
            <div className="text-start">
              <h3 id="reminder-title" className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight">
                {t(locale, 'schedule.reminder.title')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <bdi dir="ltr">{formatSessionWhen(session.startsAt, locale)}</bdi>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'schedule.reminder.close')}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <fieldset className="space-y-2 border-0 m-0 p-0">
          <legend className="text-xs font-bold text-slate-800 dark:text-slate-200 p-0 pb-1">
            {t(locale, 'schedule.reminder.legend')}
          </legend>
          {(Object.keys(LEAD_MINUTES) as LeadTime[]).map((option) => (
            <label
              key={option}
              className={`flex items-center gap-2.5 p-2.5 rounded-2xl cursor-pointer transition-all ${
                lead === option
                  ? 'border-2 border-[#0056c5] bg-blue-50/80 dark:bg-blue-400/15'
                  : 'border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              <input
                type="radio"
                name="reminder-lead"
                value={option}
                checked={lead === option}
                onChange={() => setLead(option)}
              />
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t(locale, `schedule.reminder.lead.${option}`)}
              </span>
            </label>
          ))}
        </fieldset>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-start">{t(locale, 'schedule.reminder.hint')}</p>

        {/* A real link with `download`, not a scripted blob: the browser knows what to do
            with text/calendar, it survives a long-press "open in", and it is the same
            decision `EventCalendarButtons` records for the event .ics. */}
        <a
          href={href}
          download={`training-${session.id}.ics`}
          data-testid="home-reminder-download"
          onClick={() => {
            onChoose(lead)
            onClose()
          }}
          className="w-full bg-[#001849] hover:bg-[#0d2c6c] text-white py-3.5 rounded-2xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          <span>{t(locale, 'schedule.reminder.save')}</span>
        </a>
      </div>
    </div>
  )
}
