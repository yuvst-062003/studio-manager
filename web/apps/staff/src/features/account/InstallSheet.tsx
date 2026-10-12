// §6.5's install walkthrough, as a popup in settings (owner, 2026-10-13).
//
// It was a SCREEN at `#/install`, reached from two places: `InstallBanner`'s nudge and a row
// that briefly lived on the schedule tab. A walkthrough is three sentences and a button —
// a page with a back link around it was more navigation than content, and the owner asked
// for it where every other setting now is.
//
// Both doors open this same dialog: the banner at the top of Today, and the row under
// ניהול המועדון. Which matters, because the banner is the one most people will ever use and
// the row is how somebody finds it again a week later.
import { Smartphone, X } from 'lucide-react'
import { InstallWalkthrough, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export function InstallSheet({
  locale,
  installed,
  deferredPrompt,
  onClose,
}: {
  locale: Locale
  installed: boolean
  /** The browser's own `beforeinstallprompt`, held by `App`. `InstallWalkthrough` turns it
   *  into a one-tap install where the browser offers one and into instructions where it
   *  does not (iOS Safari). */
  deferredPrompt: Parameters<typeof InstallWalkthrough>[0]['deferredPrompt']
  onClose: () => void
}) {
  const dialogRef = useModalDialog(true, onClose)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-title"
        tabIndex={-1}
        data-testid="install-sheet"
        className="tw-scope bg-[var(--surface-raised)] w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-[var(--border)] space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" aria-hidden="true" />
            </span>
            <h2 id="install-sheet-title" className="text-sm font-black text-[var(--fg)] truncate">
              {t(locale, 'common.install.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'people.profile.close')}
            data-testid="install-sheet-close"
            className="w-9 h-9 rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {installed ? (
          <p className="text-xs text-[var(--text-secondary)] m-0" data-testid="install-done">
            {t(locale, 'common.install.done')}
          </p>
        ) : (
          <InstallWalkthrough locale={locale} installed={false} deferredPrompt={deferredPrompt} />
        )}
      </div>
    </div>
  )
}
