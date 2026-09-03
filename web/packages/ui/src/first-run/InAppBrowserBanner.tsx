// SPEC §5.2 / the constraints table: "OAuth in embedded webviews — blocked by Google
// (disallowed_useragent); must use system browser." §6.1's own trial-booking link is
// deliberately written to go "on Instagram, on a flyer QR, in the club's bio" — so a
// guardian tapping [ המשך עם Google ] from inside Instagram's, Facebook's or TikTok's
// own in-app browser is not a rare accident, it is the marketing channel this product
// asks for, hitting a wall Google put there on purpose.
//
// **iOS gets no automatic fix — there isn't one.** Apple does not let a page hand itself
// off to Safari, and Instagram closes the JS tricks people find for it every few months.
// The honest answer is the banner below, pointing at the in-app browser's OWN escape
// hatch (the ⋯ menu's "Open in Safari" / "Open in external browser").
//
// **Android gets a real fix.** Android's `intent://` scheme is honoured by the OS even
// from inside another app's WebView, so this component tries it automatically there —
// see `chromeIntentUrl`.
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Alert } from '../primitives/Alert'

export type InAppBrowser = 'instagram' | 'facebook' | 'tiktok' | 'linkedin'

//: Ordered by how often a club's own marketing actually hits each one — Instagram is
//: §6.1's own named channel. Facebook's signature is `FBAN`/`FBAV` (never "Facebook"
//: itself); TikTok's WebView still carries its old app name, `musical_ly`.
const SIGNATURES: [InAppBrowser, RegExp][] = [
  ['instagram', /Instagram/i],
  ['facebook', /FBAN|FBAV/i],
  ['tiktok', /musical_ly|BytedanceWebview/i],
  ['linkedin', /LinkedInApp/i],
]

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  const match = SIGNATURES.find(([, pattern]) => pattern.test(userAgent))
  return match ? match[0] : null
}

/**
 * Android's intent scheme. `S.browser_fallback_url` is not decoration: without it, a
 * device with no Chrome installed (rare, but real) lands on a dead error instead of the
 * same page it was already on.
 */
export function chromeIntentUrl(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '')
  return (
    `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`
  )
}

const bannerStyle: CSSProperties = {
  marginBlockEnd: 'var(--space-3)',
}

export function InAppBrowserBanner({
  locale,
  userAgent = globalThis.navigator?.userAgent ?? '',
  currentUrl = globalThis.location?.href ?? '',
  navigate = (url: string) => {
    globalThis.location.href = url
  },
}: {
  locale: Locale
  userAgent?: string
  currentUrl?: string
  /** Injected for testability — production never overrides it. */
  navigate?: (url: string) => void
}) {
  const app = detectInAppBrowser(userAgent)
  const isAndroid = /Android/i.test(userAgent)

  useEffect(() => {
    if (app && isAndroid && currentUrl) navigate(chromeIntentUrl(currentUrl))
  }, [app, isAndroid, currentUrl, navigate])

  if (!app) return null

  return (
    <div style={bannerStyle} data-testid="in-app-browser-banner">
      {/* `pending`, not `danger` (G13) — a guardian has not done anything wrong, and
          Android is about to fix this for them without a second render to show for it. */}
      <Alert tone="pending" iconLabel={t(locale, 'common.auth.inAppBrowser.title')}>
        {t(locale, 'common.auth.inAppBrowser.body').replace(
          '{{app}}',
          t(locale, `common.auth.inAppBrowser.app.${app}`),
        )}{' '}
        {t(locale, 'common.auth.inAppBrowser.instruction')}
      </Alert>
    </div>
  )
}
