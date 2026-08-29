import type { ReactNode } from 'react'

/**
 * A row of buttons that have a **rank** and an **alignment**, which is the one thing an
 * ad-hoc flex row never gives them.
 *
 * `RolloverWizard.tsx:366` is the defect this exists to remove: a ghost button and a
 * secondary button in `{ display: 'flex', gap: 'var(--space-2)' }` — no
 * `justify-content`, no edge to align to, and no signal which of the two is the way
 * forward. Read at a glance they are two unrelated controls sitting near each other.
 * Across the three apps there are 178 inline `style={{ }}` blocks of that shape.
 *
 * The rule this encodes: **navigation and escape hatches go on the inline-start edge,
 * the thing that moves the task forward goes on the inline-end edge.** With both sides
 * present the row is `space-between`; with one side it aligns to that side's edge, so a
 * lone primary does not drift into the middle.
 *
 * Logical properties throughout — a physical `justify-content: flex-end` would put the
 * primary on the wrong edge the moment the document turns RTL, and that is invisible to
 * an LTR reviewer.
 */
export function ActionBar({
  start,
  end,
  className,
}: {
  start?: ReactNode
  end?: ReactNode
  className?: string
}) {
  // Which edge a lone group lands on. Encoded as a data attribute rather than a class so
  // the CSS reads as one rule with three cases instead of three selectors.
  const align = start && end ? 'between' : end ? 'end' : 'start'
  return (
    <div className={className ? `studio-actionbar ${className}` : 'studio-actionbar'} data-align={align}>
      {start ? <div className="studio-actionbar__group">{start}</div> : null}
      {end ? <div className="studio-actionbar__group">{end}</div> : null}
    </div>
  )
}
