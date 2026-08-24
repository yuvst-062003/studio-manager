import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Card } from './Card'

describe.each(DIRECTIONS)('Card in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('renders its children and flows in the document direction', () => {
      renderIn(
        <Card caption="Buttons">
          <p>content</p>
        </Card>,
        { locale, theme },
      )
      expect(screen.getByText('content')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })

    it('exposes the caption as the accessible name of a region', () => {
      // Behavioural: 4h's eight panels are labelled groups, so a screen-reader user can
      // tell which set of controls they are inside.
      renderIn(<Card caption="Status chips">x</Card>, { locale, theme })
      expect(screen.getByRole('region', { name: 'Status chips' })).toBeInTheDocument()
    })
  })
})

describe('Card', () => {
  it('renders without a caption, and is then not a labelled region', () => {
    renderIn(<Card>bare</Card>)
    expect(screen.getByText('bare')).toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('forwards a className so a feature can position it without reopening this file', () => {
    renderIn(<Card className="wide">x</Card>)
    expect(screen.getByText('x').closest('.studio-card')).toHaveClass('wide')
  })
})
