import type { ReactNode } from 'react'

/**
 * Artboard 4h, card מצב ריק והתראה — the dashed container half.
 *
 * The title is a heading rather than styled text so it lands in the document outline: an
 * empty state is often the only thing on a screen, and "אין שיעורים ביום זה" is what that
 * screen is about.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="studio-empty">
      <svg
        aria-hidden="true"
        className="studio-empty__icon"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <rect height="15" rx="2" width="18" x="3" y="5" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      <h3 className="studio-empty__title">{title}</h3>
      {description ? <p className="studio-empty__description">{description}</p> : null}
      {action}
    </div>
  )
}
