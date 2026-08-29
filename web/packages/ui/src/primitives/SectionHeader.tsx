import type { ReactNode } from 'react'

/**
 * A section's title with an optional trailing action on the far edge.
 *
 * Every production app in the competitive set gives each section a header and a way out
 * of it — Arbox's `Book a service` / `View all`, Gymdesk's card headers. The shipped
 * dashboard has neither: sections begin with a bare string and offer no route onward,
 * which is a large part of why screens read as assembled rather than designed.
 *
 * `level` exists because a section heading's rank is a document-structure decision the
 * *screen* makes, not this component — a card nested inside another region needs `3`
 * where a top-level region needs `2`. Defaulting to 2 keeps the common case silent.
 */
export function SectionHeader({
  title,
  action,
  level = 2,
  className,
}: {
  title: string
  action?: ReactNode
  level?: 2 | 3
  className?: string
}) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <div className={className ? `studio-section-header ${className}` : 'studio-section-header'}>
      <Heading className="studio-section-header__title">{title}</Heading>
      {action ? <div className="studio-section-header__action">{action}</div> : null}
    </div>
  )
}
