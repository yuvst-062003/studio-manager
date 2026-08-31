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
import type { ReactNode } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { startUrl, useAuthProviders } from './useAuthProviders'
import './gladiator-signin.css'

export type { SignInProvider } from './useAuthProviders'

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
  const providers = useAuthProviders()

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
              href={startUrl(provider, app, returnPath)}
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
