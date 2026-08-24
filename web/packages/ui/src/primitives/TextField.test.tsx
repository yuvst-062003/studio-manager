import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { TextField } from './TextField'

describe.each(DIRECTIONS)('TextField in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is labelled, so getByLabelText finds it', () => {
      renderIn(<TextField label="טלפון" />, { locale, theme })
      expect(screen.getByLabelText('טלפון')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })

    it('announces its error through aria-invalid and aria-describedby', () => {
      // .claude/rules/ui-rtl-a11y.md: "errors are linked via aria-describedby". A red
      // border alone is colour-only (SC 1.4.1) and silent to a screen reader.
      renderIn(<TextField error="נדרש מספר טלפון תקין" label="טלפון" />, { locale, theme })
      const input = screen.getByLabelText('טלפון')
      expect(input).toBeInvalid()
      expect(input).toHaveAccessibleDescription('נדרש מספר טלפון תקין')
    })
  })
})

describe('TextField', () => {
  it('accepts typing and reports the value', async () => {
    const user = userEvent.setup()
    renderIn(<TextField label="שם" />)
    await user.type(screen.getByLabelText('שם'), 'דנה')
    expect(screen.getByLabelText('שם')).toHaveValue('דנה')
  })

  it('is not invalid when there is no error', () => {
    renderIn(<TextField label="שם" />)
    expect(screen.getByLabelText('שם')).not.toBeInvalid()
    expect(screen.getByLabelText('שם')).toHaveAttribute('data-state', 'default')
  })

  it('exposes the error state through data-state for the stylesheet', () => {
    // Only-source-observable: jsdom applies no stylesheet, so the attribute is the
    // testable form of "this field is drawn with the 1.5px danger border".
    renderIn(<TextField error="bad" label="שם" />)
    expect(screen.getByLabelText('שם')).toHaveAttribute('data-state', 'error')
  })

  it('describes itself with a hint when there is no error', () => {
    renderIn(<TextField hint="עשר ספרות" label="טלפון" />)
    expect(screen.getByLabelText('טלפון')).toHaveAccessibleDescription('עשר ספרות')
  })

  it('prefers the error over the hint when both are present', () => {
    // Two descriptions would be read out one after the other; the error is the one that
    // needs acting on.
    renderIn(<TextField error="שגיאה" hint="עשר ספרות" label="טלפון" />)
    expect(screen.getByLabelText('טלפון')).toHaveAccessibleDescription('שגיאה')
  })

  it('generates a unique id per instance, so two fields do not share a label', () => {
    renderIn(
      <>
        <TextField label="א" />
        <TextField label="ב" />
      </>,
    )
    expect(screen.getByLabelText('א').id).not.toBe(screen.getByLabelText('ב').id)
  })

  it('honours a caller-supplied id', () => {
    renderIn(<TextField id="phone" label="טלפון" />)
    expect(screen.getByLabelText('טלפון')).toHaveAttribute('id', 'phone')
  })

  it('forwards native input attributes such as type and inputMode', () => {
    renderIn(<TextField inputMode="tel" label="טלפון" type="tel" />)
    const input = screen.getByLabelText('טלפון')
    expect(input).toHaveAttribute('type', 'tel')
    expect(input).toHaveAttribute('inputmode', 'tel')
  })
})
