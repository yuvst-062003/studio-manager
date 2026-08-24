import type { ReactElement } from 'react'

export type AttendanceState = 'present' | 'absent' | 'notified' | 'unmarked'

/**
 * Artboard 4h, card מצבי נוכחות.
 *
 * Each state differs in SHAPE as well as colour — a check, a cross, an outlined cross and
 * a dot, with a dashed border on the unmarked case. SC 1.4.1, but also plain usability: a
 * coach reads a roster of thirty in a few seconds.
 *
 * 4h draws the corner at 12px; the declared radius scale is 9/11/14, so this uses
 * --radius-lg. A one-pixel deviation beats a token that exists for one component.
 */
const SHAPES: Record<AttendanceState, { shape: string; path: ReactElement }> = {
  present: { shape: 'check', path: <path d="M4 10.5 8 14.5 16 5.5" /> },
  absent: { shape: 'cross', path: <path d="M5 5l10 10M15 5L5 15" /> },
  notified: { shape: 'cross-outline', path: <path d="M6 6l8 8M14 6l-8 8" /> },
  unmarked: { shape: 'dot', path: <circle cx="10" cy="10" fill="currentColor" r="3.2" /> },
}

export function AttendanceMark({ state, label }: { state: AttendanceState; label: string }) {
  const { shape, path } = SHAPES[state]
  return (
    <span aria-label={label} className="studio-attendance" data-state={state} role="img">
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
