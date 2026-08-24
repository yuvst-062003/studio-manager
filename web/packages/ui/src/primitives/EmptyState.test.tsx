import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { EmptyState } from './EmptyState'

describe.each(DIRECTIONS)('EmptyState in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('shows its title as a heading and its description as text', () => {
      renderIn(<EmptyState description="השיעור הקרוב: יום א׳ 17:00" title="אין שיעורים ביום זה" />, {
        locale,
        theme,
      })
      expect(screen.getByRole('heading', { name: 'אין שיעורים ביום זה' })).toBeInTheDocument()
      expect(screen.getByText('השיעור הקרוב: יום א׳ 17:00')).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('EmptyState', () => {
  it('renders without a description', () => {
    renderIn(<EmptyState title="ריק" />)
    expect(screen.getByRole('heading', { name: 'ריק' })).toBeInTheDocument()
  })

  it('renders a caller-supplied action', () => {
    renderIn(<EmptyState action={<button type="button">הוסף</button>} title="ריק" />)
    expect(screen.getByRole('button', { name: 'הוסף' })).toBeInTheDocument()
  })

  it('hides its decorative icon from assistive tech', () => {
    const { container } = renderIn(<EmptyState title="ריק" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
