import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { SectionHeader } from './SectionHeader'

describe.each(DIRECTIONS)('SectionHeader in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('renders its title as a heading and flows in the document direction', () => {
      renderIn(<SectionHeader title="Today's classes" />, { locale, theme })
      expect(screen.getByRole('heading', { name: "Today's classes" })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })
  })
})

describe('SectionHeader', () => {
  it('defaults to level 2, the rank a top-level region wants', () => {
    renderIn(<SectionHeader title="Money" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Money' })).toBeInTheDocument()
  })

  it('drops to level 3 when the screen says the section is nested', () => {
    // Behavioural: heading rank is document structure, and a card inside a region must
    // not claim the same rank as the region.
    renderIn(<SectionHeader level={3} title="Upcoming" />)
    expect(screen.getByRole('heading', { level: 3, name: 'Upcoming' })).toBeInTheDocument()
  })

  it('renders a trailing action as a real link, reachable by its name', () => {
    renderIn(<SectionHeader action={<a href="#/schedule">Full week</a>} title="Today" />)
    expect(screen.getByRole('link', { name: 'Full week' })).toHaveAttribute('href', '#/schedule')
  })

  it('renders no action container when there is nothing to put in it', () => {
    const { container } = renderIn(<SectionHeader title="Money" />)
    expect(container.querySelector('.studio-section-header__action')).toBeNull()
  })
})
