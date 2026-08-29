import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { ActionBar } from './ActionBar'
import { Button } from './Button'

describe.each(DIRECTIONS)('ActionBar in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('renders both groups and flows in the document direction', () => {
      renderIn(
        <ActionBar
          end={<Button>Continue</Button>}
          start={<Button variant="ghost">Back</Button>}
        />,
        { locale, theme },
      )
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })
  })
})

describe('ActionBar alignment', () => {
  // Behavioural: which edge a group lands on is the whole point of the component. A lone
  // primary that drifts to the middle is the defect this replaces.
  it('spreads to both edges when it has a start and an end group', () => {
    const { container } = renderIn(<ActionBar end={<Button>Save</Button>} start={<Button>Back</Button>} />)
    expect(container.querySelector('.studio-actionbar')).toHaveAttribute('data-align', 'between')
  })

  it('aligns to the inline-end edge when it only moves the task forward', () => {
    const { container } = renderIn(<ActionBar end={<Button>Save</Button>} />)
    expect(container.querySelector('.studio-actionbar')).toHaveAttribute('data-align', 'end')
  })

  it('aligns to the inline-start edge when it only goes back', () => {
    const { container } = renderIn(<ActionBar start={<Button variant="ghost">Back</Button>} />)
    expect(container.querySelector('.studio-actionbar')).toHaveAttribute('data-align', 'start')
  })

  it('renders no group at all rather than an empty box when given neither', () => {
    const { container } = renderIn(<ActionBar />)
    expect(container.querySelectorAll('.studio-actionbar__group')).toHaveLength(0)
  })

  it('forwards a className so a screen can place it without reopening this file', () => {
    const { container } = renderIn(<ActionBar className="sticky" end={<Button>Save</Button>} />)
    expect(container.querySelector('.studio-actionbar')).toHaveClass('sticky')
  })
})
