import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { AttendanceMark } from './AttendanceMark'
import type { AttendanceState } from './AttendanceMark'

export type AttendanceStripItem = {
  id: string
  state: AttendanceState
  /** Accessible name for the single mark — typically "date · state". */
  label: string
}

const LEGEND_KEYS: Record<AttendanceState, string> = {
  present: 'attendance.roster.present',
  absent: 'attendance.roster.absent',
  notified: 'attendance.source.preReported',
  unmarked: 'attendance.roster.unmarked',
}

const STATES: AttendanceState[] = ['present', 'absent', 'notified', 'unmarked']

/**
 * The 8-session strip (parent 2c; staff 2d/9c/9h) — one shared primitive so the
 * two surfaces cannot drift apart. Marks compose `AttendanceMark`, and the legend
 * doubles as the counts line: `נוכח 5 · נעדר 1 · הודיעו מראש 1 · לא סומן 1`.
 *
 * The marks row is pinned `dir="ltr"`: 2c's spec lists the attendance marks among
 * the parts that must NOT mirror — time flows one way in both locales.
 */
export function AttendanceStrip({
  locale,
  items,
  showLegend = true,
}: {
  locale: Locale
  items: AttendanceStripItem[]
  showLegend?: boolean
}) {
  const counts = new Map<AttendanceState, number>()
  for (const item of items) counts.set(item.state, (counts.get(item.state) ?? 0) + 1)

  return (
    <div className="studio-attendance-strip" data-testid="attendance-strip">
      <div className="studio-attendance-strip__marks" dir="ltr">
        {items.map((item) => (
          <AttendanceMark key={item.id} label={item.label} state={item.state} />
        ))}
      </div>
      {showLegend ? (
        <ul className="studio-attendance-strip__legend" data-testid="attendance-strip-legend">
          {STATES.filter((state) => (counts.get(state) ?? 0) > 0).map((state) => (
            <li key={state}>
              {/* The adjacent text names the state; the swatch is decoration. */}
              <span aria-hidden="true">
                <AttendanceMark label="" state={state} />
              </span>
              <span>
                {t(locale, LEGEND_KEYS[state])} {counts.get(state)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
