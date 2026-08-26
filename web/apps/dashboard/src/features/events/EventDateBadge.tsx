// The day-over-month block. Feature-specific by the audit's own table, and drawn on three
// artboards — 7a, 9i and 6b — so it is one component rather than three.
//
// **The divider is `border-inline-end`, never `border-left`.** 7a finding 6: the canvas
// repeats a physical left border and left padding on each of four cards, and it lands
// correctly only because the date block happens to be the first flex child under
// `dir="rtl"`. In `en` it would sit on the wrong side of the text. This is the only
// physical work in 7a's range, and it is fixed here once (D10/G12).
import type { CSSProperties } from 'react'
import { studioDayKey } from '@studio/core'

const blockStyle: CSSProperties = {
  alignItems: 'center',
  borderInlineEnd: 'var(--border-width-hairline) solid var(--border)',
  display: 'flex',
  flex: 'none',
  flexDirection: 'column',
  justifyContent: 'center',
  minInlineSize: '3.25rem',
  paddingInlineEnd: 'var(--space-3)',
}

const dayStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-display)',
  fontWeight: 'var(--weight-medium)',
  lineHeight: 'var(--leading-tight)',
  // Tabular figures, so a column of dates does not jitter. 9i records the same convention.
  fontVariantNumeric: 'tabular-nums',
}

const monthStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  fontVariantNumeric: 'tabular-nums',
}

/**
 * `startsAt` is an ISO instant from the API — UTC, per G3 — and the badge shows the
 * **Jerusalem** calendar day, which is what "render at the edge" means.
 *
 * `studioDayKey` rather than `formatDateInStudioZone`: the latter is locale-formatted, so
 * splitting its output for the day and month would break on any locale that orders or
 * separates the parts differently. `studioDayKey` is locale-independent `YYYY-MM-DD` by
 * design — its own docstring says it is a key rather than a label, and that is exactly the
 * property wanted here.
 *
 * The failure it avoids is the one that docstring names: `2026-03-14T22:30:00Z` is already
 * 15 March in Jerusalem, and in a judo club almost every event starts in the evening.
 */
export function EventDateBadge({ startsAt }: { startsAt: string }) {
  const [, month, day] = studioDayKey(startsAt).split('-')
  return (
    <div style={blockStyle}>
      <span style={dayStyle}>{day}</span>
      <span style={monthStyle}>{month}</span>
    </div>
  )
}
