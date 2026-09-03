import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { MoneyDisplay } from './MoneyDisplay'
import { StatTile } from './StatTile'

describe.each(DIRECTIONS)('StatTile in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('renders label, value and hint, and flows in the document direction', () => {
      renderIn(<StatTile hint="12 families" label="Open debt" value="4,800" />, { locale, theme })
      expect(screen.getByText('Open debt')).toBeInTheDocument()
      expect(screen.getByText('4,800')).toBeInTheDocument()
      expect(screen.getByText('12 families')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })
  })
})

describe('StatTile', () => {
  it('makes the whole tile the target when it has a destination', () => {
    // Behavioural: a manager reaching for a number should not have to find a small link
    // inside the tile.
    renderIn(<StatTile href="#/billing" label="Open debt" value="4,800" />)
    const link = screen.getByRole('link', { name: /Open debt/ })
    expect(link).toHaveAttribute('href', '#/billing')
    expect(link).toHaveTextContent('4,800')
  })

  it('is not a link when it has nowhere to go', () => {
    renderIn(<StatTile label="Open debt" value="4,800" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('wears the shared tile shell so it cannot drift from the reports screen\'s .dash-kpi (B5.2)', () => {
    const { container } = renderIn(<StatTile label="Collected" value="0" />)
    expect(container.querySelector('.studio-stat-tile')).toHaveClass('studio-tile-shell')
  })

  it('carries its tone as a semantic state, defaulting to neutral', () => {
    const { container } = renderIn(<StatTile label="Collected" value="0" />)
    expect(container.querySelector('.studio-stat-tile')).toHaveAttribute('data-tone', 'neutral')
  })

  it('accepts a node as the value so money is never interpolated into a string', () => {
    // Behavioural: this is what stops `₪4,800` becoming `4,800₪-` in an RTL document.
    renderIn(<StatTile label="Open debt" value={<MoneyDisplay agorot={480000} />} tone="debt" />)
    const tile = screen.getByText('Open debt').closest('.studio-stat-tile')
    expect(tile).toHaveAttribute('data-tone', 'debt')
    expect(tile?.textContent).toContain('4,800')
  })

  it('renders no hint element when there is no hint', () => {
    const { container } = renderIn(<StatTile label="Collected" value="0" />)
    expect(container.querySelector('.studio-stat-tile__hint')).toBeNull()
  })
})
