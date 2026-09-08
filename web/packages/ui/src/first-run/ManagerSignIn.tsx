// The staff app's sign-in — docs/design "Gladiator Manager Sign In", 2026-09-01.
//
// `SignIn` (the cream split screen) still serves parent and dashboard. This is the same
// flow wearing the manager face: navy ground, gold rule, the club badge, one Google
// button, and a footer carrying language and the two legal documents.
//
// The rules that matter are `SignIn`'s and are unchanged, because they are about the
// FLOW and not the paint:
//
//   · the button is a plain <a href>, so the browser performs a TOP-LEVEL NAVIGATION.
//     Never fetch, never an iframe, never a popup — §5.2: "OAuth must never run inside a
//     webview. Google returns disallowed_useragent."
//   · the provider list comes from GET /auth/providers, so a button never appears for a
//     provider whose credentials are not configured.
//
// Both live in `useAuthProviders`, shared with `SignIn` so a future provider cannot be
// added to one screen and forgotten on the other.
//
// §6.1 still puts language before login — "a Russian-speaking parent cannot read a Hebrew
// consent screen" — and the mock puts it in the footer, so that is where it is. The legal
// links open INSIDE this app (`#/terms`, `#/privacy-policy`) rather than sending someone
// who is not signed in to another app's origin.
import { LOCALES, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ENDONYM } from './LanguagePicker'
import { startUrl, useAuthProviders } from './useAuthProviders'
import logo from './assets/gladiator-team.png'
import './manager-signin.css'

/** Where the footer's two documents live in the staff app's hash router. */
export const TERMS_HASH = '#/terms'
export const PRIVACY_HASH = '#/privacy-policy'

// The mock's two Material Symbols glyphs, as outlines rather than the 1.1MB variable font
// two icons would otherwise drag onto a screen that has to load before anyone can do
// anything. Traced from `Material Symbols Outlined` at its default instance (FILL 0,
// wght 400) — the em box is 960 units, which is what the viewBox says.
const SHIELD_PERSON =
  'M480 -440Q421 -440 380.5 -480.5Q340 -521 340 -580Q340 -639 380.5 -679.5Q421 -720 480 -720Q539 -720 579.5 -679.5Q620 -639 620 -580Q620 -521 579.5 -480.5Q539 -440 480 -440ZM480 -520Q506 -520 523 -537Q540 -554 540 -580Q540 -606 523 -623Q506 -640 480 -640Q454 -640 437 -623Q420 -606 420 -580Q420 -554 437 -537Q454 -520 480 -520ZM480 -80Q341 -115 250.5 -239.5Q160 -364 160 -516V-760L480 -880L800 -760V-516Q800 -364 709.5 -239.5Q619 -115 480 -80ZM480 -795 240 -705V-516Q240 -462 255 -411Q270 -360 296 -315Q338 -336 384 -348Q430 -360 480 -360Q530 -360 576 -348Q622 -336 664 -315Q690 -360 705 -411Q720 -462 720 -516V-705ZM345 -250Q374 -220 408 -198Q442 -176 480 -164Q518 -176 552 -198Q586 -220 615 -250Q584 -264 550 -272Q516 -280 480 -280Q444 -280 410 -272Q376 -264 345 -250Z'
const LOGIN =
  'M480 -120V-200H760Q760 -200 760 -200Q760 -200 760 -200V-760Q760 -760 760 -760Q760 -760 760 -760H480V-840H760Q793 -840 816.5 -816.5Q840 -793 840 -760V-200Q840 -167 816.5 -143.5Q793 -120 760 -120ZM400 -280 345 -338 447 -440H120V-520H447L345 -622L400 -680L600 -480Z'

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

export function ManagerSignIn({
  locale,
  onChooseLocale,
  returnPath = '/',
}: {
  locale: Locale
  /** §6.1 step 1, in the footer the mock draws it in. */
  onChooseLocale: (locale: Locale) => void
  returnPath?: string
}) {
  const providers = useAuthProviders()
  // The mock draws exactly one button. Apple is not configured for this app, and when it
  // is, `useAuthProviders` will return it — so render whatever the server offers rather
  // than hard-coding Google and shipping a screen that cannot grow a second button.
  const list = providers ?? []

  return (
    <div className="msignin" data-testid="sign-in">
      {/* Four decorative layers and the kanji. `aria-hidden` on all of them: they are
          texture, and a screen reader has nothing useful to say about a gradient. */}
      <div className="msignin__ground" aria-hidden="true" />
      <div className="msignin__grid" aria-hidden="true" />
      <div className="msignin__hatch" aria-hidden="true" />
      <div className="msignin__vignette" aria-hidden="true" />
      <div className="msignin__kanji" aria-hidden="true">
        柔道
      </div>

      <div className="msignin__inner">
        <main className="msignin__main">
          <div className="msignin__badge">
            <span>{t(locale, 'common.auth.manager.badge')}</span>
            <Glyph d={SHIELD_PERSON} />
          </div>

          {/* The club mark carries the app's identity, so its alt text is the app's own
              name — 'Gladiator Coach' is what distinguishes this screen from the other
              two, which the wordmark on the crest cannot. */}
          <img className="msignin__logo" src={logo} alt={t(locale, 'common.appName.staff')} />

          <div className="msignin__cta">
            {list.map((provider) => (
              <a
                key={provider.name}
                className="msignin__btn"
                href={startUrl(provider, 'staff', returnPath)}
              >
                <Glyph d={LOGIN} />
                {t(locale, 'common.auth.manager.signInWithGoogle')}
              </a>
            ))}
            <p className="msignin__blurb">
              {providers !== null && providers.length === 0
                ? // The state every developer machine is in: no OAuth client configured,
                  // so the list is honestly empty. In production this renders only if
                  // configuration is genuinely broken — exactly when a person at this
                  // screen should be told something is wrong rather than shown a blurb
                  // about a button that is not there.
                  t(locale, 'common.auth.noProviders')
                : t(locale, 'common.auth.manager.blurb')}
            </p>
          </div>
        </main>

        <footer className="msignin__footer">
          <div className="msignin__langs">
            {LOCALES.map((option) => (
              <button
                key={option}
                type="button"
                lang={option}
                className="msignin__lang"
                aria-pressed={option === locale}
                onClick={() => onChooseLocale(option)}
              >
                {ENDONYM[option]}
              </button>
            ))}
          </div>
          <div className="msignin__legal">
            <a href={TERMS_HASH}>{t(locale, 'common.auth.manager.terms')}</a>
            <span className="msignin__dot" aria-hidden="true">
              •
            </span>
            <a href={PRIVACY_HASH}>{t(locale, 'common.auth.manager.privacy')}</a>
          </div>
          <div className="msignin__copy">{t(locale, 'common.auth.manager.copyright')}</div>
        </footer>
      </div>
    </div>
  )
}
