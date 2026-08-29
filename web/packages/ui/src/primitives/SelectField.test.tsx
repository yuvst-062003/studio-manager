import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { SelectField } from './SelectField'
import { TextField } from './TextField'

const OPTIONS = (
  <>
    <option value="">—</option>
    <option value="active">Active</option>
  </>
)

describe.each(DIRECTIONS)('SelectField in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is reachable by its label and flows in the document direction', () => {
      renderIn(<SelectField label="Status">{OPTIONS}</SelectField>, { locale, theme })
      expect(screen.getByLabelText('Status')).toBeInstanceOf(HTMLSelectElement)
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })
  })
})

describe('SelectField', () => {
  it('wears the same field classes as TextField, because they share a row', () => {
    // Behavioural: this is the whole reason the primitive exists. Twenty-five raw selects
    // sat beside TextFields at the UA's own size — the students screen had a 158×22 search
    // box next to a 95×20 status filter, baselines two pixels apart.
    const { container } = renderIn(
      <>
        <TextField label="Search" />
        <SelectField label="Status">{OPTIONS}</SelectField>
      </>,
    )
    const [input, select] = [
      container.querySelector('input.studio-field__input'),
      container.querySelector('select.studio-field__input'),
    ]
    expect(input).not.toBeNull()
    expect(select).not.toBeNull()
    expect(container.querySelectorAll('.studio-field')).toHaveLength(2)
  })

  it('links a hint the way TextField does, so a screen reader hears it', () => {
    renderIn(
      <SelectField hint="Leave empty for all" label="Status">
        {OPTIONS}
      </SelectField>,
    )
    const select = screen.getByLabelText('Status')
    expect(select).toHaveAccessibleDescription('Leave empty for all')
    expect(select).not.toHaveAttribute('aria-invalid')
  })

  it('marks an error for a screen reader, not with colour alone', () => {
    // SC 1.4.1 — a red border says nothing to a screen reader.
    renderIn(
      <SelectField error="Pick one" label="Status">
        {OPTIONS}
      </SelectField>,
    )
    const select = screen.getByLabelText('Status')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Pick one')
    expect(select).toHaveAttribute('data-state', 'error')
  })

  it('prefers the error over the hint when both are given', () => {
    renderIn(
      <SelectField error="Pick one" hint="Leave empty for all" label="Status">
        {OPTIONS}
      </SelectField>,
    )
    expect(screen.getByLabelText('Status')).toHaveAccessibleDescription('Pick one')
  })

  it('passes its options through untouched, groups and all', () => {
    // Options are children rather than a prop precisely so a call site can use the parts
    // of the native element an `options` array would have to grow a shape for.
    renderIn(
      <SelectField label="Group">
        <optgroup label="Judo">
          <option value="g1">Beginners</option>
        </optgroup>
      </SelectField>,
    )
    expect(screen.getByRole('group', { name: 'Judo' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Beginners' })).toBeInTheDocument()
  })
})
