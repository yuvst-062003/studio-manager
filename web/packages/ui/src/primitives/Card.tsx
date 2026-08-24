import { useId } from 'react'
import type { ReactNode } from 'react'

/**
 * Artboard 4h wraps all eight of its panels in one surface. This is that surface.
 *
 * The caption becomes the region's accessible name rather than a bare heading, so a
 * screen-reader user can tell which group of controls they are inside — 4h's captions are
 * group labels, not document structure.
 */
export function Card({
  caption,
  className,
  children,
}: {
  caption?: string
  className?: string
  children: ReactNode
}) {
  const captionId = useId()
  return (
    <section
      className={className ? `studio-card ${className}` : 'studio-card'}
      {...(caption ? { 'aria-labelledby': captionId } : {})}
    >
      {caption ? (
        <p className="studio-card__caption" id={captionId}>
          {caption}
        </p>
      ) : null}
      {children}
    </section>
  )
}
