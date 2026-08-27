// The install NUDGE that replaced §6.5's install WALL (feature pass 2026-08-27).
//
// The wall rendered InstallWalkthrough instead of the app; the product decision that
// removed it is that nobody is forced to install — the browser tab is a first-class way
// to use the app. What §6.5 still gets is the pitch: this banner sits on the home
// screen, says why installing is worth it (push on iOS exists only for a home-screen
// app), and opens the walkthrough on demand. Dismissing it is remembered per device —
// a nudge that reappears on every visit is a wall with extra steps.
import { useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** One key, both apps: the choice "I use this in the browser" is about the device. */
const DISMISSED_KEY = 'studio.install.dismissed'

function readDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Storage can throw in private modes; a banner is never worth crashing over.
    return true
  }
}

export function InstallBanner({
  locale,
  installed,
  onOpenWalkthrough,
}: {
  locale: Locale
  /** From core's display-mode hook — ui must not import core, so the app passes it. */
  installed: boolean
  onOpenWalkthrough: () => void
}) {
  const [dismissed, setDismissed] = useState(readDismissed)

  if (installed || dismissed) return null

  return (
    <div className="studio-install-banner" data-testid="install-banner" role="note">
      <span className="studio-install-banner__text">{t(locale, 'common.install.banner.text')}</span>
      <div className="studio-install-banner__actions">
        <button type="button" className="studio-install-banner__cta" onClick={onOpenWalkthrough}>
          {t(locale, 'common.install.banner.cta')}
        </button>
        <button
          type="button"
          className="studio-install-banner__dismiss"
          data-testid="install-banner-dismiss"
          onClick={() => {
            try {
              globalThis.localStorage?.setItem(DISMISSED_KEY, '1')
            } catch {
              // The in-memory dismissal below still holds for this visit.
            }
            setDismissed(true)
          }}
        >
          {t(locale, 'common.install.banner.dismiss')}
        </button>
      </div>
    </div>
  )
}
