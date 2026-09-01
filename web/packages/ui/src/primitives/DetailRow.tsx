import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * One labelled fact about one thing: a label on the reading edge, the value beside it, and
 * either an action or a way onward at the far end.
 *
 * **Why a primitive and not eight local layouts.** Parent `2c` is composed of sections
 * owned by six different milestones. Before this, each one rendered its own
 * `<section><h2>` and picked its own spacing, so the card read as eight screens stacked
 * rather than one record about one child — the exact defect the 2026-08-31 redesign spec
 * names for that screen. A row every lane shares is what makes "one card" a property of
 * the design system instead of a thing each lane has to remember.
 *
 * The label column is a FIXED inline size, so the values line up down the card no matter
 * which lane wrote them. That alignment is the whole reason the ledger reads as one
 * object; a label sized to its own text would put every value at a different indent.
 *
 * `href` and `action` are mutually exclusive in the type, because an `<a>` containing a
 * `<button>` is invalid HTML and the mistake is silent — the row still renders and the
 * inner control simply stops being reachable by keyboard in some browsers.
 *
 * With `href` the WHOLE row is the target. Same rule `StatTile` already follows: a person
 * reaching for a row on a phone should not have to find a caption-sized link inside it,
 * and the row's own 48px min height is what keeps it over the 44px floor.
 */
export type DetailRowProps = {
  label: string
  children: ReactNode
  /** Semantic tone for the VALUE. There is no `tone="red"` — same rule as `MoneyDisplay`. */
  tone?: 'debt' | 'pending'
  testId?: string
} & (
  | { href?: undefined; action?: ReactNode }
  /** A row that goes somewhere carries no separate control — the row IS the control. */
  | { href: string; action?: undefined }
)

export function DetailRow({ label, children, tone, testId, href, action }: DetailRowProps) {
  const body = (
    <>
      <span className="studio-detail-row__label">{label}</span>
      <span className="studio-detail-row__value" data-tone={tone}>
        {children}
      </span>
      {href === undefined ? (
        action ? <span className="studio-detail-row__action">{action}</span> : null
      ) : (
        // Decorative: the row's own text is its accessible name, so the chevron never
        // has to speak. It is rotated per direction in the stylesheet — "onward" is
        // leftward in Hebrew and rightward in English, and no logical transform exists.
        <Icon name="chevronDown" size={16} />
      )}
    </>
  )

  return href === undefined ? (
    <div className="studio-detail-row" data-testid={testId}>
      {body}
    </div>
  ) : (
    <a className="studio-detail-row" data-testid={testId} href={href}>
      {body}
    </a>
  )
}
