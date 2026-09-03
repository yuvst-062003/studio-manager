// Artboard 2e (parent) and 9e (staff) — the same drawer, per the inventory.
//
// The reason this component exists is a defect, so the tests are shaped around it: both apps
// shipped a `/settings` nav entry with no route behind it, which meant language and theme —
// half of W6's exit gate — had no reachable home after first run. `LanguagePicker` is only
// shown BEFORE login, so a parent who picked the wrong language on their first launch could
// not change it again from anywhere in the app.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ThemeProvider } from '../ThemeProvider'
import { AccountDrawerFooter } from './AccountDrawerFooter'

function renderFooter(
  locale: 'he' | 'en' = 'he',
  onChooseLocale = vi.fn(),
  onSignOut = vi.fn(),
) {
  render(
    <ThemeProvider>
      <AccountDrawerFooter locale={locale} onChooseLocale={onChooseLocale} onSignOut={onSignOut} />
    </ThemeProvider>,
  )
  return { onChooseLocale, onSignOut }
}

describe('AccountDrawerFooter', () => {
  it('offers all three languages, each written in its own script', () => {
    // Never translated. Someone who cannot read the current locale has to be able to
    // recognise their own — which is the entire reason a language picker is not a dropdown
    // of translated names.
    renderFooter()
    for (const endonym of ['עברית', 'English', 'Русский']) {
      expect(screen.getByRole('radio', { name: endonym })).toBeInTheDocument()
    }
  })

  it('marks each language option with its own lang, so a screen reader switches voice', () => {
    renderFooter()
    expect(screen.getByText('Русский')).toHaveAttribute('lang', 'ru')
    expect(screen.getByText('English')).toHaveAttribute('lang', 'en')
  })

  it('reports the chosen language as a radio group rather than a row of buttons', () => {
    // `role="radiogroup"` is explicit because a bare <fieldset> maps to ARIA `group`, which
    // does not announce "1 of 3" or answer the arrow keys.
    renderFooter()
    const groups = screen.getAllByRole('radiogroup')
    expect(groups.length).toBeGreaterThanOrEqual(2) // language + theme
    expect(screen.getByRole('radio', { name: 'עברית' })).toBeChecked()
  })

  it('reports a language choice to the app rather than handling it internally', () => {
    // The locale lives in each app's own state and is threaded down as a prop; a footer that
    // kept its own copy would change the drawer and nothing else on the screen.
    const { onChooseLocale } = renderFooter()
    return userEvent.click(screen.getByRole('radio', { name: 'English' })).then(() => {
      expect(onChooseLocale).toHaveBeenCalledWith('en')
    })
  })

  it('offers a way to sign out', async () => {
    // 2e never drew one -- the account drawer covered club-switching, language and
    // theme, and sign-out had no home anywhere in the signed-in app. The refusal
    // screen's own sign-out button (RefusalScreen) is reachable only when access is
    // denied, which is not the same control for a normally signed-in person.
    const { onSignOut } = renderFooter()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'common.nav.signOut') }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('carries a visible state label for the theme, not colour alone', async () => {
    // 2e's caption is *לכל מתג יש תווית מצב*. It came from a reviewer who could not tell
    // whether a toggle was on, and it is SC 1.4.1 as much as it is a design note.
    renderFooter()
    await userEvent.click(screen.getByRole('radio', { name: t('he', 'common.theme.dark') }))
    expect(screen.getByText(t('he', 'common.theme.state.dark'))).toBeInTheDocument()
  })

  it('renders in English too, since the gate is both directions', () => {
    renderFooter('en')
    expect(screen.getByText(t('en', 'common.language.title'))).toBeInTheDocument()
    // The endonyms do NOT translate with the locale — that is the point of them.
    expect(screen.getByRole('radio', { name: 'עברית' })).toBeInTheDocument()
  })
})
