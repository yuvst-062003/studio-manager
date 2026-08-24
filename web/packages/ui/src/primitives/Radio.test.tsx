import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Radio } from './Radio'

describe.each(DIRECTIONS)('Radio in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is a labelled checkbox', () => {
      renderIn(<Radio label="שלח תזכורת" />, { locale, theme })
      expect(screen.getByRole('radio', { name: 'שלח תזכורת' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Radio', () => {
  it('toggles on click and reports through onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderIn(<Radio label="x" onChange={onChange} />)
    await user.click(screen.getByRole('radio'))
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('radio')).toBeChecked()
  })

  it('toggles from the keyboard', async () => {
    const user = userEvent.setup()
    renderIn(<Radio label="x" />)
    await user.tab()
    expect(screen.getByRole('radio')).toHaveFocus()
    await user.keyboard(' ')
    expect(screen.getByRole('radio')).toBeChecked()
  })

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup()
    renderIn(<Radio disabled label="x" />)
    await user.click(screen.getByRole('radio'))
    expect(screen.getByRole('radio')).not.toBeChecked()
  })

  it('clicking the label toggles it, so the whole row is a target', async () => {
    const user = userEvent.setup()
    renderIn(<Radio label="שלח תזכורת" />)
    await user.click(screen.getByText('שלח תזכורת'))
    expect(screen.getByRole('radio')).toBeChecked()
  })

  it('gives each instance its own id, so two labels do not collide', () => {
    renderIn(
      <>
        <Radio label="א" />
        <Radio label="ב" />
      </>,
    )
    expect(screen.getByRole('radio', { name: 'א' }).id).not.toBe(
      screen.getByRole('radio', { name: 'ב' }).id,
    )
  })
})

describe('Radio grouping', () => {
  it('behaves as one group when two share a name', async () => {
    const user = userEvent.setup()
    renderIn(
      <>
        <Radio label="א" name="g" value="a" />
        <Radio label="ב" name="g" value="b" />
      </>,
    )
    await user.click(screen.getByRole('radio', { name: 'ב' }))
    expect(screen.getByRole('radio', { name: 'ב' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'א' })).not.toBeChecked()
  })
})
