import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, renderIn } from '../testing'
import { AttendanceStrip } from './AttendanceStrip'
import type { AttendanceStripItem } from './AttendanceStrip'

const ITEMS: AttendanceStripItem[] = [
  { id: '1', state: 'present', label: '03.08 · נוכח' },
  { id: '2', state: 'present', label: '06.08 · נוכח' },
  { id: '3', state: 'absent', label: '10.08 · נעדר' },
  { id: '4', state: 'present', label: '13.08 · נוכח' },
  { id: '5', state: 'notified', label: '17.08 · הודיעו מראש' },
  { id: '6', state: 'present', label: '20.08 · נוכח' },
  { id: '7', state: 'present', label: '24.08 · נוכח' },
  { id: '8', state: 'unmarked', label: '27.08 · לא סומן' },
]

describe.each(DIRECTIONS)('AttendanceStrip in $locale ($dir)', ({ locale }) => {
  it('renders one mark per session and does not mirror the marks row', () => {
    renderIn(<AttendanceStrip items={ITEMS} locale={locale} />, { locale })
    const strip = screen.getByTestId('attendance-strip')
    expect(within(strip).getAllByRole('img')).toHaveLength(8)
    // 2c: the marks must not mirror — time flows one way in both directions.
    expect(strip.querySelector('.studio-attendance-strip__marks')).toHaveAttribute('dir', 'ltr')
  })
})

describe('AttendanceStrip', () => {
  it('derives the legend counts from the items', () => {
    renderIn(<AttendanceStrip items={ITEMS} locale="he" />)
    const legend = screen.getByTestId('attendance-strip-legend')
    expect(within(legend).getByText('נוכח 5')).toBeVisible()
    expect(within(legend).getByText('נעדר 1')).toBeVisible()
    expect(within(legend).getByText('הודיעו מראש 1')).toBeVisible()
    expect(within(legend).getByText('לא סומן 1')).toBeVisible()
  })

  it('omits zero-count states and can hide the legend entirely', () => {
    renderIn(
      <AttendanceStrip
        items={[{ id: '1', state: 'present', label: 'x' }]}
        locale="he"
      />,
    )
    const legend = screen.getByTestId('attendance-strip-legend')
    expect(within(legend).queryByText(/נעדר/)).toBeNull()

    renderIn(<AttendanceStrip items={ITEMS} locale="he" showLegend={false} />)
    expect(screen.getAllByTestId('attendance-strip')[1]!.querySelector('ul')).toBeNull()
  })
})
