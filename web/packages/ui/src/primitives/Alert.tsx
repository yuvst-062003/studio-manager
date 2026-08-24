import type { ReactNode } from 'react'

export type AlertTone = 'danger' | 'pending' | 'paid'

/**
 * Artboard 4h, card מצב ריק והתראה — the banner half.
 *
 * `live` is opt-in. 4h's banner is static page content: a declaration that was already
 * missing when the screen loaded. role="alert" on static content makes a screen reader
 * interrupt itself on every render, and people learn to ignore an alert that always
 * fires. Pass `live` only when the banner appears in response to something just done.
 *
 * 4h draws the body text in #8f1f19, a hex used nowhere else on the artboard and not a
 * token. --danger measures 5.88:1 on this banner's own tinted ground, comfortably past
 * AA, so the extra value would buy nothing and would need its own role and audit entry.
 */
export function Alert({
  tone,
  iconLabel,
  live = false,
  children,
}: {
  tone: AlertTone
  iconLabel: string
  live?: boolean
  children: ReactNode
}) {
  return (
    <div className="studio-alert" data-tone={tone} {...(live ? { role: 'alert' } : {})}>
      <span aria-label={iconLabel} className="studio-alert__icon" role="img">
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 20 20"
        >
          <path d="M10 2.5 18.5 17h-17z" />
          <path d="M10 8v3.5M10 14.2v.1" />
        </svg>
      </span>
      <p className="studio-alert__body">{children}</p>
    </div>
  )
}
