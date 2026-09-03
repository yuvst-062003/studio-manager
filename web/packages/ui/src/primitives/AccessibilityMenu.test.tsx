// נגישות — the IS 5568 adjustments menu (2026-08-30).
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderIn } from '../testing'
import { t } from '@studio/i18n'
import { AccessibilityMenu } from './AccessibilityMenu'

afterEach(() => {
  document.documentElement.style.fontSize = ''
  document.documentElement.removeAttribute('data-a11y-contrast')
  document.documentElement.removeAttribute('data-a11y-motion')
  document.documentElement.removeAttribute('data-a11y-links')
  localStorage.removeItem('studio.a11y.v1')
})

describe('AccessibilityMenu', () => {
  it('opens from a named button and offers the four adjustments plus the statement', async () => {
    renderIn(<AccessibilityMenu locale="he" />)
    await userEvent.click(screen.getByTestId('a11y-open'))
    const panel = screen.getByTestId('a11y-panel')
    expect(panel).toHaveAttribute('role', 'dialog')
    expect(screen.getByText(t('he', 'common.a11y.contrast'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.a11y.statement.title'))).toBeInTheDocument()
  })

  it('tells a keyboard-only parent to call the club, since decision 13 deleted the typed-name signature fallback', async () => {
    renderIn(<AccessibilityMenu locale="he" />)
    await userEvent.click(screen.getByTestId('a11y-open'))
    expect(screen.getByText(t('he', 'common.a11y.statement.signature'))).toBeInTheDocument()
  })

  it('applies text size to the ROOT, so every rem in the token layer scales', async () => {
    renderIn(<AccessibilityMenu locale="he" />)
    await userEvent.click(screen.getByTestId('a11y-open'))
    await userEvent.click(screen.getByTestId('a11y-scale-125'))
    expect(document.documentElement.style.fontSize).toBe('125%')
  })

  it('sets the contrast flag and persists the choice per browser', async () => {
    renderIn(<AccessibilityMenu locale="he" />)
    await userEvent.click(screen.getByTestId('a11y-open'))
    await userEvent.click(screen.getByTestId('a11y-contrast'))
    expect(document.documentElement).toHaveAttribute('data-a11y-contrast', 'high')
    expect(JSON.parse(localStorage.getItem('studio.a11y.v1')!)).toMatchObject({ contrast: true })
  })

  it('boots with the stored adjustments already applied', () => {
    localStorage.setItem(
      'studio.a11y.v1',
      JSON.stringify({ textScale: 112, contrast: false, reduceMotion: true, underlineLinks: false }),
    )
    renderIn(<AccessibilityMenu locale="he" />)
    expect(document.documentElement.style.fontSize).toBe('112%')
    expect(document.documentElement).toHaveAttribute('data-a11y-motion', 'reduced')
  })

  it('reset returns everything to the defaults', async () => {
    renderIn(<AccessibilityMenu locale="he" />)
    await userEvent.click(screen.getByTestId('a11y-open'))
    await userEvent.click(screen.getByTestId('a11y-contrast'))
    await userEvent.click(screen.getByTestId('a11y-reset'))
    expect(document.documentElement).not.toHaveAttribute('data-a11y-contrast')
    expect(document.documentElement.style.fontSize).toBe('')
  })
})
