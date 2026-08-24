import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { ThemeControl } from './ThemeControl'

const props = (locale: Locale) => ({
  legend: t(locale, 'common.theme.legend'),
  labels: {
    light: t(locale, 'common.theme.light'),
    dark: t(locale, 'common.theme.dark'),
    system: t(locale, 'common.theme.system'),
  },
  stateLabels: {
    light: t(locale, 'common.theme.state.light'),
    dark: t(locale, 'common.theme.state.dark'),
  },
})

describe.each(DIRECTIONS)('ThemeControl in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('offers exactly D4s three options as one radio group', () => {
      renderIn(<ThemeControl {...props(locale)} />, { locale, theme })
      expect(screen.getByRole('radiogroup', { name: props(locale).legend })).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(3)
      expect(document.documentElement.dir).toBe(dir)
    })

    it('marks exactly one option selected, and it is the stored preference', () => {
      renderIn(<ThemeControl {...props(locale)} />, { locale, theme })
      const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)
      expect(checked).toHaveLength(1)
      expect(checked[0]).toHaveAccessibleName(props(locale).labels[theme])
    })

    it('always shows a visible state label — 4h: "תמיד עם תווית מצב"', () => {
      renderIn(<ThemeControl {...props(locale)} />, { locale, theme })
      expect(screen.getByText(props(locale).stateLabels[theme])).toBeVisible()
    })
  })
})

describe('ThemeControl behaviour (D4)', () => {
  it('applies the chosen theme to the document root', async () => {
    const user = userEvent.setup()
    renderIn(<ThemeControl {...props('he')} />, { theme: 'light' })
    await user.click(screen.getByRole('radio', { name: 'כהה' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('persists the preference, so it survives a reload', async () => {
    const user = userEvent.setup()
    renderIn(<ThemeControl {...props('he')} />, { theme: 'light' })
    await user.click(screen.getByRole('radio', { name: 'כהה' }))
    expect(globalThis.localStorage.getItem('studio.theme')).toBe('dark')
  })

  it('reports the RESOLVED theme when System is chosen, not the word "System"', async () => {
    // The one case that genuinely confuses people: System is selected — which did I get?
    // jsdom's matchMedia reports matches:false, so System resolves to light here.
    const user = userEvent.setup()
    renderIn(<ThemeControl {...props('he')} />, { theme: 'dark' })
    expect(screen.getByText('מצב נוכחי: כהה')).toBeVisible()

    await user.click(screen.getByRole('radio', { name: 'מערכת' }))
    expect(screen.getByRole('radio', { name: 'מערכת' })).toBeChecked()
    expect(screen.getByText('מצב נוכחי: בהיר')).toBeVisible()
    expect(screen.queryByText('מצב נוכחי: כהה')).not.toBeInTheDocument()
  })

  it('is operable from the keyboard — arrow keys move within a radio group', async () => {
    const user = userEvent.setup()
    renderIn(<ThemeControl {...props('he')} />, { theme: 'light' })
    await user.tab()
    expect(screen.getByRole('radio', { name: 'בהיר' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'כהה' })).toBeChecked()
  })

  it('takes every visible string as a prop — no primitive reaches into i18n (G4)', () => {
    // A primitive that fetched its own copy could not be reused with a caller's label.
    renderIn(
      <ThemeControl
        labels={{ light: 'A', dark: 'B', system: 'C' }}
        legend="L"
        stateLabels={{ light: 'now-A', dark: 'now-B' }}
      />,
      { theme: 'light' },
    )
    expect(screen.getByRole('radiogroup', { name: 'L' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByText('now-A')).toBeVisible()
  })
})
