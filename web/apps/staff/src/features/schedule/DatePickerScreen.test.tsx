// Staff artboard 9b — בחירת תאריך: יומן מלא, טווח, קפיצה.
//
// The month grid is Sunday-first like everything else in this lane, and it marks the days
// that actually have lessons — a date picker that cannot show where the classes are is a
// picker for a diary, not for a dojo.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { DatePickerScreen, monthGrid } from './DatePickerScreen'
import type { SessionRow, StaffScheduleClient } from './client'

const SESSION: SessionRow = {
  id: 's1',
  group_id: 'g1',
  group_name: 'מתחילים',
  training_year_id: 'y1',
  starts_at: '2026-11-17T16:30:00Z',
  ends_at: '2026-11-17T18:30:00Z',
  location_id: null,
  location_name: null,
  status: 'scheduled',
  is_manually_edited: false,
  is_ad_hoc: false,
  cancel_reason: null,
  staff: [],
  attendance_taken: false,
}

function stub(sessions: SessionRow[] = [SESSION]): StaffScheduleClient {
  return { listSessions: vi.fn(async () => sessions) }
}

function renderPicker(props: Record<string, unknown> = {}) {
  const onSelect = vi.fn()
  const client = stub()
  render(
    <DatePickerScreen
      locale="he"
      client={client}
      today="2026-11-03T12:00:00Z"
      onSelect={onSelect}
      {...props}
    />,
  )
  return { onSelect, client }
}

describe('monthGrid', () => {
  it('starts every week on Sunday and pads the first row', () => {
    // 1 November 2026 is a Sunday, so November needs no leading pad; December 2026 starts
    // on a Tuesday and needs two.
    const november = monthGrid(2026, 11)
    expect(november[0]).toBe('2026-11-01')

    const december = monthGrid(2026, 12)
    expect(december.slice(0, 2)).toEqual(['', ''])
    expect(december[2]).toBe('2026-12-01')
  })

  it('covers every day of the month', () => {
    const november = monthGrid(2026, 11).filter(Boolean)
    expect(november).toHaveLength(30)
    expect(november.at(-1)).toBe('2026-11-30')
  })

  it('is a whole number of weeks, so the grid never has a ragged last row', () => {
    for (const month of [1, 2, 6, 11, 12]) {
      expect(monthGrid(2026, month).length % 7).toBe(0)
    }
  })
})

describe('DatePickerScreen (9b)', () => {
  it('renders a full month grid', async () => {
    renderPicker()
    const grid = screen.getByRole('grid', { name: t('he', 'schedule.view.month') })
    await waitFor(() => expect(within(grid).getAllByRole('button')).toHaveLength(30))
  })

  it('marks the days that have sessions', async () => {
    renderPicker()
    await waitFor(() =>
      expect(screen.getByTestId('day-2026-11-17')).toHaveAttribute('data-has-sessions', 'true'),
    )
    expect(screen.getByTestId('day-2026-11-16')).toHaveAttribute('data-has-sessions', 'false')
  })

  it('gives every day button a name carrying the whole date', async () => {
    // A screen reader hearing "17" cannot tell which month.
    renderPicker()
    const cell = await screen.findByTestId('day-2026-11-17')
    expect(cell).toHaveAccessibleName(expect.stringContaining('2026') as unknown as string)
  })

  it('marks the selected day with aria-current', async () => {
    renderPicker()
    await userEvent.click(await screen.findByTestId('day-2026-11-17'))
    expect(screen.getByTestId('day-2026-11-17')).toHaveAttribute('aria-current', 'date')
  })

  it('reports a single chosen day', async () => {
    const { onSelect } = renderPicker()
    await userEvent.click(await screen.findByTestId('day-2026-11-17'))
    expect(onSelect).toHaveBeenCalledWith({ from: '2026-11-17', to: '2026-11-17' })
  })

  it('jumps to today', async () => {
    renderPicker()
    await userEvent.click(screen.getByTestId('month-next'))
    await waitFor(() => expect(screen.getByTestId('month-label')).toHaveTextContent('12'))
    await userEvent.click(screen.getByTestId('jump-to-today'))
    await waitFor(() => expect(screen.getByTestId('day-2026-11-03')).toBeInTheDocument())
  })

  it('moves month by month, and refetches the month it lands on', async () => {
    const { client } = renderPicker()
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled())
    await userEvent.click(screen.getByTestId('month-next'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-12-01', to: '2026-12-31' }),
      ),
    )
  })

  it('reports a range through the shared picker', async () => {
    const { onSelect } = renderPicker()
    await userEvent.type(screen.getByLabelText(t('he', 'schedule.datePicker.from')), '2026-11-10')
    await userEvent.type(screen.getByLabelText(t('he', 'schedule.datePicker.to')), '2026-11-20')
    await userEvent.click(screen.getByTestId('apply-range'))
    expect(onSelect).toHaveBeenCalledWith({ from: '2026-11-10', to: '2026-11-20' })
  })

  it('refuses a range whose end precedes its start, and reports nothing', async () => {
    const { onSelect } = renderPicker()
    await userEvent.type(screen.getByLabelText(t('he', 'schedule.datePicker.from')), '2026-11-20')
    await userEvent.type(screen.getByLabelText(t('he', 'schedule.datePicker.to')), '2026-11-10')
    await userEvent.click(screen.getByTestId('apply-range'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clear resets the range', async () => {
    renderPicker()
    const from = screen.getByLabelText(t('he', 'schedule.datePicker.from'))
    await userEvent.type(from, '2026-11-10')
    await userEvent.click(screen.getByTestId('clear-range'))
    expect(from).toHaveValue('')
  })

  it('gives every control an accessible name', async () => {
    renderPicker()
    await screen.findByTestId('day-2026-11-17')
    for (const control of screen.getAllByRole('button')) {
      expect(control).toHaveAccessibleName()
    }
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <DatePickerScreen
        locale={locale}
        client={stub()}
        today="2026-11-03T12:00:00Z"
        onSelect={vi.fn()}
      />,
    )
    await screen.findByTestId('day-2026-11-17')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
