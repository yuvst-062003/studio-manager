// The dashboard app's sign-in — the owner's Stitch export "Dojo Hazon", 2026-09-01.
//
// Three sign-in faces now exist, one per app, and they differ only in paint:
//
//   · `SignIn`            — the cream split screen, still the parent app's.
//   · `ManagerSignIn`     — the staff app's navy screen (2026-09-01).
//   · `DashboardSignIn`   — this one. The same flow on a LIGHT ground: a #f7f9fb tatami
//                           field, a blueprint grid, the 柔道 watermark, and one glass
//                           card carrying the crest and a single Google button.
//
// The rules that matter are unchanged, because they are about the FLOW and not the paint:
//
//   · the button is a plain <a href>, so the browser performs a TOP-LEVEL NAVIGATION.
//     Never fetch, never an iframe, never a popup — §5.2: "OAuth must never run inside a
//     webview. Google returns disallowed_useragent."
//   · the provider list comes from GET /auth/providers, so a button never appears for a
//     provider whose credentials are not configured.
//
// Both live in `useAuthProviders`, shared with the other two screens so a future provider
// cannot be added to one face and forgotten on the other two.
//
// §6.1 still puts language before login — "a Russian-speaking parent cannot read a Hebrew
// consent screen" — and this mock puts the switcher in the TOP BAR rather than the footer,
// so that is where it is.
import { LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ENDONYM } from './LanguagePicker'
import { startUrl, useAuthProviders } from './useAuthProviders'
import logo from './assets/gladiator-team.png'
import './dashboard-signin.css'

/**
 * Google's own mark, the four-path original from the export. It is the ONE thing on this
 * screen that must not be re-coloured or re-drawn: Google's branding terms require the
 * mark as issued, which is also why it sits in a white tile on the navy button rather
 * than being flattened to `currentColor` the way the other faces' glyphs are.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export function DashboardSignIn({
  locale,
  onChooseLocale,
  returnPath = '/',
}: {
  locale: Locale
  /** §6.1 step 1, in the top bar the mock draws it in. */
  onChooseLocale: (locale: Locale) => void
  returnPath?: string
}) {
  const providers = useAuthProviders()
  // The mock draws exactly one button. Apple is not configured for this app, and when it
  // is, `useAuthProviders` will return it — so render whatever the server offers rather
  // than hard-coding Google and shipping a screen that cannot grow a second button.
  const list = providers ?? []

  return (
    <div className="dsignin" data-testid="sign-in">
      {/* Three decorative layers. `aria-hidden` on all of them: they are texture, and a
          screen reader has nothing useful to say about a gradient or a watermark. */}
      <div className="dsignin__ground" aria-hidden="true" />
      <div className="dsignin__grid" aria-hidden="true" />
      <div className="dsignin__kanji" aria-hidden="true">
        柔道
      </div>

      <header className="dsignin__bar">
        {/* Not a heading. The page's heading is the card's — "sign in" is what this screen
            is FOR, and a wordmark that outranked it would make the H1 a brand name. */}
        <div className="dsignin__wordmark">{t(locale, 'common.auth.dashboard.wordmark')}</div>
        <div className="dsignin__langs">
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              lang={option}
              className="dsignin__lang"
              aria-pressed={option === locale}
              onClick={() => onChooseLocale(option)}
            >
              {ENDONYM[option]}
            </button>
          ))}
        </div>
      </header>

      <main className="dsignin__main">
        <div className="dsignin__card">
          <div className="dsignin__rule" aria-hidden="true" />

          {/* The club mark carries the app's identity, so its alt text is the app's own
              name — 'Gladiator Manager' is what distinguishes this screen from the other
              two, which the wordmark on the crest cannot. */}
          <img className="dsignin__logo" src={logo} alt={t(locale, 'common.appName.dashboard')} />

          <div className="dsignin__heading">
            <h1 className="dsignin__title">{t(locale, 'common.auth.dashboard.title')}</h1>
            <p className="dsignin__blurb">{t(locale, 'common.auth.dashboard.blurb')}</p>
          </div>

          <div className="dsignin__cta">
            {list.map((provider) => (
              <a
                key={provider.name}
                className="dsignin__btn"
                href={startUrl(provider, 'dashboard', returnPath)}
              >
                <span className="dsignin__gtile" aria-hidden="true">
                  <GoogleMark />
                </span>
                <span className="dsignin__btn-label">
                  {t(locale, 'common.auth.signInWithGoogle')}
                </span>
              </a>
            ))}
            {providers !== null && providers.length === 0 ? (
              // The state every developer machine is in: no OAuth client configured, so
              // the list is honestly empty. In production this renders only if
              // configuration is genuinely broken — exactly when a person at this screen
              // should be told something is wrong rather than shown an empty card.
              <p className="dsignin__fine">{t(locale, 'common.auth.noProviders')}</p>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="dsignin__footer">
        <div className="dsignin__copy">{t(locale, 'common.auth.dashboard.copyright')}</div>
      </footer>
    </div>
  )
}
