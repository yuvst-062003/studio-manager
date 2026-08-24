import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Alert } from './Alert'

const TONES = ['danger', 'pending', 'paid'] as const

describe.each(DIRECTIONS)('Alert in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(TONES)('renders the %s tone with its message', (tone) => {
      renderIn(
        <Alert iconLabel="אזהרה" tone={tone}>
          הצהרת בריאות חסרה — נדרשת לפני האימון הבא
        </Alert>,
        { locale, theme },
      )
      expect(screen.getByText(/הצהרת בריאות חסרה/)).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Alert', () => {
  it.each(TONES)('exposes %s through data-tone', (tone) => {
    renderIn(
      <Alert iconLabel="x" tone={tone}>
        m
      </Alert>,
    )
    expect(screen.getByText('m').closest('.studio-alert')).toHaveAttribute('data-tone', tone)
  })

  it('is NOT a live region by default', () => {
    // 4h's banner is static page content — a declaration that was already missing when
    // the screen loaded. role="alert" on static content makes a screen reader interrupt
    // itself on every render, which teaches people to ignore it.
    renderIn(
      <Alert iconLabel="x" tone="danger">
        m
      </Alert>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('becomes a live region only when asked', () => {
    renderIn(
      <Alert iconLabel="x" live tone="danger">
        m
      </Alert>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('m')
  })

  it('names its icon, so the tone is not carried by colour alone (SC 1.4.1)', () => {
    renderIn(
      <Alert iconLabel="אזהרה" tone="danger">
        m
      </Alert>,
    )
    expect(screen.getByRole('img', { name: 'אזהרה' })).toBeInTheDocument()
  })

  it('hardcodes no colour — every tone resolves through a token (G13)', () => {
    for (const tone of TONES) {
      const { unmount } = renderIn(
        <Alert iconLabel="x" tone={tone}>
          m
        </Alert>,
      )
      expect(screen.getByText('m').closest('.studio-alert')?.getAttribute('style')).toBeNull()
      unmount()
    }
  })
})
