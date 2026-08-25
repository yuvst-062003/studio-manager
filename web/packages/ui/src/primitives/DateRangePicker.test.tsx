import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateRangePicker } from './DateRangePicker'
import { DIRECTIONS, THEMES, renderIn } from '../testing'

const labels = { fromLabel: 'מתאריך', toLabel: 'עד תאריך' }

describe('DateRangePicker', () => {
  it.each(DIRECTIONS)('renders both fields in $locale', ({ locale }) => {
    renderIn(<DateRangePicker from="" to="" onChange={vi.fn()} {...labels} />, { locale })
    expect(screen.getByLabelText('מתאריך')).toBeInTheDocument()
    expect(screen.getByLabelText('עד תאריך')).toBeInTheDocument()
  })

  it('labels each input, rather than relying on placeholder text', () => {
    // A placeholder disappears the moment someone types, which is exactly when a person
    // using a screen magnifier needs to know which of two identical fields they are in.
    renderIn(<DateRangePicker from="" to="" onChange={vi.fn()} {...labels} />)
    expect(screen.getByLabelText('מתאריך')).toHaveAttribute('type', 'date')
  })

  it('reports a change to the start without discarding the end', async () => {
    const onChange = vi.fn()
    renderIn(
      <DateRangePicker from="" to="2026-09-30" onChange={onChange} {...labels} />,
    )
    await userEvent.type(screen.getByLabelText('מתאריך'), '2026-09-01')
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('reports a change to the end without discarding the start', async () => {
    const onChange = vi.fn()
    renderIn(
      <DateRangePicker from="2026-09-01" to="" onChange={onChange} {...labels} />,
    )
    await userEvent.type(screen.getByLabelText('עד תאריך'), '2026-09-30')
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30' })
  })

  describe('an end before the start', () => {
    it('marks both fields invalid', () => {
      renderIn(
        <DateRangePicker
          from="2026-09-30"
          to="2026-09-01"
          onChange={vi.fn()}
          errorMessage="טווח לא תקין"
          {...labels}
        />,
      )
      expect(screen.getByLabelText('מתאריך')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('עד תאריך')).toHaveAttribute('aria-invalid', 'true')
    })

    it('announces the message rather than only colouring the field', () => {
      // SC 1.4.1 — colour is never the only carrier of meaning.
      renderIn(
        <DateRangePicker
          from="2026-09-30"
          to="2026-09-01"
          onChange={vi.fn()}
          errorMessage="טווח לא תקין"
          {...labels}
        />,
      )
      expect(screen.getByRole('alert')).toHaveTextContent('טווח לא תקין')
    })

    it('does not silently rewrite what the user typed', () => {
      // Clamping would make the control disagree with the field the user is looking at.
      renderIn(
        <DateRangePicker from="2026-09-30" to="2026-09-01" onChange={vi.fn()} {...labels} />,
      )
      expect(screen.getByLabelText('עד תאריך')).toHaveValue('2026-09-01')
    })

    it('is valid when only one bound is set', () => {
      // An open-ended range is legitimate — §5.6's `effective_to` and §5.4's freeze are
      // both nullable. A half-filled control must not shout at someone mid-entry.
      renderIn(<DateRangePicker from="2026-09-30" to="" onChange={vi.fn()} {...labels} />)
      expect(screen.getByLabelText('מתאריך')).not.toHaveAttribute('aria-invalid')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('compares ISO strings rather than constructing a Date', () => {
      // Lexicographic comparison on `YYYY-MM-DD` is exact and timezone-free. Building a
      // Date would reintroduce the day-boundary bug `studioDayKey` exists to avoid.
      expect(DateRangePicker.toString()).not.toMatch(/new Date/)
    })
  })

  it('constrains the end field to on-or-after the start', () => {
    renderIn(<DateRangePicker from="2026-09-01" to="" onChange={vi.fn()} {...labels} />)
    expect(screen.getByLabelText('עד תאריך')).toHaveAttribute('min', '2026-09-01')
  })

  it('disables both fields together', () => {
    renderIn(<DateRangePicker from="" to="" onChange={vi.fn()} disabled {...labels} />)
    expect(screen.getByLabelText('מתאריך')).toBeDisabled()
    expect(screen.getByLabelText('עד תאריך')).toBeDisabled()
  })

  it('uses no physical CSS properties or direction branches (D10 / G12)', () => {
    const source = DateRangePicker.toString()
    expect(source).not.toMatch(/margin-?[LR]|padding-?[LR]|marginLeft|paddingRight/)
    expect(source).not.toMatch(/\brtl\b|\bltr\b/)
  })

  it.each(THEMES)('renders in the %s theme', (theme) => {
    renderIn(<DateRangePicker from="" to="" onChange={vi.fn()} {...labels} />, { theme })
    expect(screen.getByLabelText('מתאריך')).toBeInTheDocument()
  })
})
