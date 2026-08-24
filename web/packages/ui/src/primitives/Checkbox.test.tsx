import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Checkbox } from './Checkbox'

describe.each(DIRECTIONS)('Checkbox in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is a labelled checkbox', () => {
      renderIn(<Checkbox label="שלח תזכורת" />, { locale, theme })
      expect(screen.getByRole('checkbox', { name: 'שלח תזכורת' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Checkbox', () => {
  it('toggles on click and reports through onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderIn(<Checkbox label="x" onChange={onChange} />)
    await user.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('toggles from the keyboard', async () => {
    const user = userEvent.setup()
    renderIn(<Checkbox label="x" />)
    await user.tab()
    expect(screen.getByRole('checkbox')).toHaveFocus()
    await user.keyboard(' ')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup()
    renderIn(<Checkbox disabled label="x" />)
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('clicking the label toggles it, so the whole row is a target', async () => {
    const user = userEvent.setup()
    renderIn(<Checkbox label="שלח תזכורת" />)
    await user.click(screen.getByText('שלח תזכורת'))
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('gives each instance its own id, so two labels do not collide', () => {
    renderIn(
      <>
        <Checkbox label="א" />
        <Checkbox label="ב" />
      </>,
    )
    expect(screen.getByRole('checkbox', { name: 'א' }).id).not.toBe(
      screen.getByRole('checkbox', { name: 'ב' }).id,
    )
  })
})
