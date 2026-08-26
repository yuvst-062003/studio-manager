// §6.5 — 'the invitation link detects iOS and opens a walkthrough with a screenshot, and
// first run does not proceed until the app is running in standalone display mode.'
//
// G17 restates the constraint that shapes this whole component: "On iOS, Web Push exists
// only for a home-screen web app, and there is no way to *trigger* an install
// (`beforeinstallprompt` is Chromium-only)." So iOS is TAUGHT and Chromium is PROMPTED,
// and the two paths are genuinely different rather than one path with a fallback.
//
// §6.5: "An App Store build would not remove that install step, only make it familiar. So
// the install is treated as part of onboarding, not an afterthought" — which is why this
// renders before the app, not as a dismissible banner beside it.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** The `beforeinstallprompt` event, which TypeScript's DOM lib does not declare because
 *  it is not standardised — it is Chromium-only, which is the whole reason iOS needs the
 *  taught path below. */
export type InstallPromptEvent = Event & { prompt: () => Promise<void> }

const stepsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  marginBlockStart: 'var(--space-4)',
}

const shotStyle: CSSProperties = {
  maxInlineSize: '100%',
  borderRadius: 'var(--radius-md)',
  border: 'var(--border-width-hairline) solid var(--border)',
}

/**
 * iOS Safari, by user agent.
 *
 * There is no feature test for "can be added to the home screen" — the capability has no
 * API, which is exactly the problem §6.5 describes. Chromium on iOS is also WebKit and
 * also cannot prompt, so it belongs on the taught path too and the check deliberately
 * does not try to exclude it.
 */
export function isIosSafari(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent)
}

export function InstallWalkthrough({
  locale,
  installed,
  deferredPrompt = null,
  userAgent = globalThis.navigator?.userAgent ?? '',
}: {
  locale: Locale
  /**
   * Whether the app is running from a home screen. A boolean rather than a display mode,
   * for two reasons: `@studio/ui` must not import `@studio/core` (the dependency runs the
   * other way), and §6.5's gate is about the home screen rather than about `standalone`
   * specifically — `fullscreen` and `minimal-ui` are home-screen launches too, which is
   * exactly what `isInstalled()` already encodes.
   */
  installed: boolean
  deferredPrompt?: InstallPromptEvent | null
  userAgent?: string
}) {
  // Which prompt event has been consumed, rather than a boolean synced to the prop in an
  // effect. Chromium fires `beforeinstallprompt` again after a dismissal, and each event
  // may be prompted with exactly once -- so the question the button asks is not "has
  // something been prompted?" but "has THIS event been?". Holding the event itself answers
  // that by comparison during render: a new event is automatically un-consumed, with no
  // effect to keep in step and nothing to reset.
  const [promptedFor, setPromptedFor] = useState<InstallPromptEvent | null>(null)

  // §6.5's gate: "first run does not proceed until the app is running in standalone
  // display mode." Once it is, this screen has nothing left to say.
  if (installed) return null

  const ios = isIosSafari(userAgent)

  return (
    <section aria-label={t(locale, 'common.install.title')} data-testid="install-walkthrough">
      <h2>{t(locale, 'common.install.title')}</h2>
      <p>{t(locale, 'common.install.why')}</p>

      {ios ? (
        <div style={stepsStyle} data-testid="ios-add-to-home-screen">
          {/* An inline SVG rather than a bitmap: it is one shape, it scales, and it costs
              no request. `role="img"` with a name, because §6.5's reader has never seen
              this icon and "tap the icon" beside a silent picture is not instructions. */}
          <svg
            role="img"
            aria-label={t(locale, 'common.install.ios.shareIcon')}
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 3v12M12 3l-3.5 3.5M12 3l3.5 3.5" />
            <path d="M6 12v7.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V12" />
          </svg>
          <ol>
            <li>{t(locale, 'common.install.ios.step1')}</li>
            <li>{t(locale, 'common.install.ios.step2')}</li>
            <li>{t(locale, 'common.install.ios.step3')}</li>
          </ol>
          <img
            src="/install/ios-share-menu.png"
            alt={t(locale, 'common.install.ios.screenshotAlt')}
            style={shotStyle}
          />
        </div>
      ) : deferredPrompt ? (
        // Chromium. §6.5's table: 'Install prompt — beforeinstallprompt — a real button.'
        <button
          type="button"
          disabled={promptedFor === deferredPrompt}
          onClick={() => {
            setPromptedFor(deferredPrompt)
            void deferredPrompt.prompt()
          }}
        >
          {t(locale, 'common.install.button')}
        </button>
      ) : null}
    </section>
  )
}
