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

  it('renders a textarea when multiline, and keeps every accessibility wire', async () => {
    // Four artboards want a multi-line field -- 7b's event consent text (4000 chars),
    // 12c, 9g and 9d's examiner note -- and the whole reason it belongs to the primitive
    // rather than to whichever lane needs it first is that the label wiring,
    // aria-describedby, aria-invalid and data-state are written ONCE. Two lanes each
    // building a local <textarea> is how those four diverge.
    const user = userEvent.setup()
    renderIn(<TextField error="חובה למלא נוסח" label="נוסח האישור" multiline rows={4} />)

    const field = screen.getByLabelText('נוסח האישור')
    expect(field.tagName).toBe('TEXTAREA')
    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription('חובה למלא נוסח')
    expect(field).toHaveAttribute('data-state', 'error')
    expect(field).toHaveAttribute('rows', '4')

    await user.type(field, 'שורה')
    expect(field).toHaveValue('שורה')
  })

  it('is an input when multiline is absent, so nothing changes for the other twenty fields', () => {
    renderIn(<TextField label="שם" />)
    expect(screen.getByLabelText('שם').tagName).toBe('INPUT')
  })

  it('forwards textarea-only attributes, which an input would reject', () => {
    // The discriminated union earns its keep here: `rows` and `maxLength` on a textarea
    // are not the same attribute set as `type` and `inputMode` on an input, and a shared
    // prop bag typed as the intersection would accept neither cleanly.
    renderIn(<TextField label="הערה" maxLength={500} multiline rows={2} />)
    const field = screen.getByLabelText('הערה')
    expect(field).toHaveAttribute('maxlength', '500')
  })

  it('forwards native input attributes such as type and inputMode', () => {
    renderIn(<TextField inputMode="tel" label="טלפון" type="tel" />)
    const input = screen.getByLabelText('טלפון')
    expect(input).toHaveAttribute('type', 'tel')
    expect(input).toHaveAttribute('inputmode', 'tel')
  })
})
