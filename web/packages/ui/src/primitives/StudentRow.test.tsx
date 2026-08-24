import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { StudentRow } from './StudentRow'

const belt = { colorHex: '#2f6fa8', label: 'חגורה כחולה' }

describe.each(DIRECTIONS)('StudentRow in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('shows the name, the group and the status', () => {
      renderIn(
        <StudentRow
          belt={belt}
          groupLabel="ג'ודו / מתחילים"
          name="דנה כהן"
          status={{ status: 'debt', label: 'חוב' }}
        />,
        { locale, theme },
      )
      expect(screen.getByText('דנה כהן')).toBeVisible()
      expect(screen.getByText("ג'ודו / מתחילים")).toBeVisible()
      expect(screen.getByText('חוב')).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })

    it('carries the belt through BeltBar, so D7s ring applies here too', () => {
      renderIn(<StudentRow belt={belt} groupLabel="g" name="n" />, { locale, theme })
      const bar = screen.getByRole('img', { name: 'חגורה כחולה' })
      expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    })
  })
})

describe('StudentRow', () => {
  it('isolates mixed-direction text, so a Latin group name cannot reorder the row (§9)', () => {
    renderIn(<StudentRow belt={belt} groupLabel="Judo / Beginners" name="דנה כהן" />)
    expect(screen.getByText('דנה כהן').tagName).toBe('BDI')
    expect(screen.getByText('Judo / Beginners').tagName).toBe('BDI')
  })

  it('is a plain row when it is not selectable', () => {
    renderIn(<StudentRow belt={belt} groupLabel="g" name="n" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('becomes a real button when selectable, named for the student', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderIn(<StudentRow belt={belt} groupLabel="g" name="דנה כהן" onSelect={onSelect} />)
    // A div with onClick is not reachable by keyboard. 4h's row opens a student card, so
    // it has to be a button.
    await user.click(screen.getByRole('button', { name: /דנה כהן/ }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('is operable from the keyboard when selectable', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderIn(<StudentRow belt={belt} groupLabel="g" name="n" onSelect={onSelect} />)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('renders without a status', () => {
    renderIn(<StudentRow belt={belt} groupLabel="g" name="n" />)
    expect(screen.getByText('n')).toBeVisible()
    expect(screen.queryByText('חוב')).not.toBeInTheDocument()
  })

  it('carries a bi-colour belt through unchanged', () => {
    renderIn(
      <StudentRow
        belt={{ colorHex: '#fffefb', label: 'לבנה-צהובה', secondaryColorHex: '#d9a800' }}
        groupLabel="g"
        name="n"
      />,
    )
    const bar = screen.getByRole('img', { name: 'לבנה-צהובה' })
    expect(bar.style.background).toContain('linear-gradient')
    expect(bar.style.boxShadow).toContain('var(--belt-ring)')
  })

  it('routes the status through StatusChip rather than redrawing it', () => {
    renderIn(
      <StudentRow
        belt={belt}
        groupLabel="g"
        name="n"
        status={{ status: 'cancelled', label: 'בוטל' }}
      />,
    )
    expect(screen.getByText('בוטל')).toHaveAttribute('data-status', 'cancelled')
  })
})
