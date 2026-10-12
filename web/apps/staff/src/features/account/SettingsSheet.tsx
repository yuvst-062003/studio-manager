// The one popup shell every settings row opens into (owner, 2026-10-13).
//
// **Why a sheet rather than a block on the page.** The account tab had grown into a column
// of fully expanded panels — six notification switches, the calendar-sync buttons with their
// explanation, the language radios, the theme control, the emergency-contact form — all open
// at once, all the time, so reaching the bottom meant scrolling past settings nobody was
// looking for. A settings screen is a list of doors; what is behind a door opens when it is
// asked for. Each row is one line now, and the panel it owns renders here.
//
// Modelled on `EditProfileSheet`, which is this app's existing dialog and already solved the
// hard parts: `useModalDialog` traps focus, closes on Escape and restores focus to the
// opener. The two are deliberately the same shape so a reader meets one dialog idiom.
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { LucideIcon } from 'lucide-react'

export function SettingsSheet({
  locale,
  title,
  icon: Icon,
  testId,
  onClose,
  children,
}: {
  locale: Locale
  title: string
  icon: LucideIcon
  /** The dialog's own test id. The opening row carries `<testId>-open`, so a test reads the
   *  pair without inventing a naming convention per sheet. */
  testId: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useModalDialog(true, onClose)
  const titleId = `${testId}-title`

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        // Bottom sheet on a phone, centred card from `sm` up: the thumb is at the bottom of
        // the screen and §6.2 builds this app for one-handed use on a mat. `max-h` with its
        // own scroll so a long panel scrolls INSIDE the sheet and the page behind stays put.
        className="bg-[var(--surface-raised)] w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-[var(--border)] space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 sticky -top-5 bg-[var(--surface-raised)] -mx-5 px-5 -mt-5 pt-5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] flex items-center justify-center shrink-0 font-bold">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <h2 id={titleId} className="text-sm font-black text-[var(--fg)] truncate">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'people.profile.close')}
            data-testid={`${testId}-close`}
            className="w-9 h-9 rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="text-xs">{children}</div>
      </div>
    </div>
  )
}
