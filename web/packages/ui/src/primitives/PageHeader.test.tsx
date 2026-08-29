import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Button } from './Button'
import { PageHeader } from './PageHeader'

describe.each(DIRECTIONS)('PageHeader in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('names the screen with a level-1 heading and flows in the document direction', () => {
      renderIn(<PageHeader subtitle="Gladiator Club" title="Home" />, { locale, theme })
      expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })
  })
})

describe('PageHeader', () => {
  it('renders the studio name as a subtitle, not a second heading', () => {
    // Behavioural: the studio name is context for the title, not a document section. The
    // shipped dashboard renders it twice; here it has exactly one home.
    renderIn(<PageHeader subtitle="Gladiator Club" title="Home" />)
    expect(screen.getByText('Gladiator Club')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gladiator Club' })).not.toBeInTheDocument()
  })

  it('is a banner region so a screen-reader user can skip straight past it', () => {
    renderIn(<PageHeader title="Home" />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('places actions in the header rather than in a row of their own', () => {
    renderIn(<PageHeader actions={<Button>New lesson</Button>} title="Schedule" />)
    const header = screen.getByRole('banner')
    expect(header).toContainElement(screen.getByRole('button', { name: 'New lesson' }))
  })

  it('renders neither a subtitle nor an actions container when given neither', () => {
    const { container } = renderIn(<PageHeader title="Home" />)
    expect(container.querySelector('.studio-page-header__subtitle')).toBeNull()
    expect(container.querySelector('.studio-page-header__actions')).toBeNull()
  })
})
