// §6.1 step 2 — '[ המשך עם Google ] [ המשך עם Apple ] — system browser only, never a
// webview (§5.2)'.
//
// Each button is a plain <a href>, so the browser performs a TOP-LEVEL NAVIGATION. Never
// fetch, never an iframe, never a popup: §5.2 says "OAuth must never run inside a webview.
// Google returns disallowed_useragent", and an in-page request is the first step toward
// being one.
//
// The provider list comes from GET /auth/providers, which returns only providers whose
// credentials are configured. A button for an unconfigured provider fails one step AFTER
// the user has picked their account — which is worse than no button, and is what keeps
// Apple invisible until HB-apple-developer closes.
//
// The face is the Gladiator split screen (docs/design "Gladiator Login 5a", 2026-08-27):
// wordmark, red rule, role eyebrow, provider buttons over the sun-and-throw artwork.
// Layout and copy follow the document direction; the artwork keeps its physical
// composition — see gladiator-signin.css.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import './gladiator-signin.css'
import logoUrl from './assets/gladiator-logo.png'

export type SignInProvider = { name: string; start_url: string }

/**
 * Where the API lives. The same variable `@studio/core` bakes into `apiUrl` — declared
 * again here because ui must not import core (the dependency runs the other way). Empty
 * in development, where the Vite proxy makes relative paths reach the API; absolute in a
 * deployed build, where the start links below must navigate to the API's own origin for
 * the callback to set its cookie there.
 */
const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? ''

const LABEL: Record<string, string> = {
  google: 'common.auth.continueWithGoogle',
  apple: 'common.auth.continueWithApple',
}

const BUTTON_CLASS: Record<string, string> = {
  google: 'gsignin__btn gsignin__btn--google',
  apple: 'gsignin__btn gsignin__btn--apple',
}

export function SignIn({
  locale,
  app,
  returnPath = '/',
  languagePicker,
}: {
  locale: Locale
  app: 'staff' | 'parent' | 'dashboard'
  returnPath?: string
  /** §6.1 puts language before login; the screen floats it over the artwork. */
  languagePicker?: ReactNode
}) {
  const [providers, setProviders] = useState<SignInProvider[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await fetch(`${API_ORIGIN}/api/v1/auth/providers`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const body = await response.json()
        if (alive) setProviders(body.items ?? [])
      } catch {
        // Offline on the sign-in screen means no buttons, which is the truth. An error
        // banner here would ask someone to act on something they cannot fix.
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const providerLinks = (providers ?? []).map((provider) => ({
    key: provider.name,
    href: `${API_ORIGIN}${provider.start_url}?app=${app}&return_path=${encodeURIComponent(returnPath)}`,
    label: t(locale, LABEL[provider.name] ?? 'common.auth.continueWithGoogle'),
  }))

  // The PARENT app's own face — the owner's Stitch design of 2026-09-01. Scoped by
  // `app` rather than replacing the screen, because this one file also serves the staff
  // app and the dashboard, and the brief was for parents. The other two are unmoved.
  if (app === 'parent') {
    return (
      <div className="gsignin gsignin--parent" data-testid="sign-in">
        <div className="gsignin-parent__rule" />
        {/* The watermark lives INSIDE the ground, which is the absolutely-positioned
            layer. As a sibling it was a flex item of the column instead — 600px of
            real layout that pushed the logo, the button and the footer down and grew
            the page from 844 to 1249. Decorative either way, and marked so: a screen
            reader announcing "柔道" on a Hebrew sign-in screen is noise. */}
        <div className="gsignin-parent__ground" aria-hidden="true">
          <span className="gsignin-parent__kanji">柔道</span>
        </div>

        <div className="gsignin-parent__body">
          {/* The club's own mark. `alt` carries the app's full name, which is what
              distinguishes the three apps where the logo alone cannot. */}
          <img
            className="gsignin-parent__logo"
            src={logoUrl}
            alt={t(locale, `common.appName.${app}`)}
          />

          <div className="gsignin-parent__stack">
            {providerLinks.map((provider) => (
              <a key={provider.key} className="gsignin-parent__cta" href={provider.href}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                </svg>
                {provider.key === 'google'
                  ? t(locale, 'common.auth.signInWithGoogle')
                  : provider.label}
              </a>
            ))}
            {providers !== null && providers.length === 0 ? (
              <p className="gsignin-parent__fine">{t(locale, 'common.auth.noProviders')}</p>
            ) : (
              <p className="gsignin-parent__hint">{t(locale, 'common.auth.parentHint')}</p>
            )}
          </div>
        </div>

        <div className="gsignin-parent__foot">
          {languagePicker}
          <div className="gsignin-parent__links">
            {/* Hebrew, and the app's own screens — the design drew these in English on
                a Hebrew page, and pointed them nowhere. */}
            <a className="gsignin-parent__link" href="#/privacy">
              {t(locale, 'reports.privacy.policy.title')}
            </a>
            <span className="gsignin-parent__dot" aria-hidden="true">
              ·
            </span>
            <a className="gsignin-parent__link" href="#/privacy">
              {t(locale, 'reports.privacy.terms.title')}
            </a>
          </div>
          {/* The year is READ, never written into the bundle. The design hardcoded
              2024, which was already two years stale when it arrived and would have
              shipped a wrong date that nobody looks at until a parent does. */}
          <p className="gsignin-parent__copyright">
            © {new Date().getFullYear()} Gladiator · {t(locale, 'common.auth.rights')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="gsignin" data-testid="sign-in">
      {languagePicker ? <div className="gsignin__lang">{languagePicker}</div> : null}
      <div className="gsignin__art" aria-hidden="true" />
      <div className="gsignin__scrim" />
      <div className="gsignin__form">
        {/* The wordmark is the visual; the app's full name stays the accessible one —
            'Gladiator Coach' distinguishes the three apps where GLADIATOR CLUB cannot. */}
        <h1 className="gsignin__wordmark" aria-label={t(locale, `common.appName.${app}`)}>
          <span aria-hidden="true" className="gsignin__wordmark-name">
            {t(locale, 'common.brand.wordmark')}
          </span>
          <span aria-hidden="true" className="gsignin__wordmark-club">
            {t(locale, 'common.brand.club')}
          </span>
        </h1>
        <div className="gsignin__rule" aria-hidden="true" />
        <div className="gsignin__stack">
          <span className="gsignin__eyebrow">{t(locale, `common.auth.eyebrow.${app}`)}</span>
          {(providers ?? []).map((provider) => (
            <a
              key={provider.name}
              className={BUTTON_CLASS[provider.name] ?? 'gsignin__btn gsignin__btn--google'}
              href={`${API_ORIGIN}${provider.start_url}?app=${app}&return_path=${encodeURIComponent(returnPath)}`}
            >
              {t(locale, LABEL[provider.name] ?? 'common.auth.continueWithGoogle')}
            </a>
          ))}
          {providers !== null && providers.length === 0 ? (
            // The state every developer machine is in: no OAuth client configured, so the
            // list is honestly empty. Saying so beats a card with a hole in it — and in
            // production this renders only if configuration is genuinely broken, which is
            // exactly when a person at this screen should be told something is wrong.
            <p className="gsignin__fine">{t(locale, 'common.auth.noProviders')}</p>
          ) : (
            <p className="gsignin__fine">{t(locale, 'common.auth.noPasswords')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
