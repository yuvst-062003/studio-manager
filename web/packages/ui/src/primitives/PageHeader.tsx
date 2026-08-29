import type { ReactNode } from 'react'

/**
 * The one row at the top of a screen: what this screen is, and what you can do on it.
 *
 * The shipped `#/schedule` stacks four things that belong in this row — a floating
 * search field, the page title, a **full-width** primary button, and three loose week
 * buttons — as four separate rows. A primary action stretched across the whole content
 * column stops reading as a button and reads as a banner, and nothing in the stack is
 * visibly related to anything else.
 *
 * `subtitle` carries the studio name, or which week a board is showing. A node rather
 * than a string because a range of dates has to arrive as `RangeText` — interpolating
 * one into a string is how `2027-09-01 – 2026-09-01` reached staging. It belongs here
 * and **only** here: the shipped dashboard renders `מועדון גלדיאטור` twice, once in the
 * top bar and once in the nav.
 *
 * `actions` is a slot rather than a list of buttons, because a screen's action set is
 * that screen's business — this component owns the row, not its contents. Wrap them in
 * `ActionBar` when there is more than one and they need a rank.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={className ? `studio-page-header ${className}` : 'studio-page-header'}>
      <div className="studio-page-header__titles">
        <h1 className="studio-page-header__title">{title}</h1>
        {subtitle ? <p className="studio-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="studio-page-header__actions">{actions}</div> : null}
    </header>
  )
}
