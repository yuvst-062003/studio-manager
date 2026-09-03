// Parent artboard `2e` — מגירת חשבון: *מעבר בין מועדונים, שפה, מצב כהה*, and the staff
// app's `9e` עוד, which the inventory describes as "אותה מגירה" — the same drawer.
//
// **This exists because two nav entries pointed at a screen that was never built.** Both
// apps shipped `{ key: 'settings', href: '/settings' }`, and neither app has a route behind
// it: the link fell through the service worker's `navigateFallback` to index.html and put
// the user back on home, silently. A link that returns you where you started with no message
// is worse than no link, because the user concludes the app is broken rather than that the
// feature is elsewhere.
//
// The other two thirds of `2e` were already built and already reachable: `StudioSwitcher` is
// mounted by `AppShell` above this footer. What had no home was language and theme — and
// theme is not a nicety here, it is half of W6's exit gate ("light AND dark").
//
// **Why a drawer footer and not a screen.** `2e` draws a drawer, not a page; `AppShell`
// already accepts a `drawerFooter` and nothing was passing one. A settings *screen* would
// also need a route, a nav entry and a back affordance in two apps — three new things to
// keep in step, to hold two controls that belong beside the studio switcher anyway.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import { LOCALES } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Button } from '../primitives/Button'
import { ThemeControl } from '../primitives/ThemeControl'
// The one list of language endonyms. Re-typing them here is how the first-run picker
// and the drawer end up disagreeing about how to spell Русский.
import { ENDONYM } from '../first-run/LanguagePicker'

const footerStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  marginBlockStart: 'var(--space-5)',
  paddingBlockStart: 'var(--space-4)',
  borderBlockStart: '1px solid var(--border)',
}

const groupStyle: CSSProperties = {
  border: 0,
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--space-2)',
}

const legendStyle: CSSProperties = {
  padding: 0,
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-medium)' as CSSProperties['fontWeight'],
}

const optionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const optionStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-body)',
}

export function AccountDrawerFooter({
  locale,
  onChooseLocale,
  onSignOut,
  accountName,
}: {
  locale: Locale
  onChooseLocale: (next: Locale) => void
  /** Required, not optional: 2e never drew a sign-out control anywhere in the signed-in
   *  app, only on the refusal screen a denied visitor sees. Making this a required prop
   *  is what stops a future caller of this shared footer from reintroducing the same
   *  gap silently -- the same reasoning the no-inert-Button guard already applies to
   *  every `<Button>` in the tree. */
  onSignOut: () => void
  /** 2e's header line — the signed-in person, now that /auth/me names them. */
  accountName?: string | null
}) {
  return (
    <div style={footerStyle}>
      {accountName ? (
        <div data-testid="account-name" style={{ fontWeight: 600 }}>
          <bdi>{accountName}</bdi>
        </div>
      ) : null}
      {/* Native radios, like `ThemeControl` below: arrow-key navigation, the roving tab stop
          and the exclusive-group semantics all come free, and `role="radiogroup"` is
          explicit because a bare fieldset maps to ARIA `group` and would not announce
          "1 of 3". */}
      <fieldset role="radiogroup" style={groupStyle}>
        <legend style={legendStyle}>{t(locale, 'common.language.title')}</legend>
        <div style={optionsStyle}>
          {LOCALES.map((candidate) => (
            <label key={candidate} style={optionStyle}>
              <input
                checked={locale === candidate}
                name="account-drawer-locale"
                onChange={() => onChooseLocale(candidate)}
                type="radio"
                value={candidate}
              />
              {/* The language's own name in its own script, never translated — someone who
                  cannot read the current locale still has to recognise their own. `lang` so a
                  screen reader switches voice for the option rather than reading "Русский"
                  with Hebrew phonetics. */}
              <span lang={candidate}>{ENDONYM[candidate]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <ThemeControl
        labels={{
          light: t(locale, 'common.theme.light'),
          dark: t(locale, 'common.theme.dark'),
          system: t(locale, 'common.theme.system'),
        }}
        legend={t(locale, 'common.theme.legend')}
        // `2e`'s caption is *לכל מתג יש תווית מצב* — every switch carries a state label.
        // That is an accessibility rule as much as a design one: state carried by position
        // and colour alone fails SC 1.4.1.
        stateLabels={{
          light: t(locale, 'common.theme.state.light'),
          dark: t(locale, 'common.theme.state.dark'),
        }}
      />

      <Button onClick={onSignOut} type="button" variant="ghost">
        {t(locale, 'common.nav.signOut')}
      </Button>
    </div>
  )
}
