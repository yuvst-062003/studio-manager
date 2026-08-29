import type { ReactNode } from 'react'

/**
 * One number, what it means, and where to go to act on it.
 *
 * The manager home's money band is three of these. Nothing in the product shows a
 * headline figure today — the canvas-to-code audit counted **zero** coloured bars and
 * zero accent colours across the whole dashboard, and a manager cannot see what the club
 * is owed without opening `#/billing`.
 *
 * `tone` is a **semantic** choice, not a colour one: `debt` and `paid` map to the tokens
 * that already mean those things everywhere else. There is no `tone="red"`, deliberately
 * — a tile coloured for emphasis rather than meaning is exactly what D3 forbids.
 *
 * `value` is a node, not a string, so money arrives as `MoneyDisplay` and is never
 * interpolated into text. That is not fussiness: the Stitch draft of this screen rendered
 * `$14,250-` and reversed every time range, both of which are what happens when numbers
 * are concatenated into an RTL string.
 *
 * With `href` the whole tile is the target — a manager reaching for a number should not
 * have to find a small link inside it.
 */
export type StatTone = 'neutral' | 'debt' | 'paid' | 'pending'

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: StatTone
  href?: string
  className?: string
}) {
  const body = (
    <>
      <span className="studio-stat-tile__label">{label}</span>
      <span className="studio-stat-tile__value">{value}</span>
      {hint ? <span className="studio-stat-tile__hint">{hint}</span> : null}
    </>
  )
  const classes = className ? `studio-stat-tile ${className}` : 'studio-stat-tile'
  return href ? (
    <a className={classes} data-tone={tone} href={href}>
      {body}
    </a>
  ) : (
    <div className={classes} data-tone={tone}>
      {body}
    </div>
  )
}
