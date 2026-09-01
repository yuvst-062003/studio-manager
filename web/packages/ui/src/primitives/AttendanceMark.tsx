import type { ReactElement } from 'react'

export type AttendanceState = 'present' | 'absent' | 'notified' | 'unmarked' | 'planned'

/**
 * Artboard 4h, card מצבי נוכחות.
 *
 * Each state differs in SHAPE as well as colour — a check, a cross, an outlined cross and
 * a dot, with a dashed border on the unmarked case. SC 1.4.1, but also plain usability: a
 * coach reads a roster of thirty in a few seconds.
 *
 * `planned` was added for the parent calendar (screen 6 of the Stitch redesign, direction
 * A picked 2026-09-01), where a month holds lessons that have not happened yet. Its shape
 * is the ABSENCE of one — an empty ring — because nothing has been recorded in it. That
 * kept the calendar on this primitive instead of drawing a second set of marks at 16px,
 * which is how the parent view and the staff roster would start disagreeing about what a
 * cross means.
 *
 * 4h draws the corner at 12px; the declared radius scale is 9/11/14, so this uses
 * --radius-lg. A one-pixel deviation beats a token that exists for one component.
 */
const SHAPES: Record<AttendanceState, { shape: string; path: ReactElement | null }> = {
  present: { shape: 'check', path: <path d="M4 10.5 8 14.5 16 5.5" /> },
  absent: { shape: 'cross', path: <path d="M5 5l10 10M15 5L5 15" /> },
  notified: { shape: 'cross-outline', path: <path d="M6 6l8 8M14 6l-8 8" /> },
  unmarked: { shape: 'dot', path: <circle cx="10" cy="10" fill="currentColor" r="3.2" /> },
  planned: { shape: 'ring', path: null },
}

export function AttendanceMark({
  state,
  label,
  size,
}: {
  state: AttendanceState
  label: string
  /**
   * `sm` is the calendar-cell size. Omitted is the roster's 42px, which does not fit
   * seven columns on a 390px phone — and shrinking it there would have shrunk it on the
   * staff card too.
   */
  size?: 'sm'
}) {
  const { shape, path } = SHAPES[state]
  return (
    <span
      aria-label={label}
      className="studio-attendance"
      data-size={size}
      data-state={state}
      role="img"
    >
      <svg
        aria-hidden="true"
        data-shape={shape}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        viewBox="0 0 20 20"
      >
        {path}
      </svg>
    </span>
  )
}
