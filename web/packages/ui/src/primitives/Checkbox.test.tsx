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

  it('takes a rich label, so a row with a price can still be one control', () => {
    // The shop (`12e`) lists a product name and a `MoneyDisplay` beside each box. With a
    // string-only label it could not use this primitive at all, so it hand-rolled a bare
    // `<input type="checkbox">` — which renders at the browser default 13x13 with no focus
    // ring, in a mobile-first app, on the only control that screen has.
    renderIn(
      <Checkbox
        label={
          <>
            <span>חגורה צהובה</span>
            <span>35₪</span>
          </>
        }
      />,
    )
    // Matched loosely: the accessible name is the label's text content, and how the
    // parts are joined is the caller's layout problem, not this primitive's.
    const box = screen.getByRole('checkbox', { name: /חגורה צהובה/ })
    expect(box).toHaveClass('studio-choice__input')
    expect(box).toHaveAccessibleName(/35₪/)
  })
})
